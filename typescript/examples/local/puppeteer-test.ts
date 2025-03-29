import { BrowserState } from "../../src";
import puppeteer from "puppeteer"; // You'll need to install puppeteer

/**
 * Example demonstrating how to use BrowserState with Puppeteer
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
  const sessionID = "my-puppeteer-session";

  try {
    // Mount the browser session
    console.log(`Mounting session ${sessionID}...`);
    const userDataDir = await browserState.mount(sessionID);
    console.log(`Session mounted at: ${userDataDir}`);

    // Launch browser with user data directory
    console.log("Launching browser...");
    const browser = await puppeteer.launch({
      headless: false,
      userDataDir: userDataDir,
      // Add other Puppeteer options as needed
    });

    // Use the browser for automation
    const page = await browser.newPage();
    await page.goto("https://example.com");
    const title = await page.title();
    console.log(`Page title: ${title}`);

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