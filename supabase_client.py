"""
Supabase Client — Handles auth verification, analysis storage,
and report file management via Supabase.
"""

import os
import json
from datetime import datetime
from config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY
from supabase import create_client, Client

# Anon client — used only for auth token verification
_supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
# Service role client — bypasses RLS for all backend DB/storage operations
_supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_supabase() -> Client:
    """Return the Supabase client instance."""
    return _supabase


def verify_user_token(token: str) -> dict | None:
    """
    Verify a Supabase JWT access token and return the user info.
    Returns None if invalid.
    """
    try:
        res = _supabase.auth.get_user(token)
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

        result = _supabase_admin.table("analyses").insert(row).execute()

        if result.data and len(result.data) > 0:
            print(f"  ✅ Analysis saved to Supabase (id: {result.data[0].get('id', '?')})")
            return result.data[0]
        return None

    except Exception as e:
        print(f"  ⚠️  Failed to save analysis to Supabase: {e}")
        return None


def get_user_analyses(user_id: str, limit: int = 50) -> list[dict]:
    """
    Fetch all analyses belonging to a user, ordered by most recent first.
    Returns a lightweight list (no full analysis_data blob to keep it fast).
    """
    try:
        result = (
            _supabase_admin.table("analyses")
            .select("id, company_name, job_id, recommendation, confidence, filenames, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        print(f"  ⚠️  Failed to fetch analyses: {e}")
        return []


def get_analysis(analysis_id: str, user_id: str) -> dict | None:
    """
    Fetch a single analysis by ID. RLS ensures user ownership.
    Returns the full analysis including analysis_data.
    """
    try:
        result = (
            _supabase_admin.table("analyses")
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
            _supabase_admin.storage.from_("reports").upload(
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
        result = _supabase_admin.storage.from_("reports").create_signed_url(
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
        _supabase_admin.table("analyses").delete().eq("id", analysis_id).eq("user_id", user_id).execute()
        return True
    except Exception as e:
        print(f"  ⚠️  Failed to delete analysis: {e}")
        return False
