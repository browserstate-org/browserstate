import os
import io
import json
import tarfile
import zipfile
import tempfile
import shutil
import logging
import base64
from typing import List, Dict, Optional, Union

import redis  # Requires: pip install redis

from .storage_provider import StorageProvider

class RedisStorage(StorageProvider):
    """
    Storage provider implementation that uses Redis to store browser sessions.
    
    Supports both TAR.GZ and ZIP formats for cross-implementation compatibility.
    Can handle sessions created by both Python and TypeScript implementations.
    """
    
    def __init__(self, 
                 redis_url: str = "redis://localhost:6379/0", 
                 key_prefix: str = "browserstate",
                 format: str = "zip"):
        """
        Initialize RedisStorage provider.
        
        Args:
            redis_url: Redis connection URL.
            key_prefix: Prefix to use for keys in Redis.
            format: Format to use for storing sessions ("tar.gz" or "zip").
                    "tar.gz" is the Python-native format
                    "zip" is the TypeScript-compatible format
        """
        if format not in ["tar.gz", "zip"]:
            raise ValueError('format must be "tar.gz" or "zip"')
        
        self.redis_client = redis.Redis.from_url(redis_url)
        self.key_prefix = key_prefix
        self.format = format
        self.logger = logging.getLogger("RedisStorage")
    
    def _get_key(self, user_id: str, session_id: str) -> str:
        """
        Generate a Redis key for a given user and session.
        """
        return f"{self.key_prefix}:{user_id}:{session_id}"
    
    def _get_metadata_key(self, user_id: str, session_id: str) -> str:
        """
        Generate a Redis key for session metadata.
        Used for TypeScript compatibility.
        """
        return f"{self.key_prefix}:{user_id}:{session_id}:metadata"
    
    def _get_temp_path(self, user_id: str, session_id: str) -> str:
        """
        Get a temporary path for a session similar to S3Storage implementation.
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
            
        Returns:
            Full path to the temporary session directory.
        """
        temp_dir = os.path.join(tempfile.gettempdir(), "browserstate", user_id)
        os.makedirs(temp_dir, exist_ok=True)
        return os.path.join(temp_dir, session_id)
    
    def _detect_format(self, data: bytes) -> str:
        """
        Detect the format of the stored data.
        
        Args:
            data: Raw bytes from Redis
            
        Returns:
            "tar.gz", "zip", or "unknown"
        """
        # Check for gzip magic bytes (first 2 bytes are 0x1F8B)
        if data[:2] == b'\x1f\x8b':
            return "tar.gz"
        
        # Check if it might be base64-encoded ZIP
        try:
            decoded = base64.b64decode(data)
            if decoded[:4] == b'PK\x03\x04':  # ZIP magic bytes
                return "zip"
        except:
            pass
        
        # Try directly checking for ZIP magic bytes
        if data[:4] == b'PK\x03\x04':
            return "zip"
            
        return "unknown"
    
    def _safe_extract(self, tar_obj: tarfile.TarFile, path: str) -> None:
        """
        Safely extract tar file to prevent path traversal vulnerabilities.
        """
        def is_within_directory(directory: str, target: str) -> bool:
            abs_directory = os.path.abspath(directory)
            abs_target = os.path.abspath(target)
            return os.path.commonprefix([abs_directory, abs_target]) == abs_directory
        
        for member in tar_obj.getmembers():
            member_path = os.path.join(path, member.name)
            if not is_within_directory(path, member_path):
                raise Exception("Attempted Path Traversal in Tar File")
        tar_obj.extractall(path)
    
    def download(self, user_id: str, session_id: str) -> str:
        """
        Downloads a browser session from Redis, decompresses it, and writes it
        to a local temporary directory.
        
        Automatically detects and handles both TAR.GZ and ZIP formats for
        compatibility with TypeScript implementation.
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
            
        Returns:
            Path to the local directory containing the session data.
        """
        session_key = self._get_key(user_id, session_id)
        metadata_key = self._get_metadata_key(user_id, session_id)
        
        # Get session data
        session_data = self.redis_client.get(session_key)
        metadata_data = self.redis_client.get(metadata_key)
        
        target_path = self._get_temp_path(user_id, session_id)
        
        if os.path.exists(target_path):
            shutil.rmtree(target_path)
        os.makedirs(target_path, exist_ok=True)
        
        if session_data is None:
            # No session found; return an empty directory.
            return target_path
        
        # Parse metadata if available
        metadata = None
        if metadata_data:
            try:
                metadata = json.loads(metadata_data)
                self.logger.debug(f"Found metadata for session {session_id}: {metadata}")
            except json.JSONDecodeError:
                self.logger.warning(f"Failed to parse metadata for session {session_id}")
        
        # Detect format
        format_type = self._detect_format(session_data)
        self.logger.debug(f"Detected format for session {session_id}: {format_type}")
        
        try:
            if format_type == "tar.gz":
                # Handle TAR.GZ format (Python style)
                tar_stream = io.BytesIO(session_data)
                with tarfile.open(fileobj=tar_stream, mode="r:gz") as tar:
                    self._safe_extract(tar, target_path)
            
            elif format_type == "zip":
                # Handle ZIP format (TypeScript style)
                # First try to handle as base64-encoded ZIP
                try:
                    zip_data = base64.b64decode(session_data)
                except:
                    # If not base64, use raw data
                    zip_data = session_data
                    
                zip_path = os.path.join(tempfile.gettempdir(), f"{user_id}_{session_id}_{os.urandom(4).hex()}.zip")
                
                try:
                    # Write the zip data to a file
                    with open(zip_path, "wb") as f:
                        f.write(zip_data)
                    
                    # Extract the zip
                    with zipfile.ZipFile(zip_path, "r") as zip_ref:
                        zip_ref.extractall(target_path)
                finally:
                    # Clean up temporary zip file
                    if os.path.exists(zip_path):
                        os.remove(zip_path)
            
            else:
                raise Exception(f"Unknown format: {format_type}")
                
        except Exception as e:
            self.logger.error(f"Error extracting session from Redis: {e}")
            raise
        
        return target_path
    
    def upload(self, user_id: str, session_id: str, file_path: str) -> None:
        """
        Compresses the session directory and uploads it to Redis.
        
        Can use either TAR.GZ (Python-native) or ZIP (TypeScript-compatible) format
        based on the 'format' parameter passed to the constructor.
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
            file_path: Path to the local directory containing session data.
        """
        session_key = self._get_key(user_id, session_id)
        metadata_key = self._get_metadata_key(user_id, session_id)
        
        try:
            if self.format == "tar.gz":
                # Python-style TAR.GZ format
                tar_stream = io.BytesIO()
                with tarfile.open(fileobj=tar_stream, mode="w:gz") as tar:
                    tar.add(file_path, arcname=os.path.basename(file_path))
                
                session_data = tar_stream.getvalue()
                
                # Store the data (no separate metadata)
                self.redis_client.set(session_key, session_data)
                
            else:  # ZIP format
                # TypeScript-style ZIP format with metadata
                zip_path = os.path.join(tempfile.gettempdir(), f"{user_id}_{session_id}_{os.urandom(4).hex()}.zip")
                
                try:
                    # Create ZIP archive
                    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_ref:
                        for root, dirs, files in os.walk(file_path):
                            for file in files:
                                file_path_full = os.path.join(root, file)
                                arc_name = os.path.relpath(file_path_full, file_path)
                                zip_ref.write(file_path_full, arcname=arc_name)
                    
                    # Read as base64
                    with open(zip_path, "rb") as f:
                        zip_data = base64.b64encode(f.read()).decode('utf-8')
                    
                    # Create metadata like TypeScript version
                    metadata = {
                        "timestamp": int(os.path.getmtime(file_path) * 1000),  # Convert to JS timestamp
                        "fileCount": sum(len(files) for _, _, files in os.walk(file_path)),
                        "version": "2.0"  # Version from TypeScript implementation
                    }
                    
                    # Store both data and metadata
                    self.redis_client.set(session_key, zip_data)
                    self.redis_client.set(metadata_key, json.dumps(metadata))
                
                finally:
                    # Clean up
                    if os.path.exists(zip_path):
                        os.remove(zip_path)
        
        except Exception as e:
            self.logger.error(f"Error uploading session to Redis: {e}")
            raise
    
    def list_sessions(self, user_id: str) -> List[str]:
        """
        Lists all available sessions for a user from Redis.
        
        Handles sessions created by both Python and TypeScript implementations.
        
        Args:
            user_id: User identifier.
            
        Returns:
            List of session identifiers.
        """
        pattern = f"{self.key_prefix}:{user_id}:*"
        
        try:
            keys = self.redis_client.keys(pattern)
            session_ids = set()
            
            for key in keys:
                key_str = key.decode('utf-8') if isinstance(key, bytes) else key
                parts = key_str.split(':')
                
                # Skip metadata keys
                if len(parts) > 3 and parts[3] == "metadata":
                    continue
                    
                if len(parts) == 3:
                    session_ids.add(parts[2])
            
            return list(session_ids)
            
        except Exception as e:
            self.logger.error(f"Error listing sessions in Redis: {e}")
            return []
    
    def delete_session(self, user_id: str, session_id: str) -> None:
        """
        Deletes a browser session from Redis.
        
        Deletes both the session data and metadata for TypeScript compatibility.
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
        """
        session_key = self._get_key(user_id, session_id)
        metadata_key = self._get_metadata_key(user_id, session_id)
        
        try:
            # Delete both the session data and metadata
            self.redis_client.delete(session_key)
            self.redis_client.delete(metadata_key)
        except Exception as e:
            self.logger.error(f"Error deleting session from Redis: {e}")
            raise
