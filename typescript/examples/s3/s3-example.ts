import { BrowserState } from '../../src/BrowserState';
import { chromium } from 'playwright';
import { config } from './config';

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
  console.log("s3 example config", config);
  
  // First, let's check what buckets are available
  try {
    const { S3Client, ListBucketsCommand } = await import('@aws-sdk/client-s3');
    const s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId!,
        secretAccessKey: config.secretAccessKey!
      }
    });
    console.log('\nChecking available buckets:');
    const { Buckets } = await s3Client.send(new ListBucketsCommand({}));
    console.log('Available buckets:');
    Buckets?.forEach(bucket => {
      console.log(`- ${bucket.Name}`);
    });
  } catch (error) {
    console.error('Failed to list buckets:', error);
  }
  
  // Configure BrowserState with S3 storage
  const browserState = new BrowserState({
    userId: config.userId,
    storageType: 's3',
    s3Options: {
      bucketName: config.bucketName,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  try {
    // Use a fixed session ID for simplicity
    const sessionId = "my-s3-session";
    
    // Mount the browser state
    console.log(`Mounting browser state with ID: ${sessionId}...`);
    const userDataDir = await browserState.mount(sessionId);
    console.log(`Browser state mounted successfully at: ${userDataDir}`);

    // Launch browser with persistent context using the mounted state
    console.log('Launching browser...');
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
    const BROWSER_TIMEOUT = 30000; // 30 seconds
    console.log(`Browser is open. Will close in ${BROWSER_TIMEOUT/1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, BROWSER_TIMEOUT));
    
    await browser.close();

    // Unmount the state to save changes
    console.log("Unmounting browser state...");
    await browserState.unmount();
    console.log("Browser state unmounted and saved to S3");
    
  } catch (error) {
    console.error('Error:', error);
    
    // Try to list buckets if there's a bucket error
    const errorMessage = String(error);
    if (errorMessage.includes('bucket') && 
        (errorMessage.includes('does not exist') || 
         errorMessage.includes('not accessible') || 
         errorMessage.includes('notFound'))) {
      
      try {
        const { S3Client, ListBucketsCommand } = await import('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: config.region,
          credentials: {
            accessKeyId: config.accessKeyId!,
            secretAccessKey: config.secretAccessKey!
          }
        });
        console.error('\nAttempting to list available buckets:');
        const { Buckets } = await s3Client.send(new ListBucketsCommand({}));
        console.error('Available buckets:');
        Buckets?.forEach(bucket => {
          console.error(`- ${bucket.Name}`);
        });
        console.error('\nUpdate the bucketName in config.ts to match one of these buckets.');
      } catch (listError) {
        console.error('Failed to list buckets. Make sure your credentials have the necessary permissions.');
        console.error('Error details:', listError);
      }
    }
  }
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