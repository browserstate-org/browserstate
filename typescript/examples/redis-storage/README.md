# Redis as Primary Storage for BrowserState

This example demonstrates how to use Redis as a primary storage backend for browser states, not just as a caching layer.

## Why Use Redis as Primary Storage?

- **Speed**: Both read and write operations are extremely fast
- **Simplicity**: No cloud provider configuration needed
- **Persistence**: Redis can be configured for persistence with AOF/RDB
- **Clustering**: Works well in microservices and containerized environments
- **Low overhead**: Minimal operational complexity

## Prerequisites

- Redis server running (default: localhost:6379)
- Node.js and npm installed
- Playwright installed for browser automation

## How It Works

This example implements a custom `RedisBrowserState` class that uses the `RedisStorageProvider` directly as the primary storage mechanism. The provider stores:

- Browser profile files directly in Redis
- Session metadata for easy retrieval
- File structure and content

## Configuration Options

```typescript
const REDIS_CONFIG: RedisStorageOptions = {
  // Basic connection options
  host: 'localhost',
  port: 6379,
  password: undefined, // Add if using password
  db: 0,
  
  // Storage configuration
  keyPrefix: 'browserstate:',
  
  // Advanced options
  maxFileSize: 5 * 1024 * 1024, // 5MB per file
  compression: false, // Optional compression
  ttl: 604800, // 7 days TTL
};
```

## Running the Example

1. Start Redis server:
   ```
   redis-server
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the example:
   ```
   npx ts-node examples/redis-storage/redis-storage-example.ts
   ```

## What to Expect

1. The example will connect to Redis
2. Create or restore a browser session
3. Open a browser with the test page
4. Add notes to the page (stored in localStorage)
5. Close the browser and save the state to Redis
6. Reopen the browser with restored state
7. Add another note to verify persistence
8. Close and save the final state

## Redis Data Structure

- **Key format**: `browserstate:{userId}:{sessionId}`
- **Storage**: Browser files stored as JSON with paths as keys
- **Metadata**: Session creation time, access time, etc.

## Limitations

- Large files (>5MB by default) are skipped to avoid Redis memory issues
- Redis server must have enough memory to store all session data
- Compression is currently stubbed but not fully implemented

## Further Improvements

- Enable compression for larger files
- Implement delta sync for incremental updates
- Add background sync for non-blocking operations
- Configure Redis Sentinel for high availability 