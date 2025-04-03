import os
import io
import zipfile
import tempfile
import shutil
import logging
import base64
import json
import time
import pathlib
from typing import List

import redis  # Requires: pip install redis

from .storage_provider import StorageProvider

def is_zipfile_safe(zip_file_path: str, target_path: str) -> bool:
    """
    Check if a ZIP file is safe to extract (no directory traversal attacks).
    
    Args:
        zip_file_path: Path to the ZIP file
        target_path: Target extraction directory
        
    Returns:
        True if the ZIP file is safe, False otherwise
    """
    target_path = os.path.normpath(os.path.abspath(target_path))
    
    with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
        for zip_info in zip_ref.infolist():
            # Skip directories
            if zip_info.filename.endswith('/'):
                continue
                
            # Resolve the complete path
            extracted_path = os.path.normpath(os.path.join(target_path, zip_info.filename))
            
            # Check if path would escape the target directory
            if not extracted_path.startswith(target_path):
                return False
    
    return True

def safe_extract_zip(zip_file_path: str, target_path: str) -> None:
    """
    Safely extract a ZIP file, preventing directory traversal attacks.
    
    Args:
        zip_file_path: Path to the ZIP file
        target_path: Target extraction directory
        
    Raises:
        ValueError: If the ZIP file contains unsafe entries
    """
    # Check if ZIP is safe
    if not is_zipfile_safe(zip_file_path, target_path):
        raise ValueError("Security risk: ZIP file contains entries that would extract outside target directory")
    
    # Extract the ZIP file
    with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
        zip_ref.extractall(target_path)

