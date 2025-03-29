import { Redis, RedisOptions } from "ioredis";
import { StorageProvider } from "./StorageProvider";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";

// Convert callback-based zlib functions to promise-based
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

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
  private redis: Redis;
  private keyPrefix: string;
  private tempDir: string;
  private maxFileSize: number;
  private compression: boolean;
  private ttl?: number;

  constructor(options: RedisStorageOptions) {
    this.keyPrefix = options.keyPrefix || "browserstate:";
    this.tempDir = options.tempDir || os.tmpdir();
    this.maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB default
    this.compression = options.compression || false;
    this.ttl = options.ttl;

    // Configure Redis connection
    const redisOptions: RedisOptions = {
      host: options.host,
      port: options.port,
      password: options.password,
      db: options.db,
      tls: options.tls,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    };

    this.redis = new Redis(redisOptions);
  }

  private getSessionKey(userId: string, sessionId: string): string {
    return `${this.keyPrefix}${userId}:${sessionId}`;
  }

  private getMetadataKey(userId: string, sessionId: string): string {
    return `${this.keyPrefix}${userId}:${sessionId}:metadata`;
  }

  async download(userId: string, sessionId: string): Promise<string> {
    const sessionKey = this.getSessionKey(userId, sessionId);

    // Get session data and files
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
    if (!filePath) {
      throw new Error("Directory path is required");
    }

    const sessionKey = this.getSessionKey(userId, sessionId);
    const metadataKey = this.getMetadataKey(userId, sessionId);

    // Read all files from the directory
    const files: Record<string, string> = {};
    const metadata: Record<string, { size: number; mtime: number }> = {};

    await this.readDirectory(filePath, "", files, metadata);

    // Store in Redis with optional compression
    const sessionData = this.compression
      ? await this.compressData(JSON.stringify(files))
      : JSON.stringify(files);

    const pipeline = this.redis.pipeline();
    pipeline.set(sessionKey, sessionData);
    pipeline.set(metadataKey, JSON.stringify(metadata));

    if (this.ttl) {
      pipeline.expire(sessionKey, this.ttl);
      pipeline.expire(metadataKey, this.ttl);
    }

    await pipeline.exec();
  }

  private async readDirectory(
    dirPath: string,
    relativePath: string,
    files: Record<string, string>,
    metadata: Record<string, { size: number; mtime: number }>,
  ): Promise<void> {
    if (!dirPath) {
      throw new Error("Directory path is required");
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        await this.readDirectory(fullPath, relPath, files, metadata);
      } else {
        const stats = await fs.stat(fullPath);

        // Skip files larger than maxFileSize
        if (stats.size > this.maxFileSize) {
          console.warn(`Skipping large file: ${relPath} (${stats.size} bytes)`);
          continue;
        }

        const content = await fs.readFile(fullPath, "utf8");

        files[relPath] = content;
        metadata[relPath] = {
          size: stats.size,
          mtime: stats.mtimeMs,
        };
      }
    }
  }

  async listSessions(userId: string): Promise<string[]> {
    const pattern = `${this.keyPrefix}${userId}:*`;
    const keys = await this.redis.keys(pattern);

    return keys
      .filter((key: string) => !key.endsWith(":metadata")) // Exclude metadata keys
      .map((key: string) => {
        const match = key.match(new RegExp(`${this.keyPrefix}${userId}:(.+)$`));
        return match ? match[1] : "";
      })
      .filter(Boolean);
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const sessionKey = this.getSessionKey(userId, sessionId);
    const metadataKey = this.getMetadataKey(userId, sessionId);

    await Promise.all([
      this.redis.del(sessionKey),
      this.redis.del(metadataKey),
    ]);
  }

  private async compressData(data: string): Promise<string> {
    if (!this.compression) {
      return data;
    }
    const buffer = Buffer.from(data, 'utf8');
    const compressed = await gzipAsync(buffer);
    return compressed.toString('base64');
  }

  private async decompressData(data: string): Promise<string> {
    if (!this.compression) {
      return data;
    }
    const buffer = Buffer.from(data, 'base64');
    const decompressed = await gunzipAsync(buffer);
    return decompressed.toString('utf8');
  }
} 