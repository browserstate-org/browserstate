// browserstate-demo.js
import readline from 'readline';
import { chromium } from 'playwright';
import { BrowserState } from '../../src/BrowserState';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (q: string) => new Promise<string>(res => rl.question(q, res));

(async () => {
  try {
    const action = await ask('Login? (yes/no): ');

    // Initialize BrowserState
    const browserState = new BrowserState({
      userId: 'yc_demo',
      storageType: 'redis',
      redisOptions: { host: '127.0.0.1', port: 6379, keyPrefix: 'browserstate' }
    });

    // Mount the session
    const sessionId = 'linkedin-session';
    const userDataDir = await browserState.mount(sessionId);
    console.log('Mounted session at:', userDataDir);

    if (action.toLowerCase().startsWith('y')) {
      // Login flow
      const browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--profile-directory=Default']
      });
      const page = await browser.newPage();
      await page.goto('https://www.linkedin.com/login');
      console.log('🔐 Please log in, then press 9 to save the session and quit.');

      // Handle key press to save session
      rl.on('line', async (input) => {
        if (input.trim() === '9') {
          console.log('\nSaving session...');
          await browser.close();
          await browserState.unmount();
          console.log('✅ Session saved successfully!');
          process.exit(0);
        }
      });

      // Keep running until key press
      await new Promise(() => {});
    } else {
      // Session injection flow
      const browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--profile-directory=Default']
      });
      const page = await browser.newPage();
      
      // Navigate to LinkedIn feed
      console.log('Navigating to LinkedIn feed...');
      await page.goto('https://www.linkedin.com/feed/');
      
      // Try to verify session by creating a post
      try {
        console.log('Verifying session by attempting to create a post...');
        await page.waitForSelector('button:has-text("Start a post")', { timeout: 10000 });
        await page.click('button:has-text("Start a post")');
        await page.waitForTimeout(1500);
        await page.fill('[role="textbox"]', 'Posted via BrowserState TypeScript Demo');
        console.log('\n✅ Session reopened successfully!');
      } catch (e) {
        console.log('\n❌ Error verifying session:', e);
        console.log('This might mean:');
        console.log('1. The session wasn\'t properly saved in the login step');
        console.log('2. The session has expired');
        console.log('3. LinkedIn\'s UI has changed');
      }
      
      console.log('Press 9 to end the session...');

      // Handle key press to end session
      rl.on('line', async (input) => {
        if (input.trim() === '9') {
          console.log('\nEnding session...');
          await browser.close();
          await browserState.unmount();
          process.exit(0);
        }
      });

      // Keep running until key press
      await new Promise(() => {});
    }
  } catch (err) {
    console.error('Error in automation:', err);
  } finally {
    rl.close();
  }
})();
