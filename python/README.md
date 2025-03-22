# BrowserState (Python)

A Python library for saving and restoring browser profiles across machines using various storage providers.

## Features

- Save browser profiles (cookies, local storage, etc.) to different storage providers
- Restore browser profiles on different machines
- Support for multiple storage providers:
  - ✅ Local storage (extensively tested)
  - ⚠️ AWS S3 (implemented but needs additional testing)
  - ⚠️ Google Cloud Storage (implemented but needs additional testing)
- Works with popular browser automation tools:
  - Selenium
  - Playwright
  - Puppeteer (via Pyppeteer)

## Implementation Status

| Storage Provider | Status |
|------------------|--------|
| Local Storage | ✅ Extensively tested |
| S3 Storage | ⚠️ Implemented, needs additional testing |
| GCS Storage | ⚠️ Implemented, needs additional testing |

Currently, we recommend using the local storage provider for production use cases. Cloud storage providers are available but should be thoroughly tested in your environment before production use.

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

# Mount a session (will create a new one if session_id is not provided)
session = browser_state.mount_session()
print(f"Mounted session: {session['id']}")

# Use the browser
with sync_playwright() as p:
    # Launch the browser with the user data directory
    browser = p.chromium.launch(
        headless=False,
        user_data_dir=session["path"]
    )
    
    page = browser.new_page()
    page.goto("https://example.com")
    # Do your browser automation...
    browser.close()

# Save the session to storage
browser_state.unmount_session()
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

# List existing sessions
sessions = browser_state.list_sessions()
print(f"Available sessions: {sessions}")

# Mount a specific session or create a new one
session = browser_state.mount_session(sessions[0] if sessions else None)

# Use with Selenium
chrome_options = Options()
chrome_options.add_argument(f"--user-data-dir={session['path']}")

driver = webdriver.Chrome(options=chrome_options)
driver.get("https://example.com")
# Do your browser automation...
driver.quit()

# Save the session to storage
browser_state.unmount_session()
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

- `mount_session(session_id=None)`: Downloads and mounts a browser session
- `unmount_session()`: Uploads and cleans up the current browser session
- `list_sessions()`: Lists all available sessions for the user
- `delete_session(session_id)`: Deletes a browser session
- `get_active_session()`: Gets details of the currently active session

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