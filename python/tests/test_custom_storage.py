import os
import tempfile
import shutil
from browserstate.browser_state import BrowserState, BrowserStateOptions
from browserstate.storage.storage_provider import StorageProvider

class DummyStorageProvider(StorageProvider):
    def __init__(self):
        self.sessions = {}
    
    def download(self, user_id: str, session_id: str) -> str:
        temp_dir = tempfile.mkdtemp(prefix="dummy_")
        if session_id in self.sessions:
            session_path = self.sessions[session_id]
            shutil.copytree(session_path, temp_dir, dirs_exist_ok=True)
        return temp_dir
    
    def upload(self, user_id: str, session_id: str, file_path: str) -> None:
        dest_dir = tempfile.mkdtemp(prefix="dummy_storage_")
        shutil.copytree(file_path, dest_dir, dirs_exist_ok=True)
        self.sessions[session_id] = dest_dir
    
    def list_sessions(self, user_id: str):
        return list(self.sessions.keys())
    
    def delete_session(self, user_id: str, session_id: str) -> None:
        if session_id in self.sessions:
            shutil.rmtree(self.sessions[session_id], ignore_errors=True)
            del self.sessions[session_id]

def test_custom_storage_provider(dummy_session_dir):
    user_id = "custom_user"
    session_id = "custom_session"
    
    dummy_storage = DummyStorageProvider()
    options = BrowserStateOptions(user_id=user_id, storage_provider=dummy_storage)
    browser_state = BrowserState(options)
    
    # Add a dummy file to the dummy session.
    dummy_file = os.path.join(dummy_session_dir, "data.txt")
    with open(dummy_file, "w") as f:
        f.write("Custom storage data")
    dummy_storage.sessions[session_id] = dummy_session_dir
    
    active_session = browser_state.mount_session(session_id)
    downloaded_file = os.path.join(active_session["path"], "data.txt")
    assert os.path.exists(downloaded_file)
    with open(downloaded_file, "r") as f:
        content = f.read()
    assert content == "Custom storage data"
    
    # Modify file and unmount.
    with open(downloaded_file, "a") as f:
        f.write(" Updated")
    browser_state.unmount_session()
    
    # Verify updated content.
    uploaded_dir = dummy_storage.sessions[session_id]
    uploaded_file = os.path.join(uploaded_dir, "data.txt")
    with open(uploaded_file, "r") as f:
        updated_content = f.read()
    assert "Updated" in updated_content
    browser_state.delete_session(session_id)
