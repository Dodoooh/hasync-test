# Security Validation Checklist v1.3.25
## GitHub Addon - Comprehensive Security Audit

**Version:** 1.3.25
**Date:** 2025-12-02
**Scope:** Critical vulnerability validation for production deployment
**Classification:** CONFIDENTIAL - Security Assessment

---

## Executive Summary

This document provides a comprehensive security validation checklist for the GitHub addon system. It addresses 8 critical vulnerability categories identified during security review and provides actionable test cases, code review guidelines, and compliance verification steps.

**Risk Level:** CRITICAL
**Total Vulnerabilities:** 8 categories
**Compliance Frameworks:** OWASP Top 10, NIST Cybersecurity Framework

---

## 1. PIN Generation Security

### 1.1 Cryptographic Randomness Validation

**Severity:** CRITICAL
**Impact:** Authentication bypass, account takeover

#### Checklist Items

- [ ] **CR-001**: Verify `crypto.randomBytes()` is used (NOT `Math.random()`)
- [ ] **CR-002**: Confirm 6-digit PIN generation range (100000-999999)
- [ ] **CR-003**: Validate statistical randomness distribution
- [ ] **CR-004**: Ensure no predictable patterns in PIN generation
- [ ] **CR-005**: Verify entropy source is cryptographically secure

#### Test Cases

```javascript
// TEST-CR-001: Verify crypto.randomBytes usage
describe('PIN Generation Security', () => {
  test('Should use crypto.randomBytes for PIN generation', () => {
    const generatePIN = require('../src/utils/pin-generator');
    const spy = jest.spyOn(crypto, 'randomBytes');
    generatePIN();
    expect(spy).toHaveBeenCalled();
  });

  test('Should generate 6-digit PINs only', () => {
    for (let i = 0; i < 1000; i++) {
      const pin = generatePIN();
      expect(pin).toBeGreaterThanOrEqual(100000);
      expect(pin).toBeLessThanOrEqual(999999);
    }
  });

  test('Should have uniform distribution', () => {
    const samples = 10000;
    const pins = Array.from({ length: samples }, () => generatePIN());
    const buckets = new Array(10).fill(0);

    pins.forEach(pin => {
      const firstDigit = Math.floor(pin / 100000);
      buckets[firstDigit]++;
    });

    // Chi-square test for uniform distribution
    const expected = samples / 10;
    const chiSquare = buckets.reduce((sum, count) => {
      return sum + Math.pow(count - expected, 2) / expected;
    }, 0);

    // Critical value for 9 degrees of freedom at 95% confidence: 16.919
    expect(chiSquare).toBeLessThan(16.919);
  });
});
```

#### Code Review Guidelines

**Location:** `src/services/pairing.service.ts` or equivalent

```typescript
// ✅ CORRECT IMPLEMENTATION
import { randomBytes } from 'crypto';

function generateSecurePIN(): string {
  // Generate 4 random bytes (32 bits of entropy)
  const buffer = randomBytes(4);
  // Convert to number and constrain to 6-digit range
  const num = buffer.readUInt32BE(0);
  const pin = (num % 900000) + 100000;
  return pin.toString();
}

// ❌ INCORRECT IMPLEMENTATIONS
// NEVER use Math.random()
const badPIN = Math.floor(Math.random() * 900000) + 100000;

// NEVER use Date.now() or timestamps
const terriblePIN = Date.now().toString().slice(-6);

// NEVER use predictable sequences
const awfulPIN = '123456';
```

#### Compliance Verification

- [ ] **OWASP A02:2021** - Cryptographic Failures - COMPLIANT
- [ ] **NIST SP 800-63B** - Digital Identity Guidelines - COMPLIANT
- [ ] **PCI DSS 3.2.1** - Requirement 8.2.3 - COMPLIANT

---

### 1.2 Timing Attack Prevention

**Severity:** HIGH
**Impact:** PIN enumeration through timing analysis

#### Checklist Items

- [ ] **TA-001**: Verify constant-time comparison for PIN verification
- [ ] **TA-002**: Ensure no early-exit conditions leak timing information
- [ ] **TA-003**: Validate database query time is consistent
- [ ] **TA-004**: Confirm no correlation between invalid PIN and response time

#### Test Cases

```javascript
// TEST-TA-001: Timing attack resistance
describe('PIN Timing Attack Prevention', () => {
  test('Should have constant verification time', async () => {
    const validPIN = '123456';
    const invalidPIN = '999999';

    const times = [];

    // Test 100 attempts with valid and invalid PINs
    for (let i = 0; i < 100; i++) {
      const start = process.hrtime.bigint();
      await verifyPIN(i % 2 === 0 ? validPIN : invalidPIN);
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1000000); // Convert to ms
    }

    // Calculate standard deviation
    const mean = times.reduce((a, b) => a + b) / times.length;
    const variance = times.reduce((sum, time) => {
      return sum + Math.pow(time - mean, 2);
    }, 0) / times.length;
    const stdDev = Math.sqrt(variance);

    // Standard deviation should be < 10% of mean
    expect(stdDev / mean).toBeLessThan(0.1);
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import { timingSafeEqual } from 'crypto';

async function verifyPIN(inputPIN: string, storedPIN: string): Promise<boolean> {
  // Convert to buffers for constant-time comparison
  const inputBuffer = Buffer.from(inputPIN);
  const storedBuffer = Buffer.from(storedPIN);

  // Ensure same length to prevent timing leaks
  if (inputBuffer.length !== storedBuffer.length) {
    // Still perform comparison to prevent timing leak
    const dummyBuffer = Buffer.alloc(storedBuffer.length);
    timingSafeEqual(inputBuffer.length >= storedBuffer.length ? inputBuffer : dummyBuffer, storedBuffer);
    return false;
  }

  return timingSafeEqual(inputBuffer, storedBuffer);
}

// ❌ INCORRECT IMPLEMENTATION
async function badVerifyPIN(inputPIN: string, storedPIN: string): Promise<boolean> {
  // Early exit leaks timing information
  if (inputPIN.length !== storedPIN.length) return false;

  // String comparison is NOT constant-time
  return inputPIN === storedPIN;
}
```

---

### 1.3 Single-Use Enforcement

**Severity:** CRITICAL
**Impact:** PIN reuse, unauthorized device pairing

#### Checklist Items

- [ ] **SU-001**: Verify PIN is invalidated after first use (success or failure)
- [ ] **SU-002**: Confirm PIN expiry time (default: 5 minutes)
- [ ] **SU-003**: Validate concurrent PIN verification handling
- [ ] **SU-004**: Ensure database transaction atomicity

#### Test Cases

