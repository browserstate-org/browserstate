#!/usr/bin/env python3
import os
import sys
import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
from browserstate import BrowserState, BrowserStateOptions

# Constants
USER_ID = "interop_test_user"
REDIS_CONFIG = {
    "redis_url": "redis://localhost:6379/0",
    "key_prefix": "browserstate"
}
# Resolve test HTML page path (assumes test_page/test.html relative to tests/interop)
TEST_PAGE_PATH = Path(__file__).resolve().parent.parent / "test_page" / "test.html"
TEST_URL = f"file://{TEST_PAGE_PATH}"

def fail_test(message):
    print(f"\n❌ TEST FAILED: {message}")
    sys.exit(1)

async def create_state(browser_name: str, session_id: str):
    print(f"🚀 [Python] Creating state for session '{session_id}' on browser '{browser_name}'")
    options = BrowserStateOptions(
        user_id=USER_ID,
        redis_options=REDIS_CONFIG
    )
    browser_state = BrowserState(options)
    
    # Mount the session (this returns a dictionary with a "path" key)
    mount_result = browser_state.mount_session(session_id)
    user_data_dir = mount_result["path"]
    print(f"📂 Mounted session at: {user_data_dir}")
    
    async with async_playwright() as p:
        browser_launcher = getattr(p, browser_name)
        context = await browser_launcher.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=True
        )
        try:
            page = await context.new_page()
            print(f"📄 Loading test page: {TEST_URL}")
            await page.goto(TEST_URL)
            await page.wait_for_timeout(1000)
            # Clear localStorage
            await page.evaluate("localStorage.clear();")
            # Add test notes by simulating input and clicking the button
            test_notes = [f"Python {browser_name} note {i+1}" for i in range(3)]
            for note in test_notes:
                await page.fill("#noteInput", note)
                await page.click("#addNoteButton")
                await page.wait_for_timeout(500)
            # Verify notes added
            notes_count = await page.evaluate("() => JSON.parse(localStorage.getItem('notes') || '[]').length")
            if notes_count != len(test_notes):
                fail_test(f"Expected {len(test_notes)} notes, but found {notes_count}")
            print(f"✅ Created {notes_count} notes on {browser_name}")
            # Store browser metadata
            await page.evaluate(f"""() => {{
                localStorage.setItem('browserMetadata', JSON.stringify({{
                    browser: '{browser_name}',
                    createdBy: 'Python',
                    timestamp: new Date().toISOString()
                }}));
            }}""")
            await page.wait_for_timeout(500)
        finally:
            await context.close()
    browser_state.unmount_session()
    print("✅ State creation complete.")

async def verify_state(browser_name: str, session_id: str):
    print(f"🔍 [Python] Verifying state for session '{session_id}' on browser '{browser_name}'")
    options = BrowserStateOptions(
        user_id=USER_ID,
        redis_options=REDIS_CONFIG
    )
    browser_state = BrowserState(options)
    sessions = browser_state.list_sessions()
    if session_id not in sessions:
        fail_test(f"Session '{session_id}' not found in Redis")
    mount_result = browser_state.mount_session(session_id)
    user_data_dir = mount_result["path"]
    print(f"📂 Mounted session at: {user_data_dir}")
    
    async with async_playwright() as p:
        browser_launcher = getattr(p, browser_name)
        context = await browser_launcher.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=True
        )
        try:
            page = await context.new_page()
            print(f"📄 Loading test page: {TEST_URL}")
            await page.goto(TEST_URL)
            await page.wait_for_timeout(1000)
            # Retrieve notes
            notes_json = await page.evaluate("() => localStorage.getItem('notes')")
            if not notes_json:
                fail_test("No notes found in localStorage")
            notes = json.loads(notes_json)
            print(f"📝 Found {len(notes)} notes:")
            for note in notes:
                print(f"  - {note['text']} at {note['timestamp']}")
            # Verify browser metadata
            metadata_json = await page.evaluate("() => localStorage.getItem('browserMetadata')")
            if metadata_json:
                metadata = json.loads(metadata_json)
                if metadata.get("browser") != browser_name:
                    fail_test(f"Expected browser metadata '{browser_name}', but got '{metadata.get('browser')}'")
            else:
                fail_test("No browser metadata found")
            print(f"✅ Verification successful for {browser_name}")
        finally:
            await context.close()
    browser_state.unmount_session()
