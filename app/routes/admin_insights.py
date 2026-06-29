from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List, Dict, Any
from datetime import date

from app.dependencies.auth import get_current_member, require_role
from app.models.member import Member, MemberRole
from app.services.supabase import get_supabase_client
from app.utils.scopes import get_role_scope_filter

router = APIRouter(tags=["Insights & Admin"])

@router.get("/insights/utilization")
def get_utilization(
    start_date: date,
    end_date: date,
    member: Member = Depends(get_current_member)
):
    supabase = get_supabase_client()
    
    scope = get_role_scope_filter(member, member_col="member_id")
    
    query = supabase.table("member_utilization_daily").select("*")
    query = query.gte("stat_date", start_date.isoformat()).lte("stat_date", end_date.isoformat())
    
    for k, v in scope.items():
        if v is None:
            query = query.is_(k, "null")
        else:
            query = query.eq(k, v)
            
    resp = query.execute()
    data = resp.data
    
    summary = {
        "bookings_count": 0,
        "cancelled_count": 0,
        "rescheduled_count": 0,
        "total_booked_minutes": 0,
        "cancel_rate": 0.0
    }
    
    for row in data:
        summary["bookings_count"] += row.get("bookings_count") or 0
        summary["cancelled_count"] += row.get("cancelled_count") or 0
        summary["rescheduled_count"] += row.get("rescheduled_count") or 0
        summary["total_booked_minutes"] += row.get("total_booked_minutes") or 0
        
    if summary["bookings_count"] > 0:
        summary["cancel_rate"] = summary["cancelled_count"] / summary["bookings_count"]
        
    return {
        "summary": summary,
        "daily_records": data
    }


@router.get("/insights/bookings")
def get_bookings(
    start_date: date,
    end_date: date,
    status: Optional[str] = None,
    member: Member = Depends(get_current_member)
):
    supabase = get_supabase_client()
    scope = get_role_scope_filter(member, member_col="assigned_member_id")
    
    query = supabase.table("bookings").select(
        "id, caller_name, caller_email, start_time_utc, end_time_utc, status, assigned_member_id, google_meet_link"
    )
    query = query.gte("start_time_utc", start_date.isoformat()).lte("start_time_utc", end_date.isoformat() + "T23:59:59Z")
    
    if status:
        query = query.eq("status", status)
        
    for k, v in scope.items():
        if v is None:
            query = query.is_(k, "null")
        else:
            query = query.eq(k, v)
            
    # Simple unpaginated or simulated pagination for now
    resp = query.order("start_time_utc", desc=True).limit(100).execute()
    
    return {
        "items": resp.data,
        "count": len(resp.data)
    }


@router.get("/insights/audit-log")
def get_audit_logs(
    start_date: date,
    end_date: date,
    entity_type: Optional[str] = None,
    member: Member = Depends(require_role(MemberRole.SUPER_ADMIN, MemberRole.TEAM_ADMIN))
):
    """
    Super Admin sees all audit logs in the org.
    Team Admin sees only logs where entity_id belongs to their team's members or their team's bookings.
    """
    supabase = get_supabase_client()
    
    query = supabase.table("audit_logs").select("*, members(full_name)")
    query = query.gte("created_at", start_date.isoformat()).lte("created_at", end_date.isoformat() + "T23:59:59Z")
    
    if entity_type:
        query = query.eq("entity_type", entity_type)
        
    if member.role == MemberRole.SUPER_ADMIN:
        query = query.eq("organization_id", str(member.organization_id))
        resp = query.order("created_at", desc=True).limit(100).execute()
        return {"items": resp.data}
        
    elif member.role == MemberRole.TEAM_ADMIN:
        if not member.team_id:
            return {"items": []}
            
        # Get team's members
        m_resp = supabase.table("members").select("id").eq("team_id", str(member.team_id)).execute()
        team_member_ids = [m["id"] for m in m_resp.data]
        
        # Get team's bookings
        b_resp = supabase.table("bookings").select("id").eq("team_id", str(member.team_id)).execute()
        team_booking_ids = [b["id"] for b in b_resp.data]
        
        valid_entity_ids = team_member_ids + team_booking_ids
        if not valid_entity_ids:
            return {"items": []}
            
        query = query.eq("organization_id", str(member.organization_id))
        query = query.in_("entity_id", valid_entity_ids)
        
        resp = query.order("created_at", desc=True).limit(100).execute()
        return {"items": resp.data}
        
    raise HTTPException(status_code=403, detail="Forbidden")

@router.get("/admin/jobs/status")
def get_jobs_status(member: Member = Depends(require_role(MemberRole.SUPER_ADMIN))):
    """
    Returns the latest execution status for background jobs.
    """
    supabase = get_supabase_client()
    
    # Query latest execution for each job
    # PostgREST doesn't support generic DISTINCT ON easily, so we just pull the top N and group manually
    resp = (
        supabase.table("audit_logs")
        .select("entity_id, created_at, after_state")
        .eq("action", "job_executed")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    
    jobs = {}
    for log in resp.data:
        job_id = log["after_state"].get("job_name", str(log["entity_id"]))
        if job_id not in jobs:
            jobs[job_id] = {
                "last_run_at": log["created_at"],
                "outcome": log["after_state"]
            }
            
    return {"jobs": jobs}

from pydantic import BaseModel, EmailStr
from app.services.email_provider import send_email, EmailDeliveryError

class TestEmailRequest(BaseModel):
    to_email: EmailStr

@router.post("/admin/test-email")
def test_email_endpoint(
    request: TestEmailRequest,
    member: Member = Depends(require_role(MemberRole.SUPER_ADMIN))
):
    """
    Sends a test email to verify SendGrid configuration.
    """
    try:
        msg_id = send_email(
            to_email=request.to_email,
            subject="Meeting SaaS - Test Email",
            html_body="<h3>Success!</h3><p>Your SendGrid integration is fully operational.</p>"
        )
        return {"status": "success", "provider_message_id": msg_id}
    except EmailDeliveryError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
