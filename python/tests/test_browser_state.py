import os
import shutil
import tempfile
import pytest
from unittest.mock import MagicMock, patch
from browserstate.browser_state import BrowserState, BrowserStateOptions
from browserstate.storage.local_storage import LocalStorage


# Helper to create a dummy session file.
def create_dummy_session(path):
    os.makedirs(path, exist_ok=True)
    file_path = os.path.join(path, "state.txt")
    with open(file_path, "w") as f:
        f.write("Session state content.")
    return path


def test_browser_state_mount_and_unmount(local_storage_base):
    user_id = "browser_user"
    session_id = "session_browser"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    # Simulate an existing session.
    session_storage_path = os.path.join(local_storage_base, user_id, session_id)
    create_dummy_session(session_storage_path)
    
    # Mount the session.
    active_session = browser_state.mount_session(session_id)
    assert active_session["id"] == session_id
    downloaded_file = os.path.join(active_session["path"], "state.txt")
    assert os.path.exists(downloaded_file)
    
    # Modify the session.
    with open(downloaded_file, "a") as f:
        f.write("\nNew state data.")
    browser_state.unmount_session()
    
    # Remount to verify changes.
    active_session_2 = browser_state.mount_session(session_id)
    with open(os.path.join(active_session_2["path"], "state.txt"), "r") as f:
        content = f.read()
    assert "New state data." in content
    
    browser_state.delete_session(session_id)
    sessions = storage.list_sessions(user_id)
    assert session_id not in sessions



def test_mount_nonexistent_session(local_storage_base):
    user_id = "edge_user"
    session_id = "nonexistent_session"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    active_session = browser_state.mount_session(session_id)
    assert os.path.exists(active_session["path"])
    assert os.listdir(active_session["path"]) == []
    
    browser_state.delete_session(session_id)


def test_double_mount_unmount(local_storage_base):
    user_id = "double_user"
    session_id = "double_session"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    active_session_1 = browser_state.mount_session(session_id)
    active_session_2 = browser_state.mount_session(session_id)
    assert active_session_1["id"] == active_session_2["id"]
    
    browser_state.unmount_session()
    # Second unmount should be safe.
    browser_state.unmount_session()
    browser_state.delete_session(session_id)


def test_active_session_cleanup_on_error(local_storage_base, monkeypatch):
    user_id = "cleanup_user"
    session_id = "cleanup_session"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, storage_provider=storage)
    browser_state = BrowserState(options)
    
    session_storage_path = os.path.join(local_storage_base, user_id, session_id)
    os.makedirs(session_storage_path, exist_ok=True)
    dummy_file = os.path.join(session_storage_path, "dummy.txt")
    with open(dummy_file, "w") as f:
        f.write("Dummy")
    
    browser_state.mount_session(session_id)
    original_upload = storage.upload

    def faulty_upload(user_id, session_id, file_path):
        raise Exception("Forced upload error")
    monkeypatch.setattr(storage, "upload", faulty_upload)
    
    with pytest.raises(Exception, match="Forced upload error"):
        browser_state.unmount_session()
    assert browser_state.get_active_session() is None
    
    monkeypatch.setattr(storage, "upload", original_upload)
    browser_state.delete_session(session_id)


def test_browser_state_list_sessions_error(local_storage_base, monkeypatch):
    user_id = "error_user"
    storage = LocalStorage(local_storage_base)

    def faulty_list_sessions(user_id):
        raise Exception("List sessions error")
    monkeypatch.setattr(storage, "list_sessions", faulty_list_sessions)
    
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    sessions = browser_state.list_sessions()
    assert sessions == []


def test_invalid_input_empty_strings(local_storage_base):
    user_id = ""
    session_id = ""
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    active_session = browser_state.mount_session(session_id)
    # Expect a generated non-empty session id.
    assert active_session["id"] != ""
    
    browser_state.unmount_session()
    browser_state.delete_session(active_session["id"])


def test_invalid_input_long_strings():
    # Test with extremely long user_id and session_id.
    user_id = "u" * 1000
    session_id = "s" * 1000
    base_storage = tempfile.mkdtemp(prefix="invalid_local_")
    storage = LocalStorage(base_storage)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=base_storage)
    browser_state = BrowserState(options)

    # Different platforms will raise different error messages for long paths:
    # Windows: "filename, directory name, or volume label syntax is incorrect"
    # macOS/Linux: typically "File name too long"
    # Let's catch any OSError without checking the specific message
    with pytest.raises(OSError):
        browser_state.mount_session(session_id)


