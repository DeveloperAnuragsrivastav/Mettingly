"""
FastAPI authentication dependencies for Platform Admins.
"""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import verify_supabase_jwt
from app.auth.platform_lookup import lookup_platform_admin_by_auth_user_id
from app.config import Settings, get_settings
from app.models.platform import PlatformAdmin
from app.services.supabase import get_supabase_client

_bearer_scheme = HTTPBearer()


async def get_current_platform_admin(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> PlatformAdmin:
    """
    Core authentication dependency for Platform Admins.

    Pipeline:
        1. Extract Bearer token from the Authorization header.
        2. Verify the token as a Supabase-issued JWT (HS256).
        3. Extract ``sub`` claim → ``auth_user_id``.
        4. Query ``platform_admins`` table for a matching, non-deleted row.
        5. Return a :class:`PlatformAdmin` instance.

    Raises:
        HTTPException 401: Token missing, expired, or invalid.
        HTTPException 403: No matching platform admin row or account inactive.
    """
    # Step 1 — JWT verification
    auth_user_id = verify_supabase_jwt(
        token=credentials.credentials,
        jwt_secret=settings.SUPABASE_JWT_SECRET,
    )

    # Step 2 — DB lookup (uses service_role client to bypass RLS for lookups, or relies on it if appropriate. 
    # Since we need to get their identity, the service client is safest to guarantee read.)
    supabase = get_supabase_client()
    platform_admin = lookup_platform_admin_by_auth_user_id(supabase, auth_user_id)

    return platform_admin
