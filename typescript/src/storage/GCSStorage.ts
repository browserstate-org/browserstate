import { StorageProvider } from "./StorageProvider";
import { FileMetadata } from "../types";
import { Storage } from "@google-cloud/storage";
import fs from "fs-extra";
import path from "path";
import os from "os";

/**
 * Options for Google Cloud Storage
 */
export interface GCSOptions {
  /**
   * Optional prefix/folder path within the bucket
   */
  prefix?: string;
}

/**
 * Google Cloud Storage provider implementation
 */
export class GCSStorage implements StorageProvider {
  private storage: Storage;
  private bucketName: string;
  private prefix?: string;

  constructor(bucketName: string, options?: GCSOptions) {
    this.bucketName = bucketName;
    this.prefix = options?.prefix;
    this.storage = new Storage();
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
   * Downloads a browser session to a local directory
   */
  async download(userId: string, sessionId: string): Promise<string> {
    const prefix = this.getSessionPrefix(userId, sessionId);
    const targetPath = path.join(
      os.tmpdir(),
      "browserstate",
      userId,
      sessionId,
    );

    // Clear target directory if it exists
    await fs.emptyDir(targetPath);

    try {
      const bucket = this.storage.bucket(this.bucketName);

      // List all files with the session prefix
      const [files] = await bucket.getFiles({ prefix });

      if (files.length === 0) {
        // Create an empty directory for new sessions
        await fs.ensureDir(targetPath);
        return targetPath;
      }

      // Download each file
      for (const file of files) {
        // Calculate relative path within the session
        const relativePath = file.name.slice(prefix.length + 1);
        if (!relativePath) continue; // Skip the directory itself

        // Create the local file path
        const localFilePath = path.join(targetPath, relativePath);

        // Ensure the directory exists
        await fs.ensureDir(path.dirname(localFilePath));

        // Download the file
        await file.download({ destination: localFilePath });
      }

      return targetPath;
    } catch (error: unknown) {
      // Ensure directory exists even if download fails
      await fs.ensureDir(targetPath);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error downloading from GCS:", errorMessage);
      return targetPath;
    }
  }

  /**
   * Uploads a browser session to GCS
   */
  async upload(
    userId: string,
    sessionId: string,
    filePath: string,
  ): Promise<void> {
    const prefix = this.getSessionPrefix(userId, sessionId);

    try {
      const bucket = this.storage.bucket(this.bucketName);

      // Read all files in the directory
      const files = await this.getAllFiles(filePath);

      // Upload each file
      for (const file of files) {
        const relativePath = path.relative(filePath, file);
        const gcsPath = `${prefix}/${relativePath}`;

        // Upload the file
        await bucket.upload(file, {
          destination: gcsPath,
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error uploading to GCS:", errorMessage);
      throw new Error(`Failed to upload session to GCS: ${errorMessage}`);
    }
  }

  /**
   * Lists all available sessions for a user
   */
  async listSessions(userId: string): Promise<string[]> {
    const prefix = this.getUserPrefix(userId);

    try {
      const bucket = this.storage.bucket(this.bucketName);

      // List all files with the user prefix
      const [files] = await bucket.getFiles({ prefix });

      // Extract unique session IDs from file paths
      const sessions = new Set<string>();

      for (const file of files) {
        // Skip if it's not under the user prefix
        if (!file.name.startsWith(`${prefix}/`)) continue;

        // Extract the next path component (session ID)
        const remaining = file.name.slice(prefix.length + 1);
        const sessionId = remaining.split("/")[0];
        if (sessionId) {
          sessions.add(sessionId);
        }
      }

      return Array.from(sessions);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error listing sessions from GCS:", errorMessage);
      return [];
    }
  }

  /**
   * Deletes a session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const prefix = this.getSessionPrefix(userId, sessionId);

    try {
      const bucket = this.storage.bucket(this.bucketName);

      // List all files with the session prefix
      const [files] = await bucket.getFiles({ prefix });

      if (files.length === 0) {
        console.log(`No files found for session ${sessionId}`);
        return;
      }

      // Delete each file
      await Promise.all(files.map((file) => file.delete()));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error deleting session from GCS:", errorMessage);
      throw new Error(`Failed to delete session from GCS: ${errorMessage}`);
    }
  }

  /**
   * Downloads a single file from storage
   */
  async downloadFile(gcsPath: string, localPath: string): Promise<boolean> {
    try {
      console.log(
        `[GCS] Downloading single file from GCS: ${gcsPath} -> ${localPath}`,
      );

      // Ensure the directory exists
      await fs.ensureDir(path.dirname(localPath));

      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(gcsPath);

      // Check if the file exists
      const [exists] = await file.exists();
      if (!exists) {
        console.log(`[GCS] File does not exist in GCS: ${gcsPath}`);
        return false;
      }

      // Download the file
      await file.download({ destination: localPath });

      console.log(`[GCS] Successfully downloaded file from ${gcsPath}`);
      return true;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GCS] Error downloading file from GCS: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Uploads a single file to storage
   */
  async uploadFile(filePath: string, gcsPath: string): Promise<void> {
    try {
      console.log(
        `[GCS] Uploading single file to GCS: ${filePath} -> ${gcsPath}`,
      );

      const bucket = this.storage.bucket(this.bucketName);

      // Upload the file
      await bucket.upload(filePath, {
        destination: gcsPath,
      });

      console.log(`[GCS] Successfully uploaded file to ${gcsPath}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[GCS] Error uploading file to GCS: ${errorMessage}`);
      throw new Error(`Failed to upload file to GCS: ${errorMessage}`);
    }
  }

  /**
   * Gets metadata for a session
   */
  async getMetadata(
    userId: string,
    sessionId: string,
  ): Promise<Map<string, FileMetadata>> {
    const metadataPath = `${this.getSessionPrefix(userId, sessionId)}/.browserstate-metadata.json`;
    const tempMetadataPath = path.join(
      os.tmpdir(),
      "browserstate",
      `${sessionId}-metadata.json`,
    );

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(metadataPath);

      // Check if metadata file exists
      const [exists] = await file.exists();
      if (!exists) {
        return new Map();
      }

      // Download metadata file
      await file.download({ destination: tempMetadataPath });

      // Read and parse metadata
      const metadataContent = await fs.readFile(tempMetadataPath, "utf8");
      const metadataObj = JSON.parse(metadataContent);

      // Clean up temp file
      await fs.remove(tempMetadataPath);

      return new Map(Object.entries(metadataObj));
    } catch (error) {
      console.error(`[GCS] Error loading metadata from GCS:`, error);
      return new Map();
    }
  }

  /**
   * Saves metadata for a session
   */
  async saveMetadata(
    userId: string,
    sessionId: string,
    metadata: Map<string, FileMetadata>,
  ): Promise<void> {
    const metadataPath = `${this.getSessionPrefix(userId, sessionId)}/.browserstate-metadata.json`;
    const tempMetadataPath = path.join(
      os.tmpdir(),
      "browserstate",
      `${sessionId}-metadata.json`,
    );

    try {
      // Convert metadata to JSON
      const metadataObj = Object.fromEntries(metadata);
      const metadataContent = JSON.stringify(metadataObj);

      // Write to temp file
      await fs.writeFile(tempMetadataPath, metadataContent);

      const bucket = this.storage.bucket(this.bucketName);

      // Upload to GCS
      await bucket.upload(tempMetadataPath, {
        destination: metadataPath,
      });

      // Clean up temp file
      await fs.remove(tempMetadataPath);
    } catch (error) {
      console.error(`[GCS] Error saving metadata to GCS:`, error);
      throw new Error(`Failed to save metadata to GCS: ${error}`);
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
