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

# Function to run a test suite
run_test_suite() {
    local dir=$1
    local name=$2
    print_header "Running $name Tests"
    
    cd "$dir"
    
    # Activate Python virtual environment
    source venv/bin/activate
    
    # Run the test script
    if [ -f "run_tests.sh" ]; then
        if ! ./run_tests.sh; then
            echo -e "${RED}❌ $name tests failed${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ No test script found in $dir${NC}"
        exit 1
    fi
    
    cd ..
    echo -e "${GREEN}✅ $name tests completed successfully${NC}"
}

# Main execution
echo -e "${BLUE}🚀 Starting BrowserState Interop Tests${NC}"

# Check Redis
check_redis

# Run all test suites
run_test_suite "python-redis-typescript" "Python -> Redis -> TypeScript"
run_test_suite "typescript-redis-python" "TypeScript -> Redis -> Python"

echo -e "\n${GREEN}✨ All interop tests completed successfully!${NC}" 