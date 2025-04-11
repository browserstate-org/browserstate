import os
import shutil
import uuid
import logging
import asyncio
from typing import Dict, List, Optional, Union

from .storage import StorageProvider, LocalStorage


class BrowserStateOptions:
    """Options for configuring BrowserState"""

    def __init__(
        self,
        user_id: str,
        storage_provider: StorageProvider = None,
        local_storage_path: Optional[str] = None,
        s3_options: Optional[Dict] = None,
        gcs_options: Optional[Dict] = None,
        redis_options: Optional[Dict] = None,
    ):
        """
        Initialize BrowserStateOptions

        Args:
            user_id: The user identifier for storing profiles
            storage_provider: Custom storage provider instance
            local_storage_path: Path for LocalStorage, if used
            s3_options: Options for S3Storage, if used
            gcs_options: Options for GCSStorage, if used
            redis_options: Options for RedisStorage, if used
        """
        self.user_id = user_id
        self.storage_provider = storage_provider
        self.local_storage_path = local_storage_path
        self.s3_options = s3_options
        self.gcs_options = gcs_options
        self.redis_options = redis_options


class BrowserState:
    """
    Manages browser profiles across different storage providers,
    enabling persistent browser sessions across machines.
    """

    def __init__(self, options: BrowserStateOptions):
        """
        Initialize BrowserState with options

        Args:
            options: Configuration options for BrowserState
        """
        self.user_id = options.user_id
        self.active_session: Optional[Dict] = None

        # Set up storage provider
        if options.storage_provider:
            self.storage = options.storage_provider
        elif options.s3_options:
            # S3 storage - import lazily
            from .storage import S3Storage

            self.storage = S3Storage(
                bucket_name=options.s3_options.get("bucket_name"),
                access_key_id=options.s3_options.get("access_key_id"),
                secret_access_key=options.s3_options.get("secret_access_key"),
                region=options.s3_options.get("region"),
                endpoint=options.s3_options.get("endpoint"),
            )
        elif options.gcs_options:
            # Google Cloud Storage - import lazily
            from .storage import GCSStorage

            self.storage = GCSStorage(**options.gcs_options)
        elif options.redis_options:
            # Redis storage - import lazily
            from .storage import RedisStorage

            self.storage = RedisStorage(
                host=options.redis_options.get("host", "localhost"),
                port=options.redis_options.get("port", 6379),
                key_prefix=options.redis_options.get("key_prefix", "browserstate"),
                password=options.redis_options.get("password"),
                db=options.redis_options.get("db", 0),
            )
        else:
            # Local storage (default)
            self.storage = LocalStorage(options.local_storage_path)

    async def mount(self, session_id: str) -> str:
        """
        Mounts a browser session

        Args:
            session_id: Session ID to mount

        Returns:
            Path to the mounted session
        """
        # Clean up any existing session
        await self._cleanup_session()

        try:
            # Download the session
            local_path = await self.storage.download(self.user_id, session_id)

            # Update active session
            self.active_session = {"id": session_id, "path": local_path}

            return local_path
        except Exception as e:
            logging.error(f"Error mounting session {session_id}: {str(e)}")
            raise

    async def unmount(self) -> None:
        """
        Unmounts the current browser session
        """
        if not self.active_session:
            logging.warning("No active session to unmount")
            return

        try:
            # Upload session data
            await self.storage.upload(
                self.user_id, self.active_session["id"], self.active_session["path"]
            )

            # Clean up
            await self._cleanup_session()

        except Exception as e:
            logging.error(f"Error unmounting session {self.active_session['id']}: {e}")
            # Always clean up the local session
            await self._cleanup_session()
            raise

    async def list_sessions(self) -> List[str]:
        """
        List all available sessions for the user

        Returns:
            List of session IDs
        """
        try:
            return await self.storage.list_sessions(self.user_id)
        except Exception as e:
            logging.error(f"Error listing sessions: {e}")
            return []

    async def delete_session(self, session_id: str) -> None:
        """
        Delete a browser session

        Args:
            session_id: ID of the session to delete
        """
        try:
            # If trying to delete the active session, unmount it first
            if self.active_session and self.active_session["id"] == session_id:
                await self.unmount()

            # Delete from storage
            await self.storage.delete_session(self.user_id, session_id)
        except Exception as e:
            logging.error(f"Error deleting session {session_id}: {e}")
            raise

    def get_current_session(self) -> Optional[str]:
        """
        Get the current session ID if one is mounted

        Returns:
            Current session ID or None if no session is mounted
        """
        return self.active_session["id"] if self.active_session else None

    def get_current_session_path(self) -> Optional[str]:
        """
        Get the path to the current session if one is mounted

        Returns:
            Path to current session or None if no session is mounted
        """
        return self.active_session["path"] if self.active_session else None

    async def _cleanup_session(self) -> None:
        """
        Clean up the current session's local files
        """
        if not self.active_session:
            return

        try:
            # Remove local directory
            if os.path.exists(self.active_session["path"]):
                shutil.rmtree(self.active_session["path"])

            # Clear active session reference
            self.active_session = None
        except Exception as e:
            logging.error(f"Error cleaning up session: {e}")
            # Continue execution even if cleanup fails
