/**
 * TypeScript Redis storage helper script for integration tests.
 * 
 * This script provides a command-line interface to the TypeScript Redis storage implementation
 * for use in Python-TypeScript interoperability tests.
 * 
 * Usage:
 *   node ts_redis_helper.js <action> <userId> <sessionId> [sessionDir]
 * 
 * Actions:
 *   - upload: Upload a session to Redis
 *   - download: Download a session from Redis
 *   - list: List available sessions for a user
 *   - delete: Delete a session
 */

const Redis = require('ioredis');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const extractZip = require('extract-zip');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));
const { pipeline } = require('stream/promises');
const rimraf = promisify(require('rimraf'));
const os = require('os');
const crypto = require('crypto');

// Redis connection parameters
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';
const KEY_PREFIX = process.env.TS_HELPER_KEY_PREFIX || 'browserstate_interop_test';

/**
 * Redis Storage class for TypeScript implementation
 */
class RedisStorage {
    constructor(redisUrl = REDIS_URL, keyPrefix = KEY_PREFIX) {
        this.redis = new Redis(redisUrl);
        this.keyPrefix = keyPrefix;
    }

    /**
     * Get Redis key for session
     */
    getSessionKey(userId, sessionId) {
        return `${this.keyPrefix}:${userId}:${sessionId}`;
    }

    /**
     * Get Redis key for session metadata
     */
    getMetadataKey(userId, sessionId) {
        return `${this.keyPrefix}:${userId}:${sessionId}:metadata`;
    }

    /**
     * Upload a session to Redis
     */
    async uploadSession(userId, sessionId, sessionDir) {
        const sessionKey = this.getSessionKey(userId, sessionId);
        const metadataKey = this.getMetadataKey(userId, sessionId);

        // Create a temporary ZIP file
        const tempDir = os.tmpdir();
        const zipPath = path.join(tempDir, `${userId}_${sessionId}_${crypto.randomBytes(4).toString('hex')}.zip`);

        try {
            // Create ZIP archive
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            archive.pipe(output);
            archive.directory(sessionDir, false);
            await archive.finalize();

            // Wait for the output stream to finish
            await new Promise(resolve => output.on('close', resolve));

            // Read the ZIP file
            const zipData = fs.readFileSync(zipPath);
            const base64Data = zipData.toString('base64');

            // Create metadata
            const metadata = {
                timestamp: Date.now(),
                fileCount: countFiles(sessionDir),
                version: '2.0',
                format: 'zip'
            };

            // Store in Redis
            await this.redis.set(sessionKey, base64Data);
            await this.redis.set(metadataKey, JSON.stringify(metadata));

            return true;
        } catch (error) {
            console.error('Error uploading session:', error);
            throw error;
        } finally {
            // Cleanup
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }
        }
    }

    /**
     * Download a session from Redis
     */
    async downloadSession(userId, sessionId) {
        const sessionKey = this.getSessionKey(userId, sessionId);
        const metadataKey = this.getMetadataKey(userId, sessionId);

        // Get the session data
        const sessionData = await this.redis.get(sessionKey);
        if (!sessionData) {
            throw new Error(`Session not found: ${userId}/${sessionId}`);
        }

        // Create a temporary ZIP file
        const tempDir = os.tmpdir();
        const zipPath = path.join(tempDir, `${userId}_${sessionId}_${crypto.randomBytes(4).toString('hex')}.zip`);
        const extractDir = path.join(tempDir, `browserstate_${userId}_${sessionId}_${crypto.randomBytes(4).toString('hex')}`);

        try {
            // Convert Base64 to binary
            let zipBuffer;
            try {
                zipBuffer = Buffer.from(sessionData, 'base64');
            } catch (error) {
                zipBuffer = sessionData; // In case it's not in Base64
            }

            // Write to temporary file
            fs.writeFileSync(zipPath, zipBuffer);

            // Extract ZIP
            await mkdirp(extractDir);
            await extractZip(zipPath, { dir: extractDir });

            return extractDir;
        } catch (error) {
            console.error('Error downloading session:', error);
            throw error;
        } finally {
            // Cleanup ZIP file
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }
        }
    }

    /**
     * List available sessions for a user
     */
    async listSessions(userId) {
        const pattern = `${this.keyPrefix}:${userId}:*`;
        const keys = await this.redis.keys(pattern);

        // Extract session IDs
        const sessionIds = new Set();
        keys.forEach(key => {
            const parts = key.split(':');
            if (parts.length === 3) {
                sessionIds.add(parts[2]);
            }
            if (parts.length > 3 && parts[3] !== 'metadata') {
                sessionIds.add(parts[2]);
            }
        });

        return Array.from(sessionIds);
    }

    /**
     * Delete a session
     */
    async deleteSession(userId, sessionId) {
        const sessionKey = this.getSessionKey(userId, sessionId);
        const metadataKey = this.getMetadataKey(userId, sessionId);

        await this.redis.del(sessionKey);
        await this.redis.del(metadataKey);

        return true;
    }

    /**
     * Close the Redis connection
     */
    async close() {
        await this.redis.quit();
    }
}

/**
 * Count files in a directory recursively
 */
function countFiles(dir) {
    let count = 0;
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            count += countFiles(fullPath);
        } else {
            count++;
        }
    }

    return count;
}

/**
 * Main function to handle command-line arguments
 */
async function main() {
    try {
        const args = process.argv.slice(2);
        if (args.length < 3) {
            console.error('Usage: node ts_redis_helper.js <action> <userId> <sessionId> [sessionDir]');
            process.exit(1);
        }

        const [action, userId, sessionId] = args;
        const sessionDir = args[3]; // Optional for upload

        const storage = new RedisStorage();

        try {
            switch (action) {
                case 'upload':
                    if (!sessionDir) {
                        throw new Error('Session directory is required for upload action');
                    }
                    await storage.uploadSession(userId, sessionId, sessionDir);
                    console.log(`SUCCESS: Uploaded session ${userId}/${sessionId}`);
                    break;

                case 'download':
                    const downloadPath = await storage.downloadSession(userId, sessionId);
                    console.log(`SUCCESS: Downloaded session ${userId}/${sessionId} to ${downloadPath}`);
                    break;

                case 'list':
                    const sessions = await storage.listSessions(userId);
                    console.log(`SUCCESS: Found ${sessions.length} sessions for ${userId}`);
                    sessions.forEach(id => console.log(`- ${id}`));
                    break;

                case 'delete':
                    await storage.deleteSession(userId, sessionId);
                    console.log(`SUCCESS: Deleted session ${userId}/${sessionId}`);
                    break;

                default:
                    throw new Error(`Unknown action: ${action}`);
            }
        } finally {
            await storage.close();
        }
    } catch (error) {
        console.error(`ERROR: ${error.message}`);
        process.exit(1);
    }
}

// Run the main function
main(); 