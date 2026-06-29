import logging
from datetime import date, datetime, timedelta, timezone
from app.services.supabase import get_supabase_client
from app.services.audit import write_audit_log

logger = logging.getLogger(__name__)

_rollup_lock = False

def compute_daily_utilization_rollup(target_date: date = None):
    """
    Computes bookings, cancellations, and reschedules for a specific target_date.
    Upserts results into `member_utilization_daily`.
    Defaults to yesterday.
    """
    global _rollup_lock
    if _rollup_lock:
        return
        
    _rollup_lock = True
    
    if target_date is None:
        target_date = date.today() - timedelta(days=1)
        
    try:
        supabase = get_supabase_client()
        
        start_ts = target_date.isoformat() + "T00:00:00Z"
        end_ts = target_date.isoformat() + "T23:59:59Z"
        
        # 1. Fetch bookings that fall on target_date
        # Cancelled bookings might have their original start_time_utc in this range
        resp = (
            supabase.table("bookings")
            .select("assigned_member_id, organization_id, team_id, status, duration_minutes")
            .gte("start_time_utc", start_ts)
            .lte("start_time_utc", end_ts)
            .execute()
        )
        
        bookings = resp.data
        if not bookings:
            return
            
        stats = {}
        for b in bookings:
            m_id = b["assigned_member_id"]
            if not m_id:
                continue
                
            if m_id not in stats:
                stats[m_id] = {
                    "member_id": m_id,
                    "organization_id": b["organization_id"],
                    "team_id": b["team_id"],
                    "stat_date": target_date.isoformat(),
                    "bookings_count": 0,
                    "cancelled_count": 0,
                    "rescheduled_count": 0,
                    "total_booked_minutes": 0
                }
                
            s = b["status"]
            if s in ("confirmed", "rescheduled"):
                stats[m_id]["bookings_count"] += 1
                stats[m_id]["total_booked_minutes"] += b["duration_minutes"]
                
            if s == "cancelled":
                stats[m_id]["cancelled_count"] += 1
                
            if s == "rescheduled":
                stats[m_id]["rescheduled_count"] += 1
                
        # 2. Upsert results
        now_iso = datetime.now(timezone.utc).isoformat()
        records_to_upsert = []
        for m_id, data in stats.items():
            data["computed_at"] = now_iso
            records_to_upsert.append(data)
            
        if records_to_upsert:
            # Supabase Python client upsert on conflict
            supabase.table("member_utilization_daily").upsert(
                records_to_upsert,
                on_conflict="member_id,stat_date"
            ).execute()
            
        # Log job execution
        write_audit_log(
            organization_id=get_supabase_client().table("organizations").select("id").limit(1).execute().data[0]["id"],
            action="job_executed",
            actor_type="system",
            actor_member_id=None,
            entity_type="job",
            entity_id="00000000-0000-0000-0000-000000000000",
            before_state=None,
            after_state={
                "job_name": "utilization_rollup",
                "target_date": target_date.isoformat(),
                "members_processed": len(records_to_upsert)
            }
        )
        
    except Exception as e:
        logger.error(f"Error computing daily utilization rollup: {e}")
    finally:
        _rollup_lock = False

