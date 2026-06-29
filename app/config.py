"""
Application settings loaded from environment variables.

Uses Pydantic BaseSettings with optional .env file support.
All values are required — the app will fail to start if any are missing.
"""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Required environment variables for the application."""

    # Supabase project URL (e.g., https://xyzcompany.supabase.co)
    SUPABASE_URL: str

    # Supabase service_role key — used for backend DB queries (bypasses RLS)
    SUPABASE_KEY: str

    # JWT secret used to verify Supabase Auth tokens (HS256)
    SUPABASE_JWT_SECRET: str

    # Google OAuth credentials
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str

    # Redirect URI registered in Google Cloud Console for the OAuth callback.
    # Must match the value configured in Google Cloud Console exactly.
    # e.g., "http://localhost:8000/calendar/callback" for local dev,
    #        "https://api.yourdomain.com/calendar/callback" for production.
    GOOGLE_REDIRECT_URI: str

    # SendGrid Configuration
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = ""

    # ── URL Configuration ────────────────────────────────────────────
    # Public URL where the React frontend is served.
    # Used to build manage-booking, reschedule, cancel, and onboarding links
    # inside transactional emails.
    # e.g., "http://localhost:5173" (local), "https://app.yourdomain.com" (prod)
    FRONTEND_URL: str = "http://localhost:5173"

    # Public URL where this FastAPI backend is served.
    # Included in .env.example for reference; currently used for
    # CORS origin validation and can be referenced explicitly if needed.
    # e.g., "http://localhost:8000" (local), "https://api.yourdomain.com" (prod)
    BACKEND_URL: str = "http://localhost:8000"

    # Comma-separated list of origins that the browser is allowed to send
    # cross-origin requests from.  Set to "*" only in local development.
    # Example: "http://localhost:5173,https://app.yourdomain.com"
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> List[str]:
        """Split CORS_ALLOWED_ORIGINS into a Python list for FastAPI middleware."""
        return [origin.strip() for origin in self.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance.

    Using lru_cache ensures the .env file is read only once and the same
    Settings object is reused across all requests. Also works as a FastAPI
    dependency via Depends(get_settings).
    """
    return Settings()
