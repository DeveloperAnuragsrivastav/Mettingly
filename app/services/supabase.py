"""
Supabase client initialization.

Uses the service_role key so backend queries bypass RLS.
Authorization is enforced in the FastAPI layer instead.
"""

from functools import lru_cache
import os
import logging
from supabase import create_client, Client
from app.config import get_settings

# Enable debug logging for httpx so we can see outgoing requests to Supabase REST API
logging.getLogger("httpx").setLevel(logging.DEBUG)


@lru_cache
def get_supabase_client() -> Client:
    """
    Return a cached Supabase client instance.

    The client is created once with the service_role key and reused
    for all subsequent calls.
    """
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
