import { CloudStorageProvider } from "./CloudStorageProvider";
import { FileMetadata } from "../types";
import {
  S3Client,
  HeadBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { promisify } from "util";
import { pipeline } from "stream";
import {
  StorageProviderError,
  AuthenticationError,
  ConnectionError,
  ResourceNotFoundError,
  ErrorCodes,
} from "../errors";

const pipelineAsync = promisify(pipeline);

/**
 * Options for AWS S3 storage
 */
export interface S3Options {
  /**
   * AWS access key ID
   */
  accessKeyId?: string;

  /**
   * AWS secret access key
   */
  secretAccessKey?: string;

  /**
   * Optional prefix/folder path within the bucket
   */
  prefix?: string;
}

/**
 * AWS S3 storage provider implementation
 */
export class S3Storage implements CloudStorageProvider {
  private s3Client: S3Client;
  private bucketName: string;
  private prefix?: string;

  constructor(bucketName: string, region: string, options?: S3Options) {
    this.bucketName = bucketName;
    this.prefix = options?.prefix;

    const clientConfig: Record<string, unknown> = { region };

    if (options?.accessKeyId && options?.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      };
    }

    try {
      this.s3Client = new S3Client(clientConfig);
    } catch (error) {
      if (error instanceof Error && error.message.includes("credentials")) {
        throw new AuthenticationError(
          "Failed to authenticate with AWS S3. Please check your credentials.",
          "s3",
        );
      }
      throw new StorageProviderError(
        `Failed to initialize S3 storage: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
      );
    }
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.bucketName }),
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with AWS S3. Please check your credentials.",
            "s3",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to AWS S3. Please check your network connection.",
            "s3",
          );
        }
      }
      throw new ResourceNotFoundError(
        `S3 bucket "${this.bucketName}" does not exist or is not accessible`,
        "s3",
      );
    }
  }

  /**
   * Get the full S3 key prefix for a user
   */
  private getUserPrefix(userId: string): string {
    return this.prefix ? `${this.prefix}/${userId}` : userId;
  }

  /**
   * Get the full S3 key prefix for a session
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
      // Ensure bucket exists before attempting download
      await this.ensureBucketExists();

      // List all objects with the session prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        // Create an empty directory for new sessions
        await fs.ensureDir(targetPath);
        return targetPath;
      }

      // Download each object
      for (const object of listResponse.Contents) {
        // Skip if no key
        if (!object.Key) continue;

        // Calculate relative path within the session
        const relativePath = object.Key.slice(prefix.length + 1);
        if (!relativePath) continue; // Skip the directory itself

        // Create the local file path
        const localFilePath = path.join(targetPath, relativePath);

        // Ensure the directory exists
        await fs.ensureDir(path.dirname(localFilePath));

        // Get the object
        const getCommand = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: object.Key,
        });

        const getResponse = await this.s3Client.send(getCommand);

        if (!getResponse.Body) continue;

        // Convert body to buffer
        const responseBody = getResponse.Body as Readable;
        const chunks: Buffer[] = [];

        for await (const chunk of responseBody) {
          chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
        }

        // Write to file
        await fs.writeFile(localFilePath, Buffer.concat(chunks));
      }

      return targetPath;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      if (error instanceof ConnectionError) {
        throw error;
      }
      if (error instanceof ResourceNotFoundError) {
        throw error;
      }
      throw new StorageProviderError(
        `Failed to download session: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
      );
    }
  }

  /**
   * Uploads a browser session to S3
   */
  async upload(
    userId: string,
    sessionId: string,
    filePath: string,
  ): Promise<void> {
    const prefix = this.getSessionPrefix(userId, sessionId);

    try {
      // Read all files in the directory
      const files = await this.getAllFiles(filePath);

      // Upload each file
      for (const file of files) {
        const relativePath = path.relative(filePath, file);
        const key = `${prefix}/${relativePath}`;

        // Read file content
        const fileContent = await fs.readFile(file);

        // Upload the file
        const upload = new Upload({
          client: this.s3Client,
          params: {
            Bucket: this.bucketName,
            Key: key,
            Body: fileContent,
          },
        });

        await upload.done();
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      if (error instanceof ConnectionError) {
        throw error;
      }
      throw new StorageProviderError(
        `Failed to upload session: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
      );
    }
  }

  /**
   * Lists all available sessions for a user
   */
  async listSessions(userId: string): Promise<string[]> {
    const prefix = this.getUserPrefix(userId);

    try {
      // List all objects with the user prefix and delimiter to get "directories"
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${prefix}/`,
        Delimiter: "/",
      });

      const listResponse = await this.s3Client.send(listCommand);

      // Extract session IDs from common prefixes
      const sessions = new Set<string>();

      // Add common prefixes (directories)
      if (listResponse.CommonPrefixes) {
        for (const commonPrefix of listResponse.CommonPrefixes) {
          if (!commonPrefix.Prefix) continue;

          // Extract the session ID (last part of the path)
          const sessionId = commonPrefix.Prefix.slice(prefix.length + 1, -1); // Remove trailing slash
          sessions.add(sessionId);
        }
      }

      // Also check object paths in case there are no directories
      if (listResponse.Contents) {
        for (const object of listResponse.Contents) {
          if (!object.Key) continue;

          // Skip if it's not under the user prefix
          if (!object.Key.startsWith(`${prefix}/`)) continue;

          // Extract the next path component (session ID)
          const remaining = object.Key.slice(prefix.length + 1);
          const sessionId = remaining.split("/")[0];
          if (sessionId) {
            sessions.add(sessionId);
          }
        }
      }

      return Array.from(sessions);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      if (error instanceof ConnectionError) {
        throw error;
      }
      throw new StorageProviderError(
        `Failed to list sessions: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
      );
    }
  }

  /**
   * Deletes a session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const prefix = this.getSessionPrefix(userId, sessionId);

    try {
      // List all objects with the session prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return;
      }

      // Delete each object
      for (const object of listResponse.Contents) {
        if (!object.Key) continue;

        const deleteCommand = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: object.Key,
        });

        await this.s3Client.send(deleteCommand);
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      if (error instanceof ConnectionError) {
        throw error;
      }
      throw new StorageProviderError(
        `Failed to delete session: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
      );
    }
  }

  /**
   * Upload a single file to S3
   */
  async uploadFile(localPath: string, cloudPath: string): Promise<void> {
    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: cloudPath,
          Body: fs.createReadStream(localPath),
        },
      });

      await upload.done();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with AWS S3. Please check your credentials.",
            "s3",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to AWS S3. Please check your network connection.",
            "s3",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to upload file: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
      );
    }
  }

  /**
   * Download a single file from S3
   */
  async downloadFile(cloudPath: string, localPath: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: cloudPath,
      });

      try {
        await this.s3Client.send(command);
      } catch (error) {
        if (error instanceof Error && error.name === "NotFound") {
          return false;
        }
        throw error;
      }

      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: cloudPath,
      });

      const response = await this.s3Client.send(getCommand);
      if (!response.Body) {
        return false;
      }

      await fs.ensureDir(path.dirname(localPath));
      await pipelineAsync(
        response.Body as Readable,
        fs.createWriteStream(localPath),
      );
      return true;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with AWS S3. Please check your credentials.",
            "s3",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to AWS S3. Please check your network connection.",
            "s3",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to download file: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
      );
    }
  }

  /**
   * Delete a single file from S3
   */
  async deleteFile(cloudPath: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: cloudPath,
      });

      await this.s3Client.send(command);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with AWS S3. Please check your credentials.",
            "s3",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to AWS S3. Please check your network connection.",
            "s3",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to delete file: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
      );
    }
  }

  /**
   * Get metadata for all files in a session
   */
  async getMetadata(
    userId: string,
    sessionId: string,
  ): Promise<Map<string, FileMetadata>> {
    try {
      const prefix = this.getSessionPrefix(userId, sessionId);
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const response = await this.s3Client.send(command);
      if (!response.Contents) {
        return new Map();
      }

      const metadata = new Map<string, FileMetadata>();
      for (const item of response.Contents) {
        if (!item.Key) continue;

        const relativePath = item.Key.slice(prefix.length + 1);
        const headCommand = new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: item.Key,
        });

        const headResponse = await this.s3Client.send(headCommand);
        metadata.set(relativePath, {
          path: relativePath,
          hash: headResponse.ETag?.replace(/"/g, "") || "",
          size: headResponse.ContentLength || 0,
          modTime: headResponse.LastModified?.getTime() || Date.now(),
        });
      }

      return metadata;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with AWS S3. Please check your credentials.",
            "s3",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to AWS S3. Please check your network connection.",
            "s3",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to get metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
      );
    }
  }

  /**
   * Save metadata for a session
   */
  async saveMetadata(
    userId: string,
    sessionId: string,
    metadata: Map<string, FileMetadata>,
  ): Promise<void> {
    try {
      const prefix = this.getSessionPrefix(userId, sessionId);
      const metadataKey = `${prefix}/.browserstate-metadata.json`;
      const tempPath = path.join(
        os.tmpdir(),
        "browserstate",
        `${sessionId}-metadata.json`,
      );

      await fs.writeJSON(tempPath, Object.fromEntries(metadata), { spaces: 2 });
      await this.uploadFile(tempPath, metadataKey);
      await fs.remove(tempPath);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("credentials")) {
          throw new AuthenticationError(
            "Failed to authenticate with AWS S3. Please check your credentials.",
            "s3",
          );
        }
        if (error.message.includes("connect")) {
          throw new ConnectionError(
            "Failed to connect to AWS S3. Please check your network connection.",
            "s3",
          );
        }
      }
      throw new StorageProviderError(
        `Failed to save metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
        ErrorCodes.UNKNOWN_ERROR,
        "s3",
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
