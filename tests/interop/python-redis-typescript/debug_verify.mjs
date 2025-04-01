/**
 * Debug script for the verification process
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Starting debug verification process...');

// Try importing modules
console.log('\nImporting modules...');
try {
    console.log('Importing BrowserState...');
    const { BrowserState } = await import('../../../typescript/dist/index.js');
    console.log('✅ Successfully imported BrowserState!');
    
    console.log('\nImporting playwright...');
    const { chromium } = await import('playwright');
    console.log('✅ Successfully imported playwright!');
    
    // Try to create a BrowserState instance
    console.log('\nTrying to instantiate BrowserState with Redis...');
    const browserState = new BrowserState({
        userId: 'interop_test_user',
        storageType: 'redis',
        redisOptions: {
            host: 'localhost',
            port: 6379,
            password: undefined,
            db: 0,
            keyPrefix: 'browserstate:',
            ttl: 604800  // 7 days
        }
    });
    console.log('✅ Successfully created BrowserState instance!');
    
    // Try to execute Redis-specific methods to see if they fail
    console.log('\nList available sessions (this might fail if Redis connection issues)...');
    try {
        const sessions = await browserState.listSessions();
        console.log(`✅ Found ${sessions.length} sessions: ${sessions.join(', ')}`);
    } catch (err) {
        console.error(`❌ Error listing sessions: ${err.message}`);
        console.error('This might be due to Redis connectivity issues');
    }
} catch (err) {
    console.error('❌ Error in debug process:');
    console.error(err);
}

console.log('\n✨ Debug process complete!'); 