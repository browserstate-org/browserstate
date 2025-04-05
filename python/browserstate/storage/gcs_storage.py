import os
import shutil
import logging
from typing import List, Optional
import tempfile

# Import GCS lazily
from ..utils.dynamic_import import google_cloud_storage

from .storage_provider import StorageProvider

class GCSStorage(StorageProvider):
    """
    Storage provider implementation that uses Google Cloud Storage.
    """
    
    def __init__(self, bucket_name: str, 
                 service_account_path: Optional[str] = None,
                 project_id: Optional[str] = None):
        """
        Initialize Google Cloud Storage provider.
        
        Args:
            bucket_name: GCS bucket name
            service_account_path: Path to service account JSON file (optional if using environment credentials)
            project_id: Google Cloud project ID (optional if using service account or environment)
        """
        self.bucket_name = bucket_name
        
        # Configure GCS client
        client_kwargs = {}
        if project_id:
            client_kwargs['project'] = project_id
            
        if service_account_path:
            client_kwargs['credentials'] = service_account_path
            
        self.storage_client = google_cloud_storage.Client(**client_kwargs)
        
        # Get bucket reference
        self.bucket = self.storage_client.bucket(bucket_name)
        
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
    
    def _get_gcs_prefix(self, user_id: str, session_id: Optional[str] = None) -> str:
        """
        Get GCS blob prefix for a user or session.
        
        Args:
            user_id: User identifier
            session_id: Session identifier (optional)
            
        Returns:
            GCS blob prefix
        """
        prefix = f"{user_id}/"
        if session_id:
            prefix += f"{session_id}/"
        return prefix
    
    def download(self, user_id: str, session_id: str) -> str:
        """
        Downloads a browser session from GCS to local temp directory.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            
        Returns:
            Path to the local directory containing the session data
        """
        prefix = self._get_gcs_prefix(user_id, session_id)
        target_path = self._get_temp_path(user_id, session_id)
        
        # Clean target directory if it exists
        if os.path.exists(target_path):
            shutil.rmtree(target_path)
        
        # Create target directory
        os.makedirs(target_path, exist_ok=True)
        
        try:
            # List blobs with the prefix
            blobs = list(self.bucket.list_blobs(prefix=prefix))
            
            # Download blobs
            for blob in blobs:
                # Skip directory markers
                if blob.name.endswith('/'):
                    continue
                    
                # Calculate relative path
                rel_path = blob.name[len(prefix):]
                local_path = os.path.join(target_path, rel_path)
                
                # Ensure directory exists
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                
                # Download file
                blob.download_to_filename(local_path)
        except Exception as e:
            logging.error(f"Error downloading from GCS: {e}")
            # Create empty directory for new sessions
            pass
        
        return target_path
    
    def upload(self, user_id: str, session_id: str, file_path: str) -> None:
        """
        Uploads browser session files from temp to GCS.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            file_path: Path to the local directory containing session data
        """
        prefix = self._get_gcs_prefix(user_id, session_id)
        
        try:
            # Upload all files in the directory
            for root, _, files in os.walk(file_path):
                for filename in files:
                    local_path = os.path.join(root, filename)
                    
                    # Calculate GCS blob name
                    rel_path = os.path.relpath(local_path, file_path)
                    blob_name = f"{prefix}{rel_path}"
                    
                    # Create blob and upload
                    blob = self.bucket.blob(blob_name)
                    blob.upload_from_filename(local_path)
        except Exception as e:
            logging.error(f"Error uploading to GCS: {e}")
            raise
    
    def list_sessions(self, user_id: str) -> List[str]:
        """
        Lists all available sessions for a user from GCS.
        
        Args:
            user_id: User identifier
            
        Returns:
            List of session identifiers
        """
        prefix = self._get_gcs_prefix(user_id)
        sessions = set()
        
        try:
            # List blobs with the prefix
            blobs = list(self.bucket.list_blobs(prefix=prefix, delimiter='/'))
            
            # Extract session IDs from prefixes
            # The prefixes in GCS will be in the format 'user_id/session_id/'
            for prefix_path in self.bucket.list_blobs(prefix=prefix, delimiter='/').prefixes:
                # Extract session ID from prefix path
                if prefix_path.startswith(prefix) and prefix_path.endswith('/'):
                    session_id = prefix_path[len(prefix):-1]  # Remove prefix and trailing slash
                    if session_id:
                        sessions.add(session_id)
                        
        except Exception as e:
            logging.error(f"Error listing sessions from GCS: {e}")
            return []
        
        return list(sessions)
    
    def delete_session(self, user_id: str, session_id: str) -> None:
        """
        Deletes a session from GCS.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
        """
        prefix = self._get_gcs_prefix(user_id, session_id)
        
        try:
            # List blobs with the prefix
            blobs = list(self.bucket.list_blobs(prefix=prefix))
            
            # Delete blobs
            for blob in blobs:
                blob.delete()
                
        except Exception as e:
            logging.error(f"Error deleting session from GCS: {e}")
            raise 