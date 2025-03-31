//import type { Redis as IoRedis } from "ioredis";
import Redis from "ioredis";
import type { Storage as GCPStorageType } from "@google-cloud/storage";
import type {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type { Upload } from "@aws-sdk/lib-storage";

/**
 * Cache for dynamically imported modules to avoid reimporting
 */
const moduleCache: Record<string, unknown> = {};

/**
 * Dynamically imports a module and caches the result to improve performance
 *
 * This utility helps with optional peer dependencies by:
 * 1. Caching imported modules to avoid reimporting on frequent calls
 * 2. Providing clear error messages when dependencies are missing
 * 3. Supporting TypeScript type safety with generics
 *
 * @example
 * // Import Redis
 * const Redis = await importModule<typeof import('ioredis').default>(
 *   'ioredis',
 *   'Please run: npm install ioredis --save'
 * );
 *
 * @param moduleName - Name of the module to import
 * @param errorMessage - User-friendly error message if import fails
 * @returns The imported module with proper typing
 */
export async function importModule<T>(
  moduleName: string,
  errorMessage: string,
): Promise<T> {
  // Return cached module if available
  if (moduleCache[moduleName]) {
    return moduleCache[moduleName] as T;
  }

  try {
    // Import the module
    const imported = await import(moduleName);
    const module = imported.default || imported;

    // Cache for future use
    moduleCache[moduleName] = module;

    return module as T;
  } catch {
    throw new Error(`Failed to import module '${moduleName}'. ${errorMessage}`);
  }
}

/**
 * Creates a lazy-loaded module that imports only when first accessed
 *
 * This function returns a proxy object that imports the module on first property access.
 * This is especially useful for modules that are rarely used or only used conditionally.
 *
 * @example
 * // Create a lazy Redis module
 * const lazyRedis = createLazyModule<typeof import('ioredis')>('ioredis', DEPENDENCY_ERRORS.REDIS);
 *
 * // Later in your code, first access triggers the import
 * const client = new lazyRedis.default(options);
 *
 * @param moduleName - Name of the module to import
 * @param errorMessage - User-friendly error message if import fails
 * @returns A proxy that imports the module on first access
 */
export function createLazyModule<T extends object>(
  moduleName: string,
  errorMessage: string,
): T {
  let moduleInstance: T | null = null;
  let importPromise: Promise<T> | null = null;

  return new Proxy({} as T, {
    get: (_, prop) => {
      if (moduleInstance) {
        return moduleInstance[prop as keyof T];
      }

      if (!importPromise) {
        importPromise = importModule<T>(moduleName, errorMessage).then(
          (module) => {
            moduleInstance = module;
            return module;
          },
        );
      }

      throw new Error(
        `Module '${moduleName}' is not yet loaded. Make sure to await before accessing its properties.`,
      );
    },
  });
}

/**
 * Create a singleton module loader that ensures a module is only imported once
 * and provides access to it through an async getter
 *
 * @example
 * // Create a module loader
 * const redis = createModuleLoader<typeof import('ioredis')>('ioredis', DEPENDENCY_ERRORS.REDIS);
 *
 * // Later in your code
 * const Redis = await redis.getModule();
 * const client = new Redis();
 *
 * @param moduleName - Name of the module to import
 * @param errorMessage - User-friendly error message if import fails
 * @returns An object with a getModule method to access the module
 */
export function createModuleLoader<T>(
  moduleName: string,
  errorMessage: string,
) {
  return {
    async getModule(): Promise<T> {
      return importModule<T>(moduleName, errorMessage);
    },
  };
}

/**
 * Type definitions for commonly used optional dependencies
 */
//export type RedisType = typeof IoRedis;
export type RedisType = typeof Redis;
// Type for archiver
export interface ArchiverType {
  (format: string, options?: { zlib?: { level: number } }): any;
  create: (format: string, options?: object) => any;
}

export type ExtractZipType = (
  zipPath: string,
  options: { dir: string },
) => Promise<void>;

// Type for AWS S3 SDK
export interface AWSS3SDK {
  S3Client: typeof S3Client;
  ListObjectsV2Command: typeof ListObjectsV2Command;
  GetObjectCommand: typeof GetObjectCommand;
  DeleteObjectsCommand: typeof DeleteObjectsCommand;
  HeadBucketCommand: typeof HeadBucketCommand;
  CreateBucketCommand: typeof CreateBucketCommand;
  S3ServiceException: typeof S3ServiceException;
}

// Type for AWS S3 Upload module
export interface AWSS3Upload {
  Upload: typeof Upload;
}

// Type for Google Cloud Storage
export interface GCPStorage {
  Storage: typeof GCPStorageType;
}

// Type for TAR module
export interface TarType {
  create: (options: {
    gzip: boolean;
    file: string;
    cwd: string;
  }, files: string[]) => Promise<void>;
  extract: (options: {
    file: string;
    cwd: string;
    strict?: boolean;
    filter?: (path: string) => boolean;
  }) => Promise<void>;
}

/**
 * Pre-defined error messages for common dependencies
 */
export const DEPENDENCY_ERRORS = {
  REDIS: "Please run: npm install ioredis --save",
  ARCHIVER: "Please run: npm install archiver --save",
  EXTRACT_ZIP: "Please run: npm install extract-zip --save",
  AWS_S3:
    "Please run: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage --save",
  GCS: "Please run: npm install @google-cloud/storage --save",
  TAR: "Please run: npm install tar --save",
};

/**
 * Lazy-loaded modules for common optional dependencies
 */
export const modules = {
  redis: createModuleLoader<RedisType>("ioredis", DEPENDENCY_ERRORS.REDIS),
  archiver: createModuleLoader<ArchiverType>(
    "archiver",
    DEPENDENCY_ERRORS.ARCHIVER,
  ),
  extractZip: createModuleLoader<ExtractZipType>(
    "extract-zip",
    DEPENDENCY_ERRORS.EXTRACT_ZIP,
  ),
  tar: createModuleLoader<TarType>(
    "tar",
    DEPENDENCY_ERRORS.TAR,
  ),
  aws: {
    s3: createModuleLoader<AWSS3SDK>(
      "@aws-sdk/client-s3",
      DEPENDENCY_ERRORS.AWS_S3,
    ),
    upload: createModuleLoader<AWSS3Upload>(
      "@aws-sdk/lib-storage",
      DEPENDENCY_ERRORS.AWS_S3,
    ),
  },
  gcp: {
    storage: createModuleLoader<GCPStorage>(
      "@google-cloud/storage",
      DEPENDENCY_ERRORS.GCS,
    ),
  },
  importModule,
};
