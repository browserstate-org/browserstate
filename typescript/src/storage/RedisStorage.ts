import { StorageProvider } from "./StorageProvider";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";

// Convert callback-based zlib functions to promise-based
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Define types without importing ioredis
type RedisOptions = {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: {
    rejectUnauthorized?: boolean;
    ca?: string[];
    cert?: string;
    key?: string;
  };
  retryStrategy?: (times: number) => number;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
};

type Redis = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<"OK">;
  setex(key: string, seconds: number, value: string): Promise<"OK">;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
};

export interface RedisStorageOptions {
  // Basic connection options
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: RedisOptions["tls"];

  // Storage configuration
  keyPrefix?: string;
  tempDir?: string;

  // Advanced options
  maxFileSize?: number; // Maximum file size to store in Redis (default: 1MB)
  compression?: boolean; // Whether to compress data before storing
  ttl?: number; // Time to live in seconds for sessions
}

/**
 * Redis storage provider that stores browser state directly in Redis
 * This is separate from RedisCacheProvider and doesn't interact with cloud storage
 */
export class RedisStorageProvider implements StorageProvider {
  private redis: Redis | null = null;
  private redisModulesLoaded = false;
  private keyPrefix: string;
  private tempDir: string;
  private maxFileSize: number;
  private compression: boolean;
  private ttl?: number;
  private options: RedisStorageOptions;

  constructor(options: RedisStorageOptions) {
    this.keyPrefix = options.keyPrefix || "browserstate:";
    this.tempDir = options.tempDir || os.tmpdir();
    this.maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB default
    this.compression = options.compression || false;
    this.ttl = options.ttl;
    this.options = options;

    // Initialize with dynamic import (but don't throw if it fails)
    this.initClient().catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[Redis] Initialization failed, will retry on first usage:",
          error,
        );
      }
    });
  }

  /**
   * Dynamically imports Redis module
   */
  private async initClient(): Promise<void> {
    if (this.redisModulesLoaded) return;

    try {
      // Dynamically import Redis module
      const Redis = (await import("ioredis")).default;

      // Configure Redis connection
      const redisOptions: RedisOptions = {
        host: this.options.host,
        port: this.options.port,
        password: this.options.password,
        db: this.options.db,
        tls: this.options.tls,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      };

      this.redis = new Redis(redisOptions);
      this.redisModulesLoaded = true;
    } catch (error) {
      this.redis = null;

      // Always throw the error in development
      if (process.env.NODE_ENV !== "production") {
        throw error;
      }

      // In production, we'll throw when methods are called
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.redis) {
      await this.initClient();
      if (!this.redis) {
        throw new Error(
          "Failed to initialize Redis client. Please ensure ioredis is installed.",
        );
      }
    }
  }

  private getSessionKey(userId: string, sessionId: string): string {
    return `${this.keyPrefix}${userId}:${sessionId}`;
  }

  async download(userId: string, sessionId: string): Promise<string> {
    await this.ensureInitialized();
    if (!this.redis) {
      throw new Error("Redis client not initialized");
    }

    const sessionKey = this.getSessionKey(userId, sessionId);

    // Get session data
    const sessionData = await this.redis.get(sessionKey);
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Parse session data
    const sessionFiles = JSON.parse(sessionData);

    // Create temporary directory for the session
    const userDataDir = path.join(
      this.tempDir,
      `browserstate-${userId}-${sessionId}`,
    );
    await fs.ensureDir(userDataDir);

    // Extract and write files
    for (const [filePath, fileData] of Object.entries(sessionFiles)) {
      const fullPath = path.join(userDataDir, filePath);
      await fs.ensureDir(path.dirname(fullPath));

      // Handle compressed data if needed
      const content = this.compression
        ? await this.decompressData(fileData as string)
        : (fileData as string);

      await fs.writeFile(fullPath, content, "utf8");
    }

    return userDataDir;
  }

  async upload(
    userId: string,
    sessionId: string,
    filePath: string,
  ): Promise<void> {
    await this.ensureInitialized();
    if (!this.redis) {
      throw new Error("Redis client not initialized");
    }

    if (!filePath) {
      throw new Error("Directory path is required");
    }

    const sessionKey = this.getSessionKey(userId, sessionId);

    // Read all files from the directory
    const files: Record<string, string> = {};

    await this.readDirectory(filePath, "", files);

    // Store in Redis with optional compression
    const sessionData = this.compression
      ? await this.compressData(JSON.stringify(files))
      : JSON.stringify(files);

    if (this.ttl) {
      await this.redis.setex(sessionKey, this.ttl, sessionData);
    } else {
      await this.redis.set(sessionKey, sessionData);
    }
  }

  private async readDirectory(
    dirPath: string,
    relativePath: string,
    files: Record<string, string>,
  ): Promise<void> {
    if (!dirPath) {
      throw new Error("Directory path is required");
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        await this.readDirectory(fullPath, relPath, files);
      } else {
        const stats = await fs.stat(fullPath);

        // Skip files larger than maxFileSize
        if (stats.size > this.maxFileSize) {
          console.warn(`Skipping large file: ${relPath} (${stats.size} bytes)`);
          continue;
        }

        const content = await fs.readFile(fullPath, "utf8");
        files[relPath] = content;
      }
    }
  }

  async listSessions(userId: string): Promise<string[]> {
    await this.ensureInitialized();
    if (!this.redis) {
      throw new Error("Redis client not initialized");
    }

    const pattern = `${this.keyPrefix}${userId}:*`;
    const keys = await this.redis.keys(pattern);

    return keys
      .map((key: string) => {
        const match = key.match(new RegExp(`${this.keyPrefix}${userId}:(.+)$`));
        return match ? match[1] : "";
      })
      .filter(Boolean);
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.redis) {
      throw new Error("Redis client not initialized");
    }

    const sessionKey = this.getSessionKey(userId, sessionId);
    await this.redis.del(sessionKey);
  }

  private async compressData(data: string): Promise<string> {
    if (!this.compression) {
      return data;
    }
    const buffer = Buffer.from(data, "utf8");
    const compressed = await gzipAsync(buffer);
    return compressed.toString("base64");
  }

  private async decompressData(data: string): Promise<string> {
    if (!this.compression) {
      return data;
    }
    const buffer = Buffer.from(data, "base64");
    const decompressed = await gunzipAsync(buffer);
    return decompressed.toString("utf8");
  }
}
