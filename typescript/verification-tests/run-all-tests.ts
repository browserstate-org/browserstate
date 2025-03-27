/**
 * run-all-tests.ts
 * 
 * Main script to run all verification tests for all storage providers.
 * This script should be run manually to verify storage providers are working correctly.
 */

import { runVerificationTests, VerificationReport } from './StorageVerification';
import { redisTests } from './RedisStorageVerification';
import * as fs from 'fs';
import * as path from 'path';

// Main function to run all verification tests
async function runAllVerificationTests(): Promise<void> {
  console.log('🚀 Starting Storage Provider Verification Tests');
  console.log('===============================================\n');
  
  // Collect all test reports
  const allReports: VerificationReport[] = [];
  
  // Run Redis tests
  console.log('📊 Running Redis Storage Tests');
  try {
    const redisReports = await runVerificationTests(redisTests);
    allReports.push(...redisReports);
  } catch (error) {
    console.error('❌ Failed to run Redis tests:', error instanceof Error ? error.message : String(error));
  }
  
  // TODO: Add more storage provider tests here
  // e.g., S3, GCS, etc.
  
  // Print overall summary
  console.log('\n\n📊 Overall Verification Results:');
  console.log('==============================');
  
  const totalTests = allReports.length;
  const passedTests = allReports.filter(r => r.success).length;
  
  console.log(`Tests run: ${totalTests}`);
  console.log(`Tests passed: ${passedTests}`);
  console.log(`Tests failed: ${totalTests - passedTests}`);
  console.log(`Success rate: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);
  
  // Save report to file
  const reportData = {
    timestamp: new Date().toISOString(),
    totalTests,
    passedTests,
    failedTests: totalTests - passedTests,
    tests: allReports
  };
  
  const reportDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  
  const reportFile = path.join(reportDir, `verification-report-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
  
  console.log(`\nReport saved to: ${reportFile}`);
  
  // Exit with error code if any tests failed
  process.exit(passedTests === totalTests ? 0 : 1);
}

// Run tests when this file is called directly
if (require.main === module) {
  runAllVerificationTests().catch(error => {
    console.error('❌ Fatal error running tests:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
} 