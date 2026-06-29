import requests
from app.services.supabase import get_supabase_client
from app.config import get_settings

def run():
    supabase = get_supabase_client()
    settings = get_settings()
    
    # We login as the platform admin just to get a valid JWT, 
    # then hit /platform/me (or we can sign up a fake user and hit /teams)
    # The prompt says: e.g. GET /teams with a real auth token
    # Let's just create a random user, get token, and hit /teams
    import random, string
    r = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    email = f"test_{r}@example.com"
    password = "Password123!"
    
    auth_resp = supabase.auth.sign_up({"email": email, "password": password})
    token = auth_resp.session.access_token
    
    print(f"Got token! Hitting localhost:8001/teams")
    resp = requests.get("http://localhost:8001/teams", headers={"Authorization": f"Bearer {token}"})
    print(resp.status_code, resp.text)

if __name__ == "__main__":
    run()
