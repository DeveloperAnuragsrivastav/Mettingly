import os
import requests
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") # service role key or anon key
API_BASE = "http://localhost:8000"

# Note: We use the anon key for auth client operations typically, but if SUPABASE_KEY is service role, it also works for auth.
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def run_test():
    print("=== Platform Admin Test ===")
    p_email = input("Enter the Platform Admin email (from the manual SQL insert): ")
    p_pass = input("Enter the Platform Admin password (you must have signed up this user in Supabase Auth first!): ")

    print("\n1. Signing in Platform Admin...")
    try:
        res = supabase.auth.sign_in_with_password({"email": p_email, "password": p_pass})
        p_token = res.session.access_token
        print("Success! Got JWT.")
    except Exception as e:
        print(f"Failed to sign in: {e}")
        return

    print("\n2. Calling POST /platform/organizations...")
    org_req = {
        "name": "Test Org Bootstrap",
        "slug": "test-org-bootstrap"
    }
    r = requests.post(
        f"{API_BASE}/platform/organizations",
        json=org_req,
        headers={"Authorization": f"Bearer {p_token}"}
    )
    if r.status_code == 201:
        org_data = r.json()
        org_id = org_data["id"]
        print(f"Success! Created org: {org_id}")
    elif r.status_code == 409:
        print("Org already exists, fetching its ID...")
        orgs_r = requests.get(
            f"{API_BASE}/platform/organizations",
            headers={"Authorization": f"Bearer {p_token}"}
        )
        orgs = orgs_r.json()
        org_id = next(o["id"] for o in orgs if o["slug"] == "test-org-bootstrap")
        print(f"Found existing org: {org_id}")
    else:
        print(f"Failed: {r.status_code} {r.text}")
        return

    print("\n3. Calling POST /platform/organizations/{org_id}/bootstrap-super-admin...")
    sa_email = "superadmin_test@example.com"
    sa_req = {
        "email": sa_email,
        "full_name": "Test Super Admin"
    }
    r = requests.post(
        f"{API_BASE}/platform/organizations/{org_id}/bootstrap-super-admin",
        json=sa_req,
        headers={"Authorization": f"Bearer {p_token}"}
    )
    
    if r.status_code == 201:
        print(f"Success! Bootstrapped Super Admin: {sa_email}")
    elif r.status_code == 409:
        print(f"Super Admin {sa_email} already bootstrapped.")
    else:
        print(f"Failed: {r.status_code} {r.text}")
        return

    print("\n4. Signing up the new Super Admin in Supabase Auth (to test trigger auto-linking)...")
    sa_pass = "SecurePass123!"
    try:
        # First sign out the platform admin so we can sign up the new user
        supabase.auth.sign_out()
        sa_res = supabase.auth.sign_up({"email": sa_email, "password": sa_pass})
        sa_token = sa_res.session.access_token
        print("Success! Signed up Super Admin and got JWT.")
    except Exception as e:
        print(f"Failed to sign up Super Admin (maybe already signed up? Attempting login...): {e}")
        try:
            sa_res = supabase.auth.sign_in_with_password({"email": sa_email, "password": sa_pass})
            sa_token = sa_res.session.access_token
            print("Success! Signed in existing Super Admin.")
        except Exception as e2:
            print(f"Failed to sign in Super Admin: {e2}")
            return

    print("\n5. Testing get_current_member by calling GET /me with Super Admin token...")
    r = requests.get(
        f"{API_BASE}/me",
        headers={"Authorization": f"Bearer {sa_token}"}
    )
    if r.status_code == 200:
        me_data = r.json()
        print("Success! /me returned:")
        print(me_data)
        if me_data["role"] == "super_admin" and me_data["organization_id"] == org_id:
            print("\n✅ ALL TESTS PASSED! Trigger auto-linking and Platform endpoints work perfectly.")
        else:
            print("❌ Mismatch in expected data!")
    else:
        print(f"Failed: {r.status_code} {r.text}")
        print("❌ get_current_member failed. Trigger might not have auto-linked the auth_user_id.")

if __name__ == "__main__":
    run_test()
