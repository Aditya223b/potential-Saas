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
from datetime import datetime
from functools import wraps
from flask import (
    Flask, render_template, request, jsonify, Response,
    send_file, stream_with_context, g
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

# In-memory store for analysis jobs
_jobs: dict = {}

from rate_limiter import rate_limiter


class AnalysisJob:
    """Tracks the state of an analysis job."""

    def __init__(self, job_id: str, filenames: list[str], user_id: str = None):
        self.job_id = job_id
        self.filenames = filenames
        self.user_id = user_id
        self.status = "pending"   # pending → running → waiting_for_user → resuming → completed → failed
        self.progress = []        # list of {step, message, done} events
        self.result = None        # full analysis dict
        self.extracted_financials = None
        self.company_name = None
        self.parsed_text = None
        self.background = None
        self.competitors = None
        self.report_path = None   # path to generated DOCX
        self.error = None
        self.created_at = datetime.now().isoformat()

    def add_progress(self, step: str, message: str, done: bool = False):
        self.progress.append({
            "step": step,
            "message": message,
            "done": done,
            "timestamp": datetime.now().isoformat(),
        })

    def to_dict(self):
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "result": self.result,
            "extracted_financials": self.extracted_financials,
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


def run_extraction_pipeline(job: AnalysisJob, pdf_paths: list[str]):
    """Run the first half of the analysis including extraction, and then wait for user."""
    try:
        job.status = "running"
        logger.info(f"[{job.job_id}] Starting extraction pipeline with {len(pdf_paths)} PDFs")

        # Step 1: Parse PDFs
        job.add_progress("parse", "📄 Uploading financial statements to Gemini...")
        logger.info(f"[{job.job_id}] Step 1: Uploading PDFs to Gemini File API...")
        from pdf_parser import parse_multiple_pdfs
        parsed = parse_multiple_pdfs(pdf_paths)
        company_name = parsed["company_name"]
        job.company_name = company_name
        job.parsed_text = parsed.get("full_text", "")
        job.gemini_files = parsed.get("gemini_files", [])
        logger.info(f"[{job.job_id}] Step 1 DONE: {company_name} | {len(job.gemini_files)} files uploaded")
        job.add_progress("parse", f"✅ Detected: {company_name} | {len(job.gemini_files)} documents uploaded", done=True)

        # Step 2: Web Research
        job.add_progress("web", f"🌐 Researching {company_name} online...")
        logger.info(f"[{job.job_id}] Step 2: Web research for {company_name}...")
        from web_scraper import scrape_company_info, search_competitors
        company_web = scrape_company_info(company_name)
        competitor_web = search_competitors(company_name)
        web_msg = f"✅ Website: {company_web.get('website_url', 'Not found')} | {len(competitor_web)} competitors found"
        logger.info(f"[{job.job_id}] Step 2 DONE: {web_msg}")
        job.add_progress("web", web_msg, done=True)

        # Step 3: Extract financial figures (multi-year)
        job.add_progress("extract", "🤖 Extracting financial figures utilizing Native File API...")
        logger.info(f"[{job.job_id}] Step 3: AI extraction with {len(job.gemini_files)} file refs...")
        from analyzer import extract_financial_figures, _get_multi_year_financials
        raw_financials = extract_financial_figures(job.gemini_files)
        financials = _get_multi_year_financials(raw_financials)
        job.extracted_financials = financials
        years = financials.get("years_found", [])
        logger.info(f"[{job.job_id}] Step 3 DONE: {len(years)} years extracted: {years}")
        job.add_progress("extract", f"✅ Extracted financials for {len(years)} year(s): {', '.join(years)}", done=True)

        # Step 4: Company background
        job.add_progress("background", "🤖 Analyzing company background...")
        logger.info(f"[{job.job_id}] Step 4: Company background analysis...")
        from analyzer import analyze_company_background
        background = analyze_company_background(company_name, job.gemini_files, company_web.get("raw_data", ""))
        job.background = background
        logger.info(f"[{job.job_id}] Step 4 DONE: Background complete")
        job.add_progress("background", "✅ Company background complete", done=True)

        # Step 5: Competitor analysis
        job.add_progress("competitors", "🤖 Analyzing competitors...")
        logger.info(f"[{job.job_id}] Step 5: Competitor analysis...")
        from analyzer import analyze_competitors
        industry = background.get("industry", "Unknown")
        competitors = analyze_competitors(company_name, industry, competitor_web)
        job.competitors = competitors
        logger.info(f"[{job.job_id}] Step 5 DONE: Competitor analysis complete")
        job.add_progress("competitors", "✅ Competitor analysis complete", done=True)

        # HALT AT VALIDATION
        job.add_progress("validate", "⏳ Waiting for human validation of financial data...")
        job.status = "waiting_for_user"
        logger.info(f"[{job.job_id}] Pipeline paused — waiting for user validation")

    except Exception as e:
        logger.error(f"[{job.job_id}] EXTRACTION PIPELINE FAILED: {e}", exc_info=True)
        job.error = str(e)
        job.status = "failed"
        job.add_progress("error", f"❌ Error: {str(e)}", done=True)
    finally:
        _cleanup_local_uploads(pdf_paths)

def run_downstream_pipeline(job: AnalysisJob):
    """Resume pipeline after user approves the financials."""
    try:
        from analyzer import _compute_multi_year_ratios, _compute_growth_metrics
        financials = job.extracted_financials
        company_name = job.company_name
        background = job.background
        competitors = job.competitors
        years = financials.get("years_found", [])

        # Step 6: Calculate ratios (multi-year)
        job.add_progress("ratios", "📊 Calculating financial ratios...")
        computed_ratios = _compute_multi_year_ratios(financials)
        growth_metrics = _compute_growth_metrics(financials)
        growth_msg = ""
        if growth_metrics:
            growth_msg = f" | Revenue growth: {growth_metrics.get('revenue_growth', 'N/A')}"
        job.add_progress("ratios", f"✅ Ratios calculated for {len(years)} year(s){growth_msg}", done=True)

        # Step 7: Financial analysis
        job.add_progress("financial", "🤖 Deep financial analysis...")
        from analyzer import analyze_financials
        financial_analysis = analyze_financials(company_name, getattr(job, "gemini_files", []), financials, computed_ratios)
        job.add_progress("financial", "✅ Financial analysis complete", done=True)

        # Step 8: Risk assessment
        job.add_progress("risks", "🤖 Assessing risks & investment potential...")
        from analyzer import analyze_risks_and_pros
        risk_analysis = analyze_risks_and_pros(company_name, financial_analysis, competitors, computed_ratios, growth_metrics)
        job.add_progress("risks", "✅ Risk assessment complete", done=True)

        # Step 9: Recommendation
        job.add_progress("recommendation", "🤖 Generating investment recommendation...")
        from analyzer import generate_recommendation
        recommendation = generate_recommendation(
            company_name, financial_analysis, competitors, risk_analysis, computed_ratios, growth_metrics
        )
        verdict = recommendation.get("recommendation", "N/A")
        job.add_progress("recommendation", f"✅ Recommendation: {verdict}", done=True)

        # Step 10: Generate report
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
            "risk_analysis": risk_analysis,
            "recommendation": recommendation,
        }

        report_path = generate_report(analysis, output_dir=app.config["REPORTS_FOLDER"])
        job.add_progress("report", f"✅ Report saved", done=True)

        job.result = analysis
        job.report_path = report_path
        job.status = "completed"

        # Step 11: Save to Supabase (if user is authenticated)
        if job.user_id:
            job.add_progress("save", "💾 Saving to your profile...")
            from supabase_client import save_analysis, upload_report_file

            storage_path = None
            if report_path and os.path.exists(report_path):
                storage_path = upload_report_file(job.user_id, job.job_id, report_path)

            save_analysis(
                user_id=job.user_id,
                company_name=company_name,
                job_id=job.job_id,
                analysis_data=analysis,
                filenames=job.filenames,
                report_storage_path=storage_path,
            )
            job.add_progress("save", "✅ Saved to your profile", done=True)

    except Exception as e:
        job.error = str(e)
        job.status = "failed"
        job.add_progress("error", f"❌ Error: {str(e)}", done=True)
        import traceback
        traceback.print_exc()
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

    # Enforce per-user AI rate limit
    allowed, reason = rate_limiter.check(user_id)
    if not allowed:
        return jsonify({"error": reason}), 429

    job_id = str(uuid.uuid4())[:8]
    pdf_paths = []
    filenames = []

    for f in files:
        if f.filename and f.filename.lower().endswith(".pdf"):
            safe_name = f"{job_id}_{f.filename}"
            path = os.path.join(app.config["UPLOAD_FOLDER"], safe_name)
            f.save(path)
            pdf_paths.append(path)
            filenames.append(f.filename)

    if not pdf_paths:
        return jsonify({"error": "No valid PDF files found"}), 400

    job = AnalysisJob(job_id, filenames, user_id=user_id)
    _jobs[job_id] = job

    rate_limiter.record(user_id)

    thread = threading.Thread(target=run_extraction_pipeline, args=(job, pdf_paths))
    thread.daemon = True
    thread.start()

    return jsonify({"job_id": job_id})

