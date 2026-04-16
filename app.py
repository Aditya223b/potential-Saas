"""
Financial Analysis Web Application
====================================
Flask web server with real-time progress streaming via SSE.
Upload PDFs → Watch AI analysis in real-time → View results → Download DOCX → Email report.

Now with Supabase Auth & per-user analysis storage.
"""

import os
import json
import uuid
import time
import logging
import threading
import base64
from datetime import datetime
from functools import wraps
from flask import (
    Flask, render_template, request, jsonify, Response,
    send_file, stream_with_context, g
)

import redis
from rq import Queue
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
from config import REDIS_URL, SENTRY_DSN

if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FlaskIntegration()],
        traces_sample_rate=1.0
    )

# ── Production Logging ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100MB max
app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), "uploads")
app.config["REPORTS_FOLDER"] = os.path.join(os.path.dirname(__file__), "reports")

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
os.makedirs(app.config["REPORTS_FOLDER"], exist_ok=True)

redis_conn = redis.from_url(REDIS_URL, decode_responses=True)
q = Queue("financial_analyzer", connection=redis.from_url(REDIS_URL))

# Disable RDB disk snapshots — job/session data is ephemeral.
# Prevents stop-writes-on-bgsave-error from blocking all Redis writes
# when the Railway volume can't persist snapshots to disk.
try:
    redis_conn.config_set('save', '')
    redis_conn.config_set('stop-writes-on-bgsave-error', 'no')
except Exception:
    pass  # non-fatal; managed Redis may restrict CONFIG SET


def _truncate_words(text: str, max_words: int = 300) -> str:
    words = (text or "").split()
    return " ".join(words[:max_words])


def _safe_filename_fragment(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in (value or "file"))
    return cleaned[:80] or "file"


def _resolve_uploaded_pdf_path(pdf_paths: list[str], source_file: str) -> str | None:
    source_name = os.path.basename((source_file or "").strip()).lower()
    for path in pdf_paths:
        path_name = os.path.basename(path).lower()
        if source_name and (path_name.endswith(source_name) or source_name in path_name):
            return path
    return pdf_paths[0] if pdf_paths else None


def _best_excerpt_snippet(excerpt: str) -> str:
    if not excerpt:
        return ""
    text = " ".join(excerpt.split())
    if len(text) <= 120:
        return text
    return text[:120]


def _generate_source_previews(pdf_paths: list[str], sources: dict, job_id: str) -> dict:
    """Generate preview images for extracted field sources when possible."""
    if not sources:
        return {}

    try:
        import fitz
    except Exception as e:
        logger.warning(f"[{job_id}] Source previews unavailable: {e}")
        return {}

    previews: dict[str, dict[str, dict]] = {}

    for year, field_map in sources.items():
        if not isinstance(field_map, dict):
            continue
        previews[year] = {}
        for field, source_info in field_map.items():
            if not isinstance(source_info, dict):
                continue

            pdf_path = _resolve_uploaded_pdf_path(pdf_paths, source_info.get("source_file", ""))
            page_number = int(source_info.get("page_number") or 1)
            excerpt = _best_excerpt_snippet(source_info.get("excerpt", ""))
            if not pdf_path or not os.path.exists(pdf_path):
                previews[year][field] = {
                    "image_path": "",
                    "image_base64": "",
                    "page_number": page_number,
                    "source_file": source_info.get("source_file", ""),
                    "excerpt": excerpt,
                }
                continue

            try:
                doc = fitz.open(pdf_path)
                page_index = max(0, min(page_number - 1, doc.page_count - 1))
                page = doc[page_index]

                clip = page.rect
                if excerpt:
                    matches = page.search_for(excerpt[:80], flags=fitz.TEXT_DEHYPHENATE)
                    if matches:
                        clip = matches[0]
                        clip.x0 = max(page.rect.x0, clip.x0 - 40)
                        clip.y0 = max(page.rect.y0, clip.y0 - 80)
                        clip.x1 = min(page.rect.x1, clip.x1 + 220)
                        clip.y1 = min(page.rect.y1, clip.y1 + 140)

                pix = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), clip=clip, alpha=False)
                image_bytes = pix.tobytes("png")
                previews[year][field] = {
                    "image_path": "",
                    "image_base64": base64.b64encode(image_bytes).decode("ascii"),
                    "page_number": page_number,
                    "source_file": source_info.get("source_file", os.path.basename(pdf_path)),
                    "excerpt": excerpt,
                }
                doc.close()
            except Exception as e:
                logger.warning(f"[{job_id}] Failed to render source preview for {year}.{field}: {e}")
                previews[year][field] = {
                    "image_path": "",
                    "image_base64": "",
                    "page_number": page_number,
                    "source_file": source_info.get("source_file", os.path.basename(pdf_path)),
                    "excerpt": excerpt,
                }

    return previews

def get_job_object(job_id: str):
    """Retrieve job state from Redis, fallback to Supabase."""
    data = redis_conn.get(f"job_state:{job_id}")
    if data:
        return AnalysisJob.from_dict(json.loads(data))
    
    from supabase_client import get_job
    db_data = get_job(job_id)
    if db_data:
        redis_conn.setex(f"job_state:{job_id}", 86400, json.dumps(db_data))
        return AnalysisJob.from_dict(db_data)
        
    return None

from rate_limiter import rate_limiter


