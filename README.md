# 🌐 BrowserState

BrowserState is a cross-language library for saving and restoring full browser profiles across machines and environments. It helps your automation behave like a **real, returning user** by persisting cookies, local storage, IndexedDB, and more.

[![npm version](https://img.shields.io/npm/v/browserstate.svg)](https://www.npmjs.com/package/browserstate)
[![npm downloads](https://img.shields.io/npm/dm/browserstate.svg)](https://www.npmjs.com/package/browserstate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Perfect for Playwright, Puppeteer, AI browser agents, and other browser automation frameworks. Eliminate login/auth problems and reduce bot detection risks.

<p align="center">
  <a href="https://playwright.dev" title="Playwright"><img src="https://playwright.dev/img/playwright-logo.svg" alt="Playwright" height="40"></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://pptr.dev" title="Puppeteer"><img src="https://user-images.githubusercontent.com/10379601/29446482-04f7036a-841f-11e7-9872-91d1fc2ea683.png" alt="Puppeteer" height="40"></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://www.selenium.dev" title="Selenium"><img src="https://cdn.jsdelivr.net/gh/SeleniumHQ/www.seleniumhq.org@master/src/main/webapp/images/selenium-logo.png" alt="Selenium" height="40"></a>
</p>

<p align="center">
  <a href="#" title="Chrome"><img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/chrome/chrome.svg" alt="Chrome" height="40"></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#" title="Firefox"><img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/firefox/firefox.svg" alt="Firefox" height="40"></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#" title="Edge"><img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/edge/edge.svg" alt="Edge" height="40"></a>
</p>

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
# TypeScript/JavaScript
npm install browserstate

# Optional dependencies based on storage provider
npm install ioredis                                 # For Redis
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage # For S3
npm install @google-cloud/storage                   # For GCS

# Python (Pre-Release)
# Option 1: Install from GitHub repository
pip install git+https://github.com/browserstate-org/browserstate#subdirectory=python

# Option 2: Install from GitHub Packages (recommended when available)
pip install browserstate --index-url https://pip.pkg.github.com/browserstate-org

# Using uv (faster alternative)
uv pip install browserstate --index-url https://pip.pkg.github.com/browserstate-org
```

### Basic Usage

```typescript
import { BrowserState } from 'browserstate';

// Initialize with any storage provider
const browserState = new BrowserState({
  userId: 'enterprise-client-456',
  storageType: 'redis',  // or 'local', 's3', 'gcs'
  redisOptions: {
    host: 'localhost', // e.g., 'redis.internal.company.com'
    port: 6379,
  }
});

// Mount a session - returns path to use with your browser automation
const userDataDir = await browserState.mount('linkedin-recruitment-bot');

// Use with Playwright, Puppeteer, etc.
const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
});

// After your automation finishes, save changes
await browser.close();
await browserState.unmount();
```

---

## 🌟 Example Use Cases

### Healthcare Automation

```typescript
// For a healthcare organization's patient portal automation
const patientPortalBot = new BrowserState({
  userId: 'hospital-system-456',
  storageType: 's3',
  s3Options: { 
    bucketName: 'secure-medical-automations',
    region: 'us-east-1', // e.g., AWS region with HIPAA compliance
  }
});

// Each medical provider has their own session
const drJohnsonSession = await patientPortalBot.mount('dr-johnson-patient-records');
const drSmithSession = await patientPortalBot.mount('dr-smith-appointments');
```

### Recruiting & Talent Acquisition

```typescript
// For a recruiting team's LinkedIn automation
const talentAcquisition = new BrowserState({
  userId: 'recruiting-team-789',
  storageType: 'redis',
  redisOptions: { host: 'recruiting-cache.internal' }
});

// Separate sessions for different recruiting workflows
const techTalentSession = await talentAcquisition.mount('software-engineer-outreach');
const executiveSession = await talentAcquisition.mount('executive-search-2023');
```

### E-commerce & Data Analytics

```typescript
// For a marketing team monitoring competitor products
const ecomTracker = new BrowserState({
  userId: 'ecommerce-analytics-234',
  storageType: 'gcs',
  gcsOptions: { 
    bucketName: 'retail-market-research',
    projectID: 'your-project-id', // e.g., 'ecommerce-analytics-12345'
  }
});

// Track different marketplaces with separate sessions
const amazonTracking = await ecomTracker.mount('amazon-price-monitoring');
const etsyTracking = await ecomTracker.mount('etsy-handmade-trends');
```

---

## 📚 Documentation

For complete documentation, see the language-specific READMEs:

- [✅ TypeScript Documentation](typescript/README.md) (Stable, production-ready)
- [🚧 Python Documentation](python/README.md) (Early development - installable from GitHub)

---

## 🏗️ Project Structure

```
browserstate/
├── typescript/         # TypeScript implementation (stable)
├── python/             # Python implementation (early development)
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