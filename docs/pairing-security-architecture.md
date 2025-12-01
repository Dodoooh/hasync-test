# Pairing System Security Architecture

## Executive Summary

This document defines the security architecture for the client pairing system, implementing a dual-token authentication model with role-based access control (RBAC), time-based PIN verification, and real-time token revocation capabilities.

## 1. Authentication Levels & Access Control

### 1.1 Access Level Matrix

| Endpoint | Method | Auth Level | Required Role | Purpose |
|----------|--------|------------|---------------|---------|
| `/api/pairing/:sessionId/verify` | POST | PUBLIC | None | Client PIN verification |
| `/api/pairing/:sessionId/complete` | POST | ADMIN | admin | Assign areas & issue token |
| `/api/clients/me` | GET | CLIENT | client | Client reads own data |
| `/api/clients` | GET | ADMIN | admin | Admin reads all clients |
| `/api/clients/:clientId` | GET | ADMIN | admin | Admin reads specific client |
| `/api/clients/:clientId` | PATCH | ADMIN | admin | Admin updates client |
| `/api/clients/:clientId/revoke` | POST | ADMIN | admin | Revoke client token |
| `/ws` | WebSocket | HYBRID | admin/client | Real-time updates |

### 1.2 Authentication Flow Types

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOWS                      │
└─────────────────────────────────────────────────────────────┘

Flow 1: PUBLIC (PIN Verification)
┌──────────┐                    ┌──────────┐
│  Client  │────PIN Request────>│  Server  │
│  Device  │                    │          │
│          │<───PIN (6-digit)───│          │
│          │                    │          │
│          │────Verify PIN─────>│          │
│          │<───Success/Fail────│          │
└──────────┘                    └──────────┘

Flow 2: ADMIN (Token Issuance)
┌──────────┐                    ┌──────────┐
│  Admin   │────Assign Areas───>│  Server  │
│  Panel   │  + Admin Token     │          │
│          │<───Client Token────│          │
└──────────┘                    └──────────┘

Flow 3: CLIENT (Authenticated Access)
┌──────────┐                    ┌──────────┐
│  Client  │────Request + CT───>│  Server  │
│  Device  │  (Client Token)    │          │
│          │<───Own Data────────│          │
└──────────┘                    └──────────┘

Flow 4: ADMIN (Full Access)
┌──────────┐                    ┌──────────┐
│  Admin   │────Request + AT───>│  Server  │
│  Panel   │  (Admin Token)     │          │
│          │<───All Data────────│          │
└──────────┘                    └──────────┘
```

## 2. Token Architecture

### 2.1 Token Type Specifications

#### Admin Token (Existing)
```typescript
interface AdminTokenPayload {
  username: string;
  role: 'admin';
  iat: number;      // Issued at
  exp: number;      // Expiration (30 days default)
}

// Example JWT:
{
  "username": "admin@system.com",
  "role": "admin",
  "iat": 1701360000,
  "exp": 1703952000
}
```

#### Client Token (New)
```typescript
interface ClientTokenPayload {
  clientId: string;           // UUID v4
  role: 'client';
  assignedAreas: string[];    // Array of area IDs
  deviceInfo?: {
    userAgent: string;
    ipAddress: string;
  };
  iat: number;
  exp: number;                // 10 years from issuance
}

// Example JWT:
{
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "role": "client",
  "assignedAreas": ["zone-1", "zone-2"],
  "deviceInfo": {
    "userAgent": "Mozilla/5.0...",
    "ipAddress": "192.168.1.100"
  },
  "iat": 1701360000,
  "exp": 2016720000  // 10 years later
}
```

### 2.2 Token Storage & Hashing

#### Database Schema
```sql
-- Admin tokens (existing table - no changes needed)
CREATE TABLE admin_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(255) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_used TIMESTAMP
);

-- Client tokens (new table)
CREATE TABLE client_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash
  assigned_areas TEXT[] NOT NULL,
  device_info JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  last_used TIMESTAMP,
  revoked_by UUID REFERENCES admin_tokens(id),
  revoke_reason TEXT,
  CONSTRAINT active_token CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX idx_client_tokens_hash ON client_tokens(token_hash);
CREATE INDEX idx_client_tokens_client ON client_tokens(client_id);
CREATE INDEX idx_client_tokens_active ON client_tokens(client_id)
  WHERE revoked_at IS NULL;
```

#### Hashing Implementation
```typescript
import crypto from 'crypto';

