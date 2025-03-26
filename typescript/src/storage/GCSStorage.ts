import { CloudStorageProvider } from "./CloudStorageProvider";
import { FileMetadata } from "../types";
import { Storage, Bucket, File } from "@google-cloud/storage";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  StorageProviderError,
  AuthenticationError,
  ConnectionError,
  ErrorCodes,
} from "../errors";
import { ProgressTracker } from "../utils/ProgressTracker";

/**
 * Options for Google Cloud Storage
 */
export interface GCSOptions {
  /**
   * Optional prefix/folder path within the bucket
   */
  prefix?: string;
  bucketName: string;
  projectID: string;
  keyFilename: string;
}

/**
 * Google Cloud Storage provider implementation
 */
export class GCSStorage implements CloudStorageProvider {
  private storage: Storage;
  private bucket: Bucket;
  private prefix?: string;
  private progressTracker: ProgressTracker;

  constructor(options: GCSOptions) {
    this.prefix = options.prefix;
    this.progressTracker = ProgressTracker.getInstance();
    try {
      this.storage = new Storage({
        projectId: options.projectID,
        keyFilename: options.keyFilename,
      });
      this.bucket = this.storage.bucket(options.bucketName);
    } catch (error) {
      if (error instanceof Error && error.message.includes("credentials")) {
        throw new AuthenticationError(
          "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
          "gcs",
        );
      }
      throw new StorageProviderError(
        `Failed to initialize GCS storage: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
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
   * Downloads a browser session to a local directory
   */
  async download(userId: string, sessionId: string): Promise<string> {
    try {
      const sessionPrefix = this.getSessionPrefix(userId, sessionId);
      const targetPath = path.join(
        os.tmpdir(),
        "browserstate",
        userId,
        sessionId,
      );

      // Clear target directory
      await fs.rm(targetPath, { recursive: true, force: true });
      await fs.mkdir(targetPath, { recursive: true });

      // Get list of files and total size
      const [files] = await this.bucket.getFiles({ prefix: sessionPrefix });
      const totalBytes = await this.getTotalSize(files);

      // Download each file with progress tracking
      let downloadedBytes = 0;
      this.progressTracker.startOperation({
        type: "download",
        fileName: sessionId,
        totalBytes,
      });

      for (const file of files) {
        const relativePath = file.name.slice(sessionPrefix.length + 1);
        const localPath = path.join(targetPath, relativePath);
        await fs.mkdir(path.dirname(localPath), { recursive: true });

        await new Promise<void>((resolve, reject) => {
          const writeStream = fs.createWriteStream(localPath);
          const readStream = file.createReadStream();

          readStream.on("data", (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            this.progressTracker.updateProgress(downloadedBytes);
          });

          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
          readStream.on("error", reject);
          readStream.pipe(writeStream);
        });
      }

      this.progressTracker.completeOperation();
      return targetPath;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
            "gcs",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to Google Cloud Storage. Please check your network connection.",
            "gcs",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to download session: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
    }
  }

  /**
   * Get total size of files
   */
  private async getTotalSize(files: File[]): Promise<number> {
    let totalSize = 0;
    for (const file of files) {
      const [metadata] = await file.getMetadata();
      const size = metadata.size;
      if (typeof size === "string") {
        totalSize += parseInt(size, 10);
      } else if (typeof size === "number") {
        totalSize += size;
      }
    }
    return totalSize;
  }

  /**
   * Uploads a browser session to GCS
   */
  async upload(
    userId: string,
    sessionId: string,
    sourcePath: string,
  ): Promise<void> {
    try {
      const sessionPrefix = this.getSessionPrefix(userId, sessionId);

      // Get list of files and total size
      const files = await this.getAllFiles(sourcePath);
      const totalBytes = await this.getLocalTotalSize(
        files.map((file) => path.join(sourcePath, file)),
      );

      // Upload all files with progress tracking
      let uploadedBytes = 0;
      this.progressTracker.startOperation({
        type: "upload",
        fileName: sessionId,
        totalBytes,
      });

      for (const file of files) {
        const filePath = path.join(sourcePath, file);
        const destination = `${sessionPrefix}/${file}`;

        await new Promise<void>((resolve, reject) => {
          const writeStream = this.bucket.file(destination).createWriteStream();
          const readStream = fs.createReadStream(filePath);

          readStream.on("data", (chunk: string | Buffer) => {
            uploadedBytes += Buffer.byteLength(chunk);
            this.progressTracker.updateProgress(uploadedBytes);
          });

          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
          readStream.on("error", reject);
          readStream.pipe(writeStream);
        });
      }

      this.progressTracker.completeOperation();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
            "gcs",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to Google Cloud Storage. Please check your network connection.",
            "gcs",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to upload session: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
    }
  }

  /**
   * Get all files in a directory recursively
   */
  private async getAllFiles(dir: string): Promise<string[]> {
    const files = await fs.readdir(dir, { withFileTypes: true });
    const paths: string[] = [];

    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath);
        paths.push(
          ...subFiles.map((f) => path.relative(dir, path.join(fullPath, f))),
        );
      } else {
        paths.push(path.relative(dir, fullPath));
      }
    }

    return paths;
  }

  /**
   * Get total size of local files
   */
  private async getLocalTotalSize(files: string[]): Promise<number> {
    let totalSize = 0;
    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        totalSize += stats.size;
      } catch (error) {
        console.warn(
          `Warning: Could not get size for file ${file}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
    return totalSize;
  }

  /**
   * Lists all available sessions for a user
   */
  async listSessions(userId: string): Promise<string[]> {
    try {
      const prefix = this.getUserPrefix(userId);
      const [files] = await this.bucket.getFiles({ prefix });
      const sessions = new Set<string>();

      for (const file of files) {
        const parts = file.name.split("/");
        if (parts.length >= 2) {
          sessions.add(parts[1]);
        }
      }

      return Array.from(sessions);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
            "gcs",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to Google Cloud Storage. Please check your network connection.",
            "gcs",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to list sessions: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
    }
  }

  /**
   * Deletes a session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    try {
      const prefix = this.getSessionPrefix(userId, sessionId);
      const [files] = await this.bucket.getFiles({ prefix });

      await Promise.all(files.map((file) => file.delete()));
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
            "gcs",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to Google Cloud Storage. Please check your network connection.",
            "gcs",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to delete session: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
    }
  }

  /**
   * Downloads a single file from storage
   */
  async downloadFile(cloudPath: string, localPath: string): Promise<boolean> {
    try {
      const file = this.bucket.file(cloudPath);
      const [exists] = await file.exists();

      if (!exists) {
        return false;
      }

      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await file.download({ destination: localPath });
      return true;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
            "gcs",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to Google Cloud Storage. Please check your network connection.",
            "gcs",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to download file: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
    }
  }

  /**
   * Uploads a single file to storage
   */
  async uploadFile(filePath: string, cloudPath: string): Promise<void> {
    try {
      await this.bucket.upload(filePath, { destination: cloudPath });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
            "gcs",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to Google Cloud Storage. Please check your network connection.",
            "gcs",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to upload file: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
    }
  }

  /**
   * Delete a single file from storage
   */
  async deleteFile(cloudPath: string): Promise<void> {
    try {
      const file = this.bucket.file(cloudPath);
      const [exists] = await file.exists();

      if (exists) {
        await file.delete();
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
            "gcs",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to Google Cloud Storage. Please check your network connection.",
            "gcs",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to delete file: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
    }
  }

  /**
   * Gets metadata for a session
   */
  async getMetadata(
    userId: string,
    sessionId: string,
  ): Promise<Map<string, FileMetadata>> {
    try {
      const prefix = this.getSessionPrefix(userId, sessionId);
      const [files] = await this.bucket.getFiles({ prefix });

      const metadata = new Map<string, FileMetadata>();
      for (const file of files) {
        const relativePath = file.name.slice(prefix.length + 1);
        const [metadata2] = await file.getMetadata();

        metadata.set(relativePath, {
          path: relativePath,
          hash: metadata2.md5Hash || "",
          size:
            typeof metadata2.size === "string"
              ? parseInt(metadata2.size, 10)
              : 0,
          modTime: metadata2.updated
            ? new Date(metadata2.updated).getTime()
            : Date.now(),
        });
      }

      return metadata;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
            "gcs",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to Google Cloud Storage. Please check your network connection.",
            "gcs",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to get metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
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
    try {
      const prefix = this.getSessionPrefix(userId, sessionId);
      const metadataFile = this.bucket.file(
        `${prefix}/.browserstate-metadata.json`,
      );
      await metadataFile.save(
        JSON.stringify(Object.fromEntries(metadata), null, 2),
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with Google Cloud Storage. Please check your credentials.",
            "gcs",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to Google Cloud Storage. Please check your network connection.",
            "gcs",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to save metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "gcs",
      );
    }
  }
}