@app.route("/api/approve_financials/<job_id>", methods=["POST"])
def approve_financials(job_id):
    job = _jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    verified_financials = request.json.get("financials")
    if not verified_financials:
        return jsonify({"error": "No financials payload provided"}), 400

    job.extracted_financials = verified_financials
    job.status = "resuming"
    job.add_progress("validate", "✅ Human validation complete", done=True)

    thread = threading.Thread(target=run_downstream_pipeline, args=(job,))
    thread.daemon = True
    thread.start()
    
    return jsonify({"status": "resuming"})

@app.route("/api/flag_for_review/<job_id>", methods=["POST"])
def flag_for_review(job_id):
    job = _jobs.get(job_id)
    if not job: return jsonify({"error": "Job not found"}), 404
    job.status = "failed"
    job.error = "Flagged for manual review by human analyst."
    job.add_progress("validate", "🛑 Flagged for manual review", done=True)
    return jsonify({"status": "failed"})


@app.route("/api/progress/<job_id>")
def progress(job_id):
    """SSE endpoint for real-time progress updates."""
    def generate():
        job = _jobs.get(job_id)
        if not job:
            yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
            return

        seen = 0
        heartbeat_interval = 15  # Send heartbeat every 15s to prevent proxy timeout
        last_heartbeat = time.time()
        max_wait = 600  # 10 min max SSE session
        start_time = time.time()

        while True:
            if time.time() - start_time > max_wait:
                yield f"data: {json.dumps({'step': 'timeout', 'message': 'SSE session timed out', 'done': True})}\n\n"
                return

            if len(job.progress) > seen:
                for event in job.progress[seen:]:
                    yield f"data: {json.dumps(event)}\n\n"
                seen = len(job.progress)
                last_heartbeat = time.time()

            if job.status == "waiting_for_user":
                yield f"data: {json.dumps({'step': 'waiting_for_user', 'status': job.status, 'done': True})}\n\n"
                return

            if job.status in ("completed", "failed"):
                yield f"data: {json.dumps({'step': 'done', 'status': job.status, 'done': True})}\n\n"
                return

            # Send heartbeat to keep connection alive through Render's proxy
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
    job = _jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job.to_dict())


