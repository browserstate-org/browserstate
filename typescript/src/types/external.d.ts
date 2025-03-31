/**
 * Type declarations for external modules used in BrowserState
 */

// Redis
declare module 'ioredis' {
    export default class Redis {
        constructor(options?: any);
        connect(): Promise<void>;
        disconnect(): Promise<void>;
        quit(): Promise<void>;
        get(key: string): Promise<string | null>;
        set(key: string, value: string): Promise<"OK">;
        setex(key: string, seconds: number, value: string): Promise<"OK">;
        del(key: string): Promise<number>;
        keys(pattern: string): Promise<string[]>;
        [key: string]: any;
    }
}

// Archiver
declare module 'archiver' {
    function archiver(format: string, options?: any): any;
    export = archiver;
}

// Extract-Zip
declare module 'extract-zip' {
    function extractZip(zipPath: string, options: { dir: string }): Promise<void>;
    export = extractZip;
}

// TAR
declare module 'tar' {
    export function create(options: {
        gzip: boolean;
        file: string;
        cwd: string;
    }, files: string[]): Promise<void>;

    export function extract(options: {
        file: string;
        cwd: string;
        strict?: boolean;
        filter?: (path: string) => boolean;
    }): Promise<void>;
} 