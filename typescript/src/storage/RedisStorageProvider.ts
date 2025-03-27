import { Redis, RedisOptions } from "ioredis";
import { StorageProvider } from "./StorageProvider";
import fs from "fs-extra";
import path from "path";
import os from "os";
import zlib from "zlib";
import { promisify } from "util";

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
  maxFileSize?: number; // Maximum file size to store in Redis (default: 5MB)
  compression?: boolean; // Whether to compress data before storing
  ttl?: number; // Time to live in seconds for sessions
  silent?: boolean; // Suppress non-critical warning messages
}

/**
 * Redis storage provider that stores browser state directly in Redis
 * This is separate from RedisCacheProvider and doesn't interact with cloud storage
 */
export class RedisStorageProvider implements StorageProvider {
  private redis: Redis;
  private keyPrefix: string;
  private maxFileSize: number;
  private compression: boolean;
  private ttl?: number;
  private silent: boolean;

  constructor(options: RedisStorageOptions) {
    this.keyPrefix = options.keyPrefix || "browserstate:";
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024; // 5MB default
    this.compression = options.compression || false;
    this.ttl = options.ttl;
    this.silent = options.silent || false;

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
    const tempDirPath = path.join(
      os.tmpdir(),
      `browserstate-${userId}-${sessionId}`,
    );
    await fs.ensureDir(tempDirPath);

    try {
      const sessionDataRedis = await this.redis.get(
        `${this.keyPrefix}${userId}:${sessionId}`,
      );
      if (!sessionDataRedis) {
        console.log(
          `ℹ️ Session data not found in Redis for userId: ${userId}, sessionId: ${sessionId}. A new session will be created.`,
        );
        // Return the empty directory
        return tempDirPath;
      }

      const sessionData = JSON.parse(sessionDataRedis);
      const sessionFiles = sessionData.files || {};

      for (const filePath in sessionFiles) {
        const fileData = sessionFiles[filePath];
        const fullPath = path.join(tempDirPath, filePath);
        await fs.ensureDir(path.dirname(fullPath));

        if (this.compression && typeof fileData === "string") {
          // Handle compressed data (legacy format)
          const decompressedData = await promisify(zlib.gunzip)(
            Buffer.from(fileData, "base64"),
          );
          await fs.writeFile(fullPath, decompressedData);
        } else if (typeof fileData === "object" && fileData !== null) {
          // Handle new format with type information
          if (fileData.type === "binary" && fileData.content) {
            // Convert base64 string to buffer for binary files
            await fs.writeFile(
              fullPath,
              Buffer.from(fileData.content, "base64"),
            );
          } else if (fileData.type === "text" && fileData.content) {
            // Write text directly
            await fs.writeFile(fullPath, fileData.content, "utf8");
          } else if (!this.silent) {
            console.warn(`Unknown file format for file: ${filePath}`);
          }
        } else if (typeof fileData === "string") {
          // Legacy text content
          await fs.writeFile(fullPath, fileData, "utf8");
        } else if (!this.silent) {
          console.warn(`Invalid data for file: ${filePath}`);
        }
      }

      return tempDirPath;
    } catch (error) {
      console.error("Error downloading session from Redis:", error);
      throw error;
    }
  }

  async upload(
    userId: string,
    sessionId: string,
    dirPath: string,
  ): Promise<void> {
    try {
      // Read all files in the directory
      const sessionFiles = await this.readDirectory(dirPath);

      // Prepare session data for Redis
      const sessionData = {
        userId,
        sessionId,
        files: sessionFiles,
        updatedAt: new Date().toISOString(),
      };

      // Store session data in Redis
      await this.redis.set(
        `${this.keyPrefix}${userId}:${sessionId}`,
        JSON.stringify(sessionData),
      );

      if (this.ttl) {
        await this.redis.expire(
          `${this.keyPrefix}${userId}:${sessionId}`,
          this.ttl,
        );
      }
    } catch (error) {
      console.error("Error uploading session to Redis:", error);
      throw error;
    }
  }

  /**
   * Read a directory recursively and convert files to appropriate format
   */
  async readDirectory(
    dirPath: string,
    fileSet: Record<
      string,
      { type: "binary" | "text"; content: string; size: number; mtime: number }
    > = {},
    baseDir: string = dirPath,
  ): Promise<
    Record<
      string,
      { type: "binary" | "text"; content: string; size: number; mtime: number }
    >
  > {
    try {
      if (!(await fs.pathExists(dirPath))) {
        return fileSet;
      }

      const files = await fs.readdir(dirPath);

      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          await this.readDirectory(fullPath, fileSet, baseDir);
        } else {
          try {
            // Skip files larger than maxFileSize
            if (stat.size > this.maxFileSize) {
              if (!this.silent) {
                console.warn(
                  `Skipping large file: ${fullPath} (${stat.size} bytes)`,
                );
              }
              continue;
            }

            // Read file as buffer to determine if it's binary or text
            const fileBuffer = await fs.readFile(fullPath);
            const relativePath = path.relative(baseDir, fullPath);

            // Check if file is binary
            const isBinary = this.isBinaryFile(fileBuffer);

            if (isBinary) {
              // Store binary files as base64 with type information
              fileSet[relativePath] = {
                type: "binary",
                content: fileBuffer.toString("base64"),
                size: stat.size,
                mtime: stat.mtime.getTime(),
              };
            } else {
              // Store text files with type information
              fileSet[relativePath] = {
                type: "text",
                content: fileBuffer.toString("utf8"),
                size: stat.size,
                mtime: stat.mtime.getTime(),
              };
            }
          } catch (err) {
            if (!this.silent) {
              console.error(`Error reading file ${fullPath}:`, err);
            }
          }
        }
      }

      return fileSet;
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
      throw error;
    }
  }

  // Helper method to determine if a file is binary
  private isBinaryFile(buffer: Buffer): boolean {
    // Check for null bytes or non-UTF8 content
    // This is a simple heuristic and may need refinement

    // First check: presence of null bytes often indicates binary
    if (buffer.includes(0)) {
      return true;
    }

    // Second check: try to decode as UTF-8 and see if it fails
    try {
      const decoded = buffer.toString("utf8");
      // Check if decoding changed length significantly (sign of binary data)
      // Also check for replacement character which indicates invalid UTF-8
      return (
        decoded.includes("") || buffer.length !== Buffer.from(decoded).length
      );
    } catch {
      // If decoding fails, it's definitely binary
      return true;
    }
  }

  async listSessions(userId: string): Promise<string[]> {
    const pattern = `${this.keyPrefix}${userId}:*`;
    const keys = await this.redis.keys(pattern);

    return keys
      .filter((key) => !key.endsWith(":metadata")) // Exclude metadata keys
      .map((key) => {
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
}