# def test_concurrent_mount_unmount():
#     # Simulate multiple threads mounting and unmounting the same session concurrently.
#     user_id = "concurrent_user"
#     session_id = "concurrent_session"
#     base_storage = tempfile.mkdtemp(prefix="concurrent_local_")
#     storage = LocalStorage(base_storage)
#     options = BrowserStateOptions(user_id=user_id, local_storage_path=base_storage)
#     browser_state = BrowserState(options)

#     errors = []

#     def mount_and_unmount():
#         try:
#             browser_state.mount_session(session_id)
#             active_session = browser_state.get_active_session()
#             if active_session:
#                 test_file = os.path.join(active_session["path"], "concurrent.txt")
#                 with open(test_file, "w") as f:
#                     f.write("Concurrent test")
#             browser_state.unmount_session()
#         except Exception as e:
#             errors.append(e)

#     threads = [threading.Thread(target=mount_and_unmount) for _ in range(5)]
#     for t in threads:
#         t.start()
#     for t in threads:
#         t.join()

#     assert not errors, f"Errors occurred in concurrent operations: {errors}"
#     browser_state.delete_session(session_id)
#     shutil.rmtree(base_storage, ignore_errors=True)


def test_browser_state_mount_new_session(local_storage_base):
    user_id = "new_user"
    session_id = "no_such_session"
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    active_session = browser_state.mount_session(session_id)
    assert active_session["id"] == session_id
    assert os.path.exists(active_session["path"])
    assert os.listdir(active_session["path"]) == []
    
    browser_state.delete_session(session_id)


def test_browser_state_unmount_no_active_session(local_storage_base, caplog):
    user_id = "test_user"
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    browser_state.unmount_session()
    assert "No active session to unmount" in caplog.text


def test_browser_state_delete_non_existent_session(local_storage_base, caplog):
    user_id = "test_user"
    session_id = "no_such_session"
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    # Should not raise an error.
    browser_state.delete_session(session_id)


def test_browser_state_list_sessions_empty(local_storage_base):
    user_id = "empty_user"
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    sessions = browser_state.list_sessions()
    assert sessions == []


@patch("browserstate.utils.dynamic_import.google_cloud_storage.Client", return_value=MagicMock())
def test_browser_state_options_priority(mock_gcs_client, local_storage_base):
    # 1) When storage_provider is specified.
    custom_provider = MagicMock()
    options = BrowserStateOptions(
        user_id="user1",
        storage_provider=custom_provider,
        s3_options={"bucket_name": "test-bucket"}
    )
    browser_state = BrowserState(options)
    assert browser_state.storage == custom_provider

    # 2) s3_options provided.
    options = BrowserStateOptions(
        user_id="user1",
        s3_options={"bucket_name": "test-bucket"},
        gcs_options={"bucket_name": "gcs-bucket"}
    )
    browser_state = BrowserState(options)
    from browserstate.storage.s3_storage import S3Storage
    assert isinstance(browser_state.storage, S3Storage)

    # 3) gcs_options provided.
    options = BrowserStateOptions(user_id="user1", gcs_options={"bucket_name": "gcs-bucket"})
    browser_state = BrowserState(options)
    from browserstate.storage.gcs_storage import GCSStorage
    assert isinstance(browser_state.storage, GCSStorage)

    # 4) redis_options provided.
    options = BrowserStateOptions(user_id="user1", redis_options={"redis_url": "redis://..."})
    browser_state = BrowserState(options)
    from browserstate.storage.redis_storage import RedisStorage
    assert isinstance(browser_state.storage, RedisStorage)

    # 5) Defaults to LocalStorage.
    options = BrowserStateOptions(user_id="user1")
    browser_state = BrowserState(options)
    from browserstate.storage.local_storage import LocalStorage
    assert isinstance(browser_state.storage, LocalStorage)

@patch.object(LocalStorage, 'upload', side_effect=Exception("Simulated upload error"))
def test_browser_state_unmount_exception(mocked_upload, local_storage_base):
    user_id = "test_user"
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    browser_state.mount_session("session_fail")
    with pytest.raises(Exception, match="Simulated upload error"):
        browser_state.unmount_session()