class AnalysisJob:
    """Tracks the state of an analysis job.
    
    Every state change is persisted to Supabase in a background thread so
    jobs survive Railway container restarts.
    """

    def __init__(self, job_id: str, filenames: list[str], user_id: str = None):
        self.job_id = job_id
        self.filenames = filenames
        self.user_id = user_id
        self.status = "pending"   # pending → running → awaiting_projection → waiting_for_user → resuming → completed → failed
        self.progress = []        # list of {step, message, done} events
        self.result = None        # full analysis dict
        self.extracted_financials = None
        self.extraction_sources = {}
        self.source_previews = {}
        self.company_name = None
        self.company_website = ""
        self.company_context = ""
        self.email = ""
        self.parsed_text = None
        self.background = None
        self.competitors = None
        self.gemini_files = []
        self.projection_filenames = []
        self.document_catalog = []
        self.report_path = None   # path to generated DOCX
        self.error = None
        self.created_at = datetime.now().isoformat()
        # Initial persistence should be triggered explicitly by the caller
        # to avoid race conditions during deserialization.

    @classmethod
    def from_dict(cls, data: dict):
        if not data: return None
        job = cls(data.get("job_id"), data.get("filenames", []), data.get("user_id"))
        job.status = data.get("status", "pending")
        job.progress = data.get("progress", [])
        job.result = data.get("result")
        job.extracted_financials = data.get("extracted_financials")
        job.extraction_sources = data.get("extraction_sources", {})
        job.source_previews = data.get("source_previews", {})
        job.company_name = data.get("company_name")
        job.company_website = data.get("company_website", "")
        job.company_context = data.get("company_context", "")
        job.email = data.get("email", "")
        job.parsed_text = data.get("parsed_text")
        job.background = data.get("background")
        job.competitors = data.get("competitors")
        job.gemini_files = data.get("gemini_files", [])
        job.projection_filenames = data.get("projection_filenames", [])
        job.document_catalog = data.get("document_catalog", [])
        job.report_path = data.get("report_path")
        job.error = data.get("error")
        job.created_at = data.get("created_at")
        return job

    def _persist_async(self, extra_fields: dict = None):
        """Write full state to Redis, then fire-and-forget to Supabase."""
        state_dict = self.to_dict()
        if extra_fields:
            state_dict.update(extra_fields)
            
        try:
            redis_conn.setex(f"job_state:{self.job_id}", 86400, json.dumps(state_dict))
        except Exception as e:
            logger.error(f"[{self.job_id}] Redis persist failed: {e}")

        def _write():
            try:
                from supabase_client import update_job
                # `job_id` is used to locate the row and should not be sent as
                # an update field as well.
                db_fields = dict(state_dict)
                db_fields.pop("job_id", None)
                update_job(self.job_id, **db_fields)
            except Exception as e:
                logger.warning(f"[{self.job_id}] Supabase persist failed: {e}")
        threading.Thread(target=_write, daemon=True).start()

    def add_progress(self, step: str, message: str, done: bool = False):
        entry = {
            "step": step,
            "message": message,
            "done": done,
            "timestamp": datetime.now().isoformat(),
        }
        self.progress.append(entry)
        # Persist everything including newest progress entries
        self._persist_async()

    def set_status(self, status: str):
        """Update status and persist immediately."""
        self.status = status
        self._persist_async()

    def to_dict(self):
        return {
            "job_id": self.job_id,
            "user_id": self.user_id,
            "status": self.status,
            "progress": self.progress,
            "result": self.result,
            "extracted_financials": self.extracted_financials,
            "extraction_sources": self.extraction_sources,
            "source_previews": self.source_previews,
            "company_name": self.company_name,
            "company_website": self.company_website,
            "company_context": self.company_context,
            "email": self.email,
            "parsed_text": self.parsed_text,
            "background": self.background,
            "competitors": self.competitors,
            "gemini_files": self.gemini_files,
            "projection_filenames": self.projection_filenames,
            "document_catalog": self.document_catalog,
            "report_path": self.report_path,
            "error": self.error,
            "filenames": self.filenames,
            "created_at": self.created_at,
        }


# ── Auth Middleware ───────────────────────────────────────────────────────────


def require_auth(f):
    """Decorator that verifies Supabase JWT and sets g.user."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401

        token = auth_header.split("Bearer ", 1)[1].strip()
        if not token:
            return jsonify({"error": "Empty token"}), 401

        from supabase_client import verify_user_token
        user = verify_user_token(token)
        if not user:
            return jsonify({"error": "Invalid or expired token"}), 401

        g.user = user
        return f(*args, **kwargs)

    return decorated


def optional_auth():
    """Try to extract user from token if present (non-blocking)."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split("Bearer ", 1)[1].strip()
        if token:
            from supabase_client import verify_user_token
            return verify_user_token(token)
    return None


# ── Analysis Pipeline ────────────────────────────────────────────────────────────────────────


def _cleanup_gemini_files(gemini_files: list[str]):
    """Delete temporary files from Gemini servers after processing."""
    try:
        from google import genai
        from config import GEMINI_API_KEY
        client = genai.Client(api_key=GEMINI_API_KEY)
        for ref in gemini_files:
            try:
                client.files.delete(name=ref)
                print(f"  🗑️  Cleaned up Gemini file: {ref}")
            except Exception:
                pass  # Best-effort cleanup
    except Exception:
        pass


def _cleanup_local_uploads(pdf_paths: list[str]):
    """Remove uploaded PDFs from local disk after processing."""
    for p in pdf_paths:
        try:
            if os.path.exists(p):
                os.remove(p)
        except Exception:
            pass


