import os
import json
import uuid
import time
import base64
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form, Query
from fastapi.responses import StreamingResponse, Response, FileResponse

from backend.app.dependencies import get_current_user, get_optional_user
from backend.app.schemas import ApproveFinancialsRequest, UpdateFinancialsRequest, EmailJobRequest
from backend.app.utils.sse import generate_progress_stream
import app  # import from the root Flask app.py module for the actual pipeline functions/logic
from app import AnalysisJob, get_job_object, redis_conn, q, _looks_like_pdf, _truncate_words

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["jobs"])

def _verify_job_owner(job_id: str, user_id: Optional[str]):
    job = get_job_object(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.user_id and job.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return job

@router.post("/upload")
async def upload(
    pdfs: List[UploadFile] = File(...),
    company: str = Form(""),
    company_website: str = Form(""),
    company_context: str = Form(""),
    email: str = Form(""),
    user: Optional[dict] = Depends(get_optional_user)
):
    """Upload PDFs and start analysis. Auth is optional but enables saving."""
    if not pdfs or all(f.filename == "" for f in pdfs):
        raise HTTPException(status_code=400, detail="No files uploaded")

    user_id = user["id"] if user else None
    preferred_company_name = company.strip()
    company_website = company_website.strip()
    truncated_context = _truncate_words(company_context.strip(), 300)

    # Enforce per-user AI rate limit
    from rate_limiter import rate_limiter
    allowed, reason = rate_limiter.check(user_id)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)

    job_id = str(uuid.uuid4())
    pdf_bytes_list = []
    filenames = []

    for f in pdfs:
        if not (f.filename and f.filename.lower().endswith(".pdf")):
            continue
        blob = await f.read()
        if not _looks_like_pdf(blob):
            raise HTTPException(status_code=400, detail=f"{f.filename}: not a valid PDF")
        pdf_bytes_list.append(blob)
        filenames.append(f.filename)

    if not pdf_bytes_list:
        raise HTTPException(status_code=400, detail="No valid PDF files found")

    job = AnalysisJob(job_id, filenames, user_id=user_id)
    job.email = email.strip()
    
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
        truncated_context,
        job_timeout=3600,
    )

    return {"job_id": job_id}

@router.post("/approve_financials/{job_id}")
def approve_financials(job_id: str, payload: ApproveFinancialsRequest, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])

    job.extracted_financials = payload.financials
    job.add_progress("validate", "✅ Human validation complete", done=True)
    job.set_status("resuming")

    q.enqueue("app.run_downstream_pipeline", job, job_timeout=3600)
    
    return {"status": "resuming"}

@router.post("/upload_projection/{job_id}")
async def upload_projection(
    job_id: str,
    projection_files: List[UploadFile] = File(...),
    user: dict = Depends(get_current_user)
):
    """Upload company projection documents before analyst verification."""
    job = _verify_job_owner(job_id, user["id"])

    if not projection_files or all(f.filename == "" for f in projection_files):
        raise HTTPException(status_code=400, detail="No projection files uploaded")

    projection_paths = []
    projection_names = []

    try:
        from werkzeug.utils import secure_filename
        for f in projection_files:
            if not f.filename:
                continue
            base = secure_filename(f.filename) or "projection.bin"
            # save to reports folder or temp folder
            upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
            os.makedirs(upload_dir, exist_ok=True)
            path = os.path.realpath(os.path.join(upload_dir, base))
            
            blob = await f.read()
            with open(path, "wb") as pf:
                pf.write(blob)
            projection_paths.append(path)
            projection_names.append(f.filename)

        job.projection_filenames = projection_names
        job.add_progress("projection_upload", f"✅ Uploaded {len(projection_names)} projection files", done=True)
        job.set_status("running")
        
        q.enqueue(
            "app.run_projection_and_downstream_pipeline",
            job,
            projection_paths,
            job_timeout=3600
        )
        return {"status": "running"}
    except Exception as e:
        logger.error(f"[{job_id}] Projection upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/skip_projection/{job_id}")
def skip_projection(job_id: str, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])
    job.add_progress("projection_upload", "⏭️ Projections skipped by analyst", done=True)
    job.set_status("running")
    q.enqueue("app.run_projection_and_downstream_pipeline", job, [], job_timeout=3600)
    return {"status": "running"}

