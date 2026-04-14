// ── State ───────────────────────────────────────────────────
let _supabase = null;
let _session = null;
let _isLoginMode = true;

let selectedFiles = [];
let selectedProjectionFiles = [];
let _currentJobId = null; // Renamed from currentJobId for consistency
let historyAnalyses = [];

const SUPABASE_URL = 'https://hattlirxjifrbmmwwytj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhdHRsaXJ4amlmcmJtbXd3eXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNzMwODUsImV4cCI6MjA4ODY0OTA4NX0.5OLqyQ7XDGJ2zwC-jWUJblzRd1LRVLi-Mgaavxw0GDc';

// ── State Persistence Helpers ───────────────────────────────
function saveAppState(view, jobId = null) {
    localStorage.setItem('fina_view', view);
    if (jobId) localStorage.setItem('fina_job_id', jobId);
}

function clearAppState() {
    localStorage.removeItem('fina_view');
    localStorage.removeItem('fina_job_id');
}

// ── DOM Elements ────────────────────────────────────────────
// Auth
const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const authError = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleText = document.getElementById('authToggleText');
const authToggleBtn = document.getElementById('authToggleBtn');

// Wizard
const wizardSection = document.getElementById('wizardSection');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const fileList = document.getElementById('fileList');
const toStep2Btn = document.getElementById('toStep2Btn');

// Progress & Results
const progressSection = document.getElementById('progressSection');
const resultsSection = document.getElementById('resultsSection');
const historyList = document.getElementById('historyList');

// ── Initialization ──────────────────────────────────────────
window.onload = async () => {
    // Init Theme — CSS handles all visual state via data-theme attribute
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Init Supabase
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Check existing session
    const { data } = await _supabase.auth.getSession();
    if (data.session) {
        handleSessionChange(data.session);
    } else {
        showAuthScreen();
    }

    // Listen to auth changes
    _supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            handleSessionChange(session);
        } else if (event === 'TOKEN_REFRESHED') {
            _session = session;
        } else if (event === 'SIGNED_OUT') {
            handleSessionChange(null);
            clearAppState();
        }
    });

    setupFileListeners();

    // 🔄 Rehydrate App State after Auth check
    setTimeout(() => {
        if (_session) rehydrateState();
    }, 500);
};

async function rehydrateState() {
    // Always refresh the In-Progress sidebar on load so interrupted jobs show up
    loadInProgressJobs();

    const savedView = localStorage.getItem('fina_view');
    const savedJobId = localStorage.getItem('fina_job_id');

    if (!savedView || !savedJobId) return;

    // Fetch the live job status before deciding which view to restore
    try {
        const res = await authFetch(`/api/result/${savedJobId}`);
        if (!res.ok) { clearAppState(); return; }
        const data = await res.json();
        const status = data.status;

        if (status === 'completed') {
            // Completed — restore results view directly
            _currentJobId = savedJobId;
            loadResults(savedJobId);
            return;
        }

        if (['failed', 'pending'].includes(status)) {
            // Nothing useful to restore; let the In-Progress pane handle it
            clearAppState();
            return;
        }

        // Job is mid-flight — delegate to resumeJob so steps replay correctly
        await resumeJob(savedJobId, status);
    } catch (e) {
        clearAppState();
    }
}

// ── Theme & Layout ──────────────────────────────────────────
window.toggleTheme = function() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    // All visual changes are CSS-driven via data-theme attribute
};

window.toggleHistory = function() {
    const sidebar = document.getElementById('mainSidebar');
    sidebar.classList.toggle('expanded');
    const icon = document.getElementById('collapseIcon');
    if (icon) icon.textContent = sidebar.classList.contains('expanded') ? '‹' : '›';
};

window.goHome = function() {
    wizardSection.style.display = 'block';
    progressSection.style.display = 'none';
    resultsSection.style.display = 'none';
    clearAppState();
};

function authFetch(url, options = {}) {
    if (!_session) return fetch(url, options);
    
    const headers = options.headers || {};
    headers['Authorization'] = `Bearer ${_session.access_token}`;
    options.headers = headers;
    return fetch(url, options);
}

// ── Auth Logic ──────────────────────────────────────────────
function showAuthScreen() {
    authScreen.style.display = 'flex';
    appShell.style.display = 'none';
}

function handleSessionChange(session) {
    const wasLoggedIn = !!_session;
    _session = session;
    if (session) {
        document.getElementById('userEmail').textContent = session.user.email;
        authScreen.style.display = 'none';
        appShell.style.display = 'flex';
        
        // Auto-expand sidebar to show History on login
        const sidebar = document.getElementById('mainSidebar');
        if (sidebar) sidebar.classList.add('expanded');

        // Only load fresh UI if explicitly logging in or initial load
        if (!wasLoggedIn) {
            loadHistory();
            loadInProgressJobs();
            newAnalysis();
        }
    } else {
        showAuthScreen();
    }
}

function toggleAuthMode() {
    _isLoginMode = !_isLoginMode;
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
    authError.style.display = 'none';
    
    if (_isLoginMode) {
        authSubmitBtn.textContent = 'Sign In';
        authToggleText.textContent = "Don't have an account?";
        authToggleBtn.textContent = "Sign Up";
    } else {
        authSubmitBtn.textContent = 'Create Account';
        authToggleText.textContent = "Already have an account?";
        authToggleBtn.textContent = "Sign In";
    }
}

async function handleAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!email || !password) {
        showAuthError("Please enter email and password.");
        return;
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Please wait...';
    authError.style.display = 'none';

    try {
        let res;
        if (_isLoginMode) {
            res = await _supabase.auth.signInWithPassword({ email, password });
        } else {
            res = await _supabase.auth.signUp({ email, password });
        }

        if (res.error) {
            showAuthError(res.error.message);
        } else if (!_isLoginMode && !res.data.session) {
            showAuthError("Please check your email to confirm your account.");
        }
    } catch (err) {
        showAuthError("A network error occurred.");
    }

    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = _isLoginMode ? 'Sign In' : 'Create Account';
}

function showAuthError(msg) {
    authError.textContent = msg;
    authError.style.display = 'block';
}

async function logout() {
    await _supabase.auth.signOut();
}

// ── Wizard Logic ────────────────────────────────────────────
function normalizeWordLimitedText(text, maxWords = 300) {
    const words = (text || '').trim().match(/\S+/g) || [];
    return words.slice(0, maxWords).join(' ');
}

function countWords(text) {
    return ((text || '').trim().match(/\S+/g) || []).length;
}

function syncCompanyContextInput() {
    const input = document.getElementById('companyContextInput');
    const counter = document.getElementById('companyContextWordCount');
    if (!input || !counter) return;

    const normalized = normalizeWordLimitedText(input.value, 300);
    if (normalized !== input.value.trim()) {
        input.value = normalized;
    }

    counter.textContent = `${countWords(input.value)} / 300 words`;
}

function goToStep(step) {
    // Validate Step 1 -> 2
    if (step === 2 && selectedFiles.length === 0) return;

    // Validate Step 2 -> 3
    if (step === 3) {
        const company = document.getElementById('companyNameInput').value.trim() || 'Auto-detecting...';
        const website = document.getElementById('companyWebsiteInput').value.trim() || 'Not provided';
        const companyContext = normalizeWordLimitedText(document.getElementById('companyContextInput').value.trim(), 300);
        document.getElementById('reviewCompany').textContent = company;
        document.getElementById('reviewFiles').textContent = selectedFiles.map(f => f.name).join(', ');
        document.getElementById('reviewWebsite').textContent = website;
        document.getElementById('reviewContext').textContent = companyContext || 'Not provided';
        
        const modules = Array.from(document.querySelectorAll('.option-card input:checked')).map(el => {
            return el.nextElementSibling.querySelector('.option-label').textContent;
        });
        document.getElementById('reviewModules').innerHTML = modules.length ? `<ul class="bullet-list">${modules.map(m => `<li>${m}</li>`).join('')}</ul>` : 'None selected';
        document.getElementById('reviewEmail').textContent = document.getElementById('emailInput').value || 'Not provided';
    }

    // Update UI
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`wizardStep${step}`).classList.add('active');

    document.querySelectorAll('.wizard-step-indicator').forEach((el, index) => {
        el.classList.remove('active', 'passed');
        const s = index + 1;
        if (s === step) el.classList.add('active');
        if (s < step) el.classList.add('passed');
    });

    document.querySelectorAll('.wizard-step-line').forEach((el, index) => {
        if (index < step - 1) el.classList.add('active');
        else el.classList.remove('active');
    });
}

function newAnalysis() {
    clearAppState();
    selectedFiles = [];
    selectedProjectionFiles = [];
    _currentJobId = null;
    wizardSection.style.display = 'block';
    progressSection.style.display = 'none';
    resultsSection.style.display = 'none';
    
    document.getElementById('companyNameInput').value = '';
    document.getElementById('companyWebsiteInput').value = '';
    document.getElementById('companyContextInput').value = '';
    document.getElementById('emailInput').value = '';
    syncCompanyContextInput();
    renderFileList();
    goToStep(1);
    
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
}
window.showNewAnalysis = newAnalysis;

