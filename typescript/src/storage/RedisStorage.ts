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
  encrypted?: boolean;
}

// Type for metadata created during upload
interface SessionUploadMetadata {
  timestamp: number;
  fileCount: number;
  version: string;
  encrypted: boolean;
}

/**
 * Extract-zip options interface
 */
interface ExtractOptions {
  dir: string;
  onEntry?: (entry: { fileName: string }, zipfile: unknown) => void;
}

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
 *                           │  (ZIP Archive)  │
 *                           │                 │
 *                           └─────────────────┘
 *
 * Data Flow:
 * ---------
 *
 * Upload:
 * 1. Browser state calls upload() with a directory path containing profile files
 * 2. Directory is packaged into a single ZIP archive in a temporary location
 * 3. ZIP is encoded as base64 and stored in Redis at key: {prefix}:{userId}:{sessionId}
 * 4. Metadata is stored separately at key: {prefix}:{userId}:{sessionId}:metadata
 *
 * Download:
 * 1. Browser state calls download() with userId and sessionId
 * 2. Base64 data is fetched from Redis and decoded
 * 3. A temporary ZIP file is created from the decoded data
 * 4. ZIP is extracted to a directory that is returned to the browser state
 *
 * Session Management:
 * ------------------
 * - Sessions can have optional TTL (time-to-live) for automatic expiration
 * - listSessions() retrieves all sessions for a user by pattern matching
 * - deleteSession() removes both the session data and metadata
 * - Metadata includes timestamp and version information
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
   * @default "browserstate"
   */
  keyPrefix?: string;

  /**
   * Temporary directory for extracting and creating ZIP archives
   * @default os.tmpdir()
   */
  tempDir?: string;

  /**
   * Time-to-live in seconds for stored sessions
   * When specified, sessions will be automatically deleted after this time
   * @example 604800 // 7 days
   */
  ttl?: number;
}

/**
 * Validates that a ZIP entry path doesn't contain directory traversal attempts
 * to prevent ZIP slip vulnerability
 * @param entryPath - The path from the ZIP entry
 * @param targetDir - The directory where files will be extracted
 * @returns Whether the path is safe
 */
function isZipEntrySafe(entryPath: string, targetDir: string): boolean {
  // Normalize paths to handle different path formats
  const normalizedTarget = path.normalize(targetDir);
  const resolvedPath = path.resolve(normalizedTarget, entryPath);
  
  // Check if the resolved path is within the target directory
  // Use relative path to check if it goes outside the target
  return !path.relative(normalizedTarget, resolvedPath).startsWith('..');
}

/**
 * Redis storage provider for BrowserState
 *
 * This implementation stores browser profiles directly in Redis as ZIP archives.
 * Unlike cloud storage providers that store individual files, this approach:
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
 */
export class RedisStorageProvider implements StorageProvider {
  private redis: RedisClient | null = null;
  private redisModulesLoaded = false;
  private keyPrefix: string;
  private tempDir: string;
  private ttl?: number;
  private options: RedisStorageOptions;

  /**
   * Creates a new Redis storage provider instance
   *
   * @param options - Redis connection and storage configuration
   */
  constructor(options: RedisStorageOptions) {
    this.keyPrefix = options.keyPrefix || "browserstate";
    
    // Validate keyPrefix format
    if (this.keyPrefix.includes(':')) {
      throw new Error("keyPrefix must not contain colons (:). The implementation automatically builds Redis keys in the format: {prefix}:{userId}:{sessionId}");
    }
    
    this.tempDir = options.tempDir || os.tmpdir();
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

    console.log(`[Redis] Storage initialized with ZIP compression`);
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
    // Validate that userId and sessionId don't contain colons
    if (userId.includes(':')) {
      throw new Error("userId must not contain colons (:)");
    }
    if (sessionId.includes(':')) {
      throw new Error("sessionId must not contain colons (:)");
    }
    return `${this.keyPrefix}:${userId}:${sessionId}`;
  }

  private getMetadataKey(userId: string, sessionId: string): string {
    // Reuse validation from getSessionKey
    this.getSessionKey(userId, sessionId);
    return `${this.keyPrefix}:${userId}:${sessionId}:metadata`;
  }

