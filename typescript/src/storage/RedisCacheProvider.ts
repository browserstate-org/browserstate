import { Redis } from "ioredis";
import { StorageProvider } from "./StorageProvider";
import { CacheProvider } from "./CacheProvider";
import fs from "fs-extra";

export interface RedisCacheOptions {
  // Basic connection options
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean | { rejectUnauthorized: boolean };

  // Cache configuration
  keyPrefix?: string;
  ttl?: number; // Time to live in seconds
  maxSize?: number; // Maximum number of sessions to cache
  maxMemory?: string; // Maximum memory usage (e.g., '2gb')

  // Advanced options
  compression?: boolean; // Whether to compress data before caching
  cacheStrategy?: "lru" | "fifo"; // Cache eviction strategy
  validateOnRead?: boolean; // Whether to validate cached paths on read
  backgroundSync?: boolean; // Whether to sync in background
}

/**
 * Redis cache provider that wraps a cloud storage provider
 * to provide fast access to frequently used sessions
 */
export class RedisCacheProvider implements CacheProvider {
  protected redis: Redis;
  protected storageProvider: StorageProvider;
  protected keyPrefix: string;
  protected ttl: number;
  protected maxSize: number;
  protected cacheStrategy: "lru" | "fifo";
  protected validateOnRead: boolean;
  protected backgroundSync: boolean;

  constructor(storageProvider: StorageProvider, options: RedisCacheOptions) {
    this.storageProvider = storageProvider;
    this.keyPrefix = options.keyPrefix || "browserstate:";
    this.ttl = options.ttl || 3600; // Default 1 hour
    this.maxSize = options.maxSize || 100; // Default 100 sessions
    this.cacheStrategy = options.cacheStrategy || "lru";
    this.validateOnRead = options.validateOnRead ?? true;
    this.backgroundSync = options.backgroundSync ?? false;

    // Configure Redis connection
    this.redis = new Redis({
      host: options.host,
      port: options.port,
      password: options.password,
      db: options.db,
      tls: typeof options.tls === "boolean" ? undefined : options.tls,
    });

    // Set up Redis memory limits if specified
    if (options.maxMemory) {
      this.redis.config("SET", "maxmemory", options.maxMemory);
      this.redis.config(
        "SET",
        "maxmemory-policy",
        this.cacheStrategy === "lru" ? "allkeys-lru" : "allkeys-fifo",
      );
    }
  }

  private getSessionKey(sessionId: string): string {
    return `${this.keyPrefix}session:${sessionId}`;
  }

  private getMetadataKey(sessionId: string): string {
    return `${this.keyPrefix}metadata:${sessionId}`;
  }

  private getAccessKey(sessionId: string): string {
    return `${this.keyPrefix}access:${sessionId}`;
  }

  async download(sessionId: string): Promise<string | null> {
    const sessionKey = this.getSessionKey(sessionId);
    const metadataKey = this.getMetadataKey(sessionId);

    // Check if session exists in cache
    const [sessionData, metadata] = await Promise.all([
      this.redis.get(sessionKey),
      this.redis.get(metadataKey),
    ]);

    if (!sessionData || !metadata) {
      return null;
    }

    // Validate cached data if enabled
    if (this.validateOnRead) {
      try {
        const { filePath } = JSON.parse(metadata);
        if (!(await fs.pathExists(filePath))) {
          await this.invalidateCache(sessionId);
          return null;
        }
      } catch (error) {
        console.warn(`Failed to validate cached session ${sessionId}:`, error);
        return null;
      }
    }

    // Update access time for LRU
    if (this.cacheStrategy === "lru") {
      await this.redis.zadd(`${this.keyPrefix}access`, Date.now(), sessionId);
    }

    return sessionData;
  }

  async upload(sessionId: string, data: string): Promise<void> {
    const sessionKey = this.getSessionKey(sessionId);
    const metadataKey = this.getMetadataKey(sessionId);

    // Store session data
    await this.redis.set(sessionKey, data, "EX", this.ttl);

    // Store metadata
    const metadata = {
      timestamp: Date.now(),
      size: data.length,
    };
    await this.redis.set(metadataKey, JSON.stringify(metadata), "EX", this.ttl);

    // Update access time for LRU
    if (this.cacheStrategy === "lru") {
      await this.redis.zadd(`${this.keyPrefix}access`, Date.now(), sessionId);
    }

    // Check cache size and evict if necessary
    const size = await this.redis.dbsize();
    if (size > this.maxSize) {
      await this.evictOldestSession();
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const sessionKey = this.getSessionKey(sessionId);
    const metadataKey = this.getMetadataKey(sessionId);

    await Promise.all([
      this.redis.del(sessionKey),
      this.redis.del(metadataKey),
      this.redis.zrem(`${this.keyPrefix}access`, sessionId),
    ]);
  }

  async listSessions(): Promise<string[]> {
    const keys = await this.redis.keys(`${this.keyPrefix}session:*`);
    return keys.map((key) => key.replace(`${this.keyPrefix}session:`, ""));
  }

  private async evictOldestSession(): Promise<void> {
    if (this.cacheStrategy === "lru") {
      const oldestSession = await this.redis.zrange(
        `${this.keyPrefix}access`,
        0,
        0,
      );
      if (oldestSession.length > 0) {
        await this.deleteSession(oldestSession[0]);
      }
    } else {
      // FIFO strategy - delete oldest by creation time
      const sessions = await this.listSessions();
      if (sessions.length > 0) {
        await this.deleteSession(sessions[0]);
      }
    }
  }

  private async invalidateCache(sessionId: string): Promise<void> {
    await this.deleteSession(sessionId);
  }
}
