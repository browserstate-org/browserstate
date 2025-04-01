# Python-Chrome to Safari Browser Interoperability Test

This directory contains interoperability tests between Chrome and Safari browsers using Python with Redis as the storage backend.

## Overview

This test verifies that browser state (specifically localStorage data) can be:
1. Created in Chrome using the Python BrowserState library
2. Stored in Redis
3. Successfully restored in Safari

## Prerequisites

1. Redis server running locally (default port 6379)
2. Python 3.8+ with pip
3. Playwright for Python

## Test Structure

The test consists of two main scripts:

1. `create_state.py` - Creates browser state in Chrome using Python and stores it in Redis
2. `verify_state.py` - Loads the Chrome-created state in Safari and verifies it

## Running the Test

To run the entire test suite:

```bash
./run_tests.sh
```

This will:
- Check if Redis is running
- Set up a Python virtual environment with necessary dependencies
- Run the Chrome state creation script
- Run the Safari verification script

To run individual steps (after setting up the environment):

```bash
# Create state in Chrome
python create_state.py

# Verify state in Safari
python verify_state.py
```

## Test Details

### Chrome State Creation (`create_state.py`)

1. Initializes a BrowserState instance with Redis storage
2. Mounts a new session for the browser state
3. Launches a Chrome browser with the mounted state using Playwright
4. Adds test data to localStorage:
   - Multiple note items
   - Browser metadata (user agent, timestamp, creator information)
5. Unmounts the session, saving state to Redis

### Safari Verification (`verify_state.py`)

1. Initializes a BrowserState instance with the same Redis configuration
2. Lists available sessions to find the Chrome-created session
3. Mounts the Chrome-created session
4. Launches a Safari browser with the mounted state using Playwright
5. Verifies that the localStorage data created in Chrome is accessible in Safari:
   - Notes are present and contain the expected content
   - Browser metadata shows it was created in Chrome by Python
6. Adds Safari verification metadata to localStorage
7. Unmounts the session

## Troubleshooting

If the test fails, check:

1. Redis is running: `redis-cli ping`
2. Playwright browsers are installed: `python -m playwright install chromium webkit`
3. The BrowserState Python package is installed correctly

## Notes

This test demonstrates cross-browser and cross-language interoperability of the BrowserState library, showing how state can be seamlessly transferred between different browser environments. 