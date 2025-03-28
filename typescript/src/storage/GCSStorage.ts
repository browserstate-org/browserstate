import { StorageProvider } from "./StorageProvider";
import type { Storage as StorageType } from "@google-cloud/storage";
import fs from "fs-extra";
import path from "path";
import os from "os";

export interface GCSStorageOptions {
  keyFilePath?: string;
  projectID?: string;
  prefix?: string;
}

// Define type for dynamic import
interface GCPStorage {
  Storage: typeof StorageType;
}

export class GCSStorage implements StorageProvider {
  private bucketName: string;
  private storageClient: StorageType | null = null;
  private gcpModulesLoaded = false;
  private gcpSDK: GCPStorage | null = null;
  private prefix?: string;

  constructor(bucketName: string, options?: GCSStorageOptions) {
    this.bucketName = bucketName;
    this.prefix = options?.prefix;

    // Initialize with dynamic import (but don't throw if it fails)
    this.initClient(options).catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[GCS] Initialization failed, will retry on first usage:",
          error,
        );
      }
    });
  }

  /**
   * Dynamically imports Google Cloud Storage module
   */
  private async initClient(options?: GCSStorageOptions): Promise<void> {
    if (this.gcpModulesLoaded) return;

    try {
      // Dynamically import GCP Storage module
      this.gcpSDK = (await import("@google-cloud/storage")) as GCPStorage;

      const storageOptions: Record<string, unknown> = {};

      if (options?.keyFilePath) {
        storageOptions.keyFilename = options.keyFilePath;
      }

      if (options?.projectID) {
        storageOptions.projectId = options.projectID;
      }

      this.storageClient = new this.gcpSDK.Storage(
        Object.keys(storageOptions).length > 0 ? storageOptions : undefined,
      );
      this.gcpModulesLoaded = true;
    } catch (error) {
      this.storageClient = null;
      this.gcpSDK = null;

      if (process.env.NODE_ENV !== "production") {
        console.error("[GCS] Failed to load GCP Storage module:", error);
      }
      // We'll throw a more specific error when methods are called
    }
  }

  /**
   * Ensures Storage client is available
   */
  private async ensureClientInitialized(): Promise<void> {
    if (!this.gcpModulesLoaded || !this.storageClient || !this.gcpSDK) {
      await this.initClient();

      // Check if initialization succeeded
      if (!this.gcpModulesLoaded || !this.storageClient || !this.gcpSDK) {
        throw new Error(
          "Google Cloud Storage module not available. Install @google-cloud/storage to use GCSStorage.",
        );
      }
    }
  }

  /**
   * Get the full GCS path prefix for a user
   */
  private getUserPrefix(userId: string): string {
    return this.prefix ? `${this.prefix}/${userId}` : userId;
  }

  /**
   * Get the full GCS path prefix for a session
   */
  private getSessionPrefix(userId: string, sessionId: string): string {
    return `${this.getUserPrefix(userId)}/${sessionId}`;
  }

  /**
   * Get a temporary path for a session
   */
  private getTempPath(userId: string, sessionId: string): string {
    const tempDir = path.join(os.tmpdir(), "browserstate", userId);
    fs.ensureDirSync(tempDir);
    return path.join(tempDir, sessionId);
  }

  /**
   * Downloads a browser session to a local directory
   */
  async download(userId: string, sessionId: string): Promise<string> {
    await this.ensureClientInitialized();

    const bucket = this.storageClient!.bucket(this.bucketName);
    const prefix = this.getSessionPrefix(userId, sessionId);
    const targetPath = this.getTempPath(userId, sessionId);

    console.log(
      `[GCS] Preparing to download session from GCS bucket "${this.bucketName}"`,
    );
    console.log(`[GCS] Session path in cloud: ${prefix}`);
    console.log(`[GCS] Local target path: ${targetPath}`);

    // Create empty directory first to ensure we can return something even if later steps fail
    await fs.ensureDir(targetPath);
    await fs.emptyDir(targetPath);

    try {
      // First check if the bucket exists
      console.log(`[GCS] Checking if bucket "${this.bucketName}" exists...`);
      const [exists] = await bucket.exists();
      if (!exists) {
        const error = `GCS bucket "${this.bucketName}" does not exist or is not accessible`;
        console.error(`[GCS] ${error}`);
        console.log(
          `[GCS] Falling back to new empty state directory at ${targetPath}`,
        );
        return targetPath;
      }

      console.log(
        `[GCS] Bucket "${this.bucketName}" found, checking for existing state...`,
      );

      // Check if the state directory exists by looking for any files with the prefix
      try {
        const [files] = await bucket.getFiles({
          prefix,
          maxResults: 5, // Only need to check if any files exist, don't need all
        });

        if (files.length === 0) {
          console.log(`[GCS] ✨ No existing state found in cloud at ${prefix}`);
          console.log(
            `[GCS] ✨ Using new empty state directory at ${targetPath}`,
          );
          return targetPath;
        }

        console.log(
          `[GCS] Found existing state in cloud with at least ${files.length} files`,
        );
        console.log(`[GCS] Downloading files from GCS to ${targetPath}...`);

        // Now get the full list of files
        const [allFiles] = await bucket.getFiles({ prefix });

        // Download each file with tracking and timeout
        let downloadedCount = 0;
        const DOWNLOAD_TIMEOUT = 30000; // 30 seconds timeout per file

        for (const file of allFiles) {
          // Calculate relative path within the session
          const relativePath = file.name.slice(prefix.length + 1);
          if (!relativePath) continue; // Skip the directory itself

          // Create the local file path
          const localFilePath = path.join(targetPath, relativePath);

          // Ensure the directory exists
          await fs.ensureDir(path.dirname(localFilePath));

          try {
            // Download the file with timeout
            const downloadPromise = file.download({
              destination: localFilePath,
            });
            await Promise.race([
              downloadPromise,
              new Promise((_, reject) =>
                setTimeout(
                  () =>
                    reject(new Error(`Download timeout for ${relativePath}`)),
                  DOWNLOAD_TIMEOUT,
                ),
              ),
            ]);

            downloadedCount++;
            if (
              downloadedCount % 10 === 0 ||
              downloadedCount === allFiles.length
            ) {
              console.log(
                `[GCS] Downloaded ${downloadedCount}/${allFiles.length} files (${Math.round((downloadedCount / allFiles.length) * 100)}%)...`,
              );
            }
          } catch (downloadError) {
            console.error(
              `[GCS] Error downloading file ${relativePath}: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`,
            );
            // Continue with next file
          }
        }

        if (downloadedCount === 0 && allFiles.length > 0) {
          console.log(
            `[GCS] ⚠️ Warning: Failed to download any files from cloud. Using empty state directory.`,
          );
          return targetPath;
        }

        console.log(
          `[GCS] Successfully downloaded ${downloadedCount}/${allFiles.length} files to ${targetPath}`,
        );
        return targetPath;
      } catch (listError) {
        console.error(
          `[GCS] Error listing files: ${listError instanceof Error ? listError.message : String(listError)}`,
        );
        console.log(
          `[GCS] Falling back to new empty state directory at ${targetPath}`,
        );
        return targetPath;
      }
    } catch (error: unknown) {
      // Log the error but return the empty directory path
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GCS] Error during download from GCS: ${errorMessage}`);
      console.log(
        `[GCS] Falling back to new empty state directory at ${targetPath}`,
      );
      return targetPath;
    }
  }

  /**
   * Uploads a browser session to Google Cloud Storage
   */
  async upload(
    userId: string,
    sessionId: string,
    filePath: string,
  ): Promise<void> {
    await this.ensureClientInitialized();

    const bucket = this.storageClient!.bucket(this.bucketName);
    const prefix = this.getSessionPrefix(userId, sessionId);

    console.log(
      `[GCS] Preparing to upload session to GCS bucket "${this.bucketName}"`,
    );
    console.log(`[GCS] Target path in cloud: ${prefix}`);
    console.log(`[GCS] Source local path: ${filePath}`);

    try {
      // Read all files in the directory
      const files = await this.getAllFiles(filePath);
      console.log(`[GCS] Found ${files.length} files to upload`);

      // Upload each file
      let uploadedCount = 0;
      for (const file of files) {
        const relativePath = path.relative(filePath, file);
        const destination = `${prefix}/${relativePath}`;

        await bucket.upload(file, { destination });
        uploadedCount++;

        if (uploadedCount % 10 === 0) {
          console.log(
            `[GCS] Uploaded ${uploadedCount}/${files.length} files...`,
          );
        }
      }

      console.log(
        `[GCS] Successfully uploaded all ${files.length} files to cloud at ${prefix}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GCS] Error uploading to GCS: ${errorMessage}`);
      throw new Error(
        `Failed to upload session to Google Cloud Storage: ${errorMessage}`,
      );
    }
  }

  /**
   * Lists all available sessions for a user
   */
  async listSessions(userId: string): Promise<string[]> {
    await this.ensureClientInitialized();

    const bucket = this.storageClient!.bucket(this.bucketName);
    const prefix = this.getUserPrefix(userId);

    console.log(
      `[GCS] Listing available sessions for user ${userId} in bucket "${this.bucketName}"`,
    );
    console.log(`[GCS] Looking in path: ${prefix}/`);

    try {
      // List all files with the user prefix
      const [files] = await bucket.getFiles({
        prefix: `${prefix}/`,
      });

      console.log(`[GCS] Found ${files.length} files under user path`);

      // Extract session IDs from file paths
      const sessions = new Set<string>();

      // Check file paths to extract session IDs
      for (const file of files) {
        const filePath = file.name;
        // Skip if it's not under the user prefix
        if (!filePath.startsWith(`${prefix}/`)) continue;

        // Extract the next path component (session ID)
        const remaining = filePath.slice(prefix.length + 1);
        const sessionId = remaining.split("/")[0];
        if (sessionId) {
          sessions.add(sessionId);
        }
      }

      const sessionsList = Array.from(sessions);
      console.log(
        `[GCS] Identified ${sessionsList.length} unique sessions: ${sessionsList.join(", ")}`,
      );
      return sessionsList;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GCS] Error listing sessions from GCS: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Deletes a session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.ensureClientInitialized();

    const bucket = this.storageClient!.bucket(this.bucketName);
    const prefix = this.getSessionPrefix(userId, sessionId);

    console.log(
      `[GCS] Deleting session ${sessionId} for user ${userId} from bucket "${this.bucketName}"`,
    );
    console.log(`[GCS] Deleting path: ${prefix}/`);

    try {
      // List all files with the session prefix
      const [files] = await bucket.getFiles({ prefix });

      if (files.length === 0) {
        console.log(`[GCS] No files found for session ${sessionId}`);
        return;
      }

      console.log(`[GCS] Found ${files.length} files to delete`);

      // Delete each file
      let deletedCount = 0;
      for (const file of files) {
        await file.delete();
        deletedCount++;

        if (deletedCount % 10 === 0) {
          console.log(`[GCS] Deleted ${deletedCount}/${files.length} files...`);
        }
      }

      console.log(
        `[GCS] Successfully deleted all ${files.length} files for session ${sessionId}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GCS] Error deleting session from GCS: ${errorMessage}`);
      throw new Error(
        `Failed to delete session from Google Cloud Storage: ${errorMessage}`,
      );
    }
  }

  /**
   * Recursively gets all files in a directory
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively get files from subdirectories
        const subDirFiles = await this.getAllFiles(fullPath);
        files.push(...subDirFiles);
      } else {
        // Add file path
        files.push(fullPath);
      }
    }

    return files;
  }
}
