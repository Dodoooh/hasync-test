# Integration Plan v1.3.25: Pairing System into index-simple.ts

**Project:** HAsync Backend v1.3.25
**Document Version:** 1.0
**Date:** 2025-12-02
**Architect:** Lead Architect 1 - Integration Architecture

---

## Executive Summary

This document provides a detailed integration plan for implementing the secure pairing system into `index-simple.ts`. The integration includes PIN-based client pairing, JWT token authentication, WebSocket real-time notifications, and comprehensive security enhancements.

**Current State:**
- Version: 1.3.22
- File: `/example/rootfs/app/backend/src/index-simple.ts` (2,556 lines)
- Basic pairing endpoint exists at line 662 (insecure Math.random)
- Clients endpoint at line 1629 (admin-only view)
- WebSocket infrastructure at lines 2300+ (basic event handling)

**Target State:**
- Version: 1.3.25
- Secure PIN generation using crypto.randomBytes()
- Complete pairing flow with session tracking
- Client token management with revocation
- Real-time WebSocket notifications
- Rate limiting on security-critical endpoints

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Code Structure Diagram](#2-code-structure-diagram)
3. [Integration Points by Line Number](#3-integration-points-by-line-number)
4. [Security Enhancements](#4-security-enhancements)
5. [Database Schema Integration](#5-database-schema-integration)
6. [Token System Integration](#6-token-system-integration)
7. [WebSocket Events Integration](#7-websocket-events-integration)
8. [Implementation Sequence](#8-implementation-sequence)
9. [Testing Requirements](#9-testing-requirements)
10. [Security Checklist](#10-security-checklist)

---

## 1. Architecture Overview

### 1.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    index-simple.ts (Main Server)            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Imports    │  │  Middleware  │  │  Database    │    │
│  │  (Lines 1-78)│  │ (Lines 79+)  │  │ (Lines 451+) │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │            API Endpoints                            │   │
│  ├────────────────────────────────────────────────────┤   │
│  │ Pairing:       Lines 662-698  (existing)           │   │
│  │ NEW Pairing:   Lines 700-850  (to add)             │   │
│  │ Clients:       Lines 1629-1689 (existing)          │   │
│  │ NEW Clients:   Lines 1750-2100 (to enhance)        │   │
│  │ WebSocket:     Lines 2309+ (existing)              │   │
│  │ NEW Events:    Lines 2500+ (to add)                │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
┌────────┴────────┐  ┌────────┴────────┐  ┌────────┴────────┐
│ tokenUtils.ts   │  │ pairing.ts      │  │ migrate-        │
│ (Token System)  │  │ (Service Layer) │  │ pairing.ts      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 1.2 Data Flow

```
Admin Flow:
Admin Login → Generate PIN → PIN stored in DB → Display PIN
                                    ↓
Client Flow:                        │
Client Device → Enter PIN → Verify PIN → Generate Token → Store Hash
                                                  ↓
Authentication:                                   │
Client Request → Bearer Token → Verify JWT → Check Hash → Allow/Deny
```

---

## 2. Code Structure Diagram

### 2.1 File Organization

```
index-simple.ts
├── SECTION 1: Imports & Configuration (Lines 1-100)
│   ├── Line 21-78: Existing imports
│   └── Line 79: NEW: Import pairing service
│
├── SECTION 2: Database Setup (Lines 451-540)
│   ├── Line 476: Existing migration location
│   └── Line 499: NEW: Call migratePairingTables(db)
│
├── SECTION 3: Pairing Endpoints (Lines 662-850)
│   ├── Line 662-698: Existing /api/pairing/create (REPLACE)
│   ├── Line 700-750: NEW: /api/pairing/verify (ADD)
│   ├── Line 751-800: NEW: /api/pairing/complete (ADD)
│   └── Line 801-850: NEW: /api/pairing/status (ADD)
│
├── SECTION 4: Client Endpoints (Lines 1629-2100)
│   ├── Line 1629-1689: Existing GET /api/clients (KEEP)
│   ├── Line 1750-1850: NEW: POST /api/clients/:id/assign-area
│   ├── Line 1851-1950: EXISTING: PATCH /api/clients/:id (enhance)
│   ├── Line 1951-2010: EXISTING: DELETE /api/clients/:id (keep)
│   └── Line 2011-2100: EXISTING: POST /api/clients/:id/revoke (enhance)
│
├── SECTION 5: WebSocket Events (Lines 2309-2550)
│   ├── Line 2309-2349: Existing connection handler
│   └── Line 2500-2550: NEW: Pairing event handlers
│
└── SECTION 6: Server Startup (Lines 2450-2556)
    └── Line 2500: NEW: Start cleanup job
```

---

## 3. Integration Points by Line Number

### 3.1 Import Section Enhancement (After Line 78)

**Location:** After line 78 (current imports end)
**Action:** ADD new imports

```typescript
// AFTER LINE 78, ADD:

// Pairing system imports
import {
  migratePairingTables,
  createPairingSession,
  verifyPairingSession,
  completePairingSession,
  cleanupExpiredPairingSessions,
  startPairingCleanupJob
} from './database/migrate-pairing';
```

**Line Numbers:** Insert at line 79-88 (9 new lines)

---

### 3.2 Database Migration Integration (After Line 498)

**Location:** After line 498 (areas migration applied)
**Action:** ADD pairing tables migration

```typescript
// AFTER LINE 498, ADD:

// Run pairing migration (v1.3.25)
try {
  migratePairingTables(db);
  logger.info('✓ Pairing tables migration completed');
} catch (error: any) {
  logger.error('✗ Pairing migration failed:', error.message);
  // Don't crash server on migration failure
}
```

**Line Numbers:** Insert at line 499-507 (8 new lines)

---

### 3.3 Rate Limiter for PIN Verification (After Line 380)

**Location:** After line 380 (existing rate limiters)
**Action:** ADD PIN verification rate limiter

```typescript
// AFTER LINE 380, ADD:

// PIN Verification Rate Limiter - 5 attempts per hour per IP
// Prevents brute force attacks on 6-digit PINs
const pinVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // 5 attempts per hour
  message: {
    error: 'Too many PIN verification attempts',
    message: 'Please wait 1 hour before trying again',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP + User-Agent for tracking
  keyGenerator: (req) => {
    return `${req.ip}-${req.get('user-agent')}`;
  }
});
```

**Line Numbers:** Insert at line 381-397 (16 new lines)

---

### 3.4 Replace Existing Pairing Endpoint (Lines 662-698)

**Location:** Lines 662-698 (current /api/pairing/create)
**Action:** REPLACE with secure implementation

**REMOVE Lines 662-698:**
```typescript
// DELETE THESE LINES (insecure Math.random implementation)
```

**INSERT at Line 662:**

```typescript
// ===================================================================
// PAIRING ENDPOINTS - v1.3.25 Secure Implementation
// ===================================================================

// POST /api/pairing/create - Generate pairing PIN (ADMIN only)
// SECURITY:
// - Requires admin authentication
// - Uses crypto.randomBytes for secure PIN generation
// - 5-minute expiration
// - Rate limited to prevent abuse
app.post('/api/pairing/create', authLimiter, csrfProtection, authenticate, (req, res) => {
  // Only admin can generate pairing PINs
  if (req.user.role !== 'admin') {
    logger.warn(`Non-admin user ${req.user.username} attempted to generate pairing PIN`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can generate pairing PINs'
    });
  }

  try {
    // Generate secure pairing session using crypto.randomBytes
    const session = createPairingSession(db, req.user.username);

    logger.info(`[Pairing] Admin ${req.user.username} created session ${session.id} with PIN: ${session.pin}`);

    res.json({
      id: session.id,
      pin: session.pin,
      expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      expiresIn: session.expiresAt - Math.floor(Date.now() / 1000),
      status: session.status
    });
  } catch (error: any) {
    logger.error(`[Pairing] Failed to create session: ${error.message}`);
    res.status(500).json({
      error: 'Failed to create pairing session',
      message: error.message
    });
  }
});

// POST /api/pairing/verify - Verify PIN entered by client
// SECURITY:
// - Rate limited (5 attempts/hour per IP)
// - No authentication required (pre-pairing phase)
// - Returns session ID for next step
app.post('/api/pairing/verify', pinVerificationLimiter, (req, res) => {
  try {
    const { pin, deviceName, deviceType } = req.body;

    // Validate input
    if (!pin || typeof pin !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'PIN is required and must be a string'
      });
    }

    // Verify PIN and get session ID
    const sessionId = verifyPairingSession(db, pin, deviceName, deviceType);

    if (!sessionId) {
      logger.warn(`[Pairing] Invalid or expired PIN attempt: ${pin}`);
      return res.status(401).json({
        error: 'Invalid PIN',
        message: 'PIN is invalid or has expired'
      });
    }

    logger.info(`[Pairing] PIN verified for session: ${sessionId}`);

    res.json({
      sessionId,
      status: 'verified',
      message: 'PIN verified successfully. Proceed to complete pairing.'
    });
  } catch (error: any) {
    logger.error(`[Pairing] Verification error: ${error.message}`);
    res.status(500).json({
      error: 'Verification failed',
      message: error.message
    });
  }
});

// POST /api/pairing/complete - Complete pairing and issue client token
// SECURITY:
// - Requires verified session ID from previous step
// - Generates long-lived JWT token (10 years)
// - Stores token hash in database
// - Creates client record
app.post('/api/pairing/complete', authLimiter, (req, res) => {
  try {
    const { sessionId, deviceName } = req.body;

    // Validate input
    if (!sessionId || !deviceName) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'sessionId and deviceName are required'
      });
    }

    // Get pairing session
    const session = db.prepare(`
      SELECT id, device_name, device_type, status, verified_at
      FROM pairing_sessions
      WHERE id = ? AND status = 'verified'
    `).get(sessionId);

    if (!session) {
      logger.warn(`[Pairing] Invalid session ID: ${sessionId}`);
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Session not found or not verified'
      });
    }

    // Generate client ID
    const clientId = `client_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const createdAt = Math.floor(Date.now() / 1000);

    // Generate client token with empty areas initially
    const token = generateClientToken(clientId, []);
    const tokenHash = hashToken(token);

    // Create client record
    db.prepare(`
      INSERT INTO clients (id, name, device_name, device_type, token_hash, assigned_areas, is_active, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      deviceName,
      session.device_name || deviceName,
      session.device_type || 'unknown',
      tokenHash,
      JSON.stringify([]), // Empty areas initially
      1, // is_active
      createdAt,
      createdAt
    );

    // Mark pairing session as completed
    completePairingSession(db, sessionId);

    // Emit WebSocket event (if admin is connected)
    io.emit('pairing_completed', {
      clientId,
      deviceName,
      deviceType: session.device_type,
      timestamp: new Date().toISOString()
    });

    logger.info(`[Pairing] Client ${clientId} paired successfully`);

    res.status(201).json({
      clientId,
      token,
      deviceName,
      expiresAt: new Date(Date.now() + (10 * 365 * 24 * 60 * 60 * 1000)).toISOString(), // 10 years
      message: 'Pairing completed successfully'
    });
  } catch (error: any) {
    logger.error(`[Pairing] Completion error: ${error.message}`);
    res.status(500).json({
      error: 'Pairing completion failed',
      message: error.message
    });
  }
});

// GET /api/pairing/status/:sessionId - Check pairing session status (ADMIN only)
app.get('/api/pairing/status/:sessionId', readLimiter, authenticate, (req, res) => {
  // Only admin can check pairing status
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can check pairing status'
    });
  }

  try {
    const { sessionId } = req.params;

    const session = db.prepare(`
      SELECT id, pin, status, device_name, device_type, created_at, expires_at, verified_at
      FROM pairing_sessions
      WHERE id = ?
    `).get(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `No pairing session found with id: ${sessionId}`
      });
    }

    res.json({
      id: session.id,
      status: session.status,
      deviceName: session.device_name,
      deviceType: session.device_type,
      createdAt: new Date(session.created_at * 1000).toISOString(),
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
      verifiedAt: session.verified_at ? new Date(session.verified_at * 1000).toISOString() : null
    });
  } catch (error: any) {
    logger.error(`[Pairing] Status check error: ${error.message}`);
    res.status(500).json({
      error: 'Status check failed',
      message: error.message
    });
  }
});
```

**Line Numbers:** Replace lines 662-698, insert 662-887 (225 new lines)

---

### 3.5 Enhance Client Area Assignment (After Line 1689)

**Location:** After line 1689 (GET /api/clients endpoint)
**Action:** ADD area assignment endpoint

```typescript
// AFTER LINE 1689, ADD:

// POST /api/clients/:id/assign-area - Assign area to client (ADMIN only)
// SECURITY: Requires admin authentication and CSRF protection
app.post('/api/clients/:id/assign-area', writeLimiter, csrfProtection, authenticate, (req: any, res: any) => {
  // Only admin can assign areas
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only admin users can assign areas to clients'
    });
  }

  try {
    const { id } = req.params;
    const { areaId } = req.body;

    // Validate area ID
    if (!InputSanitizer.validateAreaId(areaId)) {
      return res.status(400).json({
        error: 'Invalid area ID',
        message: 'Area ID must match format: area_timestamp'
      });
    }

    // Check if client exists
    const client: any = db.prepare('SELECT id, name, assigned_areas, token_hash FROM clients WHERE id = ? AND is_active = ?').get(id, 1);
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        message: `Client with id '${id}' does not exist`
      });
    }

    // Check if area exists
    const area: any = db.prepare('SELECT id, name FROM areas WHERE id = ?').get(areaId);
    if (!area) {
      return res.status(404).json({
        error: 'Area not found',
        message: `Area with id '${areaId}' does not exist`
      });
    }

    // Get current assigned areas
    let assignedAreas: string[] = [];
    try {
      assignedAreas = client.assigned_areas ? JSON.parse(client.assigned_areas) : [];
    } catch (error) {
      logger.warn(`Failed to parse assigned_areas for client ${id}, resetting to empty array`);
      assignedAreas = [];
    }

    // Check if area already assigned
    if (assignedAreas.includes(areaId)) {
      return res.status(400).json({
        error: 'Area already assigned',
        message: `Area '${area.name}' is already assigned to this client`
      });
    }

    // Add area to assigned areas
    assignedAreas.push(areaId);

    // Update client's assigned areas
    db.prepare('UPDATE clients SET assigned_areas = ? WHERE id = ?').run(
      JSON.stringify(assignedAreas),
      id
    );

    // Generate new token with updated areas
    const newToken = generateClientToken(id, assignedAreas);
    const newTokenHash = hashToken(newToken);

    // Update token hash
    db.prepare('UPDATE clients SET token_hash = ? WHERE id = ?').run(newTokenHash, id);

    // Emit WebSocket event to client
    notifyAreaAdded(db, id, {
      clientId: id,
      area: {
        id: area.id,
        name: area.name
      },
      newToken, // Send new token to client
      timestamp: new Date().toISOString()
    });

    logger.info(`[Client] Area ${area.name} assigned to client ${id} by admin ${req.user.username}`);

    res.json({
      success: true,
      message: `Area '${area.name}' assigned successfully`,
      newToken,
      assignedAreas: assignedAreas.map((aId: string) => {
        const a: any = db.prepare('SELECT id, name FROM areas WHERE id = ?').get(aId);
        return a ? { id: a.id, name: a.name } : null;
      }).filter((a: any) => a !== null)
    });
  } catch (error: any) {
    logger.error('[Client] Area assignment error:', error);
    res.status(500).json({
      error: 'Failed to assign area',
      message: error.message
    });
  }
});
```

**Line Numbers:** Insert at line 1690-1799 (109 new lines)

---

### 3.6 WebSocket Event Handlers Enhancement (After Line 2349)

**Location:** After line 2349 (end of subscribe handler)
**Action:** ADD pairing-specific event handlers

```typescript
// AFTER LINE 2349, ADD:

  // Pairing status subscription (ADMIN only)
  socket.on('subscribe_pairing', (data) => {
    try {
      // Verify user is admin
      if (!user || user.role !== 'admin') {
        socket.emit('error', {
          type: 'FORBIDDEN',
          message: 'Only admin users can subscribe to pairing events'
        });
        return;
      }

      socket.join('pairing_events');
      logger.info(`[WebSocket] Admin ${user.username} subscribed to pairing events`);

      socket.emit('subscribed', {
        type: 'pairing',
        status: 'ok',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('[WebSocket] Pairing subscription error:', error.message);
      socket.emit('error', {
        type: 'SUBSCRIPTION_ERROR',
        message: 'Failed to subscribe to pairing events',
        details: error.message
      });
    }
  });

  // Client area subscription (CLIENT tokens only)
  socket.on('subscribe_areas', (data) => {
    try {
      // Verify this is a client connection
      const clientId = (socket as any).clientId;
      if (!clientId) {
        socket.emit('error', {
          type: 'FORBIDDEN',
          message: 'Only clients can subscribe to area events'
        });
        return;
      }

      // Get client's assigned areas
      const client: any = db.prepare('SELECT assigned_areas FROM clients WHERE id = ? AND is_active = ?').get(clientId, 1);
      if (!client) {
        socket.emit('error', {
          type: 'NOT_FOUND',
          message: 'Client not found'
        });
        return;
      }

      const assignedAreas = client.assigned_areas ? JSON.parse(client.assigned_areas) : [];

      // Join rooms for each assigned area
      assignedAreas.forEach((areaId: string) => {
        socket.join(`area_${areaId}`);
      });

      logger.info(`[WebSocket] Client ${clientId} subscribed to ${assignedAreas.length} areas`);

      socket.emit('subscribed', {
        type: 'areas',
        areas: assignedAreas,
        status: 'ok',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('[WebSocket] Area subscription error:', error.message);
      socket.emit('error', {
        type: 'SUBSCRIPTION_ERROR',
        message: 'Failed to subscribe to area events',
        details: error.message
      });
    }
  });
```

**Line Numbers:** Insert at line 2350-2425 (75 new lines)

---

### 3.7 Cleanup Job Initialization (After Line 2500)

**Location:** After server startup, before final logging
**Action:** ADD pairing cleanup job

```typescript
// BEFORE FINAL SERVER STARTUP LOG, ADD:

// Start pairing session cleanup job
const cleanupJobInterval = startPairingCleanupJob(db);
logger.info('✓ Pairing cleanup job started (runs every 5 minutes)');

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, cleaning up...');
  clearInterval(cleanupJobInterval);
  db.close();
  server.close(() => {
    logger.info('Server shut down gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, cleaning up...');
  clearInterval(cleanupJobInterval);
  db.close();
  server.close(() => {
    logger.info('Server shut down gracefully');
    process.exit(0);
  });
});
```

**Line Numbers:** Insert at appropriate location before final startup (approximately line 2500)

---

## 4. Security Enhancements

### 4.1 Critical Security Fixes

| Issue | Current State | Fixed State | Priority |
|-------|---------------|-------------|----------|
| **PIN Generation** | `Math.random()` (line 673) | `crypto.randomBytes()` in `createPairingSession()` | CRITICAL |
| **Default JWT Secret** | Warning only (line 100) | Require env var in production | HIGH |
| **PIN Brute Force** | No rate limit | 5 attempts/hour per IP | CRITICAL |
| **Token Validation** | JWT only | JWT + database hash check | HIGH |
| **CSRF on Pairing** | Not applied | Applied to all state-changing ops | MEDIUM |

### 4.2 Security Improvements Implementation

#### 4.2.1 Secure PIN Generation

**Current (Line 673):**
```typescript
const pin = Math.floor(100000 + Math.random() * 900000).toString();
```

**Fixed (in migrate-pairing.ts line 315):**
```typescript
import crypto from 'crypto';
const pin = Math.floor(100000 + crypto.randomInt(900000)).toString();
```

**Security Benefit:** Cryptographically secure random number generation prevents PIN prediction attacks.

#### 4.2.2 Rate Limiting Implementation

**Add after line 380:**
```typescript
const pinVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts
  message: { error: 'Too many attempts', retryAfter: '1 hour' },
  keyGenerator: (req) => `${req.ip}-${req.get('user-agent')}`
});
```

**Apply to endpoint:**
```typescript
app.post('/api/pairing/verify', pinVerificationLimiter, ...)
```

**Security Benefit:** Prevents brute force attacks on 6-digit PINs (1,000,000 combinations → max 5 attempts/hour/IP).

#### 4.2.3 Token Hash Validation

**Middleware enhancement (use createUnifiedAuthMiddleware):**

Already implemented in `tokenUtils.ts` lines 135-234. The middleware:
1. Verifies JWT signature
2. Checks token hash in database
3. Validates revocation status
4. Updates last_used timestamp

**Security Benefit:** Allows immediate token revocation (database-backed) vs. waiting for JWT expiration.

#### 4.2.4 JWT Secret Enforcement

**Modify line 96-100:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}
if (JWT_SECRET.length < 32) {
  logger.error('FATAL: JWT_SECRET must be at least 32 characters');
  process.exit(1);
}
```

**Security Benefit:** Prevents weak or default secrets in production.

---

## 5. Database Schema Integration

### 5.1 Migration Execution Order

```
Server Startup (line 451)
    ↓
1. schema.sql (line 464-478)
    ↓
2. schema-migration-areas.sql (line 481-497)
    ↓
3. migratePairingTables(db) (NEW - line 499)
    ↓
4. Database ready for use
```

### 5.2 Schema Changes

#### Tables Created:

**pairing_sessions:**
```sql
CREATE TABLE pairing_sessions (
  id TEXT PRIMARY KEY,
  pin TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending', 'verified', 'completed', 'expired')),
  device_name TEXT,
  device_type TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER
);

CREATE INDEX idx_pairing_pin ON pairing_sessions(pin);
CREATE INDEX idx_pairing_status ON pairing_sessions(status);
CREATE INDEX idx_pairing_expires ON pairing_sessions(expires_at);
```

**Clients table enhancement:**
```sql
ALTER TABLE clients ADD COLUMN device_name TEXT;
ALTER TABLE clients ADD COLUMN device_type TEXT;
ALTER TABLE clients ADD COLUMN assigned_areas TEXT DEFAULT '[]';
ALTER TABLE clients ADD COLUMN token_hash TEXT;
ALTER TABLE clients ADD COLUMN created_by TEXT;

CREATE INDEX idx_clients_active ON clients(is_active);
CREATE INDEX idx_clients_token ON clients(token_hash);
```

### 5.3 Migration Call Location

**Insert at line 499 (after areas migration):**

```typescript
// Run pairing migration (v1.3.25)
try {
  migratePairingTables(db);
  logger.info('✓ Pairing tables migration completed');
} catch (error: any) {
  logger.error('✗ Pairing migration failed:', error.message);
  // Don't crash server - graceful degradation
}
```

---

## 6. Token System Integration

### 6.1 Authentication Middleware Replacement

**Current (lines 200-250):** Basic `authenticate` middleware using JWT only

**New Implementation:** Use `createUnifiedAuthMiddleware(db)` from `tokenUtils.ts`

**Replace at line ~200:**

```typescript
// REPLACE existing authenticate middleware with:
const authenticate = createUnifiedAuthMiddleware(db);
```

This middleware handles:
- Admin JWT tokens (existing)
- Client JWT tokens (new)
- Database hash verification
- Revocation checking
- Last-used timestamp updates

### 6.2 Token Generation Flow

```
Admin creates pairing PIN
    ↓
Client verifies PIN
    ↓
verifyPairingSession() → status = 'verified'
    ↓
Client completes pairing
    ↓
generateClientToken(clientId, []) → JWT with empty areas
    ↓
hashToken(token) → SHA256 hash
    ↓
Store hash in clients.token_hash
    ↓
Return token to client
```

### 6.3 Token Update on Area Assignment

```
Admin assigns area to client
    ↓
Update clients.assigned_areas
    ↓
generateClientToken(clientId, updatedAreas) → New JWT
    ↓
hashToken(newToken) → New hash
    ↓
UPDATE clients SET token_hash = newHash
    ↓
Emit WebSocket event with newToken
    ↓
Client receives new token
```

---

## 7. WebSocket Events Integration

### 7.1 Event Types

**Import from services/websocket-events.ts (line 69):**

```typescript
export const EVENT_TYPES = {
  AREA_ADDED: 'area_added',
  AREA_REMOVED: 'area_removed',
  AREA_UPDATED: 'area_updated',
  AREA_ENABLED: 'area_enabled',
  AREA_DISABLED: 'area_disabled',
  TOKEN_REVOKED: 'token_revoked',
  PAIRING_VERIFIED: 'pairing_verified',
  PAIRING_COMPLETED: 'pairing_completed'
};
```

### 7.2 Client Connection Tracking

**Location:** WebSocket connection handler (line 2309)

**Already exists:**
```typescript
// Register client socket for notifications
const clientId = (socket as any).clientId;
if (clientId) {
  registerClientSocket(clientId, socket);
  logger.info(`[WebSocket] Client ${clientId} registered`);
}
```

**Mechanism:**
- `socketAuth.ts` middleware extracts clientId from JWT
- `registerClientSocket()` stores socket in Map<clientId, Socket>
- Enables targeted notifications

### 7.3 Notification Functions Usage

**In pairing complete endpoint (line ~850):**
```typescript
io.emit('pairing_completed', {
  clientId,
  deviceName,
  deviceType,
  timestamp: new Date().toISOString()
});
```

**In area assignment endpoint (line ~1780):**
```typescript
notifyAreaAdded(db, clientId, {
  clientId,
  area: { id: areaId, name: areaName },
  newToken,
  timestamp: new Date().toISOString()
});
```

**In area removal (existing line ~1900):**
```typescript
notifyAreaRemoved(db, clientId, {
  clientId,
  area: { id: areaId, name: areaName },
  timestamp: new Date().toISOString()
});
```

**In token revocation (line ~2040):**
```typescript
notifyClient(db, clientId, EVENT_TYPES.TOKEN_REVOKED, {
  reason: 'Token revoked by administrator',
  timestamp: new Date().toISOString()
});
```

### 7.4 Room Management

**Admin room:**
- `pairing_events` - Receives all pairing-related events

**Client rooms:**
- `area_${areaId}` - One room per area
- Clients join rooms for their assigned areas
- Receive updates only for areas they can access

---

## 8. Implementation Sequence

### 8.1 Phase 1: Database Foundation (30 minutes)

**Step 1.1:** Add imports (line 79)
```bash
# Edit index-simple.ts
# Add pairing imports after line 78
```

**Step 1.2:** Add migration call (line 499)
```bash
# Edit index-simple.ts
# Call migratePairingTables(db) after areas migration
```

**Step 1.3:** Test database setup
```bash
npm run build
npm run dev
# Check logs for "✓ Pairing tables migration completed"
# Verify tables: sqlite3 /data/app01.db ".schema pairing_sessions"
```

---

### 8.2 Phase 2: Security Hardening (45 minutes)

**Step 2.1:** Add PIN verification rate limiter (line 381)
```typescript
// Add pinVerificationLimiter configuration
```

**Step 2.2:** Replace authenticate middleware (line ~200)
```typescript
const authenticate = createUnifiedAuthMiddleware(db);
```

**Step 2.3:** Enforce JWT_SECRET requirement (line 96)
```typescript
if (!JWT_SECRET || JWT_SECRET.length < 32) process.exit(1);
```

**Step 2.4:** Test security
```bash
# Test rate limiting:
curl -X POST http://localhost:3000/api/pairing/verify \
  -H "Content-Type: application/json" \
  -d '{"pin":"123456"}' \
  # Repeat 6 times - 6th should fail with 429

# Test JWT enforcement:
unset JWT_SECRET
npm run dev  # Should exit with error
```

---

### 8.3 Phase 3: Pairing Endpoints (60 minutes)

**Step 3.1:** Replace /api/pairing/create (lines 662-698)
```typescript
// Delete old implementation
// Insert new secure implementation (lines 662-887)
```

**Step 3.2:** Add /api/pairing/verify
**Step 3.3:** Add /api/pairing/complete
**Step 3.4:** Add /api/pairing/status

**Step 3.5:** Test pairing flow
```bash
# 1. Login as admin
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r .token)

# 2. Generate PIN
PIN_DATA=$(curl -X POST http://localhost:3000/api/pairing/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")
PIN=$(echo $PIN_DATA | jq -r .pin)
SESSION_ID=$(echo $PIN_DATA | jq -r .id)

# 3. Verify PIN
VERIFY=$(curl -X POST http://localhost:3000/api/pairing/verify \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"$PIN\",\"deviceName\":\"Test Device\"}")

# 4. Complete pairing
CLIENT_TOKEN=$(curl -X POST http://localhost:3000/api/pairing/complete \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"deviceName\":\"Test Device\"}" | jq -r .token)

echo "Client token: $CLIENT_TOKEN"

# 5. Test client authentication
curl -X GET http://localhost:3000/api/clients/me \
  -H "Authorization: Bearer $CLIENT_TOKEN"
```

---

### 8.4 Phase 4: Client Management (45 minutes)

**Step 4.1:** Add /api/clients/:id/assign-area (line 1690)
**Step 4.2:** Enhance PATCH /api/clients/:id (existing line 1851)
**Step 4.3:** Verify DELETE /api/clients/:id (existing line 1951)
**Step 4.4:** Verify POST /api/clients/:id/revoke (existing line 2011)

**Step 4.5:** Test client management
```bash
# Assign area to client
AREA_ID=$(curl -X GET http://localhost:3000/api/areas \
  -H "Authorization: Bearer $TOKEN" | jq -r .[0].id)

curl -X POST http://localhost:3000/api/clients/client_xxx/assign-area \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"areaId\":\"$AREA_ID\"}"

# Delete client
curl -X DELETE http://localhost:3000/api/clients/client_xxx \
  -H "Authorization: Bearer $TOKEN"
```

---

### 8.5 Phase 5: WebSocket Events (30 minutes)

**Step 5.1:** Add event handlers (line 2350)
- subscribe_pairing (admin only)
- subscribe_areas (client only)

**Step 5.2:** Add cleanup job (line 2500)

**Step 5.3:** Test WebSocket events
```javascript
// Client-side test
const socket = io('http://localhost:3000', {
  auth: { token: CLIENT_TOKEN }
});

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('subscribe_areas', {});
});

socket.on('area_added', (data) => {
  console.log('New area assigned:', data);
});

socket.on('token_revoked', (data) => {
  console.log('Token revoked:', data);
  // Client should re-pair
});
```

---

### 8.6 Phase 6: Integration Testing (60 minutes)

**Test Suite:**

```bash
# Run integration test script
npm run test:integration

# Manual test checklist:
# ✓ Admin login
# ✓ Generate PIN (crypto.randomBytes)
# ✓ Verify PIN (rate limited)
# ✓ Complete pairing
# ✓ Client authentication
# ✓ Assign area to client
# ✓ Client receives area_added event
# ✓ Revoke token
# ✓ Client receives token_revoked event
# ✓ Cleanup job runs (check logs after 5 minutes)
```

---

## 9. Testing Requirements

### 9.1 Unit Tests

**File:** `tests/pairing.test.ts`

```typescript
describe('Pairing System', () => {
  describe('PIN Generation', () => {
    it('should generate 6-digit PIN using crypto', () => {
      const session = createPairingSession(db, 'admin');
      expect(session.pin).toMatch(/^\d{6}$/);
    });

    it('should not use Math.random()', () => {
      // Verify crypto.randomInt or crypto.randomBytes is used
      const spy = jest.spyOn(crypto, 'randomInt');
      createPairingSession(db, 'admin');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('PIN Verification', () => {
    it('should rate limit after 5 attempts', async () => {
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post('/api/pairing/verify')
          .send({ pin: '000000' });

        if (i < 5) {
          expect(res.status).toBe(401); // Invalid PIN
        } else {
          expect(res.status).toBe(429); // Too many requests
        }
      }
    });

    it('should reject expired PINs', async () => {
      // Create session with expired timestamp
      const expiredSession = db.prepare(`
        INSERT INTO pairing_sessions (id, pin, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('test_session', '123456', 'pending',
             Date.now() - 10 * 60 * 1000,
             Date.now() - 5 * 60 * 1000);

      const res = await request(app)
        .post('/api/pairing/verify')
        .send({ pin: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid PIN');
    });
  });

  describe('Token Management', () => {
    it('should generate valid JWT token', () => {
      const token = generateClientToken('client_test', ['area_1']);
      const decoded = verifyClientToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded.clientId).toBe('client_test');
      expect(decoded.assignedAreas).toEqual(['area_1']);
    });

    it('should hash token with SHA256', () => {
      const token = 'test_token_12345';
      const hash = hashToken(token);

      expect(hash).toHaveLength(64); // SHA256 = 64 hex chars
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should validate token against database hash', async () => {
      const token = generateClientToken('client_test', []);
      const hash = hashToken(token);

      // Store in database
      db.prepare(`
        INSERT INTO clients (id, name, token_hash, assigned_areas, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('client_test', 'Test Client', hash, '[]', 1, Date.now());

      // Test authentication
      const res = await request(app)
        .get('/api/clients/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Area Assignment', () => {
    it('should issue new token when area assigned', async () => {
      const adminToken = await getAdminToken();

      const res = await request(app)
        .post('/api/clients/client_test/assign-area')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ areaId: 'area_test' });

      expect(res.status).toBe(200);
      expect(res.body.newToken).toBeDefined();

      // Verify new token includes area
      const decoded = verifyClientToken(res.body.newToken);
      expect(decoded.assignedAreas).toContain('area_test');
    });
  });
});
```

---

### 9.2 Integration Tests

**File:** `tests/integration/pairing-flow.test.ts`

```typescript
describe('Complete Pairing Flow', () => {
  let adminToken: string;
  let pin: string;
  let sessionId: string;
  let clientToken: string;

  it('should complete full pairing flow', async () => {
    // 1. Admin login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin' });
    adminToken = loginRes.body.token;

    // 2. Generate PIN
    const pinRes = await request(app)
      .post('/api/pairing/create')
      .set('Authorization', `Bearer ${adminToken}`);
    pin = pinRes.body.pin;
    sessionId = pinRes.body.id;

    expect(pin).toMatch(/^\d{6}$/);

    // 3. Verify PIN
    const verifyRes = await request(app)
      .post('/api/pairing/verify')
      .send({ pin, deviceName: 'Integration Test Device' });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.sessionId).toBe(sessionId);

    // 4. Complete pairing
    const completeRes = await request(app)
      .post('/api/pairing/complete')
      .send({ sessionId, deviceName: 'Integration Test Device' });

    clientToken = completeRes.body.token;
    expect(clientToken).toBeDefined();

    // 5. Test client authentication
    const meRes = await request(app)
      .get('/api/clients/me')
      .set('Authorization', `Bearer ${clientToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.deviceName).toBe('Integration Test Device');
  });

  it('should handle area assignment and token refresh', async () => {
    // Create test area
    const areaRes = await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Area', entityIds: ['light.test'] });

    const areaId = areaRes.body.id;

    // Assign area to client
    const assignRes = await request(app)
      .post('/api/clients/client_xxx/assign-area')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ areaId });

    expect(assignRes.status).toBe(200);
    const newToken = assignRes.body.newToken;

    // Verify new token works
    const meRes = await request(app)
      .get('/api/clients/me')
      .set('Authorization', `Bearer ${newToken}`);

    expect(meRes.body.assignedAreas).toHaveLength(1);
  });
});
```

---

### 9.3 Security Tests

**File:** `tests/security/rate-limiting.test.ts`

```typescript
describe('Security: Rate Limiting', () => {
  it('should block after 5 PIN verification attempts', async () => {
    const attempts = [];

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/pairing/verify')
        .send({ pin: `${100000 + i}` });

      attempts.push(res.status);
    }

    // First 5 should be 401 (invalid PIN)
    expect(attempts.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);

    // Next 5 should be 429 (rate limited)
    expect(attempts.slice(5)).toEqual([429, 429, 429, 429, 429]);
  });

  it('should reset rate limit after 1 hour', async () => {
    // Mock time passage
    jest.useFakeTimers();

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/pairing/verify').send({ pin: '000000' });
    }

    // Verify blocked
    let res = await request(app).post('/api/pairing/verify').send({ pin: '000000' });
    expect(res.status).toBe(429);

    // Advance time 1 hour
    jest.advanceTimersByTime(60 * 60 * 1000);

    // Should work again
    res = await request(app).post('/api/pairing/verify').send({ pin: '000000' });
    expect(res.status).toBe(401); // Invalid PIN, but not rate limited

    jest.useRealTimers();
  });
});
```

---

### 9.4 WebSocket Tests

**File:** `tests/websocket/events.test.ts`

```typescript
import io from 'socket.io-client';

describe('WebSocket Events', () => {
  let adminSocket: any;
  let clientSocket: any;

  beforeEach(() => {
    adminSocket = io('http://localhost:3000', {
      auth: { token: ADMIN_TOKEN }
    });

    clientSocket = io('http://localhost:3000', {
      auth: { token: CLIENT_TOKEN }
    });
  });

  afterEach(() => {
    adminSocket.close();
    clientSocket.close();
  });

  it('should emit pairing_completed to admin', (done) => {
    adminSocket.emit('subscribe_pairing', {});

    adminSocket.on('pairing_completed', (data: any) => {
      expect(data.clientId).toBeDefined();
      expect(data.deviceName).toBeDefined();
      done();
    });

    // Trigger pairing completion
    completePairingFlow();
  });

  it('should emit area_added to client', (done) => {
    clientSocket.emit('subscribe_areas', {});

    clientSocket.on('area_added', (data: any) => {
      expect(data.area.id).toBeDefined();
      expect(data.newToken).toBeDefined();
      done();
    });

    // Trigger area assignment via admin API
    assignAreaToClient();
  });

  it('should emit token_revoked and disconnect client', (done) => {
    clientSocket.on('token_revoked', (data: any) => {
      expect(data.reason).toContain('revoked');
      done();
    });

    clientSocket.on('disconnect', () => {
      // Client should be disconnected after token revocation
    });

    // Trigger token revocation
    revokeClientToken();
  });
});
```

---

## 10. Security Checklist

### 10.1 Pre-Deployment Checklist

- [ ] **JWT_SECRET Enforcement**
  - [ ] Environment variable required (non-default)
  - [ ] Minimum 32 characters enforced
  - [ ] Server exits if JWT_SECRET invalid
  - [ ] Documented in deployment guide

- [ ] **PIN Security**
  - [ ] `crypto.randomBytes()` or `crypto.randomInt()` used (NOT `Math.random()`)
  - [ ] 6-digit PIN (100,000 - 999,999 range)
  - [ ] 5-minute expiration enforced
  - [ ] Expired PINs automatically cleaned up

- [ ] **Rate Limiting**
  - [ ] PIN verification: 5 attempts/hour per IP
  - [ ] Auth endpoints: 10 attempts/15min per IP
  - [ ] Write endpoints: 50 requests/15min per IP
  - [ ] Read endpoints: 100 requests/15min per IP

- [ ] **Token Management**
  - [ ] Tokens hashed with SHA256 before storage
  - [ ] Database hash validation on every request
  - [ ] Revocation immediately disconnects WebSocket
  - [ ] Token refresh on area assignment

- [ ] **CSRF Protection**
  - [ ] Applied to all POST/PUT/PATCH/DELETE endpoints
  - [ ] Skipped for Bearer token authentication
  - [ ] Token endpoint accessible without CSRF

- [ ] **Input Validation**
  - [ ] Area IDs validated (format: `area_timestamp`)
  - [ ] Entity IDs validated (format: `domain.name`)
  - [ ] Device names sanitized (max 100 chars)
  - [ ] Prepared statements for all queries

- [ ] **Database Security**
  - [ ] File permissions set to 0600 (owner read/write only)
  - [ ] Foreign keys enabled
  - [ ] Indexes on sensitive columns
  - [ ] Backups automated and encrypted

---

### 10.2 Code Review Checklist

**Imports (Lines 1-88):**
- [ ] All pairing imports added
- [ ] No unused imports
- [ ] Versions pinned in package.json

**Database Migration (Lines 499-507):**
- [ ] `migratePairingTables()` called
- [ ] Error handling doesn't crash server
- [ ] Migration logged

**Rate Limiters (Lines 381-397):**
- [ ] `pinVerificationLimiter` defined
- [ ] Correct window (1 hour)
- [ ] Correct max (5 attempts)
- [ ] IP + User-Agent tracking

**Pairing Endpoints (Lines 662-887):**
- [ ] `/api/pairing/create` - admin only, CSRF protected
- [ ] `/api/pairing/verify` - rate limited, no auth
- [ ] `/api/pairing/complete` - auth limited, creates client
- [ ] `/api/pairing/status` - admin only, read limited

**Client Endpoints (Lines 1690-1799):**
- [ ] `/api/clients/:id/assign-area` - admin only, CSRF protected
- [ ] Area existence validated
- [ ] New token generated
- [ ] WebSocket event emitted

**WebSocket (Lines 2350-2425):**
- [ ] `subscribe_pairing` - admin only
- [ ] `subscribe_areas` - client only
- [ ] Client socket registered
- [ ] Events emitted correctly

**Cleanup Job (Line 2500):**
- [ ] `startPairingCleanupJob()` called
- [ ] Interval stored for shutdown
- [ ] SIGTERM/SIGINT handlers added

---

### 10.3 Testing Checklist

**Unit Tests:**
- [ ] PIN generation uses crypto
- [ ] Token hashing produces 64-char hex
- [ ] Rate limiter blocks 6th attempt
- [ ] Expired PINs rejected
- [ ] Token validation against DB hash

**Integration Tests:**
- [ ] Full pairing flow (admin → PIN → verify → complete → client auth)
- [ ] Area assignment updates token
- [ ] Token revocation disconnects client
- [ ] Cleanup job deletes expired sessions

**Security Tests:**
- [ ] Rate limiting enforced
- [ ] CSRF tokens required
- [ ] Invalid tokens rejected
- [ ] Revoked tokens rejected
- [ ] SQL injection prevented

**Performance Tests:**
- [ ] 100 concurrent pairing requests
- [ ] 1000 clients with WebSocket connections
- [ ] Database query times < 10ms
- [ ] Token verification < 5ms

---

### 10.4 Deployment Checklist

**Environment Variables:**
- [ ] `JWT_SECRET` set (min 32 chars, random)
- [ ] `DATABASE_PATH` set
- [ ] `NODE_ENV=production`
- [ ] `TLS_ENABLED=true` (if applicable)

**Database:**
- [ ] Migrations run successfully
- [ ] Indexes created
- [ ] Permissions set (0600)
- [ ] Backup job configured

**Monitoring:**
- [ ] Logs captured (Winston/Syslog)
- [ ] Metrics exported (Prometheus)
- [ ] Alerts configured (failed logins, rate limits)
- [ ] Health endpoint monitored

**Documentation:**
- [ ] API docs updated (Swagger)
- [ ] Deployment guide updated
- [ ] Security guide published
- [ ] Changelog updated (v1.3.25)

---

## Appendix A: Line-by-Line Change Summary

| Line Range | Action | Description |
|------------|--------|-------------|
| 79-88 | ADD | Import pairing functions from migrate-pairing.ts |
| 96-100 | MODIFY | Enforce JWT_SECRET requirement (exit if missing) |
| 381-397 | ADD | PIN verification rate limiter (5/hour/IP) |
| 499-507 | ADD | Call migratePairingTables(db) |
| 662-698 | REPLACE | Replace insecure PIN generation with secure implementation |
| 699-887 | ADD | New pairing endpoints (verify, complete, status) |
| 1690-1799 | ADD | POST /api/clients/:id/assign-area endpoint |
| 2350-2425 | ADD | WebSocket event handlers (subscribe_pairing, subscribe_areas) |
| 2500-2530 | ADD | Cleanup job and graceful shutdown handlers |

**Total Lines Added:** ~450 lines
**Total Lines Modified:** ~40 lines
**Total Lines Removed:** ~37 lines
**New File Size:** ~2,969 lines (from 2,556)

---

## Appendix B: Testing Scripts

### B.1 Full Pairing Flow Test

```bash
#!/bin/bash
# test-pairing-flow.sh

BASE_URL="http://localhost:3000"

echo "=== Pairing Flow Test ==="

# 1. Admin Login
echo "1. Admin login..."
ADMIN_TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r .token)

if [ "$ADMIN_TOKEN" == "null" ]; then
  echo "❌ Admin login failed"
  exit 1
fi
echo "✓ Admin token: ${ADMIN_TOKEN:0:20}..."

# 2. Generate PIN
echo "2. Generate pairing PIN..."
PIN_DATA=$(curl -s -X POST "$BASE_URL/api/pairing/create" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

PIN=$(echo $PIN_DATA | jq -r .pin)
SESSION_ID=$(echo $PIN_DATA | jq -r .id)

if [ "$PIN" == "null" ]; then
  echo "❌ PIN generation failed"
  exit 1
fi
echo "✓ PIN: $PIN (Session: $SESSION_ID)"

# 3. Verify PIN
echo "3. Verify PIN..."
VERIFY=$(curl -s -X POST "$BASE_URL/api/pairing/verify" \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"$PIN\",\"deviceName\":\"Test Device\",\"deviceType\":\"mobile\"}")

VERIFY_STATUS=$(echo $VERIFY | jq -r .status)

if [ "$VERIFY_STATUS" != "verified" ]; then
  echo "❌ PIN verification failed"
  exit 1
fi
echo "✓ PIN verified"

# 4. Complete Pairing
echo "4. Complete pairing..."
COMPLETE=$(curl -s -X POST "$BASE_URL/api/pairing/complete" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"deviceName\":\"Test Device\"}")

CLIENT_TOKEN=$(echo $COMPLETE | jq -r .token)
CLIENT_ID=$(echo $COMPLETE | jq -r .clientId)

if [ "$CLIENT_TOKEN" == "null" ]; then
  echo "❌ Pairing completion failed"
  exit 1
fi
echo "✓ Client ID: $CLIENT_ID"
echo "✓ Client token: ${CLIENT_TOKEN:0:30}..."

# 5. Test Client Authentication
echo "5. Test client authentication..."
ME=$(curl -s -X GET "$BASE_URL/api/clients/me" \
  -H "Authorization: Bearer $CLIENT_TOKEN")

ME_ID=$(echo $ME | jq -r .id)

if [ "$ME_ID" != "$CLIENT_ID" ]; then
  echo "❌ Client authentication failed"
  exit 1
fi
echo "✓ Client authenticated successfully"

# 6. Create Test Area
echo "6. Create test area..."
AREA=$(curl -s -X POST "$BASE_URL/api/areas" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Area","entityIds":["light.test"]}')

AREA_ID=$(echo $AREA | jq -r .id)
echo "✓ Area created: $AREA_ID"

# 7. Assign Area to Client
echo "7. Assign area to client..."
ASSIGN=$(curl -s -X POST "$BASE_URL/api/clients/$CLIENT_ID/assign-area" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"areaId\":\"$AREA_ID\"}")

NEW_TOKEN=$(echo $ASSIGN | jq -r .newToken)

if [ "$NEW_TOKEN" == "null" ]; then
  echo "❌ Area assignment failed"
  exit 1
fi
echo "✓ Area assigned, new token issued"

# 8. Verify New Token
echo "8. Verify new token includes area..."
ME_NEW=$(curl -s -X GET "$BASE_URL/api/clients/me" \
  -H "Authorization: Bearer $NEW_TOKEN")

AREA_COUNT=$(echo $ME_NEW | jq '.assignedAreas | length')

if [ "$AREA_COUNT" -lt 1 ]; then
  echo "❌ New token doesn't include area"
  exit 1
fi
echo "✓ New token valid with $AREA_COUNT assigned area(s)"

# 9. Cleanup
echo "9. Cleanup..."
curl -s -X DELETE "$BASE_URL/api/clients/$CLIENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null

curl -s -X DELETE "$BASE_URL/api/areas/$AREA_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null

echo "✓ Cleanup complete"

echo ""
echo "=== ✅ All tests passed ==="
```

---

### B.2 Rate Limiting Test

```bash
#!/bin/bash
# test-rate-limiting.sh

BASE_URL="http://localhost:3000"

echo "=== Rate Limiting Test ==="

for i in {1..10}; do
  echo "Attempt $i..."
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/pairing/verify" \
    -H "Content-Type: application/json" \
    -d '{"pin":"000000"}')

  echo "  Status: $STATUS"

  if [ $i -le 5 ]; then
    if [ "$STATUS" != "401" ]; then
      echo "❌ Expected 401 (invalid PIN) on attempt $i, got $STATUS"
      exit 1
    fi
  else
    if [ "$STATUS" != "429" ]; then
      echo "❌ Expected 429 (rate limited) on attempt $i, got $STATUS"
      exit 1
    fi
  fi
done

echo "✅ Rate limiting working correctly"
```

---

## Appendix C: Architecture Decision Records

### ADR-001: Use crypto.randomBytes for PIN Generation

**Status:** Accepted
**Date:** 2025-12-02

**Context:**
Current implementation uses `Math.random()` for generating 6-digit PINs. This is cryptographically insecure and predictable.

**Decision:**
Replace `Math.random()` with `crypto.randomInt()` from Node.js crypto module.

**Consequences:**
- Positive: Cryptographically secure random number generation
- Positive: Prevents PIN prediction attacks
- Negative: Slightly slower (negligible for this use case)

**Implementation:**
```typescript
import crypto from 'crypto';
const pin = Math.floor(100000 + crypto.randomInt(900000)).toString();
```

---

### ADR-002: Database-Backed Token Revocation

**Status:** Accepted
**Date:** 2025-12-02

**Context:**
JWT tokens cannot be revoked before expiration. Need immediate revocation capability for security incidents.

**Decision:**
Store SHA256 hash of tokens in database. Validate both JWT signature AND database hash on every request.

**Consequences:**
- Positive: Immediate token revocation
- Positive: Centralized token management
- Negative: Additional database query per request (~1ms overhead)
- Negative: Increased storage (64 bytes per token)

**Alternatives Considered:**
1. Redis blacklist - requires additional infrastructure
2. Short-lived tokens with refresh - complex client-side logic
3. JWT expiration only - no revocation capability

---

### ADR-003: Rate Limiting Strategy

**Status:** Accepted
**Date:** 2025-12-02

**Context:**
6-digit PINs have only 1 million combinations. Brute force attack takes ~16 hours at 1 attempt/second without rate limiting.

**Decision:**
Implement 5 attempts per hour per IP for PIN verification endpoint.

**Math:**
- 1,000,000 combinations
- 5 attempts/hour/IP
- 1,000,000 / 5 = 200,000 hours = 22.8 years (single IP)
- Even with 100 IPs: 228 days (impractical)

**Consequences:**
- Positive: Effectively prevents brute force
- Positive: Minimal impact on legitimate users
- Negative: Users locked out for 1 hour after 5 mistakes

---

## Appendix D: Rollback Plan

### Rollback Procedure

If critical issues are discovered post-deployment:

**Step 1: Identify Issue**
```bash
# Check logs
tail -f /var/log/hasync/server.log | grep ERROR

# Check database
sqlite3 /data/app01.db "SELECT COUNT(*) FROM pairing_sessions;"
```

**Step 2: Quick Fix (if possible)**
```bash
# Disable pairing endpoints via environment variable
export PAIRING_ENABLED=false
pm2 restart hasync
```

**Step 3: Full Rollback**
```bash
# Stop server
pm2 stop hasync

# Restore previous version
git checkout v1.3.22
npm install
npm run build

# Restore database (if needed)
cp /data/app01.db.backup /data/app01.db

# Restart server
pm2 start hasync
```

**Step 4: Verify**
```bash
# Check version
curl http://localhost:3000/api/health | jq .version
# Should show "1.3.22"

# Test basic functionality
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-02 | Lead Architect 1 | Initial integration plan created |

---

**END OF DOCUMENT**
