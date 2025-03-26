import { CloudStorageProvider } from "../storage/CloudStorageProvider";
import { FileMetadata } from "../types";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";

export interface SyncOptions {
  storeMetadataOnProvider: boolean;
  metadataUpdateInterval: number;
}

export class SyncManager {
  private storageProvider: CloudStorageProvider;
  private userId: string;
  private sessionId: string;
  private options: SyncOptions;
  private lastMetadataUpdate: number = 0;
  private metadata: Map<string, FileMetadata> = new Map();

  constructor(
    storageProvider: CloudStorageProvider,
    userId: string,
    sessionId: string,
    options: SyncOptions,
  ) {
    this.storageProvider = storageProvider;
    this.userId = userId;
    this.sessionId = sessionId;
    this.options = options;
  }

  /**
   * Calculate MD5 hash of a file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash("md5");
    hashSum.update(fileBuffer);
    return hashSum.digest("hex");
  }

  /**
   * Get metadata for a file
   */
  private async getFileMetadata(filePath: string): Promise<FileMetadata> {
    const stats = await fs.stat(filePath);
    const hash = await this.calculateFileHash(filePath);
    return {
      path: filePath,
      hash,
      size: stats.size,
      modTime: stats.mtime.getTime(),
    };
  }

  /**
   * Check if metadata needs to be updated
   */
  private shouldUpdateMetadata(): boolean {
    return (
      this.options.storeMetadataOnProvider &&
      Date.now() - this.lastMetadataUpdate >=
        this.options.metadataUpdateInterval * 1000
    );
  }

  /**
   * Update metadata for all files in a directory
   */
  private async updateMetadata(dirPath: string): Promise<void> {
    if (!this.shouldUpdateMetadata()) {
      return;
    }

    const files = await fs.readdir(dirPath, { recursive: true });
    this.metadata.clear();

    for (const file of files) {
      const filePath = path.join(dirPath, file.toString());
      if ((await fs.stat(filePath)).isFile()) {
        this.metadata.set(
          file.toString(),
          await this.getFileMetadata(filePath),
        );
      }
    }

    if (this.options.storeMetadataOnProvider) {
      await this.storageProvider.saveMetadata(
        this.userId,
        this.sessionId,
        this.metadata,
      );
      this.lastMetadataUpdate = Date.now();
    }
  }

  /**
   * Sync files from local to cloud storage
   */
  async syncToCloud(dirPath: string): Promise<void> {
    await this.updateMetadata(dirPath);
    const files = await fs.readdir(dirPath, { recursive: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.toString());
      if ((await fs.stat(filePath)).isFile()) {
        const metadata = this.metadata.get(file.toString());
        if (metadata) {
          await this.storageProvider.uploadFile(
            filePath,
            `${this.sessionId}/${file.toString()}`,
          );
        }
      }
    }
  }

  /**
   * Sync files from cloud to local storage
   */
  async syncFromCloud(dirPath: string): Promise<void> {
    const cloudMetadata = await this.storageProvider.getMetadata(
      this.userId,
      this.sessionId,
    );
    const localFiles = await fs.readdir(dirPath, { recursive: true });

    // Download new or modified files
    for (const [file, metadata] of cloudMetadata) {
      const filePath = path.join(dirPath, file);
      const localMetadata = this.metadata.get(file);

      if (!localMetadata || localMetadata.hash !== metadata.hash) {
        await this.storageProvider.downloadFile(
          `${this.sessionId}/${file}`,
          filePath,
        );
      }
    }

    // Delete files that don't exist in cloud
    for (const file of localFiles) {
      if (!cloudMetadata.has(file.toString())) {
        await fs.remove(path.join(dirPath, file.toString()));
      }
    }

    this.metadata = cloudMetadata;
  }
}
