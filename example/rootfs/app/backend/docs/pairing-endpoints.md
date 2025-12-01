# Pairing Endpoints Implementation

## Overview
Implemented complete pairing flow with PIN-based authentication and admin approval.

## Endpoints Implemented

### 1. POST /api/pairing/create (ADMIN only)
**Status:** ✅ Already existed, updated to store session in database

**Authentication:** Bearer token (admin role required)

**Request:**
```bash
curl -X POST http://localhost:8123/api/pairing/create \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "id": "pairing_1733098123456",
  "pin": "123456",
  "expiresAt": "2025-12-01T12:05:00.000Z",
  "status": "pending"
}
```

---

### 2. POST /api/pairing/:sessionId/verify (PUBLIC - no auth)
**Status:** ✅ Newly implemented

**Authentication:** None required

**Request:**
```bash
curl -X POST http://localhost:8123/api/pairing/pairing_1733098123456/verify \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "123456",
    "deviceName": "iPhone 15 Pro",
    "deviceType": "mobile"
  }'
```

**Request Body:**
- `pin` (string, required): 6-digit PIN from admin
- `deviceName` (string, required): Device name (1-100 chars)
- `deviceType` (string, required): One of: mobile, tablet, desktop, other

**Response:**
```json
{
  "success": true,
  "message": "PIN verified. Waiting for admin approval.",
  "sessionId": "pairing_1733098123456",
  "status": "verified"
}
```

**WebSocket Event:** Emits `pairing_verified` to notify admin

**Validations:**
- PIN must be exactly 6 digits
- Session must exist and not be expired (5 min)
- Session status must be 'pending'
- Device name 1-100 characters
- Device type from allowed list

---

### 3. POST /api/pairing/:sessionId/complete (ADMIN only)
**Status:** ✅ Newly implemented

**Authentication:** Bearer token (admin role required)

**Request:**
```bash
curl -X POST http://localhost:8123/api/pairing/pairing_1733098123456/complete \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "Living Room Tablet",
    "assignedAreas": ["area_1234567890", "area_9876543210"]
  }'
```

**Request Body:**
- `clientName` (string, required): Client display name (1-100 chars)
- `assignedAreas` (array, optional): Array of area IDs

**Response:**
```json
{
  "success": true,
  "clientId": "client_1733098234567",
  "clientToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "assignedAreas": ["area_1234567890", "area_9876543210"],
  "message": "Pairing completed successfully"
}
```

**Token Details:**
- JWT token with 10 year expiry
- Role: 'client'
- Token is hashed (SHA-256) before storage in database
- Client receives actual token in response and WebSocket event

**WebSocket Event:** Emits `pairing_completed` with token to client

**Database Changes:**
1. Creates new client record in `clients` table
2. Updates pairing session status to 'completed'
3. Logs activity in `activity_log` table

**Validations:**
- Session must exist
- Session status must be 'verified'
- Client name 1-100 characters
- Assigned areas must be an array

---

### 4. GET /api/pairing/:sessionId (PUBLIC)
**Status:** ✅ Newly implemented

**Authentication:** None required

**Request:**
```bash
curl http://localhost:8123/api/pairing/pairing_1733098123456
```

**Response:**
```json
{
  "id": "pairing_1733098123456",
  "status": "verified",
  "deviceName": "iPhone 15 Pro",
  "deviceType": "mobile",
  "expiresAt": "2025-12-01T12:05:00.000Z",
  "createdAt": "2025-12-01T12:00:00.000Z"
}
```

**Status Values:**
- `pending`: PIN generated, waiting for client to verify
- `verified`: Client entered PIN, waiting for admin approval
- `completed`: Admin approved, client token generated

---

### 5. DELETE /api/pairing/:sessionId (ADMIN only)
**Status:** ✅ Newly implemented

**Authentication:** Bearer token (admin role required)

**Request:**
```bash
curl -X DELETE http://localhost:8123/api/pairing/pairing_1733098123456 \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Response:**
```json
{
  "success": true,
  "message": "Pairing session deleted"
}
```

---

## Database Schema Changes

### Migration File: `schema-migration-pairing.sql`
Adds the following columns to `pairing_sessions` table:
- `status` (TEXT): 'pending', 'verified', 'completed'
- `device_name` (TEXT): Device name from verify request
- `device_type` (TEXT): Device type from verify request
- `client_id` (TEXT): Foreign key to clients table after completion
- `client_token_hash` (TEXT): SHA-256 hash of client token

Adds to `clients` table:
- `assigned_areas` (TEXT): JSON array of area IDs

---

## Complete Pairing Flow

### Step 1: Admin Generates PIN
```bash
# Admin logs in first
curl -X POST http://localhost:8123/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }'
# Response: { "token": "admin_jwt_token", ... }

# Admin generates pairing PIN
curl -X POST http://localhost:8123/api/pairing/create \
  -H "Authorization: Bearer admin_jwt_token"
