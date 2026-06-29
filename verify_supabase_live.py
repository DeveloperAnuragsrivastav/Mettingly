import os
from datetime import datetime, timezone
from app.services.supabase import get_supabase_client

def run_verification():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting direct verification...")
    
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_KEY')
    
    if not url:
        from app.config import get_settings
        settings = get_settings()
        url = settings.SUPABASE_URL
        key = settings.SUPABASE_KEY
    
    masked_key = f"{key[:10]}...{key[-5:]}" if key else "EMPTY"
    print(f"Connecting to SUPABASE_URL: {url}")
    print(f"Using SUPABASE_KEY: {masked_key}")
    
    supabase = get_supabase_client()
    
    # Task 1 & 2: Fetch recent organizations
    print("\n--- Fetching Organizations ---")
    resp = supabase.table("organizations").select("*").order("created_at", desc=True).limit(5).execute()
    
    print(f"Raw response type: {type(resp)}")
    print(f"Data returned (Top 5 most recent):")
    for org in resp.data:
        print(f" - ID: {org['id']}, Name: {org['name']}, Slug: {org['slug']}, Created At: {org['created_at']}")
        
if __name__ == "__main__":
    run_verification()
