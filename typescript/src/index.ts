// Export main BrowserState class
export { BrowserState, BrowserStateOptions } from "./BrowserState";

// Export storage providers for custom implementations
export { StorageProvider } from "./storage/StorageProvider";
export { LocalStorage } from "./storage/LocalStorage";
export { S3Storage } from "./storage/S3Storage";
export { GCSStorage } from "./storage/GCSStorage";