class TokenHasher {
  /**
   * Hash token using SHA-256
   * @param token - Raw JWT token string
   * @returns Hexadecimal hash string (64 chars)
   */
  static hashToken(token: string): string {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  /**
   * Verify token matches stored hash
   * @param token - Raw token to verify
   * @param storedHash - Hash from database
   * @returns Boolean indicating match
   */
  static verifyToken(token: string, storedHash: string): boolean {
    const hash = this.hashToken(token);
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(storedHash)
    );
  }
}
```

### 2.3 Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT TOKEN LIFECYCLE                   │
└─────────────────────────────────────────────────────────────┘

1. CREATION
   ┌──────────────────────────────────────────────────┐
   │ Admin completes pairing                          │
   │   ↓                                              │
   │ Generate JWT with 10-year expiry                 │
   │   ↓                                              │
   │ Hash token with SHA-256                          │
   │   ↓                                              │
   │ Store hash + metadata in database                │
   │   ↓                                              │
   │ Return raw token to admin (one-time only)        │
   └──────────────────────────────────────────────────┘

2. USAGE
   ┌──────────────────────────────────────────────────┐
   │ Client sends token in Authorization header       │
   │   ↓                                              │
   │ Verify JWT signature & expiration                │
   │   ↓                                              │
   │ Hash received token                              │
   │   ↓                                              │
   │ Lookup hash in database                          │
   │   ↓                                              │
   │ Check revoked_at IS NULL                         │
   │   ↓                                              │
   │ Update last_used timestamp                       │
   │   ↓                                              │
   │ Grant access with client context                 │
   └──────────────────────────────────────────────────┘

3. REVOCATION
   ┌──────────────────────────────────────────────────┐
   │ Admin requests revocation                        │
   │   ↓                                              │
   │ SET revoked_at = NOW()                           │
   │   ↓                                              │
   │ Record revoked_by, revoke_reason                 │
   │   ↓                                              │
   │ Broadcast to WebSocket server                    │
   │   ↓                                              │
   │ Disconnect active client connections             │
   │   ↓                                              │
   │ Future requests return 401 Unauthorized          │
   └──────────────────────────────────────────────────┘
```

## 3. PIN Security

### 3.1 PIN Generation & Storage

```typescript
interface PINSession {
  sessionId: string;        // UUID v4
  pin: string;              // 6-digit numeric
  pinHash: string;          // SHA-256 hash
  createdAt: Date;
  expiresAt: Date;          // createdAt + 5 minutes
  attempts: number;         // Failed verification attempts
  maxAttempts: number;      // 3 attempts max
  verified: boolean;
  verifiedAt?: Date;
  ipAddress?: string;
}

class PINGenerator {
  /**
   * Generate cryptographically secure 6-digit PIN
   */
  static generatePIN(): string {
    const min = 100000;
    const max = 999999;
    const range = max - min + 1;

    // Use crypto.randomInt for cryptographic security
    return crypto.randomInt(min, max + 1).toString();
  }

  /**
   * Hash PIN with SHA-256 before storage
   */
  static hashPIN(pin: string): string {
    return crypto
      .createHash('sha256')
      .update(pin)
      .digest('hex');
  }

  /**
   * Create new PIN session
   */
  static createSession(): PINSession {
    const pin = this.generatePIN();
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    return {
      sessionId,
      pin,                          // Return for display only
      pinHash: this.hashPIN(pin),   // Store this
      createdAt: now,
      expiresAt,
      attempts: 0,
      maxAttempts: 3,
      verified: false
    };
  }
}
```

### 3.2 PIN Verification Rules

```typescript
enum PINVerificationError {
  EXPIRED = 'PIN_EXPIRED',
  INVALID = 'PIN_INVALID',
  MAX_ATTEMPTS = 'MAX_ATTEMPTS_EXCEEDED',
  ALREADY_VERIFIED = 'ALREADY_VERIFIED',
  NOT_FOUND = 'SESSION_NOT_FOUND'
}

class PINVerifier {
  /**
   * Verify PIN with comprehensive security checks
   */
  static verify(
    session: PINSession,
    providedPIN: string
  ): { success: boolean; error?: PINVerificationError } {

    // Check 1: Session exists
    if (!session) {
      return { success: false, error: PINVerificationError.NOT_FOUND };
    }

    // Check 2: Not already verified
    if (session.verified) {
      return { success: false, error: PINVerificationError.ALREADY_VERIFIED };
    }

    // Check 3: Not expired
    if (new Date() > session.expiresAt) {
      return { success: false, error: PINVerificationError.EXPIRED };
    }

    // Check 4: Not exceeded max attempts
    if (session.attempts >= session.maxAttempts) {
      return { success: false, error: PINVerificationError.MAX_ATTEMPTS };
    }

    // Check 5: PIN matches (constant-time comparison)
    const providedHash = PINGenerator.hashPIN(providedPIN);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedHash),
      Buffer.from(session.pinHash)
    );

    if (!isValid) {
      // Increment attempts on failure
      session.attempts++;
      return { success: false, error: PINVerificationError.INVALID };
    }

    // Success
    session.verified = true;
    session.verifiedAt = new Date();
    return { success: true };
  }
}
```

