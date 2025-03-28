import os
import filecmp
import shutil
from browserstate.storage.local_storage import LocalStorage

def test_local_storage_upload_download(local_storage_base, dummy_session_dir):
    user_id = "test_user"
    session_id = "session1"
    
    storage = LocalStorage(local_storage_base)
    
    # Upload the dummy session.
    storage.upload(user_id, session_id, dummy_session_dir)
    
    # Download the session to a temporary location.
    downloaded_path = storage.download(user_id, session_id)
    
    # Verify that the file structure and contents match.
    original_file = os.path.join(dummy_session_dir, "test.txt")
    downloaded_file = os.path.join(downloaded_path, "test.txt")
    assert os.path.exists(downloaded_file)
    assert filecmp.cmp(original_file, downloaded_file, shallow=False)
    
    # Check subfolder file.
    original_subfile = os.path.join(dummy_session_dir, "subfolder", "sub.txt")
    downloaded_subfile = os.path.join(downloaded_path, "subfolder", "sub.txt")
    assert os.path.exists(downloaded_subfile)
    assert filecmp.cmp(original_subfile, downloaded_subfile, shallow=False)
    
    # List sessions and verify the session_id is present.
    sessions = storage.list_sessions(user_id)
    assert session_id in sessions
    
    # Delete the session.
    storage.delete_session(user_id, session_id)
    # After deletion, the user directory should not contain the session.
    sessions_after = storage.list_sessions(user_id)
    assert session_id not in sessions_after

def test_local_storage_new_session_creation(local_storage_base):
    user_id = "new_user"
    session_id = "new_session"
    
    storage = LocalStorage(local_storage_base)
    # For a session that does not exist, download should create an empty directory.
    downloaded_path = storage.download(user_id, session_id)
    assert os.path.exists(downloaded_path)
    # The directory should be empty.
    assert not os.listdir(downloaded_path)
