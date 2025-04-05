"""BrowserState - Browser profile persistence across machines and environments."""
from .browser_state import (
    BrowserState,
    BrowserStateOptions
)
from .storage import LocalStorage, StorageProvider

__version__ = "0.0.2"

__all__ = [
    'BrowserState',
    'BrowserStateOptions',
    'StorageProvider',
    'LocalStorage',
    'S3Storage',
    'GCSStorage',
    'RedisStorage'
]

# Lazy imports for optional storage providers
def __getattr__(name):
    """Lazily import storage providers when requested."""
    if name in ('S3Storage', 'GCSStorage', 'RedisStorage'):
        return getattr(__import__('browserstate.storage', fromlist=[name]), name)
    else:
        raise AttributeError(f"module '{__name__}' has no attribute '{name}'")