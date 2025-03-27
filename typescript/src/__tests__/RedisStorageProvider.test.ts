/// <reference types="jest" />

import {
  RedisStorageProvider,
  RedisStorageOptions,
} from "../storage/RedisStorageProvider";
import { Redis, ChainableCommander } from "ioredis";
import fs from "fs-extra";
import path from "path";
import os from "os";

// Mock Redis
jest.mock("ioredis", () => {
  const Redis = jest.fn().mockImplementation(() => ({
    pipeline: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    exec: jest.fn(),
  }));

  return { Redis };
});

describe("RedisStorageProvider", () => {
  let provider: RedisStorageProvider;
  let mockRedis: jest.Mocked<Redis>;
  let mockPipeline: jest.Mocked<ChainableCommander>;
  let tempDir: string;

  const mockOptions: RedisStorageOptions = {
    host: "localhost",
    port: 6379,
    keyPrefix: "test:",
    tempDir: os.tmpdir(),
    maxFileSize: 1024 * 1024,
    compression: false,
    ttl: 3600,
  };

  beforeEach(() => {
    // Create mock Redis instance
    mockRedis = {
      pipeline: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      exec: jest.fn(),
    } as unknown as jest.Mocked<Redis>;

    // Create mock pipeline
    mockPipeline = {
      set: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn(),
      length: 0,
    } as unknown as jest.Mocked<ChainableCommander>;

    // Setup pipeline mock
    mockRedis.pipeline.mockReturnValue(mockPipeline);

    // Create provider instance
    provider = new RedisStorageProvider(mockOptions);

    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "redis-storage-test-"));
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.remove(tempDir);
  });

  describe("download", () => {
    it("should download session data from Redis and create files", async () => {
      const mockSessionData = JSON.stringify({
        "file1.txt": "content1",
        "dir/file2.txt": "content2",
      });

      mockRedis.get.mockResolvedValue(mockSessionData);
      (fs.ensureDir as unknown as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as unknown as jest.Mock).mockResolvedValue(undefined);

      const result = await provider.download("test-user", "test-session");

      expect(result).toBe(
        path.join(os.tmpdir(), `browserstate-test-user-test-session`),
      );
      expect(fs.ensureDir).toHaveBeenCalledWith(
        path.join(os.tmpdir(), `browserstate-test-user-test-session`),
      );
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
    });

    it("should throw error if session not found", async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        provider.download("test-user", "test-session"),
      ).rejects.toThrow(`Session test-session not found`);
    });
  });

  describe("upload", () => {
    it("should upload session data to Redis with proper pipeline operations", async () => {
      const userId = "test-user";
      const sessionId = "test-session";
      const testFile = path.join(tempDir, "test.txt");
      await fs.writeFile(testFile, "test content");

      // Mock pipeline exec to resolve successfully
      mockPipeline.exec.mockResolvedValue([
        [null, "OK"],
        [null, "OK"],
        [null, 1],
        [null, 1],
      ]);

      await provider.upload(userId, sessionId, tempDir);

      // Verify pipeline operations
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.set).toHaveBeenCalledTimes(2);
      expect(mockPipeline.expire).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it("should handle empty directory", async () => {
      const userId = "test-user";
      const sessionId = "test-session";

      // Mock pipeline exec to resolve successfully
      mockPipeline.exec.mockResolvedValue([
        [null, "OK"],
        [null, "OK"],
        [null, 1],
        [null, 1],
      ]);

      await provider.upload(userId, sessionId, tempDir);

      // Verify pipeline operations
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.set).toHaveBeenCalledTimes(2);
      expect(mockPipeline.expire).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it("should skip files larger than maxFileSize", async () => {
      const userId = "test-user";
      const sessionId = "test-session";
      const largeFile = path.join(tempDir, "large.txt");
      await fs.writeFile(largeFile, "x".repeat(2 * 1024 * 1024)); // 2MB file

      // Mock pipeline exec to resolve successfully
      mockPipeline.exec.mockResolvedValue([
        [null, "OK"],
        [null, "OK"],
        [null, 1],
        [null, 1],
      ]);

      await provider.upload(userId, sessionId, tempDir);

      // Verify pipeline operations
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.set).toHaveBeenCalledTimes(2);
      expect(mockPipeline.expire).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it("should throw error if directory path is not provided", async () => {
      await expect(
        provider.upload("test-user", "test-session", ""),
      ).rejects.toThrow("Directory path is required");
    });
  });

  describe("listSessions", () => {
    it("should list sessions for a user", async () => {
      const userId = "test-user";
      const mockKeys = [
        "test:test-user:session1",
        "test:test-user:session2",
        "test:test-user:session1:metadata",
        "test:test-user:session2:metadata",
      ];

      mockRedis.keys.mockResolvedValue(mockKeys);

      const sessions = await provider.listSessions(userId);

      expect(sessions).toEqual(["session1", "session2"]);
      expect(mockRedis.keys).toHaveBeenCalledWith("test:test-user:*");
    });
  });

  describe("deleteSession", () => {
    it("should delete session and metadata", async () => {
      const userId = "test-user";
      const sessionId = "test-session";

      mockRedis.del.mockResolvedValue(2);

      await provider.deleteSession(userId, sessionId);

      expect(mockRedis.del).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledWith("test:test-user:test-session");
      expect(mockRedis.del).toHaveBeenCalledWith(
        "test:test-user:test-session:metadata",
      );
    });
  });
});
