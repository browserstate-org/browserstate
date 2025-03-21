import { BrowserState } from "../src";
import { chromium, firefox, BrowserContext } from "playwright"; // You'll need to install playwright

/**
 * Example demonstrating BrowserState with Playwright for real browser automation
 */
async function main() {
  // Initialize BrowserState with local storage
  const browserState = new BrowserState({
    userId: "demo-user",
    storageType: "local",
    localOptions: {
      storagePath: "./browser-profiles"
    }
  });

  const sessionID = "playwright-session";
  
  try {
    // Mount the browser session
    console.log(`Mounting session ${sessionID}...`);
    const userDataDir = await browserState.mount(sessionID);
    console.log(`Session mounted at: ${userDataDir}`);

    // Launch Chrome with the mounted profile
    console.log("Launching Chrome browser...");
    const chromeContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      slowMo: 100, // Slow down operations for demo purposes
    });

    // Log in to a website
    await loginToWebsite(chromeContext);
    
    // Close Chrome browser
    console.log("Closing Chrome browser...");
    await chromeContext.close();
    
    // Unmount the session to save changes
    console.log("Unmounting and saving session...");
    await browserState.unmount();

    // Optional: Now test the stored session by mounting it again with Firefox
    console.log("Testing stored session with Firefox...");
    const userDataDirForFirefox = await browserState.mount(sessionID);
    
    // Launch Firefox with the same profile data
    // Note: This may not work perfectly across different browsers due to profile format differences
    console.log("Launching Firefox browser...");
    const firefoxContext = await firefox.launchPersistentContext(userDataDirForFirefox, {
      headless: false,
      slowMo: 100,
    });
    
    // Verify login state persisted
    await verifyLoginState(firefoxContext);
    
    // Close Firefox browser
    console.log("Closing Firefox browser...");
    await firefoxContext.close();
    
    // Unmount and save session again
    console.log("Unmounting and saving session...");
    await browserState.unmount();
    
    // List all available sessions
    const sessions = await browserState.listSessions();
    console.log("Available sessions:", sessions);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example function to log in to a website
 */
async function loginToWebsite(browserContext: BrowserContext): Promise<void> {
  // Get a new page
  const page = await browserContext.newPage();
  
  try {
    // Go to a demo site
    await page.goto("https://demo.playwright.dev/todomvc/#/");
    console.log("Page loaded:", await page.title());

    // Add some todo items (simulating user interactions)
    await page.locator('.new-todo').fill('Buy groceries');
    await page.keyboard.press('Enter');
    
    await page.locator('.new-todo').fill('Walk the dog');
    await page.keyboard.press('Enter');
    
    await page.locator('.new-todo').fill('Prepare dinner');
    await page.keyboard.press('Enter');
    
    // Mark one item as completed
    await page.locator('.todo-list li:has-text("Buy groceries") .toggle').click();
    
    // Take a screenshot
    await page.screenshot({ path: 'todo-app-state.png' });
    console.log("Screenshot saved to todo-app-state.png");
    
    // Wait to see the result
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    console.error("Login error:", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example function to verify login state persisted
 */
async function verifyLoginState(browserContext: BrowserContext): Promise<void> {
  // Get a new page
  const page = await browserContext.newPage();
  
  try {
    // Go to the same demo site
    await page.goto("https://demo.playwright.dev/todomvc/#/");
    console.log("Page loaded:", await page.title());
    
    // Wait for the todo list to be visible
    await page.waitForSelector('.todo-list');
    
    // Check if our items exist
    const todoCount = await page.locator('.todo-list li').count();
    console.log(`Found ${todoCount} todo items`);
    
    // Check if the first item is completed
    const isFirstItemCompleted = await page.locator('.todo-list li:first-child').getAttribute('class');
    console.log(`First item completed: ${isFirstItemCompleted?.includes('completed')}`);
    
    // Take a screenshot to compare
    await page.screenshot({ path: 'todo-app-state-firefox.png' });
    console.log("Screenshot saved to todo-app-state-firefox.png");
    
    // Wait to see the result
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    console.error("Verification error:", error instanceof Error ? error.message : String(error));
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
} 