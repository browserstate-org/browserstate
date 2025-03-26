/**
 * File hash interface for metadata tracking
 */
export interface FileMetadata {
  path: string;
  hash: string;
  size: number;
  modTime: number;
}
