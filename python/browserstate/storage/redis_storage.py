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
from typing import List, Dict, Any, Optional

# Import redis lazily - now just using the async version
from ..utils.dynamic_import import redis_module

from .storage_provider import StorageProvider


def is_zipfile_safe(zip_file_path: str, target_path: str) -> bool:
    target_path = os.path.normpath(os.path.abspath(target_path))

    with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
        for zip_info in zip_ref.infolist():
            # Skip directories
            if zip_info.filename.endswith("/"):
                continue

            # Resolve the complete path
            extracted_path = os.path.normpath(
                os.path.join(target_path, zip_info.filename)
            )

            # Check if path would escape the target directory using commonpath
            if os.path.commonpath([extracted_path, target_path]) != target_path:
                return False

            # Additional check using relative path
            if os.path.relpath(extracted_path, target_path).startswith(".."):
                return False

    return True


def safe_extract_zip(zip_file_path: str, target_path: str) -> None:
    # Check if ZIP is safe
    if not is_zipfile_safe(zip_file_path, target_path):
        raise ValueError(
            "Security risk: ZIP file contains entries that would extract outside target directory"
        )

    # Extract the ZIP file
    with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
        zip_ref.extractall(target_path)


class RedisStorage(StorageProvider):
    """
    Storage provider implementation that uses Redis to store browser sessions
    as compressed ZIP archives to match the TypeScript implementation.
    """

    def __init__(
        self, 
        host: str = "localhost", 
        port: int = 6379, 
        key_prefix: str = "browserstate", 
        password: Optional[str] = None, 
        db: int = 0
    ):
        """
        Initialize Redis storage
        
        Args:
            host: Redis host address
            port: Redis port number
            key_prefix: Prefix for all keys in Redis
            password: Redis password (optional)
            db: Redis database number
        """
        # Format key_prefix to be consistent
        if key_prefix.endswith(":"):
            self.key_prefix = key_prefix
        else:
            self.key_prefix = f"{key_prefix}:"
        
        # Validate key_prefix format
        if ":" in key_prefix and not key_prefix.endswith(":"):
            raise ValueError("key_prefix must not contain colons (:) except at the end")
        
        # Initialize async Redis client
        redis_url = f"redis://{host}:{port}/{db}"
        if password:
            # Format URL with password
            redis_url = f"redis://:{password}@{host}:{port}/{db}"
        
        self.redis_client = redis_module.get_module().from_url(redis_url)
        
        logging.info(f"Initialized Redis storage with prefix: {self.key_prefix}")

    def _get_key(self, user_id: str, session_id: str) -> str:
        """Generate a Redis key for a given user and session."""
        # Validate that user_id and session_id don't contain colons
        if ":" in user_id:
            raise ValueError("user_id must not contain colons (:)")
        if ":" in session_id:
            raise ValueError("session_id must not contain colons (:)")
        return f"{self.key_prefix}{user_id}:{session_id}"

    def _get_metadata_key(self, user_id: str, session_id: str) -> str:
        """Generate a Redis key for session metadata."""
        # Reuse validation from _get_key
        self._get_key(user_id, session_id)
        return f"{self.key_prefix}{user_id}:{session_id}:metadata"

    def _get_temp_path(self, user_id: str, session_id: str) -> str:
        """Get a temporary path for a session."""
        temp_dir = os.path.join(tempfile.gettempdir(), "browserstate", user_id)
        os.makedirs(temp_dir, exist_ok=True)
        return os.path.join(temp_dir, session_id)

    async def get(self, key: str) -> Optional[str]:
        """
        Get value from Redis
        
        Args:
            key: Key to get
            
        Returns:
            Value if found, None otherwise
        """
        full_key = f"{self.key_prefix}{key}"
        
        try:
            data = await self.redis_client.get(full_key)
            if not data:
                # Create temporary path for new session
                temp_path = self._get_temp_path(key[:key.find(':')], key[key.find(':')+1:])
                os.makedirs(temp_path, exist_ok=True)
                logging.info(f"No session data found for {key}, creating new directory")
                return temp_path
                
            return data.decode("utf-8") if isinstance(data, bytes) else data
        except Exception as e:
            logging.error(f"Error getting key {key} from Redis: {e}")
            return None
    
    async def set(self, key: str, value: Any) -> None:
        """
        Set value in Redis
        
        Args:
            key: Key to set
            value: Value to set (string or path to directory)
        """
        full_key = f"{self.key_prefix}{key}"
        
        try:
            if os.path.isdir(value):
                # If value is a directory path, zip it and store
                logging.info(f"Creating zip archive of session directory: {value}")
                import zipfile
                import base64
                import io
                
                # Create in-memory ZIP file
                buffer = io.BytesIO()
                with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for root, _, files in os.walk(value):
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, value)
                            zipf.write(file_path, arcname)
                
                # Get ZIP data and encode as base64
                zip_data = buffer.getvalue()
                zip_base64 = base64.b64encode(zip_data)
                
                logging.info(f"ZIP archive created: {len(zip_data)} bytes")
                logging.info(f"Uploading session {key} ({len(zip_data)} bytes)")
                
                # Store in Redis
                await self.redis_client.set(full_key, zip_base64)
                
                # Store metadata
                metadata = {
                    "timestamp": int(1000 * __import__("time").time()),  # milliseconds
                    "version": "2.0",
                    "encrypted": False
                }
                metadata_key = f"{full_key}:metadata"
                await self.redis_client.set(metadata_key, json.dumps(metadata))
                
                logging.info(f"Successfully uploaded session {key}")
            else:
                # Store value directly
                await self.redis_client.set(full_key, value)
        except Exception as e:
            logging.error(f"Error setting key {key} in Redis: {e}")
            raise
    
    async def delete(self, key: str) -> None:
        """
        Delete value from Redis
        
        Args:
            key: Key to delete
        """
        full_key = f"{self.key_prefix}{key}"
        metadata_key = f"{full_key}:metadata"
        
        try:
            await self.redis_client.delete(full_key, metadata_key)
            logging.info(f"Deleted key {key} from Redis")
        except Exception as e:
            logging.error(f"Error deleting key {key} from Redis: {e}")
    
    async def list_sessions(self, user_id: Optional[str] = None) -> List[str]:
        """
        List all available sessions
        
        Args:
            user_id: Optional user ID to filter sessions by
            
        Returns:
            List of session identifiers
        """
        try:
            # Get all keys with the prefix
            pattern = f"{self.key_prefix}*"
            if user_id:
                pattern = f"{self.key_prefix}{user_id}:*"
            
            keys = await self.redis_client.keys(pattern)
            
            # Filter out metadata keys and extract session IDs
            sessions = []
            prefix_len = len(self.key_prefix)
            
            for key in keys:
                key_str = key.decode("utf-8") if isinstance(key, bytes) else key
                
                # Skip metadata keys
                if key_str.endswith(":metadata"):
                    continue
                
                # Extract session ID
                session_id = key_str[prefix_len:]
                if ":" in session_id:  # Format: user_id:session_id
                    if user_id:
                        # If user_id is provided, extract just the session part
                        if session_id.startswith(f"{user_id}:"):
                            sessions.append(session_id.split(":", 1)[1])
                    else:
                        sessions.append(session_id)
            
            return sessions
        except Exception as e:
            logging.error(f"Error listing sessions from Redis: {e}")
            return []
    
    async def close(self) -> None:
        """Close Redis connection"""
        await self.redis_client.close()

    async def download(self, user_id: str, session_id: str) -> str:
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
        zip_data_base64 = await self.redis_client.get(key)

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
                tempfile.gettempdir(), f"{user_id}-{session_id}-{os.getpid()}.zip"
            )

            # Write zip data to temporary file
            with open(zip_file_path, "wb") as f:
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

    async def upload(self, user_id: str, session_id: str, file_path: str) -> None:
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
            tempfile.gettempdir(), f"{user_id}-{session_id}-{os.getpid()}.zip"
        )

        try:
            # Create ZIP archive with maximum compression
            with zipfile.ZipFile(
                zip_file_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9
            ) as zipf:
                for root, dirs, files in os.walk(file_path):
                    for file in files:
                        file_path_full = os.path.join(root, file)
                        try:
                            arcname = os.path.relpath(file_path_full, file_path)
                            zipf.write(file_path_full, arcname)
                        except Exception as e:
                            logging.warning(
                                f"Error adding file to ZIP: {file_path_full} - {e}"
                            )

            # Read zip file as binary
            with open(zip_file_path, "rb") as f:
                zip_bytes = f.read()

            # Get file size for logging
            zip_size = os.path.getsize(zip_file_path)
            logging.info(f"Created ZIP archive of size: {zip_size} bytes")

            # Convert to base64 for Redis storage (matching TypeScript implementation)
            zip_base64 = base64.b64encode(zip_bytes)
            logging.info(f"Base64 encoded data size: {len(zip_base64)} bytes")

            # Store in Redis
            await self.redis_client.set(key, zip_base64)

            # Create metadata (matching TypeScript metadata format)
            metadata = {
                "timestamp": time.time() * 1000,  # Current time in milliseconds
                "version": "2.0",
                "encrypted": False,  # Prepare for future encryption support
            }

            # Store metadata in Redis
            await self.redis_client.set(metadata_key, json.dumps(metadata))

            # Clean up temporary zip file
            os.remove(zip_file_path)

            logging.info(
                f"Successfully uploaded session {session_id} to Redis at key: {key}"
            )

        except Exception as e:
            logging.error(f"Error uploading session to Redis: {e}")

            # Clean up temporary zip file if it exists
            if os.path.exists(zip_file_path):
                os.remove(zip_file_path)

            raise

    async def delete_session(self, user_id: str, session_id: str) -> None:
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
            await self.redis_client.delete(key, metadata_key)
            logging.info(f"Successfully deleted session {session_id}")
        except Exception as e:
            logging.error(f"Error deleting session from Redis: {e}")
            raise
