import os
import io
import tarfile
import tempfile
import logging
from typing import List

import redis  # Requires: pip install redis

from .storage_provider import StorageProvider

class RedisStorage(StorageProvider):
    """
    Storage provider implementation that uses Redis to store browser sessions
    as compressed tar archives.
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
        self.key_prefix = key_prefix
    
    def _get_key(self, user_id: str, session_id: str) -> str:
        """
        Generate a Redis key for a given user and session.
        """
        return f"{self.key_prefix}:{user_id}:{session_id}"
    
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
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
            
        Returns:
            Path to the local directory containing the session data.
        """
        key = self._get_key(user_id, session_id)
        tar_bytes = self.redis_client.get(key)
        target_path = tempfile.mkdtemp(prefix="browserstate_")
        if tar_bytes is None:
            # No session found; return an empty directory.
            os.makedirs(target_path, exist_ok=True)
            return target_path
        
        try:
            tar_stream = io.BytesIO(tar_bytes)
            with tarfile.open(fileobj=tar_stream, mode="r:gz") as tar:
                self._safe_extract(tar, target_path)
        except Exception as e:
            logging.error(f"Error extracting session from Redis: {e}")
            raise
        
        return target_path
    
    def upload(self, user_id: str, session_id: str, file_path: str) -> None:
        """
        Compresses the session directory into a tar.gz archive and uploads it to Redis.
        
        Args:
            user_id: User identifier.
            session_id: Session identifier.
            file_path: Path to the local directory containing session data.
        """
        key = self._get_key(user_id, session_id)
        tar_stream = io.BytesIO()
        try:
            with tarfile.open(fileobj=tar_stream, mode="w:gz") as tar:
                tar.add(file_path, arcname=os.path.basename(file_path))
            tar_bytes = tar_stream.getvalue()
            self.redis_client.set(key, tar_bytes)
        except Exception as e:
            logging.error(f"Error uploading session to Redis: {e}")
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
        try:
            keys = self.redis_client.keys(pattern)
            session_ids = []
            for key in keys:
                key_str = key.decode('utf-8') if isinstance(key, bytes) else key
                parts = key_str.split(':')
                if len(parts) == 3:
                    session_ids.append(parts[2])
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
        try:
            self.redis_client.delete(key)
        except Exception as e:
            logging.error(f"Error deleting session from Redis: {e}")
            raise
