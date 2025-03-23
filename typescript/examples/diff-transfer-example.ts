/**
 * Example of using BrowserState with differential transfers for cloud storage
 * 
 * This example demonstrates how to use the differential transfers feature to speed
 * up uploads and downloads when working with cloud storage providers.
 */

import { BrowserState } from '../src/BrowserState';
import { chromium } from 'playwright';

// Replace with your own GCS credentials
const GCS_BUCKET_NAME = 'your-bucket-name';
const GCS_PROJECT_ID = 'your-project-id';
const GCS_KEY_FILENAME = '/path/to/service-account-key.json';

async function run() {
  console.log('Starting BrowserState Differential Transfers Example');

  // Initialize BrowserState with GCS storage and differential transfers enabled
  const browserState = new BrowserState({
    userId: 'diff-transfer-test',
    storageType: 'gcs',
    useDiffTransfers: true, // Enable differential transfers
    gcsOptions: {
      bucketName: GCS_BUCKET_NAME,
      projectID: GCS_PROJECT_ID,
      keyFilename: GCS_KEY_FILENAME
    }
  });

  const sessionId = 'session-diff-example';

  // List available sessions
  const sessions = await browserState.listSessions();
  console.log('Available sessions:', sessions);

  // Mount the session
  console.log(`Mounting session: ${sessionId}`);
  const userDataDir = await browserState.mount(sessionId);
  console.log(`Session mounted at: ${userDataDir}`);

  // Use the browser
  console.log('Launching browser with the mounted profile...');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false
  });

  const page = await browser.newPage();
  await page.goto('https://example.com');
  
  // Wait a bit to let the user see the browser
  console.log('Browser launched! Waiting for 5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Close the browser
  console.log('Closing browser...');
  await browser.close();

  // Unmount the session
  console.log('Unmounting session...');
  await browserState.unmount();
  console.log('Session unmounted successfully');

  console.log('\nDifferential Transfers Performance Notes:');
  console.log('1. The first time you run this, it will perform a full transfer (baseline)');
  console.log('2. Subsequent runs will only transfer changed files');
  console.log('3. For large profiles, this can significantly improve performance');
}

run().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 