class RedisStorage(StorageProvider):
    """
    Storage provider implementation that uses Redis to store browser sessions
    as compressed ZIP archives to match the TypeScript implementation.
    """
    
    def __init__(self, 
                 redis_url: str = "redis://localhost:6379/0", 
                 key_prefix: str = "browserstate"):
        """
        Initialize RedisStorage provider.
        
        Args:
            redis_url: Redis connection URL.
            key_prefix: Prefix to use for keys in Redis. Must not contain colons.
        """
        # Validate key_prefix format
        if ":" in key_prefix:
            raise ValueError("key_prefix must not contain colons (:). The implementation automatically builds Redis keys in the format: {prefix}:{userId}:{sessionId}")
            
        self.redis_client = redis.Redis.from_url(redis_url)
        self.key_prefix = key_prefix
        logging.info(f"Redis storage initialized with prefix: {self.key_prefix}")
    
    def _get_key(self, user_id: str, session_id: str) -> str:
        """Generate a Redis key for a given user and session."""
        # Validate that user_id and session_id don't contain colons
        if ":" in user_id:
            raise ValueError("user_id must not contain colons (:)")
        if ":" in session_id:
            raise ValueError("session_id must not contain colons (:)")
        return f"{self.key_prefix}:{user_id}:{session_id}"
    
    def _get_metadata_key(self, user_id: str, session_id: str) -> str:
        """Generate a Redis key for session metadata."""
        # Reuse validation from _get_key
        self._get_key(user_id, session_id)
        return f"{self.key_prefix}:{user_id}:{session_id}:metadata"
    
    def _get_temp_path(self, user_id: str, session_id: str) -> str:
        """Get a temporary path for a session."""
        temp_dir = os.path.join(tempfile.gettempdir(), "browserstate", user_id)
        os.makedirs(temp_dir, exist_ok=True)
        return os.path.join(temp_dir, session_id)
    
    def download(self, user_id: str, session_id: str) -> str:
        """
        Downloads a browser session from Redis, extracts the ZIP archive, and writes it
        to a local temporary directory.
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
            
        Returns:
            Path to the local directory containing the session data.
        """
        key = self._get_key(user_id, session_id)
        metadata_key = self._get_metadata_key(user_id, session_id)
        
        logging.info(f"Looking up session data at Redis key: {key}")
        
        # Get base64-encoded zip data from Redis
        zip_data_base64 = self.redis_client.get(key)
        
        target_path = self._get_temp_path(user_id, session_id)
        
        if os.path.exists(target_path):
            shutil.rmtree(target_path)
        os.makedirs(target_path, exist_ok=True)
        
        if zip_data_base64 is None:
            # No session found; return an empty directory.
            logging.info(f"No session found at key: {key}")
            return target_path
        
        try:
            # Decode base64 data
            logging.info(f"Found session data of size: {len(zip_data_base64)} bytes")
            zip_data = base64.b64decode(zip_data_base64)
            logging.info(f"Decoded base64 data of size: {len(zip_data)} bytes")
            
            # Create temporary zip file
            zip_file_path = os.path.join(
                tempfile.gettempdir(),
                f"{user_id}-{session_id}-{os.getpid()}.zip"
            )
            
            # Write zip data to temporary file
            with open(zip_file_path, 'wb') as f:
                f.write(zip_data)
            
            logging.info(f"Extracting ZIP file to: {target_path}")
            
            # Safely extract zip file to target directory
            safe_extract_zip(zip_file_path, target_path)
                
            # Clean up temporary zip file
            os.remove(zip_file_path)
            
            logging.info(f"Extracted session data to {target_path}")
            
        except Exception as e:
            logging.error(f"Error extracting session from Redis: {e}")
            raise
        
        return target_path
    
    def upload(self, user_id: str, session_id: str, file_path: str) -> None:
        """
        Compresses the session directory into a ZIP archive and uploads it to Redis.
        Uses base64 encoding to match TypeScript implementation.
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
            file_path: Path to the local directory containing session data.
        """
        key = self._get_key(user_id, session_id)
        metadata_key = self._get_metadata_key(user_id, session_id)
        
        logging.info(f"Uploading session to Redis key: {key}")
        
        # Create temporary zip file
        zip_file_path = os.path.join(
            tempfile.gettempdir(),
            f"{user_id}-{session_id}-{os.getpid()}.zip"
        )
        
        try:
            # Create ZIP archive with maximum compression
            with zipfile.ZipFile(zip_file_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
                for root, dirs, files in os.walk(file_path):
                    for file in files:
                        file_path_full = os.path.join(root, file)
                        try:
                            arcname = os.path.relpath(file_path_full, file_path)
                            zipf.write(file_path_full, arcname)
                        except Exception as e:
                            logging.warning(f"Error adding file to ZIP: {file_path_full} - {e}")
            
            # Read zip file as binary
            with open(zip_file_path, 'rb') as f:
                zip_bytes = f.read()
            
            # Get file size for logging
            zip_size = os.path.getsize(zip_file_path)
            logging.info(f"Created ZIP archive of size: {zip_size} bytes")
            
            # Convert to base64 for Redis storage (matching TypeScript implementation)
            zip_base64 = base64.b64encode(zip_bytes)
            logging.info(f"Base64 encoded data size: {len(zip_base64)} bytes")
            
            # Store in Redis
            self.redis_client.set(key, zip_base64)
            
            # Create metadata (matching TypeScript metadata format)
            metadata = {
                "timestamp": time.time() * 1000,  # Current time in milliseconds
                "version": "2.0",
                "encrypted": False,  # Prepare for future encryption support
            }
            
            # Store metadata in Redis
            self.redis_client.set(metadata_key, json.dumps(metadata))
            
            # Clean up temporary zip file
            os.remove(zip_file_path)
            
            logging.info(f"Successfully uploaded session {session_id} to Redis at key: {key}")
            
        except Exception as e:
            logging.error(f"Error uploading session to Redis: {e}")
            
            # Clean up temporary zip file if it exists
            if os.path.exists(zip_file_path):
                os.remove(zip_file_path)
                
            raise
    
    def list_sessions(self, user_id: str) -> List[str]:
        """
        Lists all available sessions for a user from Redis.
        
        Args:
            user_id: User identifier.
            
        Returns:
            List of session identifiers.
        """
        # Validate user_id
        if ":" in user_id:
            raise ValueError("user_id must not contain colons (:)")
            
        pattern = f"{self.key_prefix}:{user_id}:*"
        logging.info(f"Listing sessions with pattern: {pattern}")
        
        try:
            keys = self.redis_client.keys(pattern)
            session_ids = []
            prefix_len = len(f"{self.key_prefix}:{user_id}:")
            
            for key in keys:
                key_str = key.decode('utf-8') if isinstance(key, bytes) else key
                # Extract sessionId from key
                remaining = key_str[prefix_len:]
                
                # Only process keys without additional colons (to exclude metadata)
                if ":" not in remaining and remaining not in session_ids:
                    session_ids.append(remaining)
            
            logging.info(f"Found {len(session_ids)} sessions for user {user_id}")
            return session_ids
        except Exception as e:
            logging.error(f"Error listing sessions in Redis: {e}")
            return []
    
    def delete_session(self, user_id: str, session_id: str) -> None:
        """
        Deletes a browser session from Redis.
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
        """
        key = self._get_key(user_id, session_id)
        metadata_key = self._get_metadata_key(user_id, session_id)
        logging.info(f"Deleting session at keys: {key}, {metadata_key}")
        
        try:
            # Delete both session data and metadata
            self.redis_client.delete(key, metadata_key)
            logging.info(f"Successfully deleted session {session_id}")
        except Exception as e:
            logging.error(f"Error deleting session from Redis: {e}")
            raise
