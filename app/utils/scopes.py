from typing import Dict, Any
from app.models.member import Member, MemberRole

def get_role_scope_filter(member: Member, member_col: str = "member_id") -> Dict[str, Any]:
    """
    Returns the appropriate filter clause components (org_id, team_id, member_id)
    based on the member's role.
    """
    scope = {}
    if member.role == MemberRole.SUPER_ADMIN:
        scope["organization_id"] = str(member.organization_id)
    elif member.role == MemberRole.TEAM_ADMIN:
        scope["team_id"] = str(member.team_id) if member.team_id else None
    elif member.role == MemberRole.MEMBER:
        scope[member_col] = str(member.id)
        
    return scope
