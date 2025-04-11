import os
import shutil
import logging
from typing import List, Optional
import tempfile

# Import boto3 and botocore lazily
from ..utils.dynamic_import import boto3, botocore

from .storage_provider import StorageProvider


class S3Storage(StorageProvider):
    """
    Storage provider implementation that uses AWS S3.
    """

    def __init__(
        self,
        bucket_name: str,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        region: Optional[str] = None,
        endpoint: Optional[str] = None,
    ):
        """
        Initialize S3 storage provider.

        Args:
            bucket_name: S3 bucket name
            access_key_id: AWS access key ID (optional if using environment credentials)
            secret_access_key: AWS secret access key (optional if using environment credentials)
            region: AWS region (optional, defaults to environment or config)
            endpoint: S3 endpoint URL (optional, for use with S3-compatible services)
        """
        self.bucket_name = bucket_name

        # Configure S3 client
        s3_kwargs = {}
        if region:
            s3_kwargs["region_name"] = region
        if endpoint:
            s3_kwargs["endpoint_url"] = endpoint
        if access_key_id and secret_access_key:
            s3_kwargs["aws_access_key_id"] = access_key_id
            s3_kwargs["aws_secret_access_key"] = secret_access_key

        self.s3_client = boto3.client("s3", **s3_kwargs)

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

    def _get_s3_prefix(self, user_id: str, session_id: Optional[str] = None) -> str:
        """
        Get S3 key prefix for a user or session.

        Args:
            user_id: User identifier
            session_id: Session identifier (optional)

        Returns:
            S3 key prefix
        """
        prefix = f"{user_id}/"
        if session_id:
            prefix += f"{session_id}/"
        return prefix

    def download(self, user_id: str, session_id: str) -> str:
        """
        Downloads a browser session from S3 to local temp directory.

        Args:
            user_id: User identifier
            session_id: Session identifier

        Returns:
            Path to the local directory containing the session data
        """
        prefix = self._get_s3_prefix(user_id, session_id)
        target_path = self._get_temp_path(user_id, session_id)

        # Clean target directory if it exists
        if os.path.exists(target_path):
            shutil.rmtree(target_path)

        # Create target directory
        os.makedirs(target_path, exist_ok=True)

        try:
            # List objects in the prefix
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name, Prefix=prefix
            )

            # If objects exist, download them
            if "Contents" in response:
                for obj in response.get("Contents", []):
                    key = obj["Key"]
                    if key.endswith("/"):
                        # Skip directory markers
                        continue

                    # Calculate relative path
                    rel_path = key[len(prefix) :]
                    local_path = os.path.join(target_path, rel_path)

                    # Ensure directory exists
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)

                    # Download file
                    self.s3_client.download_file(self.bucket_name, key, local_path)
        except Exception as e:
            logging.error(f"Error downloading from S3: {e}")

        return target_path

    def upload(self, user_id: str, session_id: str, file_path: str) -> None:
        """
        Uploads browser session files from temp to S3.

        Args:
            user_id: User identifier
            session_id: Session identifier
            file_path: Path to the local directory containing session data
        """
        prefix = self._get_s3_prefix(user_id, session_id)

        try:
            # Upload all files in the directory
            for root, _, files in os.walk(file_path):
                for filename in files:
                    local_path = os.path.join(root, filename)

                    # Calculate S3 key
                    rel_path = os.path.relpath(local_path, file_path)
                    s3_key = f"{prefix}{rel_path}"

                    # Upload file
                    self.s3_client.upload_file(local_path, self.bucket_name, s3_key)
        except Exception as e:
            logging.error(f"Error uploading to S3: {e}")
            raise

    def list_sessions(self, user_id: str) -> List[str]:
        """
        Lists all available sessions for a user from S3.

        Args:
            user_id: User identifier

        Returns:
            List of session identifiers
        """
        prefix = self._get_s3_prefix(user_id)
        sessions = set()

        try:
            # Use delimiter to list "directories" (common prefixes)
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name, Prefix=prefix, Delimiter="/"
            )

            # Extract session IDs from common prefixes
            for common_prefix in response.get("CommonPrefixes", []):
                prefix_path = common_prefix.get("Prefix", "")
                # Extract session ID from prefix path (user_id/session_id/)
                if prefix_path.startswith(prefix) and prefix_path.endswith("/"):
                    session_id = prefix_path[
                        len(prefix) : -1
                    ]  # Remove prefix and trailing slash
                    if session_id:
                        sessions.add(session_id)

        except Exception as e:
            logging.error(f"Error listing sessions from S3: {e}")
            return []

        return list(sessions)

    def delete_session(self, user_id: str, session_id: str) -> None:
        """
        Deletes a session from S3.

        Args:
            user_id: User identifier
            session_id: Session identifier
        """
        prefix = self._get_s3_prefix(user_id, session_id)

        try:
            # List all objects with the session prefix
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name, Prefix=prefix
            )

            # If objects exist, delete them
            if "Contents" in response and response["Contents"]:
                # Create a list of objects to delete
                objects_to_delete = [
                    {"Key": obj["Key"]} for obj in response["Contents"]
                ]

                # Delete objects
                self.s3_client.delete_objects(
                    Bucket=self.bucket_name, Delete={"Objects": objects_to_delete}
                )

                # Check if there are more objects to delete (pagination)
                while response.get("IsTruncated", False):
                    response = self.s3_client.list_objects_v2(
                        Bucket=self.bucket_name,
                        Prefix=prefix,
                        ContinuationToken=response["NextContinuationToken"],
                    )

                    if "Contents" in response:
                        objects_to_delete = [
                            {"Key": obj["Key"]} for obj in response["Contents"]
                        ]
                        self.s3_client.delete_objects(
                            Bucket=self.bucket_name,
                            Delete={"Objects": objects_to_delete},
                        )
        except Exception as e:
            logging.error(f"Error deleting session from S3: {e}")
            raise
