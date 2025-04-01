#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print section headers
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Function to setup a test directory
setup_test_dir() {
    local dir=$1
    local name=$2
    print_header "Setting up $name test environment"
    
    # Create directory if it doesn't exist
    mkdir -p "$dir"
    cd "$dir"
    
    # Create and activate Python virtual environment
    python3 -m venv venv
    source venv/bin/activate
    
    # Install Python package
    pip install -e ../../../python
    
    # Initialize npm and install TypeScript package
    npm init -y
    npm install -e ../../../typescript
    
    # Install ts-node globally
    npm install -g ts-node
    
    cd ..
}

# Main setup
print_header "Setting up BrowserState Interop Test Environment"

# Create test directories
mkdir -p python-redis-typescript
mkdir -p typescript-redis-python

# Setup each test directory
setup_test_dir "python-redis-typescript" "Python -> Redis -> TypeScript"
setup_test_dir "typescript-redis-python" "TypeScript -> Redis -> Python"

print_header "Setup Complete"
echo -e "${GREEN}✅ All test environments are ready${NC}"
echo -e "\nYou can now run the tests using:"
echo -e "  ./run_all.sh" 