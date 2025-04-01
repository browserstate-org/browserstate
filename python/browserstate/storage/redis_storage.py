import os
import io
import zipfile
import tempfile
import shutil
import logging
import base64
import json
import time
from typing import List

import redis  # Requires: pip install redis

from .storage_provider import StorageProvider

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
            key_prefix: Prefix to use for keys in Redis.
        """
        self.redis_client = redis.Redis.from_url(redis_url)
        
        # Remove trailing colon if it exists to prevent double colons
        self.key_prefix = key_prefix.rstrip(':')
        logging.info(f"Redis storage initialized with prefix: {self.key_prefix}")
    
    def _get_key(self, user_id: str, session_id: str) -> str:
        """
        Generate a Redis key for a given user and session.
        """
        # Create key with format "prefix:userId:sessionId" (ensure no double colons)
        key = f"{self.key_prefix}:{user_id}:{session_id}"
        return key
    
    def _get_metadata_key(self, user_id: str, session_id: str) -> str:
        """
        Generate a Redis key for session metadata.
        """
        return f"{self.key_prefix}:{user_id}:{session_id}:metadata"
    
    def _get_temp_path(self, user_id: str, session_id: str) -> str:
        """
        Get a temporary path for a session.
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
            
        Returns:
            Full path to the temporary session directory.
        """
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
            
            # Extract zip file to target directory
            with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
                zip_ref.extractall(target_path)
                
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
                "version": "2.0",  # Match TypeScript version
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
        pattern = f"{self.key_prefix}:{user_id}:*"
        logging.info(f"Listing sessions with pattern: {pattern}")
        
        try:
            keys = self.redis_client.keys(pattern)
            session_ids = []
            for key in keys:
                key_str = key.decode('utf-8') if isinstance(key, bytes) else key
                parts = key_str.split(':')
                if len(parts) == 3:
                    session_ids.append(parts[2])
            
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
