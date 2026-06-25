"""
Application settings loaded from environment variables.

Uses Pydantic BaseSettings with optional .env file support.
All values are required — the app will fail to start if any are missing.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Required environment variables for the application."""

    # Supabase project URL (e.g., https://xyzcompany.supabase.co)
    SUPABASE_URL: str

    # Supabase service_role key — used for backend DB queries (bypasses RLS)
    SUPABASE_KEY: str

    # JWT secret used to verify Supabase Auth tokens (HS256)
    SUPABASE_JWT_SECRET: str

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