  /**
   * Downloads a browser session from Redis
   *
   * This method:
   * 1. Creates a temporary directory for the session
   * 2. Fetches the ZIP archive from Redis
   * 3. Extracts the archive to recreate the browser profile
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

    // Get session data (zipped folder) and metadata
    const [zipData, metadata] = await Promise.all([
      this.redis.get(sessionKey),
      this.redis.get(metadataKey),
    ]);

    if (!zipData) {
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

    console.log(
      `[Redis] Downloading session ${sessionId} from ${new Date(sessionMetadata.timestamp || 0).toISOString()}`,
    );

    // Create a temporary zip file
    const zipFilePath = path.join(
      this.tempDir,
      `${userId}-${sessionId}-${Date.now()}.zip`,
    );

    try {
      // Import extract-zip using our module loader
      const extractZip = await modules.extractZip.getModule();

      // Write the base64 data to a zip file
      await fs.writeFile(zipFilePath, Buffer.from(zipData, "base64"));

      // Extract the zip file to the user data directory
      console.log(`[Redis] Extracting zip to ${userDataDir}`);
      const options: ExtractOptions = { 
        dir: userDataDir,
        // Add onEntry callback to prevent ZIP slip vulnerability
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onEntry: (entry, _) => {
          // Ensure the entry's path doesn't escape the target directory (ZIP slip protection)
          const fileName = entry.fileName;
          if (!isZipEntrySafe(fileName, userDataDir)) {
            throw new Error(`Security risk: ZIP entry "${fileName}" is outside extraction directory`);
          }
        }
      };
      await extractZip(zipFilePath, options);

      // Clean up the temporary zip file
      await fs.remove(zipFilePath);

      console.log(`[Redis] Successfully extracted session data`);
      return userDataDir;
    } catch (error) {
      // Clean up temp zip file if it exists
      try {
        if (await fs.pathExists(zipFilePath)) {
          await fs.remove(zipFilePath);
        }
      } catch (cleanupError) {
        console.error(
          `[Redis] Error cleaning up temporary zip file: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }

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
   * Uploads a browser session to Redis
   *
   * This method:
   * 1. Creates a ZIP archive of the entire browser profile directory
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

    // Create a temporary file for the zip
    const zipFilePath = path.join(
      this.tempDir,
      `${userId}-${sessionId}-${Date.now()}.zip`,
    );

    console.log(
      `[Redis] Creating zip archive of session directory: ${filePath}`,
    );

    try {
      // Create a zip of the directory
      await this.zipDirectory(filePath, zipFilePath);

      // Get the zip file size for logging
      const stats = await fs.stat(zipFilePath);

      // Read the zip file as base64
      const zipData = await fs.readFile(zipFilePath, { encoding: "base64" });

      // Create metadata
      const metadata: SessionUploadMetadata = {
        timestamp: Date.now(),
        fileCount: 0, // We don't count individual files anymore
        version: "2.0", // Update version to indicate zip format
        encrypted: false, // Default to not encrypted
      };

      console.log(
        `[Redis] Uploading session ${sessionId} (${stats.size} bytes)`,
      );

      // Store in Redis with TTL if specified
      if (this.ttl) {
        await Promise.all([
          this.redis.setex(sessionKey, this.ttl, zipData),
          this.redis.setex(metadataKey, this.ttl, JSON.stringify(metadata)),
        ]);
      } else {
        await Promise.all([
          this.redis.set(sessionKey, zipData),
          this.redis.set(metadataKey, JSON.stringify(metadata)),
        ]);
      }

      console.log(`[Redis] Successfully uploaded session ${sessionId}`);

      // Clean up the temporary zip file
      await fs.remove(zipFilePath);
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

    // Validate userId
    if (userId.includes(':')) {
      throw new Error("userId must not contain colons (:)");
    }

    const pattern = `${this.keyPrefix}:${userId}:*`;
    const keys = await this.redis.keys(pattern);

    return keys
      .map((key: string) => {
        const match = key.match(new RegExp(`${this.keyPrefix}:${userId}:(.+?)(?::metadata)?$`));
        return match ? match[1] : "";
      })
      .filter(Boolean)
      .filter((key: string) => !key.includes(":"))
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
