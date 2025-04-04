# 🌐 BrowserState

BrowserState is a TypeScript/JavaScript library for managing browser profiles across different storage providers, including local storage, Redis, AWS S3, and Google Cloud Storage.

> Perfect for Playwright, Puppeteer, AI browser agents, and other browser automation frameworks. Eliminate login/auth problems and reduce bot detection risks.

---

## 🤔 Why BrowserState?

Most browser automation workflows fail because authentication and session data don't persist reliably across environments. Manually handling cookies or re-authenticating slows everything down. Worse, many automations fail due to inconsistent browser fingerprints, machine IDs, and storage states—leading to bot detection and bans.

BrowserState ensures your automation behaves like a real, returning user by providing:

- 🔄 **Full Browser Context Restoration** – Save and restore cookies, local storage, IndexedDB, service worker caches, and extension data. Resume automation from exactly where you left off.

- 🔗 **Multi-Instance Synchronization** – Share browser profiles across multiple servers or devices, making automation scalable and resilient.

- 🚀 **Zero-Setup Onboarding** – Instantly deploy automation-ready browser profiles without manual setup.

- ⚡️ **Efficient Resource Usage** – Persistent browser usage without memory leaks, eliminating the need to launch new instances for every run.

- 🔍 **Debugging Snapshots** – Store failing test cases exactly as they were, making it easy to diagnose automation failures.

- 💾 **Offline Execution & Caching** – Automate tasks that rely on cached assets, such as scraping content behind paywalls or in low-connectivity environments.

- 🌍 **Cross-Device Synchronization** – Seamlessly move between local development, cloud servers, and headless automation.

## 🛡️ Bot Detection Bypass

Many bot detection systems track inconsistencies in browser states—frequent changes to fingerprints, device identifiers, and storage behavior trigger red flags. Most people get detected because they unknowingly create a "new machine" every time.

BrowserState solves this by preserving a stable, persistent browser identity across runs instead of resetting key markers. This drastically reduces detection risks while maintaining full automation control.

Now you can move fast without breaking sessions—or getting flagged as a bot.

## 📊 Implementation Status

| Storage Provider | Status |
|------------------|--------|
| Local Storage | ✅ Stable, extensively tested |
| Redis Storage | ✅ Stable, production-ready |
| S3 Storage | ✅ Stable (needs more real-world testing) |
| GCS Storage | ✅ Stable (needs more real-world testing) |

## 📦 Installation

```bash
npm install browserstate
```

## 🔧 Optional Dependencies

BrowserState supports multiple storage backends. Depending on your needs, you may want to install additional dependencies:

- For Redis storage:
  ```bash
  npm install ioredis
  ```

- For AWS S3 storage:
  ```bash
  npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
  ```

- For Google Cloud Storage:
  ```bash
  npm install @google-cloud/storage
  ```

## 💻 Usage Examples

### Local Storage

```typescript
import { BrowserState } from 'browserstate';

const browserState = new BrowserState({
  userId: 'user123',
  storageType: 'local',
  localOptions: {
    storagePath: '/path/to/local/storage'
  }
});

// Mount a session
const userDataDir = await browserState.mount('session123');

// Use with any browser automation framework
// Example with Playwright:
const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: false
});

// When you're done, save changes
await browser.close();
await browserState.unmount();
```

### Redis Storage

```typescript
import { BrowserState } from 'browserstate';

const browserState = new BrowserState({
  userId: 'user123',
  storageType: 'redis',
  redisOptions: {
    host: 'localhost',
    port: 6379,
    keyPrefix: 'browserstate:',
    ttl: 7 * 24 * 60 * 60, // 7 days
    // All ioredis options are supported
  }
});

// Mount a session
const userDataDir = await browserState.mount('session123');

// Use with your browser automation
// ...

// Save changes back to Redis
await browserState.unmount();
```

### AWS S3 Storage

```typescript
import { BrowserState } from 'browserstate';

const browserState = new BrowserState({
  userId: 'user123',
  storageType: 's3',
  s3Options: {
    bucketName: 'my-browser-states',
    region: 'us-west-2',
    accessKeyID: 'YOUR_ACCESS_KEY_ID',
    secretAccessKey: 'YOUR_SECRET_ACCESS_KEY'
    // Additional AWS S3 options can be specified
  }
});

// Mount a session - downloads from S3 if it exists
const userDataDir = await browserState.mount('session123');

// Use with your browser automation
// ...

// Upload changes back to S3
await browserState.unmount();
```

### Google Cloud Storage

```typescript
import { BrowserState } from 'browserstate';

const browserState = new BrowserState({
  userId: 'user123',
  storageType: 'gcs',
  gcsOptions: {
    bucketName: 'my-browser-states',
    projectID: 'your-project-id',
    keyFilename: '/path/to/service-account-key.json'
    // Additional GCS options can be specified
  }
});

// Mount a session - downloads from GCS if it exists
const userDataDir = await browserState.mount('session123');

// Use with your browser automation
// ...

// Upload changes back to GCS
await browserState.unmount();
```

