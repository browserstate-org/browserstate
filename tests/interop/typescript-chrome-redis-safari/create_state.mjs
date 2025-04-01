/**
 * Script to create browser state in Chrome and store in Redis
 * for cross-browser interoperability testing with Safari.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { BrowserState } from '../../../typescript/dist/index.js';
import { chromium } from 'playwright';

// Get current file directory with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test constants
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

// Path to the test HTML file
const TEST_HTML_PATH = path.resolve(path.join(__dirname, '../../../typescript/examples/shared/test.html'));
const TEST_URL = `file://${TEST_HTML_PATH}`;

// Function to fail the test with a clear error message
function failTest(message) {
    console.error(`\n❌ TEST FAILED: ${message}`);
    process.exit(1);
}

async function createTestData() {
    console.log('🚀 Starting Chrome State Creation\n');

    try {
        // Initialize BrowserState with Redis storage
        console.log('🔧 Creating BrowserState with Redis storage...');
        const browserState = new BrowserState({
            userId: USER_ID,
            storageType: 'redis',
            redisOptions: REDIS_CONFIG
        });

        // List existing sessions
        console.log('\n📋 Listing existing sessions...');
        const sessions = await browserState.listSessions();
        console.log(`Found ${sessions.length} session(s): ${sessions.join(', ')}`);

        // Mount the session
        console.log(`\n📥 Mounting session: ${SESSION_ID}`);
        const userDataDir = await browserState.mount(SESSION_ID);
        console.log(`📂 Mounted at: ${userDataDir}`);

        // Launch Chrome browser with the mounted state
        console.log('\n🌐 Launching Chrome browser with Playwright...');
        const browser = await chromium.launchPersistentContext(userDataDir, {
            headless: !DEBUG
        });

        try {
            // Create a new page
            const page = await browser.newPage();

            // Navigate to the test HTML page
            console.log(`\n📄 Loading test page: ${TEST_URL}`);
            await page.goto(TEST_URL);
            console.log('✅ Test page loaded');
            
            // Clear existing localStorage to start fresh
            await page.evaluate(() => {
                localStorage.clear();
            });
            
            // Wait for the page to load completely
            await page.waitForTimeout(1000);

            // Add Chrome-specific test data to localStorage
            console.log('\n📝 Adding Chrome-specific test data to localStorage...');
            
            // Add notes to localStorage
            const testNotes = [
                'Chrome created note 1',
                'Chrome created note 2',
                'Chrome created note 3'
            ];

            for (const note of testNotes) {
                await page.fill('#noteInput', note);
                await page.click('button:text("Add Note")');
                await page.waitForTimeout(500); // Wait for animation
            }

            // Add browser metadata to localStorage
            await page.evaluate(() => {
                localStorage.setItem('browserMetadata', JSON.stringify({
                    browser: 'Chrome',
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent
                }));
            });

            // Verify notes were added
            const notesCount = await page.evaluate(() => {
                return JSON.parse(localStorage.getItem('notes') || '[]').length;
            });
            
            // Verify notes were added successfully
            if (notesCount !== testNotes.length) {
                failTest(`Expected ${testNotes.length} notes, but found ${notesCount}`);
            }
            
            console.log(`✅ Added ${notesCount} notes`);

            // Get the notes data for verification
            const notesData = await page.evaluate(() => {
                return localStorage.getItem('notes');
            });
            
            // Get browser metadata
            const metadataJson = await page.evaluate(() => {
                return localStorage.getItem('browserMetadata');
            });
            
            // Verify data is not empty
            if (!notesData || !metadataJson) {
                failTest('Test data is empty');
            }
            
            console.log(`📝 Notes data: ${notesData}`);
            console.log(`📝 Browser metadata: ${metadataJson}`);
            
            // Wait to ensure data is properly saved
            await page.waitForTimeout(1000);

        } finally {
            await browser.close();
        }

        // Unmount the session
        console.log('\n🔒 Unmounting session...');
        await browserState.unmount();
        console.log('✅ Session unmounted');

        console.log('\n✨ Chrome state creation complete!');
        console.log('Now run verify_state.mjs to verify the state in Safari');

    } catch (error) {
        failTest(`Error during Chrome state creation: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Run the state creation
createTestData(); 