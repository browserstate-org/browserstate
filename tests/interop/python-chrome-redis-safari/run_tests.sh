#!/bin/bash
# Shell script to run Python-Chrome to Safari browser interop tests

set -e # Exit immediately if a command exits with a non-zero status

# Colors for console output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PYTHON_DIR="${SCRIPT_DIR}/../../../python"

# Print test header
echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}   Python-Chrome to Safari via Redis Interop Test   ${NC}"
echo -e "${BLUE}========================================================${NC}"

# Function to check if Redis is running
check_redis() {
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
}

# Function to check and set up Python environment
setup_python() {
    echo -e "\n${YELLOW}Checking Python environment...${NC}"
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "${SCRIPT_DIR}/venv" ]; then
        echo -e "${YELLOW}Creating Python virtual environment...${NC}"
        python3 -m venv "${SCRIPT_DIR}/venv"
        echo -e "${GREEN}✓ Virtual environment created${NC}"
    fi
    
    # Activate virtual environment
    source "${SCRIPT_DIR}/venv/bin/activate"
    echo -e "${GREEN}✓ Virtual environment activated${NC}"
    
    # Install required packages
    echo -e "\n${YELLOW}Installing required Python packages...${NC}"
    
    # Install base dependencies first
    pip install --upgrade pip
    
    # Install dependencies from requirements.txt
    if [ -f "${SCRIPT_DIR}/requirements.txt" ]; then
        echo -e "${YELLOW}Installing dependencies from requirements.txt...${NC}"
        pip install -r "${SCRIPT_DIR}/requirements.txt"
    else
        echo -e "${YELLOW}No requirements.txt found, installing required packages individually...${NC}"
        pip install playwright redis boto3 google-cloud-storage
    fi
    
    # Install local browserstate package if in development mode
    if [ -d "${PYTHON_DIR}" ]; then
        echo -e "${YELLOW}Installing local browserstate package from: ${PYTHON_DIR}${NC}"
        pip install -e "${PYTHON_DIR}"
        if [ $? -ne 0 ]; then
            echo -e "${RED}✗ Failed to install local browserstate package${NC}"
            echo -e "${YELLOW}Trying to install from PyPI instead...${NC}"
            pip install browserstate
        else
            echo -e "${GREEN}✓ Local browserstate package installed${NC}"
        fi
    else
        echo -e "${YELLOW}No local browserstate package found, installing from PyPI...${NC}"
        pip install browserstate
    fi
    
    # Check if browserstate was successfully installed
    if ! python -c "import browserstate" &> /dev/null; then
        echo -e "${RED}✗ Failed to import browserstate module${NC}"
        echo -e "${YELLOW}Debugging module import issue...${NC}"
        # Show installed packages
        echo -e "${YELLOW}Installed packages:${NC}"
        pip list | grep browserstate
        
        # Check the Python path
        echo -e "${YELLOW}Python path:${NC}"
        python -c "import sys; print(sys.path)"
        
        # Check if browserstate package structure looks correct
        echo -e "${YELLOW}Checking browserstate package structure:${NC}"
        site_packages=$(python -c "import site; print(site.getsitepackages()[0])")
        if [ -d "$site_packages/browserstate" ]; then
            echo -e "${GREEN}✓ Browserstate package directory exists${NC}"
            ls -la "$site_packages/browserstate"
            
            # Check for critical files
            if [ -f "$site_packages/browserstate/__init__.py" ]; then
                echo -e "${GREEN}✓ __init__.py file exists${NC}"
            else
                echo -e "${RED}✗ Missing __init__.py file${NC}"
            fi
            
            # Check if the module has the expected structure
            if [ -f "$site_packages/browserstate/browser_state.py" ]; then
                echo -e "${GREEN}✓ browser_state.py exists${NC}"
            else
                echo -e "${RED}✗ Missing browser_state.py${NC}"
            fi
            
            # Check if storage directory exists
            if [ -d "$site_packages/browserstate/storage" ]; then
                echo -e "${GREEN}✓ storage directory exists${NC}"
                ls -la "$site_packages/browserstate/storage"
            else
                echo -e "${RED}✗ Missing storage directory${NC}"
            fi
        else
            echo -e "${RED}✗ Browserstate package directory not found${NC}"
            # Look for other browserstate-related files
            echo -e "${YELLOW}Looking for browserstate files in site-packages:${NC}"
            find "$site_packages" -name "*browserstate*"
        fi
        
        # Continue anyway, as the package might still work
        echo -e "${YELLOW}Will attempt to continue despite import issue...${NC}"
    else
        echo -e "${GREEN}✓ Browserstate module imported successfully${NC}"
    fi
    
    # Install Playwright browsers
    echo -e "\n${YELLOW}Installing Playwright browsers...${NC}"
    python -m playwright install chromium webkit
    
    echo -e "${GREEN}✓ All Python dependencies installed${NC}"
    
    # Print browserstate version for debugging
    echo -e "\n${YELLOW}Installed browserstate version:${NC}"
    python -c "
import sys
try:
    import browserstate
    if hasattr(browserstate, '__version__'):
        print(f'Version: {browserstate.__version__}')
    else:
        print('Version information not available in package')
except ImportError as e:
    print(f'Import error: {e}')
except Exception as e:
    print(f'Unexpected error: {e}')
"

    # Check if all required dependencies are installed
    echo -e "\n${YELLOW}Checking required dependencies...${NC}"
    for pkg in boto3 redis google.cloud playwright browserstate; do
        if ! python -c "import $pkg" &> /dev/null; then
            echo -e "${RED}✗ Python package '$pkg' is not installed${NC}"
            echo -e "${YELLOW}Installing missing package: $pkg${NC}"
            pip install $pkg
            
            # Verify installation
            if ! python -c "import $pkg" &> /dev/null; then
                echo -e "${RED}✗ Failed to install $pkg. This might cause issues.${NC}"
            else
                echo -e "${GREEN}✓ Successfully installed $pkg${NC}"
            fi
        else
            echo -e "${GREEN}✓ Package $pkg is installed${NC}"
        fi
    done
}

# Check prerequisites
check_redis
setup_python

# Run Chrome state creation
echo -e "\n${YELLOW}Step 1: Creating browser state in Chrome using Python...${NC}"
python "${SCRIPT_DIR}/create_state.py"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Chrome state creation failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Chrome state creation completed${NC}"

# Run Safari state verification
echo -e "\n${YELLOW}Step 2: Verifying browser state in Safari using Python...${NC}"
python "${SCRIPT_DIR}/verify_state.py"
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Safari state verification failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Safari state verification completed${NC}"

# Test complete
echo -e "\n${GREEN}========================================================${NC}"
echo -e "${GREEN}   🎉 Python-Chrome to Safari interop test completed successfully!   ${NC}"
echo -e "${GREEN}========================================================${NC}"

# Deactivate virtual environment
deactivate
echo -e "${YELLOW}Python virtual environment deactivated${NC}"

exit 0 