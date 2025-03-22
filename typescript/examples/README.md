# BrowserState Examples

This directory contains examples of how to use BrowserState with different storage providers and browser automation tools.

## Directory Structure

```
examples/
├── local/                # Examples using local storage
│   ├── playright-test.ts # Playwright example with local storage
│   └── puppeteer-test.ts # Puppeteer example with local storage
├── google/               # Examples using Google Cloud Storage
│   └── gcs-example.ts    # Playwright example with GCS
├── s3/                   # Examples using AWS S3 Storage
│   └── s3-example.ts     # Example with S3 (to be added)
└── README.md             # This file
```

## Prerequisites

Before running these examples, you'll need to install the required dependencies:

```bash
# Core dependencies
npm install browserstate playwright puppeteer

# For Google Cloud Storage examples
npm install @google-cloud/storage

# For AWS S3 examples
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

## Running Examples

### Local Storage Examples

Local storage examples can be run without any additional configuration:

```bash
# Using Playwright
npx ts-node examples/local/playright-test.ts

# Using Puppeteer
npx ts-node examples/local/puppeteer-test.ts
```

### Google Cloud Storage Examples

To run the Google Cloud Storage examples, you'll need:

1. A Google Cloud project
2. A GCS bucket
3. A service account with Storage Admin permissions
4. A downloaded service account key file

#### Getting Google Cloud Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Go to "IAM & Admin" > "Service Accounts"
4. Create a new service account or use an existing one
5. Assign the "Storage Admin" role (or a more specific role with necessary permissions)
6. Create a key for the service account (JSON format)
7. Download the key file and keep it secure
8. Update the `keyFilename` path in the example to point to your key file

```bash
# Run the GCS example
npx ts-node examples/google/gcs-example.ts
```

### AWS S3 Examples

To run the AWS S3 examples, you'll need:

1. An AWS account
2. An S3 bucket
3. AWS credentials (access key and secret key) with S3 permissions

#### Getting AWS Credentials

1. Go to the [AWS Management Console](https://aws.amazon.com/console/)
2. Go to "IAM" > "Users" > Select or create a user
3. Under "Security credentials", create an access key
4. Save the access key ID and secret access key
5. Update the example with your credentials

## Testing

For each storage provider:

1. Only LocalStorage has been extensively tested and is confirmed working
2. S3Storage and GCSStorage implementations need additional testing

If you encounter any issues with the cloud storage providers, please create a GitHub issue with details about the problem. 