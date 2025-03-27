export interface CacheProvider {
  download(sessionId: string): Promise<string | null>;
  upload(sessionId: string, data: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listSessions(): Promise<string[]>;
}
