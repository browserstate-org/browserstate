import { StorageProvider } from "./storage/StorageProvider";
import { CloudStorageProvider } from "./storage/CloudStorageProvider";
import { LocalStorage } from "./storage/LocalStorage";
import { S3Storage } from "./storage/S3Storage";
import { GCSStorage } from "./storage/GCSStorage";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { SyncManager } from "./sync/SyncManager";
import {
  BrowserStateError,
  StorageProviderError,
  ValidationError,
  ErrorCodes,
} from "./errors";

/**
 * Options for configuring BrowserState
 */
export interface BrowserStateOptions {
  userId: string;
  storageType: "local" | "s3" | "gcs";
  cleanupMode?: "exit-only" | "always";
  useSync?: boolean;
  syncOptions?: {
    storeMetadataOnProvider: boolean;
    metadataUpdateInterval: number;
  };
  localOptions?: {
    storagePath?: string;
  };
  s3Options?: {
    bucketName: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  gcsOptions?: {
    bucketName: string;
    projectID: string;
    keyFilename: string;
    prefix?: string;
  };
}

/**
 * Cleanup mode for browser state
 */
export type CleanupMode = "exit-only" | "always";

/**
 * Main BrowserState class for managing browser sessions
 */
export class BrowserState {
  private storageProvider: StorageProvider | null = null;
  private syncManager: SyncManager | null = null;
  private isMounted = false;
  private cleanupMode: CleanupMode;
  private useSync: boolean;
  private syncOptions: {
    storeMetadataOnProvider: boolean;
    metadataUpdateInterval: number;
  };
  private options: BrowserStateOptions;
  private currentSession: string | null = null;

  constructor(options: BrowserStateOptions) {
    this.options = options;
    this.cleanupMode = options.cleanupMode || "exit-only";
    this.useSync = options.useSync || false;
    this.syncOptions = options.syncOptions || {
      storeMetadataOnProvider: true,
      metadataUpdateInterval: 60,
    };
    this.validateOptions();
  }

  /**
   * Validate required options based on storage type
   */
  private validateOptions(): void {
    if (!this.options.userId) {
      throw new ValidationError("userId is required");
    }

    if (!this.options.storageType) {
      throw new ValidationError("storageType is required");
    }

    switch (this.options.storageType) {
      case "s3":
        if (
          !this.options.s3Options?.bucketName ||
          !this.options.s3Options?.region ||
          !this.options.s3Options?.accessKeyId ||
          !this.options.s3Options?.secretAccessKey
        ) {
          throw new ValidationError(
            "S3 options require bucketName, region, accessKeyId, and secretAccessKey",
          );
        }
        break;
      case "gcs":
        if (
          !this.options.gcsOptions?.bucketName ||
          !this.options.gcsOptions?.projectID ||
          !this.options.gcsOptions?.keyFilename
        ) {
          throw new ValidationError(
            "GCS options require bucketName, projectID, and keyFilename",
          );
        }
        break;
    }
  }

  /**
   * Create the appropriate storage provider
   */
  private createStorageProvider(): StorageProvider {
    try {
      switch (this.options.storageType) {
        case "local":
          return new LocalStorage(this.options.localOptions?.storagePath);
        case "s3":
          if (!this.options.s3Options) {
            throw new ValidationError(
              "S3 options are required for S3 storage type",
            );
          }
          return new S3Storage(
            this.options.s3Options.bucketName,
            this.options.s3Options.region,
            {
              accessKeyId: this.options.s3Options.accessKeyId,
              secretAccessKey: this.options.s3Options.secretAccessKey,
            },
          );
        case "gcs":
          if (!this.options.gcsOptions) {
            throw new ValidationError(
              "GCS options are required for GCS storage type",
            );
          }
          return new GCSStorage(this.options.gcsOptions);
        default:
          throw new ValidationError(
            `Unsupported storage type: ${this.options.storageType}`,
          );
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new StorageProviderError(
        `Failed to create storage provider: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        this.options.storageType,
      );
    }
  }

  /**
   * Mount a browser session
   */
  async mount(sessionId: string): Promise<string> {
    if (this.isMounted) {
      throw new BrowserStateError(
        "Browser state is already mounted",
        ErrorCodes.STATE_ERROR,
      );
    }

    try {
      // Create storage provider if not exists
      if (!this.storageProvider) {
        this.storageProvider = this.createStorageProvider();
      }

      // Create temporary directory for browser state
      const userDataDir = path.join(
        os.tmpdir(),
        "browserstate",
        this.options.userId,
        sessionId,
      );
      await fs.mkdir(userDataDir, { recursive: true });

      // Download session data
      await this.storageProvider.download(this.options.userId, sessionId);

      // Initialize sync manager if enabled and using cloud storage
      if (this.useSync && this.isCloudStorageProvider(this.storageProvider)) {
        this.syncManager = new SyncManager(
          this.storageProvider,
          this.options.userId,
          sessionId,
          this.syncOptions,
        );
      }

      this.isMounted = true;
      this.currentSession = sessionId;
      return userDataDir;
    } catch (error) {
      // Clean up temporary directory on error
      try {
        await fs.rm(
          path.join(
            os.tmpdir(),
            "browserstate",
            this.options.userId,
            sessionId,
          ),
          { recursive: true, force: true },
        );
      } catch (cleanupError) {
        console.error("Failed to clean up temporary directory:", cleanupError);
      }

      if (
        error instanceof BrowserStateError ||
        error instanceof StorageProviderError
      ) {
        throw error;
      }
      throw new BrowserStateError(
        `Failed to mount browser state: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
      );
    }
  }

  /**
   * Type guard to check if a storage provider is a cloud storage provider
   */
  private isCloudStorageProvider(
    provider: StorageProvider,
  ): provider is CloudStorageProvider {
    return (
      "deleteFile" in provider &&
      "uploadFile" in provider &&
      "downloadFile" in provider
    );
  }

  /**
   * Unmount the current browser session
   */
  async unmount(): Promise<void> {
    if (!this.isMounted) {
      throw new BrowserStateError(
        "Browser state is not mounted",
        ErrorCodes.STATE_ERROR,
      );
    }

    try {
      if (this.syncManager && this.currentSession) {
        await this.syncManager.syncToCloud(
          path.join(
            os.tmpdir(),
            "browserstate",
            this.options.userId,
            this.currentSession,
          ),
        );
      }

      if (this.cleanupMode === "always") {
        await this.cleanup();
      }

      this.isMounted = false;
      this.syncManager = null;
      this.currentSession = null;
    } catch (error) {
      if (
        error instanceof BrowserStateError ||
        error instanceof StorageProviderError
      ) {
        throw error;
      }
      throw new BrowserStateError(
        `Failed to unmount browser state: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
      );
    }
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(): Promise<void> {
    try {
      await fs.rm(path.join(os.tmpdir(), "browserstate", this.options.userId), {
        recursive: true,
        force: true,
      });
    } catch (error) {
      throw new BrowserStateError(
        `Failed to clean up temporary files: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
      );
    }
  }

  /**
   * List available sessions
   */
  async listSessions(): Promise<string[]> {
    if (!this.storageProvider) {
      this.storageProvider = this.createStorageProvider();
    }
    return this.storageProvider.listSessions(this.options.userId);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.storageProvider) {
      this.storageProvider = this.createStorageProvider();
    }
    await this.storageProvider.deleteSession(this.options.userId, sessionId);
  }
}
