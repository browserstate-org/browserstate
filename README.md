# 🌐 BrowserState

**BrowserState** is a cross-language library for saving and restoring full browser profiles across machines and environments.  
It lets your automation behave like a **real, returning user** by persisting cookies, local storage, IndexedDB, service worker caches, and more.

> Supports Local, Redis, S3, and GCS backends. Works with Playwright, Puppeteer, Browser Use, Nova Act, and more.

---

## ⚡ Why BrowserState?

Most browser automation workflows fail because authentication and session data don't persist reliably across environments. Manually handling cookies or re-authenticating slows everything down. Worse, many automations fail due to inconsistent browser fingerprints, machine IDs, and storage states—leading to bot detection and bans.

**BrowserState solves this by preserving a stable, persistent browser identity across runs** instead of resetting key markers, drastically reducing detection risks while maintaining full automation control.

---

## 🧠 What You Get

- 🔄 **Full Browser Context Restoration**  
  Save and restore cookies, local storage, IndexedDB, service worker caches, and extension data. Resume automation from exactly where you left off.

- 🔗 **Multi-Instance Synchronization**  
  Share browser profiles across multiple servers or devices, making automation scalable and resilient.

- 🚀 **Zero-Setup Onboarding**  
  Instantly deploy automation-ready browser profiles without manual setup.

- ⚡️ **Efficient Resource Usage**  
  Persistent browser usage without memory leaks, eliminating the need to launch new instances for every run.

- 🔍 **Debugging Snapshots**  
  Store failing test cases exactly as they were, making it easy to diagnose automation failures.

- 💾 **Offline Execution & Caching**  
  Automate tasks that rely on cached assets, such as scraping content behind paywalls or in low-connectivity environments.

- 🌍 **Cross-Device Synchronization**  
  Seamlessly move between local development, cloud servers, and headless automation.

- 🛡️ **Bot Detection Bypass**  
  Many detection systems flag users based on inconsistent browser fingerprints. BrowserState maintains stable machine identifiers and storage footprints across sessions.

---

## ✅ Features & Support Matrix

| Feature | TypeScript | Python |
|---------|------------|--------|
| Local Storage | ✅ Stable | ✅ Stable |
| Redis Storage | ✅ Stable | ✅ Stable |
| AWS S3 | ✅ Stable (needs more testing) | ✅ Stable (needs more testing) |
| Google Cloud Storage | ✅ Stable | ✅ Stable (needs more testing) |
| Browser Compatibility | Chrome, Firefox, Edge | Chrome, Firefox, Edge |

---

## 📦 Installation

### TypeScript/JavaScript
```bash
npm install browserstate

# Optional dependencies based on storage provider
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage  # For S3
npm install @google-cloud/storage                     # For GCS
npm install ioredis                                   # For Redis
```

### Python
```bash
pip install browserstate

# Optional dependencies based on storage provider
pip install boto3                    # For S3
pip install google-cloud-storage     # For GCS
pip install redis                    # For Redis
```

---

## 🔌 Quick Examples

### TypeScript with Redis
```typescript
import { BrowserState } from 'browserstate';

const browserState = new BrowserState({
  userId: 'user123',
  storageType: 'redis',
  redisOptions: {
    host: 'localhost',
    port: 6379,
    db: 0,
    keyPrefix: 'browserstate:',
    ttl: 7 * 24 * 60 * 60, // 7 days
  }
});

// Mount a session - returns the path to use with your browser automation
const userDataDir = await browserState.mount('session123');

// Use with Playwright
const browser = await chromium.launchPersistentContext(userDataDir, {
  // your options here
});

// After your automation finishes
await browser.close();

// Save changes back to Redis
await browserState.unmount();
```

### Python with Local Storage
```python
from browserstate import BrowserState

browser_state = BrowserState(
    user_id="user123",
    storage_type="local",
    local_options={
        "storage_path": "/path/to/storage"
    }
)

# Mount a session
user_data_dir = browser_state.mount("session123")

# Use with Playwright
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch_persistent_context(
        user_data_dir=user_data_dir,
        headless=False
    )
    # Your automation code here
    browser.close()

# Save changes
browser_state.unmount()
```

---

## 📚 Documentation

For complete documentation, see the language-specific READMEs:

- [TypeScript Documentation](typescript/README.md)
- [Python Documentation](python/README.md)

---

## 🏗️ Project Structure

```
browserstate/
├── typescript/         # TypeScript implementation
├── python/             # Python implementation
└── README.md           # This file
```

---

## 🧹 Automatic Cleanup

BrowserState creates temporary files on your local system when working with browser profiles. By default, these are automatically cleaned up when:

1. You call `unmount()` to save the session
2. The process exits normally
3. The process is terminated with SIGINT (Ctrl+C)
4. An uncaught exception occurs

This behavior can be configured through the `autoCleanup` option.

---

## 🤝 Contributing

Contributions are welcome! Areas where we especially appreciate help:

- Additional real-world testing of storage providers
- Performance optimizations
- New storage backend implementations
- Browser compatibility testing
- CLI wrappers for easier adoption

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 🐛 Issues and Support

If you encounter any problems:

1. Check the documentation for your language implementation
2. Search existing GitHub issues
3. Create a new issue with:
   - Which language you're using (TypeScript/Python)
   - Which storage provider you're using
   - Steps to reproduce the issue
   - Expected vs. actual behavior
   - Environment details (browser, OS, etc.)

---

## ⚖️ License

MIT

---

BrowserState is part of an effort to build the foundation of reliable, persistent browser automation. If you're building bots, agents, or workflows—you want your browser to remember things. Now it can. 