// ── File Handling ───────────────────────────────────────────
function setupFileListeners() {
    fileInput.addEventListener('change', (e) => addFiles(Array.from(e.target.files)));
    const projectionFileInput = document.getElementById('projectionFileInput');
    if (projectionFileInput) {
        projectionFileInput.addEventListener('change', (e) => addProjectionFiles(Array.from(e.target.files)));
    }
    const companyContextInput = document.getElementById('companyContextInput');
    if (companyContextInput) {
        companyContextInput.addEventListener('input', syncCompanyContextInput);
        syncCompanyContextInput();
    }

    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        addFiles(Array.from(e.dataTransfer.files));
    });
}

function addFiles(files) {
    files.forEach(f => {
        if (f.type === 'application/pdf' && !selectedFiles.find(sf => sf.name === f.name)) {
            selectedFiles.push(f);
        }
    });
    renderFileList();
}

function addProjectionFiles(files) {
    files.forEach(f => {
        if (!selectedProjectionFiles.find(sf => sf.name === f.name)) {
            selectedProjectionFiles.push(f);
        }
    });
    renderProjectionFileList();
}

function removeProjectionFile(index) {
    selectedProjectionFiles.splice(index, 1);
    renderProjectionFileList();
}
window.removeProjectionFile = removeProjectionFile;

function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
}
window.removeFile = removeFile;

function renderFileList() {
    if (selectedFiles.length === 0) {
        fileList.style.display = 'none';
        toStep2Btn.disabled = true;
        return;
    }
    fileList.style.display = 'block';
    toStep2Btn.disabled = false;
    fileList.innerHTML = selectedFiles.map((f, i) => `
        <div class="file-item">
            <span class="file-icon">📄</span>
            <span class="file-name">${f.name}</span>
            <span class="file-size">${(f.size / 1024).toFixed(0)} KB</span>
            <button class="file-remove" onclick="removeFile(${i})">✕</button>
        </div>
    `).join('');
}

function renderProjectionFileList() {
    const projectionFileList = document.getElementById('projectionFileList');
    if (!projectionFileList) return;
    if (selectedProjectionFiles.length === 0) {
        projectionFileList.style.display = 'none';
        return;
    }
    projectionFileList.style.display = 'block';
    projectionFileList.innerHTML = selectedProjectionFiles.map((f, i) => `
        <div class="file-item">
            <span class="file-icon">📈</span>
            <span class="file-name">${f.name}</span>
            <span class="file-size">${(f.size / 1024).toFixed(0)} KB</span>
            <button class="file-remove" onclick="removeProjectionFile(${i})">✕</button>
        </div>
    `).join('');
}

// ── Run Analysis ────────────────────────────────────────────
async function startAnalysis() {
    if (selectedFiles.length === 0) return;

    const formData = new FormData();
    selectedFiles.forEach(f => formData.append('pdfs', f));
    
    const company = document.getElementById('companyNameInput').value.trim();
    if (company) formData.append('company', company);

    const companyWebsite = document.getElementById('companyWebsiteInput').value.trim();
    if (companyWebsite) formData.append('company_website', companyWebsite);

    const companyContext = normalizeWordLimitedText(document.getElementById('companyContextInput').value.trim(), 300);
    if (companyContext) formData.append('company_context', companyContext);
    
    const email = document.getElementById('emailInput').value.trim();
    if (email) formData.append('email', email);

    const btn = document.getElementById('launchBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Uploading...';

    try {
        const res = await authFetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Upload failed', 'error');
            btn.disabled = false;
            btn.innerHTML = '🚀 Start Analysis';
            return;
        }

        _currentJobId = data.job_id;
        saveAppState('progress', _currentJobId);
        wizardSection.style.display = 'none';
        showProgressSection();
        listenToProgress(_currentJobId);
        loadInProgressJobs(); // show new job in in-progress pane
    } catch (err) {
        showToast('Network error. Please try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = '🚀 Start Analysis';
    }
}
window.startAnalysis = startAnalysis;

// ── Progress Tracking ───────────────────────────────────────
const STEP_CONFIG = {
    parse: { label: 'Parsing Financial Statements', icon: '📄' },
    categorize: { label: 'Document Categorisation', icon: '🗂️' },
    extract: { label: 'Extracting Financial Figures', icon: '🔢' },
    projection: { label: 'Upload Company Projections', icon: '📈' },
    validate: { label: 'Analyst Verification', icon: '🔍' },
    web: { label: 'Web Research', icon: '🌐' },
    background: { label: 'Company Background Analysis', icon: '🏢' },
    competitors: { label: 'Competitor Analysis', icon: '⚔️' },
    ratios: { label: 'Calculating Financial Ratios', icon: '📊' },
    projection_analysis: { label: 'Reviewing Management Projections', icon: '📈' },
    financial: { label: 'Deep Financial Analysis', icon: '📈' },
    risks: { label: 'Risk Assessment', icon: '⚠️' },
    recommendation: { label: 'Investment Recommendation', icon: '💡' },
    report: { label: 'Generating Report', icon: '📝' },
    save: { label: 'Saving to your Profile', icon: '💾' },
};

function showProgressSection() {
    progressSection.style.display = 'block';

    const restartBtn = document.getElementById('restartJobBtn');
    if (restartBtn) restartBtn.style.display = 'block';

    const stepsEl = document.getElementById('progressSteps');
    stepsEl.innerHTML = Object.entries(STEP_CONFIG).map(([key, cfg]) => `
        <div class="progress-step step-clickable" id="step-${key}" onclick="openStepDetail('${key}')" title="Click to inspect this step">
            <div class="step-indicator pending" id="indicator-${key}">
                <span>${cfg.icon}</span>
            </div>
            <div class="step-text">
                <div class="step-label">${cfg.label}</div>
                <div class="step-detail" id="detail-${key}">Waiting...</div>
            </div>
            <div class="step-inspect-hint">›</div>
        </div>
    `).join('');
}

function listenToProgress(jobId, _retryCount = 0) {
    // Pass JWT via query param for SSE (since EventSource doesn't support headers easily without polyfills)
    // Actually Flask app currently doesn't check auth for progress streaming so it's fine.
    const es = new EventSource(`/api/progress/${jobId}`);
    
    es.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.step === 'awaiting_projection') {
            es.close();
            setTimeout(() => showProjectionUploadView(jobId), 500);
            return;
        }
        
        if (data.step === 'waiting_for_user') {
            es.close();
            setTimeout(() => showValidationSplitView(jobId), 500);
            return;
        }
        
        if (data.step === 'done') {
            es.close();
            if (data.status === 'completed') {
                setTimeout(() => loadResults(jobId), 500);
            } else {
                showToast('Analysis failed.', 'error');
            }
            return;
        }
        if (data.step === 'error') {
            es.close();
            showToast(data.message, 'error');
            return;
        }
        updateStep(data.step, data.message, data.done);
    };

    es.onerror = () => {
        es.close();

        // ALWAYS check the real job status first — the SSE may have closed
        // intentionally (awaiting_projection / waiting_for_user) and NOT
        // because of a network error. Re-opening SSE in those states causes
        // an infinite retry loop and prevents the projection/validation UI
        // from ever rendering.
        setTimeout(async () => {
            try {
                const res = await authFetch(`/api/result/${jobId}`);
                const data = await res.json();
                const status = data.status;

                if (status === 'awaiting_projection') {
                    showProjectionUploadView(jobId);
                } else if (status === 'waiting_for_user') {
                    showValidationSplitView(jobId);
                } else if (status === 'completed') {
                    loadResults(jobId);
                } else if (status === 'failed') {
                    showToast(data.error || 'Analysis failed.', 'error');
                } else {
                    // Job is still running — reconnect SSE (with retry guard)
                    const nextRetry = _retryCount + 1;
                    if (nextRetry >= 3) {
                        console.warn('SSE failed 3 times, falling back to polling...');
                        pollProgress(jobId);
                    } else {
                        listenToProgress(jobId, nextRetry);
                    }
                }
            } catch(e) {
                // Network error fetching status — retry SSE conservatively
                const nextRetry = _retryCount + 1;
                if (nextRetry >= 3) {
                    pollProgress(jobId);
                } else {
                    setTimeout(() => listenToProgress(jobId, nextRetry), 3000);
                }
            }
        }, 1500); // short delay to let server settle before checking status
    };
}

