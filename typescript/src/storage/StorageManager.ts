import { StorageProvider } from "./StorageProvider";
import { CacheProvider } from "./CacheProvider";
import { ProgressTracker } from "./ProgressTracker";
import { GCSStorage } from "./GCSStorage";
import { RedisCacheProvider } from "./RedisCacheProvider";

export interface StorageManagerOptions {
  maxCacheSize?: number;
  cacheStrategy?: "lru" | "fifo";
  backgroundSync?: boolean;
}

export interface StorageManagerConfig {
  storageProvider: StorageProvider;
  cacheProvider?: CacheProvider;
  options?: StorageManagerOptions;
}

export class StorageManager {
  private readonly storageProvider: StorageProvider;
  private readonly cacheProvider?: CacheProvider;
  private readonly options: StorageManagerOptions;
  private readonly progressTracker: ProgressTracker;

  constructor(config: StorageManagerConfig) {
    this.storageProvider = config.storageProvider;
    this.cacheProvider = config.cacheProvider;
    this.options = {
      maxCacheSize: 1000,
      cacheStrategy: "lru",
      backgroundSync: true,
      ...config.options,
    };
    this.progressTracker = new ProgressTracker();
  }

  static fromOptions(options: {
    gcsOptions: {
      bucketName: string;
      projectID: string;
      keyFilename: string;
    };
    redisOptions: {
      host: string;
      port: number;
      password?: string;
      db?: number;
    };
    maxCacheSize?: number;
    cacheStrategy?: "lru" | "fifo";
    backgroundSync?: boolean;
  }): StorageManager {
    const storageProvider = new GCSStorage(options.gcsOptions.bucketName, {
      projectID: options.gcsOptions.projectID,
      keyFilePath: options.gcsOptions.keyFilename,
    });
    const cacheProvider = new RedisCacheProvider(
      storageProvider,
      options.redisOptions,
    );
    return new StorageManager({
      storageProvider,
      cacheProvider,
      options: {
        maxCacheSize: options.maxCacheSize,
        cacheStrategy: options.cacheStrategy,
        backgroundSync: options.backgroundSync,
      },
    });
  }

  async download(userId: string, sessionId: string): Promise<string> {
    if (this.cacheProvider) {
      const cachedData = await this.cacheProvider.download(sessionId);
      if (cachedData) {
        return cachedData;
      }
    }

    const data = await this.storageProvider.download(userId, sessionId);
    if (this.cacheProvider) {
      await this.syncToCache(sessionId, data);
    }
    return data;
  }

  async upload(userId: string, sessionId: string, data: string): Promise<void> {
    await this.storageProvider.upload(userId, sessionId, data);
    if (this.cacheProvider) {
      await this.syncToCache(sessionId, data);
    }
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.storageProvider.deleteSession(userId, sessionId);
    if (this.cacheProvider) {
      await this.cacheProvider.deleteSession(sessionId);
    }
  }

  async listSessions(userId: string): Promise<string[]> {
    return this.storageProvider.listSessions(userId);
  }

  private async syncToCache(sessionId: string, data: string): Promise<void> {
    if (!this.cacheProvider) return;

    try {
      await this.cacheProvider.upload(sessionId, data);
    } catch (error) {
      console.error(`Cache sync failed for session ${sessionId}:`, error);
      throw error;
    }
  }

  // Progress tracking methods
  onProgress(callback: (progress: number) => void): void {
    this.progressTracker.onProgress(callback);
  }

  offProgress(callback: (progress: number) => void): void {
    this.progressTracker.offProgress(callback);
  }
}
