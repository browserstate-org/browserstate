import os
import shutil
import tempfile
import pytest
import asyncio
from unittest.mock import MagicMock, patch
from browserstate import BrowserState, BrowserStateOptions
from browserstate.storage import LocalStorage


# Helper to create a dummy session file.
def create_dummy_session(path):
    os.makedirs(path, exist_ok=True)
    file_path = os.path.join(path, "state.txt")
    with open(file_path, "w") as f:
        f.write("Session state content.")
    return path


@pytest.fixture
def temp_dir(tmp_path):
    """Create a temporary directory for testing"""
    return str(tmp_path)


@pytest.fixture
def storage_provider(temp_dir):
    """Create a local storage provider for testing"""
    return LocalStorage(temp_dir)


@pytest.fixture
def browser_state(storage_provider):
    """Create a browser state instance for testing"""
    options = BrowserStateOptions(
        user_id="test_user",
        storage_provider=storage_provider,
    )
    return BrowserState(options)


@pytest.mark.asyncio
async def test_mount_session(browser_state, temp_dir):
    """Test mounting a session"""
    session_id = "test_session"
    session_path = os.path.join(temp_dir, session_id)
    os.makedirs(session_path, exist_ok=True)

    # Create a test file
    test_file = os.path.join(session_path, "test.txt")
    with open(test_file, "w") as f:
        f.write("test content")

    # Upload the session first
    await browser_state.storage.upload(browser_state.user_id, session_id, session_path)

    # Mount the session
    active_session = await browser_state.mount(session_id)
    assert browser_state.get_current_session() == session_id
    downloaded_file = os.path.join(active_session, "test.txt")
    assert os.path.exists(downloaded_file)
    with open(downloaded_file, "r") as f:
        assert f.read() == "test content"


@pytest.mark.asyncio
async def test_unmount_session(browser_state, temp_dir):
    """Test unmounting a session"""
    session_id = "test_session"
    session_path = os.path.join(temp_dir, session_id)
    os.makedirs(session_path, exist_ok=True)

    # Mount and then unmount the session
    await browser_state.mount(session_id)
    await browser_state.unmount()

    # Verify the session is unmounted
    assert browser_state.get_current_session() is None
    assert browser_state.get_current_session_path() is None


@pytest.mark.asyncio
async def test_list_sessions(browser_state, temp_dir):
    """Test listing sessions"""
    # Create multiple sessions
    for i in range(3):
        session_id = f"session_{i}"
        session_path = os.path.join(temp_dir, session_id)
        os.makedirs(session_path, exist_ok=True)
        create_dummy_session(session_path)
        await browser_state.storage.upload(
            browser_state.user_id, session_id, session_path
        )

    # List sessions
    sessions = await browser_state.list_sessions()
    assert len(sessions) == 3
    for i in range(3):
        assert f"session_{i}" in sessions


@pytest.mark.asyncio
async def test_delete_session(browser_state, temp_dir):
    """Test deleting a session"""
    session_id = "test_session"
    session_path = os.path.join(temp_dir, session_id)
    os.makedirs(session_path, exist_ok=True)
    create_dummy_session(session_path)

    # Delete the session
    await browser_state.delete_session(session_id)

    # Verify the session is deleted
    sessions = await browser_state.list_sessions()
    assert session_id not in sessions


@pytest.mark.asyncio
async def test_delete_active_session(browser_state, temp_dir):
    """Test deleting an active session"""
    session_id = "test_session"
    session_path = os.path.join(temp_dir, session_id)
    os.makedirs(session_path, exist_ok=True)
    create_dummy_session(session_path)

    # Mount the session
    await browser_state.mount(session_id)

    # Delete the active session
    await browser_state.delete_session(session_id)

    # Verify the session is deleted and unmounted
    sessions = await browser_state.list_sessions()
    assert session_id not in sessions
    assert browser_state.get_current_session() is None
    assert browser_state.get_current_session_path() is None


@pytest.mark.asyncio
async def test_storage_provider_initialization():
    """Test storage provider initialization with different options"""
    # Test S3 storage initialization
    s3_options = {
        "bucket_name": "test-bucket",
        "access_key_id": "test-key",
        "secret_access_key": "test-secret",
        "region": "us-east-1",
    }
    options = BrowserStateOptions(user_id="test_user", s3_options=s3_options)
    browser_state = BrowserState(options)
    assert browser_state.storage.__class__.__name__ == "S3Storage"

    # Test Redis storage initialization
    redis_options = {
        "host": "localhost",
        "port": 6379,
        "key_prefix": "test-prefix",
    }
    options = BrowserStateOptions(user_id="test_user", redis_options=redis_options)
    browser_state = BrowserState(options)
    assert browser_state.storage.__class__.__name__ == "RedisStorage"

    # Test local storage initialization
    options = BrowserStateOptions(user_id="test_user", local_storage_path="/tmp/test")
    browser_state = BrowserState(options)
    assert browser_state.storage.__class__.__name__ == "LocalStorage"


@pytest.mark.asyncio
async def test_browser_state_mount_and_unmount(local_storage_base):
    user_id = "browser_user"
    session_id = "session_browser"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(
        user_id=user_id, local_storage_path=local_storage_base
    )
    browser_state = BrowserState(options)

    # Simulate an existing session.
    session_storage_path = os.path.join(local_storage_base, user_id, session_id)
    create_dummy_session(session_storage_path)

    # Mount the session.
    active_session = await browser_state.mount(session_id)
    assert browser_state.get_current_session() == session_id
    downloaded_file = os.path.join(active_session, "state.txt")
    assert os.path.exists(downloaded_file)


