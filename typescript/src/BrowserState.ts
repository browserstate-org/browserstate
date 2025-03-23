import { StorageProvider } from "./storage/StorageProvider";
import { LocalStorage } from "./storage/LocalStorage";
import { S3Storage } from "./storage/S3Storage";
import { GCSStorage } from "./storage/GCSStorage";
import { LocalStorageOptions } from "./storage/LocalStorage";
import { S3Options } from "./storage/S3Storage";
import { GCSOptions } from "./storage/GCSStorage";
import fs from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";

/**
 * File hash interface for metadata tracking
 */
interface FileMetadata {
  path: string;
  hash: string;
  size: number;
  modTime: number;
}

/**
 * Options for local file system storage
 */
export interface LocalStorageOptions {
  /**
   * Path where browser profiles will be stored
   */
  storagePath?: string;
}

/**
 * Options for AWS S3 storage
 */
export interface S3Options {
  /**
   * S3 bucket name for storing browser profiles
   */
  bucketName: string;

  /**
   * AWS region where the bucket is located
   */
  region: string;

  /**
   * AWS access key ID (optional if using environment variables or IAM roles)
   */
  accessKeyID?: string;

  /**
   * AWS secret access key (optional if using environment variables or IAM roles)
   */
  secretAccessKey?: string;

  /**
   * Optional prefix/folder path within the bucket
   */
  prefix?: string;
}

/**
 * Options for Google Cloud Storage
 */
export interface GCSOptions {
  /**
   * GCS bucket name for storing browser profiles
   */
  bucketName: string;

  /**
   * Google Cloud project ID
   */
  projectID?: string;

  /**
   * Path to service account key file
   */
  keyFilename?: string;

  /**
   * Optional prefix/folder path within the bucket
   */
  prefix?: string;
}

/**
 * Configuration options for BrowserState
 */
export interface BrowserStateOptions {
  /**
   * User identifier for organizing storage (default: "default")
   */
  userId?: string;

  /**
   * Type of storage backend to use (default: "local")
   */
  storageType?: "local" | "s3" | "gcs";

  /**
   * Options for local storage
   */
  localOptions?: LocalStorageOptions;

  /**
   * Options for AWS S3 storage
   */
  s3Options?: S3Options;

  /**
   * Options for Google Cloud Storage
   */
  gcsOptions?: GCSOptions;

  /**
   * Whether to automatically clean up temporary files on process exit (default: true)
   */
  autoCleanup?: boolean;

  /**
   * Whether to use efficient sync to speed up uploads/downloads (default: false)
   * When enabled, only changed files are transferred instead of the entire profile
   */
  useSync?: boolean;

  /**
   * Configuration options for efficient sync
   */
  syncOptions?: {
    /**
     * Where to store metadata for sync calculations (default: "local")
     */
    metadataStorage?: "local" | "cloud";

    /**
     * How frequently to update metadata in seconds (default: 0 - update on every unmount)
     * Only applies when metadataStorage is set to "cloud"
     */
    metadataUpdateInterval?: number;

    /**
     * Path for storing local metadata files (default: "~/.browserstate-metadata")
     * Only applies when metadataStorage is set to "local"
     */
    localMetadataPath?: string;
  };
}

/**
 * BrowserState main class for managing browser profiles across storage providers
 */
export class BrowserState {
  private storageProvider: StorageProvider;
  private userId: string;
  private currentSession?: string;
  private sessionPath?: string;
  private tempDir: string;
  private autoCleanup: boolean;
  private useSync: boolean;
  private metadataDir: string;
  private metadataStorage: "local" | "cloud";
  private metadataUpdateInterval: number;
  private lastMetadataUpdate: Map<string, number> = new Map();

