# BrowserState Examples

This directory contains example scripts that demonstrate how to use the BrowserState library with various browser automation tools.

## Prerequisites

Before running the examples, you need to:

1. Install the required dependencies:

```bash
# Install core dependencies
npm install

# For Playwright examples
npm install playwright

# For Puppeteer examples
npm install puppeteer
```

2. Build the BrowserState library:

```bash
npm run build
```

## Examples

### Playwright Browser Automation

This example shows how to use BrowserState with Playwright, including switching between Chrome and Firefox:

```bash
npx ts-node examples/playwright-browser-automation.ts
```

### Puppeteer Test

A basic example of using BrowserState with Puppeteer:

```bash
npx ts-node examples/puppeteer-test.ts
```

### Cloud Storage Examples

Examples of using BrowserState with AWS S3 and Google Cloud Storage:

```bash
# First install the required cloud provider SDKs
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @google-cloud/storage

# Then run the examples
npx ts-node examples/cloud-storage-test.ts
```

## How It Works

The examples demonstrate how BrowserState:

1. Downloads browser profiles from storage (local, S3, GCS)
2. Provides a path to launch a browser with a persistent context
3. Saves the browser state back to storage
4. Allows resuming the session in a future run

This enables persisting browsing state between automation runs, including cookies, localStorage, and other browser state. 