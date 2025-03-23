import { BrowserState } from "../../src";
import { chromium } from "playwright"; // You'll need to install playwright

/**
 * Example demonstrating how to use BrowserState with Playwright
 */
async function main() {
  // Initialize the BrowserState with local storage
  const browserState = new BrowserState({
    userId: "user123",
    storageType: "local",
    localOptions: {
      storagePath: "./browser-profiles"
    }
  });

  // Session ID to use
  const sessionID = "my-playwright-session";

  try {
    // Mount the browser session
    console.log(`Mounting session ${sessionID}...`);
    const userDataDir = await browserState.mount(sessionID);
    console.log(`Session mounted at: ${userDataDir}`);

    // Launch browser with persistent context using the mounted session
    console.log("Launching browser...");
    const browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      // Add other Playwright options as needed
    });

    // Use the browser for automation
    const page = await browser.newPage();
    await page.goto("https://example.com");
    console.log(`Page title: ${await page.title()}`);

    // Wait a bit to see the browser in action
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Close the browser
    console.log("Closing browser...");
    await browser.close();

    // Unmount the session to save changes
    console.log("Unmounting session...");
    await browserState.unmount();
    console.log("Session unmounted and saved");

    // List available sessions
    const sessions = await browserState.listSessions();
    console.log("Available sessions:", sessions);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}  