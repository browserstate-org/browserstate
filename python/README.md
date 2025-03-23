# BrowserState (Python)

A Python library for saving and restoring browser profiles across machines using various storage providers.

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

## Features

- Save browser profiles (cookies, local storage, etc.) to different storage providers
- Restore browser profiles on different machines
- Support for multiple storage providers:
  - ⚠️ Local storage (implementation ready but needs testing)
  - ⚠️ AWS S3 (implemented but needs additional testing)
  - ⚠️ Google Cloud Storage (implemented but needs additional testing)
- Works with popular browser automation tools:
  - Selenium
  - Playwright
  - Puppeteer (via Pyppeteer)

## Implementation Status

| Storage Provider | Status |
|------------------|--------|
| Local Storage | ⚠️ Implementation ready but needs testing |
| S3 Storage | ⚠️ Implemented, needs additional testing |
| GCS Storage | ⚠️ Implemented, needs additional testing |

Please note that all storage providers need testing before being used in production. We recommend thorough testing in your specific environment before deploying this library in critical applications.

## Installation

```bash
# Basic installation with local storage only
pip install browserstate

# With S3 support
pip install browserstate[s3]

# With Google Cloud Storage support
pip install browserstate[gcs]

# With all storage providers
pip install browserstate[all]
```

## Usage

### Basic usage with local storage

```python
from browserstate import BrowserState, BrowserStateOptions
from playwright.sync_api import sync_playwright

# Initialize browser state with local storage
options = BrowserStateOptions(user_id="user123")
browser_state = BrowserState(options)

# Mount a state (will create a new one if state_id is not provided)
state = browser_state.mount(state_id="my-browser-state")
print(f"Mounted state directory: {state}")

# Use the browser
with sync_playwright() as p:
    # Launch the browser with the user data directory
    browser = p.chromium.launch_persistent_context(
        user_data_dir=state,
        headless=False
    )
    
    page = browser.new_page()
    page.goto("https://example.com")
    # Do your browser automation...
    browser.close()

# Save the state to storage
browser_state.unmount()
```

### Using AWS S3 Storage

```python
from browserstate import BrowserState, BrowserStateOptions
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

# S3 configuration
s3_options = {
    "bucket_name": "my-browser-profiles",
    "region": "us-west-2",
    # Optional: provide access keys if not using environment variables
    # "access_key_id": "YOUR_ACCESS_KEY",
    # "secret_access_key": "YOUR_SECRET_KEY",
}

# Initialize browser state with S3 storage
options = BrowserStateOptions(user_id="user123", s3_options=s3_options)
browser_state = BrowserState(options)

# List existing states
states = browser_state.list_sessions()
print(f"Available states: {states}")

# Mount a specific state or create a new one
state_id = states[0] if states else "new-browser-state"
user_data_dir = browser_state.mount(state_id)

# Use with Selenium
chrome_options = Options()
chrome_options.add_argument(f"--user-data-dir={user_data_dir}")

driver = webdriver.Chrome(options=chrome_options)
driver.get("https://example.com")
# Do your browser automation...
driver.quit()

# Save the state to storage
browser_state.unmount()
```

### Using Google Cloud Storage

```python
from browserstate import BrowserState, BrowserStateOptions

# GCS configuration
gcs_options = {
    "bucket_name": "my-browser-profiles",
    # Optional: provide service account path if not using environment credentials
    # "service_account_path": "/path/to/service-account.json",
    # "project_id": "my-gcp-project",
}

# Initialize browser state with GCS storage
options = BrowserStateOptions(user_id="user123", gcs_options=gcs_options)
browser_state = BrowserState(options)

# Other operations are the same as with other storage providers
```

## API Reference

### BrowserStateOptions

Configuration options for BrowserState:

- `user_id` (str): Required. User identifier for storing profiles
- `storage_provider` (StorageProvider): Optional. Custom storage provider instance
- `local_storage_path` (str): Optional. Path for LocalStorage, defaults to ~/.browserstate
- `s3_options` (dict): Optional. Options for S3Storage
- `gcs_options` (dict): Optional. Options for GCSStorage

### BrowserState

Main class for managing browser profiles:

- `mount(state_id=None)`: Downloads and mounts a browser state, returns user data directory path
- `unmount()`: Uploads and cleans up the current browser state
- `list_sessions()`: Lists all available states for the user
- `delete_session(state_id)`: Deletes a browser state

## Storage Providers

### LocalStorage

Uses the local filesystem to store browser profiles.

```python
from browserstate.storage import LocalStorage

storage = LocalStorage(storage_path="/custom/path")
```

### S3Storage

Uses AWS S3 for storing browser profiles.

```python
from browserstate.storage import S3Storage

storage = S3Storage(
    bucket_name="my-bucket",
    region="us-west-2",
    access_key_id="YOUR_ACCESS_KEY",  # Optional
    secret_access_key="YOUR_SECRET_KEY",  # Optional
    endpoint="https://custom-endpoint.com"  # Optional, for S3-compatible services
)
```

### GCSStorage

Uses Google Cloud Storage for storing browser profiles.

```python
from browserstate.storage import GCSStorage

storage = GCSStorage(
    bucket_name="my-bucket",
    service_account_path="/path/to/service-account.json",  # Optional
    project_id="my-gcp-project"  # Optional
)
```

## License

MIT

## Issues and Feedback

If you encounter any issues or have feedback about specific storage providers:

1. Check the existing GitHub issues to see if your problem has been reported
2. Create a new issue with:
   - A clear description of the problem
   - Which storage provider you're using
   - Steps to reproduce the issue
   - Environment details (Python version, browser, etc.)

We especially welcome feedback and testing reports for the S3 and GCS storage providers as they need additional real-world testing. 