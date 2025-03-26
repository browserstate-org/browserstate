import { StorageProvider } from "./StorageProvider";
import { FileMetadata } from "../types";

/**
 * Interface for cloud storage providers that support efficient sync
 */
export interface CloudStorageProvider extends StorageProvider {
  /**
   * Upload a single file to cloud storage
   * @param localPath - Local path to the file
   * @param cloudPath - Destination path in cloud storage
   */
  uploadFile(localPath: string, cloudPath: string): Promise<void>;

  /**
   * Download a single file from cloud storage
   * @param cloudPath - Path to file in cloud storage
   * @param localPath - Local path to save the file
   * @returns true if file exists and was downloaded, false if file doesn't exist
   */
  downloadFile(cloudPath: string, localPath: string): Promise<boolean>;

  /**
   * Delete a single file from cloud storage
   * @param cloudPath - Path to file in cloud storage
   */
  deleteFile(cloudPath: string): Promise<void>;

  /**
   * Get metadata for all files in a session
   * @param userId - User identifier
   * @param sessionId - Session identifier
   * @returns Map of file paths to their metadata
   */
  getMetadata(
    userId: string,
    sessionId: string,
  ): Promise<Map<string, FileMetadata>>;

  /**
   * Save metadata for a session
   * @param userId - User identifier
   * @param sessionId - Session identifier
   * @param metadata - File metadata to save
   */
  saveMetadata(
    userId: string,
    sessionId: string,
    metadata: Map<string, FileMetadata>,
  ): Promise<void>;
}
