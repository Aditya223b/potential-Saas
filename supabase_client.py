"""
Supabase Client — Handles auth verification, analysis storage,
and report file management via Supabase.
"""

import os
import json
from datetime import datetime
from config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY
from supabase import create_client, Client

# Lazy clients — only initialized when first used, so a missing env var
# doesn't crash the app at import time (prevents Railway startup failures)
_supabase: Client | None = None
_supabase_admin: Client | None = None


def _get_client() -> Client:
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY env vars are required")
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


def _get_admin_client() -> Client:
    global _supabase_admin
    if _supabase_admin is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required")
        _supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase_admin


def get_supabase() -> Client:
    """Return the Supabase client instance."""
    return _get_client()


# ── Job Persistence ───────────────────────────────────────────────────────────
# These functions persist analysis job state to the `jobs` table so jobs
# survive container restarts on Railway.

def create_job(job_id: str, user_id: str | None, filenames: list[str]) -> bool:
    """Insert a new job row when analysis starts."""
    try:
        _get_admin_client().table("jobs").insert({
            "job_id": job_id,
            "user_id": user_id,
            "status": "pending",
            "progress": [],
            "filenames": filenames,
        }).execute()
        return True
    except Exception as e:
        print(f"⚠️  create_job failed: {e}")
        return False


def update_job(job_id: str, **fields) -> bool:
    """Upsert job state — inserts if the row doesn't exist yet, updates otherwise."""
    try:
        row = {"job_id": job_id, **fields}
        _get_admin_client().table("jobs").upsert(row, on_conflict="job_id").execute()
        return True
    except Exception as e:
        print(f"⚠️  update_job failed: {e}")
        return False


def get_job(job_id: str) -> dict | None:
    """Fetch a job row by ID. Returns None if not found."""
    try:
        result = (
            _get_admin_client().table("jobs")
            .select("*")
            .eq("job_id", job_id)
            .single()
            .execute()
        )
        return result.data
    except Exception as e:
        print(f"⚠️  get_job failed: {e}")
        return None


def delete_job(job_id: str) -> bool:
    """Delete a job row (called after results are fetched to keep table clean)."""
    try:
        _get_admin_client().table("jobs").delete().eq("job_id", job_id).execute()
        return True
    except Exception as e:
        print(f"⚠️  delete_job failed: {e}")
        return False


