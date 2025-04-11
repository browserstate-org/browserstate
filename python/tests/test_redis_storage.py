import os
import filecmp
import shutil
import pytest
from unittest.mock import patch, MagicMock

# Try to import Redis
try:
    import redis

    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

try:
    import fakeredis

    HAS_FAKEREDIS = True
except ImportError:
    HAS_FAKEREDIS = False

from browserstate.storage.redis_storage import RedisStorage


@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
def test_redis_storage_upload_download(fake_redis, dummy_session_dir):
    user_id = "test_user"
    session_id = "session_redis"
    storage = RedisStorage(
        redis_url="redis://localhost:6379/0", key_prefix="browserstate"
    )

    storage.upload(user_id, session_id, dummy_session_dir)
    downloaded_path = storage.download(user_id, session_id)

    original_file = os.path.join(dummy_session_dir, "test.txt")
    downloaded_file = os.path.join(
        downloaded_path, os.path.basename(dummy_session_dir), "test.txt"
    )
    assert os.path.exists(downloaded_file)
    assert filecmp.cmp(original_file, downloaded_file, shallow=False)

    sessions = storage.list_sessions(user_id)
    assert session_id in sessions
    storage.delete_session(user_id, session_id)
    sessions_after = storage.list_sessions(user_id)
    assert session_id not in sessions_after
    shutil.rmtree(downloaded_path, ignore_errors=True)


@pytest.mark.skipif(not HAS_FAKEREDIS, reason="fakeredis not installed")
def test_redis_storage_empty_session(fake_redis):
    user_id = "test_user"
    session_id = "nonexistent"
    storage = RedisStorage(
        redis_url="redis://localhost:6379/0", key_prefix="browserstate"
    )

    downloaded_path = storage.download(user_id, session_id)
    assert os.path.exists(downloaded_path)
    assert not os.listdir(downloaded_path)
    shutil.rmtree(downloaded_path, ignore_errors=True)


def test_redis_storage_validation():
    """Test Redis storage validation without needing actual Redis."""
    # Use a mock Redis for validation tests
    mock_redis = MagicMock()

    # Use patches to avoid actual Redis imports
    with patch.dict("sys.modules", {"redis": mock_redis}), patch(
        "browserstate.utils.dynamic_import.redis_module", mock_redis
    ), patch("browserstate.storage.redis_storage.redis_module", mock_redis):
        # Test that colons are not allowed in user_id
        try:
            storage = RedisStorage(
                host="localhost", port=6379, key_prefix="browserstate"
            )
            storage.upload("test:user", "session1", "/tmp")
            assert False, "Should have raised ValueError for colon in user_id"
        except ValueError:
            pass

        # Test that colons are not allowed in session_id
        try:
            storage = RedisStorage(
                host="localhost", port=6379, key_prefix="browserstate"
            )
            storage.upload("testuser", "session:1", "/tmp")
            assert False, "Should have raised ValueError for colon in session_id"
        except ValueError:
            pass

        # Test that colons are not allowed in key_prefix
        try:
            RedisStorage(host="localhost", port=6379, key_prefix="browser:state")
            assert False, "Should have raised ValueError for colon in key_prefix"
        except ValueError:
            pass