### With Auto-Cleanup Disabled

```typescript
import { BrowserState } from 'browserstate';

const browserState = new BrowserState({
  userId: 'user123',
  storageType: 'local',
  autoCleanup: false, // Disable automatic cleanup
  localOptions: {
    storagePath: '/path/to/local/storage'
  }
});

// Use browser state...

// Manually clean up when needed
await browserState.cleanup();
```

### Complete Example with Playwright

```typescript
import { BrowserState } from 'browserstate';
import { chromium } from 'playwright';

async function runAutomation() {
  // Initialize BrowserState
  const browserState = new BrowserState({
    userId: 'user123',
    storageType: 'redis',
    redisOptions: {
      host: 'localhost',
      port: 6379,
    }
  });

  // Mount a session
  const userDataDir = await browserState.mount('my-session');

  // Launch Playwright with the mounted profile
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 50,
  });

  try {
    // Create a new page
    const page = await browser.newPage();
    
    // Navigate to a website
    await page.goto('https://example.com');
    
    // Perform actions (login, click, etc.)
    await page.fill('#username', 'testuser');
    await page.fill('#password', 'password123');
    await page.click('#login-button');
    
    // Wait for navigation or specific element
    await page.waitForSelector('.dashboard');
    
    // Take a screenshot
    await page.screenshot({ path: 'dashboard.png' });
    
    // Close the browser
    await browser.close();
  } catch (error) {
    console.error('Automation error:', error);
    await browser.close();
  } finally {
    // Always unmount to save changes and clean up
    await browserState.unmount();
  }
}

runAutomation().catch(console.error);
```

## 📚 API Reference

### BrowserState

The main class for managing browser state.

#### Constructor Options

```typescript
interface BrowserStateOptions {
  userId: string;                  // User identifier for organizing storage
  storageType: 'local' | 's3' | 'gcs' | 'redis';  // Storage provider type
  autoCleanup?: boolean;           // Whether to automatically clean up temporary files (default: true)
  localOptions?: {                 // Options for local storage
    storagePath: string;           // Local storage directory path
  };
  s3Options?: {                    // Options for AWS S3 storage
    bucketName: string;            // S3 bucket name
    region: string;                // AWS region
    accessKeyID: string;           // AWS access key ID
    secretAccessKey: string;       // AWS secret access key
    endpoint?: string;             // Optional endpoint for S3-compatible services
  };
  gcsOptions?: {                   // Options for Google Cloud Storage
    bucketName: string;            // GCS bucket name
    projectID: string;             // Google Cloud project ID
    keyFilename?: string;          // Path to service account key file
  };
  redisOptions?: {                 // Options for Redis storage
    host: string;                  // Redis host
    port: number;                  // Redis port
    password?: string;             // Redis password (if required)
    db?: number;                   // Redis database number
    keyPrefix?: string;            // Prefix for Redis keys
    ttl?: number;                  // Time-to-live in seconds
    // All ioredis options are supported
  };
}
```

#### Methods

- **mount(sessionId: string): Promise<string>**  
  Downloads and prepares a session for use. Returns the path to use with your browser.

- **unmount(): Promise<void>**  
  Uploads and cleans up the current session.

- **listSessions(): Promise<string[]>**  
  Lists all available sessions for the user.

- **deleteSession(sessionId: string): Promise<void>**  
  Deletes a specific session.

- **cleanup(): Promise<void>**  
  Manually clean up temporary files (useful when autoCleanup is disabled).

## 🧹 Automatic Cleanup

BrowserState creates temporary files on your local system when working with browser profiles. By default, these files are automatically cleaned up when:

1. You call `unmount()` to save the session
2. The Node.js process exits normally
3. The process is terminated with SIGINT (Ctrl+C)
4. An uncaught exception occurs

You can disable this automatic cleanup by setting `autoCleanup: false` in the constructor options:

```typescript
const browserState = new BrowserState({
  userId: 'user123',
  storageType: 'local',
  autoCleanup: false,
  localOptions: {
    storagePath: '/path/to/local/storage'
  }
});
```

When automatic cleanup is disabled, you can manually clean up temporary files by calling:

```typescript
await browserState.cleanup();
```

This is useful in scenarios where you want more control over when cleanup occurs, such as in long-running server processes or when handling multiple browser states.

## 🐛 Issues and Feedback

If you encounter any issues or have feedback about specific storage providers:

1. 🔍 Check the existing GitHub issues to see if your problem has been reported
2. ✍️ Create a new issue with:
   - A clear description of the problem
   - Which storage provider you're using
   - Steps to reproduce the issue
   - Environment details (Node.js version, browser, etc.)

We especially welcome feedback and testing reports for the Redis, S3, and GCS storage providers.

## 📄 License

MIT

## 🚀 Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@0.3.0-canary.TIMESTAMP
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.