def get_user_jobs(user_id: str) -> list[dict]:
    """
    Fetch all in-progress jobs for a user — statuses that indicate work
    is still underway (not completed or failed).
    Returns lightweight rows (no heavy blobs like extracted_financials).
    """
    try:
        result = (
            _get_admin_client().table("jobs")
            .select("job_id, user_id, status, company_name, filenames, created_at")
            .eq("user_id", user_id)
            .in_("status", ["pending", "running", "awaiting_projection", "waiting_for_user", "resuming"])
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        return result.data or []
    except Exception as e:
        print(f"⚠️  get_user_jobs failed: {e}")
        return []


def verify_user_token(token: str) -> dict | None:
    """
    Verify a Supabase JWT access token and return the user info.
    Returns None if invalid.
    """
    try:
        res = _get_client().auth.get_user(token)
        if res and res.user:
            return {
                "id": str(res.user.id),
                "email": res.user.email,
                "created_at": str(res.user.created_at) if res.user.created_at else None,
            }
    except Exception as e:
        print(f"  ⚠️  Token verification failed: {e}")
    return None


def save_analysis(
    user_id: str,
    company_name: str,
    job_id: str,
    analysis_data: dict,
    filenames: list[str],
    report_storage_path: str | None = None,
) -> dict | None:
    """
    Save a completed analysis to the Supabase `analyses` table.
    Uses the service-level insert (the user_id field satisfies RLS).
    """
    try:
        rec = analysis_data.get("recommendation", {})
        row = {
            "user_id": user_id,
            "company_name": company_name,
            "job_id": job_id,
            "analysis_data": analysis_data,
            "recommendation": rec.get("recommendation", "N/A") if isinstance(rec, dict) else str(rec),
            "confidence": rec.get("confidence_level", "N/A") if isinstance(rec, dict) else "N/A",
            "report_storage_path": report_storage_path,
            "filenames": filenames,
        }

        result = _get_admin_client().table("analyses").insert(row).execute()

        if result.data and len(result.data) > 0:
            print(f"  ✅ Analysis saved to Supabase (id: {result.data[0].get('id', '?')})")
            return result.data[0]
        return None

    except Exception as e:
        print(f"  ⚠️  Failed to save analysis to Supabase: {e}")
        return None


def get_user_analyses(user_id: str, limit: int = 50) -> list[dict]:
    """
    Fetch all ACTIVE (non-deleted) analyses for a user, newest first.
    """
    try:
        result = (
            _get_admin_client().table("analyses")
            .select("id, company_name, job_id, recommendation, confidence, filenames, created_at")
            .eq("user_id", user_id)
            .eq("is_deleted", False)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        print(f"  ⚠️  Failed to fetch analyses: {e}")
        return []


def soft_delete_analysis(analysis_id: str, user_id: str) -> bool:
    """Move an analysis to the Bin (soft-delete). It can be restored later."""
    try:
        from datetime import timezone
        import datetime
        _get_admin_client().table("analyses").update({
            "is_deleted": True,
            "deleted_at": datetime.datetime.now(timezone.utc).isoformat(),
        }).eq("id", analysis_id).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        print(f"  ⚠️  soft_delete_analysis failed: {e}")
        return False


def restore_analysis(analysis_id: str, user_id: str) -> bool:
    """Restore a soft-deleted analysis from the Bin."""
    try:
        _get_admin_client().table("analyses").update({
            "is_deleted": False,
            "deleted_at": None,
        }).eq("id", analysis_id).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        print(f"  ⚠️  restore_analysis failed: {e}")
        return False


def get_bin_analyses(user_id: str, limit: int = 50) -> list[dict]:
    """Fetch analyses that are in the Bin (soft-deleted), newest first."""
    try:
        result = (
            _get_admin_client().table("analyses")
            .select("id, company_name, job_id, recommendation, confidence, filenames, created_at, deleted_at")
            .eq("user_id", user_id)
            .eq("is_deleted", True)
            .order("deleted_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        print(f"  ⚠️  get_bin_analyses failed: {e}")
        return []


def get_analysis(analysis_id: str, user_id: str) -> dict | None:
    """
    Fetch a single analysis by ID. RLS ensures user ownership.
    Returns the full analysis including analysis_data.
    """
    try:
        result = (
            _get_admin_client().table("analyses")
            .select("*")
            .eq("id", analysis_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return result.data
    except Exception as e:
        print(f"  ⚠️  Failed to fetch analysis {analysis_id}: {e}")
        return None


def upload_report_file(user_id: str, job_id: str, file_path: str) -> str | None:
    """
    Upload a DOCX report file to Supabase Storage.
    Returns the storage path on success, None on failure.
    """
    try:
        storage_path = f"{user_id}/{job_id}.docx"

        with open(file_path, "rb") as f:
            _get_admin_client().storage.from_("reports").upload(
                path=storage_path,
                file=f,
                file_options={"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
            )

        print(f"  ✅ Report uploaded to Supabase Storage: {storage_path}")
        return storage_path

    except Exception as e:
        print(f"  ⚠️  Failed to upload report: {e}")
        return None


def get_report_download_url(storage_path: str, expires_in: int = 3600) -> str | None:
    """
    Generate a signed URL for downloading a report from Supabase Storage.
    Default expiry: 1 hour.
    """
    try:
        result = _get_admin_client().storage.from_("reports").create_signed_url(
            path=storage_path,
            expires_in=expires_in,
        )
        return result.get("signedURL") or result.get("signedUrl")
    except Exception as e:
        print(f"  ⚠️  Failed to generate download URL: {e}")
        return None


def delete_analysis(analysis_id: str, user_id: str) -> bool:
    """Delete an analysis by ID (RLS enforced)."""
    try:
        _get_admin_client().table("analyses").delete().eq("id", analysis_id).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        print(f"  ⚠️  Failed to delete analysis: {e}")
        return False


def download_report_file(storage_path: str) -> bytes | None:
    """
    Download a DOCX report file from Supabase Storage.
    Returns the raw bytes on success, None on failure.
    Used by the email endpoint to attach the report across Railway containers.
    """
    try:
        data = _get_admin_client().storage.from_("reports").download(storage_path)
        print(f"  ✅ Report downloaded from Supabase Storage: {storage_path} ({len(data)} bytes)")
        return data
    except Exception as e:
        print(f"  ⚠️  Failed to download report from Storage: {e}")
        return None

