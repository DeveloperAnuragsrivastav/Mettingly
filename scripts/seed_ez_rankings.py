import sys
import os
from uuid import uuid4
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.supabase import get_supabase_client

supabase = get_supabase_client()

print("Checking for existing EZ Rankings organization...")
r_orgs = supabase.table("organizations").select("id").eq("name", "EZ Rankings").is_("deleted_at", "null").execute()

if r_orgs.data:
    print("EZ Rankings already exists!")
    org_id = r_orgs.data[0]["id"]
else:
    print("Creating EZ Rankings organization...")
    org_id = str(uuid4())
    supabase.table("organizations").insert({
        "id": org_id,
        "name": "EZ Rankings",
        "slug": "ez-rankings"
    }).execute()
    
    print("Creating EZ Rankings default team...")
    team_id = str(uuid4())
    supabase.table("teams").insert({
        "id": team_id,
        "organization_id": org_id,
        "name": "Core Team",
        "slug": "core"
    }).execute()
    
    print("Setting up Org Availability Defaults...")
    # Mon-Fri 9:30-19:00, lunch 13:30-14:15, break 16:45-17:00
    weekly_schedule = {
        "mon": [["09:30", "13:30"], ["14:15", "16:45"], ["17:00", "19:00"]],
        "tue": [["09:30", "13:30"], ["14:15", "16:45"], ["17:00", "19:00"]],
        "wed": [["09:30", "13:30"], ["14:15", "16:45"], ["17:00", "19:00"]],
        "thu": [["09:30", "13:30"], ["14:15", "16:45"], ["17:00", "19:00"]],
        "fri": [["09:30", "13:30"], ["14:15", "16:45"], ["17:00", "19:00"]],
        "sat": [],
        "sun": []
    }
    supabase.table("org_availability_defaults").upsert({
        "organization_id": org_id,
        "timezone": "UTC",
        "weekly_schedule": weekly_schedule
    }).execute()
    
    
    print("Creating Super Admin...")
    member_id = str(uuid4())
    supabase.table("members").insert({
        "id": member_id,
        "organization_id": org_id,
        "team_id": team_id,
        "email": "admin@ezrankings.com",
        "full_name": "Admin EZ Rankings",
        "role": "super_admin",
        "is_active_for_booking": True
    }).execute()
    
    print("Done! Organization, Team, Super Admin, and Availability setup complete.")

