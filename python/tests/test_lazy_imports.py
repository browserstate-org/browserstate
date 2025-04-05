import pytest
import sys
from unittest.mock import patch, MagicMock

# Import needed parts directly to avoid dependency issues
from browserstate.utils.dynamic_import import import_module


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


@patch('browserstate.utils.dynamic_import.import_module')
def test_s3_storage_import_patched(mock_import):
    # Setup the mock to return a fake boto3 module
    mock_boto3 = MagicMock()
    mock_client = MagicMock()
    mock_boto3.client.return_value = mock_client
    
    # Configure import_module to return our mock when boto3 is requested
    def mock_import_side_effect(module_name, error_message=None):
        if module_name == 'boto3':
            return mock_boto3
        elif module_name == 'botocore':
            return MagicMock()
        raise ImportError(f"Unexpected import: {module_name}")
            
    mock_import.side_effect = mock_import_side_effect
    
    # Import with patched modules
    from browserstate import BrowserState, BrowserStateOptions
    
    # Create options with S3 configuration
    options = BrowserStateOptions(
        user_id="test_user",
        s3_options={
            "bucket_name": "test-bucket"
        }
    )
    
    # Create BrowserState with the options
    browser_state = BrowserState(options)
    
    # Access attributes to ensure lazy loading is triggered
    sessions = browser_state.list_sessions()
    
    # Verify our mock was called correctly
    mock_boto3.client.assert_called_with('s3', **{})


@patch('browserstate.utils.dynamic_import.import_module')
def test_gcs_storage_import_patched(mock_import):
    # Setup the mock to return a fake GCS module
    mock_gcs = MagicMock()
    mock_client = MagicMock()
    mock_gcs.Client.return_value = mock_client
    
    # Configure import_module to return our mock when google.cloud.storage is requested
    def mock_import_side_effect(module_name, error_message=None):
        if module_name == 'google.cloud.storage':
            return mock_gcs
        raise ImportError(f"Unexpected import: {module_name}")
            
    mock_import.side_effect = mock_import_side_effect
    
    # Import with patched modules
    from browserstate import BrowserState, BrowserStateOptions
    
    # Create options with GCS configuration
    options = BrowserStateOptions(
        user_id="test_user",
        gcs_options={
            "bucket_name": "test-bucket"
        }
    )
    
    # Create BrowserState with the options
    browser_state = BrowserState(options)
    
    # Access attributes to ensure lazy loading is triggered
    sessions = browser_state.list_sessions()
    
    # Verify our mock was called correctly
    mock_gcs.Client.assert_called_with(**{})


@patch('browserstate.utils.dynamic_import.import_module')
def test_redis_storage_import_patched(mock_import):
    # Setup the mock to return a fake redis module
    mock_redis = MagicMock()
    mock_client = MagicMock()
    mock_redis.Redis.from_url.return_value = mock_client
    
    # Configure import_module to return our mock when redis is requested
    def mock_import_side_effect(module_name, error_message=None):
        if module_name == 'redis':
            return mock_redis
        raise ImportError(f"Unexpected import: {module_name}")
            
    mock_import.side_effect = mock_import_side_effect
    
    # Import with patched modules
    from browserstate import BrowserState, BrowserStateOptions
    
    # Create options with Redis configuration
    options = BrowserStateOptions(
        user_id="test_user",
        redis_options={
            "redis_url": "redis://localhost:6379/0"
        }
    )
    
    # Create BrowserState with the options
    browser_state = BrowserState(options)
    
    # Access attributes to ensure lazy loading is triggered
    sessions = browser_state.list_sessions()
    
    # Verify our mock was called correctly
    mock_redis.Redis.from_url.assert_called_with("redis://localhost:6379/0") 