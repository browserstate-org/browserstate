# 🌐 BrowserState

BrowserState is a cross-language library for saving and restoring full browser profiles across machines and environments. It helps your automation behave like a **real, returning user** by persisting cookies, local storage, IndexedDB, and more.

[![npm version](https://img.shields.io/npm/v/browserstate.svg)](https://www.npmjs.com/package/browserstate)
[![npm downloads](https://img.shields.io/npm/dm/browserstate.svg)](https://www.npmjs.com/package/browserstate)
[![PyPI version](https://img.shields.io/pypi/v/browserstate.svg)](https://pypi.org/project/browserstate/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Perfect for Playwright, Puppeteer, AI browser agents, and browser automation infra. Eliminate login issues, bot detection failures, and flaky test runs.

<p align="center">
  <a href="https://playwright.dev"><img src="https://playwright.dev/img/playwright-logo.svg" height="40" alt="Playwright"></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://pptr.dev"><img src="https://user-images.githubusercontent.com/10379601/29446482-04f7036a-841f-11e7-9872-91d1fc2ea683.png" height="40" alt="Puppeteer"></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://www.selenium.dev"><img src="https://cdn.jsdelivr.net/gh/SeleniumHQ/www.seleniumhq.org@master/src/main/webapp/images/selenium-logo.png" height="40" alt="Selenium"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/chrome/chrome.svg" height="38" title="Chrome"/>
  &nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/firefox/firefox.svg" height="38" title="Firefox"/>
  &nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/edge/edge.svg" height="38" title="Edge"/>
</p>

---

## ⚡ Why BrowserState?

Most browser automation breaks at scale because of login failures, flaky sessions, or bot detection. Tools store partial state — if at all.

BrowserState solves this by **persisting full browser context** across machines and workflows. Auth, identity, storage, and fingerprints — all intact.

---

## 🧠 What You Get

- 🔄 **Full Context Capture**  
  Save cookies, localStorage, IndexedDB, service workers, and even fingerprint state.

- 🧳 **Portable Across Environments**  
  Reuse sessions in CI/CD, cloud agents, local dev, and containers.

- 🛡️ **Bot Detection Resilience**  
  Stable identity across runs means fewer bans and silent failures.

- 🧪 **Flaky Test Debugging**  
  Preserve failed state for replay and deep inspection.

- 🔁 **Multi-Agent Workflows**  
  Share browser state between processes or agents — no re-login needed.

- ☁️ **Cloud Storage Support**  
  Use Redis, S3, GCS, or local disk — plug in and scale.

---

## ✅ Support Matrix

| Feature               | Node.js         | Python           |
|-----------------------|-----------------|------------------|
| Local Storage         | ✅ Stable        | ✅ Available      |
| Redis Storage         | ✅ Stable        | ✅ Available      |
| AWS S3                | ✅ Stable        | ✅ Available      |
| Google Cloud Storage  | ✅ Stable        | ✅ Available      |
| Cross-Browser Support | Chrome, Firefox, Edge | Chrome, Firefox, Edge |

---

## 📦 Installation

### Node.js

```bash
npm install browserstate
```

### Python

```bash
pip install browserstate
```

For Redis/S3/GCS, install optional dependencies:
```bash
# Node
npm install ioredis @aws-sdk/client-s3 @aws-sdk/lib-storage @google-cloud/storage

# Python
pip install redis boto3 google-cloud-storage
```

---

## 🚀 Quickstart (Node.js)

```ts
import { BrowserState } from 'browserstate';
import { chromium } from 'playwright';

const state = new BrowserState({
  userId: 'linkedin-bot',
  storageType: 'redis',
  redisOptions: { host: 'localhost', port: 6379 }
});

const sessionPath = await state.mount('linkedin-session');
const browser = await chromium.launchPersistentContext(sessionPath, { headless: false });

const page = await browser.newPage();
await page.goto('https://www.linkedin.com/login');

await browser.close();
await state.unmount();
```

---

## 🧑‍💻 Example Use Cases

### 🔍 Recruiting

- Persist session for talent search on LinkedIn
- Avoid MFA loops across multiple logins

### 🏥 Healthcare

- Extract claims or benefits from insurer portals (Aetna, UHC, etc.)
- Works even when no API exists

### 💼 Enterprise AI Agents

- Share auth state between tasks/agents
- Works with tools like Nova, BrowserUse, or custom LLM wrappers

---

## 📚 Docs

- [TypeScript README](./typescript/README.md)
- [Python README](./python/README.md)

---

## 🤝 Contributing

Open to bug reports, new storage plugins, and performance improvements. Python support is growing fast — feel free to join in.

---

## 🪪 License

MIT — use freely and build better browser automation infrastructure.

---

## 🔗 Useful Links

- [📦 NPM Package](https://www.npmjs.com/package/browserstate)
- [🐍 PyPI Package](https://pypi.org/project/browserstate/)
- [🌐 Website](https://browserstate.io)
- [🧠 Use cases](https://github.com/browserstate-org/browserstate/issues)
