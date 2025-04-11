#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright
from browserstate import BrowserState, BrowserStateOptions
import signal
import sys


async def ask(question: str) -> str:
    """Ask a question and return the answer."""
    print(question, end="")
    return await asyncio.get_event_loop().run_in_executor(None, input)


async def main():
    # Ask if user wants to login
    action = await ask("Login? (yes/no): ")

    # Initialize BrowserState with correct Python API parameters
    options = BrowserStateOptions(
        user_id="yc_demo",  # Must match TypeScript demo's user_id
        redis_options={"host": "127.0.0.1", "port": 6379, "key_prefix": "browserstate"},
    )
    browser_state = BrowserState(options)

    # Mount the session
    session_id = "linkedin-session"
    print(f"Attempting to mount session: {session_id}")
    user_data_dir = await browser_state.mount(session_id)
    print(f"Mounted session at: {user_data_dir}")

    if action.lower().startswith("y"):
        # Login flow
        async with async_playwright() as p:
            browser = await p.chromium.launch_persistent_context(
                user_data_dir, headless=False, args=["--profile-directory=Default"]
            )
            page = await browser.new_page()
            await page.goto("https://www.linkedin.com/login")
            print("🔐 Please log in, then press Ctrl+C to save the session and quit.")

            # Create an event to signal when to end
            end_event = asyncio.Event()

            # Handle Ctrl+C to save session
            def handle_sigint(signum, frame):
                print("\nSaving session...")
                end_event.set()

            signal.signal(signal.SIGINT, handle_sigint)

            # Wait for end signal
            await end_event.wait()
            await end_session(browser, browser_state)
            sys.exit(0)
    else:
        # Session injection flow
        async with async_playwright() as p:
            browser = await p.chromium.launch_persistent_context(
                user_data_dir, headless=False, args=["--profile-directory=Default"]
            )
            page = await browser.new_page()

            # Navigate to LinkedIn feed
            print("Navigating to LinkedIn feed...")
            await page.goto("https://www.linkedin.com/feed/")

            # Try to create a post to verify session
            try:
                print("Verifying session by attempting to create a post...")
                await page.wait_for_selector(
                    'button:has-text("Start a post")', timeout=10000
                )
                await page.click('button:has-text("Start a post")')
                await page.wait_for_timeout(1500)
                await page.fill(
                    '[role="textbox"]', "Posted via BrowserState Python Demo"
                )
                print("\n✅ Session reopened successfully!")
            except Exception as e:
                print(f"\n❌ Error verifying session: {e}")
                print("This might mean:")
                print("1. The session wasn't properly saved in the login step")
                print("2. The session has expired")
                print("3. LinkedIn's UI has changed")

            print("\nPress Ctrl+C when you want to end the session...")

            # Create an event to signal when to end
            end_event = asyncio.Event()

            # Handle Ctrl+C to end session
            def handle_sigint(signum, frame):
                print("\nEnding session...")
                end_event.set()

            signal.signal(signal.SIGINT, handle_sigint)

            # Wait for end signal
            await end_event.wait()
            await end_session(browser, browser_state)
            sys.exit(0)


async def end_session(browser, browser_state):
    """End the session and cleanup"""
    await browser.close()
    await browser_state.unmount()
    print("✅ Session ended successfully!")


if __name__ == "__main__":
    asyncio.run(main())