### 3.3 PIN Security Constraints

| Rule | Value | Enforcement |
|------|-------|-------------|
| **Length** | 6 digits | Generated format |
| **Character Set** | 0-9 numeric only | Regex validation |
| **Expiration** | 5 minutes | Database timestamp check |
| **Max Attempts** | 3 failed verifications | Counter in session |
| **Single Use** | Cannot reuse verified PIN | `verified` flag |
| **Storage** | SHA-256 hash only | Never store plaintext |
| **Rate Limiting** | 5 requests/minute per IP | Express middleware |

## 4. Endpoint Security Specifications

### 4.1 Public Endpoint: PIN Verification

**Endpoint:** `POST /api/pairing/:sessionId/verify`

**Security Level:** PUBLIC (No authentication required)

**Request:**
```typescript
{
  pin: string;  // 6-digit numeric
}
```

**Security Checks:**
```typescript
async function verifyPIN(req: Request, res: Response) {
  const { sessionId } = req.params;
  const { pin } = req.body;

  // Validation
  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'Invalid PIN format' });
  }

  // Rate limiting (already applied via middleware)
  // 5 requests per minute per IP

  // Fetch session
  const session = await getPINSession(sessionId);

  // Verify with security checks
  const result = PINVerifier.verify(session, pin);

  if (!result.success) {
    // Log failed attempt
    await logSecurityEvent({
      type: 'PIN_VERIFICATION_FAILED',
      sessionId,
      error: result.error,
      ipAddress: req.ip
    });

    return res.status(401).json({
      error: result.error,
      attemptsRemaining: session.maxAttempts - session.attempts
    });
  }

  // Update session in database
  await updatePINSession(sessionId, {
    verified: true,
    verifiedAt: new Date()
  });

  return res.status(200).json({ verified: true });
}
```

### 4.2 Admin Endpoint: Complete Pairing

**Endpoint:** `POST /api/pairing/:sessionId/complete`

**Security Level:** ADMIN (Requires admin token)

**Request:**
```typescript
{
  assignedAreas: string[];  // Array of area IDs
  clientName?: string;      // Optional friendly name
}

// Headers:
Authorization: Bearer <admin-jwt-token>
```

**Security Checks:**
```typescript
async function completePairing(req: Request, res: Response) {
  // Check 1: Admin authentication
  const adminToken = extractBearerToken(req);
  if (!adminToken) {
    return res.status(401).json({ error: 'Admin token required' });
  }

  // Check 2: Verify admin token
  const admin = await verifyAdminToken(adminToken);
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Check 3: Session verified
  const { sessionId } = req.params;
  const session = await getPINSession(sessionId);

  if (!session || !session.verified) {
    return res.status(400).json({ error: 'Session not verified' });
  }

  // Check 4: Not already completed
  if (session.completed) {
    return res.status(400).json({ error: 'Session already completed' });
  }

  // Check 5: Assigned areas exist
  const { assignedAreas, clientName } = req.body;
  const validAreas = await validateAreas(assignedAreas);
  if (!validAreas) {
    return res.status(400).json({ error: 'Invalid area IDs' });
  }

  // Create client record
  const client = await createClient({
    name: clientName,
    sessionId,
    createdBy: admin.username
  });

  // Generate client token
  const clientToken = await generateClientToken({
    clientId: client.id,
    assignedAreas,
    deviceInfo: {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    }
  });

  // Hash and store token
  const tokenHash = TokenHasher.hashToken(clientToken);
  await storeClientToken({
    clientId: client.id,
    tokenHash,
    assignedAreas,
    expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) // 10 years
  });

  // Mark session complete
  await updatePINSession(sessionId, {
    completed: true,
    completedAt: new Date(),
    completedBy: admin.username
  });

  // Return token (ONE TIME ONLY)
  return res.status(201).json({
    client: {
      id: client.id,
      name: client.name,
      assignedAreas
    },
    token: clientToken,  // Admin must save this
    expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
  });
}
```

