import { StorageProvider } from "./StorageProvider";
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
export class S3Storage implements StorageProvider {
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

    this.s3Client = new S3Client(clientConfig);
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.bucketName }),
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `S3 bucket "${this.bucketName}" does not exist or is not accessible: ${errorMessage}`,
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
    } catch (error: unknown) {
      // Ensure directory exists even if download fails
      await fs.ensureDir(targetPath);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error downloading from S3:", errorMessage);
      return targetPath;
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error uploading to S3:", errorMessage);
      throw new Error(`Failed to upload session to S3: ${errorMessage}`);
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error listing sessions from S3:", errorMessage);
      return [];
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
        console.log(`No files found for session ${sessionId}`);
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error deleting session from S3:", errorMessage);
      throw new Error(`Failed to delete session from S3: ${errorMessage}`);
    }
  }

  /**
   * Downloads a single file from storage
   */
  async downloadFile(s3Key: string, localPath: string): Promise<boolean> {
    try {
      console.log(
        `[S3] Downloading single file from S3: ${s3Key} -> ${localPath}`,
      );

      // Ensure the directory exists
      await fs.ensureDir(path.dirname(localPath));

      // Check if the file exists in S3
      try {
        await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: s3Key,
          }),
        );
      } catch {
        // File does not exist
        console.log(`[S3] File does not exist in S3: ${s3Key}`);
        return false;
      }

      // Download the file
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(getCommand);
      const Body = response.Body;

      if (!Body) {
        console.log(`[S3] Empty file or download failed: ${s3Key}`);
        return false;
      }

      // Write the file locally
      if (Body instanceof Readable) {
        const writeStream = fs.createWriteStream(localPath);
        await pipelineAsync(Body, writeStream);
      } else if (Body instanceof Buffer || typeof Body === "string") {
        await fs.writeFile(localPath, Body);
      } else {
        throw new Error(`Unexpected response type for S3 object Body`);
      }

      console.log(`[S3] Successfully downloaded file from ${s3Key}`);
      return true;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[S3] Error downloading file from S3: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Uploads a single file to storage
   */
  async uploadFile(filePath: string, s3Key: string): Promise<void> {
    try {
      console.log(`[S3] Uploading single file to S3: ${filePath} -> ${s3Key}`);

      // Read file content
      const fileContent = await fs.readFile(filePath);

      // Upload the file
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: s3Key,
          Body: fileContent,
        },
      });

      await upload.done();
      console.log(`[S3] Successfully uploaded file to ${s3Key}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[S3] Error uploading file to S3: ${errorMessage}`);
      throw new Error(`Failed to upload file to S3: ${errorMessage}`);
    }
  }

  /**
   * Gets metadata for a session
   */
  async getMetadata(
    userId: string,
    sessionId: string,
  ): Promise<Map<string, FileMetadata>> {
    const metadataKey = `${this.getSessionPrefix(userId, sessionId)}/.browserstate-metadata.json`;
    const tempMetadataPath = path.join(
      os.tmpdir(),
      "browserstate",
      `${sessionId}-metadata.json`,
    );

    try {
      // Check if metadata file exists
      try {
        await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: metadataKey,
          }),
        );
      } catch {
        // Metadata file does not exist
        return new Map();
      }

      // Download metadata file
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: metadataKey,
      });

      const response = await this.s3Client.send(getCommand);
      const Body = response.Body;

      if (!Body) {
        return new Map();
      }

      // Write metadata to temp file
      if (Body instanceof Readable) {
        const writeStream = fs.createWriteStream(tempMetadataPath);
        await pipelineAsync(Body, writeStream);
      } else if (Body instanceof Buffer || typeof Body === "string") {
        await fs.writeFile(tempMetadataPath, Body);
      } else {
        throw new Error(`Unexpected response type for S3 object Body`);
      }

      // Read and parse metadata
      const metadataContent = await fs.readFile(tempMetadataPath, "utf8");
      const metadataObj = JSON.parse(metadataContent);

      // Clean up temp file
      await fs.remove(tempMetadataPath);

      return new Map(Object.entries(metadataObj));
    } catch (error) {
      console.error(`[S3] Error loading metadata from S3:`, error);
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
    const metadataKey = `${this.getSessionPrefix(userId, sessionId)}/.browserstate-metadata.json`;
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

      // Upload to S3
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: metadataKey,
          Body: metadataContent,
        },
      });

      await upload.done();

      // Clean up temp file
      await fs.remove(tempMetadataPath);
    } catch (error) {
      console.error(`[S3] Error saving metadata to S3:`, error);
      throw new Error(`Failed to save metadata to S3: ${error}`);
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
