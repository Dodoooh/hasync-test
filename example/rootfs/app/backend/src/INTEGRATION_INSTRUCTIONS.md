# Token Utilities Integration Instructions

## Overview
This document provides step-by-step instructions for integrating the new token generation system into `index-simple.ts`.

## Files Created
1. `/utils/tokenUtils.ts` - Token generation, verification, and authentication middleware
2. `/database/migrations/005_add_client_tokens.sql` - Database migration for client_tokens table

## Integration Steps

### Step 1: Import Token Utilities (Already Done)
The imports have been added at the top of `index-simple.ts`:
```typescript
import {
  generateClientToken,
  hashToken,
  verifyClientToken,
  createUnifiedAuthMiddleware,
  revokeClientToken,
  cleanupExpiredTokens
} from './utils/tokenUtils';
```

### Step 2: Replace the `authenticate` Middleware Declaration

**Find this code (around line 236-278):**
```typescript
// Authentication Middleware - Extract and verify JWT token
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided'
    });
  }

  try {
    // Verify and decode JWT token
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'hasync-backend',
      audience: 'hasync-client'
    }) as { username: string; role: string; iat: number; exp: number };

    // Attach user information to request
    req.user = {
      id: decoded.username,
      username: decoded.username,
      role: decoded.role
    };
    next();
  } catch (error: any) {
    logger.warn(`Authentication failed: ${error.message}`);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.',
        expiredAt: error.expiredAt
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token signature'
      });
    } else {
      return res.status(401).json({
        error: 'Authentication failed'
      });
    }
  }
};
```

**Replace with:**
```typescript
// Authentication Middleware - Will be initialized after database is ready
// Supports both admin JWT tokens and client tokens with area-based access control
let authenticate: any;
```

### Step 3: Initialize Unified Auth Middleware After Database Creation

**Find this code (around line 484-496):**
```typescript
  // Create initial backup on startup
  const backupDir = process.env.BACKUP_DIR || join(__dirname, '../../backups');
  try {
    createDatabaseBackup(db, backupDir);
    cleanOldBackups(backupDir, 10);
  } catch (error) {
    console.warn('⚠ Failed to create startup backup:', error);
  }
} catch (error) {
  console.error('✗ Database error:', error);
}
```

**Add this AFTER the database initialization block (after line 496):**
```typescript
// Initialize unified authentication middleware (admin + client tokens)
if (db) {
  authenticate = createUnifiedAuthMiddleware(db);
  logger.info('✓ Unified authentication middleware initialized');

  // Schedule periodic cleanup of expired tokens (every 24 hours)
  setInterval(() => {
    try {
      const cleaned = cleanupExpiredTokens(db);
      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} expired client tokens`);
      }
    } catch (error) {
      logger.error('Failed to cleanup expired tokens:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
} else {
  // Fallback to no-op middleware if database failed
  authenticate = (req: any, res: any, next: any) => {
    res.status(503).json({ error: 'Database not available' });
  };
  logger.error('❌ Database not available - authentication disabled');
}
```

### Step 4: Run Database Migration

The migration file `005_add_client_tokens.sql` will be automatically applied on next server start. Alternatively, run it manually:

```bash
sqlite3 /data/app01.db < /app/backend/src/database/migrations/005_add_client_tokens.sql
```

## API Usage Examples

### Generate Client Token (Admin Only)
```typescript
// In your pairing completion endpoint:
app.post('/api/pairing/complete', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { clientId, assignedAreas } = req.body;

  // Generate token
  const token = generateClientToken(clientId, assignedAreas);
  const tokenHash = hashToken(token);

  // Store in database
  const tokenId = `token_${Date.now()}`;
  const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60); // 10 years

  db.prepare(`
    INSERT INTO client_tokens (id, client_id, token_hash, assigned_areas, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(tokenId, clientId, tokenHash, JSON.stringify(assignedAreas), expiresAt);

  res.json({ token, clientId, assignedAreas });
});
```

### Revoke Client Token
```typescript
app.post('/api/client-tokens/:tokenId/revoke', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { tokenId } = req.params;
  const { reason } = req.body;

  // Get token hash from database
  const tokenRecord = db.prepare('SELECT token_hash FROM client_tokens WHERE id = ?').get(tokenId);
  if (!tokenRecord) {
    return res.status(404).json({ error: 'Token not found' });
  }

  const revoked = revokeClientToken(db, tokenRecord.token_hash, reason);
  res.json({ revoked, tokenId, reason });
});
```

### Client Authentication
Clients can now use their token to access APIs:
```bash
curl -H "Authorization: Bearer <client-token>" http://localhost:8123/api/entities
```

The unified middleware will:
1. Detect if token is admin or client type
2. Verify JWT signature
3. Check database for revocation (client tokens only)
4. Update last_used timestamp
5. Attach user/client info to `req.user` or `req.client`

## Type Definitions

Add to your TypeScript types file:
```typescript
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: 'admin';
      };
      client?: {
        id: string;
        clientId: string;
        role: 'client';
        assignedAreas: string[];
      };
    }
  }
}
```

## Testing

### Test Admin Token
```bash
# Login as admin
TOKEN=$(curl -X POST http://localhost:8123/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}' \
  | jq -r '.token')

# Use admin token
curl -H "Authorization: Bearer $TOKEN" http://localhost:8123/api/entities
```

### Test Client Token
```bash
# Generate client token (as admin)
CLIENT_TOKEN=$(curl -X POST http://localhost:8123/api/pairing/complete \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"client_123","assignedAreas":["area_1","area_2"]}' \
  | jq -r '.token')

# Use client token
curl -H "Authorization: Bearer $CLIENT_TOKEN" http://localhost:8123/api/entities
```

## Security Notes

1. **Token Storage**: Client tokens are stored as SHA256 hashes in the database
2. **Revocation**: Tokens can be revoked without changing JWT secret
3. **Expiration**: Client tokens expire after 10 years (configurable)
4. **Area Access**: Clients are restricted to their assigned areas
5. **Last Used**: Token usage is tracked for security auditing

## Maintenance

The server automatically cleans up expired tokens every 24 hours. Manual cleanup:
```typescript
const cleaned = cleanupExpiredTokens(db);
console.log(`Cleaned ${cleaned} expired tokens`);
```

## Rollback

If you need to rollback:
1. Remove the imports from `index-simple.ts`
2. Restore the original `authenticate` middleware
3. Drop the table: `DROP TABLE IF EXISTS client_tokens;`
