import os
import shutil
import uuid
import logging
from typing import Dict, List, Optional, Union

from .storage import StorageProvider, LocalStorage, S3Storage, GCSStorage, RedisStorage

class BrowserStateOptions:
    """Options for configuring BrowserState"""
    
    def __init__(self, 
                 user_id: str,
                 storage_provider: StorageProvider = None,
                 local_storage_path: Optional[str] = None,
                 s3_options: Optional[Dict] = None,
                 gcs_options: Optional[Dict] = None,
                 redis_options: Optional[Dict] = None):
        """
        Initialize BrowserStateOptions
        
        Args:
            user_id: The user identifier for storing profiles
            storage_provider: Custom storage provider instance
            local_storage_path: Path for LocalStorage, if used
            s3_options: Options for S3Storage, if used
            gcs_options: Options for GCSStorage, if used
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
            # S3 storage
            self.storage = S3Storage(**options.s3_options)
        elif options.gcs_options:
            # Google Cloud Storage
            self.storage = GCSStorage(**options.gcs_options)
        elif options.redis_options:
            self.storage = RedisStorage(**options.redis_options)
        else:
            # Local storage (default)
            self.storage = LocalStorage(options.local_storage_path)
    
    def mount_session(self, session_id: Optional[str] = None) -> Dict:
        """
        Downloads and mounts a browser session
        
        Args:
            session_id: Optional session ID to mount. If not provided, a new session is created.
            
        Returns:
            Dictionary containing session details
        """
        # Clean up any existing session
        self._cleanup_session()
        
        # Generate session ID if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
        
        try:
            # Download the session
            local_path = self.storage.download(self.user_id, session_id)
            
            # Store active session details
            self.active_session = {
                "id": session_id,
                "path": local_path
            }
            
            return self.active_session
        except Exception as e:
            logging.error(f"Error mounting session {session_id}: {e}")
            raise
    
    def unmount_session(self) -> None:
        """
        Uploads and cleans up the current browser session
        """
        if not self.active_session:
            logging.warning("No active session to unmount")
            return
        
        try:
            # Upload session data
            self.storage.upload(
                self.user_id,
                self.active_session["id"],
                self.active_session["path"]
            )
            
            # Clean up
            self._cleanup_session()
            
        except Exception as e:
            logging.error(f"Error unmounting session {self.active_session['id']}: {e}")
            raise
    
    def list_sessions(self) -> List[str]:
        """
        List all available sessions for the user
        
        Returns:
            List of session IDs
        """
        try:
            return self.storage.list_sessions(self.user_id)
        except Exception as e:
            logging.error(f"Error listing sessions: {e}")
            return []
    
    def delete_session(self, session_id: str) -> None:
        """
        Delete a browser session
        
        Args:
            session_id: ID of the session to delete
        """
        try:
            # If trying to delete the active session, unmount it first
            if self.active_session and self.active_session["id"] == session_id:
                self.unmount_session()
            
            # Delete from storage
            self.storage.delete_session(self.user_id, session_id)
        except Exception as e:
            logging.error(f"Error deleting session {session_id}: {e}")
            raise
    
    def get_active_session(self) -> Optional[Dict]:
        """
        Get details of the currently active session
        
        Returns:
            Dictionary with session details or None if no active session
        """
        return self.active_session
    
    def _cleanup_session(self) -> None:
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