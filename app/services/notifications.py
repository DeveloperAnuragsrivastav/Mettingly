"""
Notifications Service.

Handles dispatching notification records to the `notifications` table.
"""
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from uuid import UUID
import logging

from jinja2 import Environment, FileSystemLoader

from app.models.member import MemberRole
from app.services.supabase import get_supabase_client
from app.services.email_provider import send_email
from app.config import get_settings

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates", "email")
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))


def create_booking_token(booking_id: UUID) -> str:
    token = secrets.token_urlsafe(48)
    supabase = get_supabase_client()
    supabase.table("booking_tokens").insert({
        "booking_id": str(booking_id),
        "token": token,
        "token_type": "manage"
    }).execute()
    return token


def queue_notification(
    organization_id: UUID, 
    booking_id: Optional[UUID] = None, 
    member_id: Optional[UUID] = None, 
    notification_type: str = "", 
    recipient_email: str = "", 
    scheduled_for: Optional[datetime] = None
) -> UUID:
    if not scheduled_for:
        scheduled_for = datetime.now(timezone.utc)
        
    supabase = get_supabase_client()
    resp = supabase.table("notifications").insert({
        "organization_id": str(organization_id),
        "booking_id": str(booking_id) if booking_id else None,
        "member_id": str(member_id) if member_id else None,
        "notification_type": notification_type,
        "recipient_email": recipient_email,
        "channel": "email",
        "status": "pending",
        "scheduled_for": scheduled_for.isoformat()
    }).execute()
    return UUID(resp.data[0]["id"])


