/**
 * Example of using BrowserState with cloud-based efficient synchronization for multi-service scenarios
 * 
 * This example demonstrates how to configure BrowserState to use cloud-based metadata storage
 * for efficient synchronization, which is useful when multiple services or machines are using
 * the same browser profile.
 */

import { BrowserState } from '../src/BrowserState';
import { chromium } from 'playwright';

// Replace with your own GCS credentials
const GCS_BUCKET_NAME = 'your-bucket-name';
const GCS_PROJECT_ID = 'your-project-id';
const GCS_KEY_FILENAME = '/path/to/service-account-key.json';

async function run() {
  console.log('Starting BrowserState Multi-Service Efficient Sync Example');

  // Initialize BrowserState with cloud-based metadata storage
  const browserState = new BrowserState({
    userId: 'multi-service-test',
    storageType: 'gcs',
    
    // Enable efficient synchronization
    useEfficientSync: true,
    
    // Configure efficient sync for multi-service usage
    syncOptions: {
      // Store metadata in the cloud so all services can access it
      metadataStorage: 'cloud',
      
      // Only update metadata every 5 minutes to prevent conflicts
      // when multiple services are using the same profile
      metadataUpdateInterval: 300
    },
    
    gcsOptions: {
      bucketName: GCS_BUCKET_NAME,
      projectID: GCS_PROJECT_ID,
      keyFilename: GCS_KEY_FILENAME
    }
  });

  const sessionId = 'shared-session-example';

  // List available sessions
  const sessions = await browserState.listSessions();
  console.log('Available sessions:', sessions);

  // Mount the session
  console.log(`Mounting session: ${sessionId}`);
  console.log('This will use cloud-based metadata to optimize the download');
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

  // Add some data to the browser
  await page.goto('https://wikipedia.org');
  
  // Close the browser
  console.log('Closing browser...');
  await browser.close();

  // Unmount the session
  console.log('Unmounting session...');
  console.log('This will use cloud-based metadata to optimize the upload');
  await browserState.unmount();
  console.log('Session unmounted successfully');

  console.log('\nMulti-Service Sync Notes:');
  console.log('1. The metadata is stored in the cloud alongside your browser profile');
  console.log('2. Other services using the same profile will benefit from this metadata');
  console.log('3. Metadata is only updated every 5 minutes to prevent conflicts');
  console.log('4. This ensures efficient syncing even with multiple services');
}

run().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 