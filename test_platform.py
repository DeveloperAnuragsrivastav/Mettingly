from playwright.sync_api import sync_playwright
import time
import random
import string

def generate_random_string(length=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def test_platform_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Step 1: Login as Platform Admin
        print("Logging in as Platform Admin...")
        page.goto("http://localhost:5173/login")
        page.fill('input[type="email"]', "test_padmin_1782454372@example.com")
        page.fill('input[type="password"]', "SecurePass123!")
        page.click('button[type="submit"]')
        page.wait_for_url("**/platform")
        page.wait_for_selector("text=Platform Console")
        print("✅ Landed on Platform Console.")

        # Step 2: Open Create Organization Modal
        print("Creating a new Organization...")
        page.click("text=New Organization")
        
        # Step 3: Fill Org Details
        org_name = f"Acme {generate_random_string()}"
        page.fill('label:has-text("Organization Name") ~ input', org_name)
        # Slug should auto-populate, verify it's there
        slug_value = page.input_value('label:has-text("URL Slug") ~ div input')
        print(f"Auto-generated slug: {slug_value}")
        page.click('button:has-text("Create Organization")')

        # Step 4: Bootstrap Super Admin
        print("Bootstrapping Super Admin...")
        page.wait_for_selector('text=Now create this organization\'s first Super Admin')
        super_admin_email = f"sa_{generate_random_string()}@example.com"
        page.fill('label:has-text("Full Name") ~ input', "Acme Admin")
        page.fill('label:has-text("Email Address") ~ input', super_admin_email)
        page.click('button:has-text("Bootstrap Super Admin")')

        # Step 5: Verify Success
        page.wait_for_selector(f'text={super_admin_email}')
        print(f"✅ Super Admin bootstrapped: {super_admin_email}")
        page.click('button:has-text("Close & Return to Console")')

        # Step 6: Log out
        page.click("text=Sign Out")
        page.wait_for_url("**/login")
        print("✅ Logged out.")

        # Step 7: Sign Up / Log in as the new Super Admin
        print("Logging in as new Super Admin...")
        # Note: In our current setup, signup is possible using the toggle!
        page.click("text=Need to test? Toggle temporary sign up")
        
        # We need to sign up first
        page.fill('input[type="email"]', super_admin_email)
        page.fill('input[type="password"]', "SecurePass123!")
        page.click('button:has-text("Sign Up")')

        page.wait_for_url("**/dashboard")
        assert "Dashboard" in page.content()
        print("✅ Success! Logged in as Super Admin and reached Dashboard.")

        browser.close()

test_platform_flow()
