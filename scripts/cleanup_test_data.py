import sys
import os
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.supabase import get_supabase_client

supabase = get_supabase_client()

print("Fetching organizations...")
r_orgs = supabase.table("organizations").select("id, name, created_at").is_("deleted_at", "null").execute()
orgs = r_orgs.data

if not orgs:
    print("No active organizations found to clean up.")
    sys.exit(0)

print(f"\nFound {len(orgs)} active organizations:")
for i, org in enumerate(orgs):
    print(f"{i+1}. {org['name']} (created: {org['created_at']})")

print("\n--- WARNING: DESTRUCTIVE ACTION ---")
print("This will soft-delete ALL of the above organizations, as well as their teams and members.")
val = input("Type 'DELETE' to proceed, or anything else to cancel: ")

if val.strip() != "DELETE":
    print("Cancelled.")
    sys.exit(0)

now_iso = datetime.now(timezone.utc).isoformat()
deleted_count = 0

for org in orgs:
    org_id = org["id"]
    print(f"Soft-deleting {org['name']} ({org_id})...")
    
    # Soft delete members
    supabase.table("members").update({"deleted_at": now_iso}).eq("organization_id", org_id).is_("deleted_at", "null").execute()
    
    # Soft delete teams
    supabase.table("teams").update({"deleted_at": now_iso}).eq("organization_id", org_id).is_("deleted_at", "null").execute()
    
    # Soft delete org
    supabase.table("organizations").update({"deleted_at": now_iso}).eq("id", org_id).is_("deleted_at", "null").execute()
    
    deleted_count += 1

print(f"\nSuccessfully soft-deleted {deleted_count} organizations and their dependencies.")