def run_extraction_pipeline(
    job: AnalysisJob,
    pdf_bytes_list: list[bytes],
    filenames: list[str],
    preferred_company_name: str = "",
    company_website: str = "",
    company_context: str = "",
):
    """Run document extraction and pause for projection upload / analyst verification."""
    pdf_paths = []
    try:
        job.set_status("running")
        logger.info(f"[{job.job_id}] Starting extraction pipeline with {len(filenames)} PDFs (received via RAM)")

        # Save the bytes to the Worker's local ephemeral filesystem
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
        for filename, pdf_bytes in zip(filenames, pdf_bytes_list):
            safe_name = f"{job.job_id}_{filename}"
            path = os.path.join(app.config["UPLOAD_FOLDER"], safe_name)
            with open(path, "wb") as f:
                f.write(pdf_bytes)
            pdf_paths.append(path)
        job.document_catalog = [
            {"filename": filename, "category": "historical_financial_statement"}
            for filename in filenames
        ]

        # Step 1: Parse PDFs
        job.add_progress("parse", "📄 Uploading financial statements to Gemini...")
        logger.info(f"[{job.job_id}] Step 1: Uploading PDFs to Gemini File API...")
        from pdf_parser import parse_multiple_pdfs
        parsed = parse_multiple_pdfs(pdf_paths)
        company_name = parsed["company_name"]
        if preferred_company_name and (not company_name or company_name == "Unknown Company"):
            company_name = preferred_company_name
        job.company_name = company_name
        job.company_website = company_website
        job.company_context = _truncate_words(company_context, 300)
        job.parsed_text = parsed.get("full_text", "")
        job.gemini_files = parsed.get("gemini_files", [])
        logger.info(f"[{job.job_id}] Step 1 DONE: {company_name} | {len(job.gemini_files)} files uploaded")
        job.add_progress("parse", f"✅ Detected: {company_name} | {len(job.gemini_files)} documents uploaded", done=True)

        # Step 2: Categorise documents
        job.add_progress("categorize", "🗂️ Categorising uploaded financial documents...")
        logger.info(f"[{job.job_id}] Step 2: Document categorisation complete")
        job.add_progress("categorize", "✅ Historical financial statements categorised", done=True)

        # Step 3: Extract financial figures (multi-year)
        job.add_progress("extract", "🤖 Extracting financial figures utilizing Native File API...")
        logger.info(f"[{job.job_id}] Step 3: AI extraction with {len(job.gemini_files)} file refs...")
        from analyzer import extract_financial_figures, _get_multi_year_financials
        raw_financials = extract_financial_figures(job.gemini_files)
        financials = _get_multi_year_financials(raw_financials)
        job.extracted_financials = financials
        job.extraction_sources = raw_financials.get("sources", {})
        years = financials.get("years_found", [])
        logger.info(f"[{job.job_id}] Step 3 DONE: {len(years)} years extracted: {years}")
        job.add_progress("extract", f"✅ Extracted financials for {len(years)} year(s): {', '.join(years)}", done=True)

        # Source preview generation runs in background so it doesn't block the pipeline.
        # By the time the analyst reaches the Verification table (after the projection
        # upload step), the images are already fully rendered and waiting.
        _preview_pdf_paths = list(pdf_paths)   # copy before finally-cleanup
        _preview_sources   = dict(job.extraction_sources)
        _preview_job_id    = job.job_id

        def _build_previews_bg():
            try:
                previews = _generate_source_previews(
                    _preview_pdf_paths, _preview_sources, _preview_job_id
                )
                # Write directly to Redis so the job state has the images
                # when the analyst opens the Verification panel
                job.source_previews = previews
                job._persist_async()
                logger.info(f"[{_preview_job_id}] Source previews generated in background ({len(previews)} year(s))")
            except Exception as _e:
                logger.warning(f"[{_preview_job_id}] Background source preview failed: {_e}")
            finally:
                # Clean up local PDFs now that preview rendering is done
                _cleanup_local_uploads(_preview_pdf_paths)

        threading.Thread(target=_build_previews_bg, daemon=True).start()

        # Step 4: Pause for projection upload
        job.add_progress("projection", "⏳ Awaiting company projection upload before analyst verification...")
        job.set_status("awaiting_projection")
        logger.info(f"[{job.job_id}] Pipeline paused — waiting for projection upload")

    except Exception as e:
        logger.error(f"[{job.job_id}] EXTRACTION PIPELINE FAILED: {e}", exc_info=True)
        job.error = str(e)
        job.set_status("failed")
        job.add_progress("error", f"❌ Error: {str(e)}", done=True)
        # Clean up immediately on error (background preview thread won't run)
        _cleanup_local_uploads(pdf_paths)
    # NOTE: On the happy path, PDF cleanup is handled inside _build_previews_bg
    # after source previews have been rendered, so we do NOT call it here.

