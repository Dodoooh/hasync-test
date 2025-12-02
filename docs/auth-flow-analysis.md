# HAsync Authentication System - Complete Flow Analysis

## Executive Summary

**CRITICAL BUG IDENTIFIED**: Middleware ordering issue causing token validation to fail for HTTP requests while WebSocket connections succeed.

---

## 1. Complete Authentication Flow

### 1.1 Login Process (`/api/admin/login` - Line 1582-1616)

```typescript
// Line 1582-1616: index-simple.ts
app.post('/api/admin/login', authLimiter, (req, res) => {
  // Validates admin credentials
  // Generates JWT token with:
  const payload = {
    username,
    role: 'admin',
    iat: Math.floor(Date.now() / 1000)
  };

  // Signs token with:
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,  // Default: '24h'
    issuer: 'hasync-backend',
    audience: 'hasync-client'
  });

  // Returns: { token, user, expiresIn }
});
```

**Token Properties:**
- Algorithm: HS256 (default)
- Expiration: 24 hours (JWT_EXPIRATION env var)
- Issuer: 'hasync-backend'
- Audience: 'hasync-client'
- Contains: username, role='admin', iat timestamp

---

## 2. Token Validation - HTTP vs WebSocket

### 2.1 HTTP Authentication Middleware (Line 251-290)

```typescript
// Line 251-290: index-simple.ts
const authenticate = (req, res, next) => {
  // Extracts token from Authorization header
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided'  // ← THIS IS THE ERROR WE SEE
    });
  }

  // Verifies token with SAME JWT_SECRET
  const decoded = jwt.verify(token, JWT_SECRET, {
    issuer: 'hasync-backend',
    audience: 'hasync-client'
  });

  // Attaches user to request
  req.user = { id: decoded.username, username: decoded.username, role: 'admin' };
  next();
};
```

### 2.2 WebSocket Authentication (socketAuth.ts - Line 69-186)

```typescript
// middleware/socketAuth.ts - Line 69-186
export function socketAuthMiddleware(socket, next) {
  // Extracts token from auth object OR query params
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  // Uses verifyAccessToken() from auth.ts
  const decoded = verifyAccessToken(token);

  // Same verification logic:
  jwt.verify(token, JWT_SECRET, {
    issuer: 'hasync-backend',
    audience: 'hasync-client'
  });

  socket.user = { username: decoded.username, role: decoded.role };
  next();
}
```

---

## 3. CSRF Protection Middleware (Line 460-501)

### 3.1 CSRF Skip Logic

```typescript
// Line 471-501: index-simple.ts
const csrfProtection = (req, res, next) => {
  const authHeader = req.get('authorization');

  // Skip CSRF if using Bearer token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    logger.info('✓ Skipping CSRF for JWT-authenticated request');
    return next();  // ← SHOULD BYPASS CSRF
  }

  // Otherwise, apply CSRF middleware
  csrfMiddleware(req, res, next);
};
```

**CSRF Configuration:**
- Cookie-based
- httpOnly: true
- secure: false (for internal network)
- sameSite: 'lax'
- maxAge: 1 hour

---

## 4. Middleware Ordering Analysis

### 4.1 Routes with Both CSRF and Auth

**CRITICAL FINDING**: Routes have middleware in this order:

```typescript
// Line 1621: POST /api/config/ha
app.post('/api/config/ha', writeLimiter, csrfProtection, authenticate, (req, res) => {
  // ...
});

// Line 1128: POST /api/areas
app.post('/api/areas', writeLimiter, csrfProtection, authenticate, (req, res) => {
  // ...
});
```

**Execution Order:**
1. `writeLimiter` - Rate limiting
2. `csrfProtection` - Checks for Bearer token, if present, skips CSRF
3. `authenticate` - Validates Bearer token

### 4.2 Routes with Only Auth

```typescript
// Line 741: POST /api/pairing/create
app.post('/api/pairing/create', authLimiter, authenticate, (req, res) => {
  // ...
});

// Line 1064: GET /api/entities
app.get('/api/entities', readLimiter, authenticate, (req, res) => {
  // ...
});
```

**Execution Order:**
1. Rate limiter
2. `authenticate` - Direct token validation

---

## 5. Root Cause Analysis

### 5.1 Why WebSocket Works

WebSocket authentication:
- ✅ Token passed via `socket.handshake.auth.token`
- ✅ OR via `socket.handshake.query.token`
- ✅ Direct verification using `verifyAccessToken()`
- ✅ No CSRF middleware involved
- ✅ Same JWT verification (issuer + audience)

### 5.2 Why HTTP Fails After 3 Seconds

**Hypothesis #1: Token Not Sent in HTTP Requests**
- Frontend stores token successfully (confirmed by WebSocket working)
- BUT frontend may not be attaching token to HTTP requests
- Logs show: `hasAuthHeader: false` (Line 256 debug log)
- Result: `authenticate` middleware rejects with "No token provided" (Line 262-269)

**Hypothesis #2: CSRF Cookie Timing**
- CSRF cookie has 1-hour expiration (Line 465)
- But this should NOT affect Bearer token requests
- CSRF is explicitly skipped when Bearer token present (Line 486-491)

