import { CloudStorageProvider } from "./CloudStorageProvider";
import { FileMetadata } from "../types";
import { Storage, Bucket } from "@google-cloud/storage";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { 
  StorageProviderError, 
  AuthenticationError, 
  ConnectionError,
  ErrorCodes 
} from '../errors';

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

  constructor(userId: string, options: GCSOptions) {
    this.prefix = options.prefix;
    try {
      this.storage = new Storage({
        projectId: options.projectID,
        keyFilename: options.keyFilename
      });
      this.bucket = this.storage.bucket(options.bucketName);
    } catch (error) {
      if (error instanceof Error && error.message.includes('credentials')) {
        throw new AuthenticationError(
          'Failed to authenticate with Google Cloud Storage. Please check your credentials.',
          'gcs'
        );
      }
      throw new StorageProviderError(
        `Failed to initialize GCS storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCodes.UNKNOWN_ERROR,
        'gcs'
      );
    }
  }

  // ... rest of the existing code ...
} 