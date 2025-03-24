/**
 * Example of using BrowserState with efficient synchronization for cloud storage
 * 
 * This example demonstrates how to use the efficient synchronization feature to speed
 * up uploads and downloads when working with cloud storage providers.
 */

import path from 'path';
import { BrowserState } from '../../src/BrowserState';
import { chromium } from 'playwright';

// Replace with your own GCS credentials
const GCS_BUCKET_NAME = 'browser-states';
const GCS_PROJECT_ID = 'browser-automation-454509';
const GCS_KEY_FILENAME = path.join(__dirname, 'service-account.json');

async function run() {
  console.log('🚀 Starting BrowserState Efficient Synchronization Demo\n');

  // Initialize BrowserState with GCS storage and efficient sync enabled
  const browserState = new BrowserState({
    userId: 'sync-example',
    storageType: 'gcs',
    useSync: true,
    cleanupMode: 'exit-only',
    syncOptions: {
      metadataStorage: 'cloud',
      metadataUpdateInterval: 60
    },
    gcsOptions: {
      bucketName: GCS_BUCKET_NAME,
      projectID: GCS_PROJECT_ID,
      keyFilename: GCS_KEY_FILENAME
    }
  });

  const sessionId = 'session-sync-example';

  // First mount - full download
  console.log('📥 First Mount (Full Download)');
  const startTime1 = Date.now();
  const userDataDir = await browserState.mount(sessionId);
  const mountTime1 = Date.now() - startTime1;
  console.log(`⏱️ Time taken: ${mountTime1}ms\n`);

  // Use browser and make changes
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false
  });
  const page = await browser.newPage();
  await page.goto('https://example.com');
  await page.goto('https://mozilla.org');
  await new Promise(resolve => setTimeout(resolve, 3000));
  await browser.close();

  // Unmount
  await browserState.unmount();

  // Second mount - efficient sync
  console.log('📥 Second Mount (Efficient Sync)');
  const startTime2 = Date.now();
  const userDataDir2 = await browserState.mount(sessionId);
  const mountTime2 = Date.now() - startTime2;
  console.log(`⏱️ Time taken: ${mountTime2}ms\n`);

  // Show browser with preserved state
  const browser2 = await chromium.launchPersistentContext(userDataDir2, {
    headless: false
  });
  const page2 = await browser2.newPage();
  await page2.goto('https://example.com');
  await new Promise(resolve => setTimeout(resolve, 3000));
  await browser2.close();

  // Final unmount
  await browserState.unmount();

  // Performance Summary
  console.log('📊 Performance Summary');
  console.log('---------------------');
  console.log(`First Mount (Full Download): ${mountTime1}ms`);
  console.log(`Second Mount (Efficient Sync): ${mountTime2}ms`);
  console.log(`Speed Improvement: ${((mountTime1 - mountTime2) / mountTime1 * 100).toFixed(1)}%\n`);

  console.log('💡 Key Benefits:');
  console.log('• Only changed files are transferred');
  console.log('• Faster subsequent mounts');
  console.log('• Reduced bandwidth usage');
  console.log('• Works across multiple services');
}

run().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 