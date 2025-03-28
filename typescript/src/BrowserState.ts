import { StorageProvider } from "./storage/StorageProvider";
import { LocalStorage } from "./storage/LocalStorage";
import { S3Storage } from "./storage/S3Storage";
import { GCSStorage } from "./storage/GCSStorage";
import fs from "fs-extra";
import path from "path";
import os from "os";

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

  /**
   * Creates a new BrowserState instance
   *
   * @param options - Configuration options
   */
  constructor(options: BrowserStateOptions = {}) {
    // Set default user ID
    this.userId = options.userId || "default";
    this.autoCleanup = options.autoCleanup !== false;

    // Create base temp directory for this instance
    this.tempDir = path.join(os.tmpdir(), "browserstate", this.userId);
    fs.ensureDirSync(this.tempDir);

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
          keyFilename: options.gcsOptions.keyFilename,
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
      const userDataDir = await this.storageProvider.download(
        this.userId,
        sessionId,
      );

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
      await this.storageProvider.upload(
        this.userId,
        this.currentSession,
        this.sessionPath,
      );

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
}
