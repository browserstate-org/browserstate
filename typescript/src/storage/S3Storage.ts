import { StorageProvider } from "./StorageProvider";
import fs from "fs-extra";
import path from "path";
import os from "os";
import type {
  S3Client as S3ClientType,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  CreateBucketCommandInput,
  BucketLocationConstraint,
  S3ServiceException,
  _Object as S3Object,
} from "@aws-sdk/client-s3";
import type { Upload as UploadType } from "@aws-sdk/lib-storage";
import { Readable } from "stream";

export interface S3StorageOptions {
  accessKeyId?: string;
  secretAccessKey?: string;
  prefix?: string;
}

// Define types for dynamic imports
interface AWSSDK {
  S3Client: typeof S3ClientType;
  ListObjectsV2Command: typeof ListObjectsV2Command;
  GetObjectCommand: typeof GetObjectCommand;
  DeleteObjectsCommand: typeof DeleteObjectsCommand;
  HeadBucketCommand: typeof HeadBucketCommand;
  CreateBucketCommand: typeof CreateBucketCommand;
  S3ServiceException: typeof S3ServiceException;
}

interface UploadModule {
  Upload: typeof UploadType;
}

export class S3Storage implements StorageProvider {
  private bucketName: string;
  private s3Client: S3ClientType | null = null;
  private prefix?: string;
  private awsModulesLoaded = false;
  private awsSDK: AWSSDK | null = null;
  private uploadModule: UploadModule | null = null;
  private options?: S3StorageOptions;
  private region: string;
  private initPromise: Promise<void> | null = null;

  constructor(bucketName: string, region: string, options?: S3StorageOptions) {
    this.bucketName = bucketName;
    this.prefix = options?.prefix;
    this.options = options;
    this.region = region;

    // Start initialization immediately
    this.initPromise = this.initClient().catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[S3] Initialization failed, will retry on first usage:",
          error,
        );
      }
      throw error;
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initClient();
    }
    await this.initPromise;
  }

  private async initClient(): Promise<void> {
    if (this.awsModulesLoaded) return;

    try {
      // Dynamically import AWS SDK modules
      try {
        this.awsSDK = await import("@aws-sdk/client-s3");
        this.uploadModule = await import("@aws-sdk/lib-storage");
      } catch (error) {
        throw new Error(
          `Failed to load AWS SDK modules: ${error instanceof Error ? error.message : String(error)}. Please install @aws-sdk/client-s3 and @aws-sdk/lib-storage.`,
        );
      }

      if (!this.awsSDK || !this.uploadModule) {
        throw new Error(
          "AWS SDK modules not properly loaded. Please check your dependencies.",
        );
      }

      const clientConfig: Record<string, unknown> = { region: this.region };

      if (this.options?.accessKeyId && this.options?.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: this.options.accessKeyId,
          secretAccessKey: this.options.secretAccessKey,
        };
      }

      this.s3Client = new this.awsSDK.S3Client(clientConfig);
      this.awsModulesLoaded = true;
    } catch (error) {
      this.s3Client = null;
      this.awsSDK = null;
      this.uploadModule = null;
      throw error;
    }
  }

  /**
   * Ensures the bucket exists. If it does not, creates it.
   */
  private async ensureBucketExists(): Promise<void> {
    await this.ensureInitialized();
    if (!this.s3Client || !this.awsSDK) {
      throw new Error("S3 client not initialized");
    }

    try {
      await this.s3Client.send(
        new this.awsSDK.HeadBucketCommand({ Bucket: this.bucketName }),
      );
    } catch (error: unknown) {
      // Check if error is from AWS SDK and has metadata
      if (
        error instanceof this.awsSDK.S3ServiceException &&
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

        await this.s3Client.send(new this.awsSDK.CreateBucketCommand(params));
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
    await this.ensureInitialized();
    if (!this.s3Client || !this.awsSDK) {
      throw new Error("S3 client not initialized");
    }

    const prefix = this.getSessionPrefix(userId, sessionId);
    const targetPath = this.getTempPath(userId, sessionId);

    await this.ensureBucketExists();

    // Clear target directory if it exists
    await fs.emptyDir(targetPath);

    try {
      // List all objects with the session prefix
      const listCommand = new this.awsSDK.ListObjectsV2Command({
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
        const getCommand = new this.awsSDK.GetObjectCommand({
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
    await this.ensureInitialized();
    if (!this.s3Client || !this.awsSDK || !this.uploadModule) {
      throw new Error("S3 client not initialized");
    }

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
        const upload = new this.uploadModule.Upload({
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
    await this.ensureInitialized();
    if (!this.s3Client || !this.awsSDK) {
      throw new Error("S3 client not initialized");
    }

    const prefix = this.getUserPrefix(userId);

    await this.ensureBucketExists();

    try {
      // List all objects with the user prefix and delimiter to get "directories"
      const listCommand = new this.awsSDK.ListObjectsV2Command({
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
    await this.ensureInitialized();
    if (!this.s3Client || !this.awsSDK) {
      throw new Error("S3 client not initialized");
    }

    const prefix = this.getSessionPrefix(userId, sessionId);

    await this.ensureBucketExists();

    try {
      // List all objects with the session prefix
      const listCommand = new this.awsSDK.ListObjectsV2Command({
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
      const deleteCommand = new this.awsSDK.DeleteObjectsCommand({
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
}
