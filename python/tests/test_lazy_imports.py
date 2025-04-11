import pytest
import sys
from unittest.mock import patch, MagicMock

# Import needed parts directly to avoid dependency issues
from browserstate.utils.dynamic_import import import_module


def test_redis_not_required_for_import():
    # If redis is already imported, remove it for this test
    if "redis" in sys.modules:
        redis_module = sys.modules["redis"]
        del sys.modules["redis"]
    else:
        redis_module = None

    try:
        # This should not fail even though redis might not be installed
        import browserstate

        # Verify we can import the base modules
        assert hasattr(browserstate, "BrowserState")
        assert hasattr(browserstate, "LocalStorage")

        # RedisStorage should be accessible via __getattr__
        assert "RedisStorage" in browserstate.__all__
    finally:
        # Restore redis module if it was imported
        if redis_module:
            sys.modules["redis"] = redis_module


def test_s3_storage_import_patched():
    """Test that S3Storage can be used with mocked dependencies."""
    # Setup mocks
    mock_boto3 = MagicMock()
    mock_boto3_client = MagicMock()
    mock_boto3.client.return_value = mock_boto3_client
    mock_botocore = MagicMock()

    # Use multiple patches to ensure all imports are caught
    with patch.dict(
        "sys.modules", {"boto3": mock_boto3, "botocore": mock_botocore}
    ), patch("browserstate.utils.dynamic_import.boto3", mock_boto3), patch(
        "browserstate.utils.dynamic_import.botocore", mock_botocore
    ), patch("browserstate.storage.s3_storage.boto3", mock_boto3):
        # Import after patching
        from browserstate import BrowserState, BrowserStateOptions
        from browserstate.storage.s3_storage import S3Storage

        # Create S3 storage directly to ensure the mock is used
        s3_storage = S3Storage(bucket_name="test-bucket")

        # Verify our mocks were used
        mock_boto3.client.assert_called_with("s3", **{})


def test_gcs_storage_import_patched():
    """Test that GCSStorage can be used with mocked dependencies."""
    # Setup mocks
    mock_gcs = MagicMock()
    mock_client = MagicMock()
    mock_gcs.Client.return_value = mock_client

    # Use multiple patches to ensure all imports are caught
    with patch.dict("sys.modules", {"google.cloud.storage": mock_gcs}), patch(
        "browserstate.utils.dynamic_import.google_cloud_storage", mock_gcs
    ), patch("browserstate.storage.gcs_storage.google_cloud_storage", mock_gcs):
        # Import after patching
        from browserstate import BrowserState, BrowserStateOptions
        from browserstate.storage.gcs_storage import GCSStorage

        # Create GCS storage directly to ensure the mock is used
        gcs_storage = GCSStorage(bucket_name="test-bucket")

        # Verify our mocks were used
        mock_gcs.Client.assert_called_with(**{})


def test_redis_storage_import_patched():
    """Test that RedisStorage can be used with mocked dependencies."""
    # Setup mocks
    mock_redis = MagicMock()
    mock_client = MagicMock()
    mock_redis.Redis.from_url.return_value = mock_client

    # Use multiple patches to ensure all imports are caught
    with patch.dict("sys.modules", {"redis": mock_redis}), patch(
        "browserstate.utils.dynamic_import.redis_module", mock_redis
    ), patch("browserstate.storage.redis_storage.redis_module", mock_redis):
        # Import after patching
        from browserstate import BrowserState, BrowserStateOptions
        from browserstate.storage.redis_storage import RedisStorage

        # Create Redis storage directly to ensure the mock is used
        redis_storage = RedisStorage(host="localhost", port=6379, db=0)

        # Verify our mocks were used
        mock_redis.Redis.from_url.assert_called_with("redis://localhost:6379/0")
