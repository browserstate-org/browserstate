import { StorageProvider } from "./StorageProvider";
import { Storage } from "@google-cloud/storage";
import fs from "fs-extra";
import path from "path";
import os from "os";

export interface GCSStorageOptions {
  keyFilePath?: string;
  projectID?: string;
  prefix?: string;
}

export class GCSStorage implements StorageProvider {
  private bucketName: string;
  private storageClient: Storage;
  private prefix?: string;

  constructor(bucketName: string, options?: GCSStorageOptions) {
    this.bucketName = bucketName;
    this.prefix = options?.prefix;
    
    const storageOptions: Record<string, unknown> = {};
    
    if (options?.keyFilePath) {
      storageOptions.keyFilename = options.keyFilePath;
    }
    
    if (options?.projectID) {
      storageOptions.projectId = options.projectID;
    }
    
    this.storageClient = new Storage(
      Object.keys(storageOptions).length > 0 ? storageOptions : undefined
    );
  }

  /**
   * Get the full GCS path prefix for a user
   */
  private getUserPrefix(userId: string): string {
    return this.prefix 
      ? `${this.prefix}/${userId}`
      : userId;
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
    const bucket = this.storageClient.bucket(this.bucketName);
    const prefix = this.getSessionPrefix(userId, sessionId);
    const targetPath = this.getTempPath(userId, sessionId);
    
    // Clear target directory if it exists
    await fs.emptyDir(targetPath);
    
    try {
      // First check if the bucket exists 
      console.log(`Checking if bucket "${this.bucketName}" exists...`);
      const [exists] = await bucket.exists();
      if (!exists) {
        throw new Error(`GCS bucket "${this.bucketName}" does not exist or is not accessible`);
      }
      
      console.log(`Bucket "${this.bucketName}" found, downloading files...`);
      
      // List all files with the session prefix
      const [files] = await bucket.getFiles({ prefix });
      
      if (files.length === 0) {
        console.log(`No existing state found at ${prefix}, creating new state directory`);
        // Create an empty directory for new sessions
        await fs.ensureDir(targetPath);
        return targetPath;
      }
      
      console.log(`Found ${files.length} files to download`);
      
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
      // Critical errors should be thrown
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error downloading from GCS:", errorMessage);
      
      // Always throw bucket not found errors
      if (errorMessage.includes("does not exist") || 
          errorMessage.includes("not accessible") ||
          errorMessage.includes("notFound")) {
        throw error;
      }
      
      // Ensure directory exists for non-critical errors
      await fs.ensureDir(targetPath);
      return targetPath;
    }
  }

  /**
   * Uploads a browser session to Google Cloud Storage
   */
  async upload(userId: string, sessionId: string, filePath: string): Promise<void> {
    const bucket = this.storageClient.bucket(this.bucketName);
    const prefix = this.getSessionPrefix(userId, sessionId);
    
    try {
      // Read all files in the directory
      const files = await this.getAllFiles(filePath);
      
      // Upload each file
      for (const file of files) {
        const relativePath = path.relative(filePath, file);
        const destination = `${prefix}/${relativePath}`;
        
        await bucket.upload(file, { destination });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error uploading to GCS:", errorMessage);
      throw new Error(`Failed to upload session to Google Cloud Storage: ${errorMessage}`);
    }
  }

  /**
   * Lists all available sessions for a user
   */
  async listSessions(userId: string): Promise<string[]> {
    const bucket = this.storageClient.bucket(this.bucketName);
    const prefix = this.getUserPrefix(userId);
    
    try {
      // List all files with the user prefix
      const [files] = await bucket.getFiles({
        prefix: `${prefix}/`
      });
      
      // Extract session IDs from file paths
      const sessions = new Set<string>();
      
      // Check file paths to extract session IDs
      for (const file of files) {
        const filePath = file.name;
        // Skip if it's not under the user prefix
        if (!filePath.startsWith(`${prefix}/`)) continue;
        
        // Extract the next path component (session ID)
        const remaining = filePath.slice(prefix.length + 1);
        const sessionId = remaining.split('/')[0];
        if (sessionId) {
          sessions.add(sessionId);
        }
      }
      
      return Array.from(sessions);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error listing sessions from GCS:", errorMessage);
      return [];
    }
  }

  /**
   * Deletes a session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const bucket = this.storageClient.bucket(this.bucketName);
    const prefix = this.getSessionPrefix(userId, sessionId);
    
    try {
      // List all files with the session prefix
      const [files] = await bucket.getFiles({ prefix });
      
      if (files.length === 0) {
        return; // Nothing to delete
      }
      
      // Delete each file
      await Promise.all(files.map((file: { delete: () => Promise<unknown> }) => file.delete()));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error deleting session from GCS:", errorMessage);
      throw new Error(`Failed to delete session from Google Cloud Storage: ${errorMessage}`);
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