```javascript
// TEST-SU-001: Single-use enforcement
describe('PIN Single-Use Enforcement', () => {
  test('Should invalidate PIN after successful pairing', async () => {
    const pin = await createPairingRequest();
    await pairDevice(pin, 'device-1');

    // Second attempt should fail
    await expect(pairDevice(pin, 'device-2'))
      .rejects.toThrow('Invalid or expired PIN');
  });

  test('Should invalidate PIN after failed attempt', async () => {
    const pin = await createPairingRequest();
    await pairDevice(pin + '1', 'device-1').catch(() => {});

    // Even with correct PIN, should be invalidated
    await expect(pairDevice(pin, 'device-1'))
      .rejects.toThrow('Invalid or expired PIN');
  });

  test('Should handle concurrent verification attempts', async () => {
    const pin = await createPairingRequest();

    // Attempt to pair two devices simultaneously
    const results = await Promise.allSettled([
      pairDevice(pin, 'device-1'),
      pairDevice(pin, 'device-2')
    ]);

    // Only one should succeed
    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes).toHaveLength(1);
  });

  test('Should expire PIN after timeout', async () => {
    const pin = await createPairingRequest();

    // Fast-forward time 6 minutes
    jest.advanceTimersByTime(6 * 60 * 1000);

    await expect(pairDevice(pin, 'device-1'))
      .rejects.toThrow('Invalid or expired PIN');
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
async function pairDevice(pin: string, deviceInfo: DeviceInfo): Promise<Token> {
  return await db.transaction(async (trx) => {
    // Lock the row for update
    const pairingRequest = await trx('pairing_requests')
      .where({ pin, used: false })
      .where('expires_at', '>', new Date())
      .forUpdate()
      .first();

    if (!pairingRequest) {
      throw new Error('Invalid or expired PIN');
    }

    // Mark as used atomically
    await trx('pairing_requests')
      .where({ id: pairingRequest.id })
      .update({ used: true, used_at: new Date() });

    // Create token
    const token = await createDeviceToken(pairingRequest.user_id, deviceInfo, trx);

    return token;
  });
}

// ❌ INCORRECT IMPLEMENTATION
async function badPairDevice(pin: string, deviceInfo: DeviceInfo): Promise<Token> {
  // NO TRANSACTION - race condition possible
  const pairingRequest = await db('pairing_requests')
    .where({ pin, used: false })
    .first();

  if (!pairingRequest) {
    throw new Error('Invalid PIN');
  }

  // NOT ATOMIC - another request could use the same PIN
  await db('pairing_requests')
    .where({ id: pairingRequest.id })
    .update({ used: true });

  return await createDeviceToken(pairingRequest.user_id, deviceInfo);
}
```

---

## 2. Rate Limiting

### 2.1 PIN Verification Rate Limiting

**Severity:** CRITICAL
**Impact:** Brute-force PIN enumeration

#### Checklist Items

- [ ] **RL-001**: Verify 5 attempts per hour per IP address
- [ ] **RL-002**: Confirm rate limiting persists across server restarts
- [ ] **RL-003**: Validate IP address extraction (handle proxies)
- [ ] **RL-004**: Ensure rate limit bypass detection

#### Test Cases

```javascript
// TEST-RL-001: PIN verification rate limiting
describe('PIN Verification Rate Limiting', () => {
  test('Should allow 5 attempts per hour', async () => {
    const ip = '192.168.1.100';
    const pin = '123456';

    // First 5 attempts should be allowed
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post('/api/pairing/verify')
        .set('X-Forwarded-For', ip)
        .send({ pin });

      expect(response.status).not.toBe(429);
    }

    // 6th attempt should be rate limited
    const response = await request(app)
      .post('/api/pairing/verify')
      .set('X-Forwarded-For', ip)
      .send({ pin });

    expect(response.status).toBe(429);
    expect(response.body.error).toContain('Too many attempts');
  });

  test('Should reset after 1 hour', async () => {
    const ip = '192.168.1.101';

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/pairing/verify')
        .set('X-Forwarded-For', ip)
        .send({ pin: '123456' });
    }

    // Fast-forward 1 hour
    jest.advanceTimersByTime(60 * 60 * 1000);

    // Should be allowed again
    const response = await request(app)
      .post('/api/pairing/verify')
      .set('X-Forwarded-For', ip)
      .send({ pin: '123456' });

    expect(response.status).not.toBe(429);
  });

  test('Should handle X-Forwarded-For correctly', async () => {
    const realIP = '10.0.0.1';
    const proxyChain = `${realIP}, 192.168.1.1, 172.16.0.1`;

    // Rate limit should apply to real IP, not proxy
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/pairing/verify')
        .set('X-Forwarded-For', proxyChain)
        .send({ pin: '123456' });
    }

    // 6th attempt should be rate limited
    const response = await request(app)
      .post('/api/pairing/verify')
      .set('X-Forwarded-For', proxyChain)
      .send({ pin: '123456' });

    expect(response.status).toBe(429);
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL
});

const pinVerificationLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:pin:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts
  message: 'Too many PIN verification attempts. Please try again in 1 hour.',
  standardHeaders: true,
  legacyHeaders: false,
  // Extract real IP from X-Forwarded-For
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip;
  },
  skip: (req) => {
    // Don't rate limit internal health checks
    return req.path === '/health';
  }
});

// Apply to PIN verification endpoint
app.post('/api/pairing/verify', pinVerificationLimiter, verifyPINHandler);

// ❌ INCORRECT IMPLEMENTATION
const badLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  // NO PERSISTENT STORE - resets on server restart
  // Uses memory store by default
});

// ❌ INCORRECT IP EXTRACTION
const terribleLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    // WRONG - trusts last proxy IP
    return req.ip;
  }
});
```

---

### 2.2 Pairing Endpoint Rate Limiting

**Severity:** HIGH
**Impact:** DoS, resource exhaustion

#### Checklist Items

- [ ] **PE-001**: Verify pairing request creation limited (10/hour per IP)
- [ ] **PE-002**: Confirm pairing completion limited (20/hour per IP)
- [ ] **PE-003**: Validate global rate limiting (1000 req/min across all IPs)
- [ ] **PE-004**: Ensure database connection pool sizing

#### Test Cases

