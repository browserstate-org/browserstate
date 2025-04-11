"""Storage providers for BrowserState."""

from .storage_provider import StorageProvider
from .local_storage import LocalStorage

# Define __all__ with available base types and the lazily loaded providers
__all__ = ["StorageProvider", "LocalStorage", "S3Storage", "GCSStorage", "RedisStorage"]

# Cache for lazy-loaded providers
_lazy_loaded_modules = {}


# These will be imported lazily when actually needed
def __getattr__(name):
    """Lazily import storage providers when requested.

    This allows the package to work without optional dependencies.
    """
    # Check if already loaded from cache
    if name in _lazy_loaded_modules:
        return _lazy_loaded_modules[name]

    # Map of provider names to their module paths
    provider_modules = {
        "S3Storage": ".s3_storage",
        "GCSStorage": ".gcs_storage",
        "RedisStorage": ".redis_storage",
    }

    if name in provider_modules:
        module_path = provider_modules[name]
        module = __import__(f"browserstate.storage{module_path}", fromlist=[name])
        provider = getattr(module, name)
        _lazy_loaded_modules[name] = provider
        return provider

    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
