"""Storage providers for BrowserState."""
from .storage_provider import StorageProvider
from .local_storage import LocalStorage

# Define __all__ with available base types and the lazily loaded providers
__all__ = [
    'StorageProvider',
    'LocalStorage',
    'S3Storage',
    'GCSStorage',
    'RedisStorage'
]

# These will be imported lazily when actually needed
def __getattr__(name):
    """Lazily import storage providers when requested.
    
    This allows the package to work without optional dependencies.
    """
    if name == "S3Storage":
        from .s3_storage import S3Storage
        return S3Storage
    elif name == "GCSStorage":
        from .gcs_storage import GCSStorage
        return GCSStorage
    elif name == "RedisStorage":
        from .redis_storage import RedisStorage
        return RedisStorage
    else:
        raise AttributeError(f"module '{__name__}' has no attribute '{name}'")