### 4.3 Client Endpoint: Read Own Data

**Endpoint:** `GET /api/clients/me`

**Security Level:** CLIENT (Requires client token)

**Request:**
```typescript
// Headers:
Authorization: Bearer <client-jwt-token>
```

**Security Checks:**
```typescript
async function getOwnClientData(req: Request, res: Response) {
  // Check 1: Client authentication
  const clientToken = extractBearerToken(req);
  if (!clientToken) {
    return res.status(401).json({ error: 'Client token required' });
  }

  // Check 2: Verify JWT signature & expiration
  let decoded;
  try {
    decoded = jwt.verify(clientToken, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Check 3: Role must be 'client'
  if (decoded.role !== 'client') {
    return res.status(403).json({ error: 'Client token required' });
  }

  // Check 4: Token not revoked
  const tokenHash = TokenHasher.hashToken(clientToken);
  const storedToken = await getClientTokenByHash(tokenHash);

  if (!storedToken || storedToken.revokedAt) {
    return res.status(401).json({ error: 'Token revoked' });
  }

  // Check 5: Update last used
  await updateTokenLastUsed(tokenHash);

  // Fetch client data (ONLY for this client)
  const client = await getClientById(decoded.clientId);

  return res.status(200).json({
    client: {
      id: client.id,
      name: client.name,
      assignedAreas: decoded.assignedAreas,
      createdAt: client.createdAt
    }
  });
}
```

### 4.4 Admin Endpoint: Read All Clients

**Endpoint:** `GET /api/clients`

**Security Level:** ADMIN (Requires admin token)

**Request:**
```typescript
// Headers:
Authorization: Bearer <admin-jwt-token>

// Query params:
?page=1&limit=50&area=zone-1&status=active
```

**Security Checks:**
```typescript
async function getAllClients(req: Request, res: Response) {
  // Check 1: Admin authentication
  const adminToken = extractBearerToken(req);
  if (!adminToken) {
    return res.status(401).json({ error: 'Admin token required' });
  }

  // Check 2: Verify admin token
  const admin = await verifyAdminToken(adminToken);
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Pagination & filtering
  const { page = 1, limit = 50, area, status } = req.query;

  // Fetch all clients with filters
  const clients = await getClients({
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    area: area as string,
    status: status as string
  });

  // Include token status for each client
  const clientsWithTokens = await Promise.all(
    clients.map(async (client) => {
      const tokens = await getClientTokens(client.id);
      return {
        ...client,
        tokens: tokens.map(t => ({
          id: t.id,
          createdAt: t.createdAt,
          expiresAt: t.expiresAt,
          revokedAt: t.revokedAt,
          lastUsed: t.lastUsed,
          isActive: !t.revokedAt && new Date() < t.expiresAt
        }))
      };
    })
  );

  return res.status(200).json({
    clients: clientsWithTokens,
    pagination: {
      page,
      limit,
      total: await getClientCount({ area, status })
    }
  });
}
```

### 4.5 Admin Endpoint: Revoke Client Token

**Endpoint:** `POST /api/clients/:clientId/revoke`

**Security Level:** ADMIN (Requires admin token)

**Request:**
```typescript
{
  reason: string;  // Required reason for revocation
}

// Headers:
Authorization: Bearer <admin-jwt-token>
```

**Security Checks:**
```typescript
async function revokeClientToken(req: Request, res: Response) {
  // Check 1: Admin authentication
  const adminToken = extractBearerToken(req);
  if (!adminToken) {
    return res.status(401).json({ error: 'Admin token required' });
  }

  // Check 2: Verify admin token
  const admin = await verifyAdminToken(adminToken);
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Check 3: Client exists
  const { clientId } = req.params;
  const client = await getClientById(clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  // Check 4: Reason provided
  const { reason } = req.body;
  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ error: 'Revocation reason required' });
  }

  // Get active tokens for client
  const activeTokens = await getActiveClientTokens(clientId);

  if (activeTokens.length === 0) {
    return res.status(400).json({ error: 'No active tokens to revoke' });
  }

  // Revoke all active tokens
  const revokedTokens = await Promise.all(
    activeTokens.map(async (token) => {
      return await revokeToken({
        tokenId: token.id,
        revokedBy: admin.id,
        reason: reason.trim()
      });
    })
  );

  // Broadcast revocation to WebSocket server
  await broadcastTokenRevocation({
    clientId,
    tokenIds: revokedTokens.map(t => t.id)
  });

  // Log security event
  await logSecurityEvent({
    type: 'TOKEN_REVOKED',
    clientId,
    revokedBy: admin.username,
    reason,
    tokenCount: revokedTokens.length
  });

  return res.status(200).json({
    revoked: revokedTokens.length,
    revokedAt: new Date(),
    reason
  });
}
```

