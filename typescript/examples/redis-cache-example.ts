/**
 * Example demonstrating Redis caching with BrowserState
 * This example shows how to use Redis as a caching layer
 * to improve mount/unmount performance with cloud storage
 */

import { BrowserState } from '../src/BrowserState';
import { chromium, BrowserContext } from 'playwright';
import path from 'path';

// Replace with your own GCS credentials
const GCS_BUCKET_NAME = 'browser-states';
const GCS_PROJECT_ID = 'browser-automation-454509';
const GCS_KEY_FILENAME = path.join(__dirname, 'service-account.json');

// Redis configuration
const REDIS_CONFIG = {
  host: 'localhost',
  port: 6379,
  password: undefined, // Add if using password
  db: 0,
  tls: false,
  keyPrefix: 'browserstate:',
  ttl: 3600, // 1 hour
  enabled: true
};

async function run() {
  console.log('🚀 Starting BrowserState Redis Cache Demo\n');

  let browserState: BrowserState | null = null;
  let browser: BrowserContext | null = null;

  // Path to our test HTML file
  const testPath = path.join(__dirname, 'test.html');

  try {
    // Initialize BrowserState with GCS storage and Redis caching
    browserState = new BrowserState({
      userId: 'redis-example',
      storageType: 'gcs',
      gcsOptions: {
        bucketName: GCS_BUCKET_NAME,
        projectID: GCS_PROJECT_ID,
        keyFilename: GCS_KEY_FILENAME
      },
      redisOptions: REDIS_CONFIG
    }); 

    const sessionId = 'session-redis-example';

    // First mount - will download from GCS and cache in Redis
    console.log('📥 First Mount (Download from GCS + Cache in Redis)');
    const startTime1 = Date.now();
    const userDataDir = await browserState.mount(sessionId);
    const mountTime1 = Date.now() - startTime1;
    console.log(`⏱️ Time taken: ${mountTime1}ms\n`);

    // Use browser and make changes
    browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false
    });
    const page = await browser.newPage();
    
    // Navigate to our test page
    await page.goto(`file://${testPath}`);
    
    // Add some notes that will be saved in localStorage
    await page.fill('#noteInput', 'First note: Testing Redis cache');
    await page.click('button:text("Add Note")');
    
    await page.fill('#noteInput', 'Second note: This should persist');
    await page.click('button:text("Add Note")');
    
    // Wait to see the changes
    await new Promise(resolve => setTimeout(resolve, 3000));
    await browser.close();
    browser = null;

    // Unmount - will sync to GCS and update Redis cache
    console.log('\n📤 Syncing changes to cloud...');
    await browserState.unmount();
    console.log('✅ Changes synced\n');

    // Second mount - should be faster as it uses Redis cache
    console.log('📥 Second Mount (Using Redis Cache)');
    const startTime2 = Date.now();
    const userDataDir2 = await browserState.mount(sessionId);
    const mountTime2 = Date.now() - startTime2;
    console.log(`⏱️ Time taken: ${mountTime2}ms\n`);

    // Show browser with preserved state
    browser = await chromium.launchPersistentContext(userDataDir2, {
      headless: false
    });
    const page2 = await browser.newPage();
    await page2.goto(`file://${testPath}`);
    
    // Add one more note to demonstrate state persistence
    await page2.fill('#noteInput', 'Third note: Added after Redis cache');
    await page2.click('button:text("Add Note")');
    
    // Wait to see the changes
    await new Promise(resolve => setTimeout(resolve, 3000));
    await browser.close();
    browser = null;

    // Final unmount
    console.log('\n📤 Syncing final changes to cloud...');
    await browserState.unmount();
    console.log('✅ Changes synced\n');

    // Performance Summary
    console.log('📊 Performance Summary');
    console.log('---------------------');
    console.log(`First Mount (GCS Download): ${mountTime1}ms`);
    console.log(`Second Mount (Redis Cache): ${mountTime2}ms`);
    console.log(`Speed Improvement: ${((mountTime1 - mountTime2) / mountTime1 * 100).toFixed(1)}%\n`);

    console.log('💡 Key Benefits:');
    console.log('• Faster subsequent mounts');
    console.log('• Reduced cloud storage operations');
    console.log('• Lower bandwidth usage');
    console.log('• Better performance for frequent access');

  } catch (error) {
    // Clean up resources
    if (browser) {
      await browser.close().catch(console.error);
    }
    if (browserState) {
      await browserState.unmount().catch(console.error);
    }

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('credentials')) {
        console.error('\n❌ Authentication Error:', error.message);
        console.error('Please check your GCS credentials in service-account.json');
        process.exit(1);
      }
      if (error.message.includes('connect')) {
        console.error('\n❌ Connection Error:', error.message);
        console.error('Please check your network connection and Redis server');
        process.exit(1);
      }
    }

    // Handle unknown errors
    console.error('\n❌ Unexpected Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

run(); 