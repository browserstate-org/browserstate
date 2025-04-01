#!/bin/bash
# Shell script to run Chrome to Safari browser interop tests

set -e # Exit immediately if a command exits with a non-zero status

# Colors for console output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
TYPESCRIPT_DIR="${SCRIPT_DIR}/../../../typescript"

# Print test header
echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}   Cross-Browser Interop Test: Chrome to Safari via Redis   ${NC}"
echo -e "${BLUE}========================================================${NC}"

# Check if Redis is running
echo -e "\n${YELLOW}Checking if Redis is running...${NC}"
if command -v redis-cli >/dev/null 2>&1 ; then
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Redis is running${NC}"
    else
        echo -e "${RED}✗ Redis is not running${NC}"
        echo -e "${YELLOW}Please start Redis:${NC}"
        echo -e "  redis-server"
        exit 1
    fi
else
    echo -e "${RED}✗ redis-cli not found${NC}"
    echo -e "${YELLOW}Please install Redis:${NC}"
    echo -e "  brew install redis"
    exit 1
fi

# Check if Node.js modules are installed
echo -e "\n${YELLOW}Checking for Node.js dependencies...${NC}"
if [ ! -d "${SCRIPT_DIR}/node_modules" ]; then
    echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
    npm --prefix "${SCRIPT_DIR}" install
    echo -e "${GREEN}✓ Node.js dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Node.js dependencies found${NC}"
fi

# Build the TypeScript package if it hasn't been built
echo -e "\n${YELLOW}Checking if TypeScript package is built...${NC}"
if [ ! -d "${TYPESCRIPT_DIR}/dist" ]; then
    echo -e "${YELLOW}Building TypeScript package...${NC}"
    npm --prefix "${TYPESCRIPT_DIR}" install
    npm --prefix "${TYPESCRIPT_DIR}" run build
    echo -e "${GREEN}✓ TypeScript package built${NC}"
else
    echo -e "${GREEN}✓ TypeScript package is already built${NC}"
fi

# Install Playwright browsers if needed
if ! npx playwright --version > /dev/null 2>&1; then
    echo -e "\n${YELLOW}Installing Playwright browsers...${NC}"
    npx playwright install chromium webkit
    echo -e "${GREEN}✓ Playwright browsers installed${NC}"
fi

# Run the Chrome state creation
echo -e "\n${YELLOW}Step 1: Creating browser state in Chrome...${NC}"
node "${SCRIPT_DIR}/create_state.mjs"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Chrome state creation failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Chrome state creation completed${NC}"

# Run the Safari state verification
echo -e "\n${YELLOW}Step 2: Verifying browser state in Safari...${NC}"
node "${SCRIPT_DIR}/verify_state.mjs"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Safari state verification failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Safari state verification completed${NC}"

# Test complete
echo -e "\n${GREEN}========================================================${NC}"
echo -e "${GREEN}   🎉 Chrome to Safari interop test completed successfully!   ${NC}"
echo -e "${GREEN}========================================================${NC}"

exit 0 