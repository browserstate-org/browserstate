import { BrowserState } from '../../src/BrowserState';
import { chromium } from 'playwright';
import * as fs from 'fs-extra';
import { Storage } from '@google-cloud/storage';
import { config } from './config';

/**
 * Example demonstrating BrowserState with Google Cloud Storage
 * 
 * Prerequisites:
 * 1. Create a GCS bucket
 * 2. Create a service account with Storage Admin permissions
 * 3. Download the service account key JSON file to this directory as service-account.json
 * 4. Install dependencies:
 *    npm install @google-cloud/storage playwright fs-extra
 * 
 * To customize settings, edit the config.ts file rather than modifying this example.
 */
async function main() {
  // Process command line arguments
  const args = process.argv.slice(2);
  
  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx ts-node gcs-example.ts [stateID] [options]

Options:
  --list         List all available states
  --delete ID    Delete the specified state
  --help, -h     Show this help message

Examples:
  npx ts-node gcs-example.ts                    # Create/use a random state ID
  npx ts-node gcs-example.ts my-state           # Use a specific state ID
  npx ts-node gcs-example.ts --list             # List all available states
  npx ts-node gcs-example.ts --delete my-state  # Delete a specific state
    `);
    return;
  }

  // Verify service account file exists
  if (!fs.existsSync(config.serviceAccountPath)) {
    console.error('ERROR: Service account file not found at:', config.serviceAccountPath);
    console.error('Please download your service account key file and save it as "service-account.json" in this directory.');
    return;
  }
  
  console.log('Service account file found at:', config.serviceAccountPath);
  console.log('Using bucket name:', config.bucketName);
  
  // Configure BrowserState with GCS storage
  const browserState = new BrowserState({
    userId: config.userId,
    storageType: 'gcs',
    gcsOptions: {
      bucketName: config.bucketName,
      projectID: config.projectID,
      keyFilename: config.serviceAccountPath
    }
  });

  // List all sessions
  if (args.includes('--list')) {
    try {
      const states = await browserState.listSessions();
      console.log('\nAvailable states:');
      if (states.length === 0) {
        console.log('  No states found');
      } else {
        states.forEach(state => {
          console.log(`  - ${state}`);
        });
      }
      return;
    } catch (error) {
      console.error('Error listing states:', error);
      return;
    }
  }

  // Delete a session
  if (args.includes('--delete')) {
    const deleteIndex = args.indexOf('--delete');
    const stateToDelete = args[deleteIndex + 1];
    
    if (!stateToDelete) {
      console.error('Error: No state ID specified for deletion');
      console.error('Usage: npx ts-node gcs-example.ts --delete STATE_ID');
      return;
    }

    try {
      console.log(`Deleting state: ${stateToDelete}`);
      await browserState.deleteSession(stateToDelete);
      console.log('State deleted successfully');
      return;
    } catch (error) {
      console.error('Error deleting state:', error);
      return;
    }
  }

  try {
    // State ID - can be provided by user or generated
    const stateID = args[0] || `state-${Date.now()}`;
    
    // Mount the browser state
    console.log(`Mounting state ${stateID}...`);
    const userDataDir = await browserState.mount(stateID);
    console.log(`State mounted successfully at: ${userDataDir}`);

    // Launch browser with persistent context using the mounted state
    console.log('Launching browser...');
    const browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
    });

    const page = await browser.newPage();
    await page.goto('https://example.com');
    
    // Set some data in localStorage
    await page.evaluate(() => {
      localStorage.setItem('gcs_test', JSON.stringify({
        timestamp: new Date().toISOString(),
        message: 'This data is stored in GCS!'
      }));
    });

    // Read back the data
    const data = await page.evaluate(() => localStorage.getItem('gcs_test'));
    console.log('Stored data:', data);
    
    // Wait for user to interact or close automatically after delay
    const BROWSER_TIMEOUT = 30000; // 30 seconds
    console.log(`Browser is open. Will close in ${BROWSER_TIMEOUT/1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, BROWSER_TIMEOUT));
    
    await browser.close();

    // Unmount the state to save changes
    console.log("Unmounting state...");
    await browserState.unmount();
    console.log("State unmounted and saved");
  } catch (error) {
    console.error('Error:', error);
    
    // Try to list buckets if there's a bucket error
    const errorMessage = String(error);
    if (errorMessage.includes('bucket') && 
        (errorMessage.includes('does not exist') || 
         errorMessage.includes('not accessible') || 
         errorMessage.includes('notFound'))) {
      
      try {
        const storage = new Storage({ keyFilename: config.serviceAccountPath });
        console.error('\nAttempting to list available buckets:');
        const [buckets] = await storage.getBuckets();
        console.error('Available buckets:');
        buckets.forEach(bucket => {
          console.error(`- ${bucket.name}`);
        });
        console.error('\nUpdate the bucketName in config.ts to match one of these buckets.');
      } catch (listError) {
        console.error('Failed to list buckets. Make sure your service account has the Storage Admin role.');
        console.error('Error details:', listError);
      }
    }
  }
}

/**
 * How to get Google Cloud Service Account credentials:
 * 
 * 1. Go to the Google Cloud Console (https://console.cloud.google.com/)
 * 2. Select your project
 * 3. Go to "IAM & Admin" > "Service Accounts"
 * 4. Create a new service account or use an existing one
 * 5. Assign the "Storage Admin" role (or a more specific role with the necessary permissions)
 * 6. Create a key for the service account (JSON format)
 * 7. Download the key file and save it as "service-account.json" in this directory
 * 
 * Note: The service-account.json file is already added to .gitignore to prevent
 * accidental commits of sensitive credentials.
 */

main().catch(console.error); 