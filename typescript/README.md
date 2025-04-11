# 🌐 BrowserState

[![PyPI version](https://badge.fury.io/py/browserstate.svg)](https://pypi.org/project/browserstate/) [![npm version](https://badge.fury.io/js/browserstate.svg)](https://www.npmjs.com/package/browserstate)

BrowserState is a unified library for managing persistent browser profiles across environments. Built for browser automation tools and AI agents, it helps your sessions behave like real, returning users.

It supports multiple storage providers (local, S3, GCS, Redis), and is available in both **Node.js** and **Python**:
- Node: `npm install browserstate`
- Python: `pip install browserstate`

---

## 🤔 Why BrowserState?

Most browser automation workflows fail because authentication and session data don't persist reliably across environments. Manually handling cookies or re-authenticating slows everything down. Worse, many automations fail due to inconsistent browser fingerprints, machine IDs, and storage states—leading to bot detection and bans.

BrowserState ensures your automation behaves like a real, returning user by providing:

🔄 **Full Browser Context Restoration** – Save and restore cookies, local storage, IndexedDB, service worker caches, and extension data. Resume automation from the exact previous state.

🔗 **Multi-Instance Synchronization** – Share browser profiles across multiple servers or devices, making automation scalable and resilient.

🚀 **Zero-Setup Onboarding for Automation** – Instantly deploy automation-ready browser profiles without manual setup.

⚡️ **Efficient Resource Usage** – Persistent browser usage without memory leaks, eliminating the need to launch new instances for every run.

🔍 **Faster Debugging & Reproducibility** – Store failing test cases exactly as they were, making it easy to diagnose automation failures.

💾 **Offline Execution & Caching** – Automate tasks that rely on cached assets, such as scraping content behind paywalls or working in low-connectivity environments.

🔄 **Cross-Device Synchronization** – Seamlessly move between local development, cloud servers, and headless automation.

---

## 🛡️ Bot Detection Bypass

Many bot detection systems track inconsistencies in browser states—frequent changes to fingerprints, device identifiers, and storage behavior trigger red flags. Most people get detected because they unknowingly create a "new machine" every time.

BrowserState solves this by preserving a stable, persistent browser identity across runs instead of resetting key markers. This drastically reduces detection risks while maintaining full automation control.

Now you can move fast without breaking sessions—or getting flagged as a bot.

---

## 📦 Installation

### Node.js
```bash
npm install browserstate
```
[Read Node Docs →](https://www.npmjs.com/package/browserstate)

### Python
```bash
pip install browserstate
```

[Read Python Docs →](https://pypi.org/project/browserstate/)

---

## 📊 Implementation Status

![npm](https://img.shields.io/npm/v/browserstate)
![downloads](https://img.shields.io/npm/dm/browserstate)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

| Storage Provider     | Node.js | Python |
|----------------------|---------|--------|
| Local Storage        | ✅      | ✅     |
| AWS S3               | ✅      | ✅     |
| Google Cloud Storage | ✅      | ✅     |
| Redis                | ✅      | ✅     |

---

## 📚 Docs and Language Support

- Node: [`/typescript`](./typescript)
- Python: [`/python`](./python)

---

## 🧠 Coming Soon

We're working on additional tools for identity delegation and advanced login support — but for now, you can use your **own login automation** and capture the session using BrowserState.

Use it alongside Playwright, Puppeteer, or Selenium to make automation stable, portable, and debuggable.

---

## 🐛 Issues and Feedback

If you encounter any issues or have feedback about specific storage providers:
1. 🔍 Check the existing GitHub issues to see if your problem has been reported
2. ✍️ Create a new issue with:
   - A clear description of the problem
   - Which storage provider you're using
   - Steps to reproduce the issue
   - Environment details (Node.js or Python version, browser, etc.)

---

## 💻 Example Use Cases

### 1. Persist Login Sessions (Python)
```python
from browserstate import BrowserState, BrowserStateOptions
from playwright.async_api import async_playwright

options = BrowserStateOptions(user_id="linkedin-user", local_storage_path="./sessions")
state = BrowserState(options)

async def login_and_save():
    session_id = "linkedin-session"
    session_path = await state.mount(session_id)

    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir=session_path,
            headless=False
        )
        page = await browser.new_page()
        await page.goto("https://www.linkedin.com/login")
        await page.fill("#username", "your@email.com")
        await page.fill("#password", "yourPassword")
        await page.click("button[type='submit']")
        await page.wait_for_url("https://www.linkedin.com/feed")
        await browser.close()

    await state.unmount()
```

### 2. Reuse the Session Later (Python)
```python
session_path = await state.mount("linkedin-session")

async with async_playwright() as p:
    browser = await p.chromium.launch_persistent_context(user_data_dir=session_path, headless=True)
    page = await browser.new_page()
    await page.goto("https://www.linkedin.com/feed")
```

### 3. Mount + Use Session (Node.js)
```typescript
import { BrowserState } from 'browserstate';
import { chromium } from 'playwright';

const state = new BrowserState({
  userId: 'demo-user',
  storageType: 'local',
  localOptions: { storagePath: './sessions' }
});

const userDataDir = await state.mount('linkedin-session');
const browser = await chromium.launchPersistentContext(userDataDir, { headless: false });
const page = await browser.newPage();
await page.goto('https://linkedin.com/feed');
await state.unmount();
```

---

## 📄 License

MIT
