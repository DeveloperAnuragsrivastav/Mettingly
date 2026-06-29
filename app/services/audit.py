"""
Audit Logging Service.

Provides a reusable helper to write to the `audit_logs` table.
This should be called for all state-changing actions across the system.
"""

from typing import Any, Dict, Optional
from uuid import UUID

from app.services.supabase import get_supabase_client


def write_audit_log(
    organization_id: UUID,
    actor_member_id: Optional[UUID],
    action: str,
    entity_type: str,
    entity_id: str,
    actor_type: str = "member",
    before_state: Optional[Dict[str, Any]] = None,
    after_state: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Write a record to the `audit_logs` table.
    
    Args:
        organization_id: The tenant ID.
        actor_member_id: The member who performed the action (None for system actions).
        action: Open VARCHAR describing the event (e.g. 'member_role_changed').
        entity_type: The type of entity being modified (e.g. 'member', 'booking').
        entity_id: The ID of the modified entity (stored as string for polymorphism).
        actor_type: Type of actor ('member' or 'system').
        before_state: JSON representation of entity before change.
        after_state: JSON representation of entity after change.
        metadata: Additional JSON context (e.g. IP address, user agent).
    """
    supabase = get_supabase_client()
    
    log_entry = {
        "organization_id": str(organization_id),
        "actor_member_id": str(actor_member_id) if actor_member_id else None,
        "actor_type": actor_type,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "before_state": before_state,
        "after_state": after_state,
        "metadata": metadata,
    }
    
    supabase.table("audit_logs").insert(log_entry).execute()
