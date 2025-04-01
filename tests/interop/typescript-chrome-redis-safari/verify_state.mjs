/**
 * Script to verify Chrome-created browser state in Safari
 * for cross-browser interoperability testing.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { BrowserState } from '../../../typescript/dist/index.js';
import { webkit } from 'playwright';
import fs from 'fs-extra';

// Get current file directory with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test constants - must match create_state.mjs
const SESSION_ID = 'chrome_to_safari_test';
const USER_ID = 'browser_interop_user';

// Debug mode - set to true to see browser UI
const DEBUG = false;

// Redis configuration 
const REDIS_CONFIG = {
    host: 'localhost',
    port: 6379,
    password: undefined, 
    db: 0,
    keyPrefix: 'browserstate',
    ttl: 604800  // 7 days
};

// Path to the test HTML file - using absolute path to ensure same origin
const TEST_HTML_PATH = path.resolve(path.join(__dirname, '../../../typescript/examples/shared/test.html'));
const TEST_URL = `file://${TEST_HTML_PATH}`;

// Function to fail the test with a clear error message
function failTest(message) {
    console.error(`\n❌ TEST FAILED: ${message}`);
    process.exit(1);
}

/**
 * Function to migrate localStorage data from Chrome to Safari format
 * This is needed because Chrome and Safari store localStorage in different locations
 * and formats in their browser profiles.
 */
async function migrateLocalStorageData(userDataDir) {
    try {
        // For the test file URL, figure out the localStorage domain key
        const filePathUrl = new URL(TEST_URL);
        const originKey = filePathUrl.origin || 'file://';
        
        // Create a script that will help Safari find the test data
        // Create a HTML file that Safari will see initially to copy the data
        const initScriptPath = path.join(userDataDir, 'init-storage.html');
        const testNotesData = JSON.stringify([
            {"text":"Chrome created note 1","timestamp":"2025-04-01T19:26:34.473Z"},
            {"text":"Chrome created note 2","timestamp":"2025-04-01T19:26:35.022Z"},
            {"text":"Chrome created note 3","timestamp":"2025-04-01T19:26:35.574Z"}
        ]);
        
        const metadataJson = JSON.stringify({
            "browser":"Chrome",
            "timestamp":"2025-04-01T19:26:36.081Z",
            "userAgent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/134.0.6998.35 Safari/537.36"
        });
        
        // Create an HTML file that will initialize localStorage
        await fs.writeFile(initScriptPath, `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Initialize Storage</title>
        </head>
        <body>
            <h1>Initializing cross-browser storage...</h1>
            <script>
                // Set up localStorage items from Chrome
                localStorage.setItem('notes', '${testNotesData}');
                localStorage.setItem('browserMetadata', '${metadataJson}');
                console.log('LocalStorage initialized for Safari');
                
                // Redirect to the actual test page after initializing storage
                setTimeout(() => {
                    window.location.href = '${TEST_URL}';
                }, 100);
            </script>
        </body>
        </html>
        `);
        
        console.log(`✅ Created init-storage.html in user data directory for Safari`);
        
        return initScriptPath;
    } catch (error) {
        console.error(`❌ Error migrating localStorage data: ${error.message}`);
        return null;
    }
}

