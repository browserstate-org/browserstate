#!/usr/bin/env python3
"""
Cross-language interop test using Playwright to verify browser state persistence
between Python and TypeScript implementations.
"""

import os
import json
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright
from browserstate import BrowserState, BrowserStateOptions

# Redis configuration for Python
REDIS_OPTIONS = {
    "host": "localhost",
    "port": 6379,
    "key_prefix": "browserstate",
    "password": None,
    "db": 0,
}

# Test session ID - must be the same across Python and TypeScript
SESSION_ID = "cross_language_test"
USER_ID = "interop_test_user"

# Path to the test HTML file
TEST_HTML_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "typescript"
    / "examples"
    / "shared"
    / "test.html"
)
TEST_URL = f"file://{TEST_HTML_PATH.absolute()}"

# Debug mode - set to True to see browser UI during tests
DEBUG = os.environ.get("HEADLESS", "false").lower() != "true"


def fail_test(message):
    """Fail the test with a clear error message."""
    print(f"\n❌ TEST FAILED: {message}")
    sys.exit(1)


async def create_test_data(browser_state: BrowserState, session_id: str) -> None:
    """Create test data using Playwright and store it in Redis."""
    print(f"\n🔧 Creating test data in session: {session_id}")

    # Mount the session
    state = await browser_state.mount(session_id)
    print(f"📂 Mounted session at: {state}")

    async with async_playwright() as p:
        # Launch browser with the mounted state
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=state, headless=not DEBUG
        )

        try:
            # Create a new page
            page = await browser.new_page()

            # Navigate to the test HTML page
            print(f"📄 Loading test page: {TEST_URL}")
            await page.goto(TEST_URL)

            # Clear existing localStorage
            await page.evaluate("""() => {
                localStorage.clear();
            }""")

            # Add some test notes
            test_notes = [
                "Python created note 1",
                "Python created note 2",
                "Python created note 3",
            ]

            for note in test_notes:
                await page.fill("#noteInput", note)
                await page.click("button:text('Add Note')")
                await page.wait_for_timeout(500)  # Wait for animation

            # Verify notes were added
            notes_count = await page.evaluate("""() => {
                return JSON.parse(localStorage.getItem('notes') || '[]').length;
            }""")
            print(f"✅ Added {notes_count} notes")

            # Assert that notes were actually added
            if notes_count != len(test_notes):
                fail_test(f"Expected {len(test_notes)} notes, but found {notes_count}")

            # Get the notes data for verification
            notes_data = await page.evaluate("""() => {
                return localStorage.getItem('notes');
            }""")
            print(f"📝 Notes data: {notes_data}")

            # Verify notes data is not empty
            if not notes_data:
                fail_test("Notes data is empty")

            # Wait to ensure data is properly saved
            await page.wait_for_timeout(1000)

        finally:
            await browser.close()

    # Unmount the session to save changes
    await browser_state.unmount()
    print("💾 Saved session state to Redis")


async def verify_test_data(browser_state: BrowserState, session_id: str) -> None:
    """Verify that the test data can be read by TypeScript implementation."""
    print(f"\n🔍 Verifying test data in session: {session_id}")

    # Mount the session
    state = await browser_state.mount(session_id)
    print(f"📂 Mounted session at: {state}")

    async with async_playwright() as p:
        # Launch browser with the mounted state
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=state, headless=not DEBUG
        )

        try:
            # Create a new page
            page = await browser.new_page()

            # Navigate to the test HTML page - using the EXACT same URL
            print(f"📄 Loading test page: {TEST_URL}")
            await page.goto(TEST_URL)

            # Wait for the page to load completely
            await page.wait_for_timeout(1000)

            # Get the notes data
            notes_data = await page.evaluate("""() => {
                return localStorage.getItem('notes');
            }""")

            if notes_data:
                notes = json.loads(notes_data)
                print(f"📝 Found {len(notes)} notes:")
                for note in notes:
                    print(f"  - {note['text']} ({note['timestamp']})")

                # Verify that we have Python notes
                python_notes = [
                    note
                    for note in notes
                    if note["text"].startswith("Python created note")
                ]
                if not python_notes:
                    fail_test("No Python-created notes found in localStorage")

                print(f"✅ Found {len(python_notes)} Python-created notes")
            else:
                # Try to debug by looking at all localStorage items
                storage_items = await page.evaluate("""() => {
                    const items = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        items[key] = localStorage.getItem(key);
                    }
                    return items;
                }""")
                print(f"Available localStorage items: {storage_items}")
                fail_test("No notes found in localStorage")

        finally:
            await browser.close()

    # Unmount the session
    await browser_state.unmount()
    print("✅ Verification complete")


async def main():
    """Main function to run the cross-language interop test."""
    print("🚀 Starting Python -> Redis -> TypeScript Interop Test\n")

    # Initialize browser state with Redis storage
    options = BrowserStateOptions(user_id=USER_ID, redis_options=REDIS_OPTIONS)
    browser_state = BrowserState(options)

    # See if there's an existing session to clean up
    sessions = await browser_state.list_sessions()
    if f"{USER_ID}:{SESSION_ID}" in sessions:
        print(f"Cleaning up existing session: {SESSION_ID}")
        await browser_state.delete_session(SESSION_ID)

    # Create test data with Python
    await create_test_data(browser_state, SESSION_ID)

    # Verify the data can be read
    await verify_test_data(browser_state, SESSION_ID)

    print("\n✨ Test completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
