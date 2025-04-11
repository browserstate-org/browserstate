# 🧠 BrowserState for Python

> Auth & memory for AI agents and browser automation — now in Python.

[![PyPI version](https://badge.fury.io/py/browserstate.svg)](https://pypi.org/project/browserstate/)

BrowserState lets agents and automation tools act like real, returning users. It captures and restores full browser session state — enabling persistent identity, stable automation, and reliable behavior at scale.

---

## 🚀 Install

```bash
pip install browserstate
```

Or with [uv](https://github.com/astral-sh/uv):

```bash
uv pip install browserstate
```

---

## 🧭 Why BrowserState?

Most browser automations fail because sessions reset every run. Fingerprints drift, cookies vanish, and re-auth prompts kill workflows.

**BrowserState makes browser identity portable.**  
It captures and restores the full browser context: cookies, storage, fingerprints, service workers, and more — across environments and tools.

---

## ✨ Key Features

- ✅ Full browser context save & restore
- 🔁 Portable across machines, clouds, CI pipelines
- 🧠 Works with Playwright, Selenium, Pyppeteer, AI agents
- 🛡️ Bot detection resistant (no more fingerprint drift)
- ☁️ Pluggable storage (Local, Redis, S3, GCS)
- 🐛 Capture failed sessions for debugging + rehydration

---

## 🛠️ Quickstart

### 1. Configure BrowserState

```python
from browserstate import BrowserState, BrowserStateOptions

options = BrowserStateOptions(
    user_id="user-123",
    local_storage_path="./sessions"
)

state = BrowserState(options)
```

---

## 🔐 Example: Automating Login + Capturing State (LinkedIn)

BrowserState doesn't include login automation, but you can pair it with your own Playwright/Selenium scripts.

Here’s a simple Playwright example using hardcoded credentials:

```python
from browserstate import BrowserState, BrowserStateOptions
from playwright.async_api import async_playwright

state = BrowserState(BrowserStateOptions(
    user_id="linkedin-user",
    local_storage_path="./sessions"
))

async def login_and_capture():
    session_id = "linkedin-session"
    session_path = await state.mount(session_id)

    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=session_path,
            headless=False
        )
        page = await browser.new_page()
        await page.goto("https://www.linkedin.com/login")

        await page.fill("#username", "you@example.com")
        await page.fill("#password", "yourpassword")
        await page.click("button[type='submit']")

        await page.wait_for_url("https://www.linkedin.com/feed", timeout=10000)
        await browser.close()

    await state.unmount()

# asyncio.run(login_and_capture())
```

You can then **reuse that session** later without logging in again:

```python
session_path = await state.mount("linkedin-session")

async with async_playwright() as p:
    browser = await p.chromium.launch_persistent_context(
        user_data_dir=session_path,
        headless=True,
    )
    page = await browser.new_page()
    await page.goto("https://www.linkedin.com/feed")
    # Should already be logged in
```

---

## 🔄 Other Storage Providers

```python
# S3
BrowserStateOptions(
    user_id="agent123",
    s3_options={
        "bucket": "my-browserstate-bucket",
        "aws_access_key_id": "...",
        "aws_secret_access_key": "...",
        "region_name": "us-west-2"
    }
)

# Redis
BrowserStateOptions(
    user_id="agent123",
    redis_options={
        "host": "localhost",
        "port": 6379,
        "key_prefix": "browserstate"
    }
)
```

---

## 📚 Full API

```python
await state.mount(session_id: str) -> str        # Restores session
await state.unmount() -> None                    # Uploads & cleans up session
await state.list_sessions() -> List[str]         # Lists all sessions
await state.delete_session(session_id: str)      # Deletes from storage
state.get_current_session() -> Optional[str]     # ID of mounted session
state.get_current_session_path() -> Optional[str]# Path to local session
```

---

## 🧪 Debugging & Reliability

BrowserState enables session capture after failed runs so you can:
- Reproduce bugs locally
- Test flows against known state
- Cache login sessions across tests or agents

---

## 📫 Stay Updated

- 🧠 [Docs](https://browserstate.io)
- 💬 [GitHub](https://github.com/browserstate-org/browserstate)
- 📨 Join our waitlist or Slack for early access & support
