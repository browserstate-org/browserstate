import os
import shutil
from pathlib import Path
from typing import List, Optional
import tempfile
import asyncio
import logging

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
        self.base_path = storage_path or os.path.join(
            os.path.expanduser("~"), ".browserstate"
        )
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
        if not user_id:
            raise ValueError("user_id cannot be empty")
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
        if not session_id:
            raise ValueError("session_id cannot be empty")
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
        if not user_id or not session_id:
            raise ValueError("user_id and session_id cannot be empty")

        temp_dir = os.path.join(tempfile.gettempdir(), "browserstate", user_id)
        os.makedirs(temp_dir, exist_ok=True)
        return os.path.join(temp_dir, session_id)

    async def _safe_rmtree(self, path: str) -> None:
        """
        Safely remove a directory tree.

        Args:
            path: Path to remove
        """
        if os.path.exists(path):
            await asyncio.get_event_loop().run_in_executor(None, shutil.rmtree, path)

    async def _safe_copytree(self, src: str, dst: str) -> None:
        """
        Safely copy a directory tree.

        Args:
            src: Source path
            dst: Destination path
        """
        # Remove destination if it exists
        await self._safe_rmtree(dst)

        # Create parent directory
        os.makedirs(os.path.dirname(dst), exist_ok=True)

        if os.path.exists(src):
            # Copy the directory tree
            await asyncio.get_event_loop().run_in_executor(
                None, lambda: shutil.copytree(src, dst, dirs_exist_ok=True)
            )
        else:
            # Create an empty directory
            os.makedirs(dst)

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

        await self._safe_copytree(session_path, target_path)
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
        await self._safe_copytree(file_path, session_path)

    async def list_sessions(self, user_id: str) -> List[str]:
        """
        List all sessions for a user.

        Args:
            user_id: User ID

        Returns:
            List of session IDs
        """
        user_path = os.path.join(self.base_path, user_id)
        if not os.path.exists(user_path):
            return []

        sessions = []
        for item in os.listdir(user_path):
            item_path = os.path.join(user_path, item)
            if os.path.isdir(item_path):
                sessions.append(item)
        return sessions

    async def delete_session(self, user_id: str, session_id: str) -> None:
        """
        Deletes a session.

        Args:
            user_id: User identifier
            session_id: Session identifier
        """
        if not user_id or not session_id:
            raise ValueError("user_id and session_id cannot be empty")

        session_path = self._get_session_path(user_id, session_id)
        await self._safe_rmtree(session_path)