  /**
   * Creates a new BrowserState instance
   *
   * @param options - Configuration options
   */
  constructor(options: BrowserStateOptions = {}) {
    // Set default user ID
    this.userId = options.userId || "default";
    this.autoCleanup = options.autoCleanup !== false;
    this.useSync = options.useSync === true;

    // Set efficient sync options
    this.metadataStorage = options.syncOptions?.metadataStorage || "local";
    this.metadataUpdateInterval =
      options.syncOptions?.metadataUpdateInterval || 0;

    // Create base temp directory for this instance
    this.tempDir = path.join(os.tmpdir(), "browserstate", this.userId);
    fs.ensureDirSync(this.tempDir);

    // Directory for storing metadata for sync transfers
    const defaultMetadataPath = path.join(
      os.homedir(),
      ".browserstate-metadata",
    );
    this.metadataDir =
      options.syncOptions?.localMetadataPath || defaultMetadataPath;
    this.metadataDir = path.join(this.metadataDir, this.userId);

    if (this.useSync && this.metadataStorage === "local") {
      fs.ensureDirSync(this.metadataDir);
    }

    // Create storage provider based on options
    switch (options.storageType) {
      case "s3":
        if (!options.s3Options) {
          throw new Error("S3 options required when using s3 storage");
        }
        this.storageProvider = new S3Storage(
          options.s3Options.bucketName,
          options.s3Options.region,
          {
            accessKeyId: options.s3Options.accessKeyID,
            secretAccessKey: options.s3Options.secretAccessKey,
            prefix: options.s3Options.prefix,
          },
        );
        break;

      case "gcs":
        if (!options.gcsOptions) {
          throw new Error("GCS options required when using gcs storage");
        }
        this.storageProvider = new GCSStorage(options.gcsOptions.bucketName, {
          keyFilePath: options.gcsOptions.keyFilename,
          projectID: options.gcsOptions.projectID,
          prefix: options.gcsOptions.prefix,
        });
        break;

      case "local":
      default:
        this.storageProvider = new LocalStorage(
          options.localOptions?.storagePath,
        );
        break;
    }

    // Register cleanup handler for auto cleanup if enabled
    if (this.autoCleanup) {
      this.registerCleanupHandlers();
    }
  }

