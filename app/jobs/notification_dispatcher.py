import logging
import time
from app.services.notifications import dispatch_pending_notifications
from app.services.audit import write_audit_log
from app.services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

# Note on locking:
# Postgres connection-bound advisory locks (pg_try_advisory_lock) require a long-lived
# raw Postgres connection (psycopg2/asyncpg). Since this backend currently operates purely
# via stateless PostgREST (where each HTTP request uses an independent connection), we
# emulate the safety pattern with an in-memory lock for a single-VPS instance.
# When scaling horizontally, replace this with a Redis lock or a raw Postgres connection block.

_dispatch_lock = False

def run_notification_dispatch_cycle():
    """
    Thin wrapper calling dispatch_pending_notifications() in a loop until it 
    returns zero pending rows processed, with a small delay between iterations.
    Capped at 20 iterations.
    """
    global _dispatch_lock
    if _dispatch_lock:
        return
        
    _dispatch_lock = True
    iterations = 0
    total_sent = 0
    total_failed = 0
    
    try:
        while iterations < 20:
            iterations += 1
            res = dispatch_pending_notifications(limit=50)
            
            sent = res.get("sent", 0)
            failed = res.get("failed", 0)
            
            total_sent += sent
            total_failed += failed
            
            if sent == 0 and failed == 0:
                break
                
            time.sleep(0.5)
            
    except Exception as e:
        logger.error(f"Error in notification dispatch cycle: {e}")
    finally:
        _dispatch_lock = False
        
        # Log job execution
        try:
            write_audit_log(
                organization_id=get_supabase_client().table("organizations").select("id").limit(1).execute().data[0]["id"], # System org or null equivalent
                action="job_executed",
                actor_type="system",
                actor_member_id=None,
                entity_type="job",
                entity_id="00000000-0000-0000-0000-000000000000",
                before_state=None,
                after_state={
                    "job_name": "notification_dispatcher",
                    "iterations": iterations,
                    "total_sent": total_sent,
                    "total_failed": total_failed
                }
            )
        except Exception:
            pass

