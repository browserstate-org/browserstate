"""
BrowserState Package Setup
"""

from setuptools import setup, find_packages

setup(
    name="browserstate",
    version="0.1.0",
    packages=find_packages(include=["python", "python.*", "tests", "tests.*"]),
    install_requires=[
        "redis",
        "boto3",
        "moto",
        "google-cloud-storage",
    ],
    python_requires=">=3.7",
) 