@pytest.mark.asyncio
async def test_mount_nonexistent_session(local_storage_base):
    user_id = "edge_user"
    session_id = "nonexistent_session"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(
        user_id=user_id, local_storage_path=local_storage_base
    )
    browser_state = BrowserState(options)

    active_session = await browser_state.mount(session_id)
    assert os.path.exists(active_session)
    assert os.listdir(active_session) == []

    await browser_state.delete_session(session_id)


@pytest.mark.asyncio
async def test_double_mount_unmount(local_storage_base):
    user_id = "double_user"
    session_id = "double_session"
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(
        user_id=user_id, local_storage_path=local_storage_base
    )
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

    options = BrowserStateOptions(
        user_id=user_id, local_storage_path=local_storage_base
    )
    browser_state = BrowserState(options)
    sessions = await browser_state.list_sessions()
    assert sessions == []


@pytest.mark.asyncio
async def test_invalid_input_empty_strings(local_storage_base):
    """Test validation of empty user_id and session_id"""
    storage = LocalStorage(local_storage_base)
    options = BrowserStateOptions(user_id="test_user", storage_provider=storage)
    browser_state = BrowserState(options)

    # Test empty session_id
    with pytest.raises(ValueError, match="session_id cannot be empty"):
        await browser_state.mount("")

    # Test empty user_id
    options = BrowserStateOptions(user_id="", storage_provider=storage)
    browser_state = BrowserState(options)
    with pytest.raises(ValueError, match="user_id cannot be empty"):
        await browser_state.mount("test_session")


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
    options = BrowserStateOptions(
        user_id=user_id, local_storage_path=local_storage_base
    )
    browser_state = BrowserState(options)

    active_session = await browser_state.mount(session_id)
    assert browser_state.get_current_session() == session_id
    assert os.path.exists(active_session)
    assert os.listdir(active_session) == []

    await browser_state.delete_session(session_id)


@pytest.mark.asyncio
async def test_browser_state_unmount_no_active_session(local_storage_base, caplog):
    user_id = "test_user"
    options = BrowserStateOptions(
        user_id=user_id, local_storage_path=local_storage_base
    )
    browser_state = BrowserState(options)

    await browser_state.unmount()
    assert "No active session to unmount" in caplog.text


@pytest.mark.asyncio
async def test_browser_state_delete_non_existent_session(local_storage_base, caplog):
    user_id = "test_user"
    session_id = "no_such_session"
    options = BrowserStateOptions(
        user_id=user_id, local_storage_path=local_storage_base
    )
    browser_state = BrowserState(options)

    # Should not raise an error.
    await browser_state.delete_session(session_id)


@pytest.mark.asyncio
async def test_browser_state_list_sessions_empty(local_storage_base):
    user_id = "empty_user"
    options = BrowserStateOptions(
        user_id=user_id, local_storage_path=local_storage_base
    )
    browser_state = BrowserState(options)

    sessions = await browser_state.list_sessions()
    assert sessions == []


@pytest.mark.skip(reason="Test requires Google Cloud credentials")
@patch("browserstate.utils.dynamic_import.google_cloud_storage")
@patch("browserstate.utils.dynamic_import.boto3") 
@patch("browserstate.utils.dynamic_import.redis_module")
def test_browser_state_options_priority(mock_redis, mock_boto3, mock_gcs, local_storage_base):
    """Test storage provider initialization priority"""
    
    # Set up proper mock implementation for LazyModule
    mock_boto3_module = MagicMock()
    mock_boto3.get_module.return_value = mock_boto3_module
    mock_boto3_module.client.return_value = MagicMock()
    
    mock_gcs_module = MagicMock()
    mock_gcs.get_module.return_value = mock_gcs_module
    mock_gcs_module.Client.return_value = MagicMock()
    
    mock_redis_module = MagicMock()
    mock_redis.get_module.return_value = mock_redis_module
    mock_redis_module.from_url.return_value = MagicMock()

    # Test priority order: storage_provider > s3 > gcs > redis > local
    # 1. Test storage_provider priority
    mock_storage = MagicMock()
    options = BrowserStateOptions(
        user_id="test_user",
        storage_provider=mock_storage,
        s3_options={"bucket_name": "test-bucket"},
        gcs_options={"project_id": "test-project"},
        redis_options={"host": "localhost"},
    )
    browser_state = BrowserState(options)
    assert browser_state.storage == mock_storage

    # 2. Test S3 priority
    options = BrowserStateOptions(
        user_id="test_user",
        s3_options={"bucket_name": "test-bucket"},
        gcs_options={"project_id": "test-project"},
        redis_options={"host": "localhost"},
    )
    browser_state = BrowserState(options)
    assert browser_state.storage.__class__.__name__ == "S3Storage"

    # 3. Test GCS priority
    options = BrowserStateOptions(
        user_id="test_user",
        gcs_options={"bucket_name": "test-bucket", "project_id": "test-project"},
        redis_options={"host": "localhost"},
    )
    browser_state = BrowserState(options)
    assert browser_state.storage.__class__.__name__ == "GCSStorage"

    # 4. Test Redis priority
    options = BrowserStateOptions(
        user_id="test_user", redis_options={"host": "localhost"}
    )
    browser_state = BrowserState(options)
    assert browser_state.storage.__class__.__name__ == "RedisStorage"

    # 5. Test LocalStorage fallback
    options = BrowserStateOptions(
        user_id="test_user", local_storage_path=local_storage_base
    )
    browser_state = BrowserState(options)
    assert browser_state.storage.__class__.__name__ == "LocalStorage"


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
