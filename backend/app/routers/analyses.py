from fastapi import APIRouter, Depends, HTTPException, status
from backend.app.dependencies import get_current_user
import supabase_client

router = APIRouter(prefix="/api", tags=["analyses"])

@router.get("/my-analyses")
def my_analyses(user: dict = Depends(get_current_user)):
    """List all analyses for the authenticated user."""
    analyses = supabase_client.get_user_analyses(user["id"])
    return {"analyses": analyses}

@router.get("/my-analyses/{analysis_id}")
def my_analysis_detail(analysis_id: str, user: dict = Depends(get_current_user)):
    """Get a single analysis by its Supabase ID."""
    analysis = supabase_client.get_analysis(analysis_id, user["id"])
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {"analysis": analysis}

@router.delete("/my-analyses/{analysis_id}")
def delete_my_analysis(analysis_id: str, user: dict = Depends(get_current_user)):
    """Soft-delete (move to Bin). The analysis can still be restored."""
    success = supabase_client.soft_delete_analysis(analysis_id, user["id"])
    if success:
        return {"ok": True}
    raise HTTPException(status_code=500, detail="Failed to delete")

@router.post("/my-analyses/{analysis_id}/restore")
def restore_my_analysis(analysis_id: str, user: dict = Depends(get_current_user)):
    """Restore a soft-deleted analysis from the Bin."""
    success = supabase_client.restore_analysis(analysis_id, user["id"])
    if success:
        return {"ok": True}
    raise HTTPException(status_code=500, detail="Failed to restore")

@router.delete("/my-analyses/{analysis_id}/permanent")
def permanently_delete_analysis(analysis_id: str, user: dict = Depends(get_current_user)):
    """Permanently delete an analysis that is already in the Bin."""
    success = supabase_client.delete_analysis(analysis_id, user["id"])
    if success:
        return {"ok": True}
    raise HTTPException(status_code=500, detail="Failed to permanently delete")

@router.get("/bin")
def bin_analyses(user: dict = Depends(get_current_user)):
    """Return all soft-deleted analyses for the current user (the Bin)."""
    items = supabase_client.get_bin_analyses(user["id"])
    return {"analyses": items}

@router.get("/report-url/{analysis_id}")
def report_url(analysis_id: str, user: dict = Depends(get_current_user)):
    """Get a signed download URL for a stored report."""
    analysis = supabase_client.get_analysis(analysis_id, user["id"])
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    storage_path = analysis.get("report_storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="No report file stored")

    url = supabase_client.get_report_download_url(storage_path)
    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate download URL")

    return {"url": url}