```javascript
// TEST-PE-001: Pairing endpoint rate limiting
describe('Pairing Endpoint Rate Limiting', () => {
  test('Should limit pairing request creation', async () => {
    const ip = '192.168.1.102';

    // 10 requests should succeed
    for (let i = 0; i < 10; i++) {
      const response = await request(app)
        .post('/api/pairing/request')
        .set('X-Forwarded-For', ip)
        .send({});

      expect(response.status).toBe(201);
    }

    // 11th should be rate limited
    const response = await request(app)
      .post('/api/pairing/request')
      .set('X-Forwarded-For', ip)
      .send({});

    expect(response.status).toBe(429);
  });

  test('Should enforce global rate limit', async () => {
    // Simulate 1001 requests from different IPs
    const requests = Array.from({ length: 1001 }, (_, i) =>
      request(app)
        .post('/api/pairing/request')
        .set('X-Forwarded-For', `192.168.1.${i % 255}`)
        .send({})
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);

    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
const pairingRequestLimiter = rateLimit({
  store: new RedisStore({ client: redisClient, prefix: 'rl:pair:req:' }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many pairing requests. Please try again later.'
});

const pairingCompleteLimiter = rateLimit({
  store: new RedisStore({ client: redisClient, prefix: 'rl:pair:complete:' }),
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many pairing attempts. Please try again later.'
});

const globalLimiter = rateLimit({
  store: new RedisStore({ client: redisClient, prefix: 'rl:global:' }),
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  message: 'Service temporarily unavailable. Please try again later.',
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

// Apply limiters in order
app.use('/api', globalLimiter);
app.post('/api/pairing/request', pairingRequestLimiter, createPairingRequestHandler);
app.post('/api/pairing/verify', pairingCompleteLimiter, verifyPINHandler);
```

---

## 3. Authentication & Authorization

### 3.1 Client Endpoint Authentication

**Severity:** CRITICAL
**Impact:** Unauthorized access to client data and operations

#### Checklist Items

- [ ] **CE-001**: Verify all `/api/client/*` endpoints require `authenticate` middleware
- [ ] **CE-002**: Confirm token validation checks database hash
- [ ] **CE-003**: Validate token expiry enforcement
- [ ] **CE-004**: Ensure revoked tokens are rejected

#### Test Cases

