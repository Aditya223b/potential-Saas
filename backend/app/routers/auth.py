from fastapi import APIRouter, Depends
from backend.app.schemas import ConfigResponse, UserResponse
from backend.app.dependencies import get_current_user
import config

router = APIRouter(prefix="/api", tags=["auth"])

@router.get("/config", response_model=ConfigResponse)
def client_config():
    """Serve publishable client configuration (Supabase URL + anon key)."""
    return ConfigResponse(
        supabase_url=config.SUPABASE_URL,
        supabase_key=config.SUPABASE_KEY
    )

@router.get("/me", response_model=UserResponse)
def me(user: dict = Depends(get_current_user)):
    """Return the current authenticated user's info."""
    return UserResponse(user=user)