@router.post("/restart_job/{job_id}")
def restart_job(job_id: str, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])
    job.progress = []
    job.add_progress("pending", "🔄 Restarting extraction job...", done=False)
    job.set_status("pending")

    # Re-run requires original PDFs. Since we don't save PDF bytes in redis state,
    # we expect the client to trigger /upload again for a full restart.
    # However, this endpoint resets status so user can trigger it.
    return {"status": "pending"}

@router.post("/flag_for_review/{job_id}")
def flag_for_review(job_id: str, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])
    job.add_progress("validate", "🛑 Flagged for manual review", done=True)
    job.set_status("failed")
    return {"status": "failed"}

@router.get("/progress/{job_id}")
def progress(job_id: str):
    """SSE endpoint for real-time progress updates."""
    return StreamingResponse(
        generate_progress_stream(job_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

@router.get("/result/{job_id}")
def result(job_id: str, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])
    return job.to_dict()

@router.get("/source-preview/{job_id}")
def source_preview(
    job_id: str,
    year: str = Query(""),
    field: str = Query(""),
    user: dict = Depends(get_current_user)
):
    job = _verify_job_owner(job_id, user["id"])

    preview = ((job.source_previews or {}).get(year, {}) or {}).get(field)
    source = ((job.extraction_sources or {}).get(year, {}) or {}).get(field)

    page_number = int((preview or source or {}).get("page_number") or 1)
    source_file = (preview or source or {}).get("source_file", "")
    excerpt = (preview or source or {}).get("excerpt", "")

    image_data_url = None
    if preview and preview.get("image_base64"):
        image_data_url = f"data:image/png;base64,{preview['image_base64']}"

    if not image_data_url:
        try:
            gemini_files = getattr(job, "gemini_files", [])
            n_proj = len(getattr(job, "projection_filenames", []))
            hist_refs = gemini_files[:-n_proj] if n_proj else gemini_files

            if hist_refs:
                from google import genai as _genai
                from config import GEMINI_API_KEY
                _gclient = _genai.Client(api_key=GEMINI_API_KEY)

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
                    for part in (response.candidates[0].content.parts if response.candidates else []):
                        if hasattr(part, "inline_data") and part.inline_data:
                            img_b64 = base64.b64encode(part.inline_data.data).decode("ascii")
                            image_data_url = f"data:{part.inline_data.mime_type};base64,{img_b64}"
                            if preview is not None:
                                preview["image_base64"] = img_b64
                            break
        except Exception as _img_err:
            logger.warning(f"[{job_id}] On-demand image generation failed: {_img_err}")

    if not preview and not source:
        raise HTTPException(status_code=404, detail="Source preview not available")

    return {
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
    }

@router.get("/source-image/{job_id}")
def source_image(
    job_id: str,
    year: str = Query(""),
    field: str = Query(""),
    user: dict = Depends(get_current_user)
):
    job = _verify_job_owner(job_id, user["id"])

    preview = ((job.source_previews or {}).get(year, {}) or {}).get(field)
    image_base64 = (preview or {}).get("image_base64")
    if image_base64:
        return Response(base64.b64decode(image_base64), media_type="image/png")

    image_path = (preview or {}).get("image_path")
    if not image_path or not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Source image not available")

    return FileResponse(image_path, media_type="image/png")

@router.get("/download/{job_id}")
def download(job_id: str, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])
    if not job.report_path or not os.path.exists(job.report_path):
        raise HTTPException(status_code=404, detail="Report not available")
    return FileResponse(job.report_path, filename=os.path.basename(job.report_path))

