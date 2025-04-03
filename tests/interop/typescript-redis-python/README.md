# TypeScript -> Redis -> Python Interoperability Test

This test verifies the cross-language interoperability between TypeScript and Python implementations of BrowserState using Redis as the storage backend.

## Overview

The test performs the following:

1. Uses TypeScript to create browser state data (localStorage entries) using Playwright
2. Stores the state in Redis
3. Uses Python to load the state from Redis using Playwright
4. Verifies that the state created in TypeScript can be correctly read in Python

## Requirements

- Redis server running on localhost:6379
- Python 3.6+ with pip
- Node.js with npm
- BrowserState Python package installed
- BrowserState TypeScript package installed

## Files

- `create_state.ts`: TypeScript script that creates state data and saves it to Redis
- `verify_state.py`: Python script that loads state from Redis and verifies it
- `run_tests.sh`: Shell script that installs dependencies and runs both tests in sequence

## Running the Tests

To run the tests, execute:

```bash
./run_tests.sh
```

The script will:
1. Check if Redis is running
2. Install required dependencies (Playwright for both Python and TypeScript)
3. Run the TypeScript test to create state
4. Run the Python test to verify state

## How it Works

### TypeScript Side

The TypeScript script:
1. Initializes a BrowserState instance with Redis storage
2. Mounts a session with a specific ID
3. Uses Playwright to load a test HTML page
4. Adds notes to localStorage in the browser
5. Unmounts the session, which saves the state to Redis

### Python Side

The Python script:
1. Initializes a BrowserState instance with the same Redis configuration
2. Mounts the same session ID
3. Uses Playwright to load the same test HTML page
4. Reads the localStorage data created by TypeScript
5. Verifies that the data created by TypeScript exists and is correct

## Troubleshooting

- If Redis is not running, start it with `brew services start redis` (macOS) or `redis-server` (Linux)
- If dependencies are not installed correctly, you can install them manually:
  - For Python: `pip install playwright && python -m playwright install chromium`
  - For TypeScript: `npm install playwright ts-node` 