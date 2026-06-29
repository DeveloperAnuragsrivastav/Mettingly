import logging
import httpx
from app.services.supabase import get_supabase_client

# Enable global debug logging for httpx so we can see the raw outgoing HTTP requests
logging.basicConfig(
    format="%(levelname)s [%(name)s] %(message)s",
    level=logging.DEBUG,
    handlers=[logging.StreamHandler()]
)

def run():
    print("--- Starting Request ---")
    supabase = get_supabase_client()
    # This will trigger an HTTP GET to Supabase REST API
    resp = supabase.table("organizations").select("id").limit(1).execute()
    print(f"Data: {resp.data}")

if __name__ == "__main__":
    run()
