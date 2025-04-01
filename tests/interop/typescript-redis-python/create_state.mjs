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

// Redis configuration 
const REDIS_CONFIG = {
    host: 'localhost',
    port: 6379,
    password: undefined, 
    db: 0,
    keyPrefix: 'browserstate:',
    ttl: 604800  // 7 days
};

// Path to the test HTML file
const TEST_HTML_PATH = path.join(__dirname, '../../../typescript/examples/shared/test.html');

async function createTestData() {
    console.log('🚀 Starting TypeScript State Creation\n');

    try {
        // Initialize BrowserState with Redis storage
        console.log('🔧 Creating BrowserState with Redis storage...');
        const browserState = new BrowserState({
            userId: 'interop_test_user',
            storageType: 'redis',
            redisOptions: REDIS_CONFIG
        });

        // Test session ID
        const sessionId = 'typescript_to_python_test';

        // List existing sessions
        console.log('\n📋 Listing existing sessions...');
        const sessions = await browserState.listSessions();
        console.log(`Found ${sessions.length} session(s): ${sessions.join(', ')}`);

        // Mount the session
        console.log(`\n📥 Mounting session: ${sessionId}`);
        const userDataDir = await browserState.mount(sessionId);
        console.log(`📂 Mounted at: ${userDataDir}`);

        // Launch browser with the mounted state
        console.log('\n🌐 Launching browser with Playwright...');
        const browser = await chromium.launchPersistentContext(userDataDir, {
            headless: false
        });

        try {
            // Create a new page
            const page = await browser.newPage();

            // Navigate to the test HTML page
            console.log('\n📄 Loading test page...');
            await page.goto(`file://${TEST_HTML_PATH}`);
            console.log('✅ Test page loaded');

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
            console.log(`✅ Added ${notesCount} notes`);

            // Get the notes data for verification
            const notesData = await page.evaluate(() => {
                return localStorage.getItem('notes');
            });
            console.log(`📝 Notes data: ${notesData}`);

        } finally {
            await browser.close();
        }

        // Unmount the session
        console.log('\n🔒 Unmounting session...');
        await browserState.unmount();
        console.log('✅ Session unmounted');

        console.log('\n✨ State creation complete!');

    } catch (error) {
        console.error('\n❌ Error during state creation:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Run the state creation
createTestData(); 