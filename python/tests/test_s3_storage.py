import os
import filecmp
import shutil
from browserstate.storage.s3_storage import S3Storage

def test_s3_storage_upload_download(s3_bucket, dummy_session_dir):
    user_id = "s3_user"
    session_id = "session_s3"
    
    storage = S3Storage(bucket_name=s3_bucket)
    
    # Upload dummy session to S3.
    storage.upload(user_id, session_id, dummy_session_dir)
    
    # Download the session from S3.
    downloaded_path = storage.download(user_id, session_id)
    
    # Verify that the main file exists and its contents match.
    original_file = os.path.join(dummy_session_dir, "test.txt")
    downloaded_file = os.path.join(downloaded_path, "test.txt")
    assert os.path.exists(downloaded_file)
    assert filecmp.cmp(original_file, downloaded_file, shallow=False)
    
    # Check subfolder file.
    original_subfile = os.path.join(dummy_session_dir, "subfolder", "sub.txt")
    downloaded_subfile = os.path.join(downloaded_path, "subfolder", "sub.txt")
    assert os.path.exists(downloaded_subfile)
    assert filecmp.cmp(original_subfile, downloaded_subfile, shallow=False)
    
    # List sessions and verify.
    sessions = storage.list_sessions(user_id)
    assert session_id in sessions
    
    # Delete session and check that it is removed.
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
    import shutil
    shutil.rmtree(downloaded_path, ignore_errors=True)
