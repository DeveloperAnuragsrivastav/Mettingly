"""
Member lookup by Supabase auth user ID.

This module is responsible ONLY for the database query.
JWT verification is handled separately in jwt.py.
"""

from fastapi import HTTPException, status
from supabase import Client

from app.models.member import Member


def lookup_member_by_auth_user_id(
    supabase: Client,
    auth_user_id: str,
) -> Member:
    """
    Query the ``members`` table for an active member linked to the given
    Supabase auth user ID.

    Args:
        supabase: An initialised Supabase client (service_role key).
        auth_user_id: The ``sub`` claim extracted from the verified JWT.

    Returns:
        A :class:`Member` instance with the matched row data.

    Raises:
        HTTPException 403:
            - If ``auth_user_id`` is empty/None (token had no ``sub``).
            - If no active member row is linked to this auth user.
    """
    if not auth_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token does not contain a valid user identity.",
        )

    try:
        response = (
            supabase.table("members")
            .select("id, organization_id, team_id, role, full_name, email")
            .eq("auth_user_id", auth_user_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        # Log the underlying error in production; surface a safe message.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unable to verify member account.",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "No linked member account found. "
                "Contact your organization admin to get access."
            ),
        )

    return Member(**response.data[0])
