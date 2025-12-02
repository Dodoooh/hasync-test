# Troubleshooting Guide (v1.4.0)

Common issues and solutions for HAsync.

## Table of Contents

- [Authentication Issues](#authentication-issues)
- [Pairing Issues](#pairing-issues)
- [Connection Issues](#connection-issues)
- [Entity Issues](#entity-issues)
- [Performance Issues](#performance-issues)
- [Docker & Installation](#docker--installation)
- [Debugging](#debugging)

---

## Authentication Issues

### Problem: 401 Unauthorized immediately after login

**Symptoms:**
- Login successful (green notification)
- Immediately see 401 errors in console
- Cannot access entities or areas

**Root Cause:**
- Token not properly synced to API client (fixed in v1.3.39-v1.3.40)

**Solution:**

1. **Check browser console** (F12 → Console):
   ```
   Look for:
   ✓ "Setting WebSocket token and connecting..."
   ✓ "[Login] ✓ Tokens set in clients IMMEDIATELY"
   ✓ "[API] GET /api/entities → Token attached"
   ```

2. **If no token logs appear:**
   - Clear browser cache (Ctrl+Shift+Delete)
   - Clear localStorage:
     ```javascript
     localStorage.clear();
     ```
   - Hard refresh (Ctrl+Shift+R)
   - Login again

3. **Verify token storage:**
   ```javascript
   // Open browser console (F12)
   console.log('Token in localStorage:', localStorage.getItem('auth_token'));
   ```

**Fixed in:** v1.3.39 (token sync), v1.3.40 (race condition)

---

### Problem: 401 errors after page refresh

**Symptoms:**
- Login works fine
- Refresh page → all API requests fail with 401
- Must logout and login again

**Root Cause:**
- Token stored in Zustand state but not restored to API client
- Fixed in v1.3.39

**Solution:**

**Option 1: Upgrade to v1.4.0 (recommended)**
```bash
# In Home Assistant:
Supervisor → Add-on Store → HAsync → Update
```

**Option 2: Manual token restoration**
```javascript
// Open browser console (F12)
const token = localStorage.getItem('auth_token');
if (token) {
  // Manually set token (temporary fix)
  apiClient.setAuthToken(token);
  console.log('Token restored manually');
}
```

**Fixed in:** v1.3.39

---

### Problem: Settings page shows 401/403 when saving HA config

**Symptoms:**
- Can access other pages
- Settings page shows authentication errors
- Cannot save Home Assistant URL/token

**Root Cause:**
- Settings component using direct `fetch()` instead of `apiClient`
- Fixed in v1.3.43

**Solution:**

**Option 1: Upgrade to v1.4.0 (recommended)**

**Option 2: Check browser console**
```javascript
// Should see:
[API] POST /config/ha → Token attached

// If you see:
POST /api/config/ha → Authentication failed: No token provided

// Then you have an old version (< v1.3.43)
```

**Fixed in:** v1.3.43

---

### Problem: All API requests fail after saving HA config

**Symptoms:**
- Save Home Assistant URL and token
- All API requests suddenly fail with 401
- Must logout and login to restore functionality

**Root Cause:**
- Settings component called `setAuth(url, token)` with HA credentials
- This overwrote admin JWT token with HA Long-Lived Access Token
- Fixed in v1.3.44

**Immediate Solution:**
1. Logout
2. Login again with admin credentials

**Permanent Solution:**
- Upgrade to v1.4.0 (contains fix from v1.3.44)

**Fixed in:** v1.3.44

---

### Problem: No console logs visible in browser

**Symptoms:**
- Browser console completely empty
- No debug logs despite errors occurring

**Root Cause:**
- Vite Terser configuration had `drop_console: true`
- All console.log statements were stripped in production build
- Fixed in v1.3.42

**Solution:**

Upgrade to v1.4.0. Console logging was restored in v1.3.42.

**Workaround for old versions:**
- Use Network tab (F12 → Network) to see HTTP requests
- Check add-on logs for backend errors

**Fixed in:** v1.3.42

---

## Pairing Issues

### Problem: PIN expired before client could enter it

**Symptoms:**
- Generate PIN
- Countdown reaches 0:00
- Timer turns red
- "PIN has expired" error

**Solution:**

1. **Generate new PIN:**
   - Click "Generate New PIN" button
   - New 5-minute timer starts

2. **Faster pairing:**
   - Have client device ready before generating PIN
   - Enter PIN immediately after generation
   - Default 5-minute window should be sufficient

**Note:** v1.4.0 added prominent countdown timer to make expiration more visible!

---

### Problem: Client can't verify PIN (Invalid PIN error)

**Symptoms:**
- Client enters PIN
- Gets "Invalid PIN" error
- Admin UI still showing waiting state

**Possible Causes & Solutions:**

**1. Wrong PIN entered**
```
Solution: Double-check PIN display on admin interface
Tip: PIN is always 6 uppercase alphanumeric characters
```

**2. PIN expired**
```
Solution: Check countdown timer (v1.4.0)
         Green = OK, Yellow = Hurry, Red = Expired
         Generate new PIN if expired
```

**3. Network connectivity issue**
```bash
# Test backend connectivity from client
curl http://<hasync-ip>:8099/api/health

# Should return:
{
  "status": "healthy",
  "version": "1.4.0",
  ...
}
```

**4. Firewall blocking**
```bash
# Check if port 8099 is accessible
telnet <hasync-ip> 8099

# If connection refused:
# - Check Home Assistant firewall settings
# - Check add-on port configuration
```

**5. Session already completed**
```
Solution: Generate new pairing session
Cannot reuse completed or expired sessions
```

---

### Problem: Pairing verified but not completed

**Symptoms:**
- Admin UI shows "Client connected!"
- Device name and type displayed
- Client waiting indefinitely
- No token received

**Root Cause:**
- Admin hasn't completed the pairing process

**Solution:**

1. **Admin side:**
   - Verify device name is correct
   - Select areas to assign
   - Enter client name (pre-filled with device name)
   - Click "Complete Pairing" button

2. **Client side:**
   - Be patient - admin must manually complete
   - Watch for WebSocket event: `pairing_completed`

---

### Problem: Countdown timer not updating (old versions)

**Symptoms:**
- Timer shows static time
- No color changes
- No progress bar animation

**Solution:**

Upgrade to v1.4.0! Complete countdown timer rewrite:
- Real-time updates every second
- Color-coded urgency
- Animated progress bar

**Temporary workaround for old versions:**
- Refresh page to see updated time
- Calculate manually: PIN expires 5 minutes after generation

**Fixed in:** v1.4.0

---

### Problem: Client token not working after pairing

**Symptoms:**
- Pairing completed successfully
- Client tries to connect with token
- WebSocket connection rejected: "Invalid token"

**Possible Causes & Solutions:**

**1. Token not stored correctly**
```typescript
// Verify token storage on client
const storedToken = await secureStorage.get('client_token');
console.log('Stored token length:', storedToken?.length);
console.log('Expected length: 64 characters');

// Token should be 64-character hex string
if (!/^[0-9a-f]{64}$/.test(storedToken)) {
  console.error('Invalid token format!');
}
```

**2. Token was revoked by admin**
```bash
# Check client status (admin side)
GET /api/clients/:id
Authorization: Bearer <admin-jwt>

# If token was revoked, client must re-pair
```

**3. Token sent in wrong format**
```javascript
// Correct WebSocket connection:
const socket = io('ws://hasync-server:8099', {
  auth: {
    token: 'your-64-char-token-here' // NO 'Bearer ' prefix!
  }
});

// Wrong:
auth: { token: 'Bearer your-token' } // Don't add Bearer prefix for WebSocket
```

---

## Connection Issues

### Problem: Cannot access web UI

**Symptoms:**
- Navigate to http://homeassistant.local:5173
- Connection refused or timeout

**Solutions:**

**1. Check add-on status:**
```
Supervisor → Add-ons → HAsync → Status should be "Started"
```

**2. Check add-on logs:**
```
Supervisor → Add-ons → HAsync → Log

Look for:
✓ "Frontend server listening on port 5173"
✓ "Backend server listening on port 8099"
```

**3. Check port configuration:**
```yaml
# config.yaml
ports:
  8099/tcp: 8099  # Backend API
  5173/tcp: 5173  # Frontend UI

# These should be present and not conflicting
```

**4. Try direct IP address:**
```
http://<home-assistant-ip>:5173
```

**5. Check Docker container:**
```bash
# SSH into Home Assistant
docker ps | grep hasync

# Should show running container
# If not, check supervisor logs
```

---

### Problem: WebSocket disconnections

**Symptoms:**
- Frequent disconnects and reconnects
- Real-time updates delayed or missing
- Console shows "disconnect" / "connect" cycles

**Solutions:**

**1. Check network stability:**
```bash
# Ping Home Assistant from client
ping <hasync-ip>

# Should have stable, low latency
```

**2. Check server logs for errors:**
```
Supervisor → Add-ons → HAsync → Log

Look for:
✗ "WebSocket error"
✗ "Client disconnected unexpectedly"
```

**3. Increase WebSocket timeout:**
```typescript
// Client configuration
const socket = io('ws://hasync-server:8099', {
  auth: { token },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
  timeout: 20000 // Increase from default 20s
});
```

**4. Check for proxy issues:**
- If using reverse proxy (nginx, Apache), ensure WebSocket support enabled
- Check proxy timeout settings

---

## Entity Issues

### Problem: "Failed to fetch entities" error

**Symptoms:**
- Login successful
- Entities page shows error
- Cannot see Home Assistant entities

**Solutions:**

**1. Check Home Assistant configuration:**
```
Settings → Home Assistant URL and Token must be configured
```

**2. Verify HA Long-Lived Access Token:**
```bash
# Test token directly
curl -X GET \
  -H "Authorization: Bearer <your-ha-token>" \
  -H "Content-Type: application/json" \
  http://homeassistant.local:8123/api/states

# Should return JSON array of entities
```

**3. Check Home Assistant connectivity from add-on:**
```bash
# SSH into Home Assistant
docker exec -it <hasync-container-id> sh

# Test HA connectivity
curl http://supervisor/core/api/states

# Should return entity list
```

**4. Check add-on logs:**
```
Look for:
✗ "Failed to fetch entities from Home Assistant"
✗ "Connection refused"
✗ "Unauthorized"
```

---

### Problem: Entity states not updating

**Symptoms:**
- Entities displayed but frozen
- Changes in HA not reflected in HAsync
- Real-time updates not working

**Solutions:**

**1. Check WebSocket connection:**
```javascript
// Browser console
// Should see:
✓ "WebSocket connected"
✓ "Subscribed to entity updates"
```

**2. Check client is subscribed:**
```javascript
// Client should emit 'subscribe' event after connecting
socket.emit('subscribe', {
  entities: ['light.living_room', ...]
});
```

**3. Verify entity IDs:**
```
Entity IDs must match exactly:
✓ light.living_room
✗ light.livingroom (wrong)
✗ Light.living_room (wrong - case sensitive)
```

**4. Check Home Assistant state changes:**
```bash
# In HA, test entity:
Developer Tools → States → Find entity → Change state manually

# Check if HAsync receives update
```

---

## Performance Issues

### Problem: Slow page loads

**Symptoms:**
- Pages take 3+ seconds to load
- Visible lag when navigating
- Spinner shows for extended time

**Solutions:**

**1. Check database size:**
```bash
# SSH into Home Assistant
ls -lh /data/hasync.db

# If > 100MB, consider cleanup:
# - Delete old pairing sessions
# - Remove inactive clients
```

**2. Reduce client count:**
```yaml
# config.yaml
options:
  max_clients: 50  # Default is 100
```

**3. Check server resources:**
```
Supervisor → System → Check:
- CPU usage
- Memory usage
- Disk I/O

# If high, consider upgrading hardware
```

**4. Enable lazy loading (already implemented):**
```typescript
// Components are lazy-loaded by default in v1.4.0
const EntitySelector = lazy(() => import('@/components/EntitySelector'));
```

---

### Problem: High memory usage

**Symptoms:**
- Add-on uses 500MB+ RAM
- Home Assistant slow or freezing
- OOM (Out of Memory) errors in logs

**Solutions:**

**1. Reduce concurrent connections:**
```yaml
# config.yaml
options:
  max_clients: 25  # Reduce from default 100
```

**2. Clear old pairing sessions:**
```sql
-- Auto-cleanup runs daily, but can manually clear:
DELETE FROM pairing_sessions
WHERE expiresAt < datetime('now')
  OR (completed = 1 AND completedAt < datetime('now', '-7 days'));
```

**3. Monitor memory:**
```bash
# SSH into Home Assistant
docker stats <hasync-container>

# Watch memory usage
```

**4. Restart add-on periodically:**
```
Supervisor → Add-ons → HAsync → Restart

# Or automate:
# Home Assistant Automation to restart weekly
```

---

## Docker & Installation

### Problem: "Build failed" during installation

**Symptoms:**
- Add-on installation hangs
- "Build failed" error in supervisor logs
- Installation never completes

**Solutions:**

**1. Check supervisor logs:**
```
Supervisor → System → Logs

Look for:
✗ "npm install failed"
✗ "Docker build error"
✗ "Network timeout"
```

**2. Check internet connectivity:**
```bash
# SSH into Home Assistant
ping google.com

# If no response, check network settings
```

**3. Clear Docker cache and rebuild:**
```bash
# SSH into Home Assistant
docker system prune -af

# Then reinstall add-on
```

**4. Check disk space:**
```bash
df -h

# Need at least 2GB free for build
```

---

### Problem: Addon shows old version after update

**Symptoms:**
- Update to v1.4.0
- Version still shows v1.3.44
- New features not working

**Solutions:**

**1. Hard rebuild:**
```bash
# In Home Assistant:
Supervisor → Add-ons → HAsync → Rebuild
```

**2. Clear Docker cache:**
```bash
# SSH into Home Assistant
docker system prune -af

# Then reinstall addon
```

**3. Verify GitHub repository:**
```bash
# Check repository.json in addon store
# Should point to latest commit

# Or manually update:
Supervisor → Add-on Store → ⋮ → Repositories → Reload
```

**4. Check version in multiple places:**
```bash
# Browser console:
console.log(FRONTEND_VERSION); // Should be '1.4.0'

# API health check:
curl http://localhost:8099/api/health | jq '.version'
# Should return "1.4.0"

# Add-on info:
Supervisor → Add-ons → HAsync → Info → Version
```

---

## Debugging

### Enable Debug Logging

**Backend:**

```yaml
# config.yaml
options:
  log_level: "debug"  # Change from "info"
```

Restart add-on, then:
```
Supervisor → Add-ons → HAsync → Log

# Should see much more detailed logs
```

**Frontend:**

```javascript
// Browser console (F12)

// Already enabled in v1.3.42+
// All console.log statements are preserved

// Check for:
✓ Token sync logs
✓ API request logs
✓ WebSocket event logs
```

---

### Network Debugging

**Test API connectivity:**

```bash
# Test health endpoint
curl http://<hasync-ip>:8099/api/health

# Test auth (should fail without token)
curl http://<hasync-ip>:8099/api/entities

# Test auth with token
curl -H "Authorization: Bearer <your-jwt>" \
     http://<hasync-ip>:8099/api/entities
```

**Test WebSocket:**

```javascript
// Browser console
const socket = io('ws://localhost:8099', {
  auth: { token: 'test' }
});

socket.on('connect', () => {
  console.log('✓ WebSocket connected');
});

socket.on('connect_error', (error) => {
  console.error('✗ WebSocket error:', error);
});
```

---

### Database Inspection

```bash
# SSH into Home Assistant
docker exec -it <hasync-container> sh

# Open database
sqlite3 /data/hasync.db

# Inspect tables
.tables

# View clients
SELECT id, name, deviceType, lastSeen,
       substr(token, 1, 16) as token_preview
FROM clients;

# View pairing sessions
SELECT id, pin, expiresAt, verified, completed
FROM pairing_sessions
WHERE expiresAt > datetime('now')
ORDER BY createdAt DESC
LIMIT 10;

# View areas
SELECT id, name, json_array_length(entities) as entity_count, enabled
FROM areas;
```

---

### Export Logs for Support

**Addon logs:**
```
Supervisor → Add-ons → HAsync → Log → Copy all
```

**Browser console:**
```
F12 → Console → Right-click → Save as...
```

**System info:**
```
Supervisor → System → Copy "System Health" section
```

**Include in bug report:**
- Addon version
- Home Assistant version
- Browser and OS
- Steps to reproduce
- All logs above

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `No token provided` | Missing Authorization header | Check token storage and API client setup |
| `Invalid or expired token` | JWT expired or invalid signature | Login again to get new token |
| `CSRF token validation failed` | CSRF required but JWT sent | Upgrade to v1.3.43+ (auto-skips CSRF for JWT) |
| `PIN has expired` | Took too long to verify | Generate new PIN (5 min limit) |
| `Invalid PIN` | Wrong PIN or expired session | Double-check PIN, regenerate if needed |
| `Pairing session not found` | Session expired or completed | Start new pairing session |
| `Rate limit exceeded` | Too many requests | Wait 15 minutes, reduce request frequency |

---

## Still Need Help?

1. **Check documentation:**
   - [API-REFERENCE.md](API-REFERENCE.md)
   - [AUTHENTICATION.md](AUTHENTICATION.md)
   - [CLIENT-PAIRING.md](CLIENT-PAIRING.md)

2. **Search existing issues:**
   - GitHub Issues: https://github.com/Dodoooh/hasync-test/issues

3. **Create new issue:**
   - Include all debugging information above
   - Attach logs (sanitize sensitive data!)
   - Describe expected vs actual behavior

---

**Last Updated:** 2025-12-02 (v1.4.0)
