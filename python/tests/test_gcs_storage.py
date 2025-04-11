import os
import shutil
import pytest
from unittest.mock import MagicMock, patch

# Try to import GCS dependencies
try:
    from google.cloud import storage

    HAS_GCS = True
except ImportError:
    HAS_GCS = False

# Import the GCSStorage class
from browserstate.storage.gcs_storage import GCSStorage


# def test_gcs_storage_upload_download(monkeypatch, tmp_path, fake_gcs_client):
#     # Monkey-patch the GCS client so that GCSStorage uses our fake client
#     monkeypatch.setattr("browserstate.storage.gcs_storage.storage.Client", lambda **kwargs: fake_gcs_client)

#     bucket_name = "fake_bucket"
#     storage = GCSStorage(bucket_name=bucket_name)

#     user_id = "gcs_user"
#     session_id = "session_gcs"

#     # Create a dummy session directory with a file
#     dummy_session_dir = tmp_path / "dummy_session"
#     dummy_session_dir.mkdir()
#     test_file = dummy_session_dir / "test.txt"
#     test_file.write_text("Hello, GCS!")

#     # Upload the dummy session
#     storage.upload(user_id, session_id, str(dummy_session_dir))

#     # Download the session and verify the file exists and has the correct content
#     downloaded_path = storage.download(user_id, session_id)
#     downloaded_file = os.path.join(downloaded_path, "test.txt")
#     assert os.path.exists(downloaded_file)
#     with open(downloaded_file, "r") as f:
#         content = f.read()
#     assert content == "Hello, GCS!"

#     # Verify that listing sessions returns our session id
#     sessions = storage.list_sessions(user_id)
#     assert session_id in sessions

#     # Delete the session and check it is removed
#     storage.delete_session(user_id, session_id)
#     fake_gcs_client.bucket.return_value.list_blobs.return_value = []
#     sessions_after = storage.list_sessions(user_id)
#     assert session_id not in sessions_after

#     shutil.rmtree(downloaded_path, ignore_errors=True)


def test_gcs_storage_error(monkeypatch, tmp_path):
    """Test GCS storage error handling when listing blobs."""
    # Create a mock GCS client
    fake_gcs_client = MagicMock()
    mock_gcs = MagicMock()
    mock_gcs.Client.return_value = fake_gcs_client

    # Use multiple patches to ensure all imports are caught
    with patch.dict("sys.modules", {"google.cloud.storage": mock_gcs}), patch(
        "browserstate.utils.dynamic_import.google_cloud_storage", mock_gcs
    ), patch("browserstate.storage.gcs_storage.google_cloud_storage", mock_gcs):

        def error_list_blobs(*args, **kwargs):
            raise Exception("Test exception")

        fake_gcs_client.bucket.return_value.list_blobs = error_list_blobs

        bucket_name = "fake_bucket"
        storage = GCSStorage(bucket_name=bucket_name)
        user_id = "gcs_user"
        session_id = "session_gcs_error"

        downloaded_path = storage.download(user_id, session_id)
        assert os.path.exists(downloaded_path)
        # Expect an empty directory on error.
        assert os.listdir(downloaded_path) == []
        shutil.rmtree(downloaded_path, ignore_errors=True)