```javascript
// TEST-CE-001: Client endpoint authentication
describe('Client Endpoint Authentication', () => {
  test('Should reject requests without token', async () => {
    const response = await request(app)
      .get('/api/client/devices')
      .send();

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Authentication required');
  });

  test('Should reject invalid token', async () => {
    const response = await request(app)
      .get('/api/client/devices')
      .set('Authorization', 'Bearer invalid-token-12345')
      .send();

    expect(response.status).toBe(401);
  });

  test('Should reject expired token', async () => {
    const token = await createDeviceToken({ expiresIn: '-1d' });

    const response = await request(app)
      .get('/api/client/devices')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('expired');
  });

  test('Should reject revoked token', async () => {
    const token = await createDeviceToken({});
    await revokeToken(token);

    const response = await request(app)
      .get('/api/client/devices')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('revoked');
  });

  test('Should accept valid token', async () => {
    const token = await createDeviceToken({});

    const response = await request(app)
      .get('/api/client/devices')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(response.status).toBe(200);
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import { createHash } from 'crypto';

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);

  // Hash the token for database lookup
  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Verify token exists and is valid
  const deviceToken = await db('device_tokens')
    .where({ token_hash: tokenHash, revoked: false })
    .where('expires_at', '>', new Date())
    .first();

  if (!deviceToken) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach user/device info to request
  req.user = { id: deviceToken.user_id, deviceId: deviceToken.device_id };

  next();
}

// Apply to all client routes
app.use('/api/client', authenticate);

// ❌ INCORRECT IMPLEMENTATION
async function badAuthenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  // WRONG - stores token in plain text
  const deviceToken = await db('device_tokens')
    .where({ token: token }) // Should use token_hash
    .first();

  // WRONG - doesn't check expiry or revocation
  if (deviceToken) {
    req.user = { id: deviceToken.user_id };
    next();
  } else {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

---

### 3.2 Admin Endpoint Authorization

**Severity:** CRITICAL
**Impact:** Privilege escalation, unauthorized admin access

#### Checklist Items

- [ ] **AE-001**: Verify all `/api/admin/*` endpoints check `role === 'admin'`
- [ ] **AE-002**: Confirm admin session authentication
- [ ] **AE-003**: Validate CSRF protection on admin actions
- [ ] **AE-004**: Ensure audit logging for admin operations

#### Test Cases

```javascript
// TEST-AE-001: Admin endpoint authorization
describe('Admin Endpoint Authorization', () => {
  test('Should reject non-admin users', async () => {
    const userSession = await createUserSession({ role: 'user' });

    const response = await request(app)
      .get('/api/admin/devices')
      .set('Cookie', userSession.cookie)
      .send();

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Admin access required');
  });

  test('Should accept admin users', async () => {
    const adminSession = await createUserSession({ role: 'admin' });

    const response = await request(app)
      .get('/api/admin/devices')
      .set('Cookie', adminSession.cookie)
      .send();

    expect(response.status).toBe(200);
  });

  test('Should log admin operations', async () => {
    const adminSession = await createUserSession({ role: 'admin' });

    await request(app)
      .delete('/api/admin/devices/123')
      .set('Cookie', adminSession.cookie)
      .send();

    const auditLog = await db('audit_logs')
      .where({ action: 'device_deleted', device_id: '123' })
      .first();

    expect(auditLog).toBeDefined();
    expect(auditLog.user_id).toBe(adminSession.userId);
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.session.user.role !== 'admin') {
    // Log unauthorized access attempt
    logger.warn('Unauthorized admin access attempt', {
      userId: req.session.user.id,
      ip: req.ip,
      path: req.path
    });

    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

// Apply to all admin routes
app.use('/api/admin', requireAdmin);

// ❌ INCORRECT IMPLEMENTATION
function badRequireAdmin(req: Request, res: Response, next: NextFunction) {
  // WRONG - trusts client-supplied role claim
  if (req.body.isAdmin || req.query.admin) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
}
```

---

## 4. CSRF Protection

### 4.1 CSRF Token Implementation

**Severity:** HIGH
**Impact:** Cross-site request forgery, unauthorized state changes

#### Checklist Items

- [ ] **CS-001**: Verify all POST/PUT/PATCH/DELETE have `csrfProtection` middleware
- [ ] **CS-002**: Confirm CSRF token generation on session creation
- [ ] **CS-003**: Validate double-submit cookie pattern
- [ ] **CS-004**: Ensure SameSite cookie attribute is set

#### Test Cases

```javascript
// TEST-CS-001: CSRF protection
describe('CSRF Protection', () => {
  test('Should reject requests without CSRF token', async () => {
    const session = await createUserSession({});

    const response = await request(app)
      .post('/api/pairing/request')
      .set('Cookie', session.cookie)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('CSRF');
  });

  test('Should reject requests with invalid CSRF token', async () => {
    const session = await createUserSession({});

    const response = await request(app)
      .post('/api/pairing/request')
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', 'invalid-token')
      .send({});

    expect(response.status).toBe(403);
  });

  test('Should accept requests with valid CSRF token', async () => {
    const session = await createUserSession({});
    const csrfToken = session.csrfToken;

    const response = await request(app)
      .post('/api/pairing/request')
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', csrfToken)
      .send({});

    expect(response.status).not.toBe(403);
  });

  test('Should set SameSite cookie attribute', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password' });

    const setCookie = response.headers['set-cookie'];
    expect(setCookie.some(c => c.includes('SameSite=Strict'))).toBe(true);
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import csrf from 'csurf';
import cookieParser from 'cookie-parser';

app.use(cookieParser());

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// GET endpoint to retrieve CSRF token
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Apply to state-changing endpoints
app.post('/api/pairing/request', csrfProtection, createPairingRequestHandler);
app.delete('/api/admin/devices/:id', csrfProtection, deleteDeviceHandler);
app.put('/api/client/areas/:id', csrfProtection, updateAreaHandler);

// ❌ INCORRECT IMPLEMENTATION
// NO CSRF PROTECTION
app.post('/api/pairing/request', createPairingRequestHandler);

// OR WRONG CONFIGURATION
const badCsrf = csrf({
  cookie: {
    httpOnly: false, // WRONG - allows JavaScript access
    secure: false,   // WRONG - transmits over HTTP
    sameSite: 'none' // WRONG - allows cross-site requests
  }
});
```

---

## 5. Token Security

### 5.1 Token Storage and Hashing

**Severity:** CRITICAL
**Impact:** Token theft, database compromise

#### Checklist Items

- [ ] **TS-001**: Verify tokens stored as SHA-256 hash only
- [ ] **TS-002**: Confirm plain-text tokens never logged
- [ ] **TS-003**: Validate token generation uses crypto.randomBytes
- [ ] **TS-004**: Ensure minimum token entropy (256 bits)

#### Test Cases

```javascript
// TEST-TS-001: Token storage security
describe('Token Storage Security', () => {
  test('Should store token as SHA-256 hash', async () => {
    const token = await createDeviceToken({});

    const dbToken = await db('device_tokens')
      .orderBy('created_at', 'desc')
      .first();

    // Token should be hashed
    expect(dbToken.token_hash).toBeDefined();
    expect(dbToken.token_hash).toHaveLength(64); // SHA-256 hex

    // Plain-text token should NOT be in database
    expect(dbToken.token).toBeUndefined();
  });

  test('Should generate tokens with sufficient entropy', async () => {
    const tokens = new Set();

    // Generate 1000 tokens
    for (let i = 0; i < 1000; i++) {
      const token = await createDeviceToken({});
      tokens.add(token);
    }

    // All tokens should be unique
    expect(tokens.size).toBe(1000);

    // Tokens should be at least 32 bytes (256 bits)
    const tokenArray = Array.from(tokens);
    tokenArray.forEach(token => {
      const buffer = Buffer.from(token, 'base64');
      expect(buffer.length).toBeGreaterThanOrEqual(32);
    });
  });

  test('Should not log plain-text tokens', async () => {
    const logSpy = jest.spyOn(console, 'log');
    const errorSpy = jest.spyOn(console, 'error');

    const token = await createDeviceToken({});

    // Check that token is not in any log output
    const allLogs = [
      ...logSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat()
    ].join(' ');

    expect(allLogs).not.toContain(token);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import { randomBytes, createHash } from 'crypto';

async function createDeviceToken(userId: number, deviceInfo: DeviceInfo): Promise<string> {
  // Generate 32 bytes (256 bits) of random data
  const tokenBuffer = randomBytes(32);
  const token = tokenBuffer.toString('base64url');

  // Hash for storage
  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Store only the hash
  await db('device_tokens').insert({
    user_id: userId,
    device_id: deviceInfo.id,
    token_hash: tokenHash, // Store hash only
    expires_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // 10 years
    created_at: new Date()
  });

  // Log creation without token value
  logger.info('Device token created', {
    userId,
    deviceId: deviceInfo.id,
    tokenHash: tokenHash.substring(0, 8) + '...' // Log only prefix
  });

  // Return plain-text token ONCE (user must save it)
  return token;
}

// ❌ INCORRECT IMPLEMENTATION
async function badCreateDeviceToken(userId: number, deviceInfo: DeviceInfo): Promise<string> {
  // WRONG - uses Math.random()
  const token = Math.random().toString(36).substring(2);

  // WRONG - stores plain-text token
  await db('device_tokens').insert({
    user_id: userId,
    token: token, // NEVER store plain-text!
    created_at: new Date()
  });

  // WRONG - logs plain-text token
  console.log('Created token:', token);

  return token;
}
```

---

### 5.2 Token Expiry and Revocation

**Severity:** HIGH
**Impact:** Indefinite access, zombie tokens

#### Checklist Items

- [ ] **TE-001**: Verify 10-year default expiry enforced
- [ ] **TE-002**: Confirm revocation immediately invalidates token
- [ ] **TE-003**: Validate WebSocket disconnection on revocation
- [ ] **TE-004**: Ensure cleanup job removes expired tokens

#### Test Cases

```javascript
// TEST-TE-001: Token expiry and revocation
describe('Token Expiry and Revocation', () => {
  test('Should enforce 10-year expiry', async () => {
    const token = await createDeviceToken({});

    const dbToken = await db('device_tokens')
      .where({ token_hash: hashToken(token) })
      .first();

    const expiryDate = new Date(dbToken.expires_at);
    const expectedExpiry = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

    // Allow 1 minute variance
    expect(Math.abs(expiryDate.getTime() - expectedExpiry.getTime()))
      .toBeLessThan(60 * 1000);
  });

  test('Should revoke token and disconnect WebSocket', async () => {
    const token = await createDeviceToken({});
    const ws = await connectWebSocket(token);

    // Revoke token
    await revokeToken(token);

    // WebSocket should be disconnected
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(ws.readyState).toBe(WebSocket.CLOSED);

    // Token should be marked as revoked
    const dbToken = await db('device_tokens')
      .where({ token_hash: hashToken(token) })
      .first();

    expect(dbToken.revoked).toBe(true);
  });

  test('Should clean up expired tokens', async () => {
    // Create expired token
    await db('device_tokens').insert({
      user_id: 1,
      device_id: 'test-device',
      token_hash: hashToken('expired-token'),
      expires_at: new Date(Date.now() - 1000),
      created_at: new Date()
    });

    // Run cleanup job
    await cleanupExpiredTokens();

    // Expired token should be deleted
    const expiredToken = await db('device_tokens')
      .where({ token_hash: hashToken('expired-token') })
      .first();

    expect(expiredToken).toBeUndefined();
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
async function revokeToken(tokenHash: string, userId: number): Promise<void> {
  await db.transaction(async (trx) => {
    // Mark as revoked
    await trx('device_tokens')
      .where({ token_hash: tokenHash, user_id: userId })
      .update({ revoked: true, revoked_at: new Date() });

    // Disconnect associated WebSocket
    const connectedClients = wsServer.clients;
    connectedClients.forEach(client => {
      if (client.tokenHash === tokenHash) {
        client.close(1000, 'Token revoked');
      }
    });

    // Audit log
    await trx('audit_logs').insert({
      user_id: userId,
      action: 'token_revoked',
      details: { token_hash_prefix: tokenHash.substring(0, 8) },
      created_at: new Date()
    });
  });
}

// Cleanup job (run daily via cron)
async function cleanupExpiredTokens(): Promise<void> {
  const deleted = await db('device_tokens')
    .where('expires_at', '<', new Date())
    .orWhere('revoked', true)
    .delete();

  logger.info('Cleaned up expired tokens', { count: deleted });
}

// ❌ INCORRECT IMPLEMENTATION
async function badRevokeToken(tokenHash: string): Promise<void> {
  // WRONG - doesn't disconnect WebSocket
  await db('device_tokens')
    .where({ token_hash: tokenHash })
    .delete(); // WRONG - should mark revoked, not delete
}
```

---

### 5.3 Production Secret Management

**Severity:** CRITICAL
**Impact:** Default credentials, unauthorized access

#### Checklist Items

- [ ] **PS-001**: Verify no default secrets in production
- [ ] **PS-002**: Confirm environment variable validation on startup
- [ ] **PS-003**: Validate secret rotation mechanism
- [ ] **PS-004**: Ensure secrets not committed to git

#### Test Cases

```javascript
// TEST-PS-001: Production secret management
describe('Production Secret Management', () => {
  test('Should reject default session secret in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'default-secret';

    await expect(async () => {
      await initializeApp();
    }).rejects.toThrow('Default session secret not allowed in production');
  });

  test('Should require strong session secret', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'short';

    await expect(async () => {
      await initializeApp();
    }).rejects.toThrow('Session secret must be at least 32 characters');
  });

  test('Should validate required environment variables', async () => {
    delete process.env.DATABASE_URL;

    await expect(async () => {
      await initializeApp();
    }).rejects.toThrow('DATABASE_URL is required');
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import { config } from 'dotenv';
config();

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'REDIS_URL',
  'JWT_SECRET'
];

const DEFAULT_SECRETS = [
  'default-secret',
  'change-me',
  'secret',
  '123456'
];

function validateEnvironment(): void {
  const missing = REQUIRED_ENV_VARS.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Production checks
  if (process.env.NODE_ENV === 'production') {
    // Check for default secrets
    const sessionSecret = process.env.SESSION_SECRET!;
    if (DEFAULT_SECRETS.includes(sessionSecret)) {
      throw new Error('Default session secret not allowed in production');
    }

    // Require minimum secret length
    if (sessionSecret.length < 32) {
      throw new Error('Session secret must be at least 32 characters');
    }

    // Ensure HTTPS in production
    if (!process.env.FORCE_HTTPS && process.env.NODE_ENV === 'production') {
      logger.warn('FORCE_HTTPS not enabled in production');
    }
  }
}

// Run on startup
validateEnvironment();

// ❌ INCORRECT IMPLEMENTATION
const sessionSecret = process.env.SESSION_SECRET || 'default-secret'; // WRONG!

// .env file (should be in .gitignore)
SESSION_SECRET=change-me-in-production // WRONG - committed to git
```

---

## 6. Input Validation

### 6.1 PIN Validation

**Severity:** MEDIUM
**Impact:** Invalid data processing, potential injection

#### Checklist Items

- [ ] **PV-001**: Verify PIN is exactly 6 digits
- [ ] **PV-002**: Confirm no leading zeros stripped
- [ ] **PV-003**: Validate input sanitization
- [ ] **PV-004**: Ensure rejection of non-numeric input

#### Test Cases

```javascript
// TEST-PV-001: PIN validation
describe('PIN Validation', () => {
  test('Should accept valid 6-digit PIN', async () => {
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({ pin: '123456' });

    expect(response.status).not.toBe(400);
  });

  test('Should reject PIN with letters', async () => {
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({ pin: '12345a' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('PIN must be 6 digits');
  });

  test('Should reject PIN with special characters', async () => {
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({ pin: '12345!' });

    expect(response.status).toBe(400);
  });

  test('Should reject PIN shorter than 6 digits', async () => {
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({ pin: '12345' });

    expect(response.status).toBe(400);
  });

  test('Should reject PIN longer than 6 digits', async () => {
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({ pin: '1234567' });

    expect(response.status).toBe(400);
  });

  test('Should preserve leading zeros', async () => {
    const pin = '012345';
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({ pin });

    // Verify PIN is processed as string, not number
    expect(response.status).not.toBe(400);
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import { z } from 'zod';

const PINSchema = z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits');

function validatePIN(pin: unknown): string {
  try {
    return PINSchema.parse(pin);
  } catch (error) {
    throw new Error('Invalid PIN format');
  }
}

// Use in route handler
app.post('/api/pairing/verify', async (req, res) => {
  try {
    const pin = validatePIN(req.body.pin);
    // Process PIN...
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

// ❌ INCORRECT IMPLEMENTATION
function badValidatePIN(pin: any): string {
  // WRONG - converts to number (strips leading zeros)
  const pinNumber = parseInt(pin);
  if (pinNumber >= 100000 && pinNumber <= 999999) {
    return pinNumber.toString(); // WRONG - '012345' becomes '12345'
  }
  throw new Error('Invalid PIN');
}

// WRONG - allows SQL injection
app.post('/api/pairing/verify', async (req, res) => {
  const pin = req.body.pin; // No validation
  const result = await db.raw(`SELECT * FROM pairing_requests WHERE pin = '${pin}'`); // SQL INJECTION!
});
```

---

### 6.2 Device Name and Type Validation

**Severity:** MEDIUM
**Impact:** XSS, injection attacks

#### Checklist Items

- [ ] **DV-001**: Verify device name length limit (100 chars)
- [ ] **DV-002**: Confirm device name sanitization (no HTML/scripts)
- [ ] **DV-003**: Validate device type whitelist
- [ ] **DV-004**: Ensure special character handling

#### Test Cases

```javascript
// TEST-DV-001: Device validation
describe('Device Name and Type Validation', () => {
  test('Should accept valid device name', async () => {
    const token = await createDeviceToken({});
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({
        pin: '123456',
        deviceName: 'My iPhone 15',
        deviceType: 'mobile'
      });

    expect(response.status).toBe(200);
  });

  test('Should reject device name exceeding 100 chars', async () => {
    const longName = 'a'.repeat(101);
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({
        pin: '123456',
        deviceName: longName,
        deviceType: 'mobile'
      });

    expect(response.status).toBe(400);
  });

  test('Should sanitize HTML in device name', async () => {
    const xssName = '<script>alert("XSS")</script>';
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({
        pin: '123456',
        deviceName: xssName,
        deviceType: 'mobile'
      });

    const device = await db('devices')
      .orderBy('created_at', 'desc')
      .first();

    // Device name should be sanitized
    expect(device.name).not.toContain('<script>');
    expect(device.name).not.toContain('alert');
  });

  test('Should reject invalid device type', async () => {
    const response = await request(app)
      .post('/api/pairing/verify')
      .send({
        pin: '123456',
        deviceName: 'My Device',
        deviceType: 'invalid-type'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('device type');
  });

  test('Should accept valid device types', async () => {
    const validTypes = ['mobile', 'desktop', 'tablet', 'other'];

    for (const type of validTypes) {
      const response = await request(app)
        .post('/api/pairing/verify')
        .send({
          pin: '123456',
          deviceName: 'Test Device',
          deviceType: type
        });

      expect(response.status).not.toBe(400);
    }
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';

const DEVICE_TYPES = ['mobile', 'desktop', 'tablet', 'other'] as const;

const DeviceInfoSchema = z.object({
  name: z.string()
    .min(1, 'Device name is required')
    .max(100, 'Device name must be less than 100 characters')
    .transform(name => sanitizeHtml(name, {
      allowedTags: [],
      allowedAttributes: {}
    })),
  type: z.enum(DEVICE_TYPES, {
    errorMap: () => ({ message: 'Invalid device type' })
  }),
  model: z.string().max(100).optional(),
  os: z.string().max(50).optional()
});

function validateDeviceInfo(data: unknown): DeviceInfo {
  return DeviceInfoSchema.parse(data);
}

// ❌ INCORRECT IMPLEMENTATION
function badValidateDeviceInfo(data: any): DeviceInfo {
  // WRONG - no validation or sanitization
  return {
    name: data.deviceName, // XSS vulnerability
    type: data.deviceType, // No type checking
    model: data.model
  };
}
```

---

### 6.3 Area ID Validation

**Severity:** MEDIUM
**Impact:** Unauthorized area access

#### Checklist Items

- [ ] **AV-001**: Verify area IDs are valid UUIDs or integers
- [ ] **AV-002**: Confirm area ownership validation
- [ ] **AV-003**: Validate area existence before operations
- [ ] **AV-004**: Ensure injection prevention

#### Test Cases

```javascript
// TEST-AV-001: Area validation
describe('Area ID Validation', () => {
  test('Should reject invalid area ID format', async () => {
    const token = await createDeviceToken({});
    const response = await request(app)
      .put('/api/client/areas/invalid-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Living Room' });

    expect(response.status).toBe(400);
  });

  test('Should reject non-existent area', async () => {
    const token = await createDeviceToken({});
    const response = await request(app)
      .put('/api/client/areas/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Living Room' });

    expect(response.status).toBe(404);
  });

  test('Should reject area not owned by user', async () => {
    const token1 = await createDeviceToken({ userId: 1 });
    const area = await createArea({ userId: 2 });

    const response = await request(app)
      .put(`/api/client/areas/${area.id}`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'Hacked Room' });

    expect(response.status).toBe(403);
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
const AreaIdSchema = z.union([
  z.string().uuid(),
  z.number().int().positive()
]);

async function validateAreaAccess(areaId: unknown, userId: number): Promise<Area> {
  const validatedId = AreaIdSchema.parse(areaId);

  const area = await db('areas')
    .where({ id: validatedId, user_id: userId })
    .first();

  if (!area) {
    throw new Error('Area not found or access denied');
  }

  return area;
}

// Use in route handler
app.put('/api/client/areas/:id', authenticate, async (req, res) => {
  try {
    const area = await validateAreaAccess(req.params.id, req.user.id);
    // Update area...
  } catch (error) {
    return res.status(403).json({ error: error.message });
  }
});

// ❌ INCORRECT IMPLEMENTATION
app.put('/api/client/areas/:id', async (req, res) => {
  // WRONG - no validation or ownership check
  await db('areas')
    .where({ id: req.params.id })
    .update(req.body); // Any user can update any area!
});
```

---

## 7. WebSocket Security

### 7.1 Client WebSocket Authentication

**Severity:** CRITICAL
**Impact:** Unauthorized event streaming, data leakage

#### Checklist Items

- [ ] **WS-001**: Verify WebSocket authentication on connection
- [ ] **WS-002**: Confirm token validation before upgrade
- [ ] **WS-003**: Validate connection rate limiting
- [ ] **WS-004**: Ensure automatic disconnection on token revocation

#### Test Cases

```javascript
// TEST-WS-001: WebSocket authentication
describe('WebSocket Authentication', () => {
  test('Should reject connection without token', async () => {
    const ws = new WebSocket('ws://localhost:3000/api/client/events');

    await new Promise((resolve) => {
      ws.on('close', (code) => {
        expect(code).toBe(1008); // Policy violation
        resolve();
      });
    });
  });

  test('Should reject connection with invalid token', async () => {
    const ws = new WebSocket('ws://localhost:3000/api/client/events?token=invalid');

    await new Promise((resolve) => {
      ws.on('close', (code) => {
        expect(code).toBe(1008);
        resolve();
      });
    });
  });

  test('Should accept connection with valid token', async () => {
    const token = await createDeviceToken({});
    const ws = new WebSocket(`ws://localhost:3000/api/client/events?token=${token}`);

    await new Promise((resolve) => {
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        resolve();
      });
    });
  });

  test('Should disconnect on token revocation', async () => {
    const token = await createDeviceToken({});
    const ws = new WebSocket(`ws://localhost:3000/api/client/events?token=${token}`);

    await new Promise((resolve) => {
      ws.on('open', async () => {
        // Revoke token
        await revokeToken(token);

        // WebSocket should disconnect
        ws.on('close', () => {
          resolve();
        });
      });
    });
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import { WebSocketServer, WebSocket } from 'ws';
import { createHash } from 'crypto';

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url, 'ws://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Validate token
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const deviceToken = await db('device_tokens')
    .where({ token_hash: tokenHash, revoked: false })
    .where('expires_at', '>', new Date())
    .first();

  if (!deviceToken) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.userId = deviceToken.user_id;
    ws.deviceId = deviceToken.device_id;
    ws.tokenHash = tokenHash;
    wss.emit('connection', ws, request);
  });
});

// ❌ INCORRECT IMPLEMENTATION
wss.on('connection', (ws, request) => {
  // WRONG - no authentication!
  ws.on('message', (data) => {
    // Anyone can connect and receive events
  });
});
```

---

### 7.2 Area-Based Event Filtering

**Severity:** HIGH
**Impact:** Information disclosure, privacy violation

#### Checklist Items

- [ ] **EF-001**: Verify events filtered by user's areas
- [ ] **EF-002**: Confirm no cross-user event leakage
- [ ] **EF-003**: Validate area subscription management
- [ ] **EF-004**: Ensure efficient event routing

#### Test Cases

```javascript
// TEST-EF-001: Event filtering
describe('Area-Based Event Filtering', () => {
  test('Should only receive events for owned areas', async () => {
    const user1Token = await createDeviceToken({ userId: 1 });
    const user2Token = await createDeviceToken({ userId: 2 });

    const ws1 = await connectWebSocket(user1Token);
    const ws2 = await connectWebSocket(user2Token);

    const user1Events = [];
    const user2Events = [];

    ws1.on('message', (data) => user1Events.push(JSON.parse(data)));
    ws2.on('message', (data) => user2Events.push(JSON.parse(data)));

    // Trigger event in user1's area
    await triggerEvent({ userId: 1, area: 'living-room', type: 'device.updated' });

    await new Promise(resolve => setTimeout(resolve, 500));

    // User 1 should receive event
    expect(user1Events.length).toBeGreaterThan(0);

    // User 2 should NOT receive event
    expect(user2Events.length).toBe(0);
  });

  test('Should support area subscription filtering', async () => {
    const token = await createDeviceToken({});
    const ws = await connectWebSocket(token);

    const events = [];
    ws.on('message', (data) => events.push(JSON.parse(data)));

    // Subscribe to specific area
    ws.send(JSON.stringify({
      type: 'subscribe',
      areas: ['living-room']
    }));

    // Trigger events in different areas
    await triggerEvent({ area: 'living-room', type: 'device.updated' });
    await triggerEvent({ area: 'bedroom', type: 'device.updated' });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Should only receive living-room events
    const livingRoomEvents = events.filter(e => e.area === 'living-room');
    const bedroomEvents = events.filter(e => e.area === 'bedroom');

    expect(livingRoomEvents.length).toBeGreaterThan(0);
    expect(bedroomEvents.length).toBe(0);
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
wss.on('connection', async (ws: AuthenticatedWebSocket) => {
  // Load user's areas
  const userAreas = await db('areas')
    .where({ user_id: ws.userId })
    .select('id');

  ws.subscribedAreas = new Set(userAreas.map(a => a.id));

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());

    if (message.type === 'subscribe') {
      // Validate areas belong to user
      const validAreas = message.areas.filter(areaId =>
        ws.subscribedAreas.has(areaId)
      );
      ws.subscribedAreas = new Set(validAreas);
    }
  });
});

// Event broadcasting
function broadcastEvent(event: Event) {
  wss.clients.forEach((client: AuthenticatedWebSocket) => {
    // Filter by area subscription
    if (client.subscribedAreas.has(event.area_id)) {
      client.send(JSON.stringify(event));
    }
  });
}

// ❌ INCORRECT IMPLEMENTATION
wss.on('connection', (ws) => {
  // WRONG - no area filtering!
  ws.on('message', (data) => {
    // Broadcast to ALL clients
    wss.clients.forEach(client => {
      client.send(data); // LEAKS DATA BETWEEN USERS!
    });
  });
});
```

---

## 8. Database Security

### 8.1 SQL Injection Prevention

**Severity:** CRITICAL
**Impact:** Database compromise, data theft

#### Checklist Items

- [ ] **SQL-001**: Verify all queries use prepared statements
- [ ] **SQL-002**: Confirm no string concatenation in queries
- [ ] **SQL-003**: Validate query builder usage (Knex.js)
- [ ] **SQL-004**: Ensure no raw SQL with user input

#### Test Cases

```javascript
// TEST-SQL-001: SQL injection prevention
describe('SQL Injection Prevention', () => {
  test('Should prevent SQL injection in PIN verification', async () => {
    const maliciousPin = "' OR '1'='1";

    const response = await request(app)
      .post('/api/pairing/verify')
      .send({ pin: maliciousPin });

    // Should not authenticate
    expect(response.status).toBe(400);

    // Should not execute malicious SQL
    const allPairings = await db('pairing_requests').count();
    expect(allPairings[0].count).toBeDefined();
  });

  test('Should prevent SQL injection in device search', async () => {
    const token = await createDeviceToken({});
    const maliciousQuery = "'; DROP TABLE devices; --";

    const response = await request(app)
      .get('/api/client/devices')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: maliciousQuery });

    // Table should still exist
    const devices = await db('devices').count();
    expect(devices[0].count).toBeDefined();
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION (Using Knex.js)
import { Knex } from 'knex';

async function findPairingRequest(pin: string): Promise<PairingRequest | null> {
  // Parameterized query - safe from SQL injection
  return await db('pairing_requests')
    .where({ pin })
    .where('expires_at', '>', new Date())
    .first();
}

async function searchDevices(userId: number, searchTerm: string): Promise<Device[]> {
  // Query builder with parameters - safe
  return await db('devices')
    .where({ user_id: userId })
    .where('name', 'like', `%${searchTerm}%`)
    .select('*');
}

// ❌ INCORRECT IMPLEMENTATION
async function badFindPairingRequest(pin: string): Promise<any> {
  // SQL INJECTION VULNERABILITY!
  const query = `SELECT * FROM pairing_requests WHERE pin = '${pin}'`;
  return await db.raw(query);
}

async function terribleSearchDevices(userId: number, search: string): Promise<any> {
  // SQL INJECTION!
  return await db.raw(`
    SELECT * FROM devices
    WHERE user_id = ${userId}
    AND name LIKE '%${search}%'
  `);
}
```

---

### 8.2 Token Hash Storage

**Severity:** CRITICAL
**Impact:** Mass credential compromise

#### Checklist Items

- [ ] **TH-001**: Verify tokens stored as SHA-256 hash
- [ ] **TH-002**: Confirm no plain-text tokens in database
- [ ] **TH-003**: Validate hash collision handling
- [ ] **TH-004**: Ensure database encryption at rest

#### Test Cases

```javascript
// TEST-TH-001: Token hash storage
describe('Token Hash Storage', () => {
  test('Should never store plain-text tokens', async () => {
    const token = await createDeviceToken({});

    // Search entire database for plain-text token
    const tables = ['device_tokens', 'audit_logs', 'sessions'];

    for (const table of tables) {
      const rows = await db(table).select('*');
      const jsonData = JSON.stringify(rows);

      // Token should NOT appear in plain text
      expect(jsonData).not.toContain(token);
    }
  });

  test('Should store SHA-256 hash only', async () => {
    const token = await createDeviceToken({});
    const expectedHash = createHash('sha256').update(token).digest('hex');

    const dbToken = await db('device_tokens')
      .where({ token_hash: expectedHash })
      .first();

    expect(dbToken).toBeDefined();
    expect(dbToken.token_hash).toBe(expectedHash);
    expect(dbToken.token).toBeUndefined();
  });

  test('Should handle hash collisions', async () => {
    // While astronomically unlikely, handle collision gracefully
    const token1 = await createDeviceToken({ userId: 1 });
    const token2 = await createDeviceToken({ userId: 1 });

    // Tokens should be different
    expect(token1).not.toBe(token2);

    // Hashes should be different
    const hash1 = createHash('sha256').update(token1).digest('hex');
    const hash2 = createHash('sha256').update(token2).digest('hex');
    expect(hash1).not.toBe(hash2);
  });
});
```

---

### 8.3 Sensitive Data Logging

**Severity:** HIGH
**Impact:** Information disclosure through logs

#### Checklist Items

- [ ] **LOG-001**: Verify no passwords in logs
- [ ] **LOG-002**: Confirm no tokens in logs
- [ ] **LOG-003**: Validate no PII in error messages
- [ ] **LOG-004**: Ensure log sanitization

#### Test Cases

```javascript
// TEST-LOG-001: Sensitive data logging
describe('Sensitive Data Logging', () => {
  test('Should not log passwords', async () => {
    const logSpy = jest.spyOn(console, 'log');
    const errorSpy = jest.spyOn(console, 'error');

    await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'secret123' });

    const allLogs = [
      ...logSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat()
    ].join(' ');

    expect(allLogs).not.toContain('secret123');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('Should not log full tokens', async () => {
    const logSpy = jest.spyOn(console, 'log');

    const token = await createDeviceToken({});

    const allLogs = logSpy.mock.calls.flat().join(' ');

    // Should log prefix only
    expect(allLogs).not.toContain(token);

    logSpy.mockRestore();
  });
});
```

#### Code Review Guidelines

```typescript
// ✅ CORRECT IMPLEMENTATION
import winston from 'winston';

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    // Sanitize sensitive fields
    winston.format((info) => {
      const sanitized = { ...info };

      // Remove sensitive fields
      delete sanitized.password;
      delete sanitized.token;
      delete sanitized.session;

      // Truncate token hashes
      if (sanitized.token_hash) {
        sanitized.token_hash = sanitized.token_hash.substring(0, 8) + '...';
      }

      return sanitized;
    })()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// ❌ INCORRECT IMPLEMENTATION
console.log('User login:', { username, password }); // WRONG - logs password
console.log('Created token:', token); // WRONG - logs full token
logger.error('Auth failed', { error, user: req.body }); // WRONG - logs entire request body
```

---

## 9. Compliance Summary

### 9.1 OWASP Top 10 2021 Coverage

| Risk | Category | Status | Coverage |
|------|----------|--------|----------|
| A01:2021 | Broken Access Control | ✅ COVERED | Auth, RBAC, Area filtering |
| A02:2021 | Cryptographic Failures | ✅ COVERED | Token hashing, PIN generation |
| A03:2021 | Injection | ✅ COVERED | SQL injection prevention |
| A04:2021 | Insecure Design | ✅ COVERED | Rate limiting, CSRF |
| A05:2021 | Security Misconfiguration | ✅ COVERED | Environment validation |
| A06:2021 | Vulnerable Components | ⚠️ PARTIAL | Dependency scanning required |
| A07:2021 | Auth Failures | ✅ COVERED | Strong token auth, expiry |
| A08:2021 | Data Integrity Failures | ✅ COVERED | Hash verification, CSRF |
| A09:2021 | Security Logging | ✅ COVERED | Audit logs, sanitization |
| A10:2021 | Server-Side Request Forgery | N/A | No external requests |

### 9.2 Final Validation Checklist

**Pre-Deployment Security Audit:**

- [ ] All 8 vulnerability categories addressed
- [ ] Unit tests achieve >90% coverage
- [ ] Integration tests pass all scenarios
- [ ] Penetration testing completed
- [ ] Security code review completed
- [ ] Dependency vulnerabilities scanned (`npm audit`)
- [ ] Environment variables validated
- [ ] Database migrations tested
- [ ] WebSocket security tested
- [ ] Rate limiting verified under load
- [ ] CSRF protection enabled
- [ ] Secrets rotated and secured
- [ ] Logging sanitization verified
- [ ] Error handling reviewed
- [ ] Documentation updated

**Production Monitoring:**

- [ ] Audit log monitoring enabled
- [ ] Rate limit alerts configured
- [ ] Token revocation alerts set
- [ ] Failed auth attempt monitoring
- [ ] WebSocket connection monitoring
- [ ] Database query performance tracking
- [ ] Security event SIEM integration

---

## 10. Recommendations

### 10.1 Immediate Actions (Pre-Launch)

1. **Implement all checklist items** - Zero tolerance for incomplete security
2. **Run automated security scanner** - OWASP ZAP, Burp Suite
3. **Conduct penetration testing** - Internal or external security audit
4. **Enable security headers** - CSP, HSTS, X-Frame-Options
5. **Configure WAF** - Web Application Firewall for production

### 10.2 Ongoing Security Practices

1. **Monthly security reviews** - Re-run this checklist
2. **Quarterly dependency updates** - Keep libraries patched
3. **Annual penetration testing** - External security firm
4. **Security training** - Keep team updated on threats
5. **Incident response plan** - Documented breach procedures

### 10.3 Advanced Security Enhancements

1. **Hardware security keys** - WebAuthn/FIDO2 support
2. **2FA for admin accounts** - TOTP or SMS backup
3. **IP allowlisting** - For admin panel access
4. **Database encryption** - Encrypt sensitive fields at application layer
5. **DDoS protection** - Cloudflare or AWS Shield

---

## Document Control

**Version:** 1.3.25
**Classification:** CONFIDENTIAL
**Distribution:** Security Team, DevOps, QA
**Review Cycle:** Monthly
**Next Review:** 2025-01-02

**Approval Signatures:**

- [ ] Lead Security Architect: ___________________
- [ ] DevOps Lead: ___________________
- [ ] QA Manager: ___________________
- [ ] CTO: ___________________

---

**END OF DOCUMENT**
