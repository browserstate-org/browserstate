import pytest
import sys
from unittest.mock import patch, MagicMock


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


def test_lazy_s3_storage_import():
    with patch('browserstate.utils.dynamic_import.boto3') as mock_boto3:
        # Set up mock for boto3.client
        mock_client = mock_boto3.client.return_value
        
        # Import should work without boto3 actually being installed
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
        
        # Use the browser_state to force the lazy import to occur
        browser_state.list_sessions()
        
        # Verify boto3.client was called
        mock_boto3.client.assert_called_with('s3', **{})


def test_lazy_gcs_storage_import():
    with patch('browserstate.utils.dynamic_import.google_cloud_storage') as mock_gcs:
        # Set up mock for google cloud storage
        mock_client = MagicMock()
        mock_gcs.Client.return_value = mock_client
        
        # Import should work without google-cloud-storage actually being installed
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
        
        # Use the browser_state to force the lazy import to occur
        browser_state.list_sessions()
        
        # Verify Client was called
        mock_gcs.Client.assert_called_with(**{})


def test_lazy_redis_storage_import():
    with patch('browserstate.utils.dynamic_import.redis_module') as mock_redis:
        # Set up mock for redis
        mock_redis.Redis.from_url.return_value = MagicMock()
        
        # Import should work without redis actually being installed
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
        
        # Use the browser_state to force the lazy import to occur
        browser_state.list_sessions()
        
        # Verify Redis.from_url was called
        mock_redis.Redis.from_url.assert_called_with("redis://localhost:6379/0") 