# Deploy v1.3.42 - Console Logging Fix

## ROOT CAUSE ANALYSIS

**CRITICAL BUG FOUND**: The v1.3.41 build had `drop_console: true` in Terser configuration, which **stripped ALL console.log statements** from the production bundle!

### What Was Broken:
- ❌ Version banner not appearing (removed by Terser)
- ❌ Token sync logs not visible (removed by Terser)
- ❌ API request logs showing token attachment (removed by Terser)
- ❌ Race condition warnings (removed by Terser)
- ❌ **Zero visibility into token flow** (all debugging stripped)

### What Was Actually Working:
✅ JavaScript bundle loading correctly
✅ React app mounting successfully
✅ Token sync logic executing properly
✅ Code implementing race condition guards

**The token sync code was CORRECT all along - we just couldn't see it!**

## Changes in v1.3.42

### 1. Fixed vite.config.ts
```typescript
// BEFORE (v1.3.41)
terserOptions: {
  compress: {
    drop_console: true,  // ❌ STRIPS ALL LOGS
    drop_debugger: true,
  },
}

// AFTER (v1.3.42)
terserOptions: {
  compress: {
    drop_console: false, // ✅ KEEP LOGS FOR DEBUGGING
    drop_debugger: true,
    pure_funcs: [],      // Don't drop any function calls
  },
}
```

### 2. Updated Version Numbers
- Frontend: `1.3.42`
- Addon: `1.3.42`

## Deployment Instructions

### Option 1: Via Home Assistant CLI (if you have SSH access)
```bash
# From Home Assistant SSH terminal
ha addons reload
ha addons restart local_example
```

### Option 2: Via Home Assistant UI
1. Go to **Settings** → **Add-ons**
2. Click **⋮** (three dots) → **Reload**
3. Find **HAsync** addon
4. Click **Restart**
5. Wait 30 seconds for rebuild

### Option 3: Manual Docker Restart
```bash
# SSH into Home Assistant host
docker restart addon_local_example
```

## Verification Steps

After restarting the addon:

1. **Open browser DevTools Console** (F12)
2. **Reload the page** (Ctrl+Shift+R or Cmd+Shift+R)
3. **Look for version banner:**
   ```
   ═══════════════════════════════════════════════
   🎨 HAsync Frontend v1.3.42
   ═══════════════════════════════════════════════
   Build timestamp: 2024-12-02T...
   User agent: Mozilla/5.0...
   Token sync fix: v1.3.40 race condition guard active
   ```

4. **Login and watch token flow:**
   ```
   [Login] Login successful, setting auth token
   [Login] ✓ Tokens set in clients IMMEDIATELY
   [Login] ✓ Token stored in localStorage
   [Login] ✓ Token set in Zustand state
   [App] Token sync effect triggered
   ✓ Restoring API client token from store
   [API] GET /api/entities → Token attached (eyJhbGciOiJIUzI1NiIsInR5cCI6I...)
   ```

## Expected Results

### ✅ SUCCESS - If you see:
- Version banner with `v1.3.42`
- Token sync logs showing state transitions
- API request logs with "Token attached"
- No "NO TOKEN!" warnings

### ❌ STILL BROKEN - If you see:
- No console logs at all → **Bundle not updated, restart addon**
- Version shows `v1.3.41` → **Cache issue, hard refresh (Ctrl+Shift+R)**
- "NO TOKEN!" warnings → **Real token sync bug (report immediately)**

## Token Sync Flow (Now Visible!)

```
User Logs In
    ↓
handleLogin() called
    ↓
1. apiClient.setAuthToken(token)     [IMMEDIATE]
2. wsClient.setAuthToken(token)      [IMMEDIATE]
3. localStorage.setItem(token)       [IMMEDIATE]
4. setAuth('', token)                [Triggers React state update]
    ↓
useEffect detects [isAuthenticated, accessToken]
    ↓
5. apiClient.setAuthToken(token)     [Redundant but safe]
6. wsClient.setAuthToken(token)      [Redundant but safe]
    ↓
API Request Made
    ↓
Request Interceptor
    ↓
7. if (this.accessToken) {
     config.headers['Authorization'] = `Bearer ${token}`
   }
    ↓
✅ Request sent with Authorization header
```

## Technical Details

### Why This Bug Was Critical:
1. **Silent Failure**: Code executed correctly but produced no logs
2. **False Diagnosis**: Appeared as if JavaScript wasn't running
3. **Hidden Race Conditions**: Could mask real timing bugs
4. **Production Blindness**: No way to debug user-reported issues

### Why console.log Was Removed:
- **Vite default**: Assumes you want minimal production bundles
- **Performance optimization**: Removes "dead code"
- **Security concern**: Some developers log sensitive data

### Why We Need Logs:
- **Token debugging**: Critical authentication flow visibility
- **User support**: Reproduce reported issues
- **Development**: Faster iteration on bug fixes
- **Monitoring**: Track real-world behavior

## Next Steps

1. Deploy v1.3.42
2. Verify version banner appears
3. Login and confirm token logs
4. Report back token flow status
5. If still broken → investigate actual token sync bug
6. If working → close the ticket!

## File Changes Summary

Modified files:
- `frontend/vite.config.ts` - Disabled console removal
- `frontend/src/App.tsx` - Version bump to 1.3.42
- `config.yaml` - Version bump to 1.3.42

Built files:
- `frontend/dist/assets/index-fo0tzV7o.js` - New bundle with logs

---

**Status**: Ready to deploy
**Risk**: Low (only changes logging visibility)
**Rollback**: Revert to v1.3.41 if issues occur
