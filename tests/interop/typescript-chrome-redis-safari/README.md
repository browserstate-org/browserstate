# Chrome to Safari Browser Interoperability Test

This directory contains interoperability tests between Chrome and Safari browsers using Redis as the storage backend.

## Overview

This test verifies that browser state (specifically localStorage data) can be:
1. Created in Chrome
2. Stored in Redis using the BrowserState library
3. Successfully restored in Safari

## Prerequisites

1. Redis server running locally (default port 6379)
2. Node.js with npm
3. Playwright

## Test Structure

The test consists of two main scripts:

1. `create_state.mjs` - Creates browser state in Chrome and stores it in Redis
2. `verify_state.mjs` - Loads the Chrome-created state in Safari and verifies it

## Running the Test

To run the entire test suite:

```bash
./run_tests.sh
```

To run individual steps:

```bash
# Create state in Chrome
node create_state.mjs

# Verify state in Safari
node verify_state.mjs
```

## Test Details

### Chrome State Creation (`create_state.mjs`)

1. Initializes a BrowserState instance with Redis storage
2. Mounts a new session for the browser state
3. Launches a Chrome browser with the mounted state
4. Adds test data to localStorage:
   - Multiple note items
   - Browser metadata (user agent, timestamp)
5. Unmounts the session, saving state to Redis

### Safari Verification (`verify_state.mjs`)

1. Initializes a BrowserState instance with the same Redis configuration
2. Lists available sessions to find the Chrome-created session
3. Mounts the Chrome-created session
4. Launches a Safari browser with the mounted state
5. Verifies that the localStorage data created in Chrome is accessible in Safari:
   - Notes are present and contain the expected content
   - Browser metadata shows it was created in Chrome
6. Adds Safari verification metadata to localStorage
7. Unmounts the session

## Troubleshooting

If the test fails, check:

1. Redis is running: `redis-cli ping`
2. Playwright browsers are installed: `npx playwright install chromium webkit`
3. The TypeScript package is built: `npm --prefix ../../../typescript run build` 