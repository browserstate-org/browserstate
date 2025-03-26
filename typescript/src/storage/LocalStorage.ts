import { StorageProvider } from "./StorageProvider";
import { FileMetadata } from "../types";
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
 * Local file system storage provider implementation
 */
export class LocalStorage implements StorageProvider {
  private basePath: string;

  constructor(storagePath?: string) {
    // Use provided path or default to ~/.browserstate
    this.basePath = storagePath || path.join(os.homedir(), ".browserstate");
    fs.ensureDirSync(this.basePath);
  }

  /**
   * Get the full path for a user
   */
  private getUserPath(userId: string): string {
    return path.join(this.basePath, userId);
  }

  /**
   * Get the full path for a session
   */
  private getSessionPath(userId: string, sessionId: string): string {
    return path.join(this.getUserPath(userId), sessionId);
  }

  /**
   * Downloads a browser session to a local directory
   */
  async download(userId: string, sessionId: string): Promise<string> {
    const sourcePath = this.getSessionPath(userId, sessionId);
    const targetPath = path.join(
      os.tmpdir(),
      "browserstate",
      userId,
      sessionId,
    );

    // Clear target directory if it exists
    await fs.emptyDir(targetPath);

    try {
      // Copy the session directory
      await fs.copy(sourcePath, targetPath);
      return targetPath;
    } catch (error: unknown) {
      // Ensure directory exists even if copy fails
      await fs.ensureDir(targetPath);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error downloading from local storage:", errorMessage);
      return targetPath;
    }
  }

  /**
   * Uploads a browser session from a local directory
   */
  async upload(
    userId: string,
    sessionId: string,
    filePath: string,
  ): Promise<void> {
    const targetPath = this.getSessionPath(userId, sessionId);

    try {
      // Ensure target directory exists
      await fs.ensureDir(targetPath);

      // Copy the session directory
      await fs.copy(filePath, targetPath);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error uploading to local storage:", errorMessage);
      throw new Error(
        `Failed to upload session to local storage: ${errorMessage}`,
      );
    }
  }

  /**
   * Lists available sessions for a user
   */
  async listSessions(userId: string): Promise<string[]> {
    const userPath = this.getUserPath(userId);

    try {
      // Ensure user directory exists
      await fs.ensureDir(userPath);

      // List directories in user path
      const entries = await fs.readdir(userPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error listing sessions from local storage:", errorMessage);
      return [];
    }
  }

  /**
   * Deletes a browser session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(userId, sessionId);

    try {
      if (await fs.pathExists(sessionPath)) {
        await fs.remove(sessionPath);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error deleting session from local storage:", errorMessage);
      throw new Error(
        `Failed to delete session from local storage: ${errorMessage}`,
      );
    }
  }

  /**
   * Downloads a single file from storage
   */
  async downloadFile(s3Key: string, localPath: string): Promise<boolean> {
    try {
      const sourcePath = path.join(this.basePath, s3Key);
      if (!(await fs.pathExists(sourcePath))) {
        return false;
      }
      await fs.copy(sourcePath, localPath);
      return true;
    } catch (error) {
      console.error(`Error downloading file from local storage:`, error);
      return false;
    }
  }

  /**
   * Uploads a single file to storage
   */
  async uploadFile(filePath: string, s3Key: string): Promise<void> {
    try {
      const targetPath = path.join(this.basePath, s3Key);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.copy(filePath, targetPath);
    } catch (error) {
      console.error(`Error uploading file to local storage:`, error);
      throw new Error(`Failed to upload file to local storage: ${error}`);
    }
  }

  /**
   * Gets metadata for a session
   */
  async getMetadata(
    userId: string,
    sessionId: string,
  ): Promise<Map<string, FileMetadata>> {
    const sessionPath = this.getSessionPath(userId, sessionId);
    const metadataPath = path.join(sessionPath, ".browserstate-metadata.json");

    try {
      if (await fs.pathExists(metadataPath)) {
        const metadataContent = await fs.readFile(metadataPath, "utf8");
        const metadataObj = JSON.parse(metadataContent);
        return new Map(Object.entries(metadataObj));
      }
      return new Map();
    } catch (error) {
      console.error(`Error loading metadata from local storage:`, error);
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
    const sessionPath = this.getSessionPath(userId, sessionId);
    const metadataPath = path.join(sessionPath, ".browserstate-metadata.json");

    try {
      await fs.ensureDir(sessionPath);
      const metadataObj = Object.fromEntries(metadata);
      await fs.writeJSON(metadataPath, metadataObj, { spaces: 2 });
    } catch (error) {
      console.error(`Error saving metadata to local storage:`, error);
      throw new Error(`Failed to save metadata to local storage: ${error}`);
    }
  }
}
