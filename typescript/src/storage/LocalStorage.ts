import { StorageProvider } from "./StorageProvider";
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

export class LocalStorage implements StorageProvider {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(os.homedir(), ".browserstate");
    // Ensure base directory exists
    fs.ensureDirSync(this.basePath);
  }

  /**
   * Get path for a specific user's data
   */
  private getUserPath(userId: string): string {
    const userPath = path.join(this.basePath, userId);
    fs.ensureDirSync(userPath);
    return userPath;
  }

  /**
   * Get path for a specific session
   */
  private getSessionPath(userId: string, sessionId: string): string {
    return path.join(this.getUserPath(userId), sessionId);
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
   * Downloads a browser session to local temp directory
   */
  async download(userId: string, sessionId: string): Promise<string> {
    const sessionPath = this.getSessionPath(userId, sessionId);
    const targetPath = this.getTempPath(userId, sessionId);

    // Check if session exists
    if (await fs.pathExists(sessionPath)) {
      // Clear target directory if it already exists
      await fs.emptyDir(targetPath);

      // Copy session data to temp directory
      await fs.copy(sessionPath, targetPath);
    } else {
      // Create an empty directory for new sessions
      await fs.ensureDir(targetPath);
    }

    return targetPath;
  }

  /**
   * Uploads browser session files from temp to storage
   */
  async upload(
    userId: string,
    sessionId: string,
    filePath: string,
  ): Promise<void> {
    const sessionPath = this.getSessionPath(userId, sessionId);

    // Ensure session directory exists
    await fs.ensureDir(sessionPath);

    // Copy files to storage
    await fs.copy(filePath, sessionPath, { overwrite: true });
  }

  /**
   * Lists all available sessions for a user
   */
  async listSessions(userId: string): Promise<string[]> {
    const userPath = this.getUserPath(userId);

    try {
      const entries = await fs.readdir(userPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      // Directory does not exist, return empty array
      return [];
    }
  }

  /**
   * Deletes a session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(userId, sessionId);

    if (await fs.pathExists(sessionPath)) {
      await fs.remove(sessionPath);
    }
  }
}
