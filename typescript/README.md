# 🌐 BrowserState

BrowserState is a Node.js library for managing browser profiles across different storage providers, including local storage, AWS S3, and Google Cloud Storage.


# 🤔 Why BrowserState?
Most browser automation workflows fail because authentication and session data don't persist reliably across environments. Manually handling cookies or re-authenticating slows everything down. Worse, many automations fail due to inconsistent browser fingerprints, machine IDs, and storage states—leading to bot detection and bans.

BrowserState ensures your automation behaves like a real, returning user by providing:

🔄 Full Browser Context Restoration – Save and restore cookies, local storage, IndexedDB, service worker caches, and extension data. Resume automation 
from the exact previous state.

🔗 Multi-Instance Synchronization – Share browser profiles across multiple servers or devices, making automation scalable and resilient.

🚀 Zero-Setup Onboarding for Automation – Instantly deploy automation-ready browser profiles without manual setup.

⚡️ Efficient Resource Usage – Persistent browser usage without memory leaks, eliminating the need to launch new instances for every run.

🔍 Faster Debugging & Reproducibility – Store failing test cases exactly as they were, making it easy to diagnose automation failures.

💾 Offline Execution & Caching – Automate tasks that rely on cached assets, such as scraping content behind paywalls or working in low-connectivity environments.

🔄 Cross-Device Synchronization – Seamlessly move between local development, cloud servers, and headless automation.

## 🛡️ Bot Detection Bypass
Many bot detection systems track inconsistencies in browser states—frequent changes to fingerprints, device identifiers, and storage behavior trigger red flags. Most people get detected because they unknowingly create a "new machine" every time.

BrowserState solves this by preserving a stable, persistent browser identity across runs instead of resetting key markers. This drastically reduces detection risks while maintaining full automation control.

Now you can move fast without breaking sessions—or getting flagged as a bot.

## 📊 Implementation Status

| Storage Provider | Status |
|------------------|--------|
| Local Storage | ✅ Extensively tested |
| S3 Storage | ✅ Tested and works, but requires more extensive testing in different environments |
| GCS Storage | ✅ Tested and works, but requires more extensive testing in different environments |

## 📦 Installation

```bash
npm install browserstate
```

## 🚀 Canary Releases

BrowserState provides canary releases for testing new features before they're available in stable releases. Canary versions are published automatically when changes are merged to main.

```bash
# Install latest canary version
npm install browserstate@canary

# Install specific canary version
npm install browserstate@0.1.13-canary.20240328215210
```

> ⚠️ **Warning**: Canary releases may contain breaking changes and should be used with caution in production environments.

## 🔧 Optional Dependencies

BrowserState supports multiple storage backends. Depending on your needs, you may want to install additional dependencies:

- For AWS S3 storage:
  ```bash
  npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
  ```

- For Google Cloud Storage:
  ```bash
  npm install @google-cloud/storage
  ```

## 💻 Usage

```typescript
import { BrowserState } from 'browserstate';

// Local storage
const localBrowserState = new BrowserState({
  userId: 'user123',
  storageType: 'local',
  localOptions: {
    storagePath: '/path/to/local/storage'
  }
});

// AWS S3 storage
const s3BrowserState = new BrowserState({
  userId: 'user123',
  storageType: 's3',
  s3Options: {
    bucketName: 'my-browser-states',
    region: 'us-west-2',
    accessKeyID: 'YOUR_ACCESS_KEY_ID',
    secretAccessKey: 'YOUR_SECRET_ACCESS_KEY'
  }
});

// Google Cloud Storage
const gcsBrowserState = new BrowserState({
  userId: 'user123',
  storageType: 'gcs',
  gcsOptions: {
    bucketName: 'my-browser-states',
    projectID: 'your-project-id',
    keyFilename: '/path/to/service-account-key.json'
  }
});

// With autoCleanup disabled
const longRunningBrowserState = new BrowserState({
  userId: 'user123',
  storageType: 'local',
  autoCleanup: false, // Disable automatic cleanup
  localOptions: {
    storagePath: '/path/to/local/storage'
  }
});

// Use browser state
async function example() {
  // Mount a session
  // For cloud storage (S3/GCS): Downloads the session from storage (if it exists) or creates a new one
  // For local storage: Uses the existing session or creates a new one
  // Returns the path to the local directory containing the browser profile
  // This path must be used when launching the browser
  const userDataDir = await browserState.mount('session123');

  // Your browser automation code here...

  // Launch Chrome with the mounted profile and additional configurations
  // userDataDir contains all the browser profile data (cookies, storage, etc.)
  // This ensures the browser launches with the exact same state as last time
  console.log("Launching Chrome browser with additional configurations...");
  const chromeContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // Launch in non-headless mode for visibility
    slowMo: 100, // Slow down operations for demo purposes
    // Additional configurations can be added here as needed
  });

  // Perform browser automation tasks with the launched browser context
  // Example: Navigate to a website and perform actions
  const page = await chromeContext.newPage();
  await page.goto('https://example.com');
  await page.locator('text=Click me').click();

  // Close the browser context to free up resources
  console.log("Closing Chrome browser...");
  await chromeContext.close();

  // Unmount and save the session
  // This is crucial - it ensures all browser state changes are saved back to storage
  // Without this, any changes made during automation would be lost
  // For cloud storage (S3/GCS): This uploads all changes back to the cloud
  // For local storage: Since files are already in the correct location, this just cleans up temporary files
  await browserState.unmount();
}
```

## 📚 API

### BrowserState

The main class for managing browser state.

#### Constructor Options

- `userId`: User identifier for organizing storage
- `storageType`: Type of storage to use ('local', 's3', or 'gcs')
- `autoCleanup`: Whether to automatically clean up temporary files on process exit (default: true)
- `localOptions`: Options for local storage
  - `storagePath`: Local storage directory path
- `s3Options`: Options for AWS S3 storage
  - `bucketName`: S3 bucket name
  - `region`: AWS region
  - `accessKeyID`: AWS access key ID
  - `secretAccessKey`: AWS secret access key
- `gcsOptions`: Options for Google Cloud Storage
  - `bucketName`: GCS bucket name
  - `projectID`: Google Cloud project ID
  - `keyFilename`: Path to service account key file

#### Methods

- `mount(sessionId: string)`: Downloads and prepares a session for use
- `unmount()`: Uploads and cleans up the current session
- `listSessions()`: Lists all available sessions for the user
- `deleteSession(sessionId: string)`: Deletes a specific session
- `cleanup()`: Manually clean up temporary files (useful when autoCleanup is disabled)

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

We especially welcome feedback and testing reports for the S3 and GCS storage providers.

## 📄 License

MIT
## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.

## Canary Releases

To install the latest canary version:
```bash
npm install browserstate@canary
```

To install a specific canary version:
```bash
npm install browserstate@
```

Canary releases are pre-release versions that may contain breaking changes or experimental features. Use with caution in production environments.
