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
    // Init Theme
    let currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.innerHTML = currentTheme === 'light' 
            ? '🌙\n                <span class="nav-label">Theme</span>' 
            : '☀️\n                <span class="nav-label">Theme</span>';
    }

    // Init Supabase
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Check existing session
    const { data, error } = await _supabase.auth.getSession();
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
    const savedView = localStorage.getItem('fina_view');
    const savedJobId = localStorage.getItem('fina_job_id');

    if (!savedView) return;

    if (savedView === 'progress' && savedJobId) {
        _currentJobId = savedJobId;
        wizardSection.style.display = 'none';
        progressSection.style.display = 'block';
        listenToProgress(savedJobId);
    } else if (savedView === 'projection' && savedJobId) {
        _currentJobId = savedJobId;
        showProjectionUploadView(savedJobId);
    } else if (savedView === 'validation' && savedJobId) {
        _currentJobId = savedJobId;
        showValidationSplitView(savedJobId);
    } else if (savedView === 'results' && savedJobId) {
        _currentJobId = savedJobId;
        loadResults(savedJobId);
    }
}

// ── Theme & Layout ──────────────────────────────────────────
window.toggleTheme = function() {
    let currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    
    // Update button icon
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
        btn.innerHTML = currentTheme === 'light' 
            ? '🌙\n                <span class="nav-label">Theme</span>' 
            : '☀️\n                <span class="nav-label">Theme</span>';
    }
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
        const valid = /\.(pdf|xlsx|xls)$/i.test(f.name);
        if (valid && !selectedProjectionFiles.find(sf => sf.name === f.name)) {
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
        <div class="progress-step" id="step-${key}">
            <div class="step-indicator pending" id="indicator-${key}">
                <span>${cfg.icon}</span>
            </div>
            <div class="step-text">
                <div class="step-label">${cfg.label}</div>
                <div class="step-detail" id="detail-${key}">Waiting...</div>
            </div>
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
        const nextRetry = _retryCount + 1;
        
        // After 3 SSE failures, fall back to polling (more resilient on cloud hosts like Render)
        if (nextRetry >= 3) {
            console.warn('SSE failed 3 times, falling back to polling...');
            pollProgress(jobId);
            return;
        }
        
        setTimeout(async () => {
            try {
                const res = await authFetch(`/api/result/${jobId}`);
                const data = await res.json();
                if (data.status === 'completed' || data.status === 'failed') {
                    loadResults(jobId);
                } else if (data.status === 'awaiting_projection') {
                    showProjectionUploadView(jobId);
                } else if (data.status === 'waiting_for_user') {
                    showValidationSplitView(jobId);
                } else {
                    listenToProgress(jobId, nextRetry);
                }
            } catch(e) {
                listenToProgress(jobId, nextRetry);
            }
        }, 2000);
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
        loadHistory(); // refresh sidebar
    } catch (err) {
        showToast('Failed to load results.', 'error');
    }
}

function renderResultsView(result, jobId, isHistorical = false) {
    const rec = result.recommendation || {};
    const bg = result.company_background || {};
    const fin = result.financial_analysis || {};
    const risk = result.risk_analysis || {};
    const comp = result.competitor_analysis || {};
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

        let checksPassed = true;
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
    container.innerHTML = '<div class="spinner"></div>';

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

        if (data.image_url) {
            const excerpt = preview.excerpt || source.excerpt || '';
            container.innerHTML = `
                <div style="width:100%">
                    <img src="${data.image_url}" alt="Source preview for ${field}">
                    ${excerpt ? `<p style="margin-top:12px">${excerpt}</p>` : ''}
                </div>
            `;
        } else {
            container.innerHTML = `<p>${preview.excerpt || source.excerpt || 'Source image unavailable for this field.'}</p>`;
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
