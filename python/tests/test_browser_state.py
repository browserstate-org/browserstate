import os
import filecmp
import shutil
import tempfile
from browserstate.browser_state import BrowserState, BrowserStateOptions
from browserstate.storage.local_storage import LocalStorage

def create_dummy_session(path):
    """Helper function to create dummy files in a session directory."""
    os.makedirs(path, exist_ok=True)
    file_path = os.path.join(path, "state.txt")
    with open(file_path, "w") as f:
        f.write("Session state content.")
    return path

def test_browser_state_mount_and_unmount():
    user_id = "browser_user"
    session_id = "session_browser"
    
    # Create a temporary base for local storage.
    base_storage = tempfile.mkdtemp(prefix="browserstate_local_")
    storage = LocalStorage(base_storage)
    
    # Prepare options using local storage.
    options = BrowserStateOptions(
        user_id=user_id,
        local_storage_path=base_storage
    )
    
    browser_state = BrowserState(options)
    
    # Simulate that there is already a session saved.
    session_storage_path = os.path.join(base_storage, user_id, session_id)
    create_dummy_session(session_storage_path)
    
    # Mount the session. This should download the session from local storage.
    active_session = browser_state.mount_session(session_id)
    assert active_session["id"] == session_id
    # The downloaded session should have the file 'state.txt'
    downloaded_file = os.path.join(active_session["path"], "state.txt")
    assert os.path.exists(downloaded_file)
    
    # Modify the downloaded session file.
    with open(downloaded_file, "a") as f:
        f.write("\nNew state data.")
    
    # Unmount the session, which should upload the modified session back to storage.
    browser_state.unmount_session()
    
    # Remount the session to verify changes were saved.
    active_session_2 = browser_state.mount_session(session_id)
    file_path = os.path.join(active_session_2["path"], "state.txt")
    with open(file_path, "r") as f:
        content = f.read()
    assert "New state data." in content
    
    # Clean up: delete the session.
    browser_state.delete_session(session_id)
    sessions = storage.list_sessions(user_id)
    assert session_id not in sessions
    
    # Remove temporary directories.
    shutil.rmtree(base_storage, ignore_errors=True)
    shutil.rmtree(active_session_2["path"], ignore_errors=True)
