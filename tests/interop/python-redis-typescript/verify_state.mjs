/**
 * TypeScript verification script for cross-language interop test.
 * This script verifies browser state created by the Python implementation.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { BrowserState } from '../../../typescript/dist/index.js';
import { chromium } from 'playwright';

// Get current file directory with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test constants - must match Python test
const SESSION_ID = 'cross_language_test';
const USER_ID = 'interop_test_user';

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

async function verifyPythonState() {
    console.log('🚀 Starting TypeScript Verification of Python State\n');

    try {
        // Initialize BrowserState with Redis storage
        console.log('🔧 Creating BrowserState with Redis storage...');
        const browserState = new BrowserState({
            userId: USER_ID,
            storageType: 'redis',
            redisOptions: REDIS_CONFIG
        });

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

            // Navigate to the test HTML page - using exact same URL as Python
            console.log(`\n📄 Loading test page: ${TEST_URL}`);
            await page.goto(TEST_URL);
            console.log('✅ Test page loaded');
            
            // Wait for the page to load completely
            await page.waitForTimeout(1000);

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
                
                if (pythonNotes.length === 0) {
                    failTest('No Python-created notes found in localStorage');
                }
                
                console.log(`\n✅ Found ${pythonNotes.length} Python-created notes`);
            } else {
                console.log('\n❌ No notes found in localStorage');
                
                // Debug: check all localStorage items
                const allItems = await page.evaluate(() => {
                    const items = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        items[key] = localStorage.getItem(key);
                    }
                    return items;
                });
                console.log('Available localStorage items:', allItems);
                
                // Try to examine the HTML structure
                const html = await page.content();
                console.log(`Page HTML (first 200 chars): ${html.substring(0, 200)}...`);
                
                // Fail the test
                failTest('No notes found in localStorage');
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
        failTest(`Error during verification: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Run the verification
verifyPythonState(); 