def run_downstream_pipeline(job: AnalysisJob):
    """Resume pipeline after user approves the financials."""
    try:
        from analyzer import _compute_multi_year_ratios, _compute_growth_metrics
        financials = job.extracted_financials
        company_name = job.company_name
        years = financials.get("years_found", [])

        # Step 5: Web research and company analysis
        job.add_progress("web", f"🌐 Researching {company_name} online...")
        logger.info(f"[{job.job_id}] Step 5: Web research for {company_name}...")
        from web_scraper import scrape_company_info, search_competitors
        company_web = scrape_company_info(company_name, website_url_override=job.company_website)
        competitor_web = search_competitors(company_name)
        web_msg = f"✅ Website: {company_web.get('website_url', 'Not found')} | {len(competitor_web)} competitors found"
        logger.info(f"[{job.job_id}] Step 5 DONE: {web_msg}")
        job.add_progress("web", web_msg, done=True)

        job.add_progress("background", "🤖 Analyzing company background...")
        logger.info(f"[{job.job_id}] Step 6: Company background analysis...")
        from analyzer import analyze_company_background, analyze_competitors
        company_research_context = company_web.get("raw_data", "")
        if job.company_context:
            company_research_context = (
                f"{company_research_context}\n\n=== USER PROVIDED COMPANY CONTEXT ===\n"
                f"{job.company_context}"
            ).strip()
        background = analyze_company_background(company_name, job.gemini_files, company_research_context)
        job.background = background
        job.add_progress("background", "✅ Company background complete", done=True)

        job.add_progress("competitors", "🤖 Analyzing competitors...")
        logger.info(f"[{job.job_id}] Step 7: Competitor analysis...")
        industry = background.get("industry", "Unknown")
        competitors = analyze_competitors(company_name, industry, competitor_web)
        job.competitors = competitors
        job.add_progress("competitors", "✅ Competitor analysis complete", done=True)

        # Step 8: Calculate ratios (multi-year)
        job.add_progress("ratios", "📊 Calculating financial ratios...")
        computed_ratios = _compute_multi_year_ratios(financials)
        growth_metrics = _compute_growth_metrics(financials)
        growth_msg = ""
        if growth_metrics:
            growth_msg = f" | Revenue growth: {growth_metrics.get('revenue_growth', 'N/A')}"
        job.add_progress("ratios", f"✅ Ratios calculated for {len(years)} year(s){growth_msg}", done=True)

        # Step 8b: Projection analysis (only when management projections were uploaded)
        projection_analysis = {}
        projection_gemini_refs = []
        if job.projection_filenames:
            job.add_progress("projection_analysis", "📈 Analysing management projections...")
            logger.info(f"[{job.job_id}] Step 8b: Projection analysis ({len(job.projection_filenames)} file(s))...")
            from analyzer import analyze_projections
            # Projection Gemini refs are the last N entries of gemini_files
            # (they were appended by upload_projection)
            n_proj = len(job.projection_filenames)
            projection_gemini_refs = getattr(job, "gemini_files", [])[-n_proj:] if n_proj else []
            projection_analysis = analyze_projections(
                company_name,
                projection_gemini_refs,
                financials,
                computed_ratios,
                growth_metrics,
            )
            if projection_analysis:
                job.add_progress("projection_analysis", "✅ Projection review complete", done=True)
            else:
                job.add_progress("projection_analysis", "⚠️ Projection analysis returned no data", done=True)

        # Step 9: Financial analysis
        job.add_progress("financial", "🤖 Deep financial analysis...")
        from analyzer import analyze_financials
        financial_analysis = analyze_financials(company_name, getattr(job, "gemini_files", []), financials, computed_ratios)
        job.add_progress("financial", "✅ Financial analysis complete", done=True)

        # Step 10: Risk assessment
        job.add_progress("risks", "🤖 Assessing risks & investment potential...")
        from analyzer import analyze_risks_and_pros
        risk_analysis = analyze_risks_and_pros(company_name, financial_analysis, competitors, computed_ratios, growth_metrics)
        job.add_progress("risks", "✅ Risk assessment complete", done=True)

        # Step 11: Recommendation
        job.add_progress("recommendation", "🤖 Generating investment recommendation...")
        from analyzer import generate_recommendation
        recommendation = generate_recommendation(
            company_name, financial_analysis, competitors, risk_analysis, computed_ratios, growth_metrics
        )
        verdict = recommendation.get("recommendation", "N/A")
        job.add_progress("recommendation", f"✅ Recommendation: {verdict}", done=True)

        # Step 12: Generate report
        job.add_progress("report", "📝 Generating DOCX report...")
        from report_generator import generate_report

        analysis = {
            "company_name": company_name,
            "financials": financials,
            "computed_ratios": computed_ratios,
            "growth_metrics": growth_metrics,
            "company_background": background,
            "competitor_analysis": competitors,
            "financial_analysis": financial_analysis,
            "projection_analysis": projection_analysis,
            "risk_analysis": risk_analysis,
            "recommendation": recommendation,
        }

        output_dir = app.config["REPORTS_FOLDER"]
        os.makedirs(output_dir, exist_ok=True)
        logger.info(f"[{job.job_id}] Step 10: Writing report to {output_dir}")
        report_path = generate_report(analysis, output_dir=output_dir)
        job.add_progress("report", f"✅ Report saved", done=True)

        job.result = analysis
        job.report_path = report_path

        # Step 11: Save to Supabase (if user is authenticated)
        if job.user_id:
            job.add_progress("save", "💾 Saving to your profile...")
            logger.info(f"[{job.job_id}] Step 11: Saving to Supabase...")

            def _do_save():
                from supabase_client import save_analysis, upload_report_file
                storage_path = None
                if report_path and os.path.exists(report_path):
                    logger.info(f"[{job.job_id}] Uploading DOCX to Supabase Storage...")
                    storage_path = upload_report_file(job.user_id, job.job_id, report_path)
                    logger.info(f"[{job.job_id}] DOCX upload done: {storage_path}")
                save_analysis(
                    user_id=job.user_id,
                    company_name=company_name,
                    job_id=job.job_id,
                    analysis_data=analysis,
                    filenames=job.filenames,
                    report_storage_path=storage_path,
                )
                logger.info(f"[{job.job_id}] Supabase save complete")

            save_thread = threading.Thread(target=_do_save, daemon=True)
            save_thread.start()
            save_thread.join(timeout=30)  # Wait max 30s for Supabase

            if save_thread.is_alive():
                logger.warning(f"[{job.job_id}] Supabase save timed out after 30s — skipping")
                job.add_progress("save", "⚠️ Profile save timed out (report still generated)", done=True)
            else:
                job.add_progress("save", "✅ Saved to your profile", done=True)
        else:
            job.add_progress("save", "ℹ️ Save skipped (anonymous analysis)", done=True)
            
        # Send Email Automatically if provided
        if job.email:
            job.add_progress("email", f"📧 Emailing report to {job.email}...", done=False)
            try:
                from email_sender import send_report_email
                success, err_reason = send_report_email(job.email, company_name, report_path)
                if success:
                    job.add_progress("email", "✅ Report emailed successfully", done=True)
                else:
                    job.add_progress("email", f"⚠️ Email failed: {err_reason}", done=True)
            except Exception as e:
                logger.error(f"[{job.job_id}] Email dispatch failed: {e}")
                job.add_progress("email", f"⚠️ Email failed: {str(e)}", done=True)

        job.set_status("completed")

    except Exception as e:
        logger.error(f"[{job.job_id}] DOWNSTREAM PIPELINE FAILED: {e}", exc_info=True)
        job.error = str(e)
        job.set_status("failed")
        job.add_progress("error", f"❌ Error: {str(e)}", done=True)
    finally:
        # Clean up Gemini files after downstream completes or fails
        _cleanup_gemini_files(getattr(job, "gemini_files", []))


