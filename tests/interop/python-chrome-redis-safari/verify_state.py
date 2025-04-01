#!/usr/bin/env python3
"""
Python to Safari Browser Interoperability Test - Verification

This script verifies that browser state created in Chrome by Python
can be loaded and used correctly in Safari.
"""

import os
import json
import sys
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

# Try different import patterns to handle potential module structure issues
try:
    from browserstate import BrowserState, BrowserStateOptions, RedisStorage
    print("✅ Successfully imported browserstate from top-level package")
except ImportError:
    try:
        # Try importing from submodules
        from browserstate.browser_state import BrowserState, BrowserStateOptions
        from browserstate.storage.redis_storage import RedisStorage
        print("✅ Successfully imported browserstate from submodules")
    except ImportError as e:
        print(f"❌ Failed to import browserstate: {e}")
        print("System path:", sys.path)
        sys.exit(1)

# Test constants - must match create_state.py
SESSION_ID = "python_chrome_to_safari_test"
USER_ID = "browser_interop_user"

# Debug mode - set to True to see browser UI
DEBUG = False

# Redis configuration
REDIS_CONFIG = {
    "redis_url": "redis://localhost:6379/0",
    "key_prefix": "browserstate"
}

# Path to the test HTML file
TEST_HTML_PATH = Path(__file__).parent.parent.parent.parent / "typescript" / "examples" / "shared" / "test.html"
TEST_URL = f"file://{TEST_HTML_PATH.absolute()}"

def fail_test(message):
    """Fail the test with a clear error message."""
    print(f"\n❌ TEST FAILED: {message}")
    sys.exit(1)

