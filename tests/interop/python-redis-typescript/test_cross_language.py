#!/usr/bin/env python3
"""
Cross-language interop test using Playwright to verify browser state persistence
between Python and TypeScript implementations.
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

async def create_test_data(browser_state: BrowserState, session_id: str) -> None:
    """Create test data using Playwright and store it in Redis."""
    print(f"\n🔧 Creating test data in session: {session_id}")
    
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
            
            # Add some test notes
            test_notes = [
                "Python created note 1",
                "Python created note 2",
                "Python created note 3"
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
            
            # Get the notes data for verification
            notes_data = await page.evaluate("""() => {
                return localStorage.getItem('notes');
            }""")
            print(f"📝 Notes data: {notes_data}")
            
        finally:
            await browser.close()
    
    # Unmount the session to save changes
    browser_state.unmount_session()
    print("💾 Saved session state to Redis")

async def verify_test_data(browser_state: BrowserState, session_id: str) -> None:
    """Verify that the test data can be read by TypeScript implementation."""
    print(f"\n🔍 Verifying test data in session: {session_id}")
    
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
            else:
                print("❌ No notes found in localStorage")
            
        finally:
            await browser.close()
    
    # Unmount the session
    browser_state.unmount_session()
    print("✅ Verification complete")

async def main():
    """Main function to run the cross-language interop test."""
    print("🚀 Starting Python -> Redis -> TypeScript Interop Test\n")
    
    # Initialize browser state with Redis storage
    browser_state = BrowserState(
        user_id="interop_test_user",
        storage_type="redis",
        redis_options=REDIS_CONFIG
    )
    
    # Test session ID
    session_id = "cross_language_test"
    
    # Create test data with Python
    await create_test_data(browser_state, session_id)
    
    # Verify the data can be read
    await verify_test_data(browser_state, session_id)
    
    print("\n✨ Test completed successfully!")

if __name__ == "__main__":
    asyncio.run(main()) 