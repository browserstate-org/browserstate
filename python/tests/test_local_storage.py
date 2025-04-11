import os
import filecmp
import shutil
from browserstate.storage.local_storage import LocalStorage
from browserstate.browser_state import BrowserState, BrowserStateOptions
import pytest


@pytest.mark.asyncio
async def test_local_storage_upload_download(local_storage_base, dummy_session_dir):
    user_id = "test_user"
    session_id = "session1"
    storage = LocalStorage(local_storage_base)

    await storage.upload(user_id, session_id, dummy_session_dir)
    downloaded_path = await storage.download(user_id, session_id)

    original_file = os.path.join(dummy_session_dir, "test.txt")
    downloaded_file = os.path.join(downloaded_path, "test.txt")
    assert os.path.exists(downloaded_file)
    assert filecmp.cmp(original_file, downloaded_file, shallow=False)

    original_subfile = os.path.join(dummy_session_dir, "subfolder", "sub.txt")
    downloaded_subfile = os.path.join(downloaded_path, "subfolder", "sub.txt")
    assert os.path.exists(downloaded_subfile)
    assert filecmp.cmp(original_subfile, downloaded_subfile, shallow=False)

    sessions = await storage.list_sessions(user_id)
    assert session_id in sessions
    await storage.delete_session(user_id, session_id)
    sessions_after = await storage.list_sessions(user_id)
    assert session_id not in sessions_after
    shutil.rmtree(downloaded_path, ignore_errors=True)


@pytest.mark.asyncio
async def test_local_storage_new_session_creation(local_storage_base):
    user_id = "new_user"
    session_id = "new_session"
    storage = LocalStorage(local_storage_base)

    downloaded_path = await storage.download(user_id, session_id)
    assert os.path.exists(downloaded_path)
    assert os.path.isdir(downloaded_path)
    assert os.listdir(downloaded_path) == []


@pytest.mark.asyncio
async def test_browser_state_integration(tmp_path):
    user_id = "integration_user"
    session_id = "integration_session"
    base_storage = str(tmp_path)
    storage = LocalStorage(base_storage)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=base_storage)
    browser_state = BrowserState(options)

    session_path = os.path.join(base_storage, user_id, session_id)
    os.makedirs(session_path, exist_ok=True)
    file_path = os.path.join(session_path, "state.txt")
    with open(file_path, "w") as f:
        f.write("Initial state")

    active_session = await browser_state.mount(session_id)
    mounted_file = os.path.join(active_session["path"], "state.txt")
    with open(mounted_file, "r") as f:
        assert f.read() == "Initial state"

    await browser_state.unmount()
    assert not os.path.exists(mounted_file)
