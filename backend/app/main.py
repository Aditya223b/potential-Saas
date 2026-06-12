import os
import subprocess
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.routers import auth, jobs, analyses
from backend.app.schemas import HealthResponse

app = FastAPI(title="Financial Statement Analyzer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Set this to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(analyses.router)

# Dynamic Git SHA retrieval
def get_git_sha() -> str:
    # 1. Try environment variable (e.g. Railway)
    sha = os.environ.get("RAILWAY_GIT_COMMIT_SHA")
    if sha:
        return sha
    
    # 2. Try running git subprocess
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        return res.stdout.strip()
    except Exception:
        return "unknown"

@app.get("/api/health", response_model=HealthResponse)
def health():
    """System health check endpoint."""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        git_sha=get_git_sha()
    )

# Serve static frontend SPA build assets if index.html exists in templates
templates_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "templates")
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static")

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def read_index():
    index_path = os.path.join(templates_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "FinAnalyzer Backend is running. Frontend build not found."}
