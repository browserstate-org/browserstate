# BrowserState

BrowserState is a cross-language library for saving and restoring browser profiles across machines using various storage providers. It helps you maintain browser state (cookies, local storage, etc.) between automated browser sessions.

## Features

- Save browser profiles to multiple storage backends
- Restore browser profiles on different machines
- Support for multiple storage providers:
  - ✅ Local storage (extensively tested)
  - ⚠️ AWS S3 (needs additional testing)
  - ⚠️ Google Cloud Storage (needs additional testing)
- Language support:
  - TypeScript/JavaScript
  - Python

## Implementation Status

| Feature | TypeScript | Python |
|---------|------------|--------|
| Local Storage | ✅ Tested | ✅ Implemented |
| S3 Storage | ⚠️ Implemented | ⚠️ Implemented |
| GCS Storage | ⚠️ Implemented | ⚠️ Implemented |
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