// Polling fallback for environments where SSE doesn't work (e.g. Render free tier)
function pollProgress(jobId) {
    const interval = setInterval(async () => {
        try {
            const res = await authFetch(`/api/result/${jobId}`);
            const data = await res.json();
            
            // Update progress steps from the job data
            if (data.progress) {
                data.progress.forEach(p => {
                    if (p.step && p.step !== 'error') updateStep(p.step, p.message, p.done);
                });
            }
            
            if (data.status === 'waiting_for_user') {
                clearInterval(interval);
                showValidationSplitView(jobId);
            } else if (data.status === 'awaiting_projection') {
                clearInterval(interval);
                showProjectionUploadView(jobId);
            } else if (data.status === 'completed') {
                clearInterval(interval);
                loadResults(jobId);
            } else if (data.status === 'failed') {
                clearInterval(interval);
                showToast(data.error || 'Analysis failed.', 'error');
            }
        } catch(e) {
            console.warn('Poll failed, retrying...', e);
        }
    }, 3000); // Poll every 3 seconds
}

function updateStep(step, message, done) {
    const stepEl = document.getElementById(`step-${step}`);
    const indicatorEl = document.getElementById(`indicator-${step}`);
    const detailEl = document.getElementById(`detail-${step}`);
    
    if (!stepEl) return;

    if (done) {
        stepEl.classList.remove('active'); stepEl.classList.add('done');
        indicatorEl.className = 'step-indicator done'; indicatorEl.innerHTML = '✓';
    } else {
        stepEl.classList.add('active');
        indicatorEl.className = 'step-indicator active'; indicatorEl.innerHTML = '<div class="spinner"></div>';
    }
    if (detailEl) detailEl.textContent = message;
}

// ── Results Rendering ───────────────────────────────────────
async function loadResults(jobId) {
    try {
        const res = await authFetch(`/api/result/${jobId}`);
        const data = await res.json();
        
        if (data.status !== 'completed' || !data.result) {
            showToast('Analysis not ready yet.', 'error');
            return;
        }
        wizardSection.style.display = 'none';
        progressSection.style.display = 'none';
        resultsSection.style.display = 'block';
        
        saveAppState('results', jobId);
        renderResultsView(data.result, jobId);
        loadHistory();          // refresh completed analyses sidebar
        loadInProgressJobs();   // remove this job from in-progress pane
    } catch (err) {
        showToast('Failed to load results.', 'error');
    }
}

