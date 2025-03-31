/**
 * TypeScript/JavaScript helper for S3 storage interoperability testing
 * 
 * This script provides a command-line interface to the TypeScript S3 
 * implementation for testing interoperability with the Python implementation.
 * 
 * Usage:
 *   node ts_s3_helper.js <action> <userId> <sessionId> [sessionDir] --config <configFile>
 * 
 * Actions:
 *   - upload: Upload session data to S3
 *   - download: Download session data from S3
 *   - delete: Delete a session from S3
 *   - list: List all sessions for a user
 * 
 * Config file format (JSON):
 *   {
 *     "bucket": "bucket-name",
 *     "region": "aws-region",
 *     "prefix": "optional/key/prefix"
 *   }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
    console.error('Usage: node ts_s3_helper.js <action> <userId> <sessionId> [sessionDir] --config <configFile>');
    process.exit(1);
}

const [action, userId, sessionId] = args;
let sessionDir = null;
let configFile = null;

// Parse additional arguments
for (let i = 3; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
        configFile = args[i + 1];
        i++; // Skip the next argument
    } else if (!sessionDir && !args[i].startsWith('--')) {
        sessionDir = args[i];
    }
}

// Ensure we have a config file
if (!configFile) {
    console.error('ERROR: Config file is required. Use --config option.');
    process.exit(1);
}

// Read and parse config
let config;
try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
} catch (error) {
    console.error(`ERROR: Failed to read or parse config file: ${error.message}`);
    process.exit(1);
}

const { bucket, region, prefix } = config;

// Import required modules dynamically
async function initializeS3Storage() {
    try {
        // For testing, we need to import from the TypeScript module path
        const s3StorageModule = require('../../typescript/dist/storage/S3Storage');
        const S3StorageProvider = s3StorageModule.S3StorageProvider;

        // Create S3 storage provider instance
        const storage = new S3StorageProvider({
            bucket: bucket || 'browserstate-test',
            region: region || 'us-east-1',
            keyPrefix: prefix || 'browserstate',
            endpoint: process.env.AWS_ENDPOINT, // Allow for local testing with minio/localstack
        });

        return storage;
    } catch (error) {
        console.error(`ERROR: Failed to initialize S3 storage: ${error.message}`);
        process.exit(1);
    }
}

// Helper functions for the S3 storage operations
async function uploadSession() {
    if (!sessionDir) {
        console.error('ERROR: Session directory is required for upload action');
        process.exit(1);
    }

    try {
        const storage = await initializeS3Storage();
        await storage.upload(userId, sessionId, sessionDir);
        console.log(`SUCCESS: Uploaded session ${sessionId} to S3 bucket ${bucket}`);
    } catch (error) {
        console.error(`ERROR: Failed to upload session: ${error.message}`);
        process.exit(1);
    }
}

async function downloadSession() {
    try {
        const storage = await initializeS3Storage();
        const downloadPath = await storage.download(userId, sessionId);
        console.log(`SUCCESS: Downloaded session ${sessionId} to ${downloadPath}`);

        // Log contents to verify
        const files = listFilesRecursively(downloadPath);
        if (files.length > 0) {
            console.log(`Files: ${files.join(', ')}`);
        } else {
            console.log('No files found in the downloaded session.');
        }
    } catch (error) {
        console.error(`ERROR: Failed to download session: ${error.message}`);
        process.exit(1);
    }
}

async function listSessions() {
    try {
        const storage = await initializeS3Storage();
        const sessions = await storage.listSessions(userId);
        console.log(`SUCCESS: Found ${sessions.length} sessions for user ${userId}`);

        // Output session IDs one per line for easy parsing
        for (const sessionId of sessions) {
            console.log(sessionId);
        }
    } catch (error) {
        console.error(`ERROR: Failed to list sessions: ${error.message}`);
        process.exit(1);
    }
}

async function deleteSession() {
    try {
        const storage = await initializeS3Storage();
        await storage.deleteSession(userId, sessionId);
        console.log(`SUCCESS: Deleted session ${sessionId} from S3 bucket ${bucket}`);
    } catch (error) {
        console.error(`ERROR: Failed to delete session: ${error.message}`);
        process.exit(1);
    }
}

// Helper function to list files recursively
function listFilesRecursively(directory) {
    const files = [];

    function traverse(dir, relativePath = '') {
        const entries = fs.readdirSync(dir);

        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                traverse(fullPath, path.join(relativePath, entry));
            } else {
                files.push(path.join(relativePath, entry));
            }
        }
    }

    traverse(directory);
    return files;
}

// Main function to execute the requested action
async function main() {
    try {
        switch (action) {
            case 'upload':
                await uploadSession();
                break;
            case 'download':
                await downloadSession();
                break;
            case 'list':
                await listSessions();
                break;
            case 'delete':
                await deleteSession();
                break;
            default:
                console.error(`ERROR: Unknown action '${action}'`);
                process.exit(1);
        }
    } catch (error) {
        console.error(`ERROR: ${error.message}`);
        process.exit(1);
    }
}

// Run the main function
main(); 