/**
 * Custom error classes for BrowserState and storage providers
 */

export class BrowserStateError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "BrowserStateError";
  }
}

export class StorageProviderError extends BrowserStateError {
  constructor(
    message: string,
    code: string,
    public readonly provider: string,
  ) {
    super(message, code);
    this.name = "StorageProviderError";
  }
}

export class AuthenticationError extends StorageProviderError {
  constructor(message: string, provider: string) {
    super(message, "AUTH_ERROR", provider);
    this.name = "AuthenticationError";
  }
}

export class ConnectionError extends StorageProviderError {
  constructor(message: string, provider: string) {
    super(message, "CONNECTION_ERROR", provider);
    this.name = "ConnectionError";
  }
}

export class ResourceNotFoundError extends StorageProviderError {
  constructor(message: string, provider: string) {
    super(message, "NOT_FOUND", provider);
    this.name = "ResourceNotFoundError";
  }
}

export class ValidationError extends BrowserStateError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class StateError extends BrowserStateError {
  constructor(message: string) {
    super(message, "STATE_ERROR");
    this.name = "StateError";
  }
}

// Error codes for easy reference
export const ErrorCodes = {
  AUTH_ERROR: "AUTH_ERROR",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  STATE_ERROR: "STATE_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;
