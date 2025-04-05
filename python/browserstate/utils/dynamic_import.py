"""
Utility module for dynamic imports of optional dependencies.
"""
import importlib
import sys
from typing import Any, Dict, Type, TypeVar, Optional, Callable

# Type variable for generic return type
T = TypeVar('T')

# Cache for already imported modules
_module_cache: Dict[str, Any] = {}

# Dependency error messages
DEPENDENCY_ERRORS = {
    "boto3": "Please run: pip install boto3",
    "botocore": "Please run: pip install boto3",
    "google.cloud.storage": "Please run: pip install google-cloud-storage",
    "redis": "Please run: pip install redis"
}

def import_module(module_name: str, error_message: Optional[str] = None) -> Any:
    """
    Dynamically import a module and cache the result.
    
    Args:
        module_name: Name of the module to import
        error_message: Custom error message if import fails
        
    Returns:
        The imported module
        
    Raises:
        ImportError: If the module cannot be imported
    """
    # Return from cache if already imported
    if module_name in _module_cache:
        return _module_cache[module_name]
    
    if not error_message:
        error_message = DEPENDENCY_ERRORS.get(
            module_name, 
            f"Please install the {module_name} package."
        )
    
    try:
        # Import the module
        module = importlib.import_module(module_name)
        
        # Cache for future use
        _module_cache[module_name] = module
        
        return module
    except ImportError:
        raise ImportError(
            f"Failed to import optional dependency '{module_name}'. {error_message}"
        )

class LazyModule:
    """
    A proxy class that loads a module only when it's accessed.
    """
    def __init__(self, module_name: str, error_message: Optional[str] = None):
        self._module_name = module_name
        self._error_message = error_message
        self._module = None
    
    def __getattr__(self, name: str) -> Any:
        """
        Load the module on first attribute access.
        """
        if self._module is None:
            self._module = import_module(self._module_name, self._error_message)
        
        return getattr(self._module, name)

# Create lazy module loaders for common dependencies
boto3 = LazyModule("boto3", DEPENDENCY_ERRORS["boto3"])
botocore = LazyModule("botocore", DEPENDENCY_ERRORS["botocore"])
google_cloud_storage = LazyModule("google.cloud.storage", DEPENDENCY_ERRORS["google.cloud.storage"])
redis_module = LazyModule("redis", DEPENDENCY_ERRORS["redis"]) 