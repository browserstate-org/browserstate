#!/usr/bin/env python3
"""
Example demonstrating Python to TypeScript interop with Redis storage.
This script creates a browser state in Python and stores it in Redis,
which can then be read by the TypeScript implementation.
"""

import os
import json
import tempfile
import shutil
import asyncio
from pathlib import Path
from browserstate import BrowserState, BrowserStateOptions

# Redis configuration matching TypeScript example
REDIS_CONFIG = {
    "host": "localhost",
    "port": 6379,
    "password": None,
    "db": 0,
    "key_prefix": "browserstate",
}


def create_test_data(base_dir: str) -> None:
    """Create test data in the specified directory."""
    # Create a test file
    test_file = Path(base_dir) / "test.txt"
    test_file.write_text("Test data from Python implementation")

    # Create a subdirectory with nested files
    subdir = Path(base_dir) / "subdir"
    subdir.mkdir(exist_ok=True)
    (subdir / "nested.txt").write_text("Nested file from Python")

    # Create a JSON file with metadata
    metadata = {
        "created_by": "python",
        "timestamp": "2024-04-01T00:00:00Z",
        "version": "1.0.0",
    }
    (base_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))


async def main():
    print("🚀 Starting Python to TypeScript Redis Interop Demo\n")

    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"📂 Created temporary directory: {temp_dir}")

        create_test_data(Path(temp_dir))
        print("📝 Created test files")

        print("\n🔧 Initializing BrowserState with Redis storage...")
        options = BrowserStateOptions(
            user_id="interop_test_user", redis_options=REDIS_CONFIG
        )
        browser_state = BrowserState(options)

        print("\n📤 Uploading test data to Redis...")
        session_id = "python_created_session"
        await browser_state.storage.upload("interop_test_user", session_id, temp_dir)

        print("\n✅ Verification:")
        print(f"  - User ID: interop_test_user")
        print(f"  - Session ID: {session_id}")
        print(f"  - Key prefix: {REDIS_CONFIG['key_prefix']}")

        sessions = await browser_state.list_sessions()
        print(f"\n📋 Available sessions: {sessions}")

        print("\n✨ Python state creation complete!")
        print("You can now run the TypeScript example to verify the state")


if __name__ == "__main__":
    asyncio.run(main())
