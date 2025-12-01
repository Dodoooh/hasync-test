# Client Token System - Quick Start Guide

## 🚀 5-Minute Integration

### Step 1: Update `index-simple.ts` (3 changes)

#### Change 1: Replace authenticate middleware (~line 237)
```typescript
// DELETE THIS:
const authenticate = (req, res, next) => { ... 40 lines ... };

// REPLACE WITH THIS:
let authenticate: any;
```

#### Change 2: Initialize after database (~line 496)
```typescript
// ADD THIS after database initialization:
if (db) {
  authenticate = createUnifiedAuthMiddleware(db);
  logger.info('✓ Unified authentication middleware initialized');

  setInterval(() => {
    const cleaned = cleanupExpiredTokens(db);
    if (cleaned > 0) logger.info(`Cleaned ${cleaned} expired tokens`);
  }, 24 * 60 * 60 * 1000);
} else {
  authenticate = (req: any, res: any) =>
    res.status(503).json({ error: 'Database not available' });
}
```

#### Change 3: Add routes (~line 1306)
```typescript
// ADD THIS:
import { createClientTokenRouter } from './routes/client-tokens';
app.use('/api/client-tokens', createClientTokenRouter(db, authenticate));
```

### Step 2: Run Migration
```bash
# Automatic on next server start, or run manually:
sqlite3 /data/app01.db < /app/backend/src/database/migrations/005_add_client_tokens.sql
```

### Step 3: Restart Server
```bash
npm run dev
# or
npm start
```

---

## 🎯 Basic Usage

### Generate Client Token (Admin)
```bash
curl -X POST http://localhost:8123/api/client-tokens \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"client_123","assignedAreas":["area_1"]}'
```

### Use Client Token
```bash
curl -H "Authorization: Bearer CLIENT_TOKEN_HERE" \
  http://localhost:8123/api/entities
```

### Revoke Token (Admin)
```bash
curl -X POST http://localhost:8123/api/client-tokens/TOKEN_ID/revoke \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Device lost"}'
```

---

## 📋 API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/client-tokens` | Generate token | Admin |
| GET | `/api/client-tokens` | List tokens | Admin |
| GET | `/api/client-tokens/:id` | Get token details | Admin |
| POST | `/api/client-tokens/:id/revoke` | Revoke token | Admin |
| PATCH | `/api/client-tokens/:id` | Update areas | Admin |
| POST | `/api/client-tokens/cleanup` | Cleanup expired | Admin |
| GET | `/api/client-tokens/stats` | Get statistics | Admin |

---

## 🔑 Key Functions

```typescript
// Generate 10-year client token
const token = generateClientToken(clientId, ['area_1', 'area_2']);

// Hash token for storage
const hash = hashToken(token);

// Verify client token
const decoded = verifyClientToken(token);
// Returns: { clientId: '...', assignedAreas: [...] }

// Revoke token
revokeClientToken(db, tokenHash, 'reason');

// Cleanup expired
const count = cleanupExpiredTokens(db);
```

---

## 📁 Files Created

```
/utils/tokenUtils.ts                    - Core implementation ⭐
/database/migrations/005_add_client_tokens.sql - DB schema
/routes/client-tokens.ts                - REST API
/utils/tokenUtils.test.ts               - Tests
/INTEGRATION_INSTRUCTIONS.md            - Detailed guide
/utils/TOKEN_SYSTEM_SUMMARY.md          - Architecture docs
/DELIVERABLES.md                        - Project summary
/QUICK_START.md                         - This file
```

---

## ✅ Testing

```bash
# Run tests
npm test tokenUtils

# Test admin login (should still work)
curl -X POST http://localhost:8123/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# Generate client token
TOKEN=$(curl -X POST http://localhost:8123/api/client-tokens \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"test_client","assignedAreas":["area_1"]}' \
  | jq -r '.token')

# Test client authentication
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8123/api/entities
```

---

## 🔒 Security Highlights

✅ **SHA256 Hashing** - Raw tokens never stored
✅ **JWT Signatures** - Tamper-proof tokens
✅ **Database Revocation** - Instant token invalidation
✅ **10-Year Expiration** - Long-lived but not permanent
✅ **Area Restrictions** - Clients access only assigned areas
✅ **Audit Trail** - Full usage tracking

---

## 🆘 Troubleshooting

### Import error: Cannot find module 'tokenUtils'
- Check file path: `/utils/tokenUtils.ts` exists
- Restart TypeScript server: `Cmd+Shift+P` > Restart TS Server

### Database error: no such table client_tokens
- Run migration: `sqlite3 /data/app01.db < migrations/005_add_client_tokens.sql`

### Authentication still uses old middleware
- Check `authenticate` is declared as `let`, not `const`
- Ensure initialization happens after database creation

### Client token not working
- Check token hasn't expired (10 years default)
- Check token isn't revoked: `SELECT * FROM client_tokens WHERE token_hash = ?`
- Verify JWT signature is valid

---

## 📊 Quick Stats Query

```sql
-- Get token statistics
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN is_revoked = 0 THEN 1 ELSE 0 END) as active,
  SUM(CASE WHEN is_revoked = 1 THEN 1 ELSE 0 END) as revoked,
  SUM(CASE WHEN expires_at < strftime('%s','now') THEN 1 ELSE 0 END) as expired
FROM client_tokens;
```

---

## 🎓 Full Documentation

- **Integration**: `INTEGRATION_INSTRUCTIONS.md`
- **Architecture**: `TOKEN_SYSTEM_SUMMARY.md`
- **Code**: `tokenUtils.ts` (inline comments)
- **Tests**: `tokenUtils.test.ts`
- **API**: `client-tokens.ts`

---

**Ready to go!** 🚀

Import already added ✅
Just 2 more edits in `index-simple.ts` and you're done!
