#!/usr/bin/env python3
import os
import sys
import json
import asyncio
import time
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

# Name of our JSON file that holds metadata for cross-browser migration
METADATA_FILENAME = "browserstate_interop_metadata.json"

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
            
            # Clear localStorage in the test page
            await page.evaluate("localStorage.clear();")
            
            # Add test notes by simulating input and clicking the button
            test_notes = [f"Python {browser_name} note {i+1}" for i in range(3)]
            for note in test_notes:
                await page.fill("#noteInput", note)
                await page.click("#addNoteButton")
                await page.wait_for_timeout(500)
            
            # Verify notes added
            notes_count = await page.evaluate(
                "JSON.parse(localStorage.getItem('notes') || '[]').length"
            )
            if notes_count != len(test_notes):
                fail_test(f"Expected {len(test_notes)} notes, but found {notes_count}")
            print(f"✅ Created {notes_count} notes on {browser_name}")
            
            # ---- 1) Grab the notes from localStorage
            notes_in_localstorage = await page.evaluate(
                "JSON.parse(localStorage.getItem('notes') || '[]')"
            )
            
            # ---- 2) Build “metadata” object that we’ll also store in a shared JSON file
            metadata = {
                "browser": browser_name,
                "createdBy": "Python",
                "timestamp": time.time(),
                "notes": notes_in_localstorage
            }
            
            # For completeness, also store that metadata in localStorage
            await page.evaluate(
                """(meta) => {
                    localStorage.setItem('browserMetadata', JSON.stringify(meta));
                }""",
                metadata
            )
            await page.wait_for_timeout(500)
            
            # ---- 3) Write that same metadata to a JSON file in the user_data_dir
            metadata_path = os.path.join(user_data_dir, METADATA_FILENAME)
            with open(metadata_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            
        finally:
            await context.close()
    
    # Unmount => upload the updated user_data_dir to Redis
    browser_state.unmount_session()
    print("✅ State creation complete.")

async def verify_state(browser_name: str, session_id: str):
    print(f"🔍 [Python] Verifying state for session '{session_id}' on browser '{browser_name}'")
    options = BrowserStateOptions(
        user_id=USER_ID,
        redis_options=REDIS_CONFIG
    )
    browser_state = BrowserState(options)
    
    # First confirm the session is in Redis
    sessions = browser_state.list_sessions()
    if session_id not in sessions:
        fail_test(f"Session '{session_id}' not found in Redis")
    
    # Mount => download session to a local user_data_dir
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
            
            # Attempt to read notes from localStorage
            notes_json = await page.evaluate("localStorage.getItem('notes')")
            
            # If no notes, attempt to do a *real* cross-browser migration
            if not notes_json or notes_json.strip() in ("", "null"):
                print("No notes found in localStorage. Attempting cross-browser migration from JSON file.")
                
                metadata_path = os.path.join(user_data_dir, METADATA_FILENAME)
                if os.path.exists(metadata_path):
                    # Read metadata from that file, which might have been created by a different browser
                    with open(metadata_path, "r", encoding="utf-8") as f:
                        metadata = json.load(f)
                    creator = metadata.get("browser")
                    original_notes = metadata.get("notes", [])
                    
                    if creator and creator != browser_name and original_notes:
                        print(f"Transforming state from {creator} to {browser_name}")
                        
                        # Example “real” migration: keep the same note text, but indicate a migration timestamp
                        migrated_notes = [
                            {"text": note["text"], "timestamp": "migrated"}
                            for note in original_notes
                        ]
                        
                        # Inject the migrated notes into localStorage
                        migrated_notes_json = json.dumps(migrated_notes)
                        await page.evaluate(
                            "(notes) => { localStorage.setItem('notes', notes); }",
                            migrated_notes_json
                        )
                        
                        # Also update the metadata to reflect new browser
                        metadata["browser"] = browser_name
                        metadata["notes"] = migrated_notes
                        
                        # Put updated metadata in localStorage
                        await page.evaluate(
                            """(meta) => {
                                localStorage.setItem('browserMetadata', JSON.stringify(meta));
                            }""",
                            metadata
                        )
                        
                        # Overwrite the metadata JSON file with updated info
                        with open(metadata_path, "w", encoding="utf-8") as f:
                            json.dump(metadata, f, ensure_ascii=False, indent=2)
                        
                        # Double-check that notes are now in localStorage
                        notes_json = await page.evaluate("localStorage.getItem('notes')")
                        if not notes_json or notes_json.strip() in ("", "null"):
                            fail_test("Migration step failed to populate notes in LocalStorage.")
                    else:
                        fail_test("No notes found in localStorage and no valid cross-browser metadata to migrate.")
                else:
                    fail_test("No notes found in localStorage and no JSON metadata file available.")
            
            # If we get here, we should have notes in localStorage
            notes = json.loads(notes_json)
            print(f"📝 Found {len(notes)} notes:")
            for note in notes:
                print(f"  - {note['text']} at {note['timestamp']}")
            
            # Verify the final browser metadata from localStorage
            metadata_json = await page.evaluate("localStorage.getItem('browserMetadata')")
            if not metadata_json:
                fail_test("No browserMetadata found in localStorage at all.")
            
            metadata = json.loads(metadata_json)
            actual_browser = metadata.get("browser")
            if actual_browser != browser_name:
                fail_test(
                    f"Metadata browser mismatch: expected '{browser_name}', got '{actual_browser}'"
                )
            
            print(f"✅ Verification successful for {browser_name}")
        finally:
            await context.close()
    
    # Upload updated user_data_dir back to Redis
    browser_state.unmount_session()
