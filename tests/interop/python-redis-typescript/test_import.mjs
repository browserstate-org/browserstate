/**
 * Simple test script to verify we can import BrowserState from the TypeScript package.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Checking TypeScript package output...');

// Check if the dist directory exists
const distPath = path.join(__dirname, '../../../typescript/dist');
console.log(`Checking if dist directory exists at: ${distPath}`);
console.log(`Dist directory exists: ${fs.existsSync(distPath)}`);

// Check if the index.js file exists
const indexPath = path.join(distPath, 'index.js');
console.log(`Checking if index.js exists at: ${indexPath}`);
console.log(`index.js exists: ${fs.existsSync(indexPath)}`);

// List files in the dist directory
console.log('\nListing files in dist directory:');
try {
    const files = fs.readdirSync(distPath);
    files.forEach(file => console.log(`- ${file}`));
} catch (err) {
    console.error(`Error listing files: ${err.message}`);
}

console.log('\nAttempting to import BrowserState...');
try {
    const { BrowserState } = await import('../../../typescript/dist/index.js');
    console.log('✅ Successfully imported BrowserState!');
    console.log(`BrowserState type: ${typeof BrowserState}`);
    
    // Try to create a BrowserState instance
    if (typeof BrowserState === 'function') {
        console.log('\nTrying to instantiate BrowserState...');
        const browserState = new BrowserState({
            userId: 'test-user'
        });
        console.log('✅ Successfully created BrowserState instance!');
        console.log(`Instance type: ${typeof browserState}`);
    }
} catch (err) {
    console.error('❌ Error importing BrowserState:');
    console.error(err);
}

console.log('\n✨ Import test complete!'); 