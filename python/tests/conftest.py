import os
import shutil
import tempfile
import pytest
from browserstate.storage.local_storage import LocalStorage
from browserstate.storage.s3_storage import S3Storage
from browserstate.storage.redis_storage import RedisStorage
import fakeredis

# Fixture to create a dummy session directory with some files.
@pytest.fixture
def dummy_session_dir():
    # Create a temporary directory that represents a session folder
    session_dir = tempfile.mkdtemp(prefix="dummy_session_")
    try:
        # Create a file in the root of the session folder.
        file_path = os.path.join(session_dir, "test.txt")
        with open(file_path, "w") as f:
            f.write("Hello, BrowserState!")
        
        # Create a subdirectory with a file.
        sub_dir = os.path.join(session_dir, "subfolder")
        os.makedirs(sub_dir, exist_ok=True)
        sub_file = os.path.join(sub_dir, "sub.txt")
        with open(sub_file, "w") as f:
            f.write("This is a subfolder file.")
        
        yield session_dir
    finally:
        shutil.rmtree(session_dir, ignore_errors=True)

# Fixture for a temporary base directory for LocalStorage.
@pytest.fixture
def local_storage_base():
    base = tempfile.mkdtemp(prefix="local_storage_")
    yield base
    shutil.rmtree(base, ignore_errors=True)

# Fixture for a fake Redis instance using fakeredis.
@pytest.fixture
def fake_redis(monkeypatch):
    try:
        import fakeredis
    except ImportError:
        pytest.skip("fakeredis not installed")
    fake = fakeredis.FakeRedis()
    # Monkey-patch the redis.Redis.from_url to return our fake instance.
    from redis import Redis
    monkeypatch.setattr(Redis, "from_url", lambda url: fake)
    return fake

# Fixture for setting up a fake S3 bucket using moto.
@pytest.fixture
def s3_bucket():
    try:
        from moto import mock_s3
    except ImportError:
        pytest.skip("moto not installed")
    from boto3 import client
    with mock_s3():
        s3 = client("s3", region_name="us-east-1")
        bucket_name = "test-bucket"
        s3.create_bucket(Bucket=bucket_name)
        yield bucket_name
