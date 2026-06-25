"""
Supabase client initialization.

Uses the service_role key so backend queries bypass RLS.
Authorization is enforced in the FastAPI layer instead.
"""

from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase_client() -> Client:
    """
    Return a cached Supabase client instance.

    The client is created once with the service_role key and reused
    for all subsequent calls.
    """
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
