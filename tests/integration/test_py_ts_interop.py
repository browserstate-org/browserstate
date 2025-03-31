"""
Integration tests for Python-TypeScript interoperability.

These tests verify that sessions created by one implementation can be accessed by the other,
ensuring full compatibility between the two codebases.
"""

import os
import json
import shutil
import tempfile
import subprocess
import unittest
from pathlib import Path

import redis

# Import implementations
from python.browserstate.storage.redis_storage import RedisStorage as PyRedisStorage
# Use relative import for the compatible_redis_storage module
from .compatible_redis_storage import CompatibleRedisStorage

class TestPythonTypeScriptInterop(unittest.TestCase):
    """
    Test interoperability between Python and TypeScript implementations.
    These tests create sessions in one language and verify they can be read by the other.
    """
    
    def setUp(self):
        """Set up test environment with Redis client and temporary directories."""
        # Redis connection
        self.redis_url = "redis://localhost:6379/0"
        self.redis_client = redis.Redis.from_url(self.redis_url)
        self.key_prefix = "browserstate_interop_test"
        
        # Clean up any leftover keys from previous test runs
        for key in self.redis_client.keys(f"{self.key_prefix}:*"):
            self.redis_client.delete(key)
            
        # Test user and session IDs
        self.user_id = "interop_test_user"
        self.session_id_py = "py_session"
        self.session_id_ts = "ts_session"
        
        # Create temporary directory for test files
        self.temp_dir = tempfile.mkdtemp()
        self.session_dir = os.path.join(self.temp_dir, "session")
        os.makedirs(self.session_dir, exist_ok=True)
        
        # Create test files
        with open(os.path.join(self.session_dir, "test.txt"), "w") as f:
            f.write("Interoperability test data")
        
        # Create a subdirectory with files to test nested structure handling
        subdir = os.path.join(self.session_dir, "subdir")
        os.makedirs(subdir, exist_ok=True)
        with open(os.path.join(subdir, "nested.txt"), "w") as f:
            f.write("Nested file for testing directory structure")
            
        # Create storage instances
        self.py_storage = PyRedisStorage(redis_url=self.redis_url, key_prefix=self.key_prefix)
        self.compatible_storage = CompatibleRedisStorage(
            redis_url=self.redis_url, 
            key_prefix=self.key_prefix,
            preferred_format="zip"  # Use TypeScript-compatible format
        )
        
        # Store the TypeScript helper script path
        self.ts_script_path = os.path.join(Path(__file__).parent, "ts_redis_helper.js")
    
    def tearDown(self):
        """Clean up resources after tests."""
        # Clean Redis
        for key in self.redis_client.keys(f"{self.key_prefix}:*"):
            self.redis_client.delete(key)
            
        # Remove temporary directory
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_python_to_typescript_session_access(self):
        """Test if a session created by Python is accessible by TypeScript."""
        # Create a session using the compatible implementation (ZIP format)
        self.compatible_storage.upload(self.user_id, self.session_id_py, self.session_dir)
        
        # Check that it was stored in Redis
        session_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_py}"
        metadata_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_py}:metadata"
        
        self.assertIsNotNone(self.redis_client.get(session_key))
        self.assertIsNotNone(self.redis_client.get(metadata_key))
        
        # Run TypeScript helper to see if it can access the session
        result = self._run_ts_helper("download", self.user_id, self.session_id_py)
        self.assertIn("SUCCESS", result)
    
    def test_typescript_to_python_session_access(self):
        """Test if a session created by TypeScript is accessible by Python."""
        # Create a session using the TypeScript helper
        result = self._run_ts_helper("upload", self.user_id, self.session_id_ts, self.session_dir)
        self.assertIn("SUCCESS", result)
        
        # Verify session exists in Redis
        session_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_ts}"
        metadata_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_ts}:metadata"
        
        self.assertIsNotNone(self.redis_client.get(session_key))
        self.assertIsNotNone(self.redis_client.get(metadata_key))
        
        # Try to download with the compatible storage
        download_path = self.compatible_storage.download(self.user_id, self.session_id_ts)
        
        # Verify files were extracted correctly
        self.assertTrue(os.path.exists(os.path.join(download_path, "test.txt")))
        self.assertTrue(os.path.exists(os.path.join(download_path, "subdir", "nested.txt")))
        
        # Verify content
        with open(os.path.join(download_path, "test.txt"), "r") as f:
            content = f.read()
            self.assertEqual(content, "Interoperability test data")
    
    def test_typescript_deletion_from_python(self):
        """Test if a session created by TypeScript can be deleted by Python."""
        # Create a session using TypeScript
        result = self._run_ts_helper("upload", self.user_id, self.session_id_ts, self.session_dir)
        self.assertIn("SUCCESS", result)
        
        # Verify it exists
        session_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_ts}"
        self.assertIsNotNone(self.redis_client.get(session_key))
        
        # Delete using Python
        self.compatible_storage.delete_session(self.user_id, self.session_id_ts)
        
        # Verify deletion
        self.assertIsNone(self.redis_client.get(session_key))
        
        # Verify TypeScript also sees it as deleted
        result = self._run_ts_helper("download", self.user_id, self.session_id_ts)
        self.assertIn("ERROR", result)
    
    def test_python_deletion_from_typescript(self):
        """Test if a session created by Python can be deleted by TypeScript."""
        # Create a session using Python
        self.compatible_storage.upload(self.user_id, self.session_id_py, self.session_dir)
        
        # Verify it exists
        session_key = f"{self.key_prefix}:{self.user_id}:{self.session_id_py}"
        self.assertIsNotNone(self.redis_client.get(session_key))
        
        # Delete using TypeScript
        result = self._run_ts_helper("delete", self.user_id, self.session_id_py)
        self.assertIn("SUCCESS", result)
        
        # Verify deletion
        self.assertIsNone(self.redis_client.get(session_key))
        
        # Python should also see it as deleted
        download_path = self.compatible_storage.download(self.user_id, self.session_id_py)
        # Should be an empty directory
        self.assertEqual(len(os.listdir(download_path)), 0)
    
    def test_list_sessions_cross_implementation(self):
        """Test that sessions created by both implementations are listed correctly."""
        # Create a session using Python
        self.compatible_storage.upload(self.user_id, self.session_id_py, self.session_dir)
        
        # Create a session using TypeScript
        result = self._run_ts_helper("upload", self.user_id, self.session_id_ts, self.session_dir)
        self.assertIn("SUCCESS", result)
        
        # List sessions using Python
        py_sessions = self.compatible_storage.list_sessions(self.user_id)
        
        # Both sessions should be in the list
        self.assertIn(self.session_id_py, py_sessions)
        self.assertIn(self.session_id_ts, py_sessions)
        
        # List sessions using TypeScript
        result = self._run_ts_helper("list", self.user_id, "dummy")
        
        # Both session IDs should be in the output
        self.assertIn(self.session_id_py, result)
        self.assertIn(self.session_id_ts, result)
    
    def test_python_native_with_typescript_session(self):
        """Test if the standard Python implementation can handle TypeScript sessions."""
        # Create a session using TypeScript
        result = self._run_ts_helper("upload", self.user_id, self.session_id_ts, self.session_dir)
        self.assertIn("SUCCESS", result)
        
        # Try to download with the native Python implementation (should fail)
        try:
            self.py_storage.download(self.user_id, self.session_id_ts)
            self.fail("Native Python implementation should not be able to handle TypeScript sessions")
        except Exception as e:
            # Expected to fail due to format incompatibility
            pass
    
    def _run_ts_helper(self, action, user_id, session_id, session_dir=None):
        """Run the TypeScript helper script as a subprocess."""
        cmd = ["node", self.ts_script_path, action, user_id, session_id]
        
        if session_dir:
            cmd.append(session_dir)
            
        try:
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True,
                check=True
            )
            return result.stdout
        except subprocess.CalledProcessError as e:
            return f"ERROR: {e.stderr}"

if __name__ == "__main__":
    unittest.main() 