@app.route("/api/download/<job_id>")
def download(job_id):
    """Download the generated DOCX report."""
    job = _jobs.get(job_id)
    if not job or not job.report_path:
        return jsonify({"error": "Report not available"}), 404
    return send_file(job.report_path, as_attachment=True, download_name=os.path.basename(job.report_path))


@app.route("/api/email/<job_id>", methods=["POST"])
def send_email(job_id):
    """Send the report via email."""
    job = _jobs.get(job_id)
    if not job or not job.result:
        return jsonify({"error": "Analysis not complete"}), 400

    data = request.get_json()
    email = data.get("email", "").strip()
    if not email:
        return jsonify({"error": "Email is required"}), 400

    from email_sender import send_report_email
    rec = job.result.get("recommendation", {})
    summary = job.result.get("financial_analysis", {}).get("executive_summary", "")

    success = send_report_email(
        to_email=email,
        company_name=job.result.get("company_name", "Unknown"),
        report_path=job.report_path,
        analysis_summary=summary,
        recommendation=rec.get("recommendation", ""),
    )

    if success:
        return jsonify({"ok": True, "message": f"Report sent to {email}"})
    return jsonify({"error": "Failed to send email. Check SMTP settings."}), 500


@app.route("/api/save/<job_id>", methods=["POST"])
@require_auth
def manual_save_analysis(job_id):
    """Manually persist the analysis into Supabase history."""
    job = _jobs.get(job_id)
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
    """Delete an analysis by its Supabase ID."""
    from supabase_client import delete_analysis
    success = delete_analysis(analysis_id, g.user["id"])
    if success:
        return jsonify({"ok": True})
    return jsonify({"error": "Failed to delete"}), 500


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
    app.run(debug=True, port=5000, threaded=True, use_reloader=False)
