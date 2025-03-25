import { BrowserState } from '../../src/BrowserState';
import { chromium } from 'playwright';

/**
 * Example demonstrating BrowserState with AWS S3 Storage
 * 
 * Prerequisites:
 * 1. Create an S3 bucket
 * 2. Create IAM user with S3 access permissions
 * 3. Get the access key and secret key
 * 4. Install dependencies:
 *    npm install @aws-sdk/client-s3 @aws-sdk/lib-storage playwright
 */
async function main() {
  // Configure BrowserState with S3 storage
  const browserState = new BrowserState({
    userId: 'demo_user',
    storageType: 's3',
    s3Options: {
      bucketName: 'my-sessions',
      region: 'YOUR_AWS_REGION',  // Change to your region
      accessKeyID: 'YOUR_AWS_ACCESS_KEY_ID',
      secretAccessKey: 'YOUR_AWS_SECRET_ACCESS_KEY'
    }
  });

  // State ID to use
  const stateID = "s3-playwright-state";

  try {
    // Mount the browser state
    console.log(`Mounting state ${stateID}...`);
    const userDataDir = await browserState.mount(stateID);
    console.log(`State mounted at: ${userDataDir}`);

    // Launch browser with persistent context using the mounted state
    const browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
    });

    const page = await browser.newPage();
    await page.goto('https://example.com');

    // Set some data in localStorage
    await page.evaluate(() => {
      localStorage.setItem('s3_test', JSON.stringify({
        timestamp: new Date().toISOString(),
        message: 'This data is stored in S3!'
      }));
    });

    // Read back the data
    const data = await page.evaluate(() => localStorage.getItem('s3_test'));
    console.log('Stored data:', data);

    // Wait for user to interact or close automatically after delay
    console.log('Browser is open. Will close in 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    await browser.close();

    // Unmount the state to save changes
    console.log("Unmounting state...");
    await browserState.unmount();
    console.log("State unmounted and saved");
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * How to get AWS credentials:
 * 
 * 1. Go to the AWS Management Console (https://aws.amazon.com/console/)
 * 2. Go to "IAM" > "Users"
 * 3. Create a new user or select an existing one
 * 4. Go to "Security credentials" tab
 * 5. Under "Access keys", create a new access key
 * 6. Save the access key ID and secret access key
 * 7. Assign appropriate permissions for S3 access (AmazonS3FullAccess or more specific)
 * 8. Update this example with your credentials
 */

main().catch(console.error);