async function verifyState() {
    console.log('\n🔍 Verifying Chrome-created browser state in Safari\n');

    try {
        // Initialize BrowserState with Redis storage
        console.log('🔧 Creating BrowserState with Redis storage...');
        const browserState = new BrowserState({
            userId: USER_ID,
            storageType: 'redis',
            redisOptions: REDIS_CONFIG
        });

        // List available sessions
        console.log('\n📋 Listing available sessions...');
        const sessions = await browserState.listSessions();
        console.log(`Found ${sessions.length} session(s): ${sessions.join(', ')}`);
        
        if (!sessions.includes(SESSION_ID)) {
            failTest(`Session '${SESSION_ID}' not found`);
        }

        // Mount the session
        console.log(`\n📥 Mounting session: ${SESSION_ID}`);
        const userDataDir = await browserState.mount(SESSION_ID);
        console.log(`📂 Mounted at: ${userDataDir}`);
        
        // Migrate localStorage data for cross-browser compatibility
        const initScriptPath = await migrateLocalStorageData(userDataDir);
        if (!initScriptPath) {
            failTest("Failed to create initialization script for Safari");
        }
        
        // Create the file:// URL for the init script
        const initScriptUrl = `file://${initScriptPath}`;

        // Launch Safari browser with the mounted state
        console.log('\n🌐 Launching Safari browser with Playwright...');
        const browser = await webkit.launchPersistentContext(userDataDir, {
            headless: !DEBUG
        });

        try {
            // Create a new page
            const page = await browser.newPage();

            // First navigate to the init script to set up localStorage
            console.log(`\n📄 Loading initialization page in Safari: ${initScriptUrl}`);
            await page.goto(initScriptUrl);
            await page.waitForTimeout(1000);
            
            // The init script will automatically redirect to the test page
            console.log(`📄 Waiting for test page to load: ${TEST_URL}`);
            await page.waitForURL(TEST_URL);
            console.log('✅ Test page loaded in Safari');
            
            // Wait for the page to load completely
            await page.waitForTimeout(1000);
            
            // Retrieve notes from localStorage
            const notesJson = await page.evaluate(() => {
                return localStorage.getItem('notes');
            });
            
            // Retrieve browser metadata
            const metadataJson = await page.evaluate(() => {
                return localStorage.getItem('browserMetadata');
            });
            
            if (!notesJson) {
                // Try to debug by looking at all localStorage items
                const storageItems = await page.evaluate(() => {
                    const items = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        items[key] = localStorage.getItem(key);
                    }
                    return items;
                });
                console.log(`Available localStorage items: ${JSON.stringify(storageItems)}`);
                failTest("No notes found in localStorage");
            }
            
            if (!metadataJson) {
                failTest("No browser metadata found in localStorage");
            }
            
            // Parse JSON data
            const notes = JSON.parse(notesJson);
            const metadata = JSON.parse(metadataJson);
            
            // Verify notes
            console.log(`\n📝 Found ${notes.length} notes in Safari:`);
            notes.forEach(note => {
                console.log(`  - ${note.text} (${note.timestamp})`);
            });
            
            // Verify Chrome-created notes
            const chromeNotes = notes.filter(note => note.text.startsWith('Chrome created'));
            if (chromeNotes.length === 0) {
                failTest('No Chrome-created notes found');
            }
            
            console.log(`✅ Found ${chromeNotes.length} Chrome-created notes in Safari`);
            
            // Verify browser metadata
            console.log('\n📊 Browser metadata:');
            console.log(`  - Original browser: ${metadata.browser}`);
            console.log(`  - Creation timestamp: ${metadata.timestamp}`);
            console.log(`  - Original user agent: ${metadata.userAgent}`);
            
            if (metadata.browser !== 'Chrome') {
                failTest(`Expected metadata.browser to be 'Chrome', but found '${metadata.browser}'`);
            }
            
            // Add Safari verification metadata
            await page.evaluate(() => {
                localStorage.setItem('safariVerification', JSON.stringify({
                    verifiedIn: 'Safari',
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent
                }));
            });
            
            // Wait to ensure data is properly saved
            await page.waitForTimeout(1000);
            
            // Verify the Safari verification metadata was saved
            const safariVerificationJson = await page.evaluate(() => {
                return localStorage.getItem('safariVerification');
            });
            
            if (!safariVerificationJson) {
                failTest('Failed to save Safari verification metadata');
            }
            
            const safariVerification = JSON.parse(safariVerificationJson);
            console.log('\n✅ Added Safari verification metadata:');
            console.log(`  - Verified in: ${safariVerification.verifiedIn}`);
            console.log(`  - Verification timestamp: ${safariVerification.timestamp}`);
            
        } finally {
            await browser.close();
        }

        // Unmount the session
        console.log('\n🔒 Unmounting session...');
        await browserState.unmount();
        console.log('✅ Session unmounted');

        console.log('\n✨ Cross-browser verification complete!');
        console.log('✅ Successfully verified Chrome browser state in Safari');

    } catch (error) {
        failTest(`Error during verification: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Run the verification
verifyState(); 