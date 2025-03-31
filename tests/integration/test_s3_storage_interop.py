"""
Integration tests for S3 storage interoperability between Python and TypeScript.

Tests verify that both implementations can access sessions created by the other,
focusing on path handling differences and compatibility fixes.
"""

import os
import json
import shutil
import tempfile
import unittest
import boto3
from moto import mock_aws

from python.browserstate.storage.s3_storage import S3Storage as PyS3Storage
from .ts_storage_helper import run_ts_helper

class TestS3StorageInterop(unittest.TestCase):
    """Test interoperability between Python and TypeScript S3 storage implementations."""
    
    @mock_aws
    def setUp(self):
        """Set up test environment with mocked S3 service."""
        # S3 connection
        self.region = "us-east-1"
        self.bucket_name = "browserstate-interop-test"
        self.s3_client = boto3.client("s3", region_name=self.region)
        self.s3_client.create_bucket(Bucket=self.bucket_name)
        
        # Test user and session IDs
        self.user_id = "interop_test_user"
        self.py_session_id = "py_session_s3"
        self.ts_session_id = "ts_session_s3"
        
        # Create temporary directory for test files
        self.temp_dir = tempfile.mkdtemp()
        self.session_dir = os.path.join(self.temp_dir, "session")
        os.makedirs(self.session_dir, exist_ok=True)
        
        # Create test files with unique content
        with open(os.path.join(self.session_dir, "test.txt"), "w") as f:
            f.write("S3 interoperability test data")
        
        # Create a subdirectory with files to test nested structure handling
        subdir = os.path.join(self.session_dir, "subdir")
        os.makedirs(subdir, exist_ok=True)
        with open(os.path.join(subdir, "nested.txt"), "w") as f:
            f.write("Nested file for testing directory structure")
        
        # Create Python S3 storage
        self.py_storage = PyS3Storage(
            bucket_name=self.bucket_name,
            region_name=self.region,
            prefix="py-test"
        )
    
    def tearDown(self):
        """Clean up resources after tests."""
        # Remove temporary directory
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    @mock_aws
    def test_python_to_typescript_session_access(self):
        """Test if a session created by Python is accessible by TypeScript."""
        # Upload session with Python
        self.py_storage.upload(self.user_id, self.py_session_id, self.session_dir)
        
        # Verify files exist in S3
        result = self.s3_client.list_objects_v2(
            Bucket=self.bucket_name,
            Prefix=f"py-test/{self.user_id}/{self.py_session_id}/"
        )
        self.assertTrue(len(result.get("Contents", [])) > 0)
        
        # Attempt to access with TypeScript
        result = run_ts_helper(
            "s3-download", 
            self.user_id, 
            self.py_session_id,
            bucket=self.bucket_name,
            region=self.region,
            prefix="py-test"
        )
        
        # Should include markers for success
        self.assertIn("SUCCESS", result)
    
    @mock_aws
    def test_typescript_to_python_session_access(self):
        """Test if a session created by TypeScript is accessible by Python."""
        # Upload session with TypeScript
        result = run_ts_helper(
            "s3-upload", 
            self.user_id, 
            self.ts_session_id,
            self.session_dir,
            bucket=self.bucket_name,
            region=self.region,
            prefix="ts-test"
        )
        self.assertIn("SUCCESS", result)
        
        # Verify files exist in S3
        result = self.s3_client.list_objects_v2(
            Bucket=self.bucket_name,
            Prefix=f"ts-test/{self.user_id}/{self.ts_session_id}/"
        )
        self.assertTrue(len(result.get("Contents", [])) > 0)
        
        # Create Python S3 storage with TypeScript prefix
        ts_compatible_storage = PyS3Storage(
            bucket_name=self.bucket_name,
            region_name=self.region,
            prefix="ts-test"
        )
        
        # Attempt to download with Python
        try:
            download_path = ts_compatible_storage.download(self.user_id, self.ts_session_id)
            self.assertTrue(os.path.exists(os.path.join(download_path, "test.txt")))
            self.assertTrue(os.path.exists(os.path.join(download_path, "subdir", "nested.txt")))
        except Exception as e:
            self.fail(f"Python should be able to access TypeScript session: {e}")
    
    @mock_aws
    def test_path_structure_compatibility(self):
        """Test that path structures are compatible between implementations."""
        # Create sessions with both implementations
        # Python version
        self.py_storage.upload(self.user_id, self.py_session_id, self.session_dir)
        
        # TypeScript version
        run_ts_helper(
            "s3-upload", 
            self.user_id, 
            self.ts_session_id, 
            self.session_dir,
            bucket=self.bucket_name,
            region=self.region,
            prefix="test-prefix"
        )
        
        # List all objects in bucket to examine paths
        all_objects = self.s3_client.list_objects_v2(Bucket=self.bucket_name)
        
        # Get all key paths and print them for debugging
        paths = [obj["Key"] for obj in all_objects.get("Contents", [])]
        
        # Basic verification of both style paths existing
        py_path_found = any(f"py-test/{self.user_id}/{self.py_session_id}/" in path for path in paths)
        ts_path_found = any(f"test-prefix/{self.user_id}/{self.ts_session_id}/" in path for path in paths)
        
        self.assertTrue(py_path_found, "Python-created path not found")
        self.assertTrue(ts_path_found, "TypeScript-created path not found")
    
    @mock_aws
    def test_list_sessions_cross_implementation(self):
        """Test listing sessions across different implementations."""
        # Create sessions with both implementations
        self.py_storage.upload(self.user_id, self.py_session_id, self.session_dir)
        
        run_ts_helper(
            "s3-upload", 
            self.user_id, 
            self.ts_session_id, 
            self.session_dir,
            bucket=self.bucket_name,
            region=self.region,
            prefix="py-test"  # Use same prefix as Python
        )
        
        # List sessions with Python
        py_sessions = self.py_storage.list_sessions(self.user_id)
        
        # Python should see both sessions
        self.assertIn(self.py_session_id, py_sessions)
        self.assertIn(self.ts_session_id, py_sessions)
        
        # List sessions with TypeScript
        result = run_ts_helper(
            "s3-list", 
            self.user_id, 
            "dummy",
            bucket=self.bucket_name,
            region=self.region,
            prefix="py-test"
        )
        
        # TypeScript should see both sessions
        self.assertIn(self.py_session_id, result)
        self.assertIn(self.ts_session_id, result)
    
    @mock_aws
    def test_deletion_cross_implementation(self):
        """Test session deletion across implementations."""
        # Create sessions
        self.py_storage.upload(self.user_id, self.py_session_id, self.session_dir)
        
        run_ts_helper(
            "s3-upload", 
            self.user_id, 
            self.ts_session_id, 
            self.session_dir,
            bucket=self.bucket_name,
            region=self.region,
            prefix="py-test"
        )
        
        # Delete TypeScript session with Python
        self.py_storage.delete_session(self.user_id, self.ts_session_id)
        
        # Verify it's gone
        result = self.s3_client.list_objects_v2(
            Bucket=self.bucket_name,
            Prefix=f"py-test/{self.user_id}/{self.ts_session_id}/"
        )
        self.assertFalse("Contents" in result)
        
        # Delete Python session with TypeScript
        run_ts_helper(
            "s3-delete", 
            self.user_id, 
            self.py_session_id,
            bucket=self.bucket_name,
            region=self.region,
            prefix="py-test"
        )
        
        # Verify it's gone
        result = self.s3_client.list_objects_v2(
            Bucket=self.bucket_name,
            Prefix=f"py-test/{self.user_id}/{self.py_session_id}/"
        )
        self.assertFalse("Contents" in result)

if __name__ == "__main__":
    unittest.main() 