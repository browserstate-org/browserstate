/**
 * Example of using BrowserState with efficient synchronization for cloud storage
 * 
 * This example demonstrates how to use the efficient synchronization feature to speed
 * up uploads and downloads when working with cloud storage providers.
 */

import path from 'path';
import { BrowserState } from '../../src/BrowserState';
import { chromium, BrowserContext } from 'playwright';
import { 
  BrowserStateError, 
  StorageProviderError, 
  AuthenticationError, 
  ConnectionError,
  ResourceNotFoundError 
} from '../../src/errors';
import { ProgressTracker, ProgressEvent } from '../../src/utils/ProgressTracker';

// Replace with your own GCS credentials
const GCS_BUCKET_NAME = 'browser-states';
const GCS_PROJECT_ID = 'browser-automation-454509';
const GCS_KEY_FILENAME = path.join(__dirname, 'service-account.json');

// Clear the current line in the terminal
function clearLine(): void {
  process.stdout.write('\r\x1b[K');
}

// Display progress bar
function displayProgress(event: ProgressEvent): void {
  const { type, fileName, bytesTransferred, totalBytes, percentage } = event;
  const operation = type === 'download' ? '📥 Downloading' : '📤 Uploading';
  const progressBar = ProgressTracker.createProgressBar(percentage);
  const bytesProgress = `${ProgressTracker.formatBytes(bytesTransferred)} / ${ProgressTracker.formatBytes(totalBytes)}`;
  const speed = calculateSpeed(bytesTransferred);
  
  clearLine();
  process.stdout.write(
    `${operation} ${fileName}: ${progressBar} ${bytesProgress} ${speed}`
  );
  
  if (percentage === 100) {
    process.stdout.write('\n');
  }
}

// Calculate transfer speed
let lastBytesTransferred = 0;
let lastTime = Date.now();

function calculateSpeed(bytesTransferred: number): string {
  const now = Date.now();
  const timeDiff = (now - lastTime) / 1000; // Convert to seconds
  const bytesDiff = bytesTransferred - lastBytesTransferred;
  
  if (timeDiff >= 1) { // Update speed every second
    const speed = bytesDiff / timeDiff;
    lastBytesTransferred = bytesTransferred;
    lastTime = now;
    return `(${ProgressTracker.formatBytes(speed)}/s)`;
  }
  
  return '';
}

async function run() {
  console.log('🚀 Starting BrowserState Efficient Synchronization Demo\n');

  let browserState: BrowserState | null = null;
  let browser: BrowserContext | null = null;

  // Path to our test HTML file
  const testPath = path.join(__dirname, 'test.html');

  try {
    // Set up progress tracking
    const progressTracker = ProgressTracker.getInstance();
    progressTracker.on('progress', displayProgress);

    // Initialize BrowserState with GCS storage and efficient sync enabled
    browserState = new BrowserState({
      userId: 'sync-example',
      storageType: 'gcs',
      useSync: true,
      cleanupMode: 'exit-only',
      syncOptions: {
        storeMetadataOnProvider: true,
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
    browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false
    });
    const page = await browser.newPage();
    
    // Navigate to our test page
    await page.goto(`file://${testPath}`);
    
    // Add some notes that will be saved in localStorage
    await page.fill('#noteInput', 'First note: Testing browser state');
    await page.click('button:text("Add Note")');
    
    await page.fill('#noteInput', 'Second note: This should persist');
    await page.click('button:text("Add Note")');
    
    await page.fill('#noteInput', 'Third note: With timestamps');
    await page.click('button:text("Add Note")');
    
    // Wait to see the changes
    await new Promise(resolve => setTimeout(resolve, 3000));
    await browser.close();
    browser = null;

    // Unmount
    console.log('\n📤 Syncing changes to cloud...');
    lastBytesTransferred = 0;
    lastTime = Date.now();
    await browserState.unmount();
    console.log('✅ Changes synced\n');

    // Second mount - efficient sync
    console.log('📥 Second Mount (Efficient Sync)');
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
    
    // Add one more note to demonstrate delta sync
    await page2.fill('#noteInput', 'Fourth note: Added after sync');
    await page2.click('button:text("Add Note")');
    
    // Wait to see the changes
    await new Promise(resolve => setTimeout(resolve, 3000));
    await browser.close();
    browser = null;

    // Final unmount
    console.log('\n📤 Syncing final changes to cloud...');
    lastBytesTransferred = 0;
    lastTime = Date.now();
    await browserState.unmount();
    console.log('✅ Changes synced\n');

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

  } catch (error) {
    // Clean up resources
    if (browser) {
      await browser.close().catch(console.error);
    }
    if (browserState) {
      await browserState.unmount().catch(console.error);
    }

    // Handle specific error types
    if (error instanceof AuthenticationError) {
      console.error('\n❌ Authentication Error:', error.message);
      console.error('Please check your GCS credentials in service-account.json');
      process.exit(1);
    }

    if (error instanceof ConnectionError) {
      console.error('\n❌ Connection Error:', error.message);
      console.error('Please check your network connection and GCS bucket accessibility');
      process.exit(1);
    }

    if (error instanceof ResourceNotFoundError) {
      console.error('\n❌ Resource Not Found:', error.message);
      console.error('The requested session or file does not exist');
      process.exit(1);
    }

    if (error instanceof StorageProviderError) {
      console.error('\n❌ Storage Provider Error:', error.message);
      console.error(`Provider: ${error.provider}`);
      process.exit(1);
    }

    if (error instanceof BrowserStateError) {
      console.error('\n❌ BrowserState Error:', error.message);
      console.error(`Error Code: ${error.code}`);
      process.exit(1);
    }

    // Handle unknown errors
    console.error('\n❌ Unexpected Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

run(); 