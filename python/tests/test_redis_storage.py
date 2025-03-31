import os
import filecmp
import shutil
from browserstate.storage.redis_storage import RedisStorage

def test_redis_storage_upload_download(fake_redis, dummy_session_dir):
    user_id = "test_user"
    session_id = "session_redis"
    storage = RedisStorage(redis_url="redis://localhost:6379/0", key_prefix="browserstate")
    
    storage.upload(user_id, session_id, dummy_session_dir)
    downloaded_path = storage.download(user_id, session_id)
    
    original_file = os.path.join(dummy_session_dir, "test.txt")
    downloaded_file = os.path.join(downloaded_path, os.path.basename(dummy_session_dir), "test.txt")

    # Based on the format, the file will be either a tar.gz or a zip
    if storage.format == "tar.gz":
        expected_file = os.path.join(downloaded_path, os.path.basename(dummy_session_dir), "test.txt")
    else:  # zip format (TypeScript-compatible)
        expected_file = os.path.join(downloaded_path, "test.txt")

    assert os.path.exists(expected_file)
    assert filecmp.cmp(original_file, expected_file, shallow=False)
    
    sessions = storage.list_sessions(user_id)
    assert session_id in sessions
    storage.delete_session(user_id, session_id)
    sessions_after = storage.list_sessions(user_id)
    assert session_id not in sessions_after
    shutil.rmtree(downloaded_path, ignore_errors=True)

def test_redis_storage_empty_session(fake_redis):
    user_id = "test_user"
    session_id = "nonexistent"
    storage = RedisStorage(redis_url="redis://localhost:6379/0", key_prefix="browserstate")
    
    downloaded_path = storage.download(user_id, session_id)
    assert os.path.exists(downloaded_path)
    assert not os.listdir(downloaded_path)
    shutil.rmtree(downloaded_path, ignore_errors=True)
