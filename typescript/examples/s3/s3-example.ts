import { BrowserState } from "../../src";
import { config } from "./config";
import puppeteer from "puppeteer";

/**
 * Example demonstrating BrowserState with AWS S3 Storage
 * 
 * Prerequisites:
 * 1. Create an S3 bucket
 * 2. Set up AWS credentials in config.ts
 * 3. Install dependencies:
 *    npm install @aws-sdk/client-s3 @aws-sdk/lib-storage playwright fs-extra
 * 
 * To customize settings, copy config.example.json to config.json and update it.
 */
async function main() {
  // Create browser state with S3 storage
  const browserState = new BrowserState({
    userId: config.userId,
    storageType: 's3',
    s3Options: {
      bucketName: config.bucketName,
      region: config.region
    }
  });

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false,
  });

  // Create a new page
  const page = await browser.newPage();

  // Mount the page to browser state
  await browserState.mount('my-session');

  // Navigate to a website
  await page.goto("https://example.com");

  // Wait for a bit to see the page
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Close browser
  await browser.close();
}

/**
 * How to set up AWS credentials:
 * 
 * Option 1: Environment variables
 *   export AWS_ACCESS_KEY_ID=your_access_key_id
 *   export AWS_SECRET_ACCESS_KEY=your_secret_access_key
 * 
 * Option 2: AWS credentials file
 *   Create or edit ~/.aws/credentials:
 *   [default]
 *   aws_access_key_id = your_access_key_id
 *   aws_secret_access_key = your_secret_access_key
 * 
 * Option 3: Update config.ts with your credentials
 */

main().catch(console.error);