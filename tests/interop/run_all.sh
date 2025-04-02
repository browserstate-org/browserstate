#!/bin/bash
source ./python_tests/venv/bin/activate

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print header function
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Check if Redis is running
check_redis() {
    print_header "Checking Redis Connection"
    if ! redis-cli ping > /dev/null 2>&1; then
        echo -e "${RED}❌ Redis is not running. Please start Redis first.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Redis is running${NC}"
}

# Run a Python test for a given browser, mode, and session ID
run_python_test() {
    local browser=$1
    local mode=$2
    local session=$3
    print_header "Running Python Test: Browser=${browser}, Mode=${mode}, Session=${session}"
    python3 python_tests/run_python_tests.py --browser "$browser" --mode "$mode" --session "$session"
}

# Run a TypeScript test for a given browser, mode, and session ID
run_ts_test() {
    local browser=$1
    local mode=$2
    local session=$3
    print_header "Running TypeScript Test: Browser=${browser}, Mode=${mode}, Session=${session}"
    node typescript_tests/run_ts_tests.mjs --browser "$browser" --mode "$mode" --session "$session"
}

# Run cross‑language interop tests
run_cross_language_tests() {
    print_header "Cross‑Language Interop Test: Python creates state, TypeScript verifies state"
    SESSION="py_create_ts_verify"
    run_python_test "chromium" "create" "$SESSION"
    run_ts_test "chromium" "verify" "$SESSION"

    print_header "Cross‑Language Interop Test: TypeScript creates state, Python verifies state"
    SESSION="ts_create_py_verify"
    run_ts_test "chromium" "create" "$SESSION"
    run_python_test "chromium" "verify" "$SESSION"
}

# Main execution
echo -e "${BLUE}🚀 Starting Full BrowserState Interop Tests${NC}"

check_redis

# Define browsers to test
BROWSERS=("chromium" "webkit" "firefox")

# Run Python cross‑browser tests (create and verify) for each browser
for browser in "${BROWSERS[@]}"; do
    SESSION="py_${browser}_test"
    run_python_test "$browser" "create" "$SESSION"
    run_python_test "$browser" "verify" "$SESSION"
done

# Run TypeScript cross‑browser tests (create and verify) for each browser
for browser in "${BROWSERS[@]}"; do
    SESSION="ts_${browser}_test"
    run_ts_test "$browser" "create" "$SESSION"
    run_ts_test "$browser" "verify" "$SESSION"
done

# Run cross‑language tests
run_cross_language_tests

echo -e "\n${GREEN}✨ All interop tests completed successfully!${NC}"
