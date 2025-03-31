import os
import json
import shutil
import tempfile
import unittest
import time

import redis

# Use a relative import for the compatible_redis_storage module
from .compatible_redis_storage import CompatibleRedisStorage

class TestCompatibleRedisStorage(unittest.TestCase):
    """Test enhanced Redis storage with cross-format compatibility."""
    
    def setUp(self):
        """Set up the test environment."""
        # Redis connection
        self.redis_url = "redis://localhost:6379/0"
        self.redis_client = redis.Redis.from_url(self.redis_url)
        self.key_prefix = "browserstate_test_compat"
        
        # Clean up any leftover keys from previous test runs
        for key in self.redis_client.keys(f"{self.key_prefix}:*"):
            self.redis_client.delete(key)
            
        # Test user and session IDs
        self.user_id = "test_compat_user"
        self.session_id_tar = "test_session_tar"
        self.session_id_zip = "test_session_zip"
        
        # Create temporary directory for test files
        self.temp_dir = tempfile.mkdtemp()
        self.session_dir = os.path.join(self.temp_dir, "session")
        os.makedirs(self.session_dir, exist_ok=True)
        
        # Create test files with unique content
        with open(os.path.join(self.session_dir, "test.txt"), "w") as f:
            f.write("Test data for compatibility testing")
        
        # Create a subdirectory with files to test nested structure handling
        subdir = os.path.join(self.session_dir, "subdir")
        os.makedirs(subdir, exist_ok=True)
        with open(os.path.join(subdir, "nested.txt"), "w") as f:
            f.write("Nested file for testing directory structure")
        
        # Create different storage providers for testing
        self.storage_tar = CompatibleRedisStorage(
            redis_url=self.redis_url,
            key_prefix=self.key_prefix,
            preferred_format="tar.gz"
        )
        
        self.storage_zip = CompatibleRedisStorage(
            redis_url=self.redis_url,
            key_prefix=self.key_prefix,
            preferred_format="zip"
        )
    
    def tearDown(self):
        """Clean up resources after tests."""
        # Clean Redis
        for key in self.redis_client.keys(f"{self.key_prefix}:*"):
            self.redis_client.delete(key)
            
        # Remove temporary directory
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def verify_files_exist(self, directory, expected_files):
        """
        Verify that expected files exist in the specified directory.
        If there's a single top-level folder, descend into it before checking.
        Returns the final directory path after any descent.
        """
        entries = os.listdir(directory)
        if len(entries) == 1:
            candidate = os.path.join(directory, entries[0])
            if os.path.isdir(candidate):
                directory = candidate

        for file_path in expected_files:
            full_path = os.path.join(directory, file_path)
            self.assertTrue(os.path.exists(full_path), f"File {file_path} does not exist")

        return directory

    def test_tar_to_zip_format_compatibility(self):
        """Test that TAR.GZ created sessions can be read by ZIP-compatible storage."""
        # Create a session using TAR.GZ format
        self.storage_tar.upload(self.user_id, self.session_id_tar, self.session_dir)
        
        # Verify key exists in Redis
        session_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_tar}"
        self.assertIsNotNone(self.redis_client.get(session_key))
        
        # Try to download with ZIP-compatible storage
        download_path = self.storage_zip.download(self.user_id, self.session_id_tar)
        
        # Verify files are correctly extracted and get the final directory path
        expected_files = ["test.txt", os.path.join("subdir", "nested.txt")]
        download_path = self.verify_files_exist(download_path, expected_files)
        
        # Verify content is preserved
        with open(os.path.join(download_path, "test.txt"), "r") as f:
            content = f.read()
            self.assertEqual(content, "Test data for compatibility testing")
    
    def test_zip_to_tar_format_compatibility(self):
        """Test that ZIP created sessions can be read by TAR.GZ-compatible storage."""
        # Create a session using ZIP format
        self.storage_zip.upload(self.user_id, self.session_id_zip, self.session_dir)
        
        # Verify key exists in Redis and metadata is created
        session_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_zip}"
        metadata_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_zip}:metadata"
        
        self.assertIsNotNone(self.redis_client.get(session_key))
        self.assertIsNotNone(self.redis_client.get(metadata_key))
        
        # Try to download with TAR.GZ-compatible storage
        download_path = self.storage_tar.download(self.user_id, self.session_id_zip)
        
        # Verify files are correctly extracted and get the final directory path
        expected_files = ["test.txt", os.path.join("subdir", "nested.txt")]
        download_path = self.verify_files_exist(download_path, expected_files)
        
        # Verify content is preserved
        with open(os.path.join(download_path, "test.txt"), "r") as f:
            content = f.read()
            self.assertEqual(content, "Test data for compatibility testing")
    
    def test_metadata_preservation(self):
        """Test that metadata is preserved across formats."""
        # Create a session with metadata (ZIP format)
        self.storage_zip.upload(self.user_id, self.session_id_zip, self.session_dir)
        
        # Verify metadata is created
        metadata_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_zip}:metadata"
        metadata_raw = self.redis_client.get(metadata_key)
        self.assertIsNotNone(metadata_raw)
        
        # Parse metadata
        metadata = json.loads(metadata_raw)
        self.assertIn("timestamp", metadata)
        self.assertIn("version", metadata)
        
        # List sessions should include this session
        sessions = self.storage_tar.list_sessions(self.user_id)
        self.assertIn(self.session_id_zip, sessions)
        
        # Delete session
        self.storage_tar.delete_session(self.user_id, self.session_id_zip)
        
        # Verify both session and metadata are deleted
        session_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_zip}"
        self.assertIsNone(self.redis_client.get(session_key))
        self.assertIsNone(self.redis_client.get(metadata_key))
    
    def test_list_sessions_across_formats(self):
        """Test that list_sessions works across different formats."""
        # Create sessions in both formats
        self.storage_tar.upload(self.user_id, self.session_id_tar, self.session_dir)
        self.storage_zip.upload(self.user_id, self.session_id_zip, self.session_dir)
        
        # List sessions using TAR.GZ storage
        tar_sessions = self.storage_tar.list_sessions(self.user_id)
        self.assertIn(self.session_id_tar, tar_sessions)
        self.assertIn(self.session_id_zip, tar_sessions)
        
        # List sessions using ZIP storage
        zip_sessions = self.storage_zip.list_sessions(self.user_id)
        self.assertIn(self.session_id_tar, zip_sessions)
        self.assertIn(self.session_id_zip, zip_sessions)
    
    def test_overwrite_session_different_format(self):
        """Test overwriting a session with a different format."""
        # Create session with TAR.GZ format
        self.storage_tar.upload(self.user_id, self.session_id_tar, self.session_dir)
        
        # Modify the session dir with new content
        with open(os.path.join(self.session_dir, "updated.txt"), "w") as f:
            f.write("Updated content")
        
        # Overwrite with ZIP format
        self.storage_zip.upload(self.user_id, self.session_id_tar, self.session_dir)
        
        # Verify we can still read it back
        download_path = self.storage_tar.download(self.user_id, self.session_id_tar)
        
        # Verify original and new files, and get the final directory path
        expected_files = ["test.txt", "updated.txt", os.path.join("subdir", "nested.txt")]
        download_path = self.verify_files_exist(download_path, expected_files)
        
        # Now both files (test.txt and updated.txt) and the subdirectory file exist
        with open(os.path.join(download_path, "updated.txt"), "r") as f:
            self.assertEqual(f.read(), "Updated content")

if __name__ == "__main__":
    unittest.main()
