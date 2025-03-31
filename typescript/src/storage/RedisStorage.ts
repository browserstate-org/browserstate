import { StorageProvider } from "./StorageProvider";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { modules } from "../utils/DynamicImport";

// Define types without importing ioredis directly
interface RedisOptions {
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
}

// Define Redis interface for client operations
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<"OK">;
  setex(key: string, seconds: number, value: string): Promise<"OK">;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

interface SessionMetadata {
  timestamp?: number;
  fileCount?: number;
  version?: string;
  format?: string;
}

// Type for metadata created during upload
interface SessionUploadMetadata {
  timestamp: number;
  fileCount: number;
  version: string;
  format: string;
}

// Format types used for storage
type StorageFormat = "zip" | "tar.gz";

/**
 * Redis Storage Architecture
 * =========================
 *
 * ┌─────────────────┐       ┌─────────────────┐        ┌─────────────────────┐
 * │                 │       │                 │        │                     │
 * │  Browser State  │◄─────►│  Redis Storage  │◄──────►│  Redis Server       │
 * │  (API Layer)    │       │  Provider       │        │                     │
 * │                 │       │                 │        │                     │
 * └─────────────────┘       └─────────────────┘        └─────────────────────┘
 *                                 │    ▲
 *                                 │    │
 *                                 ▼    │
 *                           ┌─────────────────┐
 *                           │                 │
 *                           │  Temp Directory │
 *                           │  (ZIP/TAR.GZ)   │
 *                           │                 │
 *                           └─────────────────┘
 *
 * Data Flow:
 * ---------
 *
 * Upload:
 * 1. Browser state calls upload() with a directory path containing profile files
 * 2. Directory is packaged into a single archive (ZIP or TAR.GZ) in a temporary location
 * 3. Archive is encoded as base64 and stored in Redis at key: {prefix}{userId}:{sessionId}
 * 4. Metadata is stored separately at key: {prefix}{userId}:{sessionId}:metadata
 *
 * Download:
 * 1. Browser state calls download() with userId and sessionId
 * 2. Base64 data is fetched from Redis and decoded
 * 3. Format is auto-detected (ZIP or TAR.GZ)
 * 4. Archive is extracted to a directory that is returned to the browser state
 *
 * Session Management:
 * ------------------
 * - Sessions can have optional TTL (time-to-live) for automatic expiration
 * - listSessions() retrieves all sessions for a user by pattern matching
 * - deleteSession() removes both the session data and metadata
 * - Metadata includes timestamp and version information
 * 
 *  * Enhanced Interoperability:
 * -------------------------
 * - Auto-detects and handles both ZIP and TAR.GZ formats for cross-language compatibility
 * - ZIP format is the TypeScript-native format
 * - TAR.GZ format is the Python-native format
 * - Both formats can be read by either implementation
 */

/**
 * Configuration options for Redis storage
 */
export interface RedisStorageOptions {
  /**
   * Redis server hostname
   * @default "localhost"
   */
  host: string;

  /**
   * Redis server port
   * @default 6379
   */
  port: number;

  /**
   * Optional Redis server password
   */
  password?: string;

  /**
   * Redis database number
   * @default 0
   */
  db?: number;

  /**
   * TLS/SSL configuration for secure Redis connections
   */
  tls?: RedisOptions["tls"];

  /**
   * Prefix for Redis keys to avoid collisions with other applications
   * @default "browserstate:"
   */
  keyPrefix?: string;

  /**
   * Temporary directory for extracting and creating archives
   * @default os.tmpdir()
   */
  tempDir?: string;

  /**
   * Time-to-live in seconds for stored sessions
   * When specified, sessions will be automatically deleted after this time
   * @example 604800 // 7 days
   */
  ttl?: number;

  /**
   * Storage format to use for new sessions
   * @default "zip"
   */
  storageFormat?: StorageFormat;
}

/**
 * Redis storage provider for BrowserState
 *
 * This implementation stores browser profiles directly in Redis as archives.
 * Enhanced with cross-language compatibility, supporting both:
 * - ZIP format (TypeScript-native)
 * - TAR.GZ format (Python-native)
 *
 * 1. Creates a complete ZIP archive of the entire browser profile directory
 * 2. Stores the archive as base64-encoded data in Redis
 * 3. Preserves the exact directory structure with all files intact
 * 4. Provides efficient storage through ZIP compression
 * 5. Maintains session metadata for tracking and management
 *
 * This implementation is ideal for:
 * - Microservices and containerized environments
 * - High-frequency, short-lived sessions
 * - Low-latency requirements
 * - When cloud storage dependencies are not desired
 *
 * Note: The Redis provider requires the 'ioredis' package to be installed.
 * It will be dynamically imported at runtime.
 * 
 *  * Features:
 * 1. Automatic format detection for reading sessions
 * 2. Cross-language compatibility for sessions created by either implementation
 * 3. Customizable format for new sessions
 * 4. Metadata storage for tracking and session management
 */
