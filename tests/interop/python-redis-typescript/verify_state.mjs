/**
 * TypeScript verification script for cross-language interop test.
 * This script verifies browser state created by the Python implementation.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { BrowserState } from '../../../typescript/dist/BrowserState.js';
import { chromium } from 'playwright';

// Get current file directory with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Redis configuration matching Python example
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

async function verifyPythonState() {
    console.log('🚀 Starting TypeScript Verification of Python State\n');

    try {
        // Initialize BrowserState with Redis storage
        console.log('🔧 Creating BrowserState with Redis storage...');
        const browserState = new BrowserState({
            userId: 'interop_test_user',
            storageType: 'redis',
            redisOptions: REDIS_CONFIG
        });

        // Test session ID
        const sessionId = 'cross_language_test';

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

            // Get the notes data
            console.log('\n📝 Reading notes from localStorage...');
            const notesData = await page.evaluate(() => {
                return localStorage.getItem('notes');
            });

            if (notesData) {
                const notes = JSON.parse(notesData);
                console.log(`\nFound ${notes.length} notes:`);
                notes.forEach((note) => {
                    console.log(`  - ${note.text} (${note.timestamp})`);
                });

                // Verify the notes were created by Python
                const pythonNotes = notes.filter((note) => 
                    note.text.startsWith('Python created note')
                );
                console.log(`\n✅ Found ${pythonNotes.length} Python-created notes`);
            } else {
                console.log('\n❌ No notes found in localStorage');
            }

        } finally {
            await browser.close();
        }

        // Unmount the session
        console.log('\n🔒 Unmounting session...');
        await browserState.unmount();
        console.log('✅ Session unmounted');

        console.log('\n✨ Verification complete!');

    } catch (error) {
        console.error('\n❌ Error during verification:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Run the verification
verifyPythonState(); 