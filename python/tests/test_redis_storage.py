import os
import filecmp
import tempfile
import shutil
from browserstate.storage.redis_storage import RedisStorage

def test_redis_storage_upload_download(fake_redis, dummy_session_dir):
    user_id = "test_user"
    session_id = "session_redis"
    
    storage = RedisStorage(redis_url="redis://localhost:6379/0", key_prefix="browserstate")
    
    # Upload the dummy session to Redis.
    storage.upload(user_id, session_id, dummy_session_dir)
    
    # Download the session from Redis.
    downloaded_path = storage.download(user_id, session_id)
    
    # Verify that a known file exists and has correct content.
    original_file = os.path.join(dummy_session_dir, "test.txt")
    downloaded_file = os.path.join(downloaded_path, os.path.basename(dummy_session_dir), "test.txt")
    # Note: In the tar archive the folder name is preserved by tar.add.
    assert os.path.exists(downloaded_file)
    assert filecmp.cmp(original_file, downloaded_file, shallow=False)
    
    # List sessions and check that session_id is returned.
    sessions = storage.list_sessions(user_id)
    assert session_id in sessions
    
    # Delete session and verify it is removed.
    storage.delete_session(user_id, session_id)
    sessions_after = storage.list_sessions(user_id)
    assert session_id not in sessions_after
    
    # Cleanup temporary download folder.
    shutil.rmtree(downloaded_path, ignore_errors=True)

def test_redis_storage_empty_session(fake_redis):
    user_id = "test_user"
    session_id = "nonexistent"
    
    storage = RedisStorage(redis_url="redis://localhost:6379/0", key_prefix="browserstate")
    # Download for a non-existent session should return an empty directory.
    downloaded_path = storage.download(user_id, session_id)
    assert os.path.exists(downloaded_path)
    assert not os.listdir(downloaded_path)
    # Cleanup
    import shutil
    shutil.rmtree(downloaded_path, ignore_errors=True)
