from playwright.sync_api import sync_playwright
import time
import random
import string

def generate_random_string(length=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def test_teams_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Phase 1: Create Platform Admin -> Super Admin chain
        print("Logging in as Platform Admin...")
        page.goto("http://localhost:5173/login")
        page.fill('input[type="email"]', "test_padmin_1782454372@example.com")
        page.fill('input[type="password"]', "SecurePass123!")
        page.click('button[type="submit"]')
        page.wait_for_url("**/platform")
        
        print("Creating a new Organization...")
        page.click("text=New Organization")
        
        org_name = f"Acme {generate_random_string()}"
        page.fill('label:has-text("Organization Name") ~ input', org_name)
        page.click('button:has-text("Create Organization")')

        print("Bootstrapping Super Admin...")
        page.wait_for_selector('text=Now create this organization\'s first Super Admin')
        super_admin_email = f"sa_{generate_random_string()}@example.com"
        page.fill('label:has-text("Full Name") ~ input', "Acme Admin")
        page.fill('label:has-text("Email Address") ~ input', super_admin_email)
        page.click('button:has-text("Bootstrap Super Admin")')

        page.wait_for_selector(f'text={super_admin_email}')
        page.click('button:has-text("Close & Return to Console")')

        page.click("text=Sign Out")
        page.wait_for_url("**/login")

        # Phase 2: Sign Up as Super Admin
        print("Logging in as new Super Admin...")
        page.click("text=Need to test? Toggle temporary sign up")
        
        page.fill('input[type="email"]', super_admin_email)
        page.fill('input[type="password"]', "SecurePass123!")
        page.click('button:has-text("Sign Up")')

        page.wait_for_url("**/dashboard/teams")
        print("✅ Success! Logged in as Super Admin and reached /dashboard/teams.")
        
        # Test creating a team
        page.click("div.flex.justify-between >> text=Create Team")
        page.fill('label:has-text("Team Name") ~ input', "Sales Team")
        page.click('form button[type="submit"]:has-text("Create Team")')
        page.wait_for_selector("td >> text=Sales Team")
        print("✅ Success! Team created.")
        
        # Test editing a team
        page.click("text=Edit")
        page.fill('input[type="text"]', "Sales Team Updated")
        page.click("button:has(svg.lucide-check)") # Click the checkmark button to save
        page.wait_for_selector("td >> text=Sales Team Updated")
        print("✅ Success! Team edited.")

        browser.close()

test_teams_flow()
