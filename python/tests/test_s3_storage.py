import os
import filecmp
import shutil
from browserstate.storage.s3_storage import S3Storage

def test_s3_storage_upload_download(s3_bucket, dummy_session_dir):
    user_id = "s3_user"
    session_id = "session_s3"
    storage = S3Storage(bucket_name=s3_bucket)
    
    storage.upload(user_id, session_id, dummy_session_dir)
    downloaded_path = storage.download(user_id, session_id)
    
    original_file = os.path.join(dummy_session_dir, "test.txt")
    downloaded_file = os.path.join(downloaded_path, "test.txt")
    assert os.path.exists(downloaded_file)
    assert filecmp.cmp(original_file, downloaded_file, shallow=False)
    
    original_subfile = os.path.join(dummy_session_dir, "subfolder", "sub.txt")
    downloaded_subfile = os.path.join(downloaded_path, "subfolder", "sub.txt")
    assert os.path.exists(downloaded_subfile)
    assert filecmp.cmp(original_subfile, downloaded_subfile, shallow=False)
    
    sessions = storage.list_sessions(user_id)
    assert session_id in sessions
    storage.delete_session(user_id, session_id)
    sessions_after = storage.list_sessions(user_id)
    assert session_id not in sessions_after
    shutil.rmtree(downloaded_path, ignore_errors=True)

def test_s3_storage_empty_session(s3_bucket):
    user_id = "s3_user"
    session_id = "nonexistent"
    storage = S3Storage(bucket_name=s3_bucket)
    
    downloaded_path = storage.download(user_id, session_id)
    assert os.path.exists(downloaded_path)
    assert not os.listdir(downloaded_path)
    shutil.rmtree(downloaded_path, ignore_errors=True)