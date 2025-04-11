"""
Dynamic import utilities for optional dependencies.
"""

import importlib
import logging
from typing import Dict, Any, Callable, Optional

logger = logging.getLogger(__name__)

class LazyModule:
    """Lazy module loader that only imports when accessed"""
    
    def __init__(self, module_name: str, error_message: Optional[str] = None):
        """
        Initialize lazy module loader
        
        Args:
            module_name: Name of the module to import
            error_message: Custom error message on import failure
        """
        self.module_name = module_name
        self.error_message = error_message
        self._module = None
    
    def get_module(self) -> Any:
        """
        Get the module, importing it if necessary
        
        Returns:
            The imported module
        
        Raises:
            ImportError: If the module cannot be imported
        """
        if self._module is None:
            try:
                self._module = importlib.import_module(self.module_name)
            except ImportError as e:
                msg = self.error_message or f"Could not import {self.module_name}: {e}"
                raise ImportError(msg) from e
        return self._module

# Dictionary of lazy module loaders
modules: Dict[str, LazyModule] = {
    "boto3": LazyModule(
        "boto3", 
        "boto3 is required for S3 storage. Install with 'pip install boto3'"
    ),
    "botocore": LazyModule(
        "botocore", 
        "botocore is required for S3 storage. Install with 'pip install boto3'"
    ),
    "google.cloud.storage": LazyModule(
        "google.cloud.storage", 
        "google-cloud-storage is required for GCS storage. Install with 'pip install google-cloud-storage'"
    ),
    "extract_zip": LazyModule(
        "extract_zip", 
        "extract-zip is required for ZIP handling. Install with 'pip install extract-zip'"
    ),
    "archiver": LazyModule(
        "archiver", 
        "archiver is required for ZIP handling. Install with 'pip install archiver'"
    ),
    "aioredis": LazyModule(
        "redis.asyncio", 
        "Redis is required for Redis storage. Install with 'pip install redis'"
    ),
}

# Convenience accessors for modules
boto3 = modules["boto3"]
botocore = modules["botocore"]
google_cloud_storage = modules["google.cloud.storage"]
redis_module = modules["aioredis"]

def import_module(module_name: str) -> Any:
    """
    Import a module dynamically
    
    Args:
        module_name: Name of the module to import
        
    Returns:
        The imported module
    """
    return importlib.import_module(module_name)