# ── Routes ───────────────────────────────────────────────────────────────────────────


@app.route("/health")
def health():
    """Health check endpoint for Render."""
    return jsonify({"status": "ok"})


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/me")
@require_auth
def me():
    """Return the current authenticated user's info."""
    return jsonify({"user": g.user})


@app.route("/api/upload", methods=["POST"])
def upload():
    """Upload PDFs and start analysis. Auth is optional but enables saving."""
    files = request.files.getlist("pdfs")

    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files uploaded"}), 400

    # Try to get user from auth header (optional)
    user = optional_auth()
    user_id = user["id"] if user else None
    preferred_company_name = request.form.get("company", "").strip()
    company_website = request.form.get("company_website", "").strip()
    company_context = _truncate_words(request.form.get("company_context", "").strip(), 300)

    # Enforce per-user AI rate limit
    allowed, reason = rate_limiter.check(user_id)
    if not allowed:
        return jsonify({"error": reason}), 429

    job_id = str(uuid.uuid4())[:8]
    pdf_bytes_list = []
    filenames = []

    for f in files:
        if f.filename and f.filename.lower().endswith(".pdf"):
            pdf_bytes_list.append(f.read())
            filenames.append(f.filename)

    if not pdf_bytes_list:
        return jsonify({"error": "No valid PDF files found"}), 400

    job = AnalysisJob(job_id, filenames, user_id=user_id)
    job.email = request.form.get("email", "").strip()
    
    # Step 1: Initialize job row in Supabase (INSERT), then persist state
    if user_id:
        from supabase_client import create_job
        create_job(job_id, user_id, filenames)
    job.set_status("pending")

    rate_limiter.record(user_id)

    q.enqueue(
        "app.run_extraction_pipeline",
        job,
        pdf_bytes_list,
        filenames,
        preferred_company_name,
        company_website,
        company_context,
        job_timeout=3600,
    )

    return jsonify({"job_id": job_id})

