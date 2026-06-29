from playwright.sync_api import sync_playwright
import time
import random
import string

def generate_random_string(length=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def test_members_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Phase 1: Bootstrap Org and Super Admin
        print("Logging in as Platform Admin...")
        page.goto("http://localhost:5173/login")
        page.fill('input[type="email"]', "test_padmin_1782454372@example.com")
        page.fill('input[type="password"]', "SecurePass123!")
        page.click('button[type="submit"]')
        page.wait_for_url("**/platform")
        
        page.click("text=New Organization")
        org_name = f"Acme {generate_random_string()}"
        page.fill('label:has-text("Organization Name") ~ input', org_name)
        page.click('button:has-text("Create Organization")')

        page.wait_for_selector('text=Now create this organization\'s first Super Admin')
        super_admin_email = f"sa_{generate_random_string()}@example.com"
        page.fill('label:has-text("Full Name") ~ input', "Super Admin")
        page.fill('label:has-text("Email Address") ~ input', super_admin_email)
        page.click('button:has-text("Bootstrap Super Admin")')

        page.wait_for_selector(f'text={super_admin_email}')
        page.click('button:has-text("Close & Return to Console")')

        page.click("text=Sign Out")
        page.wait_for_url("**/login")

        # Phase 2: Sign Up as Super Admin
        print("Signing up as new Super Admin...")
        page.click("text=Need to test? Toggle temporary sign up")
        page.fill('input[type="email"]', super_admin_email)
        page.fill('input[type="password"]', "SecurePass123!")
        page.click('button:has-text("Sign Up")')
        page.wait_for_url("**/dashboard/teams")
        
        # Create a team
        print("Creating a team...")
        page.click("div.flex.justify-between >> text=Create Team")
        page.fill('label:has-text("Team Name") ~ input', "Engineering")
        page.click('form button[type="submit"]:has-text("Create Team")')
        page.wait_for_selector("td >> text=Engineering")
        
        # Phase 3: Invite and Promote a Team Admin
        print("Navigating to Members Page...")
        page.click("nav a:has-text('Members')")
        page.wait_for_url("**/dashboard/members")

        print("Inviting a member...")
        page.click("button:has-text('Invite Member')")
        team_admin_email = f"ta_{generate_random_string()}@example.com"
        page.fill('label:has-text("Full Name") ~ input', "Team Admin")
        page.fill('label:has-text("Email Address") ~ input', team_admin_email)
        
        # Select "Engineering" team
        page.select_option('label:has-text("Team (Optional)") ~ select', label="Engineering")
        page.click('button:has-text("Send Invite")')

        page.wait_for_selector("text=they'll gain access once they sign up")
        page.click('button:has-text("Close")')

        # Promote to Team Admin
        print("Promoting member to Team Admin...")
        page.click("button:has-text('Promote')")
        page.on("dialog", lambda dialog: dialog.accept()) # Accept the confirm prompt
        # Actually, clicking 'Promote' will trigger the native window.confirm, so we need to set up the handler BEFORE clicking
        
        # We missed it above, so let's re-eval the promotion logic:
        # Playwright auto-dismisses dialogs by default! We MUST explicitly accept it.
        # Let's fix that below.
        pass

def fixed_test_members_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Handle all confirms automatically
        page.on("dialog", lambda dialog: dialog.accept())

        # Phase 1: Bootstrap Org and Super Admin
        print("Logging in as Platform Admin...")
        page.goto("http://localhost:5173/login")
        page.fill('input[type="email"]', "test_padmin_1782454372@example.com")
        page.fill('input[type="password"]', "SecurePass123!")
        page.click('button[type="submit"]')
        page.wait_for_url("**/platform")
        
        page.click("text=New Organization")
        org_name = f"Acme {generate_random_string()}"
        page.fill('label:has-text("Organization Name") ~ input', org_name)
        page.click('button:has-text("Create Organization")')

        page.wait_for_selector('text=Now create this organization\'s first Super Admin')
        super_admin_email = f"sa_{generate_random_string()}@example.com"
        page.fill('label:has-text("Full Name") ~ input', "Super Admin")
        page.fill('label:has-text("Email Address") ~ input', super_admin_email)
        page.click('button:has-text("Bootstrap Super Admin")')

        page.wait_for_selector(f'text={super_admin_email}')
        page.click('button:has-text("Close & Return to Console")')

        page.click("text=Sign Out")
        page.wait_for_url("**/login")

        # Phase 2: Sign Up as Super Admin
        print("Signing up as new Super Admin...")
        page.click("text=Need to test? Toggle temporary sign up")
        page.fill('input[type="email"]', super_admin_email)
        page.fill('input[type="password"]', "SecurePass123!")
        page.click('button:has-text("Sign Up")')
        page.wait_for_url("**/dashboard/teams")
        
        # Create a team
        print("Creating a team...")
        page.click("div.flex.justify-between >> text=Create Team")
        page.fill('label:has-text("Team Name") ~ input', "Engineering")
        page.click('form button[type="submit"]:has-text("Create Team")')
        page.wait_for_selector("td >> text=Engineering")
        
        # Phase 3: Invite and Promote a Team Admin
        print("Navigating to Members Page...")
        page.click("nav a:has-text('Members')")
        page.wait_for_url("**/dashboard/members")

        print("Inviting a member...")
        page.click("button:has-text('Invite Member')")
        team_admin_email = f"ta_{generate_random_string()}@example.com"
        page.fill('label:has-text("Full Name") ~ input', "Team Admin")
        page.fill('label:has-text("Email Address") ~ input', team_admin_email)
        
        # Select "Engineering" team
        page.select_option('label:has-text("Team (Optional)") ~ select', label="Engineering")
        page.click('button:has-text("Send Invite")')

        page.wait_for_selector("text=they'll gain access once they sign up")
        page.click('button:has-text("Close")')

        # Promote to Team Admin
        print("Promoting member to Team Admin...")
        page.click("button:has-text('Promote')")
        
        # Verify role updated in the table
        page.wait_for_selector("td >> text=team admin")
        print("✅ Promoted to Team Admin.")

        # Log out
        page.click("text=Sign Out")
        page.wait_for_url("**/login")

        # Phase 4: Sign up and test as Team Admin
        print("Signing up as Team Admin...")
        page.click("text=Need to test? Toggle temporary sign up")
        page.fill('input[type="email"]', team_admin_email)
        page.fill('input[type="password"]', "SecurePass123!")
        page.click('button:has-text("Sign Up")')
        
        # Team Admins land on /dashboard/my-team
        page.wait_for_url("**/dashboard/my-team")
        print("✅ Reached /dashboard/my-team.")
        
        # Invite a normal member as Team Admin
        print("Inviting normal member as Team Admin...")
        page.click("button:has-text('Invite Member')")
        member_email = f"member_{generate_random_string()}@example.com"
        page.fill('label:has-text("Full Name") ~ input', "Regular Member")
        page.fill('label:has-text("Email Address") ~ input', member_email)
        
        # Verify the Team/Role selectors do NOT exist for Team Admin
        assert not page.is_visible('label:has-text("Team (Optional)")')
        assert not page.is_visible('label:has-text("Role")')
        
        page.click('button:has-text("Send Invite")')
        page.wait_for_selector("text=they'll gain access once they sign up")
        print("✅ Success! E2E Flow verified.")

        browser.close()

if __name__ == "__main__":
    fixed_test_members_flow()
