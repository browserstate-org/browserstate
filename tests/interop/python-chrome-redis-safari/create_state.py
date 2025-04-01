#!/usr/bin/env python3
"""
Python to Safari Browser Interoperability Test

This script creates browser state in Chrome and stores it in Redis,
which can then be loaded by Safari to test cross-browser interoperability.
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

# Test constants
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

async def create_browser_state():
    """Create browser state in Chrome and store it in Redis."""
    print("🚀 Starting Chrome State Creation using Python\n")

    try:
        # Initialize BrowserState with Redis storage
        print("🔧 Creating BrowserState with Redis storage...")
        options = BrowserStateOptions(
            user_id=USER_ID,
            redis_options=REDIS_CONFIG
        )
        browser_state = BrowserState(options)

        # List existing sessions
        print("\n📋 Listing existing sessions...")
        sessions = browser_state.list_sessions()
        print(f"Found {len(sessions)} session(s): {', '.join(sessions) if sessions else 'None'}")

        # Mount the session
        print(f"\n📥 Mounting session: {SESSION_ID}")
        mount_result = browser_state.mount_session(SESSION_ID)
        user_data_dir = mount_result["path"]
        print(f"📂 Mounted at: {user_data_dir}")

        # Launch Chrome browser with the mounted state
        print("\n🌐 Launching Chrome browser with Playwright...")
        async with async_playwright() as p:
            browser = await p.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=not DEBUG
            )

            try:
                # Create a new page
                page = await browser.new_page()

                # Navigate to the test HTML page
                print(f"\n📄 Loading test page: {TEST_URL}")
                await page.goto(TEST_URL)
                print("✅ Test page loaded")
                
                # Clear existing localStorage to start fresh
                await page.evaluate("() => { localStorage.clear(); }")
                
                # Wait for the page to load completely
                await page.wait_for_timeout(1000)

                # Add Chrome-specific test data to localStorage
                print("\n📝 Adding Chrome-specific test data to localStorage...")
                
                # Add notes to localStorage
                test_notes = [
                    "Python-Chrome created note 1",
                    "Python-Chrome created note 2",
                    "Python-Chrome created note 3"
                ]

                for note in test_notes:
                    await page.fill("#noteInput", note)
                    await page.click("button:text('Add Note')")
                    await page.wait_for_timeout(500)  # Wait for animation

                # Add browser metadata to localStorage
                await page.evaluate("""() => {
                    localStorage.setItem('browserMetadata', JSON.stringify({
                        browser: 'Chrome',
                        createdBy: 'Python',
                        timestamp: new Date().toISOString(),
                        userAgent: navigator.userAgent
                    }));
                }""")

                # Verify notes were added
                notes_count = await page.evaluate("""() => {
                    return JSON.parse(localStorage.getItem('notes') || '[]').length;
                }""")
                
                # Verify notes were added successfully
                if notes_count != len(test_notes):
                    fail_test(f"Expected {len(test_notes)} notes, but found {notes_count}")
                
                print(f"✅ Added {notes_count} notes")

                # Get the notes data for verification
                notes_data = await page.evaluate("""() => {
                    return localStorage.getItem('notes');
                }""")
                
                # Get browser metadata
                metadata_json = await page.evaluate("""() => {
                    return localStorage.getItem('browserMetadata');
                }""")
                
                # Verify data is not empty
                if not notes_data or not metadata_json:
                    fail_test("Test data is empty")
                
                print(f"📝 Notes data: {notes_data}")
                print(f"📝 Browser metadata: {metadata_json}")
                
                # Wait to ensure data is properly saved
                await page.wait_for_timeout(1000)

            finally:
                await browser.close()

        # Unmount the session
        print("\n🔒 Unmounting session...")
        browser_state.unmount_session()
        print("✅ Session unmounted")

        print("\n✨ Chrome state creation complete!")
        print("Now run verify_state.py to verify the state in Safari")

    except Exception as e:
        fail_test(f"Error during Chrome state creation: {str(e)}")

if __name__ == "__main__":
    asyncio.run(create_browser_state()) 