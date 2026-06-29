import sys
import uuid
from app.services.supabase import get_supabase_client

def main():
    if len(sys.argv) != 2:
        print("Usage: python scripts/seed_first_admin.py <your_google_email>")
        sys.exit(1)
        
    email = sys.argv[1].lower().strip()
    supabase = get_supabase_client()
    
    # Check if user already exists
    existing = supabase.table("members").select("*").eq("email", email).execute()
    if existing.data:
        print(f"User {email} already exists in members table. We will upgrade them to super_admin.")
        supabase.table("members").update({"role": "super_admin"}).eq("email", email).execute()
        print("Done!")
        return

    # Create new super admin
    supabase.table("members").insert({
        "organization_id": "0b0da99a-b881-48fb-9aeb-7a54fdb895f4",
        "team_id": "a868d1ad-cbcb-4f9c-8039-58a81d0becf7",
        "full_name": "Founder",
        "email": email,
        "role": "super_admin",
        "is_active_for_booking": True
    }).execute()
    
    print(f"Successfully created Super Admin row for {email}!")
    print("You can now log in via Google with this email.")

if __name__ == "__main__":
    main()