export class RedisStorageProvider implements StorageProvider {
  private redis: RedisClient | null = null;
  private redisModulesLoaded = false;
  private keyPrefix: string;
  private tempDir: string;
  private ttl?: number;
  private options: RedisStorageOptions;
  private storageFormat: StorageFormat;

  /**
   * Creates a new Redis storage provider instance
   *
   * @param options - Redis connection and storage configuration
   */
  constructor(options: RedisStorageOptions) {
    this.keyPrefix = options.keyPrefix || "browserstate:";
    this.tempDir = options.tempDir || os.tmpdir();
    this.ttl = options.ttl;
    this.storageFormat = options.storageFormat || "zip";
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

    console.log(`[Redis] Storage initialized with ${this.storageFormat} compression`);
  }

  /**
   * Dynamically imports Redis module
   */
  private async initClient(): Promise<void> {
    if (this.redisModulesLoaded) return;

    try {
      // Import Redis using our module loader
      const Redis = await modules.redis.getModule();

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

      this.redis = new Redis(redisOptions) as unknown as RedisClient;
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

  private getMetadataKey(userId: string, sessionId: string): string {
    return `${this.keyPrefix}${userId}:${sessionId}:metadata`;
  }

  /**
   * Detects the format of a data buffer
   * 
   * @param data - The data buffer to examine
   * @returns The detected format
   * @private
   */
  private detectFormat(data: Buffer): StorageFormat | "unknown" {
    // Check if it's gzip (TAR.GZ) by examining the first bytes (gzip magic number: 0x1F8B)
    if (data[0] === 0x1F && data[1] === 0x8B) {
      return "tar.gz";
    }

    // Check if it's ZIP by examining the first bytes (ZIP magic number: PK\x03\x04)
    if (
      data.length >= 4 &&
      data[0] === 0x50 && // P
      data[1] === 0x4B && // K
      data[2] === 0x03 &&
      data[3] === 0x04
    ) {
      return "zip";
    }

    return "unknown";
  }

  /**
   * Downloads a browser session from Redis
   *
   * This method:
   * 1. Creates a temporary directory for the session
   * 2. Fetches the archive from Redis
   * 3. Auto-detects the format (ZIP or TAR.GZ)
   * 4. Extracts the archive to recreate the browser profile
   *
   * If the session doesn't exist, an empty directory is returned
   * which can be used to create a new session.
   *
   * @param userId - User identifier
   * @param sessionId - Session identifier
   * @returns Path to the local directory containing session data
   */
  async download(userId: string, sessionId: string): Promise<string> {
    await this.ensureInitialized();
    if (!this.redis) {
      throw new Error("Redis client not initialized");
    }

    const sessionKey = this.getSessionKey(userId, sessionId);
    const metadataKey = this.getMetadataKey(userId, sessionId);

    // Create temporary directory for the session
    const userDataDir = path.join(
      this.tempDir,
      `browserstate-${userId}-${sessionId}`,
    );
    await fs.ensureDir(userDataDir);

    // Get session data (archive) and metadata
    const [sessionData, metadata] = await Promise.all([
      this.redis.get(sessionKey),
      this.redis.get(metadataKey),
    ]);

    if (!sessionData) {
      console.log(
        `[Redis] No session data found for ${sessionId}, creating new directory`,
      );
      return userDataDir;
    }

    let sessionMetadata: SessionMetadata = {};
    try {
      if (metadata) {
        sessionMetadata = JSON.parse(metadata);
      }
    } catch (error) {
      console.warn(
        `[Redis] Error parsing metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // First, convert the data to a buffer
      let dataBuffer: Buffer;

      // Try to parse as base64 first (common for both formats)
      try {
        dataBuffer = Buffer.from(sessionData, "base64");
      } catch (error) {
        // If not base64, use as raw data
        dataBuffer = Buffer.from(sessionData);
      }

      // Auto-detect the format
      const format = sessionMetadata.format as StorageFormat ||
        this.detectFormat(dataBuffer);

      console.log(`[Redis] Detected format for session ${sessionId}: ${format}`);

      if (format === "zip") {
        // Handle ZIP format
        await this.extractZipSession(dataBuffer, userDataDir);
      } else if (format === "tar.gz") {
        // Handle TAR.GZ format
        await this.extractTarGzSession(dataBuffer, userDataDir);
      } else {
        throw new Error(`Unknown or unsupported format: ${format}`);
      }

      console.log(`[Redis] Successfully extracted session data`);
      return userDataDir;
    } catch (error) {
      // Clean up user data directory to avoid partial extraction
      try {
        await fs.emptyDir(userDataDir);
      } catch (cleanupError) {
        console.error(
          `[Redis] Error cleaning up user data directory: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }

      console.error(
        `[Redis] Error extracting session data: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Propagate the error instead of hiding it
      throw new Error(
        `Failed to extract session data for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Extracts a ZIP format session
   * 
   * @param data - ZIP data buffer
   * @param targetDir - Directory to extract to
   * @private
   */
  private async extractZipSession(data: Buffer, targetDir: string): Promise<void> {
    const extractZip = await modules.extractZip.getModule();

    // Create a temporary zip file
    const zipFilePath = path.join(
      this.tempDir,
      `temp-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.zip`,
    );

    try {
      // Write the data to a zip file
      await fs.writeFile(zipFilePath, data);

      // Extract the zip file to the user data directory
      console.log(`[Redis] Extracting zip to ${targetDir}`);
      await extractZip(zipFilePath, { dir: targetDir });
    } finally {
      // Clean up the temporary zip file
      try {
        if (await fs.pathExists(zipFilePath)) {
          await fs.remove(zipFilePath);
        }
      } catch (cleanupError) {
        console.error(
          `[Redis] Error cleaning up temporary zip file: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }
  }

  /**
   * Extracts a TAR.GZ format session
   * 
   * @param data - TAR.GZ data buffer
   * @param targetDir - Directory to extract to
   * @private
   */
  private async extractTarGzSession(data: Buffer, targetDir: string): Promise<void> {
    const tar = await modules.tar.getModule();

    // Create a temporary tar.gz file
    const tarFilePath = path.join(
      this.tempDir,
      `temp-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.tar.gz`,
    );

    try {
      // Write the data to a tar.gz file
      await fs.writeFile(tarFilePath, data);

      // Extract the tar.gz file to the user data directory
      console.log(`[Redis] Extracting tar.gz to ${targetDir}`);
      await tar.extract({
        file: tarFilePath,
        cwd: targetDir,
        // Add safety options to prevent path traversal
        strict: true,
        filter: (path: string) => !path.includes(".."),
      });
    } finally {
      // Clean up the temporary tar.gz file
      try {
        if (await fs.pathExists(tarFilePath)) {
          await fs.remove(tarFilePath);
        }
      } catch (cleanupError) {
        console.error(
          `[Redis] Error cleaning up temporary tar.gz file: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }
  }

  /**
   * Uploads a browser session to Redis
   *
   * This method:
   * 1. Creates an archive (ZIP or TAR.GZ) of the entire browser profile directory
   * 2. Encodes the archive as base64 and stores it in Redis
   * 3. Stores metadata about the session alongside the data
   *
   * If TTL is configured, both the session data and metadata
   * will expire after the specified time.
   *
   * @param userId - User identifier
   * @param sessionId - Session identifier
   * @param filePath - Path to the local directory containing session data
   */
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
    const metadataKey = this.getMetadataKey(userId, sessionId);

    console.log(
      `[Redis] Creating ${this.storageFormat} archive of session directory: ${filePath}`,
    );

    try {
      let sessionData: string;
      let fileSize: number;

      // Create archive based on the configured format
      if (this.storageFormat === "zip") {
        // Create a ZIP archive
        const result = await this.createZipArchive(filePath);
        sessionData = result.data;
        fileSize = result.size;
      } else {
        // Create a TAR.GZ archive
        const result = await this.createTarGzArchive(filePath);
        sessionData = result.data;
        fileSize = result.size;
      }

      // Create metadata
      const metadata: SessionUploadMetadata = {
        timestamp: Date.now(),
        fileCount: await this.countFiles(filePath),
        version: "2.0",
        format: this.storageFormat
      };

      console.log(
        `[Redis] Uploading session ${sessionId} (${fileSize} bytes) in ${this.storageFormat} format`,
      );

      // Store in Redis with TTL if specified
      if (this.ttl) {
        await Promise.all([
          this.redis.setex(sessionKey, this.ttl, sessionData),
          this.redis.setex(metadataKey, this.ttl, JSON.stringify(metadata)),
        ]);
      } else {
        await Promise.all([
          this.redis.set(sessionKey, sessionData),
          this.redis.set(metadataKey, JSON.stringify(metadata)),
        ]);
      }

      console.log(`[Redis] Successfully uploaded session ${sessionId}`);
    } catch (error) {
      console.error(
        `[Redis] Error uploading session data: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Creates a ZIP archive of a directory
   * 
   * @param sourceDir - Directory to compress
   * @returns Object containing base64 data and size
   * @private
   */
  private async createZipArchive(sourceDir: string): Promise<{ data: string, size: number }> {
    // Create a temporary file for the zip
    const zipFilePath = path.join(
      this.tempDir,
      `temp-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.zip`,
    );

    try {
      // Create a zip of the directory
      await this.zipDirectory(sourceDir, zipFilePath);

      // Get the zip file size for logging
      const stats = await fs.stat(zipFilePath);

      // Read the zip file as base64
      const zipData = await fs.readFile(zipFilePath, { encoding: "base64" });

      return {
        data: zipData,
        size: stats.size
      };
    } finally {
      // Clean up the temporary zip file
      try {
        if (await fs.pathExists(zipFilePath)) {
          await fs.remove(zipFilePath);
        }
      } catch (error) {
        console.error(
          `[Redis] Error cleaning up temporary zip file: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Creates a TAR.GZ archive of a directory
   * 
   * @param sourceDir - Directory to compress
   * @returns Object containing base64 data and size
   * @private
   */
  private async createTarGzArchive(sourceDir: string): Promise<{ data: string, size: number }> {
    const tar = await modules.tar.getModule();

    // Create a temporary file for the tar.gz
    const tarFilePath = path.join(
      this.tempDir,
      `temp-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.tar.gz`,
    );

    try {
      // Create a tar.gz of the directory
      await tar.create(
        {
          gzip: true,
          file: tarFilePath,
          cwd: path.dirname(sourceDir),
        },
        [path.basename(sourceDir)]
      );

      // Get the tar.gz file size for logging
      const stats = await fs.stat(tarFilePath);

      // Read the tar.gz file as base64
      const tarData = await fs.readFile(tarFilePath, { encoding: "base64" });

      return {
        data: tarData,
        size: stats.size
      };
    } finally {
      // Clean up the temporary tar.gz file
      try {
        if (await fs.pathExists(tarFilePath)) {
          await fs.remove(tarFilePath);
        }
      } catch (error) {
        console.error(
          `[Redis] Error cleaning up temporary tar.gz file: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Creates a ZIP archive of a directory
   *
   * This helper method compresses an entire directory into a ZIP archive
   * with maximum compression level to minimize storage requirements.
   *
   * @param sourceDir - Directory to compress
   * @param outPath - Output path for the ZIP file
   * @returns Promise that resolves when the archive is created
   * @private
   */
  private async zipDirectory(
    sourceDir: string,
    outPath: string,
  ): Promise<void> {
    // Import archiver using our module loader
    const archiverModule = await modules.archiver.getModule();

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiverModule("zip", {
        zlib: { level: 9 }, // Maximum compression
      });

      output.on("close", () => {
        console.log(`[Redis] ZIP archive created: ${archive.pointer()} bytes`);
        resolve();
      });

      archive.on("error", (err?: Error) => {
        reject(err);
      });

      archive.pipe(output);

      // Add the directory contents to the zip
      archive.directory(sourceDir, false);

      // Finalize the archive
      archive.finalize();
    });
  }

  /**
   * Counts the number of files in a directory recursively
   * 
   * @param directory - Directory to count files in
   * @returns Number of files
   * @private
   */
  private async countFiles(directory: string): Promise<number> {
    let count = 0;

    const items = await fs.readdir(directory);

    for (const item of items) {
      const fullPath = path.join(directory, item);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        count += await this.countFiles(fullPath);
      } else {
        count++;
      }
    }

    return count;
  }

  /**
   * Lists all available sessions for a user
   *
   * This method:
   * 1. Searches for all Redis keys matching the user's pattern
   * 2. Filters out metadata keys to get only session identifiers
   * 3. Returns deduplicated session IDs
   *
   * @param userId - User identifier
   * @returns Array of session identifiers
   */
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
      .filter(Boolean)
      .filter((key: string) => !key.includes(":metadata"))
      .filter(
        (key: string, index: number, self: string[]) =>
          self.indexOf(key) === index,
      );
  }

  /**
   * Deletes a session and its metadata from Redis
   *
   * @param userId - User identifier
   * @param sessionId - Session identifier to delete
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.redis) {
      throw new Error("Redis client not initialized");
    }

    const sessionKey = this.getSessionKey(userId, sessionId);
    const metadataKey = this.getMetadataKey(userId, sessionId);

    await Promise.all([
      this.redis.del(sessionKey),
      this.redis.del(metadataKey),
    ]);
  }
}
