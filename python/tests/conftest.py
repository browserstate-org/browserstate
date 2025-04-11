import os
import shutil
import tempfile
import pytest
from unittest.mock import MagicMock

# Optional imports for tests
boto3 = None
fakeredis = None
mock_aws = None

try:
    import boto3
    from moto import mock_aws
except ImportError:
    pass

try:
    import fakeredis
except ImportError:
    pass


# Fixture: Dummy session directory with sample files.
@pytest.fixture
def dummy_session_dir():
    session_dir = tempfile.mkdtemp(prefix="dummy_session_")
    try:
        # Root file.
        file_path = os.path.join(session_dir, "test.txt")
        with open(file_path, "w") as f:
            f.write("Hello, BrowserState!")
        # Subdirectory file.
        sub_dir = os.path.join(session_dir, "subfolder")
        os.makedirs(sub_dir, exist_ok=True)
        sub_file = os.path.join(sub_dir, "sub.txt")
        with open(sub_file, "w") as f:
            f.write("This is a subfolder file.")
        yield session_dir
    finally:
        shutil.rmtree(session_dir, ignore_errors=True)


# Fixture: Temporary base directory for LocalStorage.
@pytest.fixture
def local_storage_base():
    base = tempfile.mkdtemp(prefix="local_storage_")
    yield base
    shutil.rmtree(base, ignore_errors=True)


# Fixture: Fake Redis instance (requires fakeredis).
@pytest.fixture
def fake_redis(monkeypatch):
    if fakeredis is None:
        pytest.skip("fakeredis not installed")
    fake = fakeredis.FakeRedis()
    try:
        from redis import Redis

        monkeypatch.setattr(Redis, "from_url", lambda url: fake)
    except ImportError:
        pytest.skip("redis not installed")
    return fake


# Fixture: Fake S3 bucket (requires moto).
@pytest.fixture
def s3_bucket():
    if boto3 is None or mock_aws is None:
        pytest.skip("boto3 or moto not installed")
    with mock_aws():
        s3 = boto3.resource("s3", region_name="us-east-1")
        bucket_name = "test-bucket"
        s3.create_bucket(Bucket=bucket_name)
        yield bucket_name


# Fixture: Dummy GCS bucket for GCSStorage tests.
@pytest.fixture
def dummy_gcs_bucket():
    fake_bucket = MagicMock()
    fake_bucket._storage = {}

    def list_blobs(prefix, delimiter=None):
        blobs = []
        for key, value in fake_bucket._storage.items():
            if key.startswith(prefix):
                fake_blob = MagicMock()
                fake_blob.name = key

                def download_to_filename(filename, content=value):
                    with open(filename, "wb") as f:
                        f.write(content)

                fake_blob.download_to_filename = download_to_filename
                blobs.append(fake_blob)
        if delimiter:
            prefixes = set()
            for key in fake_bucket._storage.keys():
                if key.startswith(prefix):
                    rest = key[len(prefix) :]
                    if delimiter in rest:
                        prefixes.add(prefix + rest.split(delimiter)[0] + delimiter)
            fake_blob_collection = MagicMock()
            fake_blob_collection.__iter__.return_value = blobs
            fake_blob_collection.prefixes = list(prefixes)
            return fake_blob_collection
        return blobs

    fake_bucket.list_blobs = list_blobs

    def blob(blob_name):
        fake_blob = MagicMock()
        fake_blob.name = blob_name

        def upload_from_filename(filename):
            with open(filename, "rb") as f:
                content = f.read()
            fake_bucket._storage[blob_name] = content

        fake_blob.upload_from_filename = upload_from_filename

        def delete():
            if blob_name in fake_bucket._storage:
                del fake_bucket._storage[blob_name]

        fake_blob.delete = delete

        return fake_blob

    fake_bucket.blob = blob
    return fake_bucket


# Fixture: Fake GCS client that returns our dummy bucket.
@pytest.fixture
def fake_gcs_client(dummy_gcs_bucket):
    fake_client = MagicMock()
    fake_client.bucket.return_value = dummy_gcs_bucket
    return fake_client
