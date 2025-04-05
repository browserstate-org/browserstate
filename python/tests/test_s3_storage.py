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

def test_s3_storage_mock():
    """Test S3 storage using mocks instead of actual S3 or moto."""
    # Create a comprehensive mock of S3 client
    mock_s3_client = MagicMock()
    mock_boto3 = MagicMock()
    mock_boto3.client.return_value = mock_s3_client
    mock_botocore = MagicMock()
    user_id = "s3_user"
    session_id = "session_s3"
    
    # Temporary directories for testing
    dummy_session_dir = "dummy_dir"
    os.makedirs(dummy_session_dir, exist_ok=True)
    test_file_path = os.path.join(dummy_session_dir, "test.txt")
    with open(test_file_path, "w") as f:
        f.write("Test content")
    
    subfolder_path = os.path.join(dummy_session_dir, "subfolder")
    os.makedirs(subfolder_path, exist_ok=True)
    subfolder_file = os.path.join(subfolder_path, "sub.txt")
    with open(subfolder_file, "w") as f:
        f.write("Subfolder content")
    
    # Mock the list_objects_v2 response for download
    mock_s3_client.list_objects_v2.return_value = {
        'Contents': [
            {'Key': f'{user_id}/{session_id}/test.txt'},
            {'Key': f'{user_id}/{session_id}/subfolder/sub.txt'}
        ]
    }
    
    # Mock the download_file to actually create files
    def mock_download_file(bucket, key, filename):
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        with open(filename, 'w') as f:
            f.write("Downloaded content")
    
    # Apply mocks
    mock_s3_client.download_file.side_effect = mock_download_file
    
    # Use patches to ensure all imports are caught
    with patch.dict('sys.modules', {'boto3': mock_boto3, 'botocore': mock_botocore}), \
         patch('browserstate.utils.dynamic_import.boto3', mock_boto3), \
         patch('browserstate.utils.dynamic_import.botocore', mock_botocore), \
         patch('browserstate.storage.s3_storage.boto3', mock_boto3):
        
        # Create S3 storage and test operations
        storage = S3Storage(bucket_name="test-bucket")
        
        # Test upload
        storage.upload(user_id, session_id, dummy_session_dir)
        
        # Verify boto3.client was called
        mock_boto3.client.assert_called_with('s3', **{})
        
        # Test download
        downloaded_path = storage.download(user_id, session_id)
        
        # Verify files were created
        assert os.path.exists(downloaded_path)
        
        # Test list_sessions
        mock_s3_client.list_objects_v2.return_value = {
            'CommonPrefixes': [
                {'Prefix': f'{user_id}/{session_id}/'}
            ]
        }
        sessions = storage.list_sessions(user_id)
        assert session_id in sessions
        
        # Test delete_session
        mock_s3_client.list_objects_v2.return_value = {
            'Contents': [
                {'Key': f'{user_id}/{session_id}/test.txt'}
            ]
        }
        storage.delete_session(user_id, session_id)
        mock_s3_client.delete_objects.assert_called_once()
    
    # Clean up temp files
    shutil.rmtree(dummy_session_dir, ignore_errors=True)
    shutil.rmtree(downloaded_path, ignore_errors=True)


def test_s3_storage_empty_mock():
    """Test S3 storage with empty sessions using mocks."""
    # Create a mock of S3 client
    mock_s3_client = MagicMock()
    mock_boto3 = MagicMock()
    mock_boto3.client.return_value = mock_s3_client
    mock_botocore = MagicMock()
    
    # Return empty list for list_objects_v2
    mock_s3_client.list_objects_v2.return_value = {}
    
    # Use patches to ensure all imports are caught
    with patch.dict('sys.modules', {'boto3': mock_boto3, 'botocore': mock_botocore}), \
         patch('browserstate.utils.dynamic_import.boto3', mock_boto3), \
         patch('browserstate.utils.dynamic_import.botocore', mock_botocore), \
         patch('browserstate.storage.s3_storage.boto3', mock_boto3):
         
        # Create storage and test empty session
        storage = S3Storage(bucket_name="test-bucket")
        user_id = "s3_user"
        session_id = "nonexistent"
        
        downloaded_path = storage.download(user_id, session_id)
        assert os.path.exists(downloaded_path)
        assert not os.listdir(downloaded_path)
        shutil.rmtree(downloaded_path, ignore_errors=True)