function renderResultsView(result, jobId, isHistorical = false) {
    const rec = result.recommendation || {};
    const bg = result.company_background || {};
    const fin = result.financial_analysis || {};
    const risk = result.risk_analysis || {};
    const ratios = result.computed_ratios || {};
    
    const verdict = (rec.recommendation || 'N/A').toUpperCase();
    const verdictClass = verdict === 'BUY' ? 'buy' : verdict === 'HOLD' ? 'hold' : (verdict === 'SELL' || verdict === 'AVOID') ? 'avoid' : '';

    let html = `
    <div class="results-header">
        <h2>📊 ${result.company_name || 'Financial Analysis'}</h2>
        <div class="results-actions">
            <button class="btn btn-primary" onclick="downloadReport('${isHistorical ? jobId : jobId}', ${isHistorical})">📥 Download DOCX</button>
            ${!isHistorical ? `<button class="btn btn-accent" onclick="saveReport('${jobId}')" id="saveReportBtn">💾 Save to History</button>` : ''}
            <button class="btn btn-secondary" onclick="openEmailModal('${jobId}', ${isHistorical})">📧 Email Report</button>
            <button class="btn btn-ghost" onclick="newAnalysis()" style="border:1px solid var(--border)">✨ New Analysis</button>
        </div>
    </div>

    <!-- Verdict -->
    <div class="verdict-card ${verdictClass}">
        <div class="verdict-label">Investment Recommendation</div>
        <div class="verdict-value ${verdictClass}">${verdict}</div>
        <div class="summary-text" style="max-width:600px;margin:0 auto">${rec.summary || ''}</div>
        <div class="verdict-meta">
            <div class="v-meta-item">
                <div class="label">Confidence</div>
                <div class="value">${rec.confidence_level || 'N/A'}</div>
            </div>
            <div class="v-meta-item">
                <div class="label">Horizon</div>
                <div class="value">${rec.target_horizon || 'N/A'}</div>
            </div>
            <div class="v-meta-item">
                <div class="label">Suitable For</div>
                <div class="value">${rec.suitable_for || 'N/A'}</div>
            </div>
        </div>
    </div>`;

    // Executive Summary
    html += `
    <div class="section-card">
        <h3><span class="icon">📋</span> Executive Summary</h3>
        <p class="summary-text">${fin.executive_summary || 'N/A'}</p>
        ${fin.key_highlights ? `
        <ul class="bullet-list" style="margin-top:14px">
            ${fin.key_highlights.map(h => `<li>${h}</li>`).join('')}
        </ul>` : ''}
    </div>`;

    // Background
    html += `
    <div class="section-card">
        <h3><span class="icon">🏢</span> Company Background</h3>
        <div class="info-grid">
            <div class="info-item"><div class="label">Industry</div><div class="value">${bg.industry || 'N/A'}</div></div>
            <div class="info-item"><div class="label">Sub-Industry</div><div class="value">${bg.sub_industry || 'N/A'}</div></div>
            <div class="info-item"><div class="label">Headquarters</div><div class="value">${bg.headquarters || 'N/A'}</div></div>
            <div class="info-item"><div class="label">Business Model</div><div class="value">${bg.business_model || 'N/A'}</div></div>
        </div>
        ${bg.company_description ? `<p class="summary-text" style="margin-top:16px">${bg.company_description}</p>` : ''}
    </div>`;

    // Ratios
    html += `
    <div class="section-card">
        <h3><span class="icon">📊</span> Financial Ratios</h3>
        ${renderRatioTables(ratios)}
    </div>`;

    // Projection Analysis (only shown if projections were uploaded and analysed)
    const proj = result.projection_analysis || {};
    if (proj.review_table && proj.review_table.length) {
        const credibilityColor = {
            'Optimistic': 'badge-red',
            'Realistic':  'badge-green',
            'Conservative': 'badge-blue',
            'Mixed': 'badge-orange',
        };
        html += `
    <div class="section-card">
        <h3><span class="icon">📈</span> Management Projection Review</h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
            <span class="badge ${credibilityColor[proj.overall_credibility] || 'badge-orange'}">
                Overall: ${proj.overall_credibility || 'N/A'}
            </span>
            ${proj.projection_period ? `<span style="font-size:12px;color:var(--text-muted)">Period: ${proj.projection_period}</span>` : ''}
        </div>
        ${proj.overall_credibility_summary ? `<p class="summary-text" style="margin-bottom:16px">${proj.overall_credibility_summary}</p>` : ''}

        <!-- Assumptions -->
        ${proj.management_assumptions && proj.management_assumptions.length ? `
        <h4 style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">Management Assumptions</h4>
        <ul class="bullet-list" style="margin-bottom:20px">
            ${proj.management_assumptions.map(a => `<li>${a}</li>`).join('')}
        </ul>` : ''}

        <!-- Review Table -->
        <h4 style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">Projection Review</h4>
        <div class="excel-table-container" style="margin-bottom:24px">
            <table class="excel-table">
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Management Projection</th>
                        <th>Historical Baseline</th>
                        <th>Credibility</th>
                        <th>Rationale</th>
                    </tr>
                </thead>
                <tbody>
                    ${proj.review_table.map(row => {
                        const cClass = row.credibility === 'Realistic' ? 'status-pass' : row.credibility === 'Optimistic' ? 'status-fail' : 'status-caution';
                        const flagIcon = row.risk_flag ? ' ⚠️' : '';
                        return `<tr>
                            <td style="font-weight:600">${row.metric}${flagIcon}</td>
                            <td>${row.management_projection || '—'}</td>
                            <td style="color:var(--text-muted)">${row.historical_baseline || '—'}</td>
                            <td class="${cClass}">${row.credibility || '—'}</td>
                            <td style="font-size:12px;color:var(--text-secondary)">${row.credibility_reason || '—'}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>

        <!-- Key Concerns -->
        ${proj.key_concerns && proj.key_concerns.length ? `
        <h4 style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">Key Concerns</h4>
        <ul class="bullet-list" style="margin-bottom:20px">
            ${proj.key_concerns.map(c => `<li style="color:var(--danger)">${c}</li>`).join('')}
        </ul>` : ''}

        <!-- AI Counter-Projection -->
        ${proj.ai_counter_projection ? (() => {
            const cp = proj.ai_counter_projection;
            return `
        <div style="border-top:1px solid var(--border);padding-top:20px;margin-top:4px">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:6px">🤖 AI Counter-Projection</h4>
            ${cp.methodology ? `<p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">${cp.methodology}</p>` : ''}
            ${cp.projections && cp.projections.length ? `
            <div class="excel-table-container" style="margin-bottom:16px">
                <table class="excel-table">
                    <thead>
                        <tr>
                            <th>Metric</th>
                            ${cp.projections[0].year_by_year ? cp.projections[0].year_by_year.map(y => `<th>${y.year}</th>`).join('') : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${cp.projections.map(p => `
                        <tr>
                            <td style="font-weight:600">${p.metric}</td>
                            ${(p.year_by_year || []).map(y => `<td title="${y.reasoning || ''}">${y.value || '—'}</td>`).join('')}
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : ''}
            ${cp.summary ? `<p class="summary-text">${cp.summary}</p>` : ''}
        </div>`;
        })() : ''}
    </div>`;
    }

    // Risk Factors
    html += `
    <div class="section-card">
        <h3><span class="icon">⚠️</span> Risk Factors</h3>
        <div style="margin-bottom:16px">
            <span class="badge ${risk.overall_risk_rating === 'High' ? 'badge-red' : risk.overall_risk_rating === 'Medium' ? 'badge-orange' : 'badge-green'}">
                Overall Risk: ${risk.overall_risk_rating || 'N/A'}
            </span>
        </div>
        ${risk.risk_summary ? `<p class="summary-text" style="margin-bottom:16px">${risk.risk_summary}</p>` : ''}
        ${renderRiskItems(risk.risk_factors)}
    </div>`;

    resultsSection.innerHTML = html;
}

function renderRatioTables(ratios) {
    if (!ratios || Object.keys(ratios).length === 0) return '<p class="summary-text">No ratios calculated.</p>';
    const looksLikeRatioLeaf = (value) => {
        return value && typeof value === 'object' && (
            Object.prototype.hasOwnProperty.call(value, 'formatted') ||
            Object.prototype.hasOwnProperty.call(value, 'benchmark') ||
            Object.prototype.hasOwnProperty.call(value, 'status')
        );
    };

    const renderCategoryTable = (category, items) => {
        if (!items || typeof items !== 'object') return '';

        let html = `<h4 style="margin:16px 0 8px;font-size:14px;color:var(--accent)">${category}</h4>`;
        html += '<div class="excel-table-container"><table class="excel-table"><thead><tr><th>Ratio</th><th>Value</th><th>Benchmark</th><th>Status</th></tr></thead><tbody>';

        for (const [name, data] of Object.entries(items)) {
            if (!looksLikeRatioLeaf(data)) continue;

            const statusClass = data.status?.includes('PASS')
                ? 'status-pass'
                : data.status?.includes('FAIL')
                    ? 'status-fail'
                    : 'status-caution';

            html += `<tr>
                <td>${name}</td>
                <td style="font-weight:600">${data.formatted || '—'}</td>
                <td style="color:var(--text-muted)">${data.benchmark || '—'}</td>
                <td class="${statusClass}">${data.status || '—'}</td>
            </tr>`;
        }

        html += '</tbody></table></div>';
        return html;
    };

    const firstValue = Object.values(ratios)[0];
    const isMultiYearRatios = firstValue && typeof firstValue === 'object' && !looksLikeRatioLeaf(firstValue);

    let html = '';

    if (isMultiYearRatios) {
        for (const [year, categories] of Object.entries(ratios)) {
            html += `<h3 style="margin:20px 0 10px;font-size:18px;color:var(--accent)">${year}</h3>`;
            for (const [category, items] of Object.entries(categories || {})) {
                html += renderCategoryTable(category, items);
            }
        }
        return html;
    }

    for (const [category, items] of Object.entries(ratios)) {
        html += renderCategoryTable(category, items);
    }

    return html;
}

function renderRiskItems(risks) {
    if (!risks || risks.length === 0) return '<p class="summary-text">No risks identified.</p>';
    return risks.map(r => `
        <div class="risk-item ${(r.severity || '').toLowerCase()}">
            <div class="risk-header">
                <span class="badge ${r.severity === 'High' ? 'badge-red' : r.severity === 'Medium' ? 'badge-orange' : 'badge-green'}">${r.severity || 'N/A'}</span>
                <span class="risk-category">${r.category || ''}</span>
            </div>
            <div class="risk-desc">${r.description || ''}</div>
            ${r.mitigation ? `<div class="risk-mitigation">Mitigation: ${r.mitigation}</div>` : ''}
        </div>
    `).join('');
}

// ── Sidebar: In-Progress Jobs ───────────────────────────────

async function loadInProgressJobs() {
    try {
        const res = await authFetch('/api/my-jobs');
        const data = await res.json();
        renderInProgressList(data.jobs || []);
    } catch (e) {
        console.error("Failed to load in-progress jobs", e);
    }
}

function renderInProgressList(jobs) {
    const el = document.getElementById('inProgressList');
    const pane = document.getElementById('inProgressPane');
    if (!el || !pane) return;

    if (!jobs.length) {
        pane.style.display = 'none';
        return;
    }

    const STATUS_LABEL = {
        pending:             'Starting...',
        running:             'Analyzing...',
        awaiting_projection: 'Awaiting Projections',
        waiting_for_user:    'Awaiting Validation',
        resuming:            'Resuming...',
    };

    pane.style.display = 'flex';
    el.innerHTML = jobs.map(job => {
        const company = job.company_name
            || (Array.isArray(job.filenames) && job.filenames[0])
            || 'Unknown';
        const date = new Date(job.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric'
        });
        const label = STATUS_LABEL[job.status] || job.status;
        return `
        <div class="inprogress-item" id="inprogress-${job.job_id}">
            <div class="inprogress-info">
                <div class="inprogress-company" title="${company}">${company}</div>
                <div class="inprogress-meta">
                    <span class="inprogress-status">${label}</span>
                    <span class="inprogress-date">${date}</span>
                </div>
            </div>
            <div class="inprogress-actions">
                <button class="btn-resume" onclick="resumeJob('${job.job_id}', '${job.status}')">Resume &rarr;</button>
                <button class="btn-job-stop" title="Stop analysis" onclick="stopInProgressJob('${job.job_id}', this)">&#9632;</button>
                <button class="btn-job-delete" title="Delete" onclick="deleteInProgressJob('${job.job_id}', this)">&#x2715;</button>
            </div>
        </div>`;
    }).join('');
}

async function stopInProgressJob(jobId, btn) {
    btn.disabled = true;
    btn.textContent = '...';
    try {
        const res = await authFetch(`/api/jobs/${jobId}/stop`, { method: 'POST' });
        if (res.ok) {
            document.getElementById(`inprogress-${jobId}`)?.remove();
            loadInProgressJobs();
            showToast('Analysis stopped.', 'success');
        } else {
            showToast('Failed to stop analysis.', 'error');
            btn.disabled = false;
            btn.innerHTML = '&#9632;';
        }
    } catch (e) {
        showToast('Network error.', 'error');
        btn.disabled = false;
        btn.innerHTML = '&#9632;';
    }
}
window.stopInProgressJob = stopInProgressJob;

async function deleteInProgressJob(jobId, btn) {
    btn.disabled = true;
    btn.textContent = '...';
    try {
        const res = await authFetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
        if (res.ok) {
            document.getElementById(`inprogress-${jobId}`)?.remove();
            loadInProgressJobs();
            showToast('Analysis deleted.', 'success');
        } else {
            showToast('Failed to delete analysis.', 'error');
            btn.disabled = false;
            btn.innerHTML = '&#x2715;';
        }
    } catch (e) {
        showToast('Network error.', 'error');
        btn.disabled = false;
        btn.innerHTML = '&#x2715;';
    }
}
window.deleteInProgressJob = deleteInProgressJob;

async function resumeJob(jobId, status) {
    _currentJobId = jobId;
    saveAppState('progress', jobId);

    wizardSection.style.display = 'none';
    progressSection.style.display = 'block';
    resultsSection.style.display = 'none';

    showProgressSection();

    try {
        // Fetch current job state to replay already-completed steps
        const res = await authFetch(`/api/result/${jobId}`);
        const data = await res.json();

        // Replay all persisted progress events so steps show correct state
        (data.progress || []).forEach(p => {
            if (p.step && p.step !== 'error') updateStep(p.step, p.message, p.done);
        });

        // Route to the exact stage the job is waiting at
        const currentStatus = data.status || status;
        if (currentStatus === 'awaiting_projection') {
            showProjectionUploadView(jobId);
        } else if (currentStatus === 'waiting_for_user') {
            showValidationSplitView(jobId);
        } else if (currentStatus === 'completed') {
            loadResults(jobId);
        } else {
            // running / resuming / pending — connect to SSE stream
            listenToProgress(jobId);
        }
    } catch (e) {
        showToast('Failed to resume job. Please try again.', 'error');
    }
}
window.resumeJob = resumeJob;

// ── Sidebar History ─────────────────────────────────────────

async function loadHistory() {
    try {
        const res = await authFetch('/api/my-analyses');
        const data = await res.json();
        historyAnalyses = data.analyses || [];
        renderHistoryList(historyAnalyses);
    } catch (e) {
        console.error("Failed to load history", e);
    }
}

function filterHistory() {
    const term = document.getElementById('histSearch').value.toLowerCase();
    const filtered = historyAnalyses.filter(a => a.company_name.toLowerCase().includes(term));
    renderHistoryList(filtered);
}
window.filterHistory = filterHistory;

function renderHistoryList(items) {
    if (!items.length) {
        historyList.innerHTML = `<div class="sidebar-empty">No analyses found.</div>`;
        return;
    }

    historyList.innerHTML = items.map(item => {
        const date = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const v = (item.recommendation || '').toUpperCase();
        const vClass = v === 'BUY' ? 'buy' : v === 'HOLD' ? 'hold' : 'avoid';
        
        return `
        <div class="history-item" onclick="openHistoricalAnalysis('${item.id}', this)">
            <div class="history-item-top">
                <div class="history-company" title="${item.company_name}">${item.company_name}</div>
                <div class="history-date">${date}</div>
            </div>
            <div class="history-badges">
                <span class="h-badge ${vClass}">${v.length > 10 ? v.substring(0,8)+'...' : v}</span>
            </div>
        </div>`;
    }).join('');
}

async function openHistoricalAnalysis(id, el) {
    // highlight selected
    document.querySelectorAll('.history-item').forEach(e => e.classList.remove('active'));
    if (el) el.classList.add('active');

    try {
        const res = await authFetch(`/api/my-analyses/${id}`);
        const data = await res.json();
        if (res.ok && data.analysis) {
            wizardSection.style.display = 'none';
            progressSection.style.display = 'none';
            resultsSection.style.display = 'block';
            
            // Render historical result
            renderResultsView(data.analysis.analysis_data, id, true);
        } else {
            showToast("Failed to load analysis.", "error");
        }
    } catch (e) {
        showToast("Network error.", "error");
    }
}
window.openHistoricalAnalysis = openHistoricalAnalysis;

// ── Actions (Download / Email) ──────────────────────────────

async function downloadReport(id, isHistorical) {
    if (!isHistorical) {
        // Local job ID
        window.location.href = `/api/download/${id}`;
    } else {
        // Supabase past analysis ID -> get signed URL
        try {
            const res = await authFetch(`/api/report-url/${id}`);
            const data = await res.json();
            if (res.ok && data.url) {
                window.location.href = data.url;
            } else {
                showToast("Report file not found.", "error");
            }
        } catch (e) {
            showToast("Failed to get report.", "error");
        }
    }
}
window.downloadReport = downloadReport;

async function emailReport() {
    const email = document.getElementById('modalEmailInput').value.trim();
    if (!email) {
        showToast('Please enter an email.', 'error');
        return;
    }

    const btn = document.getElementById('sendEmailBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    // Currently backend expects local job_id for sending emails, 
    // not supabase analysis_id. We'll try the endpoint directly.
    try {
        const res = await authFetch(`/api/email/${window.currentReportJobId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();
        
        if (res.ok) {
            showToast(`Report sent to ${email}!`, 'success');
            closeEmailModal();
        } else {
            showToast(data.error || 'Failed to send email.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Send Report';
}
window.sendEmail = emailReport; // Note: using emailReport to not clash with global func if any

async function restartWorkflow() {
    const jobId = _currentJobId || _currentValidationJobId;
    if (!jobId) {
        showToast("No active job to restart.", "error");
        return;
    }
    
    if (!confirm("Force restart this workflow pipeline? This will push it back to the active queue and overwrite current downstream progress.")) return;

    try {
        const res = await authFetch(`/api/restart_job/${jobId}`, { method: 'POST' });
        const data = await res.json();
        
        if (res.ok) {
            showToast("Workflow re-injected into the queue!", "success");
            const vPane = document.getElementById('validationRightPane');
            if (vPane) vPane.style.display = 'none';
        } else {
            showToast(data.error || "Failed to restart.", "error");
        }
    } catch (err) {
        showToast("Network error trying to restart.", "error");
    }
}
window.restartWorkflow = restartWorkflow;

async function saveReport(jobId) {
    const btn = document.getElementById('saveReportBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
        const res = await authFetch(`/api/save/${jobId}`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            showToast('Analysis saved to your history!', 'success');
            if (btn) { btn.textContent = '✓ Saved'; }
            loadHistory();
            loadInProgressJobs();
        } else {
            showToast(data.error || 'Failed to save.', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '💾 Save to History'; }
        }
    } catch (err) {
        showToast('Network error.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save to History'; }
    }
}
window.saveReport = saveReport;

// Basic toast UI
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 4000);
}
window.showToast = showToast;

function openEmailModal(jobId, isHistorical) {
    document.getElementById('emailModal').classList.add('active');
    document.getElementById('modalEmailInput').focus();
    window.currentReportJobId = jobId;
    window.currentReportIsHistorical = isHistorical;
}
window.openEmailModal = openEmailModal;

function closeEmailModal() {
    document.getElementById('emailModal').classList.remove('active');
}
window.closeEmailModal = closeEmailModal;

async function sendEmail() {
    const email = document.getElementById('modalEmailInput').value.trim();
    if (!email) { showToast('Please enter an email address.', 'error'); return; }

    const btn = document.getElementById('sendEmailBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    // Currently backend expects local job_id for sending emails, 
    // not supabase analysis_id. We'll try the endpoint directly.
    try {
        const res = await authFetch(`/api/email/${window.currentReportJobId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();
        
        if (res.ok) {
            showToast(`Report sent to ${email}!`, 'success');
            closeEmailModal();
        } else {
            showToast(data.error || 'Failed to send email.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Send Report';
}
window.sendEmail = sendEmail;

// ── Validation UI & Math ────────────────────────────────────

let _currentValidationFinancials = null;
let _currentValidationJobId = null;
let _currentValidationSources = {};
let _currentValidationSourcePreviews = {};

function showProjectionUploadView(jobId) {
    _currentValidationJobId = jobId;
    saveAppState('projection', jobId);

    wizardSection.style.display = 'none';
    progressSection.style.display = 'block';
    resultsSection.style.display = 'none';

    const rightPane = document.getElementById('validationRightPane');
    const projectionPanel = document.getElementById('projectionUploadPanel');
    const validationPanel = document.getElementById('validationPanel');

    if (rightPane) rightPane.style.display = 'flex';
    if (projectionPanel) projectionPanel.style.display = 'block';
    if (validationPanel) validationPanel.style.display = 'none';
    renderProjectionFileList();
}

async function uploadProjectionFiles() {
    if (!_currentValidationJobId) {
        showToast('No active job found for projection upload.', 'error');
        return;
    }
    if (selectedProjectionFiles.length === 0) {
        showToast('Upload at least one projection file to continue.', 'error');
        return;
    }

    const btn = document.getElementById('uploadProjectionBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Uploading...';

    try {
        const formData = new FormData();
        selectedProjectionFiles.forEach(file => formData.append('projection_files', file));
        const res = await authFetch(`/api/upload_projection/${_currentValidationJobId}`, {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Projection upload failed.', 'error');
            return;
        }

        selectedProjectionFiles = [];
        renderProjectionFileList();
        showValidationSplitView(_currentValidationJobId);
    } catch (err) {
        showToast('Network error while uploading projection files.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Continue to Verification';
    }
}
window.uploadProjectionFiles = uploadProjectionFiles;

async function showValidationSplitView(jobId) {
    _currentValidationJobId = jobId;
    saveAppState('validation', jobId);
    
    // Ensure we are in the progress view
    wizardSection.style.display = 'none';
    progressSection.style.display = 'block';
    resultsSection.style.display = 'none';

    // Fetch intermediate result
    try {
        const res = await authFetch(`/api/result/${jobId}`);
        const data = await res.json();
        if (data.extracted_financials) {
            _currentValidationFinancials = data.extracted_financials;
            _currentValidationSources = data.extraction_sources || {};
            _currentValidationSourcePreviews = data.source_previews || {};
            const rightPane = document.getElementById('validationRightPane');
            const projectionPanel = document.getElementById('projectionUploadPanel');
            const validationPanel = document.getElementById('validationPanel');
            if (rightPane) rightPane.style.display = 'flex';
            if (projectionPanel) projectionPanel.style.display = 'none';
            if (validationPanel) validationPanel.style.display = 'flex';
            renderValidationTable();
        } else {
            showToast("Failed to load financial data for validation.", "error");
        }
    } catch(err) {
        showToast("Network error getting financials.", "error");
    }
}

function renderValidationTable() {
    const fin = _currentValidationFinancials;
    const years = fin.years_found || [];
    
    // Ordered categories
    const fields = [
        { label: "P&L", isHeader: true },
        "revenue", "other_income", "total_income", "cost_of_materials", "employee_expense", 
        "depreciation", "finance_cost", "other_expenses", "total_expenses", 
        "profit_before_tax", "tax_expense", "net_profit", "ebitda",
        { label: "Equity & Liabilities", isHeader: true },
        "share_capital", "reserves", "equity", "long_term_borrowings", "short_term_borrowings", 
        "total_debt", "trade_payables", "other_current_liabilities", "short_term_provisions", "current_liabilities_total",
        { label: "Assets", isHeader: true },
        "tangible_assets", "trade_receivables", "cash_and_equivalents", "inventories", 
        "short_term_loans_advances", "other_current_assets", "current_assets_total", "total_assets", "working_capital",
        { label: "Cash Flow", isHeader: true },
        "operating_cash_flow", "investing_cash_flow", "financing_cash_flow"
    ];

    let html = '<div class="excel-table-container" style="margin-bottom:0;"><table class="excel-table" style="width:100%; font-size: 13px;">';
    html += '<thead><tr><th>Field</th>';
    years.forEach(y => html += `<th>${y}</th>`);
    html += '<th>Status</th></tr></thead><tbody>';

    fields.forEach(f => {
        if (typeof f === 'object' && f.isHeader) {
            html += `<tr><td colspan="${years.length + 2}" style="background:var(--bg-secondary); font-weight:bold; color:var(--accent); text-transform:uppercase;">${f.label}</td></tr>`;
            return;
        }
        
        html += `<tr data-key="${f}">
            <td style="font-weight: 500">${f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>`;
        
        years.forEach(y => {
            const val = fin[y] ? fin[y][f] : null;
            const isNull = val === null || val === '';
            const valStr = isNull ? '' : val;
            const sourceInfo = ((_currentValidationSources || {})[y] || {})[f];
            const hasSource = !!sourceInfo;
            
            html += `<td>
                <div class="field-cell">
                    <input type="number" 
                        step="any"
                        data-year="${y}" 
                        data-field="${f}" 
                        value="${valStr}" 
                        placeholder="${isNull ? 'null' : '0'}"
                        style="width:100%; box-sizing:border-box; padding:6px 8px; font-size:13px; font-family:monospace; border-radius:4px; color:var(--text-primary); outline:none; border:1px solid ${isNull ? 'var(--warning, #f59e0b)' : 'var(--border)'}; background:${isNull ? 'rgba(245,158,11,0.15)' : 'var(--bg-secondary)'}"
                        onchange="handleFinancialEdit('${y}', '${f}', this)"
                    />
                    ${hasSource ? `<button class="source-btn" type="button" onclick="openSourceModal('${y}', '${f}')">View Source</button>` : ''}
                </div>
            </td>`;
        });
        
        html += `<td class="status-cell" id="status_${f}" style="font-size:16px; text-align:center;"></td></tr>`;
    });

    html += '</tbody></table></div>';
    document.getElementById('validationTableContainer').innerHTML = html;
    
    // Initial validation
    runValidationChecks();
}

function handleFinancialEdit(year, field, inputEl) {
    const val = inputEl.value === '' ? null : parseFloat(inputEl.value);
    
    // Flash blue animation to show activity
    inputEl.style.transition = 'none';
    inputEl.style.backgroundColor = 'rgba(56, 189, 248, 0.3)'; // sky-400
    setTimeout(() => {
        inputEl.style.transition = 'background-color 0.8s ease';
        inputEl.style.backgroundColor = (val === null) ? 'rgba(245,158,11,0.15)' : 'var(--bg-secondary)';
        inputEl.style.borderColor = (val === null) ? 'var(--warning, #f59e0b)' : 'var(--border)';
    }, 50);

    if (!_currentValidationFinancials[year]) _currentValidationFinancials[year] = {};
    _currentValidationFinancials[year][field] = val;
    
    // Auto-compute basic identities if they are missing or user triggered
    autoComputeIdentities(year);
    
    runValidationChecks();
}

function autoComputeIdentities(year) {
    const data = _currentValidationFinancials[year];
    const update = (f, val) => {
        if (data[f] !== val) {
            data[f] = val;
            const el = document.querySelector(`input[data-year="${year}"][data-field="${f}"]`);
            if (el && parseFloat(el.value) !== val) {
                el.value = val;
                el.style.transition = 'none';
                el.style.backgroundColor = 'rgba(167, 139, 250, 0.3)'; // purple flash for derived
                setTimeout(() => {
                    el.style.transition = 'background-color 1s ease';
                    el.style.backgroundColor = 'var(--bg-secondary)';
                }, 50);
            }
        }
    };

    const g = (k) => parseFloat(data[k]) || 0;

    // Equity = share_capital + reserves
    if (data.share_capital != null && data.reserves != null) {
        update('equity', g('share_capital') + g('reserves'));
    }
    // Total Debt
    if (data.long_term_borrowings != null || data.short_term_borrowings != null) {
        update('total_debt', g('long_term_borrowings') + g('short_term_borrowings'));
    }
    // Total Income
    if (data.revenue != null || data.other_income != null) {
        update('total_income', g('revenue') + g('other_income'));
    }
    // Net profit approx = profit_before_tax - tax_expense
    if (data.profit_before_tax != null && data.tax_expense != null) {
        update('net_profit', g('profit_before_tax') - g('tax_expense'));
    }
}

function runValidationChecks() {
    const fin = _currentValidationFinancials;
    const years = fin.years_found || [];
    let hasError = false;
    
    const fields = Array.from(document.querySelectorAll('tr[data-key]')).map(tr => tr.dataset.key);
    
    fields.forEach(f => {
        const tr = document.querySelector(`tr[data-key="${f}"]`);
        const stCell = tr.querySelector('.status-cell');
        stCell.innerHTML = '';
        stCell.title = '';
        tr.style.backgroundColor = '';

        let pErrors = [];
        let warnings = [];
        
        // Sort years descending so [0] is latest, [1] is prev
        const sortedYears = [...years].sort().reverse();
        
        sortedYears.forEach((y, yearIndex) => {
            const data = fin[y] || {};
            const g = (k) => parseFloat(data[k]) || 0;
            const input = tr.querySelector(`input[data-year="${y}"]`);
            input.style.boxShadow = '';
            
            // Check specific math identities
            if (f === 'equity') {
                const calc = g('share_capital') + g('reserves');
                if (Math.abs(g('equity') - calc) > 1) pErrors.push(`Eq != Cap + Res in ${y}`);
            }
            if (f === 'total_debt') {
                const calc = g('long_term_borrowings') + g('short_term_borrowings');
                if (Math.abs(g('total_debt') - calc) > 1) pErrors.push(`Debt != LT+ST in ${y}`);
            }
            if (f === 'total_assets') {
                // Should at least be >= current assets
                if (g('total_assets') < g('current_assets_total')) pErrors.push(`TA < CA in ${y}`);
            }

            // Anomaly Check: YoY > 500% indicating potential scale mismatch
            if (yearIndex > 0) {
                const prevY = sortedYears[yearIndex - 1]; // next oldest year
                const prevData = fin[prevY] || {};
                const prevV = parseFloat(prevData[f]) || 0;
                const currV = g(f);
                if (prevV !== 0 && currV !== 0) {
                    const ratio = Math.abs(currV / prevV);
                    if (ratio > 5 || ratio < 0.2) {
                        warnings.push(`>500% YoY variance in ${y}`);
                        // Highlight orange if not already red
                        if (!pErrors.length) {
                            input.style.boxShadow = '0 0 0 1px var(--warning, #f59e0b)';
                            input.title = `High variation vs ${prevY}`;
                        }
                    }
                }
            }
        });

        if (pErrors.length > 0) {
            hasError = true;
            stCell.innerHTML = '⚠️';
            stCell.title = pErrors.join(' | ');
            tr.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'; // faint red row
            pErrors.forEach(err => {
                const year = err.match(/in (.*)/)[1];
                tr.querySelector(`input[data-year="${year}"]`).style.boxShadow = '0 0 0 1px var(--danger)';
            });
        } else if (warnings.length > 0) {
            stCell.innerHTML = '⚠️';
            stCell.style.color = 'var(--warning, #f59e0b)';
            stCell.title = warnings.join(' | ');
        }
    });

    const w = document.getElementById('validationWarning');
    if (hasError) {
        w.innerText = "Please resolve the highlighted discrepancies before continuing.";
        w.style.display = 'block';
    } else {
        w.style.display = 'none';
        w.innerText = "";
    }
}

async function approveAndContinue() {
    // Collect all data inputs to ensure no un-synced state
    const fin = _currentValidationFinancials;
    document.querySelectorAll('input[data-field]').forEach(inp => {
        const y = inp.dataset.year;
        const f = inp.dataset.field;
        fin[y][f] = inp.value === '' ? null : parseFloat(inp.value);
    });

    const btn = document.getElementById('approveFinancialsBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Processing...';

    // POST approval
    try {
        const res = await authFetch(`/api/approve_financials/${_currentValidationJobId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ financials: fin })
        });
        
        if (res.ok) {
            document.getElementById('validationRightPane').style.display = 'none';
            listenToProgress(_currentValidationJobId); // resume streaming
        } else {
            let errorText = "Failed to submit approval.";
            try {
                const data = await res.json();
                if (data.error) errorText = data.error;
            } catch (e) {
                errorText = await res.text() || errorText;
            }
            showToast(`Error: ${errorText}`, "error");
        }
    } catch(err) {
        showToast("Network error.", "error");
    }
    
    btn.disabled = false;
    btn.innerHTML = '✓ Approve & Continue';
}

async function openSourceModal(year, field) {
    const modal = document.getElementById('sourceModal');
    const meta = document.getElementById('sourceMetaText');
    const container = document.getElementById('sourceImageContainer');
    if (!modal || !meta || !container) return;

    modal.classList.add('active');
    meta.textContent = 'Loading source details...';
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px">
            <div class="spinner"></div>
            <p style="font-size:13px;color:var(--text-muted)">Generating page preview from PDF…</p>
        </div>`;


    try {
        const res = await authFetch(`/api/source-preview/${_currentValidationJobId}?year=${encodeURIComponent(year)}&field=${encodeURIComponent(field)}`);
        const data = await res.json();
        if (!res.ok) {
            meta.textContent = data.error || 'Source preview unavailable.';
            container.innerHTML = '';
            return;
        }

        const preview = data.preview || {};
        const source = data.source || {};
        meta.textContent = `${year} • ${field.replace(/_/g, ' ')} • ${preview.source_file || source.source_file || 'Unknown file'} • Page ${preview.page_number || source.page_number || 'N/A'}`;

        const imageSrc = data.image_data_url || data.image_url;
        if (imageSrc) {
            const excerpt = preview.excerpt || source.excerpt || '';
            container.innerHTML = `
                <div style="width:100%">
                    <img src="${imageSrc}" alt="Source preview for ${field}" style="width:100%;border-radius:6px;border:1px solid var(--border)">
                    ${excerpt ? `<p style="margin-top:12px;font-size:12px;color:var(--text-muted);background:var(--bg-tertiary);padding:8px 12px;border-radius:6px;font-family:monospace">${excerpt}</p>` : ''}
                </div>
            `;
        } else {
            // No image available — show excerpt in a styled box
            const excerpt = preview.excerpt || source.excerpt || '';
            container.innerHTML = excerpt
                ? `<div style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:8px;padding:16px 20px;font-family:monospace;font-size:13px;color:var(--text-primary);line-height:1.6">${excerpt}</div>
                   <p style="margin-top:10px;font-size:12px;color:var(--text-muted)">⚠️ PDF image preview unavailable — showing extracted text excerpt instead.</p>`
                : `<p style="color:var(--text-muted)">Source image and excerpt unavailable for this field.</p>`;
        }

    } catch (err) {
        meta.textContent = 'Failed to load source preview.';
        container.innerHTML = '';
    }
}
window.openSourceModal = openSourceModal;

function closeSourceModal() {
    document.getElementById('sourceModal').classList.remove('active');
}
window.closeSourceModal = closeSourceModal;

function exportToExcel() {
    if (!_currentValidationFinancials) return;
    const fin = _currentValidationFinancials;
    const years = fin.years_found || [];
    
    const ws_data = [];
    // Header
    ws_data.push(["Field", ...years]);
    
    // Populate rows
    const fields = [
        "revenue", "other_income", "total_income", "cost_of_materials", "employee_expense", 
        "depreciation", "finance_cost", "other_expenses", "total_expenses", 
        "profit_before_tax", "tax_expense", "net_profit", "ebitda",
        "share_capital", "reserves", "equity", "long_term_borrowings", "short_term_borrowings", 
        "total_debt", "trade_payables", "other_current_liabilities", "short_term_provisions", "current_liabilities_total",
        "tangible_assets", "trade_receivables", "cash_and_equivalents", "inventories", 
        "short_term_loans_advances", "other_current_assets", "current_assets_total", "total_assets", "working_capital",
        "operating_cash_flow", "investing_cash_flow", "financing_cash_flow"
    ];
    
    fields.forEach(f => {
        let row = [f];
        years.forEach(y => {
            row.push(fin[y] && fin[y][f] !== undefined ? fin[y][f] : null);
        });
        ws_data.push(row);
    });
    
    const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Financials");
    window.XLSX.writeFile(wb, "Extracted_Financials.xlsx");
}
window.exportToExcel = exportToExcel;

async function flagForReview() {
    if (!confirm("Flag this analysis as broken or failing AI extraction?")) return;

    try {
        const res = await authFetch(`/api/flag_for_review/${_currentValidationJobId}`, { method: 'POST' });
        if (res.ok) {
            document.getElementById('validationRightPane').style.display = 'none';
            showToast("Analysis flagged for human review.", "success");
            setTimeout(() => newAnalysis(), 1000);
        }
    } catch(err) {
        showToast("Network error.", "error");
    }
}

// ── Step Detail Inspector ─────────────────────────────────────

let _stepDetailOpen = null;

async function openStepDetail(step) {
    const jobId = _currentJobId || _currentValidationJobId;
    if (!jobId) return;

    // Highlight selected step
    document.querySelectorAll('.progress-step').forEach(el => el.classList.remove('step-selected'));
    const stepEl = document.getElementById(`step-${step}`);
    if (stepEl) stepEl.classList.add('step-selected');
    _stepDetailOpen = step;

    const panel = document.getElementById('stepDetailPanel');
    const title = document.getElementById('stepDetailTitle');
    const content = document.getElementById('stepDetailContent');
    const advBtn = document.getElementById('advanceWorkflowBtn');

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    title.textContent = `${STEP_CONFIG[step]?.icon || ''} ${STEP_CONFIG[step]?.label || step}`;
    content.innerHTML = '<div class="spinner" style="margin:16px auto"></div>';
    advBtn.style.display = 'none';

    try {
        const res = await authFetch(`/api/result/${jobId}`);
        const data = await res.json();

        const statusBadge = _renderStatusBadge(step);
        const stepContent = _renderStepData(step, data);

        // Show "Push Ahead" if job appears stuck (not completed, not failed, has extraction data or is running)
        const canAdvance = data.status !== 'completed' && data.status !== 'failed';
        if (canAdvance) {
            advBtn.style.display = 'inline-flex';
        }

        content.innerHTML = `
            <div style="margin-bottom:12px">${statusBadge}</div>
            ${stepContent}
        `;
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
        content.innerHTML = '<p style="color:var(--danger)">Failed to load step data.</p>';
    }
}
window.openStepDetail = openStepDetail;

function closeStepDetail() {
    document.getElementById('stepDetailPanel').style.display = 'none';
    document.querySelectorAll('.progress-step').forEach(el => el.classList.remove('step-selected'));
    _stepDetailOpen = null;
}
window.closeStepDetail = closeStepDetail;

async function advanceWorkflow() {
    const jobId = _currentJobId || _currentValidationJobId;
    if (!jobId) { showToast('No active job found.', 'error'); return; }

    const btn = document.getElementById('advanceWorkflowBtn');
    btn.disabled = true;
    btn.textContent = 'Pushing...';

    try {
        const res = await authFetch(`/api/restart_job/${jobId}`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            showToast('Workflow pushed ahead!', 'success');
            closeStepDetail();
            const vPane = document.getElementById('validationRightPane');
            if (vPane) vPane.style.display = 'none';

            if (data.status === 'awaiting_projection') {
                showProjectionUploadView(jobId);
            } else if (data.status === 'restarted' || data.status === 'resuming') {
                listenToProgress(jobId);
            }
        } else {
            showToast(data.error || 'Could not advance workflow.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }

    btn.disabled = false;
    btn.textContent = '⏩ Push Ahead';
}
window.advanceWorkflow = advanceWorkflow;

function _renderStatusBadge(step) {
    const stepEl = document.getElementById(`step-${step}`);
    const isDone = stepEl && stepEl.classList.contains('done');
    const isActive = stepEl && stepEl.classList.contains('active');
    const statusText = isDone ? 'Completed' : isActive ? 'In Progress' : 'Pending';
    const color = isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--text-muted)';
    const detailMsg = document.getElementById(`detail-${step}`)?.textContent || '';
    return `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="display:inline-block;padding:2px 10px;border-radius:99px;background:${color}22;color:${color};font-size:12px;font-weight:600">${statusText}</span>
            ${detailMsg ? `<span style="font-size:13px;color:var(--text-muted)">${detailMsg}</span>` : ''}
        </div>`;
}

function _renderStepData(step, data) {
    const fmt = (v) => v == null ? '<span style="color:var(--text-muted)">—</span>' : Number(v).toLocaleString();
    const row = (label, val) => `<tr><td style="padding:5px 10px;color:var(--text-muted);font-size:13px;white-space:nowrap">${label}</td><td style="padding:5px 10px;font-size:13px;font-weight:500">${val}</td></tr>`;

    if (step === 'parse') {
        const files = (data.filenames || []).join(', ') || '—';
        const textLen = data.parsed_text ? data.parsed_text.length.toLocaleString() + ' chars' : '—';
        return `<table style="width:100%;border-collapse:collapse">
            ${row('Company', data.company_name || '—')}
            ${row('Files', files)}
            ${row('Text extracted', textLen)}
            ${row('Gemini files uploaded', (data.gemini_files || []).length)}
        </table>`;
    }

    if (step === 'categorize') {
        const catalog = data.document_catalog || [];
        if (!catalog.length) return '<p style="color:var(--text-muted);font-size:13px">No catalog data yet.</p>';
        return `<table style="width:100%;border-collapse:collapse">
            <thead><tr><th style="padding:5px 10px;text-align:left;font-size:12px;color:var(--text-muted)">File</th><th style="padding:5px 10px;text-align:left;font-size:12px;color:var(--text-muted)">Category</th></tr></thead>
            <tbody>${catalog.map(c => `<tr><td style="padding:5px 10px;font-size:13px">${c.filename}</td><td style="padding:5px 10px;font-size:13px;color:var(--accent)">${c.category}</td></tr>`).join('')}</tbody>
        </table>`;
    }

    if (step === 'extract') {
        const fin = data.extracted_financials;
        if (!fin) return '<p style="color:var(--text-muted);font-size:13px">Extraction not yet complete.</p>';
        const years = fin.years_found || [];
        const keyFields = ['revenue', 'net_profit', 'total_assets', 'equity', 'total_debt', 'operating_cash_flow'];
        return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr>
                <th style="padding:5px 10px;text-align:left;color:var(--text-muted)">Field</th>
                ${years.map(y => `<th style="padding:5px 10px;text-align:right;color:var(--accent)">${y}</th>`).join('')}
            </tr></thead>
            <tbody>${keyFields.map(f => `<tr>
                <td style="padding:5px 10px;white-space:nowrap">${f.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}</td>
                ${years.map(y => `<td style="padding:5px 10px;text-align:right;font-family:monospace">${fmt(fin[y]?.[f])}</td>`).join('')}
            </tr>`).join('')}</tbody>
        </table></div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px">${years.length} year(s) extracted. Click "Push Ahead" if the workflow is stuck here.</p>`;
    }

    if (step === 'projection') {
        const files = data.projection_filenames || [];
        return files.length
            ? `<p style="font-size:13px">Projection files: <strong>${files.join(', ')}</strong></p>`
            : '<p style="color:var(--text-muted);font-size:13px">No projection files uploaded yet.</p>';
    }

    if (step === 'validate') {
        return data.extracted_financials
            ? '<p style="font-size:13px">Financials extracted and awaiting human validation. Use the validation table on the right panel.</p>'
            : '<p style="color:var(--text-muted);font-size:13px">Validation not started yet.</p>';
    }

    if (step === 'web') {
        const website = data.company_website || '—';
        const numComp = Array.isArray(data.competitors) ? data.competitors.length : (data.competitors ? Object.keys(data.competitors).length : 0);
        return `<table style="width:100%;border-collapse:collapse">
            ${row('Website', website)}
            ${row('Competitors found', numComp)}
        </table>`;
    }

    if (step === 'background') {
        const bg = data.result?.company_background || data.background || {};
        if (!bg || !Object.keys(bg).length) return '<p style="color:var(--text-muted);font-size:13px">Background analysis not yet complete.</p>';
        return `<table style="width:100%;border-collapse:collapse">
            ${row('Industry', bg.industry || '—')}
            ${row('Sub-Industry', bg.sub_industry || '—')}
            ${row('Business Model', bg.business_model || '—')}
            ${row('HQ', bg.headquarters || '—')}
        </table>
        ${bg.company_description ? `<p style="margin-top:10px;font-size:13px;color:var(--text-secondary)">${bg.company_description.slice(0,300)}…</p>` : ''}`;
    }

    if (step === 'competitors') {
        const comp = data.result?.competitor_analysis || data.competitors || {};
        const list = comp.competitors || comp.top_competitors || [];
        if (!list.length) return '<p style="color:var(--text-muted);font-size:13px">Competitor analysis not yet complete.</p>';
        return `<ul style="list-style:none;padding:0;display:flex;flex-direction:column;gap:4px">
            ${list.slice(0,5).map(c => `<li style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--border)">
                <strong>${c.name || c}</strong>${c.market_position ? ` — ${c.market_position}` : ''}
            </li>`).join('')}
        </ul>`;
    }

    if (step === 'ratios') {
        const ratios = data.result?.computed_ratios || {};
        if (!Object.keys(ratios).length) return '<p style="color:var(--text-muted);font-size:13px">Ratios not yet calculated.</p>';
        // Show first year's first category as a sample
        const firstYear = Object.keys(ratios)[0];
        const yearData = ratios[firstYear] || {};
        const firstCat = Object.keys(yearData)[0];
        const items = yearData[firstCat] || {};
        return `<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${firstYear} · ${firstCat}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tbody>${Object.entries(items).slice(0,6).map(([name,d]) => `<tr>
                <td style="padding:4px 8px;color:var(--text-muted)">${name}</td>
                <td style="padding:4px 8px;font-family:monospace;font-weight:600">${d?.formatted || '—'}</td>
                <td style="padding:4px 8px;font-size:12px;color:${d?.status?.includes('PASS')?'var(--success)':'var(--danger)'}">${d?.status || ''}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    }

    if (step === 'projection_analysis') {
        const proj = data.result?.projection_analysis || {};
        if (!proj.review_table) return '<p style="color:var(--text-muted);font-size:13px">Projection review not yet complete.</p>';
        const credColor = { 'Optimistic': 'var(--danger)', 'Realistic': 'var(--success)', 'Conservative': 'var(--accent-light)', 'Mixed': 'var(--warning)' };
        return `
        <table style="width:100%;border-collapse:collapse">
            ${row('Overall credibility', `<span style="font-weight:700;color:${credColor[proj.overall_credibility]||'var(--text-primary)'}">${proj.overall_credibility || '—'}</span>`)}
            ${row('Period', proj.projection_period || '—')}
            ${row('Metrics reviewed', proj.review_table.length)}
            ${row('Risk flags', proj.review_table.filter(r => r.risk_flag).length)}
        </table>
        ${proj.overall_credibility_summary ? `<p style="margin-top:10px;font-size:13px;color:var(--text-secondary);line-height:1.5">${proj.overall_credibility_summary.slice(0,300)}…</p>` : ''}`;
    }

    if (step === 'financial') {
        const fin = data.result?.financial_analysis || {};
        const summary = fin.executive_summary || '';
        if (!summary) return '<p style="color:var(--text-muted);font-size:13px">Financial analysis not yet complete.</p>';
        return `<p style="font-size:13px;color:var(--text-secondary);line-height:1.6">${summary.slice(0,400)}${summary.length > 400 ? '…' : ''}</p>`;
    }

    if (step === 'risks') {
        const risk = data.result?.risk_analysis || {};
        const factors = risk.risk_factors || [];
        if (!factors.length) return '<p style="color:var(--text-muted);font-size:13px">Risk assessment not yet complete.</p>';
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:13px;font-weight:600">Overall Risk:</span>
            <span style="padding:2px 8px;border-radius:99px;font-size:12px;background:var(--${risk.overall_risk_rating==='High'?'red':'warning'}22);color:var(--${risk.overall_risk_rating==='High'?'danger':'warning'})">${risk.overall_risk_rating || 'N/A'}</span>
        </div>
        <ul style="list-style:none;padding:0;display:flex;flex-direction:column;gap:4px">
            ${factors.slice(0,4).map(r => `<li style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--border)">
                <span style="font-weight:600;color:var(--danger)">${r.severity || ''}</span> · ${r.category || ''}: ${(r.description||'').slice(0,80)}…
            </li>`).join('')}
        </ul>`;
    }

    if (step === 'recommendation') {
        const rec = data.result?.recommendation || {};
        if (!rec.recommendation) return '<p style="color:var(--text-muted);font-size:13px">Recommendation not yet generated.</p>';
        const v = (rec.recommendation || '').toUpperCase();
        const vColor = v==='BUY'?'var(--success)':v==='HOLD'?'var(--warning)':'var(--danger)';
        return `<div style="text-align:center;padding:16px 0">
            <div style="font-size:36px;font-weight:900;color:${vColor}">${v}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px">Confidence: ${rec.confidence_level || 'N/A'} · Horizon: ${rec.target_horizon || 'N/A'}</div>
            ${rec.summary ? `<p style="font-size:13px;margin-top:10px;color:var(--text-secondary)">${rec.summary.slice(0,250)}…</p>` : ''}
        </div>`;
    }

    if (step === 'report') {
        return data.report_path
            ? `<p style="font-size:13px">Report generated: <strong>${data.report_path.split('/').pop()}</strong></p>`
            : '<p style="color:var(--text-muted);font-size:13px">Report not yet generated.</p>';
    }

    if (step === 'save') {
        return data.status === 'completed'
            ? '<p style="font-size:13px;color:var(--success)">Analysis saved to your profile.</p>'
            : '<p style="color:var(--text-muted);font-size:13px">Save pending completion.</p>';
    }

    return '<p style="color:var(--text-muted);font-size:13px">No additional data available for this step.</p>';
}
