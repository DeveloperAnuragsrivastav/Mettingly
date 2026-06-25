"""
JWT verification for Supabase Auth tokens.

This module is responsible ONLY for cryptographic token verification.
It does not touch the database — that concern belongs to member_lookup.py.
"""

import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from fastapi import HTTPException, status


def verify_supabase_jwt(token: str, jwt_secret: str) -> str:
    """
    Verify a Supabase-issued JWT (HS256) and extract the user ID.

    Args:
        token: The raw JWT string (without "Bearer " prefix).
        jwt_secret: The SUPABASE_JWT_SECRET used for HS256 verification.

    Returns:
        The ``sub`` claim value (Supabase auth user ID) as a string.

    Raises:
        HTTPException 401: If the token is expired, malformed, or
            fails signature verification.
    """
    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "exp"]},
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    auth_user_id: str = payload["sub"]
    return auth_user_id
