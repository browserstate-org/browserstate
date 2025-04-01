# BrowserState Interop Tests

This directory contains interoperability tests for BrowserState:
1. Cross-language tests between Python and TypeScript implementations using Redis as the storage backend.
2. Cross-browser tests between different browsers (Chrome and Safari) using Redis as the storage backend.

## Directory Structure

```
tests/interop/
├── python-redis-typescript/   # Python -> Redis -> TypeScript tests
├── typescript-redis-python/   # TypeScript -> Redis -> Python tests
├── chrome-redis-safari/       # Chrome -> Redis -> Safari tests
├── setup.sh                   # Setup script for all interop tests
└── run_all.sh                 # Run all interop tests
```

## Prerequisites

1. Redis server running locally (default port 6379)
2. Python 3.7+
3. Node.js with npm
4. TypeScript and ts-node
5. Playwright for browser automation

## Setup

Run the setup script to prepare the test environments:

```bash
./setup.sh
```

This will:
1. Create virtual environments for the test directories
2. Install all required dependencies:
   - Python: boto3, google-cloud-storage, redis, playwright
   - TypeScript: playwright, ts-node
3. Install the Python and TypeScript packages in development mode
4. Install and configure the Playwright browser automation tool

## Running Tests

To run all interop tests:

```bash
./run_all.sh
```

This will:
1. Check if Redis is running
2. Verify that all required dependencies are installed
3. Run each test suite in sequence
4. Report success or failure for each test

## Test Structure

Each test directory contains:
- Scripts that create/verify browser state data
- A shell script (`run_tests.sh`) that orchestrates the test execution

## Cross-Language Interoperability

These tests verify that:

1. Browser state created in Python can be correctly accessed in TypeScript
2. Browser state created in TypeScript can be correctly accessed in Python

The tests focus on localStorage data persistence through Redis storage.

## Cross-Browser Interoperability

These tests verify that:

1. Browser state created in one browser can be correctly accessed in another browser
2. Currently testing Chrome to Safari interoperability through Redis storage

## GitHub Workflow Integration

These tests are designed to be run in GitHub workflows. Example workflow step:

```yaml
name: Interop Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  interop-tests:
    runs-on: ubuntu-latest
    
    services:
      redis:
        image: redis
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Setup Interop Test Environment
        run: |
          cd tests/interop
          ./setup.sh
      
      - name: Run Interop Tests
        run: |
          cd tests/interop
          ./run_all.sh
```

## Troubleshooting

1. If Redis connection fails:
   ```bash
   redis-cli ping
   ```

2. If dependencies are missing:
   ```bash
   cd tests/interop
   ./setup.sh
   ```

3. If Playwright browser installation fails:
   ```bash
   cd tests/interop/python-redis-typescript
   source venv/bin/activate
   python -m playwright install --help
   ``` 