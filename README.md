# BrowserState

BrowserState is a Node.js library for managing browser profiles across different storage providers, including local storage, AWS S3, and Google Cloud Storage.

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

## License

MIT 