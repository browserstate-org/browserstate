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
from browserstate import BrowserState, RedisStorage

# Redis configuration matching TypeScript example
REDIS_CONFIG = {
    "host": "localhost",
    "port": 6379,
    "password": None,
    "db": 0,
    "key_prefix": "browserstate:",
    "ttl": 604800  # 7 days
}

# Path to the test HTML file
TEST_HTML_PATH = Path(__file__).parent.parent.parent.parent / "typescript" / "examples" / "shared" / "test.html"

async def verify_typescript_state():
    """Verify the browser state created by TypeScript."""
    print("\n🔍 Verifying TypeScript-created browser state")
    
    # Initialize browser state with Redis storage
    browser_state = BrowserState(
        user_id="interop_test_user",
        storage_type="redis",
        redis_options=REDIS_CONFIG
    )
    
    # Test session ID
    session_id = "typescript_to_python_test"
    
    # List available sessions
    sessions = browser_state.list_sessions()
    print(f"📋 Available sessions: {sessions}")
    
    if session_id not in sessions:
        print(f"❌ Session '{session_id}' not found")
        return
    
    # Mount the session
    state = browser_state.mount_session(session_id)
    print(f"📂 Mounted session at: {state['path']}")
    
    async with async_playwright() as p:
        # Launch browser with the mounted state
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=state["path"],
            headless=False
        )
        
        try:
            # Create a new page
            page = await browser.new_page()
            
            # Navigate to the test HTML page
            await page.goto(f"file://{TEST_HTML_PATH}")
            print("📄 Loaded test page")
            
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
            
        finally:
            await browser.close()
    
    # Unmount the session
    browser_state.unmount_session()
    print("✅ Verification complete")

if __name__ == "__main__":
    asyncio.run(verify_typescript_state()) 