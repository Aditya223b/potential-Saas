from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any

class ConfigResponse(BaseModel):
    supabase_url: str
    supabase_key: str

class UserInfo(BaseModel):
    id: str
    email: str
    created_at: Optional[str] = None

class UserResponse(BaseModel):
    user: UserInfo

class ApproveFinancialsRequest(BaseModel):
    financials: Dict[str, Any] = Field(..., description="The verified financials table data")

class UpdateFinancialsRequest(BaseModel):
    financials: Dict[str, Any] = Field(..., description="The updated financials table data")

class EmailJobRequest(BaseModel):
    email: str = Field(..., description="The recipient email address")

class HealthResponse(BaseModel):
    status: str
    version: str
    git_sha: str
