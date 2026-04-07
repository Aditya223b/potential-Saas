"""
Configuration loader — reads .env and provides typed access to all settings.
"""

import os
from dotenv import load_dotenv

# Load .env from the same directory as this file
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def _require(key: str) -> str:
    """Return env var or warn — never crash on import so the health endpoint stays alive."""
    val = os.getenv(key, "").strip()
    if not val:
        print(f"⚠️  Missing environment variable: {key} — set it in Railway Variables tab.")
    return val


def _get(key: str, default: str = "") -> str:
    """Return env var or default (no crash)."""
    return os.getenv(key, default).strip()


# ── Google Gemini AI ──────────────────────────────────────────────────────────
GEMINI_API_KEY: str = _require("GEMINI_API_KEY")

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL: str = _require("SUPABASE_URL")
SUPABASE_KEY: str = _require("SUPABASE_KEY")
SUPABASE_SERVICE_KEY: str = _require("SUPABASE_SERVICE_KEY")

# ── Rate Limiting ─────────────────────────────────────────────────────────────
# Max AI analyses per authenticated user. Adjust in .env to suit your budget.
RATE_LIMIT_PER_HOUR: int = int(_get("RATE_LIMIT_PER_HOUR", "5"))
RATE_LIMIT_PER_DAY:  int = int(_get("RATE_LIMIT_PER_DAY",  "20"))

# ── Gmail SMTP (lazy — only validated when email is actually sent) ────────────
SMTP_HOST: str = _get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT: int = int(_get("SMTP_PORT", "587") or "587")


def get_smtp_credentials() -> tuple[str, str]:
    """Return (email, app_password). Raises RuntimeError if not configured."""
    email = _get("SMTP_EMAIL")
    password = _get("SMTP_APP_PASSWORD")
    if not email or not password:
        raise RuntimeError("Email sending requires SMTP_EMAIL and SMTP_APP_PASSWORD env vars.")
    return email, password

