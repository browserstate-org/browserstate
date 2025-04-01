#!/usr/bin/env python3
"""
Python verification script for cross-language interop test.
This script verifies browser state created by the TypeScript implementation.
"""

import os
import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
from browserstate import BrowserState, BrowserStateOptions, RedisStorage

# Redis configuration for Python
REDIS_URL = "redis://localhost:6379/0"
REDIS_KEY_PREFIX = "browserstate:"

# Test constants - must match TypeScript test
SESSION_ID = "typescript_to_python_test"
USER_ID = "interop_test_user"

# Debug mode - set to True to see browser UI
DEBUG = False

# Path to the test HTML file - using absolute path to ensure same origin
TEST_HTML_PATH = Path(__file__).parent.parent.parent.parent / "typescript" / "examples" / "shared" / "test.html"
TEST_URL = f"file://{TEST_HTML_PATH.absolute()}"

async def verify_typescript_state():
    """Verify the browser state created by TypeScript."""
    print("\n🔍 Verifying TypeScript-created browser state")
    
    # Create a Redis storage provider with the correct URL format
    redis_options = {
        "redis_url": REDIS_URL,
        "key_prefix": REDIS_KEY_PREFIX
    }
    
    # Initialize browser state with Redis storage
    options = BrowserStateOptions(
        user_id=USER_ID,
        redis_options=redis_options
    )
    browser_state = BrowserState(options)
    
    # List available sessions
    sessions = browser_state.list_sessions()
    print(f"📋 Available sessions: {sessions}")
    
    if SESSION_ID not in sessions:
        print(f"❌ Session '{SESSION_ID}' not found")
        return
    
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
                if typescript_notes:
                    print(f"✅ Found {len(typescript_notes)} TypeScript-created notes")
                else:
                    print("❌ No TypeScript-created notes found")
            else:
                print("❌ No notes found in localStorage")
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
            
        finally:
            await browser.close()
    
    # Unmount the session
    browser_state.unmount_session()
    print("✅ Verification complete")

if __name__ == "__main__":
    asyncio.run(verify_typescript_state()) 