# Response: { "id": "pairing_123", "pin": "456789", ... }
```

### Step 2: Client Enters PIN
```bash
# Client enters PIN on device (no auth needed)
curl -X POST http://localhost:8123/api/pairing/pairing_123/verify \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "456789",
    "deviceName": "Kitchen Tablet",
    "deviceType": "tablet"
  }'
# Response: { "success": true, "status": "verified", ... }
```

### Step 3: Admin Approves Pairing
```bash
# Admin receives WebSocket notification and approves
curl -X POST http://localhost:8123/api/pairing/pairing_123/complete \
  -H "Authorization: Bearer admin_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "Kitchen Display",
    "assignedAreas": ["area_kitchen", "area_dining"]
  }'
# Response: { "clientToken": "client_jwt_token", ... }
```

### Step 4: Client Receives Token
Client listens to WebSocket for `pairing_completed` event:
```javascript
socket.on('pairing_completed', (data) => {
  // data.clientToken - 10 year JWT token
  // data.assignedAreas - areas client can access
  localStorage.setItem('clientToken', data.clientToken);
});
```

---

## Security Features

1. **Rate Limiting:** All endpoints use appropriate rate limiters
   - Auth endpoints: 100 req/15min
   - Write endpoints: 30 req/15min
   - Read endpoints: 500 req/15min

2. **Input Validation:**
   - PIN format validation (6 digits)
   - Device name sanitization (1-100 chars)
   - Device type whitelist
   - Area ID validation

3. **Session Expiry:** 5 minutes from PIN generation

4. **Token Security:**
   - Client tokens stored as SHA-256 hashes
   - 10 year token expiry for clients
   - JWT with proper issuer/audience claims

5. **Role-Based Access:**
   - Only admin can create and complete pairings
   - Only admin can delete sessions
   - Public verify and status endpoints

6. **Audit Trail:** All pairing activities logged in `activity_log` table

---

## Error Handling

All endpoints use proper error responses:

**400 Bad Request:**
```json
{
  "error": "Validation error",
  "message": "PIN must be 6 digits"
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized",
  "message": "No token provided"
}
```

**403 Forbidden:**
```json
{
  "error": "Forbidden",
  "message": "Only admin users can complete pairing"
}
```

**404 Not Found:**
```json
{
  "error": "Not found",
  "message": "Pairing session not found"
}
```

**429 Too Many Requests:**
```json
{
  "error": "Too many authentication attempts",
  "message": "Please try again later. Maximum 100 attempts per 15 minutes.",
  "retryAfter": "15 minutes"
}
```

---

## WebSocket Events

### `pairing_verified`
Emitted when client verifies PIN (admin receives this):
```json
{
  "sessionId": "pairing_123",
  "deviceName": "Kitchen Tablet",
  "deviceType": "tablet",
  "timestamp": "2025-12-01T12:00:00.000Z"
}
```

### `pairing_completed`
Emitted when admin approves pairing (client receives this):
```json
{
  "sessionId": "pairing_123",
  "clientId": "client_456",
  "clientToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "assignedAreas": ["area_kitchen"],
  "timestamp": "2025-12-01T12:01:00.000Z"
}
```

---

## Testing

### Test Complete Flow
```bash
# 1. Admin login
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8123/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"test123"}' | jq -r '.token')

# 2. Generate PIN
PAIRING=$(curl -s -X POST http://localhost:8123/api/pairing/create \
  -H "Authorization: Bearer $ADMIN_TOKEN")
SESSION_ID=$(echo $PAIRING | jq -r '.id')
PIN=$(echo $PAIRING | jq -r '.pin')
echo "Session: $SESSION_ID, PIN: $PIN"

# 3. Client verifies PIN
curl -X POST http://localhost:8123/api/pairing/$SESSION_ID/verify \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"$PIN\",\"deviceName\":\"Test Device\",\"deviceType\":\"mobile\"}"

# 4. Check status
curl http://localhost:8123/api/pairing/$SESSION_ID

# 5. Admin completes pairing
CLIENT_TOKEN=$(curl -s -X POST http://localhost:8123/api/pairing/$SESSION_ID/complete \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientName":"Test Client","assignedAreas":[]}' | jq -r '.clientToken')
echo "Client token: $CLIENT_TOKEN"

# 6. Verify client token works
curl http://localhost:8123/api/auth/verify \
  -H "Authorization: Bearer $CLIENT_TOKEN"
```

---

## Files Modified

1. `/src/index-simple.ts`
   - Added 4 new pairing endpoints
   - Updated `/api/pairing/create` to store session in database
   - Added pairing migration runner
   - Imported token utility functions

2. `/src/database/schema-migration-pairing.sql` (NEW)
   - Database schema updates for pairing flow

3. `/docs/pairing-endpoints.md` (NEW)
   - This documentation file

---

## Implementation Notes

- Uses existing authentication middleware and error handlers
- Follows existing code patterns (asyncHandler, prepared statements)
- Integrated with existing rate limiters
- Uses tokenUtils for consistent token generation/hashing
- Proper logging at all stages
- WebSocket integration for real-time notifications
- All input properly validated and sanitized
