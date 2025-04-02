#!/usr/bin/env python3
import argparse
import asyncio
from test_browser_state import create_state, verify_state

def parse_args():
    parser = argparse.ArgumentParser(description="Python BrowserState Test Runner")
    parser.add_argument("--mode", choices=["create", "verify"], required=True, help="Test mode: create or verify state")
    parser.add_argument("--browser", choices=["chromium", "webkit", "firefox"], required=True, help="Browser to use")
    parser.add_argument("--session", required=True, help="Session ID to use for test")
    return parser.parse_args()

async def main():
    args = parse_args()
    if args.mode == "create":
        await create_state(args.browser, args.session)
    elif args.mode == "verify":
        await verify_state(args.browser, args.session)

if __name__ == "__main__":
    asyncio.run(main())
