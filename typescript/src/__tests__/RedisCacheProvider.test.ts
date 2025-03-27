/// <reference types="jest" />

import { RedisCacheProvider } from "../storage/RedisCacheProvider";
import { StorageProvider } from "../storage/StorageProvider";
import { Redis } from "ioredis";
import fs from "fs-extra";

// Mock Redis
jest.mock("ioredis", () => {
  const Redis = jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    pipeline: jest.fn().mockReturnThis(),
    exec: jest.fn(),
    config: jest.fn(),
    zadd: jest.fn(),
    zrange: jest.fn(),
    zrem: jest.fn(),
    dbsize: jest.fn(),
  }));

  return { Redis };
});

// Mock fs-extra
jest.mock("fs-extra", () => ({
  ensureDir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  pathExists: jest.fn(),
}));

describe("RedisCacheProvider", () => {
  let provider: RedisCacheProvider;
  let mockStorage: jest.Mocked<StorageProvider>;
  let mockRedis: jest.Mocked<Redis>;
  const testSessionId = "test-session";
  const testData = "test-data";

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock storage provider
    mockStorage = {
      download: jest.fn(),
      upload: jest.fn(),
      deleteSession: jest.fn(),
      listSessions: jest.fn(),
    } as unknown as jest.Mocked<StorageProvider>;

    // Create provider instance
    provider = new RedisCacheProvider(mockStorage, {
      host: "localhost",
      port: 6379,
    });

    // Get Redis instance using type assertion
    mockRedis = (provider as unknown as { redis: jest.Mocked<Redis> }).redis;
  });

  describe("download", () => {
    it("should return cached data if available", async () => {
      mockRedis.get.mockResolvedValueOnce(testData);
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({ timestamp: Date.now() }),
      );

      const result = await provider.download(testSessionId);
      expect(result).toBe(testData);
    });

    it("should return null if cache miss", async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await provider.download(testSessionId);
      expect(result).toBeNull();
    });

    it("should return null if validation fails", async () => {
      mockRedis.get.mockResolvedValueOnce(testData);
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({ timestamp: Date.now() }),
      );
      (fs.pathExists as jest.Mock).mockResolvedValueOnce(false);

      const result = await provider.download(testSessionId);
      expect(result).toBeNull();
    });
  });

  describe("upload", () => {
    it("should store data in cache", async () => {
      await provider.upload(testSessionId, testData);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining("session:"),
        testData,
        "EX",
        expect.any(Number),
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining("metadata:"),
        expect.any(String),
        "EX",
        expect.any(Number),
      );
    });

    it("should update access time for LRU", async () => {
      await provider.upload(testSessionId, testData);

      expect(mockRedis.zadd).toHaveBeenCalledWith(
        expect.stringContaining("access"),
        expect.any(Number),
        testSessionId,
      );
    });

    it("should evict oldest session if cache is full", async () => {
      mockRedis.dbsize.mockResolvedValueOnce(101); // Over maxSize
      mockRedis.zrange.mockResolvedValueOnce(["oldest-session"]);

      await provider.upload(testSessionId, testData);

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining("oldest-session"),
      );
    });
  });

  describe("listSessions", () => {
    it("should return list of cached sessions", async () => {
      const mockKeys = ["session:1", "session:2"];
      mockRedis.keys.mockResolvedValueOnce(mockKeys);

      const result = await provider.listSessions();
      expect(result).toEqual(["1", "2"]);
    });
  });

  describe("deleteSession", () => {
    it("should remove session from cache", async () => {
      await provider.deleteSession(testSessionId);

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining("session:"),
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining("metadata:"),
      );
      expect(mockRedis.zrem).toHaveBeenCalledWith(
        expect.stringContaining("access"),
        testSessionId,
      );
    });
  });

  describe("cache eviction", () => {
    it("should evict oldest session on LRU", async () => {
      mockRedis.zrange.mockResolvedValueOnce(["oldest-session"]);
      await (
        provider as unknown as { evictOldestSession: () => Promise<void> }
      ).evictOldestSession();

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining("oldest-session"),
      );
    });

    it("should evict first session on FIFO", async () => {
      mockRedis.keys.mockResolvedValueOnce(["session:first"]);
      await (
        provider as unknown as { evictOldestSession: () => Promise<void> }
      ).evictOldestSession();

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining("first"),
      );
    });
  });
});
