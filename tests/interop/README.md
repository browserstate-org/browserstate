# BrowserState Interop Tests

This directory contains interoperability tests between Python and TypeScript implementations of BrowserState using Redis as the storage backend.

## Directory Structure

```
tests/interop/
├── python-redis-typescript/  # Python -> Redis -> TypeScript tests
├── typescript-redis-python/  # TypeScript -> Redis -> Python tests
├── setup.sh                  # Setup script for all interop tests
└── run_all.sh                # Run all interop tests
```

## Prerequisites

1. Redis server running locally (default port 6379)
2. Python 3.7+
3. Node.js with npm
4. TypeScript and ts-node

## Setup

Run the setup script to prepare the test environments:

```bash
./setup.sh
```

This will:
1. Create virtual environments for the test directories
2. Install the Python package in development mode
3. Install the TypeScript package in development mode
4. Set up all necessary dependencies

## Running Tests

To run all interop tests:

```bash
./run_all.sh
```

This will:
1. Check if Redis is running
2. Run each test suite in sequence
3. Report success or failure for each test

## Test Structure

Each test directory contains:
- A Python script that creates/verifies browser state data
- A TypeScript script that creates/verifies browser state data
- A shell script (`run_tests.sh`) that orchestrates the test execution

## Cross-Language Interoperability

These tests verify that:

1. Browser state created in Python can be correctly accessed in TypeScript
2. Browser state created in TypeScript can be correctly accessed in Python

The tests focus on localStorage data persistence through Redis storage.

## GitHub Workflow Integration

These tests are designed to be run in GitHub workflows. Example workflow step:

```yaml
- name: Run Interop Tests
  run: |
    cd tests/interop
    ./setup.sh
    ./run_all.sh
```

## Troubleshooting

1. If Redis connection fails:
   ```bash
   redis-cli ping
   ```

2. If Python package is not found:
   ```bash
   cd tests/interop
   ./setup.sh
   ```

3. If TypeScript package is not found:
   ```bash
   cd tests/interop
   ./setup.sh
   ``` 