**Hypothesis #3: Frontend State Loss**
- Token stored in memory/state only
- No localStorage/sessionStorage persistence
- Page refresh or component re-render loses token
- WebSocket maintains connection, so keeps working

**Hypothesis #4: Race Condition**
- Login completes, token stored
- WebSocket connects immediately with token (works)
- But HTTP requests made 3 seconds later don't have token
- Suggests frontend token storage/retrieval issue

---

## 6. Code Verification Points

### 6.1 JWT Secret Configuration

```typescript
// Line 99-102: index-simple.ts
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required!');
}

// Line 10: middleware/auth.ts
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
```

**POTENTIAL ISSUE**: Two different JWT_SECRET initializations!
- `index-simple.ts`: Throws error if missing (strict)
- `auth.ts`: Falls back to default value (lenient)

### 6.2 Token Verification Consistency

**HTTP Verification** (index-simple.ts Line 273-276):
```typescript
jwt.verify(token, JWT_SECRET, {
  issuer: 'hasync-backend',
  audience: 'hasync-client'
});
```

**WebSocket Verification** (auth.ts Line 55-59):
```typescript
jwt.verify(token, JWT_SECRET, {
  issuer: 'hasync-backend',
  audience: 'hasync-client'
});
```

✅ **Verification is identical** - both use same issuer/audience

---

## 7. Specific Bug Locations

### Bug #1: Frontend Not Sending Token (Most Likely)
**Location**: Client-side code (not in backend)
**Evidence**:
- Line 256 logs show: `hasAuthHeader: false`
- Line 262 triggers: "No token provided"
- CSRF protection activates instead of being skipped

### Bug #2: JWT_SECRET Mismatch (Possible)
**Location**: Two files initializing JWT_SECRET differently
- `/backend/src/index-simple.ts` Line 99-102
- `/backend/src/middleware/auth.ts` Line 10

**Risk**: If `JWT_SECRET` env var missing, auth.ts uses fallback while index-simple.ts would have crashed on startup (so probably not the issue)

### Bug #3: Middleware Ordering (Not a Bug, Working as Designed)
**Location**: Line 1621, 1128, etc.
**Analysis**: `csrfProtection` comes before `authenticate`, which is correct because:
1. CSRF checks for Bearer token presence
2. If Bearer token present, skips CSRF (Line 486-491)
3. Then `authenticate` validates the token
4. Order is correct: check → skip → validate

---

## 8. Why Token Works for WebSocket but Not HTTP

### Summary Table

| Aspect | WebSocket | HTTP |
|--------|-----------|------|
| Token Source | `socket.handshake.auth.token` or query | `req.headers.authorization` |
| Middleware Chain | Direct socketAuthMiddleware | Rate limiter → csrfProtection → authenticate |
| CSRF Applied? | No | Yes (if no Bearer token) |
| Token Format | Plain token string | Must be "Bearer <token>" |
| Verification | verifyAccessToken() | jwt.verify() |
| Current Status | ✅ Works | ❌ Fails with "No token provided" |

### The Smoking Gun

**From logs:**
```
[Auth] Authenticate middleware {
  hasAuthHeader: false,  ← TOKEN NOT PRESENT
  authHeaderPreview: 'none'
}

[Auth] Authentication failed: No token provided
```

**This proves:**
- Backend JWT verification is correct (works for WebSocket)
- Frontend is NOT sending `Authorization: Bearer <token>` header in HTTP requests
- CSRF protection activates because no Bearer token detected
- The bug is in the frontend HTTP client configuration

---

## 9. Recommended Frontend Checks

1. **Verify token storage after login**
   - Check localStorage/sessionStorage
   - Check React state/context
   - Confirm token persists after component re-render

2. **Verify HTTP client configuration**
   - Axios/Fetch interceptors
   - Default headers configuration
   - Token attachment logic

3. **Check request headers in browser DevTools**
   - Network tab → Request headers
   - Look for `Authorization: Bearer <token>`
   - Compare working WebSocket vs failing HTTP

4. **Review frontend auth context**
   - Token getter/setter methods
   - Header injection logic
   - State initialization on mount

---

## 10. Conclusion

### Primary Issue
**Frontend is not attaching the JWT token to HTTP request headers**, causing:
- `authenticate` middleware to reject requests (Line 262-269)
- CSRF protection to activate instead of being skipped (Line 494-500)
- "No token provided" error after 3 seconds

### Why WebSocket Works
WebSocket receives the token correctly via handshake auth/query params, bypassing the HTTP header mechanism entirely.

### Backend Code Status
✅ Backend authentication logic is **correct and working**
✅ Token generation is **valid**
✅ JWT verification is **consistent**
✅ Middleware ordering is **appropriate**

### Next Steps
1. **Inspect frontend HTTP client setup** (Axios/Fetch configuration)
2. **Verify Authorization header attachment** in request interceptors
3. **Check token persistence** in frontend state management
4. **Review network requests** in browser DevTools to confirm missing header

---

## File References
- `/backend/src/index-simple.ts` - Lines 251-290 (authenticate), 460-501 (csrfProtection), 1582-1616 (login)
- `/backend/src/middleware/socketAuth.ts` - Lines 69-186 (WebSocket auth)
- `/backend/src/middleware/auth.ts` - Lines 53-64 (verifyAccessToken)
