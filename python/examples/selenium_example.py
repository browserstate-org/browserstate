#!/usr/bin/env python3
"""
Example showing how to use BrowserState with Selenium to maintain browser state
between runs using local storage.
"""

import time
from browserstate import BrowserState, BrowserStateOptions
from webdriver_manager.chrome import ChromeDriverManager


def main():
    """Main function demonstrating BrowserState with Selenium"""
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
    except ImportError:
        print("Selenium not installed. Install with: pip install selenium")
        print("Also make sure you have ChromeDriver installed and in your PATH")
        return

    # Initialize BrowserState with local storage
    user_id = "demo_user"

    # Initialize Redis storage
    redis_options = {
        "redis_url": "redis://localhost:6379/0",
        "key_prefix": "browserstate_demo",
    }
    options = BrowserStateOptions(user_id=user_id, redis_options=redis_options)

    # options = BrowserStateOptions(user_id=user_id)
    browser_state = BrowserState(options)

    # List existing states
    states = browser_state.list_sessions()
    print(f"Available states: {states}")

    # Mount a state (reuse existing or create new)
    state_id = states[0] if states else None
    state = browser_state.mount_session(state_id)
    print(f"Mounted state: {state['id']} at {state['path']}")

    # Set up Chrome options with the user data directory
    chrome_options = Options()
    chrome_options.add_argument(f"--user-data-dir={state['path']}")

    # Initialize Chrome driver
    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()), options=chrome_options
    )

    try:
        # Navigate to a website
        driver.get("https://example.com")
        print("Page loaded, you can interact with the browser")

        # Set localStorage value using JavaScript
        driver.execute_script("""
            localStorage.setItem('browserstate_demo', 
                JSON.stringify({timestamp: new Date().toISOString()}));
        """)

        # Read localStorage value
        storage_value = driver.execute_script(
            "return localStorage.getItem('browserstate_demo');"
        )
        print(f"localStorage value: {storage_value}")

        # Wait for user to see the browser
        print("Browser open for 30 seconds. Press Ctrl+C to close earlier.")
        try:
            for _ in range(30):
                time.sleep(1)
        except KeyboardInterrupt:
            print("Closing browser...")
    finally:
        # Close the browser
        driver.quit()

    # Save the state
    browser_state.unmount_session()
    print(f"State saved: {state['id']}")

    # List states again
    states = browser_state.list_sessions()
    print(f"Available states: {states}")


if __name__ == "__main__":
    main()
