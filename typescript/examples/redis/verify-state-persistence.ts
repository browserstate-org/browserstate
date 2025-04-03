/**
 * Example demonstrating state persistence verification with Redis storage
 * This example verifies that browser state (localStorage, cookies, etc.)
 * is correctly persisted and restored when using Redis as the storage backend.
 * 
 * Implementation Details:
 * - The Redis storage provider uses ZIP compression to store the entire browser profile
 * - The ZIP archive is stored as base64-encoded data in Redis
 * - No individual file handling or filtering is performed, ensuring complete state preservation
 * - Session metadata is stored separately with timestamps for tracking
 * 
 * The test:
 * 1. Creates a new browser session
 * 2. Adds data to localStorage
 * 3. Persists the state to Redis (ZIP archive of the entire profile)
 * 4. Loads the state from Redis (extracts the ZIP archive)
 * 5. Verifies the data is correctly restored
 * 6. Makes additional changes
 * 7. Verifies final state persistence
 * 
 * This helps ensure that Redis storage correctly handles:
 * - Complete profile serialization/deserialization via ZIP archives
 * - State persistence across sessions, including all browser files
 * - Data integrity through complete directory structure preservation
 * - Performance metrics for ZIP-based compression and storage
 */

import path from 'path';
import { chromium, BrowserContext } from 'playwright';
import { BrowserState } from '../../src/BrowserState';
import Redis from 'ioredis';

// Redis configuration
const REDIS_CONFIG = {
  // Basic connection options
  host: 'localhost',
  port: 6379,
  password: undefined, // Add if using password
  db: 0,
  
  // Storage configuration
  keyPrefix: 'browserstate',
  
  // Advanced options
  ttl: 604800, // 7 days TTL
};

