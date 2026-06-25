"""
FastAPI authentication & authorization dependencies.

- ``get_current_member``: Composes JWT verification + DB lookup.
- ``require_role(*roles)``: Factory that wraps ``get_current_member``
  and enforces role-based access.
"""

from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import verify_supabase_jwt
from app.auth.member_lookup import lookup_member_by_auth_user_id
from app.config import Settings, get_settings
from app.models.member import Member, MemberRole
from app.services.supabase import get_supabase_client

# HTTPBearer extracts the token from "Authorization: Bearer <token>"
# and auto-returns 403 if the header is missing or malformed.
_bearer_scheme = HTTPBearer()


async def get_current_member(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> Member:
    """
    Core authentication dependency.

    Pipeline:
        1. Extract Bearer token from the Authorization header.
        2. Verify the token as a Supabase-issued JWT (HS256).
        3. Extract ``sub`` claim → ``auth_user_id``.
        4. Query ``members`` table for a matching, non-deleted row.
        5. Return a :class:`Member` with id, organization_id, team_id, role.

    Raises:
        HTTPException 401: Token missing, expired, or invalid.
        HTTPException 403: No matching member row (account not linked).
    """
    # Step 1 — JWT verification (pure crypto, no DB)
    auth_user_id = verify_supabase_jwt(
        token=credentials.credentials,
        jwt_secret=settings.SUPABASE_JWT_SECRET,
    )

    # Step 2 — DB lookup (uses service_role client)
    supabase = get_supabase_client()
    member = lookup_member_by_auth_user_id(supabase, auth_user_id)

    return member


def require_role(*allowed_roles: str) -> Callable:
    """
    Dependency factory for role-based access control.

    Returns a FastAPI dependency that resolves to a :class:`Member` only
    if the member's role is in ``allowed_roles``, otherwise raises 403.

    Usage::

        @router.post("/organizations")
        async def create_org(
            member: Member = Depends(require_role("super_admin")),
        ):
            ...

        @router.put("/teams/{team_id}")
        async def update_team(
            member: Member = Depends(
                require_role("super_admin", "team_admin")
            ),
        ):
            ...
    """
    # Normalise to MemberRole enum values for safe comparison.
    # Accepts both raw strings ("super_admin") and MemberRole enum values.
    resolved_roles: set[str] = set()
    for role in allowed_roles:
        if isinstance(role, MemberRole):
            resolved_roles.add(role.value)
        else:
            # Validate that the string is actually a known role
            try:
                resolved_roles.add(MemberRole(role).value)
            except ValueError:
                raise ValueError(
                    f"Unknown role '{role}'. "
                    f"Allowed values: {[r.value for r in MemberRole]}"
                )

    async def _role_checker(
        member: Member = Depends(get_current_member),
    ) -> Member:
        if member.role.value not in resolved_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"This action requires one of the following roles: "
                    f"{', '.join(sorted(resolved_roles))}. "
                    f"Your current role: {member.role.value}."
                ),
            )
        return member

    return _role_checker
