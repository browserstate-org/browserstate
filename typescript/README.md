# Browser State Storage SDK

A TypeScript SDK for managing browser state storage with cloud storage and Redis caching support.

## Features

- Cloud storage integration (Google Cloud Storage)
- Redis caching layer with configurable strategies
- Progress tracking for uploads and downloads
- Background cache synchronization
- Type-safe API
- Extensible provider architecture
- Comprehensive test coverage

## Installation

```bash
npm install browser-state-storage
```

## Development Setup

```bash
# Install dependencies
npm install

# Install dev dependencies
npm install --save-dev jest @types/jest ts-jest
```

## Testing

The SDK includes comprehensive tests for all components:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- RedisStorageProvider.test.ts

# Run tests in watch mode
npm test -- --watch
```

### Test Structure

Tests are organized by component:

```
src/
  __tests__/
    RedisStorageProvider.test.ts
    RedisCacheProvider.test.ts
    StorageManager.test.ts
    ProgressTracker.test.ts
```

### Writing Tests

When adding new features or fixing bugs, please include tests:

```typescript
import { StorageManager } from '../storage/StorageManager';
import { GCSStorageProvider } from '../storage/GCSStorageProvider';
import { RedisCacheProvider } from '../storage/RedisCacheProvider';

describe('StorageManager', () => {
  let manager: StorageManager;
  let mockStorage: jest.Mocked<GCSStorageProvider>;
  let mockCache: jest.Mocked<RedisCacheProvider>;

  beforeEach(() => {
    mockStorage = {
      upload: jest.fn(),
      download: jest.fn(),
      deleteSession: jest.fn(),
      listSessions: jest.fn()
    } as any;

    mockCache = {
      upload: jest.fn(),
      download: jest.fn(),
      deleteSession: jest.fn(),
      listSessions: jest.fn()
    } as any;

    manager = new StorageManager({
      storageProvider: mockStorage,
      cacheProvider: mockCache
    });
  });

  it('should handle cache hits correctly', async () => {
    const sessionId = 'test-session';
    const testData = 'test-data';
    
    mockCache.download.mockResolvedValue(testData);
    
    const result = await manager.download(sessionId);
    
    expect(result).toBe(testData);
    expect(mockStorage.download).not.toHaveBeenCalled();
  });

  it('should handle cache misses correctly', async () => {
    const sessionId = 'test-session';
    const testData = 'test-data';
    
    mockCache.download.mockResolvedValue(null);
    mockStorage.download.mockResolvedValue(testData);
    
    const result = await manager.download(sessionId);
    
    expect(result).toBe(testData);
    expect(mockStorage.download).toHaveBeenCalledWith(sessionId);
  });
});
```

### Test Coverage

The project maintains high test coverage:
- Unit tests for all components
- Integration tests for provider interactions
- Error handling tests
- Edge case coverage

## Quick Start

### Basic Usage with GCS and Redis Cache

```typescript
import { StorageManager } from 'browser-state-storage';

// Create storage manager with GCS and Redis
const manager = new StorageManager({
  storageProvider: new GCSStorageProvider({
    bucketName: 'my-bucket',
    projectID: 'my-project',
    keyFilename: 'path/to/key.json'
  }),
  cacheProvider: new RedisCacheProvider({
    host: 'localhost',
    port: 6379,
    password: 'optional-password',
    db: 0
  }),
  options: {
    maxCacheSize: 1000,        // Maximum number of sessions to cache
    cacheStrategy: 'lru',      // 'lru' or 'fifo'
    backgroundSync: true       // Update cache asynchronously
  }
});

// Upload session data
await manager.upload('session1', JSON.stringify({ /* session data */ }));

// Download session data
const data = await manager.download('session1');

// List all sessions
const sessions = await manager.listSessions();

// Delete a session
await manager.deleteSession('session1');

// Track upload/download progress
manager.onProgress(progress => {
  console.log(`Operation progress: ${progress}%`);
});
```

### Using the Factory Method (Simpler Configuration)

```typescript
import { StorageManager } from 'browser-state-storage';

// Create storage manager using the factory method
const manager = StorageManager.fromOptions({
  gcsOptions: {
    bucketName: 'my-bucket',
    projectID: 'my-project',
    keyFilename: 'path/to/key.json'
  },
  redisOptions: {
    host: 'localhost',
    port: 6379,
    password: 'optional-password',
    db: 0
  },
  maxCacheSize: 1000,
  cacheStrategy: 'lru',
  backgroundSync: true
});
```

### Using Without Cache

```typescript
import { StorageManager } from 'browser-state-storage';

// Create storage manager without caching
const manager = new StorageManager({
  storageProvider: new GCSStorageProvider({
    bucketName: 'my-bucket',
    projectID: 'my-project',
    keyFilename: 'path/to/key.json'
  })
});
```

## Architecture

The SDK uses a provider-based architecture:

1. **StorageProvider**: Handles persistent storage (e.g., GCS)
2. **CacheProvider**: Manages caching layer (e.g., Redis)
3. **StorageManager**: Coordinates between storage and cache

### Cache Behavior

- **Read Strategy**:
  1. Try cache first
  2. If cache miss, read from storage
  3. Update cache in background (if enabled)

- **Write Strategy**:
  1. Write to storage first
  2. Update cache in background (if enabled)
  3. If background sync is disabled, wait for cache update

- **Cache Eviction**:
  - LRU (Least Recently Used): Removes least recently accessed items
  - FIFO (First In, First Out): Removes oldest items first

## Configuration Options

### StorageManager Options

```typescript
interface StorageManagerOptions {
  maxCacheSize?: number;      // Maximum number of sessions to cache
  cacheStrategy?: 'lru' | 'fifo';  // Cache eviction strategy
  backgroundSync?: boolean;   // Whether to update cache asynchronously
}
```

### GCS Storage Provider Options

```typescript
interface GCSOptions {
  bucketName: string;        // GCS bucket name
  projectID: string;         // GCP project ID
  keyFilename: string;       // Path to service account key file
}
```

### Redis Cache Provider Options

```typescript
interface RedisOptions {
  host: string;             // Redis host
  port: number;             // Redis port
  password?: string;        // Optional password
  db?: number;             // Optional database number
}
```

## Error Handling

The SDK provides comprehensive error handling:

- Storage errors are propagated to the caller
- Cache errors are logged but don't block operations
- Background sync errors are logged but don't affect the main operation

## Progress Tracking

Track upload and download progress:

```typescript
manager.onProgress(progress => {
  console.log(`Operation progress: ${progress}%`);
});

// Remove progress listener
manager.offProgress(callback);
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT