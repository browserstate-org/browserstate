# BrowserState

BrowserState is a Node.js library for managing browser profiles across different storage providers, including local storage, AWS S3, and Google Cloud Storage.


# Why BrowserState?
Most browser automation workflows fail because authentication and session data don't persist reliably across different environments. Manually handling cookies or re-authenticating slows everything down.

BrowserState fixes this by letting you save, transfer, and restore full browser states across machines effortlessly. Whether you're running Playwright, Selenium, or Pyppeteer, your automation just works, no matter where it runs.

- ✅ Stop re-authenticating – Restore cookies, local storage, and session data seamlessly.
- ✅ Works anywhere – Supports local storage, AWS S3, and Google Cloud.
- ✅ Automation-friendly – Drop-in support for Playwright, Selenium, and Puppeteer.

Now you can move fast without breaking sessions.

## Implementation Status

| Storage Provider | Status |
|------------------|--------|
| Local Storage | ✅ Extensively tested |
| S3 Storage | ⚠️ Implemented, needs additional testing |
| GCS Storage | ⚠️ Implemented, needs additional testing |

Currently, we recommend using the local storage provider for production use cases. Cloud storage providers are available but should be thoroughly tested in your environment before production use.

## Installation

```bash
npm install browserstate
```

## Optional Dependencies

BrowserState supports multiple storage backends. Depending on your needs, you may want to install additional dependencies:

- For AWS S3 storage:
  ```bash
  npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
  ```

- For Google Cloud Storage:
  ```bash
  npm install @google-cloud/storage
  ```

## Usage

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

// Use browser state
async function example() {
  // Mount a session
  await browserState.mount('session123');

  // Your browser automation code here...

  // Launch Chrome with the mounted profile and additional configurations
  console.log("Launching Chrome browser with additional configurations...");
  const chromeContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // Launch in non-headless mode for visibility
    slowMo: 100, // Slow down operations for demo purposes
    userDataDir: userDataDir, // Use the userDataDir from BrowserState
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
  await browserState.unmount();

  // List available sessions
  const sessions = await browserState.listSessions();
  console.log(sessions);

  // Delete a session
  await browserState.deleteSession('session123');
}
```

## API

### BrowserState

The main class for managing browser state.

#### Constructor Options

- `userId`: User identifier for organizing storage
- `storageType`: Type of storage to use ('local', 's3', or 'gcs')
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

## Issues and Feedback

If you encounter any issues or have feedback about specific storage providers:

1. Check the existing GitHub issues to see if your problem has been reported
2. Create a new issue with:
   - A clear description of the problem
   - Which storage provider you're using
   - Steps to reproduce the issue
   - Environment details (Node.js version, browser, etc.)

We especially welcome feedback and testing reports for the S3 and GCS storage providers.

## License

MIT