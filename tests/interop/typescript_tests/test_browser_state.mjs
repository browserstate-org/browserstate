import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, webkit, firefox } from 'playwright';
import { BrowserState } from 'browserstate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_ID = "interop_test_user";
const REDIS_CONFIG = {
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    keyPrefix: 'browserstate',
    ttl: 604800 // 7 days
};

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

export async function createState(browserName, sessionId) {
    console.log(`🚀 [TypeScript] Creating state for session '${sessionId}' on browser '${browserName}'`);
    const browserState = new BrowserState({
        userId: USER_ID,
        storageType: 'redis',
        redisOptions: REDIS_CONFIG
    });
    const userDataDir = await browserState.mount(sessionId);
    console.log(`📂 Mounted session at: ${userDataDir}`);
    const browserLauncher = getBrowserLauncher(browserName);
    const context = await browserLauncher.launchPersistentContext(userDataDir, { headless: true });
    try {
        const page = await context.newPage();
        console.log(`📄 Loading test page: ${TEST_URL}`);
        await page.goto(TEST_URL);
        await page.waitForTimeout(1000);
        // Clear localStorage
        await page.evaluate(() => localStorage.clear());
        // Add test notes
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
        const notesCount = await page.evaluate(() => JSON.parse(localStorage.getItem('notes') || '[]').length);
        if (notesCount !== testNotes.length) {
            failTest(`Expected ${testNotes.length} notes, but found ${notesCount}`);
        }
        console.log(`✅ Created ${notesCount} notes on ${browserName}`);
        // Store browser metadata
        await page.evaluate((browserName) => {
            localStorage.setItem('browserMetadata', JSON.stringify({
                browser: browserName,
                createdBy: 'TypeScript',
                timestamp: new Date().toISOString()
            }));
        }, browserName);
        await page.waitForTimeout(500);
    } finally {
        await context.close();
    }
    await browserState.unmount();
    console.log("✅ State creation complete.");
}

export async function verifyState(browserName, sessionId) {
    console.log(`🔍 [TypeScript] Verifying state for session '${sessionId}' on browser '${browserName}'`);
    const browserState = new BrowserState({
        userId: USER_ID,
        storageType: 'redis',
        redisOptions: REDIS_CONFIG
    });
    const sessions = await browserState.listSessions();
    if (!sessions.includes(sessionId)) {
        failTest(`Session '${sessionId}' not found in Redis`);
    }
    const userDataDir = await browserState.mount(sessionId);
    console.log(`📂 Mounted session at: ${userDataDir}`);
    const browserLauncher = getBrowserLauncher(browserName);
    const context = await browserLauncher.launchPersistentContext(userDataDir, { headless: true });
    try {
        const page = await context.newPage();
        console.log(`📄 Loading test page: ${TEST_URL}`);
        await page.goto(TEST_URL);
        await page.waitForTimeout(1000);
        const notesJson = await page.evaluate(() => localStorage.getItem('notes'));
        if (!notesJson) {
            failTest("No notes found in localStorage");
        }
        const notes = JSON.parse(notesJson);
        console.log(`📝 Found ${notes.length} notes:`);
        for (const note of notes) {
            console.log(`  - ${note.text} at ${note.timestamp}`);
        }
        const metadataJson = await page.evaluate(() => localStorage.getItem('browserMetadata'));
        if (metadataJson) {
            const metadata = JSON.parse(metadataJson);
            if (metadata.browser !== browserName) {
                failTest(`Expected browser metadata '${browserName}', but got '${metadata.browser}'`);
            }
        } else {
            failTest("No browser metadata found");
        }
        console.log(`✅ Verification successful for ${browserName}`);
    } finally {
        await context.close();
    }
    await browserState.unmount();
}
