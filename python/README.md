# 🚧 BrowserState for Python - COMING SOON 🚧

The Python implementation of BrowserState is under active development and will be available soon. 

# Why BrowserState?
Most browser automation workflows fail because authentication and session data don't persist reliably across environments. Manually handling cookies or re-authenticating slows everything down. Worse, many automations fail due to inconsistent browser fingerprints, machine IDs, and storage states—leading to bot detection and bans.

BrowserState ensures your automation behaves like a real, returning user by providing:

Full Browser Context Restoration – Save and restore cookies, local storage, IndexedDB, service worker caches, and extension data. Resume automation 
from the exact previous state.

Multi-Instance Synchronization – Share browser profiles across multiple servers or devices, making automation scalable and resilient.

Zero-Setup Onboarding for Automation – Instantly deploy automation-ready browser profiles without manual setup.

Efficient Resource Usage – Persistent browser usage without memory leaks, eliminating the need to launch new instances for every run.

Faster Debugging & Reproducibility – Store failing test cases exactly as they were, making it easy to diagnose automation failures.

Offline Execution & Caching – Automate tasks that rely on cached assets, such as scraping content behind paywalls or working in low-connectivity environments.

Cross-Device Synchronization – Seamlessly move between local development, cloud servers, and headless automation.

✅ Bot Detection Bypass
Many bot detection systems track inconsistencies in browser states—frequent changes to fingerprints, device identifiers, and storage behavior trigger red flags. Most people get detected because they unknowingly create a "new machine" every time.

BrowserState solves this by preserving a stable, persistent browser identity across runs instead of resetting key markers. This drastically reduces detection risks while maintaining full automation control.

Now you can move fast without breaking sessions—or getting flagged as a bot.

## Features (Coming Soon)

- Save browser profiles (cookies, local storage, etc.) to different storage providers
- Restore browser profiles on different machines
- Support for multiple storage providers:
  - Local storage
  - AWS S3
  - Google Cloud Storage
  - Redis
- Works with popular browser automation tools:
  - Selenium
  - Playwright
  - Puppeteer (via Pyppeteer)

## Implementation Roadmap

| Feature | Status |
|---------|--------|
| Local Storage | 🚧 In Development |
| S3 Storage | 🚧 In Development |
| Redis Storage | 🚧 In Development |
| GCS Storage | 🚧 In Development |

## Installation (Pre-Release)

While BrowserState for Python is not yet available on PyPI, you can install it in several ways:

### Using pip with GitHub repository
```bash
# Install directly from GitHub repository
pip install git+https://github.com/browserstate-org/browserstate#subdirectory=python
```

### Using GitHub Packages (recommended)
Once we publish to GitHub Packages, you'll be able to install it using:

```bash
# Install directly from GitHub Packages (for public packages)
pip install browserstate --index-url https://pip.pkg.github.com/browserstate-org

# Using uv
uv pip install browserstate --index-url https://pip.pkg.github.com/browserstate-org
```

For permanent configuration, add this to your pip configuration:
```bash
pip config set global.extra-index-url https://pip.pkg.github.com/browserstate-org
```

### Using uv (faster alternative)
```bash
# First install uv if you don't have it
pip install uv
# Or with pipx for isolated installation
pipx install uv

# Then install browserstate from GitHub
uv pip install git+https://github.com/browserstate-org/browserstate#subdirectory=python
```

### From source
```bash
# Clone the repository
git clone https://github.com/browserstate-org/browserstate
cd browserstate/python

# Install with pip
pip install .

# Or with uv
uv pip install .
```

Once the package is officially released on PyPI, you'll be able to install it with:
```bash
pip install browserstate
# or
uv pip install browserstate
```

## Want to be notified when Python support is released?

Watch our GitHub repository for updates or join our mailing list on [browserstate.io](https://browserstate.io).

In the meantime, check out our [TypeScript implementation](../typescript/README.md) which is stable and production-ready. 