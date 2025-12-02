# Authentication Flow (v1.4.0)

Complete guide to HAsync authentication mechanisms.

## Table of Contents

- [Overview](#overview)
- [Admin Authentication](#admin-authentication)
- [Client Authentication](#client-authentication)
- [JWT Token Management](#jwt-token-management)
- [CSRF Protection](#csrf-protection)
- [Security Considerations](#security-considerations)

---

## Overview

HAsync uses two distinct authentication mechanisms:

1. **Admin Authentication:** JWT Bearer tokens for admin interface access
2. **Client Authentication:** Long-lived tokens for paired client devices

### Authentication Architecture

```
┌─────────────────┐
│  Admin UI       │
│  (React App)    │
└────────┬────────┘
         │
         │ 1. Login (POST /api/admin/login)
         ▼
┌─────────────────┐
│  Backend API    │──────┐
│  Express.js     │      │ 2. JWT Sign (HS256)
└────────┬────────┘      │    - Issuer: hasync-backend
         │                │    - Audience: hasync-client
         │                │    - Expiration: 24h
         │                │
         │ 3. Return JWT  │
         ▼                │
┌─────────────────┐      │
│  Admin UI       │◄─────┘
│  (Store Token)  │
│  - Zustand      │
│  - localStorage │
└────────┬────────┘
         │
         │ 4. API Requests (Authorization: Bearer <token>)
         ▼
┌─────────────────┐
│  Backend API    │──────┐
│  Middleware     │      │ 5. JWT Verify
└─────────────────┘      │    - Check signature
                         │    - Check expiration
                         │    - Check issuer/audience
                         │
                         └────► Allow/Deny Request
```

---

## Admin Authentication

### Login Process

**Step 1:** User enters credentials in admin UI

```typescript
// Frontend: LoginForm.tsx
const handleSubmit = async (e: React.FormEvent) => {
  const response = await apiClient.login(username, password);
  onLogin(response.token); // Pass token to App.tsx
};
```

**Step 2:** API validates credentials and issues JWT

```typescript
// Backend: index-simple.ts
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const payload = {
      username,
      role: 'admin',
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: '24h',
      issuer: 'hasync-backend',
      audience: 'hasync-client'
    });

    res.json({ token, user: { username, role: 'admin' } });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});
```

**Step 3:** Frontend stores token and sets in API client

```typescript
// Frontend: App.tsx
const handleLogin = useCallback((token: string) => {
  // CRITICAL: Set token IMMEDIATELY in API client BEFORE state update
  apiClient.setAuthToken(token);
  wsClient.setAuthToken(token);

  // Store in localStorage for persistence
  localStorage.setItem('auth_token', token);

  // Update Zustand state
  setAuth('', token);
}, [setAuth]);
```

**Step 4:** Token is automatically included in all API requests

```typescript
// Frontend: client.ts
this.instance.interceptors.request.use(
  async (config) => {
    if (this.accessToken) {
      config.headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return config;
  }
);
```

### Token Restoration After Page Refresh

**Problem:** After page refresh, API requests failed with 401 errors despite successful login.

**Root Cause:** Token stored in Zustand state but not synced to apiClient.

**Solution (v1.3.39 - v1.3.40):**

```typescript
// Frontend: App.tsx
useEffect(() => {
  if (isAuthenticated && accessToken) {
    // Restore token to API client from Zustand state
    apiClient.setAuthToken(accessToken);
    wsClient.setAuthToken(accessToken);
  }
}, [isAuthenticated, accessToken]);
```

### Race Condition Fix (v1.3.40)

**Problem:** Token sometimes cleared immediately after being set due to multiple re-renders.

**Solution:** Race condition guard in API client

```typescript
// Frontend: client.ts
setAuthToken(token: string | null): void {
  // GUARD: Don't clear token if we just set it (prevent race conditions)
  if (!token && this.accessToken) {
    const tokenAge = Date.now() - (this.tokenSetTime || 0);
    if (tokenAge < 1000) {
      console.warn('⚠️ Prevented token clear within 1s of setting');
      return;
    }
  }

  this.accessToken = token;
  this.tokenSetTime = token ? Date.now() : 0;
}
```

---

## Client Authentication

Client devices use long-lived tokens that do not expire. These tokens are generated during the pairing process.

### Client Token Generation

**Step 1:** Admin creates pairing session

```typescript
// Backend generates 6-digit PIN
const pin = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
```

**Step 2:** Client verifies PIN

```typescript
// Client sends PIN + device info to backend
POST /api/pairing/:sessionId/verify
{
  "pin": "123456",
  "deviceName": "Living Room Tablet",
  "deviceType": "tablet"
}
```

**Step 3:** Admin completes pairing

```typescript
// Admin assigns areas and client name
POST /api/pairing/:sessionId/complete
{
  "clientName": "Living Room Tablet",
  "areaIds": ["area-uuid-1", "area-uuid-2"]
}

// Backend generates client token
const clientToken = generateClientToken();
const hashedToken = hashToken(clientToken);

// Store hashed token in database
db.prepare(`
  INSERT INTO clients (id, name, deviceType, token, areaIds)
  VALUES (?, ?, ?, ?, ?)
`).run(clientId, clientName, deviceType, hashedToken, JSON.stringify(areaIds));

// Return raw token to client (only shown once!)
res.json({ client: {...}, token: clientToken });
```

### Client Token Usage

**WebSocket Authentication:**

```typescript
// Client connects with token in handshake
const socket = io('ws://hasync-server:8099', {
  auth: {
    token: 'client-token-here'
  }
});

// Backend verifies token during connection
socketAuthMiddleware(socket, next) => {
  const token = socket.handshake.auth.token;
  const client = verifyClientToken(token);

  if (client) {
    socket.data.clientId = client.id;
    next(); // Allow connection
  } else {
    next(new Error('Invalid token')); // Reject connection
  }
}
```

**HTTP API Authentication:**

Client tokens can also be used for HTTP API requests:

```
Authorization: Bearer <client-token>
```

---

## JWT Token Management

### Token Structure

**JWT Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**JWT Payload:**
```json
{
  "username": "admin",
  "role": "admin",
  "iat": 1701619200,
  "exp": 1701705600,
  "iss": "hasync-backend",
  "aud": "hasync-client"
}
```

**JWT Signature:**
```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  JWT_SECRET
)
```

### Token Verification Middleware

```typescript
// Backend: index-simple.ts
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'hasync-backend',
      audience: 'hasync-client'
    });

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
};
```

### Token Expiration

| Token Type | Expiration | Renewal |
|-----------|-----------|---------|
| Admin JWT | 24 hours | Must login again |
| Client Token | Never | Revoke and re-pair |

### Token Storage

**Admin JWT Token:**
- **In-Memory:** Zustand state (`useAppStore`)
- **Persistent:** localStorage (`auth_token`)
- **API Client:** Axios instance (`apiClient.accessToken`)
- **WebSocket:** Socket.IO client (`wsClient.accessToken`)

**Client Token:**
- **Client Device:** Secure storage (implementation-specific)
- **Backend Database:** SHA-256 hash (`clients.token` column)

---

## CSRF Protection

### Overview

Cross-Site Request Forgery (CSRF) protection prevents unauthorized state-changing requests from malicious sites.

### Implementation

```typescript
// Backend: index-simple.ts
const csrfMiddleware = csrf({
  cookie: {
    httpOnly: true,
    secure: TLS_ENABLED,
    sameSite: 'strict'
  }
});

const csrfProtection = (req, res, next) => {
  const authHeader = req.get('authorization');

  // Skip CSRF if using Bearer token (JWT authentication)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  // Otherwise, require CSRF token
  csrfMiddleware(req, res, next);
};
```

### Why JWT Skips CSRF

**JWT Authentication is CSRF-Safe because:**

1. **No Automatic Cookie Inclusion:** Browsers don't auto-send Authorization headers
2. **Explicit Token Passing:** Application must explicitly include token in header
3. **SOP Protection:** Same-Origin Policy prevents cross-origin header manipulation

**Session-Based Authentication is CSRF-Vulnerable because:**

1. **Automatic Cookie Inclusion:** Browsers auto-send session cookies
2. **No Explicit Action:** User doesn't need to do anything for cookie to be sent
3. **Cross-Site Requests:** Malicious sites can trigger requests with user's session cookie

### Getting CSRF Token (if needed)

```bash
GET /api/csrf-token

Response:
{
  "csrfToken": "random-token-string"
}

# Include in state-changing requests:
POST /api/areas
X-CSRF-Token: random-token-string
```

**Note:** Currently, all admin interface requests use JWT Bearer authentication, so CSRF tokens are not required.

---

## Security Considerations

### Best Practices

1. **Change Default Password**
   ```yaml
   # config.yaml
   options:
     admin_password: "use-strong-random-password-here"
   ```

2. **Use Strong JWT Secret**
   ```yaml
   # config.yaml
   options:
     jwt_secret: "use-long-random-string-at-least-32-characters"
   ```

3. **Enable TLS in Production**
   ```yaml
   # config.yaml
   options:
     tls_enabled: true
     tls_cert_path: "/ssl/cert.pem"
     tls_key_path: "/ssl/key.pem"
   ```

4. **Revoke Compromised Tokens**
   ```bash
   POST /api/clients/:id/revoke
   Authorization: Bearer <admin-jwt>
   ```

### Known Security Issues

1. **No Password Hashing (TODO)**
   - Admin password stored in plain text in config.yaml
   - Should implement bcrypt/argon2 hashing

2. **Client Tokens Never Expire**
   - Once generated, client tokens remain valid until revoked
   - Consider implementing token rotation

3. **No Rate Limiting on WebSocket**
   - HTTP endpoints have rate limiting
   - WebSocket connections do not (TODO)

---

## Troubleshooting

### Problem: 401 Unauthorized After Login

**Symptoms:**
- Login successful
- Immediately get 401 errors on API requests

**Causes:**
1. Token not set in API client
2. Race condition clearing token
3. Token stored but not restored after refresh

**Solution:**
```typescript
// Check if token is in apiClient
console.log('Token in apiClient:', apiClient.accessToken);

// Check if token is in localStorage
console.log('Token in localStorage:', localStorage.getItem('auth_token'));

// Check if token is in Zustand
console.log('Token in Zustand:', useAppStore.getState().accessToken);

// All three should match!
```

### Problem: 401 After Page Refresh

**Cause:** Token in Zustand/localStorage but not synced to apiClient

**Solution:** Implemented in v1.3.39 - useEffect syncs token automatically

### Problem: CSRF Token Validation Failed

**Cause:** Using CSRF token with JWT Bearer authentication

**Solution:** Remove CSRF token header when using Bearer authentication. Backend automatically skips CSRF for JWT requests.

---

## Version History

- **v1.4.0:** Enhanced pairing UI with countdown timer
- **v1.3.44:** Fixed setAuth() overwriting admin JWT token
- **v1.3.43:** Fixed Settings component using fetch() instead of apiClient
- **v1.3.42:** Restored console logging in production builds
- **v1.3.41:** Added frontend version logging
- **v1.3.40:** Fixed race condition in token sync
- **v1.3.39:** Added token sync after page refresh

---

**Last Updated:** 2025-12-02 (v1.4.0)