async function run() {
  console.log('🚀 Starting BrowserState Redis Storage Demo\n');

  let browserState: BrowserState | null = null;
  let browser: BrowserContext | null = null;

  // Create function to safely close browser
  const closeBrowser = async () => {
    if (browser !== null) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e);
      }
      browser = null;
    }
  };

  // Create function to safely unmount
  const unmountBrowserState = async () => {
    if (browserState !== null) {
      try {
        await browserState.unmount();
      } catch (e) {
        // Ignore "No session is currently mounted" errors
        if (!(e instanceof Error && e.message.includes('No session is currently mounted'))) {
          console.error('Error unmounting browser state:', e);
        }
      }
    }
  };

  // Path to our test HTML file
  const testPath = path.join(__dirname, '../shared/test.html');

  try {
    // Initialize BrowserState with Redis as primary storage
    console.log('🔧 Creating BrowserState with Redis storage...');
    browserState = new BrowserState({
      userId: 'redis-storage-demo',
      storageType: 'redis',
      redisOptions: REDIS_CONFIG
    });

    // List existing sessions
    console.log('📋 Listing existing sessions...');
    const sessions = await browserState.listSessions();
    console.log(`📝 Existing sessions: ${sessions.length > 0 ? sessions.join(', ') : 'none'}`);

    const sessionId = 'redis-storage-example';

    // First mount - will create a new session if it doesn't exist
    console.log('\n📥 First Mount (Load or create new session)');
    const startTime1 = Date.now();
    
    try {
      const userDataDir = await browserState.mount(sessionId);
      const mountTime1 = Date.now() - startTime1;
      
      // Check if this is a newly created profile or loaded from Redis
      const isNewSession = !sessions.includes(sessionId);
      
      console.log(`⏱️ Time taken: ${mountTime1}ms`);
      console.log(`📂 User data directory: ${userDataDir}`);
      console.log(`${isNewSession ? '🆕 New session created' : '🔄 Existing session loaded'}\n`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Use browser and make changes
      console.log('🌐 Launching browser with Redis-stored profile...');
      browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      });
      const page = await browser.newPage();
      
      // Navigate to our test page
      console.log('📄 Opening test page...');
      await page.goto(`file://${testPath}`);
      console.log('✅ Test page loaded');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Add some notes that will be saved in localStorage
      console.log('📝 Adding notes to localStorage...');
      const timestamp = new Date().toLocaleTimeString();
      const date = new Date().toLocaleDateString();
      await page.fill('#noteInput', `📝 Note from ${date} at ${timestamp}: Run #${Date.now() % 1000}`);
      await page.click('button:text("Add Note")');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await page.fill('#noteInput', `💾 Redis persistence test at ${timestamp}: Run #${Date.now() % 1000}`);
      await page.click('button:text("Add Note")');
      
      // Wait to see the changes
      console.log('⏳ Waiting to see changes...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('🔒 Closing browser...');
      await browser.close();
      browser = null;

      // Unmount - will store data in Redis
      console.log('\n📤 Syncing changes to Redis...');
      const uploadStartTime = Date.now();
      await browserState.unmount();
      const uploadTime = Date.now() - uploadStartTime;
      console.log(`⏱️ Upload time: ${uploadTime}ms`);
      console.log('✅ Changes synced to Redis\n');

      // Give Redis a moment
      console.log('⏳ Letting Redis process changes...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Second mount - should load the session with our notes
      console.log('📥 Second Mount (Load existing session from Redis)');
      const startTime2 = Date.now();
      const userDataDir2 = await browserState.mount(sessionId);
      const mountTime2 = Date.now() - startTime2;
      console.log(`⏱️ Time taken: ${mountTime2}ms`);
      console.log(`📂 User data directory: ${userDataDir2}\n`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Show browser with preserved state
      console.log('🔄 Opening browser with restored session...');
      console.log('💾 Checking if data persisted correctly from Redis...');
      browser = await chromium.launchPersistentContext(userDataDir2, {
        headless: false,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      });
      const page2 = await browser.newPage();
      
      console.log('📄 Opening test page again...');
      await page2.goto(`file://${testPath}`);
      console.log('✅ Previous notes should be visible');

      // Verify notes persisted from Redis
      try {
        await page2.waitForSelector('.note-item', { timeout: 3000 });
        const notes = await page2.$$eval('.note-item', items => items.map(item => item.textContent?.trim()));
        if (notes.length > 0) {
          console.log('📋 Persisted notes from previous runs:');
          notes.forEach((note, index) => console.log(` ${index+1}. ${note}`));
          console.log(`Found ${notes.length} note(s) persisted in Redis storage`);
        } else {
          console.log('⚠️ No notes found in the restored session');
        }
      } catch (error) {
        console.log('⚠️ Could not find notes in the restored session:', error instanceof Error ? error.message : String(error));
      }

      // Wait to observe the restored session
      await new Promise(resolve => setTimeout(resolve, 4000));

      // Add one more note to demonstrate state persistence
      console.log('📝 Adding one more note to verify persistence...');
      const secondTimestamp = new Date().toLocaleTimeString();
      await page2.fill('#noteInput', `🔄 Note added after reload at ${secondTimestamp}: Run #${Date.now() % 1000}`);
      await page2.click('button:text("Add Note")');
      
      // Wait to see the changes
      console.log('⏳ Observing persistent state...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('🔒 Closing browser...');
      await browser.close();
      browser = null;

      // Final unmount
      console.log('\n📤 Syncing final changes to Redis...');
      const finalUploadStartTime = Date.now();
      await browserState.unmount();
      const finalUploadTime = Date.now() - finalUploadStartTime;
      console.log(`⏱️ Upload time: ${finalUploadTime}ms`);
      console.log('✅ Final changes synced to Redis\n');
      
      // Performance Summary
      console.log('📊 Performance Summary');
      console.log('---------------------');
      console.log(`🔹 First Mount: ${mountTime1}ms ${isNewSession ? '(new session created)' : '(existing session loaded)'}`);
      console.log(`🔹 First Upload: ${uploadTime}ms`);
      console.log(`🔹 Second Mount: ${mountTime2}ms`);
      console.log(`🔹 Final Upload: ${finalUploadTime}ms\n`);
      
      console.log('💡 Key Benefits of Redis Storage:');
      console.log('🚀 Fast operations for both read and write');
      console.log('☁️ Persistent storage without cloud dependencies');
      console.log('🔄 Great for microservices and containerized environments');
      console.log('⚡ Excellent for high-frequency, short-lived sessions');
      console.log('🛠️ Low operational overhead');
      
      // Explicitly exit the process when done
      console.log('\n✅ Test complete - exiting');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during the demo:', error instanceof Error ? error.message : String(error));
      
      // If the error is that the session wasn't found, create a new one instead
      if (error instanceof Error && error.message.includes('not found')) {
        console.log('🆕 Creating a new session instead...');
        
        // Mount the new session first
        console.log('🔧 Mounting new session...');
        const userDataDir = await browserState.mount(sessionId);
        
        // Use browser and make changes
        console.log('🌐 Launching browser with new profile...');
        browser = await chromium.launchPersistentContext(userDataDir, {
          headless: false,
          args: ['--no-sandbox', '--disable-dev-shm-usage']
        });
        
        const page = await browser.newPage();
        
        // Navigate to our test page
        console.log('📄 Opening test page...');
        await page.goto(`file://${testPath}`);
        console.log('✅ Test page loaded');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Add some notes that will be saved in localStorage
        console.log('📝 Adding notes to localStorage...');
        const timestamp = new Date().toLocaleTimeString();
        const date = new Date().toLocaleDateString();
        await page.fill('#noteInput', `📝 New session created ${date} at ${timestamp}: Run #${Date.now() % 1000}`);
        await page.click('button:text("Add Note")');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await page.fill('#noteInput', `💾 First test with new session at ${timestamp}: Run #${Date.now() % 1000}`);
        await page.click('button:text("Add Note")');
        
        // Wait to see the changes
        console.log('⏳ Waiting to see changes...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('🔒 Closing browser...');
        await browser.close();
        browser = null;

        // Unmount - will store data in Redis
        console.log('\n📤 Syncing changes to Redis...');
        const uploadStartTime = Date.now();
        await browserState.unmount();
        const uploadTime = Date.now() - uploadStartTime;
        console.log(`⏱️ Upload time: ${uploadTime}ms`);
        console.log('✅ Changes synced to Redis\n');
        
        // Give Redis a moment
        console.log('⏳ Letting Redis process changes...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // After creating and syncing, run the example again to show persistence
        console.log('🔄 Running example again to demonstrate persistence...');
        await run();
        return;
      }
      
      // Clean up browser if it's still open
      await closeBrowser();
    }
    
  } catch (error) {
    // Clean up resources
    await closeBrowser();
    await unmountBrowserState();

    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Check if Redis is available before running
const redis = new Redis({
  host: REDIS_CONFIG.host,
  port: REDIS_CONFIG.port,
  password: REDIS_CONFIG.password,
  db: REDIS_CONFIG.db
});

redis.on('connect', () => {
  console.log('✅ Redis connection successful');
  redis.quit();
  run();
});

redis.on('error', (err: Error) => {
  console.error('❌ Redis connection failed:', err.message);
  console.error('Please make sure Redis is running on localhost:6379');
  redis.quit();
  process.exit(1);
}); 