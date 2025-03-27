/**
 * StorageVerification.ts
 * 
 * This file contains the framework for comprehensive verification tests of storage providers.
 * These tests are designed to run in a real-world scenario but are not part of the regular
 * test suite to avoid dependency on external services during CI/CD.
 */

import { chromium, BrowserContext } from 'playwright';
import { BrowserState } from '../src/BrowserState';

// Interface for verification test configuration
export interface VerificationConfig {
  /** Name of the test (used for reporting and session ID) */
  name: string;
  
  /** BrowserState configuration */
  browserStateOptions: Record<string, unknown>;
  
  /** Test timeout in milliseconds */
  timeout?: number;
  
  /** Function to run after mounting session (can manipulate browser state) */
  setupFn?: (context: BrowserContext, userDataDir: string) => Promise<void>;
  
  /** Function to verify state after remounting */
  verifyFn: (context: BrowserContext, userDataDir: string) => Promise<boolean>;
}

// Test report interface
export interface VerificationReport {
  name: string;
  success: boolean;
  error?: string;
  mountTime?: number;
  unmountTime?: number;
  remountTime?: number;
}

/**
 * Run a storage verification test
 * 
 * @param config Test configuration
 * @returns Test report
 */
export async function runVerificationTest(config: VerificationConfig): Promise<VerificationReport> {
  const report: VerificationReport = {
    name: config.name,
    success: false
  };
  
  let browserState: BrowserState | null = null;
  let browser: BrowserContext | null = null;
  
  const sessionId = `verification-${config.name}`;
  const userId = `verification-user`;
  
  try {
    // Initialize BrowserState
    browserState = new BrowserState({
      userId,
      ...config.browserStateOptions as object
    });
    
    // First mount - create new session
    console.log(`🔧 [${config.name}] Creating new browser state session`);
    const startMountTime = Date.now();
    const userDataDir = await browserState.mount(sessionId);
    report.mountTime = Date.now() - startMountTime;
    
    console.log(`📂 [${config.name}] User data directory: ${userDataDir}`);
    
    // Launch browser with the profile
    console.log(`🌐 [${config.name}] Launching browser with profile`);
    browser = await chromium.launchPersistentContext(userDataDir, {
      headless: true, // Use headless for verification tests
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    
    // Run setup function if provided
    if (config.setupFn) {
      console.log(`🔧 [${config.name}] Running setup function`);
      await config.setupFn(browser, userDataDir);
    }
    
    // Close browser
    console.log(`🔒 [${config.name}] Closing browser`);
    await browser.close();
    browser = null;
    
    // Unmount - store data
    console.log(`📤 [${config.name}] Unmounting and syncing changes`);
    const startUnmountTime = Date.now();
    await browserState.unmount();
    report.unmountTime = Date.now() - startUnmountTime;
    
    // Wait a moment to ensure storage operations complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Second mount - load existing session
    console.log(`📥 [${config.name}] Remounting session to verify persistence`);
    const startRemountTime = Date.now();
    const userDataDir2 = await browserState.mount(sessionId);
    report.remountTime = Date.now() - startRemountTime;
    
    // Launch browser again with the loaded profile
    console.log(`🔄 [${config.name}] Opening browser with restored session`);
    browser = await chromium.launchPersistentContext(userDataDir2, {
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    
    // Run verification function
    console.log(`🔍 [${config.name}] Verifying persistence`);
    const isValid = await config.verifyFn(browser, userDataDir2);
    
    if (isValid) {
      console.log(`✅ [${config.name}] Verification successful`);
      report.success = true;
    } else {
      console.log(`❌ [${config.name}] Verification failed`);
      report.success = false;
      report.error = "Verification function returned false";
    }
    
    // Close browser
    console.log(`🔒 [${config.name}] Closing browser`);
    await browser.close();
    browser = null;
    
    // Final unmount
    console.log(`📤 [${config.name}] Final unmount`);
    await browserState.unmount();
    
    return report;
    
  } catch (error) {
    console.error(`❌ [${config.name}] Error:`, error instanceof Error ? error.message : String(error));
    report.success = false;
    report.error = error instanceof Error ? error.message : String(error);
    
    // Cleanup
    if (browser) {
      await browser.close();
    }
    if (browserState) {
      try {
        await browserState.unmount();
      } catch {
        // Ignore cleanup errors
      }
    }
    
    return report;
  }
}

/**
 * Run multiple verification tests in sequence
 * 
 * @param configs Array of test configurations
 * @returns Array of test reports
 */
export async function runVerificationTests(configs: VerificationConfig[]): Promise<VerificationReport[]> {
  const reports: VerificationReport[] = [];
  
  for (const config of configs) {
    console.log(`\n📋 Running verification test: ${config.name}`);
    const report = await runVerificationTest(config);
    reports.push(report);
  }
  
  // Print summary
  console.log('\n📊 Verification Test Results:');
  console.log('=========================');
  
  for (const report of reports) {
    const status = report.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${report.name}`);
    
    if (report.mountTime) console.log(`      Mount: ${report.mountTime}ms`);
    if (report.unmountTime) console.log(`    Unmount: ${report.unmountTime}ms`);
    if (report.remountTime) console.log(`   Remount: ${report.remountTime}ms`);
    
    if (!report.success && report.error) {
      console.log(`     Error: ${report.error}`);
    }
  }
  
  return reports;
} 