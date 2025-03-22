# Google Cloud Storage Example for BrowserState

This example demonstrates how to use BrowserState with Google Cloud Storage (GCS) to persist browser profiles in the cloud.

## Prerequisites

1. Create a Google Cloud Platform (GCP) project
2. Create a GCS bucket
3. Create a service account with Storage Admin permissions
4. Download the service account key JSON file to this directory as `service-account.json`

## Configuration

All parameters for the example are stored in the `config.ts` file. Edit this file to adjust:

- `userId`: Identifier for the user
- `projectID`: Your GCP project ID
- `bucketName`: Your GCS bucket name
- `serviceAccountPath`: Path to your service account credentials JSON file

**Important:** The config file contains placeholder values. You must replace these with your own values before running the example.

## Running the Example

1. Install dependencies:
   ```
   npm install @google-cloud/storage playwright fs-extra
   ```

2. Configure your settings in `config.ts`

3. Run the example with one of the following commands:

   ```
   # Run with a new random state ID
   npx ts-node gcs-example.ts
   
   # Run with a specific state ID
   npx ts-node gcs-example.ts my-state-name
   
   # List all available states
   npx ts-node gcs-example.ts --list
   
   # Delete a specific state
   npx ts-node gcs-example.ts --delete my-state-name
   
   # Show help and all options
   npx ts-node gcs-example.ts --help
   ```

## State Management

The example supports several state-related operations:

- **Creating/Using States**: When you run the example with a state ID, it will create a new state if it doesn't exist, or use an existing one if it does.
  
- **Listing States**: Use the `--list` option to see all states stored in your GCS bucket.
  
- **Deleting States**: Remove unwanted states with the `--delete` option.

## Getting Google Cloud Service Account Credentials

1. Go to the Google Cloud Console (https://console.cloud.google.com/)
2. Select your project
3. Go to "IAM & Admin" > "Service Accounts"
4. Create a new service account or use an existing one
5. Assign the "Storage Admin" role (or a more specific role with the necessary permissions)
6. Create a key for the service account (JSON format)
7. Download the key file and save it as "service-account.json" in this directory

**Note:** The `service-account.json` file is already added to .gitignore to prevent accidental commits of sensitive credentials.

## Troubleshooting

If you encounter bucket-related errors, the example will attempt to list available buckets in your GCP project to help you identify the correct bucket name to use in your configuration. 