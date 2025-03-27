# GitHub Issue: Add API for Creating Clean Browser State

## Summary
Add a new API to BrowserState to create a clean, fresh state for user and session. This will enable proper handling of authentication events, particularly when users perform a fresh login requiring a clean state.

## Problem
Currently, the BrowserState SDK uses `mount` and `unmount` to load and save browser profiles, but there's no efficient way to explicitly create a fresh state when needed (such as after a full authentication). Additionally, there is no dedicated delete API that would allow for seamless removal of existing sessions. The current workflow requires developers to manually check if sessions exist and implement their own reset and deletion logic, making the process cumbersome and error-prone when handling authentication scenarios that require a clean slate.

## Proposed Solution
Add a new method `createCleanState()` to the BrowserState class that creates a temporary clean state but doesn't replace the existing one until explicitly committed.

## API Design

```typescript
class BrowserState {
  // Existing methods...
  
  /**
   * Creates a temporary fresh browser state without affecting existing sessions.
   * The temporary state is not persisted until commitCleanState() is called.
   * 
   * @param sessionId The session identifier (used only when committing)
   * @returns Path to the temporary clean user data directory
   */
  async createCleanState(sessionId: string): Promise<string> {
    // Implementation details...
  }
  
  /**
   * Commits a previously created clean state, replacing any existing session.
   * Call this after successful authentication to replace the old session.
   * 
   * @param sessionId The session identifier to commit
   * @returns True if commit was successful
   */
  async commitCleanState(sessionId: string): Promise<boolean> {
    // Implementation details...
  }
  
  /**
   * Discards a previously created clean state without affecting existing sessions.
   * Call this after failed authentication to keep the old session.
   */
  async discardCleanState(): Promise<void> {
    // Implementation details...
  }
}
```

## Usage Examples

### Example: Authentication Flow with Commit/Discard Pattern

```typescript
async function handleAuthentication(username: string, password: string) {
  // Create browserState with the user ID
  const browserState = new BrowserState({
    userId: username
  });
  
  // Create a temporary clean state (not yet committed)
  const tempUserDataDir = await browserState.createCleanState(`session-${username}`);
  
  // Launch browser with the temporary profile
  const browser = await chromium.launchPersistentContext(tempUserDataDir);
  
  try {
    // Navigate to login page and attempt authentication
    const page = await browser.newPage();
    await page.goto('https://example.com/login');
    
    // Fill login form
    await page.fill('#username', username);
    await page.fill('#password', password);
    await page.click('#login-button');
    
    // Wait for authentication to complete (e.g., redirect or success element)
    await page.waitForSelector('.login-success', { timeout: 5000 });
    
    // Authentication succeeded - commit the clean state
    await browserState.commitCleanState(`session-${username}`);
    
    // Continue with authenticated session...
    return browser;
    
  } catch (error) {
    // Authentication failed
    console.error("Authentication failed:", error);
    
    // Close the temporary browser
    await browser.close();
    
    // Discard the temporary clean state, keeping the previous state
    await browserState.discardCleanState();
    
    throw new Error("Authentication failed. Please try again.");
  }
}
```

## Benefits of this Approach

1. **Non-destructive by default** - Creating a clean state doesn't immediately destroy existing data
2. **Clear decision points** - Explicit commit/discard actions based on authentication result
3. **Optimal for authentication flows** - Temp state can be used for the authentication process itself
4. **Reduced risk** - No data loss if authentication or networking fails

## Implementation Considerations

The implementation would:

1. Create a temporary directory when `createCleanState()` is called
2. Store information about this temporary directory for later usage
3. On `commitCleanState()`:
   - Delete the existing session if present
   - Rename or copy the temporary directory to become the permanent session
4. On `discardCleanState()`:
   - Simply remove the temporary directory
   - Leave any existing session untouched

## Next Steps

- [ ] Design detailed API specifications
- [ ] Implement in core BrowserState class
- [ ] Add authentication flow tests
- [ ] Update documentation with examples

## Related Issues
- None yet 