"""
Helper module for running TypeScript storage operations from Python tests.

This module provides a Python interface to the TypeScript implementation's
storage functionality to enable interoperability testing.
"""

import os
import json
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List

def run_ts_helper(
    action: str,
    user_id: str,
    session_id: str,
    session_dir: Optional[str] = None,
    **kwargs
) -> str:
    """
    Run the TypeScript helper script with the given arguments.
    
    Args:
        action: The action to perform (upload, download, list, delete)
        user_id: The user ID
        session_id: The session ID
        session_dir: Optional path to the session directory (required for upload)
        **kwargs: Additional arguments to pass to the helper script
        
    Returns:
        The output of the TypeScript helper script
    """
    # Determine the path to the TypeScript helper script
    helper_dir = Path(__file__).parent
    
    if action.startswith('local-'):
        # Local storage helper
        script_path = helper_dir / "ts_local_helper.js"
        action = action[6:]  # Remove 'local-' prefix
    elif action.startswith('s3-'):
        # S3 storage helper
        script_path = helper_dir / "ts_s3_helper.js"
        action = action[3:]  # Remove 's3-' prefix
    else:
        # Redis storage helper
        script_path = helper_dir / "ts_redis_helper.js"
    
    # Build command
    cmd = ["node", str(script_path), action, user_id, session_id]
    
    # Add session_dir if provided
    if session_dir:
        cmd.append(session_dir)
    
    # Add additional arguments
    env = os.environ.copy()
    for key, value in kwargs.items():
        env[f"TS_HELPER_{key.upper()}"] = str(value)
    
    try:
        # Run the command
        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        # Return error message
        return f"ERROR: Command failed with exit code {e.returncode}. {e.stderr}" 