@app.route("/api/approve_financials/<job_id>", methods=["POST"])
def approve_financials(job_id):
    job = get_job_object(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    if not job.projection_filenames:
        return jsonify({"error": "Upload projection files before approving the financials"}), 400

    data = request.get_json()
    verified_financials = data.get("financials")
    if not verified_financials:
        return jsonify({"error": "No financials payload provided"}), 400

    job.extracted_financials = verified_financials
    job.add_progress("validate", "✅ Human validation complete", done=True)
    job.set_status("resuming")

    q.enqueue("app.run_downstream_pipeline", job, job_timeout=3600)
    
    return jsonify({"status": "resuming"})


@app.route("/api/upload_projection/<job_id>", methods=["POST"])
def upload_projection(job_id):
    """Upload company projection documents before analyst verification."""
    job = get_job_object(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    files = request.files.getlist("projection_files")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No projection files uploaded"}), 400

    projection_paths = []
    projection_names = []

    try:
        from pdf_parser import _upload_to_gemini
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

        # Save all files to disk first (this is fast — just local I/O)
        for uploaded in files:
            filename = uploaded.filename or ""
            if not filename:
                continue
            safe_name = f"{job.job_id}_projection_{filename}"
            path = os.path.join(app.config["UPLOAD_FOLDER"], safe_name)
            uploaded.save(path)
            projection_paths.append(path)
            projection_names.append(filename)

        if not projection_paths:
            return jsonify({"error": "No valid projection files found"}), 400

        # Upload all files to Gemini in parallel rather than serially.
        # Serial uploads of e.g. 3 large files can take 3×2min = 6min,
        # crashing Railway's 30s HTTP request timeout.
        projection_refs = []
        errors = []

        def _upload_one(path):
            return _upload_to_gemini(path)

        import concurrent.futures as _cf
        with _cf.ThreadPoolExecutor(max_workers=min(len(projection_paths), 5)) as pool:
            futures = {pool.submit(_upload_one, p): p for p in projection_paths}
            for future in _cf.as_completed(futures):
                try:
                    projection_refs.append(future.result())
                except Exception as _ue:
                    errors.append(str(_ue))
                    logger.warning(f"[{job.job_id}] Projection file upload failed: {_ue}")

        if not projection_refs:
            return jsonify({"error": f"All projection uploads failed: {'; '.join(errors)}"}), 500

        job.gemini_files.extend(projection_refs)
        job.projection_filenames.extend(projection_names[:len(projection_refs)])
        job.document_catalog.extend(
            {"filename": name, "category": "management_projection"}
            for name in projection_names[:len(projection_refs)]
        )
        job.add_progress("projection", f"✅ Projection uploaded: {', '.join(projection_names[:len(projection_refs)])}", done=True)
        job.add_progress("validate", "⏳ Waiting for human validation of extracted financial data...")
        job.set_status("waiting_for_user")

        return jsonify({"status": "waiting_for_user", "projection_files": projection_names[:len(projection_refs)]})
    except Exception as e:
        logger.error(f"[{job.job_id}] Projection upload failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        _cleanup_local_uploads(projection_paths)


@app.route("/api/restart_job/<job_id>", methods=["POST"])
def restart_job(job_id):
    """Force restart a job if it gets stuck."""
    job = get_job_object(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    if job.status == "completed":
        return jsonify({"message": "Job already completed"}), 200

    if job.extracted_financials:
        job.error = None
        if job.status == "awaiting_projection":
            job.add_progress("projection", "🔄 Projection upload stage reset by user", done=False)
            return jsonify({"status": "awaiting_projection"})

        job.set_status("resuming")
        job.add_progress("validate", "🔄 Workflow forcefully restarted by user", done=True)
        q.enqueue("app.run_downstream_pipeline", job, job_timeout=3600)
        return jsonify({"status": "restarted"})

    return jsonify({"error": "Cannot restart the extraction phase (PDFs not preserved in RAM). Please refresh and re-upload the PDF to start fresh."}), 400

@app.route("/api/flag_for_review/<job_id>", methods=["POST"])
def flag_for_review(job_id):
    job = get_job_object(job_id)
    if not job: return jsonify({"error": "Job not found"}), 404
    job.error = "Flagged for manual review by human analyst."
    job.add_progress("validate", "🛑 Flagged for manual review", done=True)
    job.set_status("failed")
    return jsonify({"status": "failed"})


@app.route("/api/progress/<job_id>")
def progress(job_id):
    """SSE endpoint for real-time progress updates."""
    def generate():
        seen = 0
        heartbeat_interval = 15
        last_heartbeat = time.time()
        max_wait = 600
        start_time = time.time()

        while True:
            if time.time() - start_time > max_wait:
                yield f"data: {json.dumps({'step': 'timeout', 'message': 'SSE session timed out', 'done': True})}\n\n"
                return

            job = get_job_object(job_id)
            if not job:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                return

            current_progress = job.progress
            current_status = job.status

            if len(current_progress) > seen:
                for event in current_progress[seen:]:
                    yield f"data: {json.dumps(event)}\n\n"
                seen = len(current_progress)
                last_heartbeat = time.time()

            if current_status == "awaiting_projection":
                yield f"data: {json.dumps({'step': 'awaiting_projection', 'status': current_status, 'done': True})}\n\n"
                return

            if current_status == "waiting_for_user":
                yield f"data: {json.dumps({'step': 'waiting_for_user', 'status': current_status, 'done': True})}\n\n"
                return

            if current_status in ("completed", "failed"):
                yield f"data: {json.dumps({'step': 'done', 'status': current_status, 'done': True})}\n\n"
                return

            if time.time() - last_heartbeat > heartbeat_interval:
                yield f": heartbeat\n\n"
                last_heartbeat = time.time()

            time.sleep(0.5) 

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/result/<job_id>")
def result(job_id):
    """Get the full analysis result."""
    job = get_job_object(job_id)
    if job:
        return jsonify(job.to_dict())
        
    return jsonify({"error": "Job not found"}), 404


@app.route("/api/source-preview/<job_id>")
def source_preview(job_id):
    """Return source metadata for a verified field."""
    year = request.args.get("year", "")
    field = request.args.get("field", "")
    job = get_job_object(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    preview = ((job.source_previews or {}).get(year, {}) or {}).get(field)
    source = ((job.extraction_sources or {}).get(year, {}) or {}).get(field)

    # Use whichever has data
    page_number  = int((preview or source or {}).get("page_number") or 1)
    source_file  = (preview or source or {}).get("source_file", "")
    excerpt      = (preview or source or {}).get("excerpt", "")

    # ── Try pre-rendered base64 first (fast path) ──────────────────────────
    image_data_url = None
    if preview and preview.get("image_base64"):
        image_data_url = f"data:image/png;base64,{preview['image_base64']}"

    # ── On-demand fallback: render via Gemini File API ─────────────────────
    # If the background thread hasn't finished yet (or Redis serialization
    # stripped the base64), ask Gemini to render the page as a PNG image.
    # We use the stored Gemini file references for the historical documents.
    if not image_data_url:
        try:
            gemini_files = getattr(job, "gemini_files", [])
            # Limit to historical files only (projection files are appended last)
            n_proj = len(getattr(job, "projection_filenames", []))
            hist_refs = gemini_files[:-n_proj] if n_proj else gemini_files

            if hist_refs:
                from google import genai as _genai
                from config import GEMINI_API_KEY
                _gclient = _genai.Client(api_key=GEMINI_API_KEY)

                # Resolve Gemini file objects
                file_objs = []
                for ref in hist_refs:
                    try:
                        file_objs.append(_gclient.files.get(name=ref))
                    except Exception:
                        pass

                if file_objs:
                    render_prompt = (
                        f"Please render page {page_number} of the attached financial document as a clear, "
                        f"high-resolution image. Focus on the table or section containing: '{excerpt[:120]}'. "
                        f"Highlight or frame the relevant row or number if possible. "
                        f"Return only the image, no text."
                    )
                    contents = [*file_objs, render_prompt]
                    response = _gclient.models.generate_content(
                        model="gemini-2.0-flash",
                        contents=contents,
                        config={"response_modalities": ["IMAGE"]},
                    )
                    # Extract image bytes from response parts
                    for part in (response.candidates[0].content.parts if response.candidates else []):
                        if hasattr(part, "inline_data") and part.inline_data:
                            img_b64 = base64.b64encode(part.inline_data.data).decode("ascii")
                            image_data_url = f"data:{part.inline_data.mime_type};base64,{img_b64}"
                            # Cache it back so next click is instant
                            if preview is not None:
                                preview["image_base64"] = img_b64
                            break
        except Exception as _img_err:
            logger.warning(f"[{job_id}] On-demand image generation failed: {_img_err}")

    if not preview and not source:
        return jsonify({"error": "Source preview not available"}), 404

    return jsonify({
        "year": year,
        "field": field,
        "source": source or {},
        "preview": {
            "page_number": page_number,
            "source_file": source_file,
            "excerpt": excerpt,
        },
        "image_data_url": image_data_url,
        "image_url": None,
    })



@app.route("/api/source-image/<job_id>")
def source_image(job_id):
    """Serve a rendered preview image for a field's source evidence."""
    year = request.args.get("year", "")
    field = request.args.get("field", "")
    job = get_job_object(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    preview = ((job.source_previews or {}).get(year, {}) or {}).get(field)
    image_base64 = (preview or {}).get("image_base64")
    if image_base64:
        return Response(base64.b64decode(image_base64), mimetype="image/png")

    image_path = (preview or {}).get("image_path")
    if not image_path or not os.path.exists(image_path):
        return jsonify({"error": "Source image not available"}), 404

    return send_file(image_path, mimetype="image/png")


@app.route("/api/download/<job_id>")
def download(job_id):
    """Download the generated DOCX report."""
    job = get_job_object(job_id)
    if not job or not job.report_path:
        return jsonify({"error": "Report not available"}), 404
    return send_file(job.report_path, as_attachment=True, download_name=os.path.basename(job.report_path))


@app.route("/api/email/<job_id>", methods=["POST"])
def send_email(job_id):
    """Send the report via email, attaching the DOCX from Supabase Storage if available."""
    data = request.get_json()
    email = data.get("email", "").strip()
    if not email:
        return jsonify({"error": "Email is required"}), 400

    analysis_data = None
    company_name = "Unknown"
    report_path_to_use = None
    storage_path = None
    recommendation = ""
    summary = ""

    # Try resolving as an active Redis job first
    job = get_job_object(job_id)
    if job and job.result:
        analysis_data = job.result
        company_name = job.result.get("company_name", "Unknown")
        report_path_to_use = job.report_path
        storage_path = job.result.get("_report_storage_path") or (f"{job.user_id}/{job.job_id}.docx" if job.user_id else None)
        rec = job.result.get("recommendation", {})
        recommendation = rec.get("recommendation", "") if isinstance(rec, dict) else str(rec)
        summary = job.result.get("financial_analysis", {}).get("executive_summary", "")
    else:
        # Fallback 1: Might be a purely historical UUID
        # Fallback 2: Might be an active Redis job_id that expired from Redis, but was saved to 'analyses'
        import uuid
        try:
            uuid.UUID(job_id)
            is_uuid = True
        except ValueError:
            is_uuid = False
            
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split("Bearer ", 1)[1].strip()
            from supabase_client import verify_user_token, _get_admin_client
            user = verify_user_token(token)
            if user:
                try:
                    query = _get_admin_client().table("analyses").select("*").eq("user_id", user["id"])
                    if is_uuid:
                        query = query.eq("id", job_id)
                    else:
                        query = query.eq("job_id", job_id)
                    
                    res = query.order('created_at', desc=True).limit(1).execute()
                    hist_data = res.data[0] if res.data else None
                except Exception as e:
                    logger.error(f"[{job_id}] Fallback query failed: {e}")
                    hist_data = None
                
                if hist_data:
                    logger.info(f"[{job_id}] found fallback analysis_data")
                    analysis_data = hist_data.get("analysis_data", {})
                    company_name = hist_data.get("company_name", "Unknown")
                    storage_path = hist_data.get("report_storage_path")
                    
                    rec = hist_data.get("recommendation", {})
                    if isinstance(rec, dict):
                        recommendation = rec.get("recommendation", "N/A")
                    else:
                        recommendation = str(rec)
                        
                    summary = analysis_data.get("financial_analysis", {}).get("executive_summary", "")
                else:
                    logger.error(f"[{job_id}] fallback query returned None")
            else:
                logger.error(f"[{job_id}] verify_user_token failed")
        else:
            logger.error(f"[{job_id}] missing or invalid Authorization header")

    if not analysis_data:
        logger.error(f"[{job_id}] returning 'Analysis not complete or not found'")
        return jsonify({"error": "Analysis not complete or not found (Redis expired, no save found)"}), 400

    # ── Resolve the DOCX path ────────────────────────────────────────────────
    # On Railway the web server and worker run in separate containers, so
    # job.report_path (a worker-local path) doesn't exist on the web container.
    # We download from Supabase Storage instead.
    import tempfile, shutil
    tmp_report_path = None

    # Try to download from Supabase Storage if the local path is gone
    if not report_path_to_use or not os.path.exists(report_path_to_use):
        try:
            from supabase_client import download_report_file
            if storage_path:
                report_bytes = download_report_file(storage_path)
                if report_bytes:
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
                    tmp.write(report_bytes)
                    tmp.close()
                    tmp_report_path = tmp.name
                    report_path_to_use = tmp_report_path
        except Exception as _dl_err:
            logger.warning(f"[{job_id}] Could not download report from Storage: {_dl_err}")

    # Still no file — email body only (no attachment)
    from email_sender import send_report_email

    try:
        success, error_reason = send_report_email(
            to_email=email,
            company_name=company_name,
            report_path=report_path_to_use or "",
            analysis_summary=summary,
            recommendation=recommendation,
        )
    finally:
        # Clean up temp file if we created one
        if tmp_report_path and os.path.exists(tmp_report_path):
            try:
                os.remove(tmp_report_path)
            except Exception:
                pass

    if success:
        return jsonify({"ok": True, "message": f"Report sent to {email}"})
    return jsonify({"error": error_reason or "Failed to send email. Check SMTP settings."}), 500



@app.route("/api/save/<job_id>", methods=["POST"])
@require_auth
def manual_save_analysis(job_id):
    """Manually persist the analysis into Supabase history."""
    job = get_job_object(job_id)
    if not job or not job.result:
        return jsonify({"error": "Analysis result not found or not complete."}), 404

    from supabase_client import save_analysis
    try:
        result = save_analysis(
            user_id=g.user["id"],
            company_name=job.result.get("company_name", "Unknown"),
            job_id=job.job_id,
            analysis_data=job.result,
            filenames=job.filenames,
            report_storage_path=job.report_path,
        )
        if not result:
            return jsonify({"error": "Failed to save to database."}), 500
        return jsonify({"ok": True, "analysis_id": result.get("id")})
    except Exception as e:
        return jsonify({"error": f"Failed to save to database: {str(e)}"}), 500


# ── Rate Limit Status ────────────────────────────────────────────────────────


@app.route("/api/rate-limit-status")
@require_auth
def rate_limit_status():
    """Return the current user's AI usage against the configured limits."""
    return jsonify(rate_limiter.status(g.user["id"]))


# ── User Analysis History (Supabase) ─────────────────────────────────────────


@app.route("/api/my-jobs")
@require_auth
def my_jobs():
    """List all in-progress (non-completed) jobs for the authenticated user."""
    from supabase_client import get_user_jobs
    jobs = get_user_jobs(g.user["id"])
    active_jobs = []
    
    # Verify current state in Redis to avoid race condition delays from DB persistence
    for j in jobs:
        cached = redis_conn.get(f"job_state:{j['job_id']}")
        if cached:
            try:
                parsed = json.loads(cached)
                if parsed.get("status") in ("completed", "failed"):
                    continue  # Skip it, Redis confirms it actually finished
                j.update(parsed)  # Merge redish state which is more current
            except json.JSONDecodeError:
                pass
        active_jobs.append(j)
        
    return jsonify({"jobs": active_jobs})


@app.route("/api/jobs/<job_id>/stop", methods=["POST"])
@require_auth
def stop_job(job_id):
    """Mark an in-progress job as stopped (failed) so it leaves the In-Progress pane."""
    job = get_job_object(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    if job.user_id and job.user_id != g.user["id"]:
        return jsonify({"error": "Forbidden"}), 403

    job.add_progress("error", "🛑 Analysis stopped by user.", done=True)
    job.set_status("failed")
    return jsonify({"ok": True})


@app.route("/api/jobs/<job_id>", methods=["DELETE"])
@require_auth
def delete_job_route(job_id):
    """Delete an in-progress job from Redis and Supabase."""
    job = get_job_object(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    if job.user_id and job.user_id != g.user["id"]:
        return jsonify({"error": "Forbidden"}), 403

    # Remove from Redis
    try:
        redis_conn.delete(f"job_state:{job_id}")
    except Exception as e:
        logger.warning(f"Redis delete failed for job {job_id}: {e}")

    # Remove from Supabase jobs table
    from supabase_client import delete_job
    delete_job(job_id)

    return jsonify({"ok": True})


@app.route("/api/my-analyses")
@require_auth
def my_analyses():
    """List all analyses for the authenticated user."""
    from supabase_client import get_user_analyses
    analyses = get_user_analyses(g.user["id"])
    return jsonify({"analyses": analyses})


@app.route("/api/my-analyses/<analysis_id>")
@require_auth
def my_analysis_detail(analysis_id):
    """Get a single analysis by its Supabase ID."""
    from supabase_client import get_analysis
    analysis = get_analysis(analysis_id, g.user["id"])
    if not analysis:
        return jsonify({"error": "Analysis not found"}), 404
    return jsonify({"analysis": analysis})


@app.route("/api/my-analyses/<analysis_id>", methods=["DELETE"])
@require_auth
def delete_my_analysis(analysis_id):
    """Soft-delete (move to Bin). The analysis can still be restored."""
    from supabase_client import soft_delete_analysis
    success = soft_delete_analysis(analysis_id, g.user["id"])
    if success:
        return jsonify({"ok": True})
    return jsonify({"error": "Failed to delete"}), 500


@app.route("/api/my-analyses/<analysis_id>/restore", methods=["POST"])
@require_auth
def restore_my_analysis(analysis_id):
    """Restore a soft-deleted analysis from the Bin."""
    from supabase_client import restore_analysis
    success = restore_analysis(analysis_id, g.user["id"])
    if success:
        return jsonify({"ok": True})
    return jsonify({"error": "Failed to restore"}), 500


@app.route("/api/my-analyses/<analysis_id>/permanent", methods=["DELETE"])
@require_auth
def permanently_delete_analysis(analysis_id):
    """Permanently delete an analysis that is already in the Bin."""
    from supabase_client import delete_analysis
    success = delete_analysis(analysis_id, g.user["id"])
    if success:
        return jsonify({"ok": True})
    return jsonify({"error": "Failed to permanently delete"}), 500


@app.route("/api/bin")
@require_auth
def bin_analyses():
    """Return all soft-deleted analyses for the current user (the Bin)."""
    from supabase_client import get_bin_analyses
    items = get_bin_analyses(g.user["id"])
    return jsonify({"analyses": items})



@app.route("/api/report-url/<analysis_id>")
@require_auth
def report_url(analysis_id):
    """Get a signed download URL for a stored report."""
    from supabase_client import get_analysis, get_report_download_url
    analysis = get_analysis(analysis_id, g.user["id"])
    if not analysis:
        return jsonify({"error": "Analysis not found"}), 404

    storage_path = analysis.get("report_storage_path")
    if not storage_path:
        return jsonify({"error": "No report file stored"}), 404

    url = get_report_download_url(storage_path)
    if not url:
        return jsonify({"error": "Failed to generate download URL"}), 500

    return jsonify({"url": url})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    app.run(debug=False, port=port, threaded=True, use_reloader=False)
