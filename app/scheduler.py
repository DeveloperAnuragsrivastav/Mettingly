import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.jobs.notification_dispatcher import run_notification_dispatch_cycle
from app.jobs.utilization_rollup import compute_daily_utilization_rollup
from app.services.calendar_sync import retry_failed_calendar_syncs

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

_sync_lock = False

def run_calendar_sync_cycle():
    global _sync_lock
    if _sync_lock:
        return
    _sync_lock = True
    try:
        retry_failed_calendar_syncs()
    finally:
        _sync_lock = False

def start_scheduler():
    """
    Initializes and starts the background job scheduler.
    """
    # 1. Notification Dispatcher (Every 1 minute)
    scheduler.add_job(
        run_notification_dispatch_cycle,
        trigger=IntervalTrigger(minutes=1),
        id="notification_dispatcher",
        name="Notification Dispatch Cycle",
        replace_existing=True
    )
    
    # 2. Utilization Rollup (Daily at 1 AM server time)
    scheduler.add_job(
        compute_daily_utilization_rollup,
        trigger=CronTrigger(hour=1, minute=0),
        id="utilization_rollup",
        name="Daily Utilization Rollup",
        replace_existing=True
    )
    
    # 3. Calendar Sync Retry (Every 15 minutes)
    scheduler.add_job(
        run_calendar_sync_cycle,
        trigger=IntervalTrigger(minutes=15),
        id="calendar_sync_retry",
        name="Calendar Sync Retry",
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Background job scheduler started.")
    
def shutdown_scheduler():
    scheduler.shutdown()
    logger.info("Background job scheduler shut down.")