## 5. WebSocket Authentication

### 5.1 Connection Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│              WEBSOCKET AUTHENTICATION FLOW                   │
└─────────────────────────────────────────────────────────────┘

Client Connection:
┌──────────┐                                    ┌──────────┐
│  Client  │──── ws://server?token=CLIENT_JWT ─>│ WS Server│
│          │                                    │          │
│          │<──── Validate Token ───────────────│          │
│          │      - Verify JWT signature        │          │
│          │      - Check expiration            │          │
│          │      - Hash & lookup in DB         │          │
│          │      - Check revoked_at IS NULL    │          │
│          │                                    │          │
│          │<──── Connection Accepted ──────────│          │
│          │      Store: client_id, socket_id   │          │
└──────────┘                                    └──────────┘

Admin Connection:
┌──────────┐                                    ┌──────────┐
│  Admin   │──── ws://server?token=ADMIN_JWT ──>│ WS Server│
│          │                                    │          │
│          │<──── Validate Token ───────────────│          │
│          │      - Verify JWT signature        │          │
│          │      - Check role === 'admin'      │          │
│          │                                    │          │
│          │<──── Connection Accepted ──────────│          │
│          │      Store: username, socket_id    │          │
└──────────┘                                    └──────────┘
```

### 5.2 WebSocket Authentication Implementation

```typescript
interface WebSocketConnection {
  socketId: string;
  role: 'admin' | 'client';
  userId: string;  // admin username or client ID
  token: string;   // Original token for re-validation
  connectedAt: Date;
  lastActivity: Date;
}

class WebSocketAuthenticator {
  private connections: Map<string, WebSocketConnection> = new Map();

