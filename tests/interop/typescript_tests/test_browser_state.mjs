import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, webkit, firefox } from 'playwright';
import { BrowserState } from '../../../typescript/dist/index.js';

// For ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const USER_ID = "interop_test_user";
const REDIS_CONFIG = {
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    keyPrefix: 'browserstate',
    ttl: 604800 // 7 days
};

// Metadata file name to store cross-browser data:
const METADATA_FILENAME = "browserstate_interop_metadata.json";

// Resolve test HTML page path (assumes ../test_page/test.html relative to tests/interop)
const TEST_PAGE_PATH = path.resolve(__dirname, "../test_page/test.html");
const TEST_URL = `file://${TEST_PAGE_PATH}`;

function failTest(message) {
    console.error(`\n❌ TEST FAILED: ${message}`);
    process.exit(1);
}

function getBrowserLauncher(browserName) {
    if (browserName === 'chromium') return chromium;
    if (browserName === 'webkit') return webkit;
    if (browserName === 'firefox') return firefox;
    throw new Error(`Unsupported browser: ${browserName}`);
}

// 1) CREATE STATE
export async function createState(browserName, sessionId) {
    console.log(`🚀 [TypeScript] Creating state for session '${sessionId}' on browser '${browserName}'`);
    const browserState = new BrowserState({
        userId: USER_ID,
        storageType: 'redis',
        redisOptions: REDIS_CONFIG
    });
    
    // Mount session => download from Redis (or create new) => returns userDataDir
    const userDataDir = await browserState.mount(sessionId);
    console.log(`📂 Mounted session at: ${userDataDir}`);
    
    const browserLauncher = getBrowserLauncher(browserName);
    const context = await browserLauncher.launchPersistentContext(userDataDir, { headless: true });
    try {
        const page = await context.newPage();
        console.log(`📄 Loading test page: ${TEST_URL}`);
        await page.goto(TEST_URL);
        await page.waitForTimeout(1000);
        
        // Clear localStorage in the test page
        await page.evaluate(() => localStorage.clear());
        
        // Add 3 test notes
        const testNotes = [
            `TypeScript ${browserName} note 1`,
            `TypeScript ${browserName} note 2`,
            `TypeScript ${browserName} note 3`
        ];
        for (const note of testNotes) {
            await page.fill('#noteInput', note);
            await page.click('#addNoteButton');
            await page.waitForTimeout(500);
        }
        
        // Verify that the notes got stored in localStorage
        const notesCount = await page.evaluate(() => {
            const notes = JSON.parse(localStorage.getItem('notes') || '[]');
            return notes.length;
        });
        if (notesCount !== testNotes.length) {
            failTest(`Expected ${testNotes.length} notes, but found ${notesCount}`);
        }
        console.log(`✅ Created ${notesCount} notes on ${browserName}`);
        
        // Grab those notes from localStorage
        const notesInLocalStorage = await page.evaluate(() => 
            JSON.parse(localStorage.getItem('notes') || '[]')
        );
        
        // Build metadata object
        const metadata = {
            browser: browserName,
            createdBy: 'TypeScript',
            timestamp: Date.now(),
            notes: notesInLocalStorage
        };
        
        // Store metadata in localStorage for same-browser tests
        await page.evaluate((meta) => {
            localStorage.setItem('browserMetadata', JSON.stringify(meta));
        }, metadata);
        
        // Also store the same metadata in a JSON file in userDataDir
        const metadataPath = path.join(userDataDir, METADATA_FILENAME);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
        
        await page.waitForTimeout(500);
    } finally {
        await context.close();
    }
    
    // Unmount => upload changes back to Redis
    await browserState.unmount();
    console.log("✅ State creation complete.");
    process.exit(0);
}

// 2) VERIFY STATE
export async function verifyState(browserName, sessionId) {
    console.log(`🔍 [TypeScript] Verifying state for session '${sessionId}' on browser '${browserName}'`);
    const browserState = new BrowserState({
        userId: USER_ID,
        storageType: 'redis',
        redisOptions: REDIS_CONFIG
    });
    
    // Ensure session is in Redis
    const sessions = await browserState.listSessions();
    if (!sessions.includes(sessionId)) {
        failTest(`Session '${sessionId}' not found in Redis`);
    }
    
    // Mount session => download userDataDir
    const userDataDir = await browserState.mount(sessionId);
    console.log(`📂 Mounted session at: ${userDataDir}`);
    
    const browserLauncher = getBrowserLauncher(browserName);
    const context = await browserLauncher.launchPersistentContext(userDataDir, { headless: true });
    try {
        const page = await context.newPage();
        console.log(`📄 Loading test page: ${TEST_URL}`);
        await page.goto(TEST_URL);
        await page.waitForTimeout(1000);
        
        // Attempt to read notes from localStorage
        let notesJson = await page.evaluate(() => localStorage.getItem('notes'));
        
        if (!notesJson || notesJson.trim() === "" || notesJson === "null") {
            console.log("No notes found in LocalStorage. Attempting cross-browser migration from JSON file.");
            
            // 1) Read the metadata file from userDataDir
            const metadataPath = path.join(userDataDir, METADATA_FILENAME);
            if (fs.existsSync(metadataPath)) {
                const fileContents = fs.readFileSync(metadataPath, 'utf-8');
                const metadata = JSON.parse(fileContents);
                
                const creator = metadata.browser;
                const originalNotes = metadata.notes || [];
                if (creator && creator !== browserName && originalNotes.length > 0) {
                    console.log(`Transforming state from ${creator} to ${browserName}`);
                    
                    // Migrate notes => mark them "migrated"
                    const migratedNotes = originalNotes.map(note => ({
                        text: note.text,
                        timestamp: "migrated"
                    }));
                    
                    // Store migrated notes in LocalStorage
                    await page.evaluate((migrated) => {
                        localStorage.setItem('notes', JSON.stringify(migrated));
                    }, migratedNotes);
                    
                    // Update metadata to reflect new browser & new notes
                    metadata.browser = browserName;
                    metadata.notes = migratedNotes;
                    
                    // Update localStorage
                    await page.evaluate((meta) => {
                        localStorage.setItem('browserMetadata', JSON.stringify(meta));
                    }, metadata);
                    
                    // Overwrite the JSON file
                    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
                    
                    // Double-check that notes are now in localStorage
                    notesJson = await page.evaluate(() => localStorage.getItem('notes'));
                    if (!notesJson || notesJson.trim() === "" || notesJson === "null") {
                        failTest("Migration step failed to populate notes in LocalStorage.");
                    }
                } else {
                    failTest("No notes found in LocalStorage and no valid cross-browser metadata to migrate.");
                }
            } else {
                failTest("No notes found in LocalStorage and no JSON metadata file available.");
            }
        }
        
        // At this point, we should have notes in LocalStorage
        const notes = JSON.parse(notesJson);
        console.log(`📝 Found ${notes.length} notes:`);
        for (const note of notes) {
            console.log(`  - ${note.text} at ${note.timestamp}`);
        }
        
        // Verify final browser metadata
        const metadataJson = await page.evaluate(() => localStorage.getItem('browserMetadata'));
        if (!metadataJson) {
            failTest("No browser metadata found in LocalStorage at all.");
        }
        const metadata = JSON.parse(metadataJson);
        if (metadata.browser !== browserName) {
            failTest(`Expected browser metadata '${browserName}', but got '${metadata.browser}'`);
        }
        
        console.log(`✅ Verification successful for ${browserName}`);
    } finally {
        await context.close();
    }
    
    // Unmount => upload the updated userDataDir to Redis
    await browserState.unmount();
    process.exit(0);
}
