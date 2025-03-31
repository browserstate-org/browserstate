/**
 * TypeScript/JavaScript helper for local storage interoperability testing
 * 
 * This script provides a command-line interface to the TypeScript local 
 * storage implementation for testing interoperability with the Python implementation.
 * 
 * Usage:
 *   node ts_local_helper.js <action> <userId> <sessionId> [sessionDir] --storage-dir <storageDir>
 * 
 * Actions:
 *   - upload: Upload session data to local storage
 *   - download: Download session data from local storage
 *   - delete: Delete a session from local storage
 *   - list: List all sessions for a user
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
    console.error('Usage: node ts_local_helper.js <action> <userId> <sessionId> [sessionDir] --storage-dir <storageDir>');
    process.exit(1);
}

const [action, userId, sessionId] = args;
let sessionDir = null;
let storageDir = null;

// Parse additional arguments
for (let i = 3; i < args.length; i++) {
    if (args[i] === '--storage-dir' && i + 1 < args.length) {
        storageDir = args[i + 1];
        i++; // Skip the next argument
    } else if (!sessionDir && !args[i].startsWith('--')) {
        sessionDir = args[i];
    }
}

// Ensure we have a storage directory
if (!storageDir) {
    // Default to a temp directory if not specified
    storageDir = path.join(os.tmpdir(), 'browserstate-local-storage');
    console.log(`Using default storage directory: ${storageDir}`);
}

// Ensure the storage directory exists
if (!fs.existsSync(storageDir)) {
    try {
        fs.mkdirSync(storageDir, { recursive: true });
    } catch (error) {
        console.error(`ERROR: Failed to create storage directory: ${error.message}`);
        process.exit(1);
    }
}

// Import required modules dynamically
function initializeLocalStorage() {
    try {
        // For testing, we need to import from the TypeScript module path
        const localStorageModule = require('../../typescript/dist/storage/LocalStorage');
        const LocalStorageProvider = localStorageModule.LocalStorageProvider;

        // Create local storage provider instance
        const storage = new LocalStorageProvider({
            storagePath: storageDir
        });

        return storage;
    } catch (error) {
        console.error(`ERROR: Failed to initialize local storage: ${error.message}`);
        process.exit(1);
    }
}

// Helper functions for the local storage operations
async function uploadSession() {
    if (!sessionDir) {
        console.error('ERROR: Session directory is required for upload action');
        process.exit(1);
    }

    try {
        const storage = initializeLocalStorage();
        await storage.upload(userId, sessionId, sessionDir);
        console.log(`SUCCESS: Uploaded session ${sessionId} to ${storageDir}`);
    } catch (error) {
        console.error(`ERROR: Failed to upload session: ${error.message}`);
        process.exit(1);
    }
}

async function downloadSession() {
    try {
        const storage = initializeLocalStorage();
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
        const storage = initializeLocalStorage();
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
        const storage = initializeLocalStorage();
        await storage.deleteSession(userId, sessionId);
        console.log(`SUCCESS: Deleted session ${sessionId} from local storage`);
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
function main() {
    try {
        switch (action) {
            case 'upload':
                uploadSession();
                break;
            case 'download':
                downloadSession();
                break;
            case 'list':
                listSessions();
                break;
            case 'delete':
                deleteSession();
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