@router.post("/email/{job_id}")
def email_job(job_id: str, payload: EmailJobRequest, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])
    email = payload.email.strip().lower()
    if email != user.get("email", "").lower():
        raise HTTPException(status_code=403, detail="Recipient must match your account email")

    analysis_data = None
    company_name = "Unknown"
    report_path_to_use = job.report_path
    storage_path = None
    recommendation = ""
    summary = ""

    if job.result:
        analysis_data = job.result
        company_name = job.result.get("company_name", "Unknown")
        storage_path = job.result.get("_report_storage_path") or (
            f"{job.user_id}/{job.job_id}.docx" if job.user_id else None
        )
        rec = job.result.get("recommendation", {})
        recommendation = rec.get("recommendation", "") if isinstance(rec, dict) else str(rec)
        summary = job.result.get("financial_analysis", {}).get("executive_summary", "")
    else:
        try:
            from supabase_client import _get_admin_client
            query = _get_admin_client().table("analyses").select("*").eq("user_id", user["id"])
            try:
                import uuid; uuid.UUID(job_id); query = query.eq("id", job_id)
            except ValueError:
                query = query.eq("job_id", job_id)
            res = query.order("created_at", desc=True).limit(1).execute()
            hist_data = res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"[{job_id}] Fallback query failed: {e}")
            hist_data = None

        if hist_data:
            analysis_data = hist_data.get("analysis_data", {})
            company_name = hist_data.get("company_name", "Unknown")
            storage_path = hist_data.get("report_storage_path")
            rec = hist_data.get("recommendation", {})
            recommendation = rec.get("recommendation", "N/A") if isinstance(rec, dict) else str(rec)
            summary = analysis_data.get("financial_analysis", {}).get("executive_summary", "")

    if not analysis_data:
        raise HTTPException(status_code=400, detail="Analysis not complete or not found (Redis expired, no save found)")

    import tempfile
    tmp_report_path = None

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
        if tmp_report_path and os.path.exists(tmp_report_path):
            try:
                os.remove(tmp_report_path)
            except Exception:
                pass

    if success:
        return {"ok": True, "message": f"Report sent to {email}"}
    raise HTTPException(status_code=500, detail=error_reason or "Failed to send email. Check SMTP settings.")

@router.post("/save/{job_id}")
def manual_save_analysis(job_id: str, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])
    if not job.result:
        raise HTTPException(status_code=404, detail="Analysis result not found or not complete.")

    from supabase_client import save_analysis
    try:
        result = save_analysis(
            user_id=user["id"],
            company_name=job.result.get("company_name", "Unknown"),
            job_id=job.job_id,
            analysis_data=job.result,
            filenames=job.filenames,
            report_storage_path=job.report_path,
        )
        if not result:
            raise HTTPException(status_code=500, detail="Failed to save to database.")
        return {"ok": True, "analysis_id": result.get("id")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save to database: {str(e)}")

@router.get("/rate-limit-status")
def rate_limit_status(user: dict = Depends(get_current_user)):
    from rate_limiter import rate_limiter
    return rate_limiter.status(user["id"])

@router.get("/my-jobs")
def my_jobs(user: dict = Depends(get_current_user)):
    from supabase_client import get_user_jobs
    jobs = get_user_jobs(user["id"])
    active_jobs = []
    
    for j in jobs:
        cached = redis_conn.get(f"job_state:{j['job_id']}")
        if cached:
            try:
                parsed = json.loads(cached)
                if parsed.get("status") in ("completed", "failed"):
                    continue
                j.update(parsed)
            except json.JSONDecodeError:
                pass
        active_jobs.append(j)
        
    return {"jobs": active_jobs}

@router.post("/jobs/{job_id}/stop")
def stop_job(job_id: str, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])
    job.add_progress("error", "🛑 Analysis stopped by user.", done=True)
    job.set_status("failed")
    return {"ok": True}

@router.delete("/jobs/{job_id}")
def delete_job_route(job_id: str, user: dict = Depends(get_current_user)):
    job = _verify_job_owner(job_id, user["id"])
    try:
        redis_conn.delete(f"job_state:{job_id}")
    except Exception as e:
        logger.warning(f"Redis delete failed for job {job_id}: {e}")

    from supabase_client import delete_job
    delete_job(job_id)
    return {"ok": True}

@router.patch("/update-financials/{identifier}")
def update_financials(identifier: str, payload: UpdateFinancialsRequest, user: dict = Depends(get_current_user)):
    updated_financials = payload.financials
    user_id = user["id"]

    job = get_job_object(identifier)
    if job and job.result:
        if job.user_id and job.user_id != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        job.result["financials"] = updated_financials
        job._persist_async()
        logger.info(f"[{identifier}] Financials updated in Redis job")
        return {"ok": True, "source": "redis"}

    from supabase_client import get_analysis, update_analysis_data
    analysis = get_analysis(identifier, user_id)
    if analysis:
        analysis_data = analysis.get("analysis_data", {})
        analysis_data["financials"] = updated_financials
        success = update_analysis_data(identifier, user_id, analysis_data)
        if success:
            logger.info(f"[{identifier}] Financials updated in Supabase analysis")
            return {"ok": True, "source": "supabase"}

    raise HTTPException(status_code=404, detail="Analysis not found")
