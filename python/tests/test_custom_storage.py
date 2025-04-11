import os
import tempfile
import shutil
from browserstate.browser_state import BrowserState, BrowserStateOptions
from browserstate.storage.storage_provider import StorageProvider
import pytest
from typing import List


class DummyStorageProvider(StorageProvider):
    def __init__(self):
        self.sessions = {}

    async def download(self, user_id: str, session_id: str) -> str:
        if session_id not in self.sessions:
            raise ValueError(f"Session {session_id} not found")
        target_dir = tempfile.mkdtemp(prefix="dummy_")
        shutil.copytree(self.sessions[session_id], target_dir, dirs_exist_ok=True)
        return target_dir

    async def upload(self, user_id: str, session_id: str, file_path: str) -> None:
        target_dir = tempfile.mkdtemp(prefix="dummy_storage_")
        shutil.copytree(file_path, target_dir, dirs_exist_ok=True)
        self.sessions[session_id] = target_dir

    async def list_sessions(self, user_id: str) -> List[str]:
        return list(self.sessions.keys())

    async def delete_session(self, user_id: str, session_id: str) -> None:
        if session_id in self.sessions:
            shutil.rmtree(self.sessions[session_id], ignore_errors=True)
            del self.sessions[session_id]


@pytest.mark.asyncio
async def test_custom_storage_provider(dummy_session_dir):
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

    active_session = await browser_state.mount(session_id)
    downloaded_file = os.path.join(active_session["path"], "data.txt")
    assert os.path.exists(downloaded_file)
    with open(downloaded_file, "r") as f:
        assert f.read() == "Custom storage data"

    # Modify file and unmount.
    with open(downloaded_file, "a") as f:
        f.write(" Updated")
    await browser_state.unmount()

    # Remount and verify changes.
    active_session_2 = await browser_state.mount(session_id)
    downloaded_file_2 = os.path.join(active_session_2["path"], "data.txt")
    with open(downloaded_file_2, "r") as f:
        assert f.read() == "Custom storage data Updated"

    await browser_state.delete_session(session_id)
