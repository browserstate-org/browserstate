# BrowserState

BrowserState is a cross-language library for saving and restoring browser profiles across machines using various storage providers. It helps you maintain browser state (cookies, local storage, etc.) between automated browser sessions.

# Why BrowserState?
Most browser automation workflows fail because authentication and session data don't persist reliably across environments. Manually handling cookies or re-authenticating slows everything down. Worse, many automations fail due to inconsistent browser fingerprints, machine IDs, and storage states—leading to bot detection and bans.

BrowserState ensures your automation behaves like a real, returning user by providing:


Full Browser Context Restoration – Save and restore cookies, local storage, IndexedDB, service worker caches, and extension data. Resume automation 
from the exact previous state.

Multi-Instance Synchronization – Share browser profiles across multiple servers or devices, making automation scalable and resilient.

Zero-Setup Onboarding for Automation – Instantly deploy automation-ready browser profiles without manual setup.

Efficient Resource Usage – Persistent browser usage without memory leaks, eliminating the need to launch new instances for every run.

Faster Debugging & Reproducibility – Store failing test cases exactly as they were, making it easy to diagnose automation failures.

Offline Execution & Caching – Automate tasks that rely on cached assets, such as scraping content behind paywalls or working in low-connectivity environments.

Cross-Device Synchronization – Seamlessly move between local development, cloud servers, and headless automation.

✅ Bot Detection Bypass
Many bot detection systems track inconsistencies in browser states—frequent changes to fingerprints, device identifiers, and storage behavior trigger red flags. Most people get detected because they unknowingly create a "new machine" every time.

BrowserState solves this by preserving a stable, persistent browser identity across runs instead of resetting key markers. This drastically reduces detection risks while maintaining full automation control.

Now you can move fast without breaking sessions—or getting flagged as a bot.

## Features

- Save browser profiles to multiple storage backends
- Restore browser profiles on different machines
- Support for multiple storage providers:
  - ✅ Local storage (extensively tested)
  - ⚠️ AWS S3 (needs additional testing)
  - ✅ Google Cloud Storage (tested and works, but requires more extensive testing)
- Language support:
  - TypeScript/JavaScript
  - Python
- Automatic cleanup of temporary files with configurable behavior

## Implementation Status

| Feature | TypeScript | Python |
|---------|------------|--------|
| Local Storage | ✅ Tested | ✅ Implemented |
| S3 Storage | ⚠️ Implemented | ⚠️ Implemented |
| GCS Storage | ✅ Tested and works, but requires more extensive testing | ⚠️ Implemented |
| Browser Compatibility | Chrome, Firefox, Edge | Chrome, Firefox, Edge |

## Usage

See language-specific documentation:

- [TypeScript Documentation](typescript/README.md)
- [Python Documentation](python/README.md)

## Development

This repository contains implementations for multiple languages. The core functionality is mirrored across each language implementation while maintaining idiomatic code for each ecosystem.

### Repository Structure

```
browserstate/
├── typescript/         # TypeScript implementation
├── python/             # Python implementation
└── README.md           # This file
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Issues and Support

If you encounter any problems or have questions about using BrowserState:

1. Check the documentation for your specific language implementation
2. Search existing GitHub issues to see if your problem has been reported
3. Create a new issue with:
   - A clear, descriptive title
   - Which storage provider you're using
   - Which language implementation (TypeScript/Python)
   - Steps to reproduce the issue
   - Expected vs. actual behavior
   - Environment details (browser, OS, etc.)

We especially welcome feedback and testing reports for the S3 and GCS storage providers as they have been implemented but need additional real-world testing.

## License

MIT 