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
  ListBucketsCommand,
  GetBucketLocationCommand,
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
  ListBucketsCommand: typeof ListBucketsCommand;
  S3ServiceException: typeof S3ServiceException;
  GetBucketLocationCommand: typeof GetBucketLocationCommand;
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

  constructor(bucketName: string, region: string, options?: S3StorageOptions) {
    this.bucketName = bucketName;
    this.prefix = options?.prefix;
    this.options = options;

    // Initialize with dynamic import (but don't throw if it fails)
    this.initClient(region).catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[S3] Initialization failed, will retry on first usage:",
          error,
        );
      }
    });
  }

  private async initClient(region: string): Promise<void> {
    if (this.awsModulesLoaded) return;

    try {
      // Dynamically import AWS SDK modules
      try {
        this.awsSDK = (await import("@aws-sdk/client-s3")) as AWSSDK;
        this.uploadModule = (await import(
          "@aws-sdk/lib-storage"
        )) as UploadModule;
      } catch (error) {
        throw new Error(
          `Failed to load AWS SDK modules: ${error instanceof Error ? error.message : String(error)}. Please install @aws-sdk/client-s3 and @aws-sdk/lib-storage.`
        );
      }

      if (!this.awsSDK || !this.uploadModule) {
        throw new Error(
          "AWS SDK modules not properly loaded. Please check your dependencies."
        );
      }

      const clientConfig: Record<string, unknown> = { 
        region,
        endpoint: `https://s3.${region}.amazonaws.com`
      };

      if (this.options?.accessKeyId && this.options?.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: this.options.accessKeyId,
          secretAccessKey: this.options.secretAccessKey,
        };
      }

      // Create S3 client with options
      this.s3Client = new this.awsSDK.S3Client(clientConfig);
      
      // Verify credentials and detect correct region
      try {
        // First try to list buckets to verify credentials
        await this.s3Client.send(new this.awsSDK.ListBucketsCommand({}));
        
        // Then try to head the bucket to get its region
        try {
          await this.s3Client.send(new this.awsSDK.HeadBucketCommand({ Bucket: this.bucketName }));
        } catch (error) {
          if (error instanceof Error && this.awsSDK.S3ServiceException && error instanceof this.awsSDK.S3ServiceException) {
            if (error.$metadata?.httpStatusCode === 301) {
              // Try to get the bucket location
              const locationCommand = new this.awsSDK.GetBucketLocationCommand({ Bucket: this.bucketName });
              const locationResponse = await this.s3Client.send(locationCommand);
              if (locationResponse.LocationConstraint) {
                // Reinitialize client with correct region
                clientConfig.region = locationResponse.LocationConstraint;
                clientConfig.endpoint = `https://s3.${locationResponse.LocationConstraint}.amazonaws.com`;
                this.s3Client = new this.awsSDK.S3Client(clientConfig);
                console.log(`Detected correct region: ${locationResponse.LocationConstraint}`);
                
                // Retry the head bucket command with the correct region
                await this.s3Client.send(new this.awsSDK.HeadBucketCommand({ Bucket: this.bucketName }));
              }
            }
          }
          throw error;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("Could not load credentials")) {
          throw new Error(
            `Failed to load AWS credentials. Please check your credentials in config.json or environment variables.`
          );
        }
        throw error;
      }

      this.awsModulesLoaded = true;
    } catch (error) {
      this.s3Client = null;
      this.awsSDK = null;
      this.uploadModule = null;

      // Always throw the error in development
      if (process.env.NODE_ENV !== "production") {
        throw error;
      }
      
      // In production, we'll throw when methods are called
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
          : this.s3Client?.config?.region || "us-east-1"
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
      // Ensure client is initialized with credentials
      if (!this.awsModulesLoaded || !this.s3Client || !this.awsSDK) {
        await this.initClient(
          typeof this.s3Client?.config?.region === "function"
            ? await this.s3Client?.config?.region()
            : this.s3Client?.config?.region || "us-east-1"
        );

        // Check if initialization succeeded
        if (!this.awsModulesLoaded || !this.s3Client || !this.awsSDK) {
          throw new Error(
            "Failed to initialize AWS SDK. Please check your credentials."
          );
        }
      }

      await this.ensureBucketExists();

      // Clear target directory if it exists
      await fs.emptyDir(targetPath);

      // List all objects with the session prefix
      const listCommand = new this.awsSDK!.ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      try {
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

          // Ensure parent directory exists
          await fs.ensureDir(path.dirname(localFilePath));

          // Download the object
          const getCommand = new this.awsSDK!.GetObjectCommand({
            Bucket: this.bucketName,
            Key: object.Key,
          });

          try {
            const response = await this.s3Client!.send(getCommand);
            if (!response.Body) continue;

            // Convert the response body to a buffer and write to file
            const chunks: Buffer[] = [];
            for await (const chunk of response.Body as Readable) {
              chunks.push(Buffer.from(chunk));
            }
            await fs.writeFile(localFilePath, Buffer.concat(chunks));
          } catch (error) {
            if (error instanceof Error && this.awsSDK!.S3ServiceException && error instanceof this.awsSDK!.S3ServiceException) {
              if (error.$metadata?.httpStatusCode === 301) {
                // Try to get the bucket location
                const locationCommand = new this.awsSDK!.GetBucketLocationCommand({ Bucket: this.bucketName });
                const locationResponse = await this.s3Client!.send(locationCommand);
                if (locationResponse.LocationConstraint) {
                  // Reinitialize client with correct region
                  const clientConfig: Record<string, unknown> = { 
                    region: locationResponse.LocationConstraint,
                    credentials: this.s3Client!.config.credentials()
                  };
                  this.s3Client = new this.awsSDK!.S3Client(clientConfig);
                  console.log(`Detected correct region: ${locationResponse.LocationConstraint}`);
                  
                  // Retry the get command with the correct region
                  const response = await this.s3Client!.send(getCommand);
                  if (!response.Body) continue;

                  const chunks: Buffer[] = [];
                  for await (const chunk of response.Body as Readable) {
                    chunks.push(Buffer.from(chunk));
                  }
                  await fs.writeFile(localFilePath, Buffer.concat(chunks));
                  continue;
                }
              }
            }
            throw error;
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('AccessDenied')) {
            throw new Error(`Access denied to S3 bucket ${this.bucketName}. Please check your AWS credentials and permissions.`);
          } else if (error.message.includes('NoSuchBucket')) {
            throw new Error(`S3 bucket ${this.bucketName} does not exist. Please create it first.`);
          } else if (error.message.includes('InvalidAccessKeyId')) {
            throw new Error('Invalid AWS access key ID. Please check your credentials.');
          } else if (error.message.includes('SignatureDoesNotMatch')) {
            throw new Error('Invalid AWS secret access key. Please check your credentials.');
          }
        }
        // If we get any other error, just create a new directory
        console.log('Creating new session directory due to error:', error);
        await fs.ensureDir(targetPath);
      }

      return targetPath;
    } catch (error) {
      console.error('S3 download error details:', error);
      // Even if we get an error, create the directory and return it
      await fs.ensureDir(targetPath);
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
      // If modules aren't loaded, don't try to upload
      if (!this.awsModulesLoaded || !this.s3Client || !this.awsSDK || !this.uploadModule) {
        console.log("S3 modules not loaded, skipping upload");
        return;
      }

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
      // Don't throw the error, just log it
      // This allows the browser to close cleanly even if upload fails
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
