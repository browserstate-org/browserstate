/**
 * TypeScript script to create browser state data using localStorage
 * for cross-language interoperability testing.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { BrowserState } from '../../../typescript/dist/index.js';
import { chromium } from 'playwright';

// Get current file directory with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test constants - must match Python test
const SESSION_ID = 'typescript_to_python_test';
const USER_ID = 'interop_test_user';

// Debug mode - set to true to see browser UI
const DEBUG = false;

// Redis configuration 
const REDIS_CONFIG = {
    host: 'localhost',
    port: 6379,
    password: undefined, 
    db: 0,
    keyPrefix: 'browserstate:',
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

async function createTestData() {
    console.log('🚀 Starting TypeScript State Creation\n');

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

        // Launch browser with the mounted state
        console.log('\n🌐 Launching browser with Playwright...');
        const browser = await chromium.launchPersistentContext(userDataDir, {
            headless: !DEBUG
        });

        try {
            // Create a new page
            const page = await browser.newPage();

            // Navigate to the test HTML page - using exact same URL as Python verification
            console.log(`\n📄 Loading test page: ${TEST_URL}`);
            await page.goto(TEST_URL);
            console.log('✅ Test page loaded');
            
            // Clear existing localStorage to start fresh
            await page.evaluate(() => {
                localStorage.clear();
            });
            
            // Wait for the page to load completely
            await page.waitForTimeout(1000);

            // Add notes to localStorage
            console.log('\n📝 Adding notes to localStorage...');
            const testNotes = [
                'TypeScript created note 1',
                'TypeScript created note 2',
                'TypeScript created note 3'
            ];

            for (const note of testNotes) {
                await page.fill('#noteInput', note);
                await page.click('button:text("Add Note")');
                await page.waitForTimeout(500); // Wait for animation
            }

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
            
            // Verify notes data is not empty
            if (!notesData) {
                failTest('Notes data is empty');
            }
            
            console.log(`📝 Notes data: ${notesData}`);
            
            // Wait to ensure data is properly saved
            await page.waitForTimeout(1000);

        } finally {
            await browser.close();
        }

        // Unmount the session
        console.log('\n🔒 Unmounting session...');
        await browserState.unmount();
        console.log('✅ Session unmounted');

        console.log('\n✨ State creation complete!');

    } catch (error) {
        failTest(`Error during state creation: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Run the state creation
createTestData(); 