#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_header "Setting up BrowserState Interop Test Environment"

# --- Setup Python Environment ---
print_header "Setting up Python Environment"
if [ ! -d "python_tests/venv" ]; then
    python3 -m venv python_tests/venv
fi
source python_tests/venv/bin/activate
pip install --upgrade pip
pip install playwright redis boto3 google-cloud-storage
# Install the local Python browserstate package (assumes it’s in ../../python)
pip install -e ../../python
python -m playwright install chromium firefox webkit
deactivate

# --- Setup TypeScript Environment ---
print_header "Setting up TypeScript Environment"
cd typescript_tests
if [ ! -f "package.json" ]; then
    npm init -y
fi
npm install playwright ts-node ioredis --no-save
# Install the local TypeScript browserstate package (assumes it’s in ../../typescript)
npm install -e ../../typescript
npm install minimist
npm install playwright
cd ..

print_header "Setup Complete"
echo -e "${GREEN}✅ All test environments are ready${NC}"
echo -e "\nYou can now run the tests using:\n  ./run_all.sh"
