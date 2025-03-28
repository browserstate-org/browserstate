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

  constructor(bucketName: string, region: string, options?: S3StorageOptions) {
    this.bucketName = bucketName;
    this.prefix = options?.prefix;

    // Initialize client on first use later
    this.initClient(region, options).catch((error) => {
      // Only log on construction, don't throw
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "S3 initialization failed, will retry on first usage:",
          error,
        );
      }
    });
  }

  /**
   * Dynamically imports AWS SDK modules
   */
  private async initClient(
    region: string,
    options?: S3StorageOptions,
  ): Promise<void> {
    if (this.awsModulesLoaded) return;

    try {
      // Dynamically import AWS SDK modules
      this.awsSDK = (await import("@aws-sdk/client-s3")) as AWSSDK;
      this.uploadModule = (await import(
        "@aws-sdk/lib-storage"
      )) as UploadModule;

      const clientConfig: Record<string, unknown> = { region };

      if (options?.accessKeyId && options?.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
        };
      }

      this.s3Client = new this.awsSDK.S3Client(clientConfig);
      this.awsModulesLoaded = true;
    } catch (error) {
      this.s3Client = null;
      this.awsSDK = null;
      this.uploadModule = null;

      if (process.env.NODE_ENV !== "production") {
        console.error("Failed to load AWS SDK modules:", error);
      }
      // We'll throw a specific error when methods are called
    }
  }

  /**
   * Ensures the bucket exists. If it does not, creates it.
   */
  private async ensureBucketExists(): Promise<void> {
    if (!this.awsModulesLoaded || !this.s3Client || !this.awsSDK) {
      await this.initClient(
        typeof this.s3Client?.config?.region === "function"
          ? await this.s3Client?.config?.region()
          : this.s3Client?.config?.region || "us-east-1",
        undefined,
      );

      // Check if initialization succeeded
      if (!this.awsModulesLoaded || !this.s3Client || !this.awsSDK) {
        throw new Error(
          "AWS SDK modules not available. Install @aws-sdk/client-s3 and @aws-sdk/lib-storage to use S3Storage.",
        );
      }
    }

    try {
      await this.s3Client!.send(
        new this.awsSDK!.HeadBucketCommand({ Bucket: this.bucketName }),
      );
    } catch (error: unknown) {
      // Check if error is from AWS SDK and has metadata
      if (
        error instanceof Error &&
        this.awsSDK!.S3ServiceException &&
        error instanceof this.awsSDK!.S3ServiceException &&
        error.$metadata?.httpStatusCode === 404
      ) {
        const region =
          typeof this.s3Client!.config.region === "function"
            ? await this.s3Client!.config.region()
            : this.s3Client!.config.region;

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

        await this.s3Client!.send(new this.awsSDK!.CreateBucketCommand(params));
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

    try {
      await this.ensureBucketExists();

      // Clear target directory if it exists
      await fs.emptyDir(targetPath);

      // List all objects with the session prefix
      const listCommand = new this.awsSDK!.ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const listResponse = await this.s3Client!.send(listCommand);

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
        const getCommand = new this.awsSDK!.GetObjectCommand({
          Bucket: this.bucketName,
          Key: object.Key,
        });

        const getResponse = await this.s3Client!.send(getCommand);

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
      await this.ensureBucketExists();

      // Read all files in the directory
      const files = await this.getAllFiles(filePath);

      // Upload each file
      for (const file of files) {
        const relativePath = path.relative(filePath, file);
        const key = `${prefix}/${relativePath}`;

        // Read file content
        const fileContent = await fs.readFile(file);

        // Upload the file
        const upload = new this.uploadModule!.Upload({
          client: this.s3Client!,
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
      await this.ensureBucketExists();

      // List all objects with the user prefix and delimiter to get "directories"
      const listCommand = new this.awsSDK!.ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${prefix}/`,
        Delimiter: "/",
      });

      const listResponse = await this.s3Client!.send(listCommand);

      // Extract session IDs from common prefixes
      const sessions = new Set<string>();

      // Add common prefixes (directories)
      if (listResponse.CommonPrefixes) {
        for (const commonPrefix of listResponse.CommonPrefixes) {
          if (commonPrefix.Prefix) {
            const prefixPath = commonPrefix.Prefix;
            // Extract the session ID from the prefix
            const parts = prefixPath.split("/");
            if (parts.length >= 2) {
              const sessionId = parts[parts.length - 2];
              sessions.add(sessionId);
            }
          }
        }
      }

      // Also check Contents in case there are no CommonPrefixes
      if (listResponse.Contents) {
        for (const object of listResponse.Contents) {
          if (object.Key) {
            // Remove the user prefix to get the relative path
            const relativePath = object.Key.slice(prefix.length + 1);
            // Get the first path segment which should be the session ID
            const sessionId = relativePath.split("/")[0];
            if (sessionId) {
              sessions.add(sessionId);
            }
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
   * Deletes a session from S3
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const prefix = this.getSessionPrefix(userId, sessionId);

    try {
      await this.ensureBucketExists();

      // First list all objects with the session prefix
      const listCommand = new this.awsSDK!.ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const listResponse = await this.s3Client!.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        // No objects to delete
        return;
      }

      // Prepare delete objects command (can delete up to 1000 objects at a time)
      const deleteObjects = (objects: S3Object[]) => {
        if (!objects.length) return Promise.resolve();

        const deleteCommand = new this.awsSDK!.DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key })),
            Quiet: true, // Don't return details about deleted objects
          },
        });

        return this.s3Client!.send(deleteCommand);
      };

      // Delete in batches of 1000 objects (S3 limit)
      const objectsToDelete = listResponse.Contents.filter(
        (obj): obj is S3Object => obj.Key !== undefined,
      );

      for (let i = 0; i < objectsToDelete.length; i += 1000) {
        const batch = objectsToDelete.slice(i, i + 1000);
        await deleteObjects(batch);
      }
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
