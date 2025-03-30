import { BrowserState, BrowserStateOptions } from '../../src/BrowserState';
import { StorageProvider } from '../../src/storage/StorageProvider';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Mock the storage provider
class MockStorageProvider implements StorageProvider {
  public downloadCalledWith: { userId: string; sessionId: string }[] = [];
  public uploadCalledWith: { userId: string; sessionId: string; filePath: string }[] = [];
  public listSessionsCalledWith: { userId: string }[] = [];
  public deleteSessionCalledWith: { userId: string; sessionId: string }[] = [];
  public mockSessions: string[] = ['session1', 'session2'];
  public downloadPath: string = path.join(os.tmpdir(), 'mockdownload');

  async download(userId: string, sessionId: string): Promise<string> {
    this.downloadCalledWith.push({ userId, sessionId });
    await fs.ensureDir(this.downloadPath);
    return this.downloadPath;
  }

  async upload(userId: string, sessionId: string, filePath: string): Promise<void> {
    this.uploadCalledWith.push({ userId, sessionId, filePath });
  }

  async listSessions(userId: string): Promise<string[]> {
    this.listSessionsCalledWith.push({ userId });
    return this.mockSessions;
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    this.deleteSessionCalledWith.push({ userId, sessionId });
  }
}

// Mock fs-extra and path modules
jest.mock('fs-extra', () => ({
  ensureDirSync: jest.fn(),
  ensureDir: jest.fn().mockResolvedValue(undefined),
  existsSync: jest.fn().mockReturnValue(true),
  remove: jest.fn().mockResolvedValue(undefined),
  copy: jest.fn().mockResolvedValue(undefined),
}));

// Create a custom BrowserState class that exposes the storage provider for testing
class TestBrowserState extends BrowserState {
  getStorageProvider(): StorageProvider {
    return (this as unknown as { storageProvider: StorageProvider }).storageProvider;
  }

  getUserId(): string {
    return (this as unknown as { userId: string }).userId;
  }

  getTempDir(): string {
    return (this as unknown as { tempDir: string }).tempDir;
  }
}