  /**
   * Register handlers to clean up temporary files on process exit
   */
  private registerCleanupHandlers(): void {
    const cleanup = async (): Promise<void> => {
      try {
        // If a session is mounted, try to save it before exiting
        if (this.currentSession && this.sessionPath) {
          try {
            await this.unmount();
          } catch (error) {
            console.error("Error saving session during cleanup:", error);
          }
        }

        // Clean up temp directory
        if (fs.existsSync(this.tempDir)) {
          await fs.remove(this.tempDir);
        }
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    };

    // Handle normal exit
    process.on("exit", () => {
      // Sync cleanup for 'exit' event
      if (fs.existsSync(this.tempDir)) {
        try {
          fs.removeSync(this.tempDir);
        } catch (error) {
          console.error("Error removing temp dir during exit:", error);
        }
      }
    });

    // Handle ctrl+c and other signals
    process.on("SIGINT", async () => {
      await cleanup();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught exception:", error);
      await cleanup();
      process.exit(1);
    });
  }

  /**
   * Mount a browser state session
   *
   * @param sessionId - Session identifier
   * @returns Promise resolving to the path where browser can be launched
   */
  async mount(sessionId: string): Promise<string> {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("Session ID must be a non-empty string");
    }

    try {
      console.log(
        `⏳ Mounting browser state session: ${sessionId} for user: ${this.userId}`,
      );

      // If a session is already mounted, unmount it first
      if (this.currentSession && this.sessionPath) {
        console.log(
          `ℹ️ Another session is currently mounted (${this.currentSession}). Unmounting it first...`,
        );
        await this.unmount();
      }

      console.log(`🔍 Attempting to download state from storage provider...`);

      // Download the session files to a local directory
      let userDataDir: string;

      if (this.useSync) {
        // With sync, we implement our own download logic
        userDataDir = await this.downloadWithSync(sessionId);
      } else {
        // Use the standard download method
        userDataDir = await this.storageProvider.download(
          this.userId,
          sessionId,
        );
      }

      // Keep track of the mounted session
      this.currentSession = sessionId;
      this.sessionPath = userDataDir;

      console.log(`✅ Browser state mounted successfully at: ${userDataDir}`);
      return userDataDir;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to mount session ${sessionId}: ${errorMessage}`);
      throw new Error(`Failed to mount session ${sessionId}: ${errorMessage}`);
    }
  }

  /**
   * Unmount the current browser state session and upload changes
   */
  async unmount(): Promise<void> {
    if (!this.currentSession || !this.sessionPath) {
      throw new Error("No session is currently mounted");
    }

    try {
      console.log(`⏳ Unmounting session: ${this.currentSession}...`);
      console.log(`🔄 Uploading changes to storage provider...`);

      // Upload any changes
      if (this.useSync) {
        // With sync, we implement our own upload logic
        await this.uploadWithSync(this.currentSession, this.sessionPath);
      } else {
        // Use the standard upload method
        await this.storageProvider.upload(
          this.userId,
          this.currentSession,
          this.sessionPath,
        );
      }

      console.log(`🧹 Cleaning up local files...`);
      // Clean up local files
      await fs.remove(this.sessionPath);

      console.log(
        `✅ Session ${this.currentSession} unmounted and saved successfully`,
      );

      // Reset session tracking
      this.currentSession = undefined;
      this.sessionPath = undefined;

      return;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to unmount session: ${errorMessage}`);
      throw new Error(`Failed to unmount session: ${errorMessage}`);
    }
  }

  /**
   * Downloads a session using efficient sync
   * @param sessionId - Session identifier
   * @returns Path to the downloaded session
   */
  private async downloadWithSync(sessionId: string): Promise<string> {
    console.log(
      `[EfficientSync] Using efficient download for session: ${sessionId}`,
    );

    // Create a temporary directory for the session
    const targetPath = path.join(this.tempDir, sessionId);
    await fs.ensureDir(targetPath);

    try {
      // Check if session exists
      const sessions = await this.storageProvider.listSessions(this.userId);
      const sessionExists = sessions.includes(sessionId);

      if (!sessionExists) {
        console.log(
          `[EfficientSync] Session doesn't exist yet. Creating a new empty session.`,
        );
        return targetPath;
      }

      // Always check for cloud metadata first if using cloud storage
      if (this.metadataStorage === "cloud") {
        console.log(`[EfficientSync] Checking for cloud-stored metadata...`);
      }

      // Load previous metadata if it exists
      const previousMetadata = await this.loadMetadata(sessionId);

      if (previousMetadata.size === 0) {
        console.log(
          `[EfficientSync] No previous metadata found. Performing full download.`,
        );
        // No previous metadata, perform a full download
        return await this.storageProvider.download(this.userId, sessionId);
      }

      console.log(
        `[EfficientSync] Previous metadata found with ${previousMetadata.size} files. Starting incremental download.`,
      );

      // At this point, we would implement a mechanism to only download changed files.
      // However, for the initial implementation, we'll perform a full download
      const userDataDir = await this.storageProvider.download(
        this.userId,
        sessionId,
      );

      // Generate metadata for the newly downloaded files
      const currentMetadata = await this.getDirectoryMetadata(userDataDir);

      // Update metadata file for next time
      let shouldUpdateMetadata = true;

      if (this.metadataStorage === "cloud" && this.metadataUpdateInterval > 0) {
        const lastUpdate = this.lastMetadataUpdate.get(sessionId) || 0;
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdate;
        const updateIntervalMs = this.metadataUpdateInterval * 1000;

        if (timeSinceLastUpdate < updateIntervalMs) {
          console.log(
            `[EfficientSync] Skipping metadata update due to update interval (${Math.round(timeSinceLastUpdate / 1000)}s < ${this.metadataUpdateInterval}s).`,
          );
          shouldUpdateMetadata = false;
        }
      }

      if (shouldUpdateMetadata) {
        await this.saveMetadata(sessionId, currentMetadata);
        console.log(
          `[EfficientSync] Downloaded ${currentMetadata.size} files and updated metadata.`,
        );
      } else {
        console.log(
          `[EfficientSync] Downloaded ${currentMetadata.size} files, metadata update skipped.`,
        );
      }

      return userDataDir;
    } catch (error) {
      console.error(`[EfficientSync] Error during efficient download:`, error);
      // Fallback to regular download on error
      console.log(`[EfficientSync] Falling back to full download.`);
      return await this.storageProvider.download(this.userId, sessionId);
    }
  }

  /**
   * Uploads a session using efficient sync
   * @param sessionId - Session identifier
   * @param filePath - Path to the files to upload
   */
  private async uploadWithSync(
    sessionId: string,
    filePath: string,
  ): Promise<void> {
    console.log(
      `[EfficientSync] Using efficient upload for session: ${sessionId}`,
    );

    try {
      // Generate metadata for the current files
      const currentMetadata = await this.getDirectoryMetadata(filePath);
      console.log(
        `[EfficientSync] Current session has ${currentMetadata.size} files.`,
      );

      // Load previous metadata if it exists
      const previousMetadata = await this.loadMetadata(sessionId);

      if (previousMetadata.size === 0) {
        console.log(
          `[EfficientSync] No previous metadata found. Performing full upload.`,
        );
        // No previous metadata, perform a full upload
        await this.storageProvider.upload(this.userId, sessionId, filePath);

        // Save metadata for next time
        await this.saveMetadata(sessionId, currentMetadata);
        return;
      }

      // Calculate diffs
      const diffs = this.getFileDiffs(currentMetadata, previousMetadata);
      const { added, modified, removed } = diffs;

      console.log(
        `[EfficientSync] Changes detected: ${added.length} added, ${modified.length} modified, ${removed.length} removed.`,
      );

      if (added.length === 0 && modified.length === 0 && removed.length === 0) {
        console.log(`[EfficientSync] No changes detected. Skipping upload.`);
        return;
      }

      // For the initial implementation, we'll still do a full upload
      // In a future iteration, we would implement partial uploads in each storage provider
      await this.storageProvider.upload(this.userId, sessionId, filePath);

      // Determine if we should update the metadata based on the update interval
      let shouldUpdateMetadata = true;

      if (this.metadataStorage === "cloud" && this.metadataUpdateInterval > 0) {
        const lastUpdate = this.lastMetadataUpdate.get(sessionId) || 0;
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdate;
        const updateIntervalMs = this.metadataUpdateInterval * 1000;

        if (timeSinceLastUpdate < updateIntervalMs) {
          console.log(
            `[EfficientSync] Skipping metadata update due to update interval (${Math.round(timeSinceLastUpdate / 1000)}s < ${this.metadataUpdateInterval}s).`,
          );
          shouldUpdateMetadata = false;
        }
      }

      // Save updated metadata if needed
      if (shouldUpdateMetadata) {
        await this.saveMetadata(sessionId, currentMetadata);
        console.log(`[EfficientSync] Upload complete and metadata updated.`);
      } else {
        console.log(
          `[EfficientSync] Upload complete, metadata update skipped.`,
        );
      }
    } catch (error) {
      console.error(`[EfficientSync] Error during efficient upload:`, error);
      // Fallback to regular upload on error
      console.log(`[EfficientSync] Falling back to full upload.`);
      await this.storageProvider.upload(
        this.userId,
        this.currentSession!,
        this.sessionPath!,
      );
    }
  }

  /**
   * Get the current session ID if one is mounted
   *
   * @returns The current session ID or undefined if no session is mounted
   */
  getCurrentSession(): string | undefined {
    return this.currentSession;
  }

  /**
   * Get the path to the current session if one is mounted
   *
   * @returns The path to the current session or undefined if no session is mounted
   */
  getCurrentSessionPath(): string | undefined {
    return this.sessionPath;
  }

  /**
   * List available browser state sessions
   *
   * @returns Promise resolving to array of session IDs
   */
  async listSessions(): Promise<string[]> {
    try {
      return await this.storageProvider.listSessions(this.userId);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error listing sessions:", errorMessage);
      return [];
    }
  }

  /**
   * Check if a session exists
   *
   * @param sessionId - Session identifier to check
   * @returns Promise resolving to true if the session exists
   */
  async hasSession(sessionId: string): Promise<boolean> {
    if (!sessionId || typeof sessionId !== "string") {
      return false;
    }

    try {
      const sessions = await this.listSessions();
      return sessions.includes(sessionId);
    } catch {
      return false;
    }
  }

  /**
   * Delete a browser state session
   *
   * @param sessionId - Session identifier
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("Session ID must be a non-empty string");
    }

    try {
      // If this session is currently mounted, unmount it first
      if (this.currentSession === sessionId && this.sessionPath) {
        await this.unmount();
      }

      // Delete the session
      await this.storageProvider.deleteSession(this.userId, sessionId);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete session ${sessionId}: ${errorMessage}`);
    }
  }

  /**
   * Manually clean up temporary files
   * This can be used if autoCleanup is disabled
   */
  async cleanup(): Promise<void> {
    try {
      if (this.currentSession && this.sessionPath) {
        await this.unmount();
      }

      if (fs.existsSync(this.tempDir)) {
        await fs.remove(this.tempDir);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to clean up temporary files: ${errorMessage}`);
    }
  }

  /**
   * Calculates the hash of a file
   * @param filePath - Path to the file
   * @returns Hash of the file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const fileData = await fs.readFile(filePath);
      const hash = crypto.createHash("sha256");
      hash.update(fileData);
      return hash.digest("hex");
    } catch (error) {
      console.error(`Error calculating hash for ${filePath}:`, error);
      // Return a timestamp-based hash for files that can't be read
      return `error-${Date.now()}`;
    }
  }

  /**
   * Gets metadata for all files in a directory
   * @param dirPath - Directory to scan
   * @returns Map of file paths to their metadata
   */
  private async getDirectoryMetadata(
    dirPath: string,
  ): Promise<Map<string, FileMetadata>> {
    const result = new Map<string, FileMetadata>();
    const getAllFiles = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(dirPath, fullPath);

        if (entry.isDirectory()) {
          await getAllFiles(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          const hash = await this.calculateFileHash(fullPath);

          result.set(relativePath, {
            path: relativePath,
            hash,
            size: stats.size,
            modTime: stats.mtimeMs,
          });
        }
      }
    };

    await getAllFiles(dirPath);
    return result;
  }

  /**
   * Gets the metadata file path for a session
   * @param sessionId - The session ID
   * @returns Path to the metadata file
   */
  private getMetadataFilePath(sessionId: string): string {
    return path.join(this.metadataDir, `${sessionId}.json`);
  }

  /**
   * Saves metadata for a session
   * @param sessionId - Session ID
   * @param metadata - File metadata
   */
  private async saveMetadata(
    sessionId: string,
    metadata: Map<string, FileMetadata>,
  ): Promise<void> {
    const metadataObj = Object.fromEntries(metadata);

    if (this.metadataStorage === "local") {
      // Save to local file system
      const metadataPath = this.getMetadataFilePath(sessionId);
      await fs.writeJSON(metadataPath, metadataObj, { spaces: 2 });
      return;
    } else {
      // Save to cloud storage
      await this.saveCloudMetadata(sessionId, metadataObj);
    }
  }

  /**
   * Loads metadata for a session
   * @param sessionId - Session ID
   * @returns Map of file paths to their metadata
   */
  private async loadMetadata(
    sessionId: string,
  ): Promise<Map<string, FileMetadata>> {
    if (this.metadataStorage === "local") {
      // Load from local file system
      const metadataPath = this.getMetadataFilePath(sessionId);

      if (await fs.pathExists(metadataPath)) {
        try {
          const metadataObj = await fs.readJSON(metadataPath);
          return new Map(Object.entries(metadataObj));
        } catch (error) {
          console.error(
            `Error loading metadata for session ${sessionId}:`,
            error,
          );
          return new Map();
        }
      }

      return new Map();
    } else {
      // Load from cloud storage
      return await this.loadCloudMetadata(sessionId);
    }
  }

  /**
   * Saves metadata to cloud storage
   * @param sessionId - Session ID
   * @param metadata - File metadata as object
   */
  private async saveCloudMetadata(
    sessionId: string,
    metadata: Record<string, FileMetadata>,
  ): Promise<void> {
    try {
      // Create a metadata file in memory
      const metadataContent = JSON.stringify(metadata);
      const tempMetadataPath = path.join(
        this.tempDir,
        `${sessionId}-metadata.json`,
      );
      await fs.writeFile(tempMetadataPath, metadataContent);

      // Upload to cloud storage
      const metadataKey = `${this.userId}/${sessionId}/.browserstate-metadata.json`;

      console.log(
        `[EfficientSync] Saving metadata to cloud storage at ${metadataKey}`,
      );

      if (this.storageProvider instanceof S3Storage) {
        const s3 = this.storageProvider as S3Storage;
        await s3.uploadFile(tempMetadataPath, metadataKey);
      } else if (this.storageProvider instanceof GCSStorage) {
        const gcs = this.storageProvider as GCSStorage;
        await gcs.uploadFile(tempMetadataPath, metadataKey);
      } else {
        console.warn(
          "[EfficientSync] Cloud metadata storage not supported with this storage provider. Falling back to local.",
        );
        const localMetadataPath = this.getMetadataFilePath(sessionId);
        await fs.writeFile(localMetadataPath, metadataContent);
      }

      // Clean up temp file
      await fs.remove(tempMetadataPath);

      // Update the last update timestamp
      this.lastMetadataUpdate.set(sessionId, Date.now());
    } catch (error) {
      console.error(`[EfficientSync] Error saving metadata to cloud:`, error);
      // Fallback to local storage
      console.log(`[EfficientSync] Falling back to local metadata storage.`);
      const localMetadataPath = this.getMetadataFilePath(sessionId);
      await fs.writeJSON(localMetadataPath, metadata, { spaces: 2 });
    }
  }

  /**
   * Loads metadata from cloud storage
   * @param sessionId - Session ID
   * @returns Map of file paths to their metadata
   */
  private async loadCloudMetadata(
    sessionId: string,
  ): Promise<Map<string, FileMetadata>> {
    try {
      const metadataKey = `${this.userId}/${sessionId}/.browserstate-metadata.json`;
      const tempMetadataPath = path.join(
        this.tempDir,
        `${sessionId}-metadata.json`,
      );

      console.log(
        `[EfficientSync] Loading metadata from cloud storage at ${metadataKey}`,
      );

      let metadataExists = false;

      // Download metadata file using the appropriate storage provider
      if (this.storageProvider instanceof S3Storage) {
        const s3 = this.storageProvider as S3Storage;
        metadataExists = await s3.downloadFile(metadataKey, tempMetadataPath);
      } else if (this.storageProvider instanceof GCSStorage) {
        const gcs = this.storageProvider as GCSStorage;
        metadataExists = await gcs.downloadFile(metadataKey, tempMetadataPath);
      } else {
        console.warn(
          "[EfficientSync] Cloud metadata storage not supported with this storage provider. Falling back to local.",
        );
        return await this.loadLocalMetadata(sessionId);
      }

      if (!metadataExists) {
        console.log(
          `[EfficientSync] No metadata found in cloud storage for session ${sessionId}.`,
        );
        return new Map();
      }

      // Parse the metadata file
      const metadataContent = await fs.readFile(tempMetadataPath, "utf8");
      const metadataObj = JSON.parse(metadataContent);

      // Clean up temp file
      await fs.remove(tempMetadataPath);

      return new Map(Object.entries(metadataObj));
    } catch (error) {
      console.error(
        `[EfficientSync] Error loading metadata from cloud:`,
        error,
      );
      // Fallback to local metadata if available
      console.log(
        `[EfficientSync] Falling back to local metadata if available.`,
      );
      return await this.loadLocalMetadata(sessionId);
    }
  }

  /**
   * Loads metadata from local storage (fallback for cloud)
   * @param sessionId - Session ID
   * @returns Map of file paths to their metadata
   */
  private async loadLocalMetadata(
    sessionId: string,
  ): Promise<Map<string, FileMetadata>> {
    const metadataPath = this.getMetadataFilePath(sessionId);

    if (await fs.pathExists(metadataPath)) {
      try {
        const metadataObj = await fs.readJSON(metadataPath);
        return new Map(Object.entries(metadataObj));
      } catch (error) {
        console.error(
          `Error loading local metadata for session ${sessionId}:`,
          error,
        );
      }
    }

    return new Map();
  }

  /**
   * Compares current files with previous metadata to determine changes
   * @param currentMetadata - Current file metadata
   * @param previousMetadata - Previous file metadata
   * @returns Object containing added, modified, and removed file paths
   */
  private getFileDiffs(
    currentMetadata: Map<string, FileMetadata>,
    previousMetadata: Map<string, FileMetadata>,
  ): { added: string[]; modified: string[]; removed: string[] } {
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];

    // Find added and modified files
    for (const [path, metadata] of currentMetadata.entries()) {
      const previousFile = previousMetadata.get(path);

      if (!previousFile) {
        added.push(path);
      } else if (previousFile.hash !== metadata.hash) {
        modified.push(path);
      }
    }

    // Find removed files
    for (const path of previousMetadata.keys()) {
      if (!currentMetadata.has(path)) {
        removed.push(path);
      }
    }

    return { added, modified, removed };
  }
}
