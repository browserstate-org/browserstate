import os
import shutil
from pathlib import Path
from typing import List, Optional
import tempfile
import asyncio

from .storage_provider import StorageProvider

class LocalStorage(StorageProvider):
    """
    Storage provider implementation that uses the local file system.
    """
    
    def __init__(self, storage_path: Optional[str] = None):
        """
        Initialize a LocalStorage provider.
        
        Args:
            storage_path: Path where browser profiles will be stored. Defaults to ~/.browserstate
        """
        self.base_path = storage_path or os.path.join(os.path.expanduser("~"), ".browserstate")
        # Ensure base directory exists
        os.makedirs(self.base_path, exist_ok=True)
    
    def _get_user_path(self, user_id: str) -> str:
        """
        Get path for a specific user's data.
        
        Args:
            user_id: User identifier
            
        Returns:
            Full path to the user's data directory
        """
        user_path = os.path.join(self.base_path, user_id)
        os.makedirs(user_path, exist_ok=True)
        return user_path
    
    def _get_session_path(self, user_id: str, session_id: str) -> str:
        """
        Get path for a specific session.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            
        Returns:
            Full path to the session directory
        """
        return os.path.join(self._get_user_path(user_id), session_id)
    
    def _get_temp_path(self, user_id: str, session_id: str) -> str:
        """
        Get a temporary path for a session.

        Args:
            user_id: User identifier
            session_id: Session identifier

        Returns:
            Full path to the temporary session directory
        """
        
        temp_dir = os.path.join(tempfile.gettempdir(), "browserstate", user_id)
        os.makedirs(temp_dir, exist_ok=True)
        return os.path.join(temp_dir, session_id)
    
    async def download(self, user_id: str, session_id: str) -> str:
        """
        Downloads a browser session to local temp directory.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            
        Returns:
            Path to the local directory containing the session data
        """
        session_path = self._get_session_path(user_id, session_id)
        target_path = self._get_temp_path(user_id, session_id)
        
        # Check if session exists
        if os.path.exists(session_path):
            # Clear target directory if it already exists
            if os.path.exists(target_path):
                shutil.rmtree(target_path)
            
            # Create target directory
            os.makedirs(target_path, exist_ok=True)
            
            # Run copy in executor to avoid blocking
            await asyncio.get_event_loop().run_in_executor(
                None,
                shutil.copytree,
                session_path,
                target_path,
                True  # dirs_exist_ok
            )
        else:
            # Create an empty directory for new sessions
            os.makedirs(target_path, exist_ok=True)
        
        return target_path
    
    async def upload(self, user_id: str, session_id: str, file_path: str) -> None:
        """
        Uploads browser session files from temp to storage.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            file_path: Path to the local directory containing session data
        """
        session_path = self._get_session_path(user_id, session_id)
        
        # Ensure session directory exists
        os.makedirs(session_path, exist_ok=True)
        
        # Run copy in executor to avoid blocking
        await asyncio.get_event_loop().run_in_executor(
            None,
            shutil.copytree,
            file_path,
            session_path,
            True  # dirs_exist_ok
        )
    
    async def list_sessions(self, user_id: str) -> List[str]:
        """
        Lists all available sessions for a user.
        
        Args:
            user_id: User identifier
            
        Returns:
            List of session identifiers
        """
        user_path = self._get_user_path(user_id)
        
        try:
            # Run scandir in executor to avoid blocking
            entries = await asyncio.get_event_loop().run_in_executor(
                None,
                os.scandir,
                user_path
            )
            return [entry.name for entry in entries if entry.is_dir()]
        except OSError:
            # Directory does not exist, return empty array
            return []
    
    async def delete_session(self, user_id: str, session_id: str) -> None:
        """
        Deletes a session.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
        """
        session_path = self._get_session_path(user_id, session_id)
        
        if os.path.exists(session_path):
            # Run rmtree in executor to avoid blocking
            await asyncio.get_event_loop().run_in_executor(
                None,
                shutil.rmtree,
                session_path
            ) 