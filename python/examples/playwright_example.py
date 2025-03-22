#!/usr/bin/env python3
"""
Example showing how to use BrowserState with Playwright to maintain browser state
between runs using local storage.
"""

import asyncio
from browserstate import BrowserState, BrowserStateOptions

async def main():
    """Main function demonstrating BrowserState with Playwright"""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright not installed. Install with: pip install playwright")
        print("Then install browsers with: python -m playwright install")
        return
    
    # Initialize BrowserState with local storage
    user_id = "demo_user"
    options = BrowserStateOptions(user_id=user_id)
    browser_state = BrowserState(options)
    
    # List existing states
    states = browser_state.list_states()
    print(f"Available states: {states}")
    
    # Mount a state (reuse existing or create new)
    state_id = states[0] if states else None
    state = browser_state.mount_state(state_id)
    print(f"Mounted state: {state['id']} at {state['path']}")

    # Use Playwright with the mounted browser profile
    async with async_playwright() as p:
        # Launch browser with user data directory
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=state["path"],
            headless=False,
        )
        
        page = await browser.new_page()
        await page.goto("https://example.com")
        print("Page loaded, you can interact with the browser")
        
        # Set localStorage value
        await page.evaluate("""() => {
            localStorage.setItem('browserstate_demo', 
                JSON.stringify({timestamp: new Date().toISOString()}))
        }""")
        
        # Read localStorage value
        storage_value = await page.evaluate("() => localStorage.getItem('browserstate_demo')")
        print(f"localStorage value: {storage_value}")
        
        print("Browser open for 30 seconds. Press Ctrl+C to close earlier.")
        try:
            await asyncio.sleep(30)
        except KeyboardInterrupt:
            print("Closing browser...")
        
        await browser.close()
    
    # Save the state
    browser_state.unmount_state()
    print(f"State saved: {state['id']}")
    
    # List states again
    states = browser_state.list_states()
    print(f"Available states: {states}")

if __name__ == "__main__":
    asyncio.run(main()) 