describe('BrowserState', () => {
  let mockStorageProvider: MockStorageProvider;
  
  beforeEach(() => {
    mockStorageProvider = new MockStorageProvider();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      new BrowserState(); // Creating instance without storing reference
      expect(fs.ensureDirSync).toHaveBeenCalled();
    });

    it('should use provided userId', () => {
      const options: BrowserStateOptions = {
        userId: 'testUser'
      };
      const browserState = new TestBrowserState(options);
      expect(browserState.getUserId()).toBe('testUser');
    });

    it('should throw error if S3 options are missing when storage type is s3', () => {
      const options: BrowserStateOptions = {
        storageType: 's3'
      };
      expect(() => new BrowserState(options)).toThrow('S3 options required');
    });

    it('should throw error if GCS options are missing when storage type is gcs', () => {
      const options: BrowserStateOptions = {
        storageType: 'gcs'
      };
      expect(() => new BrowserState(options)).toThrow('GCS options required');
    });

    it('should throw error if Redis options are missing when storage type is redis', () => {
      const options: BrowserStateOptions = {
        storageType: 'redis'
      };
      expect(() => new BrowserState(options)).toThrow('Redis options required');
    });
  });

  describe('mount', () => {
    it('should download session and return session path', async () => {
      // Replace the storage provider with our mock
      const browserState = new TestBrowserState();
      (browserState as unknown as { storageProvider: MockStorageProvider }).storageProvider = mockStorageProvider;

      const sessionPath = await browserState.mount('session1');
      
      expect(mockStorageProvider.downloadCalledWith).toHaveLength(1);
      expect(mockStorageProvider.downloadCalledWith[0]).toEqual({
        userId: 'default',
        sessionId: 'session1'
      });
      expect(sessionPath).toBe(mockStorageProvider.downloadPath);
      expect(browserState.getCurrentSession()).toBe('session1');
      expect(browserState.getCurrentSessionPath()).toBe(mockStorageProvider.downloadPath);
    });

    it('should unmount current session before mounting a new one', async () => {
      const browserState = new TestBrowserState();
      (browserState as unknown as { storageProvider: MockStorageProvider }).storageProvider = mockStorageProvider;
      
      // First mount
      await browserState.mount('session1');
      
      // Spy on unmount method
      const unmountSpy = jest.spyOn(browserState, 'unmount');
      
      // Mount another session
      await browserState.mount('session2');
      
      expect(unmountSpy).toHaveBeenCalledTimes(1);
      expect(browserState.getCurrentSession()).toBe('session2');
    });
  });

  describe('unmount', () => {
    it('should upload session and clear current session', async () => {
      const browserState = new TestBrowserState();
      (browserState as unknown as { storageProvider: MockStorageProvider }).storageProvider = mockStorageProvider;
      
      // First mount a session
      await browserState.mount('session1');
      
      // Then unmount it
      await browserState.unmount();
      
      expect(mockStorageProvider.uploadCalledWith).toHaveLength(1);
      expect(mockStorageProvider.uploadCalledWith[0].userId).toBe('default');
      expect(mockStorageProvider.uploadCalledWith[0].sessionId).toBe('session1');
      expect(browserState.getCurrentSession()).toBeUndefined();
      expect(browserState.getCurrentSessionPath()).toBeUndefined();
    });

    it('should throw error if no session is mounted', async () => {
      const browserState = new TestBrowserState();
      (browserState as unknown as { storageProvider: MockStorageProvider }).storageProvider = mockStorageProvider;
      
      await expect(browserState.unmount()).rejects.toThrow('No session is currently mounted');
      
      expect(mockStorageProvider.uploadCalledWith).toHaveLength(0);
    });
  });

  describe('listSessions', () => {
    it('should return list of sessions from storage provider', async () => {
      const browserState = new TestBrowserState();
      (browserState as unknown as { storageProvider: MockStorageProvider }).storageProvider = mockStorageProvider;
      
      const sessions = await browserState.listSessions();
      
      expect(mockStorageProvider.listSessionsCalledWith).toHaveLength(1);
      expect(mockStorageProvider.listSessionsCalledWith[0].userId).toBe('default');
      expect(sessions).toEqual(mockStorageProvider.mockSessions);
    });
  });

  describe('hasSession', () => {
    it('should return true if session exists', async () => {
      const browserState = new TestBrowserState();
      (browserState as unknown as { storageProvider: MockStorageProvider }).storageProvider = mockStorageProvider;
      
      const hasSession = await browserState.hasSession('session1');
      
      expect(mockStorageProvider.listSessionsCalledWith).toHaveLength(1);
      expect(hasSession).toBe(true);
    });

    it('should return false if session does not exist', async () => {
      const browserState = new TestBrowserState();
      (browserState as unknown as { storageProvider: MockStorageProvider }).storageProvider = mockStorageProvider;
      
      const hasSession = await browserState.hasSession('nonexistent');
      
      expect(mockStorageProvider.listSessionsCalledWith).toHaveLength(1);
      expect(hasSession).toBe(false);
    });
  });

  describe('deleteSession', () => {
    it('should delete session from storage provider', async () => {
      const browserState = new TestBrowserState();
      (browserState as unknown as { storageProvider: MockStorageProvider }).storageProvider = mockStorageProvider;
      
      await browserState.deleteSession('session1');
      
      expect(mockStorageProvider.deleteSessionCalledWith).toHaveLength(1);
      expect(mockStorageProvider.deleteSessionCalledWith[0]).toEqual({
        userId: 'default',
        sessionId: 'session1'
      });
    });

    it('should unmount current session if it is being deleted', async () => {
      const browserState = new TestBrowserState();
      (browserState as unknown as { storageProvider: MockStorageProvider }).storageProvider = mockStorageProvider;
      
      // First mount a session
      await browserState.mount('session1');
      
      // Spy on unmount method
      const unmountSpy = jest.spyOn(browserState, 'unmount');
      
      // Delete the mounted session
      await browserState.deleteSession('session1');
      
      expect(unmountSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    it('should clean up temporary directory', async () => {
      const browserState = new TestBrowserState();
      const tempDir = browserState.getTempDir();
      
      await browserState.cleanup();
      
      expect(fs.remove).toHaveBeenCalledWith(tempDir);
    });
  });
}); 