def notify_calendar_not_connected(member_id: UUID) -> None:
    supabase = get_supabase_client()
    
    # Throttle: Only send this once per 24 hours per member
    one_day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    recent_notif = (
        supabase.table("notifications")
        .select("id")
        .eq("member_id", str(member_id))
        .eq("notification_type", "calendar_not_connected_member")
        .gte("created_at", one_day_ago)
        .limit(1)
        .execute()
    )
    if recent_notif.data:
        return
        
    member_resp = (
        supabase.table("members")
        .select("organization_id, email, team_id")
        .eq("id", str(member_id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if not member_resp.data:
        return
        
    member = member_resp.data[0]
    org_id = UUID(member["organization_id"])
    member_email = member["email"]
    team_id = member.get("team_id")
    
    queue_notification(org_id, None, member_id, "calendar_not_connected_member", member_email)
    
    if team_id:
        admins_resp = (
            supabase.table("members")
            .select("email")
            .eq("team_id", str(team_id))
            .eq("role", MemberRole.TEAM_ADMIN.value)
            .is_("deleted_at", "null")
            .execute()
        )
        for admin in admins_resp.data:
            queue_notification(org_id, None, member_id, "calendar_not_connected_admin", admin["email"])


def queue_booking_confirmation_notifications(booking_id: UUID):
    supabase = get_supabase_client()
    resp = supabase.table("bookings").select("*, members(email)").eq("id", str(booking_id)).execute()
    if not resp.data:
        return
        
    booking = resp.data[0]
    org_id = UUID(booking["organization_id"])
    member_id = UUID(booking["assigned_member_id"])
    caller_email = booking["caller_email"]
    member_email = booking["members"]["email"] if booking.get("members") else ""
    
    create_booking_token(booking_id)
    
    queue_notification(org_id, booking_id, member_id, "booking_confirmation", caller_email)
    if member_email:
        queue_notification(org_id, booking_id, member_id, "booking_confirmation", member_email)


def queue_reminder_notifications(booking_id: UUID):
    supabase = get_supabase_client()
    resp = supabase.table("bookings").select("*, members(email)").eq("id", str(booking_id)).execute()
    if not resp.data:
        return
        
    booking = resp.data[0]
    org_id = UUID(booking["organization_id"])
    member_id = UUID(booking["assigned_member_id"])
    caller_email = booking["caller_email"]
    member_email = booking["members"]["email"] if booking.get("members") else ""
    
    start_dt = datetime.fromisoformat(booking["start_time_utc"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    
    rem1_dt = start_dt - timedelta(days=1)
    rem15_dt = start_dt - timedelta(minutes=15)
    
    if rem1_dt > now:
        queue_notification(org_id, booking_id, member_id, "reminder_1day", caller_email, rem1_dt)
        if member_email:
            queue_notification(org_id, booking_id, member_id, "reminder_1day", member_email, rem1_dt)
            
    if rem15_dt > now:
        queue_notification(org_id, booking_id, member_id, "reminder_15min", caller_email, rem15_dt)
        if member_email:
            queue_notification(org_id, booking_id, member_id, "reminder_15min", member_email, rem15_dt)


def render_email_template(notification_type: str, context: dict) -> dict:
    template_name = f"{notification_type}.html"
    try:
        template = env.get_template(template_name)
    except Exception:
        template = env.from_string("""
        <h3>Notification: {{ notification_type }}</h3>
        <p>Details:</p>
        <ul>
        {% for k, v in kwargs.items() %}
            {% if k != 'notification_type' %}
            <li>{{ k }}: {{ v }}</li>
            {% endif %}
        {% endfor %}
        </ul>
        """)
        
    html_body = template.render(notification_type=notification_type, kwargs=context, **context)
    
    subjects = {
        "booking_confirmation": "Your Booking is Confirmed!",
        "reminder_1day": "Reminder: Upcoming Meeting Tomorrow",
        "reminder_15min": "Reminder: Meeting starting in 15 minutes",
        "calendar_not_connected_member": "Action Required: Reconnect your Calendar",
        "calendar_not_connected_admin": "Alert: Team Member Calendar Disconnected",
        "cancellation_confirmation": "Booking Cancelled",
        "reschedule_confirmation": "Booking Rescheduled",
        "member_invited": f"You've been invited to join {context.get('organization_name', 'an organization')} on Meeting SaaS",
        "platform_super_admin_invited": f"You've been invited as a Super Admin for {context.get('organization_name', 'an organization')}"
    }
    
    subject = subjects.get(notification_type, "Important Update regarding your Booking")
    return {"subject": subject, "html_body": html_body}


def dispatch_pending_notifications(limit: int = 50) -> dict:
    supabase = get_supabase_client()
    # Fetch FRONTEND_URL lazily here (not at module import time) so that the
    # settings object is guaranteed to be fully initialised from .env.
    frontend_url = get_settings().FRONTEND_URL
    now_utc = datetime.now(timezone.utc).isoformat()
    
    resp = (
        supabase.table("notifications")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_for", now_utc)
        .order("scheduled_for")
        .limit(limit)
        .execute()
    )
    
    sent = 0
    failed = 0
    
    for n in resp.data:
        n_id = n["id"]
        try:
            context = {"recipient_email": n["recipient_email"], "FRONTEND_URL": frontend_url, "member_id": n["member_id"]}
            if n.get("booking_id"):
                b_resp = supabase.table("bookings").select("*, members(email, full_name)").eq("id", n["booking_id"]).execute()
                if b_resp.data:
                    booking = b_resp.data[0]
                    context["booking"] = booking
                    
                    # Ensure reason and summary exist
                    if not booking.get("custom_form_responses"):
                        booking["custom_form_responses"] = {}
                        
                    is_member = False
                    member_data = booking.get("members")
                    if member_data:
                        is_member = (n["recipient_email"] == member_data.get("email"))
                        member_first_name = member_data.get("full_name", "Member").split(" ")[0]
                        member_full_name = member_data.get("full_name", "Member")
                        try:
                            from app.services.availability import resolve_member_availability_config
                            conf = resolve_member_availability_config(booking["assigned_member_id"])
                            member_tz = conf.timezone
                        except Exception:
                            member_tz = "UTC"
                    else:
                        member_first_name = "there"
                        member_full_name = "Member"
                        member_tz = "UTC"
                        
                    caller_first_name = booking.get("caller_name", "there").split(" ")[0]
                    
                    if is_member:
                        context["first_name"] = member_first_name
                        context["other_party_name"] = booking.get("caller_name", "Caller")
                        context["timezone"] = member_tz
                    else:
                        context["first_name"] = caller_first_name
                        context["other_party_name"] = member_full_name
                        context["timezone"] = booking.get("caller_timezone", "UTC")
                        
                    # Format the date time
                    import zoneinfo
                    dt_utc = datetime.fromisoformat(booking["start_time_utc"].replace("Z", "+00:00"))
                    try:
                        tz = zoneinfo.ZoneInfo(context["timezone"])
                    except Exception:
                        tz = timezone.utc
                    dt_local = dt_utc.astimezone(tz)
                    day_str = str(dt_local.day)
                    hour_str = str(dt_local.hour % 12 or 12)
                    formatted_time = dt_local.strftime(f"%A, {day_str} %B %Y, {hour_str}:%M %p")
                    context["formatted_start_time"] = formatted_time
                        
                    if booking.get("cancellation_reason"):
                        context["cancellation_reason"] = booking["cancellation_reason"]
                    
                    t_resp = supabase.table("booking_tokens").select("token").eq("booking_id", n["booking_id"]).eq("token_type", "manage").execute()
                    if t_resp.data:
                        token = t_resp.data[0]["token"]
                        context["manage_url"] = f"{frontend_url}/manage/{token}"
                        
            if n["notification_type"] in ["member_invited", "platform_super_admin_invited"]:
                if n.get("organization_id"):
                    org_resp = supabase.table("organizations").select("name").eq("id", n["organization_id"]).execute()
                    if org_resp.data:
                        context["organization_name"] = org_resp.data[0]["name"]
                        
            if n.get("member_id"):
                mem_resp = supabase.table("members").select("team_id, full_name").eq("id", n["member_id"]).execute()
                if mem_resp.data:
                    member_info = mem_resp.data[0]
                    context["affected_member_name"] = member_info.get("full_name", "A team member")
                    
                    if not context.get("first_name") and n["notification_type"] == "calendar_not_connected_member":
                        context["first_name"] = context["affected_member_name"].split(" ")[0]
                        
                    if member_info.get("team_id"):
                        team_resp = supabase.table("teams").select("name").eq("id", member_info["team_id"]).execute()
                        if team_resp.data:
                            context["team_name"] = team_resp.data[0]["name"]
                            
            email_data = render_email_template(n["notification_type"], context)
            provider_msg_id = send_email(n["recipient_email"], email_data["subject"], email_data["html_body"])
            
            supabase.table("notifications").update({
                "status": "sent",
                "sent_at": now_utc,
                "provider_message_id": provider_msg_id,
                "error_message": None
            }).eq("id", n_id).execute()
            sent += 1
        except Exception as e:
            supabase.table("notifications").update({
                "status": "failed",
                "error_message": str(e)[:500],
                "retry_count": (n.get("retry_count") or 0) + 1
            }).eq("id", n_id).execute()
            failed += 1
            
    return {"sent": sent, "failed": failed}

def queue_cancellation_notifications(booking_id: UUID):
    supabase = get_supabase_client()
    resp = supabase.table("bookings").select("*, members(email)").eq("id", str(booking_id)).execute()
    if not resp.data:
        return
        
    booking = resp.data[0]
    org_id = UUID(booking["organization_id"])
    member_id = UUID(booking["assigned_member_id"])
    caller_email = booking["caller_email"]
    member_email = booking["members"]["email"] if booking.get("members") else ""
    
    queue_notification(org_id, booking_id, member_id, "cancellation_confirmation", caller_email)
    if member_email:
        queue_notification(org_id, booking_id, member_id, "cancellation_confirmation", member_email)

def queue_reschedule_notifications(old_booking_id: UUID, new_booking_id: UUID):
    supabase = get_supabase_client()
    
    # 1. Fetch the NEW booking
    resp = supabase.table("bookings").select("*, members(email)").eq("id", str(new_booking_id)).execute()
    if not resp.data:
        return
        
    new_booking = resp.data[0]
    org_id = UUID(new_booking["organization_id"])
    member_id = UUID(new_booking["assigned_member_id"])
    caller_email = new_booking["caller_email"]
    member_email = new_booking["members"]["email"] if new_booking.get("members") else ""
    
    # 2. Cancel OLD pending reminders
    supabase.table("notifications").update({
        "status": "cancelled"
    }).eq("booking_id", str(old_booking_id)).in_("notification_type", ["reminder_1day", "reminder_15min"]).eq("status", "pending").execute()
    
    # 3. Generate token for NEW booking
    create_booking_token(new_booking_id)
    
    # 4. Queue Reschedule Confirmations
    queue_notification(org_id, new_booking_id, member_id, "reschedule_confirmation", caller_email)
    if member_email:
        queue_notification(org_id, new_booking_id, member_id, "reschedule_confirmation", member_email)
        
    # 5. Queue NEW Reminders
    start_dt = datetime.fromisoformat(new_booking["start_time_utc"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    
    rem1_dt = start_dt - timedelta(days=1)
    rem15_dt = start_dt - timedelta(minutes=15)
    
    if rem1_dt > now:
        queue_notification(org_id, new_booking_id, member_id, "reminder_1day", caller_email, rem1_dt)
        if member_email:
            queue_notification(org_id, new_booking_id, member_id, "reminder_1day", member_email, rem1_dt)
            
    if rem15_dt > now:
        queue_notification(org_id, new_booking_id, member_id, "reminder_15min", caller_email, rem15_dt)
        if member_email:
            queue_notification(org_id, new_booking_id, member_id, "reminder_15min", member_email, rem15_dt)
