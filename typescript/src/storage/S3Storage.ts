import { StorageProvider } from "./StorageProvider";
import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  CreateBucketCommandInput,
  BucketLocationConstraint,
  S3ServiceException,
  _Object as S3Object,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";
import util from "util";
import stream from "stream";

export interface S3StorageOptions {
  accessKeyId?: string;
  secretAccessKey?: string;
  prefix?: string;
}

export class S3Storage implements StorageProvider {
  private bucketName: string;
  private s3Client: S3Client;
  private prefix?: string;

  constructor(bucketName: string, region: string, options?: S3StorageOptions) {
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

  /**
   * Ensures the bucket exists. If it does not, creates it.
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.bucketName }),
      );
    } catch (error: unknown) {
      // Check if error is from AWS SDK and has metadata
      if (
        error instanceof S3ServiceException &&
        error.$metadata?.httpStatusCode === 404
      ) {
        const region =
          typeof this.s3Client.config.region === "function"
            ? await this.s3Client.config.region()
            : this.s3Client.config.region;

        const params: CreateBucketCommandInput = {
          Bucket: this.bucketName,
        };

        // us-east-1 is the default region and doesn't accept a LocationConstraint
        // For all other regions, we must explicitly specify the LocationConstraint
        if (region !== "us-east-1") {
          params.CreateBucketConfiguration = {
            LocationConstraint: region as BucketLocationConstraint,
          };
        }

        await this.s3Client.send(new CreateBucketCommand(params));
      } else {
        throw error;
      }
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
   * Get a temporary path for a session
   */
  private getTempPath(userId: string, sessionId: string): string {
    const tempDir = path.resolve(os.tmpdir(), "browserstate", userId);
    fs.ensureDirSync(tempDir);
    return path.resolve(tempDir, sessionId);
  }

  /**
   * Downloads a browser session to a local directory
   */
  async download(userId: string, sessionId: string): Promise<string> {
    const prefix = this.getSessionPrefix(userId, sessionId);
    const targetPath = this.getTempPath(userId, sessionId);

    await this.ensureBucketExists();

    // Clear target directory if it exists
    await fs.emptyDir(targetPath);

    try {
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

    await this.ensureBucketExists();

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

    await this.ensureBucketExists();

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

    await this.ensureBucketExists();

    try {
      // List all objects with the session prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return; // Nothing to delete
      }

      // Create array of objects to delete
      const objectsToDelete = listResponse.Contents.filter(
        (object: S3Object) => object.Key,
      ) // Filter out objects without keys
        .map((object: S3Object) => ({ Key: object.Key! }));

      if (objectsToDelete.length === 0) {
        return; // Nothing to delete
      }

      // Delete objects
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: this.bucketName,
        Delete: {
          Objects: objectsToDelete,
        },
      });

      await this.s3Client.send(deleteCommand);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error deleting session from S3:", errorMessage);
      throw new Error(`Failed to delete session from S3: ${errorMessage}`);
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

  /**
   * Uploads a single file to S3
   * @param filePath - Path to the local file
   * @param s3Key - S3 key (path) where the file will be stored
   * @returns Promise resolving when upload is complete
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
   * Downloads a single file from S3
   * @param s3Key - S3 key (path) of the file to download
   * @param localPath - Local path where to save the file
   * @returns Promise resolving to boolean indicating if file was downloaded
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
        const pipeline = util.promisify(stream.pipeline);
        await pipeline(Body as Readable, writeStream);
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
}
