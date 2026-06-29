"""
JWT verification for Supabase Auth tokens.

This module is responsible ONLY for cryptographic token verification.
It does not touch the database — that concern belongs to member_lookup.py.
"""

import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from fastapi import HTTPException, status
from app.services.supabase import get_supabase_client


def verify_supabase_jwt(token: str, jwt_secret: str) -> str:
    """
    Verify a Supabase-issued JWT by calling the Supabase Auth API.
    This safely supports both HS256 and ES256 without needing manual public key management.

    Args:
        token: The raw JWT string (without "Bearer " prefix).
        jwt_secret: The SUPABASE_JWT_SECRET (unused now, kept for signature compat).

    Returns:
        The ``sub`` claim value (Supabase auth user ID) as a string.

    Raises:
        HTTPException 401: If the token is invalid or expired.
    """
    supabase = get_supabase_client()
    try:
        res = supabase.auth.get_user(token)
        if not res or not res.user:
            raise ValueError("No user returned")
        return str(res.user.id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

