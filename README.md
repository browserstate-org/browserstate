# 🌐 BrowserState

BrowserState is a cross-language library for saving and restoring full browser profiles across machines and environments. It helps your automation behave like a **real, returning user** by persisting cookies, local storage, IndexedDB, and more.

[![npm version](https://img.shields.io/npm/v/browserstate.svg)](https://www.npmjs.com/package/browserstate)
[![npm downloads](https://img.shields.io/npm/dm/browserstate.svg)](https://www.npmjs.com/package/browserstate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Perfect for Playwright, Puppeteer, AI browser agents, and other browser automation frameworks. Eliminate login/auth problems and reduce bot detection risks.

```bash
# Install
npm install browserstate
```

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
| Local Storage | ✅ Stable | 🔜 Coming Soon |
| Redis Storage | ✅ Stable | 🔜 Coming Soon |
| AWS S3 | ✅ Stable | 🔜 Coming Soon |
| Google Cloud Storage | ✅ Stable | 🔜 Coming Soon |
| Browser Compatibility | Chrome, Firefox, Edge | Chrome, Firefox, Edge |

---

## 📦 Installation & Quick Example

```bash
# Install core package
npm install browserstate

# Optional dependencies based on storage provider
npm install ioredis                                 # For Redis
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage # For S3
npm install @google-cloud/storage                   # For GCS
```

### Basic Usage

```typescript
import { BrowserState } from 'browserstate';

// Initialize with any storage provider
const browserState = new BrowserState({
  userId: 'user123',
  storageType: 'redis',  // or 'local', 's3', 'gcs'
  redisOptions: {
    host: 'localhost',
    port: 6379,
  }
});

// Mount a session - returns path to use with your browser automation
const userDataDir = await browserState.mount('my-session');

// Use with Playwright, Puppeteer, etc.
const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
});

// After your automation finishes, save changes
await browser.close();
await browserState.unmount();
```

---

## 📚 Documentation

For complete documentation, see the language-specific READMEs:

- [✅ TypeScript Documentation](typescript/README.md) (Stable, production-ready)
- [🔜 Python Documentation](python/README.md) (Coming Soon)

---

## 🏗️ Project Structure

```
browserstate/
├── typescript/         # TypeScript implementation (stable)
├── python/             # Python implementation (coming soon)
└── README.md           # This file
```

---

## 🤝 Contributing

Contributions are welcome! Areas where we especially appreciate help:

- Additional storage backend implementations
- Browser compatibility testing
- Performance optimizations
- Cross-language interoperability testing
- CLI wrappers for easier adoption

---

## ⚖️ License

MIT

---

## 🔗 Links

- [📦 npm package](https://www.npmjs.com/package/browserstate)
- [🏠 Website](https://browserstate.io)
- [📝 Issues](https://github.com/browserstate-org/browserstate/issues)

BrowserState is part of an effort to build the foundation of reliable, persistent browser automation. If you're building bots, agents, or workflows—you want your browser to remember things. Now it can. 