  /**
   * Authenticate WebSocket connection
   */
  async authenticate(
    socket: WebSocket,
    request: IncomingMessage
  ): Promise<{ success: boolean; connection?: WebSocketConnection }> {

    // Extract token from query string
    const url = new URL(request.url, `ws://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(1008, 'Token required');
      return { success: false };
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      socket.close(1008, 'Invalid token');
      return { success: false };
    }

    // Route to appropriate handler
    if (decoded.role === 'admin') {
      return this.authenticateAdmin(socket, token, decoded);
    } else if (decoded.role === 'client') {
      return this.authenticateClient(socket, token, decoded);
    } else {
      socket.close(1008, 'Invalid role');
      return { success: false };
    }
  }

  /**
   * Authenticate admin WebSocket connection
   */
  private async authenticateAdmin(
    socket: WebSocket,
    token: string,
    decoded: any
  ): Promise<{ success: boolean; connection?: WebSocketConnection }> {

    // Verify admin token in database
    const admin = await verifyAdminToken(token);
    if (!admin) {
      socket.close(1008, 'Invalid admin token');
      return { success: false };
    }

    const connection: WebSocketConnection = {
      socketId: crypto.randomUUID(),
      role: 'admin',
      userId: decoded.username,
      token,
      connectedAt: new Date(),
      lastActivity: new Date()
    };

    this.connections.set(connection.socketId, connection);
    return { success: true, connection };
  }

  /**
   * Authenticate client WebSocket connection
   */
  private async authenticateClient(
    socket: WebSocket,
    token: string,
    decoded: any
  ): Promise<{ success: boolean; connection?: WebSocketConnection }> {

    // Hash token and check database
    const tokenHash = TokenHasher.hashToken(token);
    const storedToken = await getClientTokenByHash(tokenHash);

    if (!storedToken) {
      socket.close(1008, 'Token not found');
      return { success: false };
    }

    if (storedToken.revokedAt) {
      socket.close(1008, 'Token revoked');
      return { success: false };
    }

    if (new Date() > storedToken.expiresAt) {
      socket.close(1008, 'Token expired');
      return { success: false };
    }

    const connection: WebSocketConnection = {
      socketId: crypto.randomUUID(),
      role: 'client',
      userId: decoded.clientId,
      token,
      connectedAt: new Date(),
      lastActivity: new Date()
    };

    this.connections.set(connection.socketId, connection);

    // Update last used
    await updateTokenLastUsed(tokenHash);

    return { success: true, connection };
  }

  /**
   * Disconnect client by client ID (for revocation)
   */
  disconnectClient(clientId: string): void {
    for (const [socketId, conn] of this.connections.entries()) {
      if (conn.role === 'client' && conn.userId === clientId) {
        const socket = this.getSocket(socketId);
        if (socket) {
          socket.close(1008, 'Token revoked');
          this.connections.delete(socketId);
        }
      }
    }
  }

  /**
   * Periodic re-validation of all connections
   */
  async revalidateConnections(): Promise<void> {
    for (const [socketId, conn] of this.connections.entries()) {
      if (conn.role === 'client') {
        const tokenHash = TokenHasher.hashToken(conn.token);
        const storedToken = await getClientTokenByHash(tokenHash);

        if (!storedToken || storedToken.revokedAt) {
          this.disconnectClient(conn.userId);
        }
      }
    }
  }
}
```

### 5.3 Real-Time Revocation

```typescript
class TokenRevocationBroadcaster {
  private wsAuthenticator: WebSocketAuthenticator;
  private redis: RedisClient;  // For multi-server coordination

  constructor(wsAuthenticator: WebSocketAuthenticator) {
    this.wsAuthenticator = wsAuthenticator;
    this.setupRedisSubscription();
  }

  /**
   * Broadcast token revocation across all WebSocket servers
   */
  async broadcastRevocation(revocation: {
    clientId: string;
    tokenIds: string[];
    reason: string;
  }): Promise<void> {

    // Publish to Redis for multi-server coordination
    await this.redis.publish('token:revoked', JSON.stringify({
      clientId: revocation.clientId,
      tokenIds: revocation.tokenIds,
      reason: revocation.reason,
      timestamp: new Date().toISOString()
    }));

    // Disconnect on this server
    this.wsAuthenticator.disconnectClient(revocation.clientId);
  }

  /**
   * Listen for revocations from other servers
   */
  private setupRedisSubscription(): void {
    this.redis.subscribe('token:revoked', (message) => {
      const revocation = JSON.parse(message);
      this.wsAuthenticator.disconnectClient(revocation.clientId);
    });
  }
}
```

## 6. Token Revocation Workflow

### 6.1 Revocation Process

```
┌─────────────────────────────────────────────────────────────┐
│                  TOKEN REVOCATION WORKFLOW                   │
└─────────────────────────────────────────────────────────────┘

Step 1: Admin Initiates Revocation
┌──────────┐
│  Admin   │─── POST /api/clients/:id/revoke
│          │    { reason: "Security breach" }
└──────────┘
     │
     ├─> Verify admin authentication
     ├─> Validate client exists
     ├─> Require revocation reason
     │
Step 2: Database Update
     │
     ├─> UPDATE client_tokens SET
     │       revoked_at = NOW(),
     │       revoked_by = admin.id,
     │       revoke_reason = reason
     │   WHERE client_id = :id
     │     AND revoked_at IS NULL
     │
Step 3: Real-Time Broadcast
     │
     ├─> Publish to Redis:
     │   {
     │     clientId: "...",
     │     tokenIds: ["..."],
     │     reason: "...",
     │     timestamp: "..."
     │   }
     │
Step 4: WebSocket Disconnection
     │
     ├─> All WS servers receive broadcast
     ├─> Disconnect matching client connections
     ├─> Send close code 1008 with reason
     │
Step 5: Audit Log
     │
     └─> Log security event:
         {
           type: "TOKEN_REVOKED",
           clientId: "...",
           revokedBy: "admin@system.com",
           reason: "Security breach",
           affectedTokens: 1,
           timestamp: "..."
         }
```

### 6.2 Revocation Database Operations

```sql
-- Revoke all active tokens for a client
UPDATE client_tokens
SET
  revoked_at = NOW(),
  revoked_by = $1,  -- admin token ID
  revoke_reason = $2
WHERE
  client_id = $3
  AND revoked_at IS NULL
RETURNING id, client_id, created_at, revoked_at;

-- Check if token is revoked (during authentication)
SELECT
  ct.id,
  ct.client_id,
  ct.assigned_areas,
  ct.revoked_at,
  ct.expires_at,
  c.name as client_name
FROM client_tokens ct
JOIN clients c ON ct.client_id = c.id
WHERE ct.token_hash = $1
  AND ct.revoked_at IS NULL
  AND ct.expires_at > NOW();

-- Get revocation history for audit
SELECT
  ct.id as token_id,
  ct.client_id,
  c.name as client_name,
  ct.revoked_at,
  ct.revoke_reason,
  at.username as revoked_by_admin,
  ct.created_at as token_created_at,
  ct.last_used
FROM client_tokens ct
JOIN clients c ON ct.client_id = c.id
LEFT JOIN admin_tokens at ON ct.revoked_by = at.id
WHERE ct.revoked_at IS NOT NULL
ORDER BY ct.revoked_at DESC
LIMIT 100;
```

## 7. Security Best Practices

### 7.1 Token Security Checklist

- [x] **Never store plaintext tokens** - Store SHA-256 hash only
- [x] **Use cryptographic randomness** - crypto.randomUUID(), crypto.randomInt()
- [x] **Constant-time comparisons** - crypto.timingSafeEqual() to prevent timing attacks
- [x] **Token rotation** - Client tokens expire after 10 years
- [x] **Revocation support** - Immediate disconnection via WebSocket
- [x] **Audit logging** - Track all token operations
- [x] **Rate limiting** - Prevent brute force attacks
- [x] **HTTPS only** - Never transmit tokens over HTTP
- [x] **Secure headers** - Set secure cookie flags, CORS policies

### 7.2 PIN Security Checklist

- [x] **Short expiration** - 5 minutes maximum
- [x] **Limited attempts** - 3 failed verifications max
- [x] **Single use** - Cannot reuse verified PIN
- [x] **Cryptographic generation** - crypto.randomInt()
- [x] **Hashed storage** - SHA-256, never plaintext
- [x] **Rate limiting** - 5 requests/minute per IP
- [x] **Secure display** - Admin panel only, one-time show

### 7.3 Access Control Checklist

- [x] **Role-based access** - admin, client roles with distinct permissions
- [x] **Least privilege** - Client can only access own data
- [x] **Token verification** - Check signature, expiration, revocation on every request
- [x] **Authorization layers** - Middleware + endpoint-level checks
- [x] **Audit trail** - Log all security events
- [x] **Session management** - Track active connections, periodic revalidation

### 7.4 WebSocket Security Checklist

- [x] **Authentication on connect** - No unauthenticated connections
- [x] **Token in query string** - ws://server?token=... (not ideal, but WebSocket limitation)
- [x] **Periodic revalidation** - Check token every 5 minutes
- [x] **Immediate revocation** - Disconnect on token revoke
- [x] **Multi-server coordination** - Redis pub/sub for distributed systems
- [x] **Connection limits** - Max connections per client

## 8. Security Monitoring & Alerts

### 8.1 Security Events to Log

```typescript
enum SecurityEventType {
  // Authentication
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  TOKEN_ISSUED = 'TOKEN_ISSUED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',

  // PIN Operations
  PIN_GENERATED = 'PIN_GENERATED',
  PIN_VERIFICATION_SUCCESS = 'PIN_VERIFICATION_SUCCESS',
  PIN_VERIFICATION_FAILED = 'PIN_VERIFICATION_FAILED',
  PIN_EXPIRED = 'PIN_EXPIRED',
  PIN_MAX_ATTEMPTS = 'PIN_MAX_ATTEMPTS',

  // Access Control
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  FORBIDDEN_ACCESS = 'FORBIDDEN_ACCESS',

  // WebSocket
  WS_CONNECTED = 'WS_CONNECTED',
  WS_DISCONNECTED = 'WS_DISCONNECTED',
  WS_AUTH_FAILED = 'WS_AUTH_FAILED',

  // Anomalies
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY'
}

interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  timestamp: Date;
  userId?: string;
  clientId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}
```

### 8.2 Alert Triggers

| Event | Threshold | Alert Level | Action |
|-------|-----------|-------------|--------|
| Failed PIN attempts | 3 in 1 minute | Medium | Lock session, notify admin |
| Failed login attempts | 5 in 5 minutes | High | Lock account, notify admin |
| Token revocations | 5 in 1 hour | Medium | Review admin actions |
| Rate limit exceeded | 3 times in 10 min | High | Block IP temporarily |
| Unauthorized access | 10 in 1 hour | Critical | Security review |
| Suspicious IP patterns | Multiple clients | Critical | Manual review |

### 8.3 Audit Log Schema

```sql
CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),

  -- Actor information
  user_id UUID,
  client_id UUID,
  admin_id UUID,
  session_id UUID,

  -- Request metadata
  ip_address INET,
  user_agent TEXT,

  -- Event details
  details JSONB,

  -- Indexing
  CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_timestamp ON security_events(timestamp DESC);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_client ON security_events(client_id);
CREATE INDEX idx_security_events_ip ON security_events(ip_address);
```

## 9. Implementation Roadmap

### Phase 1: Core Authentication (Week 1)
- [ ] Implement token hashing (SHA-256)
- [ ] Create client_tokens table
- [ ] Build JWT generation for client tokens
- [ ] Implement token verification middleware

### Phase 2: PIN Security (Week 2)
- [ ] Cryptographic PIN generation
- [ ] PIN expiration logic
- [ ] Attempt limiting
- [ ] Public verification endpoint

### Phase 3: Access Control (Week 3)
- [ ] Role-based middleware
- [ ] Client endpoint `/api/clients/me`
- [ ] Admin endpoint `/api/clients`
- [ ] Pairing completion endpoint

### Phase 4: Revocation (Week 4)
- [ ] Revocation endpoint
- [ ] Database revocation logic
- [ ] WebSocket disconnection
- [ ] Redis pub/sub coordination

### Phase 5: WebSocket Auth (Week 5)
- [ ] Connection authentication
- [ ] Token validation on connect
- [ ] Periodic revalidation
- [ ] Real-time revocation broadcast

### Phase 6: Monitoring (Week 6)
- [ ] Security event logging
- [ ] Audit log implementation
- [ ] Alert system
- [ ] Admin dashboard for security events

## 10. Security Testing Checklist

### 10.1 Authentication Tests

- [ ] Admin token grants admin access
- [ ] Client token grants client access only
- [ ] Expired tokens are rejected
- [ ] Invalid signatures are rejected
- [ ] Revoked tokens are rejected immediately
- [ ] Missing tokens return 401
- [ ] Wrong role tokens return 403

### 10.2 PIN Tests

- [ ] PIN expires after 5 minutes
- [ ] PIN rejects after 3 failed attempts
- [ ] PIN cannot be reused after verification
- [ ] PIN is only numeric 6 digits
- [ ] Rate limiting blocks excessive requests
- [ ] Constant-time comparison prevents timing attacks

### 10.3 Access Control Tests

- [ ] Client cannot access other clients' data
- [ ] Client cannot access admin endpoints
- [ ] Admin can access all client data
- [ ] Public endpoint requires no auth
- [ ] Protected endpoints require correct role

### 10.4 WebSocket Tests

- [ ] Unauthenticated connections rejected
- [ ] Revoked token disconnects immediately
- [ ] Expired token disconnects
- [ ] Admin receives all updates
- [ ] Client receives only own updates
- [ ] Periodic revalidation works

### 10.5 Revocation Tests

- [ ] Revoked token fails authentication
- [ ] WebSocket disconnects on revoke
- [ ] Multi-server revocation via Redis
- [ ] Audit log records revocation
- [ ] Revocation reason is required

## 11. Conclusion

This security architecture provides:

1. **Multi-level authentication** - Public, Client, Admin access levels
2. **Token security** - SHA-256 hashing, 10-year expiry, revocation support
3. **PIN security** - 5-minute expiry, 3 attempts, cryptographic generation
4. **Access control** - RBAC with least privilege principle
5. **Real-time revocation** - Immediate WebSocket disconnection
6. **Audit trail** - Comprehensive security event logging
7. **Scalability** - Redis pub/sub for multi-server coordination

**Security Principles Enforced:**
- Defense in depth (multiple security layers)
- Least privilege (minimal access rights)
- Secure by default (no unauthenticated access)
- Fail securely (deny on error)
- Audit everything (complete event logging)
- Zero trust (verify every request)

**Next Steps:**
1. Review architecture with security team
2. Implement Phase 1 (Core Authentication)
3. Security audit after each phase
4. Penetration testing before production
5. Ongoing monitoring and improvement

---

**Document Version:** 1.0
**Last Updated:** 2025-12-01
**Author:** Architecture Lead 2 - API Security Architect
**Status:** FINAL - Ready for Implementation
