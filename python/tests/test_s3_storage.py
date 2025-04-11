import os
import filecmp
import shutil
import pytest
from unittest.mock import patch, MagicMock

# Conditionally import boto3
try:
    import boto3
    import botocore

    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False

from browserstate.storage.s3_storage import S3Storage


@pytest.fixture
def mock_boto3_setup():
    """Set up mock boto3 and related S3 components."""
    mock_boto3 = MagicMock()
    mock_s3_client = MagicMock()
    mock_boto3.get_module.return_value = mock_boto3
    mock_boto3.client.return_value = mock_s3_client
    mock_botocore = MagicMock()

    # Setup core boto3 module references for the scope of this test
    with patch.dict(
        "sys.modules", {"boto3": mock_boto3, "botocore": mock_botocore}
    ), patch("browserstate.utils.dynamic_import.boto3", mock_boto3), patch(
        "browserstate.utils.dynamic_import.botocore", mock_botocore
    ), patch(
        "browserstate.storage.s3_storage.boto3", mock_boto3
    ):
        yield {
            "boto3": mock_boto3,
            "botocore": mock_botocore,
            "s3_client": mock_s3_client,
        }


def test_s3_storage_mock(mock_boto3_setup, tmp_path):
    """Test S3 storage using mocks instead of actual S3 or moto."""
    # Get mocks from fixture
    mock_s3_client = mock_boto3_setup["s3_client"]
    mock_boto3 = mock_boto3_setup["boto3"]

    # Setup test data
    user_id = "s3_user"
    session_id = "session_s3"

    # Use tmp_path for test data
    dummy_session_dir = tmp_path / "src_dir"
    dummy_session_dir.mkdir()

    # Create test files
    test_file_path = dummy_session_dir / "test.txt"
    test_file_path.write_text("Test content")

    subfolder_path = dummy_session_dir / "subfolder"
    subfolder_path.mkdir()
    subfolder_file = subfolder_path / "sub.txt"
    subfolder_file.write_text("Subfolder content")

    # Mock the list_objects_v2 response for download
    mock_s3_client.list_objects_v2.return_value = {
        "Contents": [
            {"Key": f"{user_id}/{session_id}/test.txt"},
            {"Key": f"{user_id}/{session_id}/subfolder/sub.txt"},
        ]
    }

    # Mock the download_file to actually create files
    def mock_download_file(bucket, key, filename):
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        with open(filename, "w") as f:
            f.write("Downloaded content")

    # Apply mocks
    mock_s3_client.download_file.side_effect = mock_download_file

    # Create S3 storage and test operations
    storage = S3Storage(bucket_name="test-bucket")

    # Test upload
    storage.upload(user_id, session_id, str(dummy_session_dir))

    # Verify boto3.get_module was called
    mock_boto3.get_module.assert_called()

    # Test download
    downloaded_path = storage.download(user_id, session_id)

    # Verify files were created
    assert os.path.exists(downloaded_path)

    # Test list_sessions
    mock_s3_client.list_objects_v2.return_value = {
        "CommonPrefixes": [{"Prefix": f"{user_id}/{session_id}/"}]
    }
    sessions = storage.list_sessions(user_id)
    assert session_id in sessions

    # Test delete_session
    mock_s3_client.list_objects_v2.return_value = {
        "Contents": [{"Key": f"{user_id}/{session_id}/test.txt"}]
    }
    storage.delete_session(user_id, session_id)
    mock_s3_client.delete_objects.assert_called_once()

    # No need to clean up tmp_path as pytest handles that automatically


def test_s3_storage_empty_mock(mock_boto3_setup):
    """Test S3 storage with empty sessions using mocks."""
    # Get mocks from fixture
    mock_s3_client = mock_boto3_setup["s3_client"]

    # Return empty list for list_objects_v2
    mock_s3_client.list_objects_v2.return_value = {}

    # Create storage and test empty session
    storage = S3Storage(bucket_name="test-bucket")
    user_id = "s3_user"
    session_id = "nonexistent"

    downloaded_path = storage.download(user_id, session_id)
    assert os.path.exists(downloaded_path)
    assert not os.listdir(downloaded_path)
    shutil.rmtree(downloaded_path, ignore_errors=True)
