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


@pytest.mark.asyncio
async def test_browser_state_mount_and_unmount(local_storage_base):
    user_id = "browser_user"
    session_id = "session_browser"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    # Simulate an existing session.
    session_storage_path = os.path.join(local_storage_base, user_id, session_id)
    create_dummy_session(session_storage_path)
    
    # Mount the session.
    local_path = await browser_state.mount(session_id)
    assert browser_state.get_current_session() == session_id
    downloaded_file = os.path.join(local_path, "state.txt")
    assert os.path.exists(downloaded_file)
    
    # Modify the session.
    with open(downloaded_file, "a") as f:
        f.write("\nNew state data.")
    await browser_state.unmount()
    
    # Remount to verify changes.
    local_path_2 = await browser_state.mount(session_id)
    with open(os.path.join(local_path_2, "state.txt"), "r") as f:
        content = f.read()
    assert "New state data." in content
    
    await browser_state.delete_session(session_id)
    sessions = await storage.list_sessions(user_id)
    assert session_id not in sessions


@pytest.mark.asyncio
async def test_mount_nonexistent_session(local_storage_base):
    user_id = "edge_user"
    session_id = "nonexistent_session"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    local_path = await browser_state.mount(session_id)
    assert os.path.exists(local_path)
    assert os.listdir(local_path) == []
    
    await browser_state.delete_session(session_id)


@pytest.mark.asyncio
async def test_double_mount_unmount(local_storage_base):
    user_id = "double_user"
    session_id = "double_session"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    local_path_1 = await browser_state.mount(session_id)
    local_path_2 = await browser_state.mount(session_id)
    assert local_path_1 == local_path_2
    
    await browser_state.unmount()
    # Second unmount should be safe.
    await browser_state.unmount()
    await browser_state.delete_session(session_id)


@pytest.mark.asyncio
async def test_active_session_cleanup_on_error(local_storage_base, monkeypatch):
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
    
    await browser_state.mount(session_id)
    original_upload = storage.upload

    async def faulty_upload(user_id, session_id, file_path):
        raise Exception("Forced upload error")
    monkeypatch.setattr(storage, "upload", faulty_upload)
    
    with pytest.raises(Exception, match="Forced upload error"):
        await browser_state.unmount()
    assert browser_state.get_current_session() is None
    
    monkeypatch.setattr(storage, "upload", original_upload)
    await browser_state.delete_session(session_id)


@pytest.mark.asyncio
async def test_browser_state_list_sessions_error(local_storage_base, monkeypatch):
    user_id = "error_user"
    storage = LocalStorage(local_storage_base)

    async def faulty_list_sessions(user_id):
        raise Exception("List sessions error")
    monkeypatch.setattr(storage, "list_sessions", faulty_list_sessions)
    
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    sessions = await browser_state.list_sessions()
    assert sessions == []


@pytest.mark.asyncio
async def test_invalid_input_empty_strings(local_storage_base):
    user_id = ""
    session_id = ""
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    local_path = await browser_state.mount(session_id)
    # Expect a generated non-empty session id.
    assert browser_state.get_current_session() != ""
    
    await browser_state.unmount()
    await browser_state.delete_session(browser_state.get_current_session())


@pytest.mark.asyncio
async def test_invalid_input_long_strings():
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
        await browser_state.mount(session_id)


@pytest.mark.asyncio
async def test_browser_state_mount_new_session(local_storage_base):
    user_id = "new_user"
    session_id = "no_such_session"
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    local_path = await browser_state.mount(session_id)
    assert browser_state.get_current_session() == session_id
    assert os.path.exists(local_path)
    assert os.listdir(local_path) == []
    
    await browser_state.delete_session(session_id)


@pytest.mark.asyncio
async def test_browser_state_unmount_no_active_session(local_storage_base, caplog):
    user_id = "test_user"
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    await browser_state.unmount()
    assert "No active session to unmount" in caplog.text


@pytest.mark.asyncio
async def test_browser_state_delete_non_existent_session(local_storage_base, caplog):
    user_id = "test_user"
    session_id = "no_such_session"
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    # Should not raise an error.
    await browser_state.delete_session(session_id)


@pytest.mark.asyncio
async def test_browser_state_list_sessions_empty(local_storage_base):
    user_id = "empty_user"
    options = BrowserStateOptions(user_id=user_id, local_storage_path=local_storage_base)
    browser_state = BrowserState(options)
    
    sessions = await browser_state.list_sessions()
    assert sessions == []


@patch('browserstate.utils.dynamic_import.import_module')
def test_browser_state_options_priority(mock_import_module, local_storage_base):
    # Set up mock return values for different import calls
    def import_side_effect(module_name, error_message=None):
        if module_name == 'google.cloud.storage':
            mock_gcs = MagicMock()
            mock_gcs.Client.return_value = MagicMock() 
            return mock_gcs
        elif module_name == 'boto3':
            mock_boto3 = MagicMock()
            mock_boto3.client.return_value = MagicMock()
            return mock_boto3
        elif module_name == 'redis':
            mock_redis = MagicMock()
            mock_redis.Redis.from_url.return_value = MagicMock()
            return mock_redis
        elif module_name == 'botocore':
            return MagicMock()
        raise ImportError(f"Module {module_name} not found")

    mock_import_module.side_effect = import_side_effect

    # Test priority order: storage_provider > s3 > gcs > redis > local
    # 1. Test storage_provider priority
    mock_storage = MagicMock()
    options = BrowserStateOptions(
        user_id="test_user",
        storage_provider=mock_storage,
        s3_options={"key": "value"},
        gcs_options={"key": "value"},
        redis_options={"key": "value"}
    )
    browser_state = BrowserState(options)
    assert browser_state.storage == mock_storage

    # 2. Test S3 priority
    options = BrowserStateOptions(
        user_id="test_user",
        s3_options={"key": "value"},
        gcs_options={"key": "value"},
        redis_options={"key": "value"}
    )
    browser_state = BrowserState(options)
    assert isinstance(browser_state.storage, MagicMock)  # Mock S3Storage

    # 3. Test GCS priority
    options = BrowserStateOptions(
        user_id="test_user",
        gcs_options={"key": "value"},
        redis_options={"key": "value"}
    )
    browser_state = BrowserState(options)
    assert isinstance(browser_state.storage, MagicMock)  # Mock GCSStorage

    # 4. Test Redis priority
    options = BrowserStateOptions(
        user_id="test_user",
        redis_options={"key": "value"}
    )
    browser_state = BrowserState(options)
    assert isinstance(browser_state.storage, MagicMock)  # Mock RedisStorage

    # 5. Test LocalStorage fallback
    options = BrowserStateOptions(
        user_id="test_user",
        local_storage_path=local_storage_base
    )
    browser_state = BrowserState(options)
    assert isinstance(browser_state.storage, LocalStorage)


@pytest.mark.asyncio
async def test_browser_state_unmount_exception(local_storage_base):
    user_id = "test_user"
    session_id = "test_session"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id=user_id, storage_provider=storage)
    browser_state = BrowserState(options)
    
    # Create a session
    session_path = os.path.join(local_storage_base, user_id, session_id)
    create_dummy_session(session_path)
    
    # Mount the session
    await browser_state.mount(session_id)
    
    # Mock the upload to raise an exception
    async def mock_upload(*args, **kwargs):
        raise Exception("Simulated upload error")
    
    storage.upload = mock_upload
    
    # Unmount should raise the exception
    with pytest.raises(Exception, match="Simulated upload error"):
        await browser_state.unmount()
    
    # Cleanup
    await browser_state.delete_session(session_id)
