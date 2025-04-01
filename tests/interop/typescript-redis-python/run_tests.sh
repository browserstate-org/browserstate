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

# Function to check if Redis is running
check_redis() {
    print_header "Checking Redis Connection"
    if ! redis-cli ping > /dev/null 2>&1; then
        echo -e "${RED}❌ Redis is not running. Please start Redis first.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Redis is running${NC}"
}

# Function to check Python dependencies
check_python_deps() {
    print_header "Checking Python Dependencies"
    if ! pip show playwright > /dev/null 2>&1; then
        echo -e "${BLUE}Installing Python Playwright...${NC}"
        pip install playwright
        python -m playwright install chromium
    fi
    echo -e "${GREEN}✅ Python dependencies installed${NC}"
}

# Function to check TypeScript dependencies
check_ts_deps() {
    print_header "Checking TypeScript Dependencies"
    # Create package.json if it doesn't exist
    if [ ! -f "package.json" ]; then
        echo '{
  "name": "interop-tests",
  "version": "1.0.0",
  "description": "Interop tests for BrowserState",
  "dependencies": {}
}' > package.json
    fi
    
    # Install required packages
    echo -e "${BLUE}Installing TypeScript dependencies...${NC}"
    npm install --no-save playwright ts-node
    echo -e "${GREEN}✅ TypeScript dependencies installed${NC}"
}

# Main execution
echo -e "${BLUE}🚀 Starting TypeScript -> Redis -> Python Interop Test${NC}"

# Check prerequisites
check_redis
check_python_deps
check_ts_deps

# Run TypeScript state creation
print_header "Running TypeScript State Creation"
if ! ts-node create_state.ts; then
    echo -e "${RED}❌ TypeScript state creation failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ TypeScript state creation completed successfully${NC}"

# Run Python verification
print_header "Running Python Verification"
if ! python3 verify_state.py; then
    echo -e "${RED}❌ Python verification failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Python verification completed successfully${NC}"

echo -e "\n${GREEN}✨ All tests completed successfully!${NC}" 