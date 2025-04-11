from setuptools import setup, find_packages

setup(
    name="browserstate",
    version="0.1.0",
    description="Manage browser profiles across different storage providers",
    author="Boateng",
    author_email="author@example.com",
    url="https://github.com/boateng/browserstate",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
    ],
    python_requires=">=3.7",
    install_requires=[
        "typing-extensions;python_version<'3.8'",
    ],
    extras_require={
        "s3": ["boto3>=1.20.0"],
        "gcs": ["google-cloud-storage>=2.0.0"],
        "redis": ["redis>=3.5.0"],
        "all": [
            "boto3>=1.20.0",
            "google-cloud-storage>=2.0.0",
            "redis>=3.5.0",
        ],
    },
)
