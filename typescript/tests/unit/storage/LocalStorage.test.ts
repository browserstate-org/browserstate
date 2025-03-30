import { LocalStorage } from '../../../src/storage/LocalStorage';
import path from 'path';

// Mock fs-extra module before imports
jest.mock('fs-extra', () => ({
  ensureDirSync: jest.fn(),
  ensureDir: jest.fn().mockResolvedValue(undefined),
  existsSync: jest.fn().mockReturnValue(true),
  copy: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue(['session1', 'session2']),
  pathExists: jest.fn().mockResolvedValue(true),
  emptyDir: jest.fn().mockResolvedValue(undefined)
}));

// Import the mocked module
import fs from 'fs-extra';

describe('LocalStorage', () => {
  let localStorage: LocalStorage;
  const defaultStoragePath = expect.stringContaining(path.join('.browserstate'));
  
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage = new LocalStorage();
  });
  
  describe('constructor', () => {
    it('should create the userData directory', () => {
      expect(fs.ensureDirSync).toHaveBeenCalledWith(
        expect.stringContaining('.browserstate')
      );
    });
    
    it('should use default storage path if none provided', () => {
      expect(fs.ensureDirSync).toHaveBeenCalledWith(defaultStoragePath);
    });
  });
  
  describe('download', () => {
    it('should download a session if it exists', async () => {
      const session = 'test-session';
      const user = 'default';
      
      const result = await localStorage.download(user, session);
      
      expect(fs.pathExists).toHaveBeenCalled();
      expect(fs.emptyDir).toHaveBeenCalled();
      expect(fs.copy).toHaveBeenCalled();
      expect(result).toEqual(expect.stringContaining(session));
    });
    
    it('should create an empty directory if the session does not exist', async () => {
      const session = 'new-session';
      const user = 'default';
      
      ((fs.pathExists as unknown) as jest.Mock).mockResolvedValueOnce(false);
      
      const result = await localStorage.download(user, session);
      
      expect(fs.pathExists).toHaveBeenCalled();
      expect(fs.copy).not.toHaveBeenCalled();
      expect(fs.ensureDir).toHaveBeenCalled();
      expect(result).toEqual(expect.stringContaining(session));
    });
  });
  
  describe('upload', () => {
    it('should upload a session', async () => {
      const session = 'test-session';
      const user = 'default';
      const source = '/tmp/source';
      
      await localStorage.upload(user, session, source);
      
      expect(fs.ensureDir).toHaveBeenCalled();
      expect(fs.copy).toHaveBeenCalledWith(
        source,
        expect.any(String),
        expect.objectContaining({ overwrite: true })
      );
    });
  });
  
  describe('listSessions', () => {
    it('should list all sessions for a user', async () => {
      const user = 'default';
      const mockSessions = ['session1', 'session2'];
      
      ((fs.readdir as unknown) as jest.Mock).mockResolvedValueOnce([
        { name: 'session1', isDirectory: () => true },
        { name: 'session2', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false }
      ]);
      
      const sessions = await localStorage.listSessions(user);
      
      expect(fs.readdir).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ withFileTypes: true })
      );
      expect(sessions).toEqual(mockSessions);
    });
    
    it('should return an empty array if the user directory does not exist', async () => {
      const user = 'non-existent-user';
      
      ((fs.readdir as unknown) as jest.Mock).mockRejectedValueOnce(new Error('Directory does not exist'));
      
      const sessions = await localStorage.listSessions(user);
      
      expect(fs.readdir).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ withFileTypes: true })
      );
      expect(sessions).toEqual([]);
    });
  });
  
  describe('deleteSession', () => {
    it('should delete a session', async () => {
      const session = 'test-session';
      const user = 'default';
      
      await localStorage.deleteSession(user, session);
      
      expect(fs.pathExists).toHaveBeenCalled();
      expect(fs.remove).toHaveBeenCalled();
    });
    
    it('should not throw if session does not exist', async () => {
      const session = 'non-existent-session';
      const user = 'default';
      
      ((fs.pathExists as unknown) as jest.Mock).mockResolvedValueOnce(false);
      
      await expect(localStorage.deleteSession(user, session)).resolves.not.toThrow();
      
      expect(fs.pathExists).toHaveBeenCalled();
      expect(fs.remove).not.toHaveBeenCalled();
    });
  });
}); 