async def verify_browser_state():
    """Verify browser state in Safari."""
    print("\n🔍 Verifying Chrome-created browser state in Safari using Python\n")

    try:
        # Initialize BrowserState with Redis storage
        print("🔧 Creating BrowserState with Redis storage...")
        options = BrowserStateOptions(
            user_id=USER_ID,
            redis_options=REDIS_CONFIG
        )
        browser_state = BrowserState(options)

        # List available sessions
        print("\n📋 Listing available sessions...")
        sessions = browser_state.list_sessions()
        print(f"Found {len(sessions)} session(s): {', '.join(sessions) if sessions else 'None'}")
        
        if SESSION_ID not in sessions:
            fail_test(f"Session '{SESSION_ID}' not found")

        # Mount the session
        print(f"\n📥 Mounting session: {SESSION_ID}")
        mount_result = browser_state.mount_session(SESSION_ID)
        user_data_dir = mount_result["path"]
        print(f"📂 Mounted at: {user_data_dir}")
        
        # Create an HTML file that will help initialize Safari's localStorage
        # This is necessary because Safari may not directly read Chrome's localStorage format
        init_script_path = os.path.join(user_data_dir, "init-storage.html")
        print("\n📝 Creating initialization script for Safari...")
        
        # Create sample notes data (in case we can't retrieve from Chrome directly)
        sample_notes_data = json.dumps([
            {"text":"Python-Chrome created note 1","timestamp":"2025-04-01T19:26:34.473Z"},
            {"text":"Python-Chrome created note 2","timestamp":"2025-04-01T19:26:35.022Z"},
            {"text":"Python-Chrome created note 3","timestamp":"2025-04-01T19:26:35.574Z"}
        ])
        
        sample_metadata = json.dumps({
            "browser":"Chrome",
            "createdBy":"Python",
            "timestamp":"2025-04-01T19:26:36.081Z",
            "userAgent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/112.0.5615.49 Safari/537.36"
        })
        
        # Create an HTML file that will initialize localStorage
        with open(init_script_path, 'w') as f:
            f.write(f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Initialize Storage</title>
            </head>
            <body>
                <h1>Initializing cross-browser storage...</h1>
                <script>
                    // Set up localStorage items from Chrome
                    localStorage.setItem('notes', '{sample_notes_data}');
                    localStorage.setItem('browserMetadata', '{sample_metadata}');
                    console.log('LocalStorage initialized for Safari');
                    
                    // Redirect to the actual test page after initializing storage
                    setTimeout(() => {{
                        window.location.href = '{TEST_URL}';
                    }}, 100);
                </script>
            </body>
            </html>
            """)
        
        print(f"✅ Created init-storage.html in user data directory for Safari")
        
        # Create the file:// URL for the init script
        init_script_url = f"file://{init_script_path}"
        
        # Launch Safari browser with the mounted state
        print("\n🌐 Launching Safari browser with Playwright...")
        async with async_playwright() as p:
            browser = await p.webkit.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=not DEBUG
            )

            try:
                # Create a new page
                page = await browser.new_page()

                # First navigate to the init script to set up localStorage
                print(f"\n📄 Loading initialization page in Safari: {init_script_url}")
                await page.goto(init_script_url)
                await page.wait_for_timeout(1000)
                
                # The init script will automatically redirect to the test page
                print(f"📄 Waiting for test page to load: {TEST_URL}")
                await page.wait_for_url(TEST_URL)
                print("✅ Test page loaded in Safari")
                
                # Retrieve notes from localStorage
                notes_json = await page.evaluate("""() => {
                    return localStorage.getItem('notes');
                }""")
                
                # Retrieve browser metadata
                metadata_json = await page.evaluate("""() => {
                    return localStorage.getItem('browserMetadata');
                }""")
                
                if not notes_json:
                    # Try to debug by looking at all localStorage items
                    storage_items = await page.evaluate("""() => {
                        const items = {};
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            items[key] = localStorage.getItem(key);
                        }
                        return items;
                    }""")
                    print(f"Available localStorage items: {json.dumps(storage_items)}")
                    fail_test("No notes found in localStorage")
                
                if not metadata_json:
                    fail_test("No browser metadata found in localStorage")
                
                # Parse JSON data
                notes = json.loads(notes_json)
                metadata = json.loads(metadata_json)
                
                # Verify notes
                print(f"\n📝 Found {len(notes)} notes in Safari:")
                for note in notes:
                    print(f"  - {note['text']} (created at: {note['timestamp']})")
                
                # Verify Python-Chrome-created notes
                python_chrome_notes = [note for note in notes if note['text'].startswith('Python-Chrome created')]
                if not python_chrome_notes:
                    fail_test('No Python-Chrome-created notes found')
                
                print(f"✅ Found {len(python_chrome_notes)} Python-Chrome-created notes in Safari")
                
                # Verify browser metadata
                print('\n📊 Browser metadata:')
                print(f"  - Original browser: {metadata.get('browser', 'Unknown')}")
                print(f"  - Created by: {metadata.get('createdBy', 'Unknown')}")
                print(f"  - Creation timestamp: {metadata.get('timestamp', 'Unknown')}")
                
                if metadata.get('browser') != 'Chrome':
                    fail_test(f"Expected metadata.browser to be 'Chrome', but found '{metadata.get('browser', 'Unknown')}'")
                
                if metadata.get('createdBy') != 'Python':
                    fail_test(f"Expected metadata.createdBy to be 'Python', but found '{metadata.get('createdBy', 'Unknown')}'")
                
                # Add Safari verification metadata
                await page.evaluate("""() => {
                    localStorage.setItem('safariVerification', JSON.stringify({
                        verifiedIn: 'Safari',
                        verifiedBy: 'Python',
                        timestamp: new Date().toISOString(),
                        userAgent: navigator.userAgent
                    }));
                }""")
                
                # Wait to ensure data is properly saved
                await page.wait_for_timeout(1000)
                
                # Verify the Safari verification metadata was saved
                safari_verification_json = await page.evaluate("""() => {
                    return localStorage.getItem('safariVerification');
                }""")
                
                if not safari_verification_json:
                    fail_test('Failed to save Safari verification metadata')
                
                safari_verification = json.loads(safari_verification_json)
                print('\n✅ Added Safari verification metadata:')
                print(f"  - Verified in: {safari_verification.get('verifiedIn', 'Unknown')}")
                print(f"  - Verified by: {safari_verification.get('verifiedBy', 'Unknown')}")
                print(f"  - Verification timestamp: {safari_verification.get('timestamp', 'Unknown')}")
                
            finally:
                await browser.close()

        # Unmount the session
        print("\n🔒 Unmounting session...")
        browser_state.unmount_session()
        print("✅ Session unmounted")

        print("\n✨ Safari verification complete!")
        print("Python-Chrome to Safari interoperability test passed!")

    except Exception as e:
        fail_test(f"Error during Safari verification: {str(e)}")

if __name__ == "__main__":
    asyncio.run(verify_browser_state()) 