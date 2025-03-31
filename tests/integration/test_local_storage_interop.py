"""
Integration tests for local storage interoperability between Python and TypeScript.

Tests verify that both implementations can access sessions created by the other,
focusing on directory structure and compatibility.
"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path

from python.browserstate.storage.local_storage import LocalStorage as PyLocalStorage
from .ts_storage_helper import run_ts_helper

class TestLocalStorageInterop(unittest.TestCase):
    """Test interoperability between Python and TypeScript local storage implementations."""
    
    def setUp(self):
        """Set up test environment with temporary storage directory."""
        # Create temporary directories for test files and storage
        self.temp_root_dir = tempfile.mkdtemp()
        self.storage_dir = os.path.join(self.temp_root_dir, "storage")
        os.makedirs(self.storage_dir, exist_ok=True)
        
        # Test user and session IDs
        self.user_id = "interop_test_user"
        self.py_session_id = "py_session_local"
        self.ts_session_id = "ts_session_local"
        
        # Create session directory with test files
        self.session_dir = os.path.join(self.temp_root_dir, "session")
        os.makedirs(self.session_dir, exist_ok=True)
        
        # Create test files with unique content
        with open(os.path.join(self.session_dir, "test.txt"), "w") as f:
            f.write("Local storage interoperability test data")
        
        # Create a subdirectory with files to test nested structure handling
        subdir = os.path.join(self.session_dir, "subdir")
        os.makedirs(subdir, exist_ok=True)
        with open(os.path.join(subdir, "nested.txt"), "w") as f:
            f.write("Nested file for testing directory structure")
        
        # Create Python local storage
        self.py_storage = PyLocalStorage(self.storage_dir)
    
    def tearDown(self):
        """Clean up resources after tests."""
        # Remove temporary directories
        shutil.rmtree(self.temp_root_dir, ignore_errors=True)
    
    def verify_files_exist(self, directory, expected_files):
        """Verify that expected files exist in the specified directory."""
        for file_path in expected_files:
            full_path = os.path.join(directory, file_path)
            self.assertTrue(os.path.exists(full_path), f"File {file_path} does not exist")
    
    def test_python_to_typescript_session_access(self):
        """Test if a session created by Python is accessible by TypeScript."""
        # Upload session with Python
        self.py_storage.upload(self.user_id, self.py_session_id, self.session_dir)
        
        # Verify directory structure exists
        expected_py_path = os.path.join(self.storage_dir, self.user_id, self.py_session_id)
        self.assertTrue(os.path.exists(expected_py_path))
        
        # Attempt to access with TypeScript
        result = run_ts_helper(
            "local-download", 
            self.user_id, 
            self.py_session_id,
            storage_dir=self.storage_dir
        )
        
        # Should include markers for success
        self.assertIn("SUCCESS", result)
    
    def test_typescript_to_python_session_access(self):
        """Test if a session created by TypeScript is accessible by Python."""
        # Upload session with TypeScript
        result = run_ts_helper(
            "local-upload", 
            self.user_id, 
            self.ts_session_id,
            self.session_dir,
            storage_dir=self.storage_dir
        )
        self.assertIn("SUCCESS", result)
        
        # Verify directory structure exists
        expected_ts_path = os.path.join(self.storage_dir, self.user_id, self.ts_session_id)
        self.assertTrue(os.path.exists(expected_ts_path))
        
        # Attempt to download with Python
        download_path = self.py_storage.download(self.user_id, self.ts_session_id)
        
        # Verify files were extracted correctly
        expected_files = ["test.txt", os.path.join("subdir", "nested.txt")]
        self.verify_files_exist(download_path, expected_files)
        
        # Verify content
        with open(os.path.join(download_path, "test.txt"), "r") as f:
            content = f.read()
            self.assertEqual(content, "Local storage interoperability test data")
    
    def test_directory_structure_compatibility(self):
        """Test that directory structures are compatible between implementations."""
        # Create sessions with both implementations
        self.py_storage.upload(self.user_id, self.py_session_id, self.session_dir)
        
        run_ts_helper(
            "local-upload", 
            self.user_id, 
            self.ts_session_id, 
            self.session_dir,
            storage_dir=self.storage_dir
        )
        
        # Examine directory structures
        py_path = os.path.join(self.storage_dir, self.user_id, self.py_session_id)
        ts_path = os.path.join(self.storage_dir, self.user_id, self.ts_session_id)
        
        # Both should exist with similar structure
        self.assertTrue(os.path.exists(py_path))
        self.assertTrue(os.path.exists(ts_path))
        
        # Both should have the test.txt file
        self.assertTrue(os.path.exists(os.path.join(py_path, "test.txt")))
        self.assertTrue(os.path.exists(os.path.join(ts_path, "test.txt")))
        
        # Both should have the nested directory structure
        self.assertTrue(os.path.exists(os.path.join(py_path, "subdir", "nested.txt")))
        self.assertTrue(os.path.exists(os.path.join(ts_path, "subdir", "nested.txt")))
    
    def test_list_sessions_cross_implementation(self):
        """Test listing sessions across different implementations."""
        # Create sessions with both implementations
        self.py_storage.upload(self.user_id, self.py_session_id, self.session_dir)
        
        run_ts_helper(
            "local-upload", 
            self.user_id, 
            self.ts_session_id, 
            self.session_dir,
            storage_dir=self.storage_dir
        )
        
        # List sessions with Python
        py_sessions = self.py_storage.list_sessions(self.user_id)
        
        # Python should see both sessions
        self.assertIn(self.py_session_id, py_sessions)
        self.assertIn(self.ts_session_id, py_sessions)
        
        # List sessions with TypeScript
        result = run_ts_helper(
            "local-list", 
            self.user_id, 
            "dummy",
            storage_dir=self.storage_dir
        )
        
        # TypeScript should see both sessions
        self.assertIn(self.py_session_id, result)
        self.assertIn(self.ts_session_id, result)
    
    def test_deletion_cross_implementation(self):
        """Test session deletion across implementations."""
        # Create sessions with both implementations
        self.py_storage.upload(self.user_id, self.py_session_id, self.session_dir)
        
        run_ts_helper(
            "local-upload", 
            self.user_id, 
            self.ts_session_id, 
            self.session_dir,
            storage_dir=self.storage_dir
        )
        
        # Delete TypeScript session with Python
        self.py_storage.delete_session(self.user_id, self.ts_session_id)
        
        # Verify it's gone
        ts_path = os.path.join(self.storage_dir, self.user_id, self.ts_session_id)
        self.assertFalse(os.path.exists(ts_path))
        
        # Delete Python session with TypeScript
        run_ts_helper(
            "local-delete", 
            self.user_id, 
            self.py_session_id,
            storage_dir=self.storage_dir
        )
        
        # Verify it's gone
        py_path = os.path.join(self.storage_dir, self.user_id, self.py_session_id)
        self.assertFalse(os.path.exists(py_path))

if __name__ == "__main__":
    unittest.main() 