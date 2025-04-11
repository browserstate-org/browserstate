#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright
from browserstate import BrowserState, BrowserStateOptions
import signal
import sys


async def ask(question: str) -> str:
    print(question, end="")
    return await asyncio.get_event_loop().run_in_executor(None, input)


async def main():
    options = BrowserStateOptions(
        user_id="demo_user",
        redis_options={
            "host": "127.0.0.1",
            "port": 6379,
            "key_prefix": "browserstate"
        }
    )
    browser_state = BrowserState(options)

    session_id = "linkedin-session"
    print(f"Attempting to mount session: {session_id}")
    user_data_dir = await browser_state.mount(session_id)
    print(f"Mounted session at: {user_data_dir}")

    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            args=["--profile-directory=Default"]
        )
        page = await browser.new_page()
        
        print("Navigating to LinkedIn feed...")
        await page.goto("https://www.linkedin.com/feed/")
        
        try:
            print("Verifying session by attempting to create a post...")
            await page.wait_for_selector('button:has-text("Start a post")', timeout=10000)
            await page.click('button:has-text("Start a post")')
            await page.wait_for_timeout(1500)
            await page.fill('[role="textbox"]', 'Posted via BrowserState Python Demo')
            print("\n✅ Session reopened successfully!")
        except Exception as e:
            print(f"\n❌ Error verifying session: {e}")
            print("This might mean:")
            print("1. The session wasn't properly saved in the TypeScript demo")
            print("2. The session has expired")
            print("3. LinkedIn's UI has changed")

        print("\nPress Ctrl+C when you want to end the session...")

        def handle_sigint(signum, frame):
            print("\nEnding session...")
            asyncio.create_task(end_session(browser, browser_state))
            sys.exit(0)

        signal.signal(signal.SIGINT, handle_sigint)

        while True:
            await asyncio.sleep(1)


async def end_session(browser, browser_state):
    await browser.close()
    await browser_state.unmount()
    print("✅ Session ended successfully!")


if __name__ == "__main__":
    asyncio.run(main())
