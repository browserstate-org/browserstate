/**
 * RedisStorageVerification.ts
 * 
 * Verification tests specifically for Redis storage provider.
 * This test ensures that browser state is properly persisted in Redis.
 */

import { BrowserContext } from 'playwright';
import { runVerificationTests, VerificationConfig } from './StorageVerification';
import * as fs from 'fs';
import * as path from 'path';

// Redis configuration
const REDIS_CONFIG = {
  // Basic connection options
  host: 'localhost',
  port: 6379,
  password: undefined, // Add if using password
  db: 0,
  
  // Storage configuration
  keyPrefix: 'browserstate:',
  
  // Advanced options
  maxFileSize: 5 * 1024 * 1024, // 5MB per file
  compression: false,
  ttl: 604800, // 7 days TTL
};

/**
 * Create a simple test file in the profile directory
 */
async function setupTestFiles(_browser: BrowserContext, userDataDir: string): Promise<void> {
  // Create a folder structure with test files
  const testDir = path.join(userDataDir, 'test-files');
  fs.mkdirSync(testDir, { recursive: true });
  
  // Create a nested directory structure
  const nestedDir = path.join(testDir, 'nested', 'folders');
  fs.mkdirSync(nestedDir, { recursive: true });
  
  // Create some test files with different content
  fs.writeFileSync(path.join(testDir, 'test1.txt'), 'This is test file 1', 'utf8');
  fs.writeFileSync(path.join(testDir, 'test2.json'), JSON.stringify({ 
    name: "Test Object",
    value: 42,
    nested: { foo: "bar" },
    array: [1, 2, 3]
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(nestedDir, 'nested-file.txt'), 'This is a nested test file', 'utf8');
  
  // Keep track of created files (can be used for verification)
  console.log('Created test files:');
  console.log(`- ${path.join(testDir, 'test1.txt')}`);
  console.log(`- ${path.join(testDir, 'test2.json')}`);
  console.log(`- ${path.join(nestedDir, 'nested-file.txt')}`);
}

/**
 * Verify that test files exist and have the correct content
 */
async function verifyTestFiles(_browser: BrowserContext, userDataDir: string): Promise<boolean> {
  // Check if test directory exists
  const testDir = path.join(userDataDir, 'test-files');
  const nestedDir = path.join(testDir, 'nested', 'folders');
  
  if (!fs.existsSync(testDir)) {
    console.error('Test directory not found');
    return false;
  }
  
  // Check test files
  const file1Path = path.join(testDir, 'test1.txt');
  const file2Path = path.join(testDir, 'test2.json');
  const file3Path = path.join(nestedDir, 'nested-file.txt');
  
  const file1Exists = fs.existsSync(file1Path);
  const file2Exists = fs.existsSync(file2Path);
  const file3Exists = fs.existsSync(file3Path);
  
  console.log('Verification results:');
  console.log(`- test1.txt exists: ${file1Exists ? '✅' : '❌'}`);
  console.log(`- test2.json exists: ${file2Exists ? '✅' : '❌'}`);
  console.log(`- nested-file.txt exists: ${file3Exists ? '✅' : '❌'}`);
  
  // If files don't exist, return false
  if (!file1Exists || !file2Exists || !file3Exists) {
    return false;
  }
  
  // Check file contents
  try {
    const content1 = fs.readFileSync(file1Path, 'utf8');
    const content2 = fs.readFileSync(file2Path, 'utf8');
    const content3 = fs.readFileSync(file3Path, 'utf8');
    
    const content1Valid = content1 === 'This is test file 1';
    const content2Valid = validateJsonContent(content2);
    const content3Valid = content3 === 'This is a nested test file';
    
    console.log(`- test1.txt content: ${content1Valid ? '✅' : '❌'}`);
    console.log(`- test2.json content: ${content2Valid ? '✅' : '❌'}`);
    console.log(`- nested-file.txt content: ${content3Valid ? '✅' : '❌'}`);
    
    return content1Valid && content2Valid && content3Valid;
  } catch (error) {
    console.error('Error reading file contents:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Validate JSON file content
 */
function validateJsonContent(content: string): boolean {
  try {
    const data = JSON.parse(content);
    return (
      data.name === "Test Object" &&
      data.value === 42 &&
      data.nested && data.nested.foo === "bar" &&
      Array.isArray(data.array) &&
      data.array.length === 3
    );
  } catch {
    return false;
  }
}

// Define verification tests for Redis storage
export const redisTests: VerificationConfig[] = [
  {
    name: 'redis-file-persistence',
    browserStateOptions: {
      storageType: 'redis',
      redisStorageOptions: REDIS_CONFIG
    },
    setupFn: setupTestFiles,
    verifyFn: verifyTestFiles
  }
];

// Execute the tests when this file is run directly
if (require.main === module) {
  console.log('🚀 Running Redis Storage Verification Tests');
  runVerificationTests(redisTests).then(reports => {
    // Exit with failure code if any tests failed
    const anyFailed = reports.some(report => !report.success);
    process.exit(anyFailed ? 1 : 0);
  });
} 