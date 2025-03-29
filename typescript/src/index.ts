// Export main BrowserState class
export { BrowserState, BrowserStateOptions } from "./BrowserState";

// Export storage providers for custom implementations
export { StorageProvider } from "./storage/StorageProvider";
export { LocalStorage } from "./storage/LocalStorage";

// Re-export S3Storage and GCSStorage
// The implementation details of these classes handle dynamic loading
// of required SDK dependencies
import { S3Storage } from "./storage/S3Storage";
import { GCSStorage } from "./storage/GCSStorage";

export { S3Storage, GCSStorage };
