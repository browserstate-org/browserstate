/**
 * Interface for browser state storage providers
 */
export interface StorageProvider {
  /**
   * Downloads a browser session to a local directory
   * 
   * @param userId - User identifier
   * @param sessionId - Session identifier
   * @returns Promise resolving to the path where files were downloaded
   */
  download(userId: string, sessionId: string): Promise<string>;
  
  /**
   * Uploads a browser session from a local directory
   * 
   * @param userId - User identifier
   * @param sessionId - Session identifier
   * @param filePath - Path to the files to upload
   */
  upload(userId: string, sessionId: string, filePath: string): Promise<void>;

  /**
   * Lists available sessions for a user
   * 
   * @param userId - User identifier
   * @returns Promise resolving to array of session IDs
   */
  listSessions(userId: string): Promise<string[]>;

  /**
   * Deletes a browser session
   * 
   * @param userId - User identifier
   * @param sessionId - Session identifier
   */
  deleteSession(userId: string, sessionId: string): Promise<void>;
}