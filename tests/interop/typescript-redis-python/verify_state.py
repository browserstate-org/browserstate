#!/usr/bin/env python3
"""
Python verification script for cross-language interop test.
This script verifies browser state created by the TypeScript implementation.
"""

import os
import json
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright
from browserstate import BrowserState, BrowserStateOptions, RedisStorage

# Redis configuration for Python
REDIS_CONFIG = {
    "host": "localhost",
    "port": 6379,
    "password": None,
    "db": 0,
    "key_prefix": "browserstate"
}

# Test constants - must match TypeScript test
SESSION_ID = "typescript_to_python_test"
USER_ID = "interop_test_user"

# Debug mode - set to True to see browser UI during tests
DEBUG = os.environ.get('HEADLESS', 'false').lower() != 'true'

# Path to the test HTML file - using absolute path to ensure same origin
TEST_HTML_PATH = Path(__file__).parent.parent.parent.parent / "typescript" / "examples" / "shared" / "test.html"
TEST_URL = f"file://{TEST_HTML_PATH.absolute()}"

def fail_test(message):
    """Fail the test with a clear error message."""
    print(f"\n❌ TEST FAILED: {message}")
    sys.exit(1)

async def verify_typescript_state():
    """Verify the browser state created by TypeScript."""
    print("\n🔍 Verifying TypeScript-created browser state")
    
    # Initialize browser state with Redis storage
    options = BrowserStateOptions(
        user_id=USER_ID,
        redis_options=REDIS_CONFIG
    )
    browser_state = BrowserState(options)
    
    # List available sessions
    sessions = browser_state.list_sessions()
    print(f"📋 Available sessions: {sessions}")
    
    if SESSION_ID not in sessions:
        fail_test(f"Session '{SESSION_ID}' not found")
    
    # Mount the session
    state = browser_state.mount_session(SESSION_ID)
    print(f"📂 Mounted session at: {state['path']}")
    
    async with async_playwright() as p:
        # Launch browser with the mounted state
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=state["path"],
            headless=not DEBUG
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
                
                # Verify the notes were created by TypeScript
                typescript_notes = [note for note in notes if note['text'].startswith('TypeScript created note')]
                if not typescript_notes:
                    fail_test("No TypeScript-created notes found")
                
                print(f"✅ Found {len(typescript_notes)} TypeScript-created notes")
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
    browser_state.unmount_session()
    print("✅ Verification complete")

if __name__ == "__main__":
    try:
        asyncio.run(verify_typescript_state())
    except Exception as e:
        fail_test(f"Unexpected error: {e}") 