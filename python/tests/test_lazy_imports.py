import pytest
import sys
from unittest.mock import patch, MagicMock

from browserstate.utils.dynamic_import import LazyModule

def test_redis_not_required_for_import():
    # If redis is already imported, remove it for this test
    if 'redis' in sys.modules:
        redis_module = sys.modules['redis']
        del sys.modules['redis']
    else:
        redis_module = None
    
    try:
        # This should not fail even though redis might not be installed
        import browserstate
        
        # Verify we can import the base modules
        assert hasattr(browserstate, 'BrowserState')
        assert hasattr(browserstate, 'LocalStorage')
        
        # RedisStorage should be accessible via __getattr__
        assert 'RedisStorage' in browserstate.__all__
    finally:
        # Restore redis module if it was imported
        if redis_module:
            sys.modules['redis'] = redis_module


def test_lazy_module_class():
    with patch('browserstate.utils.dynamic_import.import_module') as mock_import_module:
        # Setup mock for import_module
        mock_module = MagicMock()
        mock_import_module.return_value = mock_module
        
        # Create a lazy module
        lazy_mod = LazyModule("test.module", "Test error message")
        
        # Verify module is not loaded yet
        assert lazy_mod._module is None
        assert mock_import_module.call_count == 0
        
        # Access an attribute to trigger loading
        result = lazy_mod.some_attr
        
        # Verify import_module was called with the right parameters
        mock_import_module.assert_called_once_with("test.module", "Test error message")
        
        # Verify the attribute was accessed on the loaded module
        assert lazy_mod._module == mock_module
        assert result == mock_module.some_attr


@patch('browserstate.utils.dynamic_import.LazyModule.__getattr__')
def test_lazy_s3_storage_import(mock_getattr):
    # Setup mock for LazyModule.__getattr__
    mock_client = MagicMock()
    mock_getattr.return_value = mock_client
    
    # Import with lazy loading
    from browserstate import BrowserState, BrowserStateOptions
    from browserstate.utils.dynamic_import import boto3
    
    # Create options with S3 configuration
    options = BrowserStateOptions(
        user_id="test_user",
        s3_options={
            "bucket_name": "test-bucket"
        }
    )
    
    # Create BrowserState with the options
    browser_state = BrowserState(options)
    
    # Force accessing the client attribute to trigger lazy loading
    boto3.client('s3')
    
    # Verify __getattr__ was called with the expected attribute
    mock_getattr.assert_any_call('client')


@patch('browserstate.utils.dynamic_import.LazyModule.__getattr__')
def test_lazy_gcs_storage_import(mock_getattr):
    # Setup mock for LazyModule.__getattr__
    mock_client_class = MagicMock()
    mock_getattr.return_value = mock_client_class
    
    # Import with lazy loading
    from browserstate import BrowserState, BrowserStateOptions
    from browserstate.utils.dynamic_import import google_cloud_storage
    
    # Create options with GCS configuration
    options = BrowserStateOptions(
        user_id="test_user",
        gcs_options={
            "bucket_name": "test-bucket"
        }
    )
    
    # Create BrowserState with the options
    browser_state = BrowserState(options)
    
    # Force accessing the Client attribute to trigger lazy loading
    google_cloud_storage.Client()
    
    # Verify __getattr__ was called with the expected attribute
    mock_getattr.assert_any_call('Client')


@patch('browserstate.utils.dynamic_import.LazyModule.__getattr__')
def test_lazy_redis_storage_import(mock_getattr):
    # Setup mock for LazyModule.__getattr__
    mock_redis_class = MagicMock()
    mock_getattr.return_value = mock_redis_class
    
    # Import with lazy loading
    from browserstate import BrowserState, BrowserStateOptions
    from browserstate.utils.dynamic_import import redis_module
    
    # Create options with Redis configuration
    options = BrowserStateOptions(
        user_id="test_user",
        redis_options={
            "redis_url": "redis://localhost:6379/0"
        }
    )
    
    # Create BrowserState with the options
    browser_state = BrowserState(options)
    
    # Force accessing the Redis attribute to trigger lazy loading
    redis_module.Redis
    
    # Verify __getattr__ was called with the expected attribute
    mock_getattr.assert_any_call('Redis') 