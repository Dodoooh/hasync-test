# HAsync API Reference (v1.4.0)

Complete API documentation for the HAsync Home Assistant management interface.

## Table of Contents

- [Authentication](#authentication)
- [Pairing](#pairing)
- [Entities](#entities)
- [Areas](#areas)
- [Clients](#clients)
- [Configuration](#configuration)
- [Health & Monitoring](#health--monitoring)
- [Privacy & GDPR](#privacy--gdpr)

---

## Authentication

All protected endpoints require JWT Bearer token authentication via the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

### Admin Login

**POST** `/api/admin/login`

Authenticate as administrator and receive a JWT token.

**Request Body:**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "admin",
    "role": "admin"
  },
  "expiresIn": "24h"
}
```

**Token Expiration:** 24 hours

**Rate Limit:** 10 requests per 15 minutes

---

### Verify Token

**GET** `/api/auth/verify`

Verify JWT token validity.

**Request Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response (200 OK):**
```json
{
  "valid": true,
  "user": {
    "username": "admin",
    "role": "admin"
  }
}
```

---

### CSRF Token

**GET** `/api/csrf-token`

Get CSRF token for state-changing operations (POST, PUT, DELETE, PATCH).

**Response (200 OK):**
```json
{
  "csrfToken": "random-csrf-token-string"
}
```

**Note:** CSRF protection is automatically skipped when using JWT Bearer authentication. CSRF tokens are primarily for session-based authentication.

---

## Pairing

Client devices connect to HAsync through a secure pairing process using PIN verification.

### Create Pairing Session

**POST** `/api/pairing/create`

Admin creates a new pairing session with a random 6-digit PIN.

**Authentication Required:** Yes (Admin JWT)

**Response (201 Created):**
```json
{
  "id": "pairing-session-uuid",
  "pin": "123456",
  "expiresAt": "2025-12-02T15:30:00.000Z",
  "verified": false
}
```

**PIN Expiration:** 5 minutes

---

### Verify PIN (Client Side)

**POST** `/api/pairing/:sessionId/verify`

Client device verifies the PIN shown on admin interface.

**Authentication Required:** No (public endpoint for client devices)

**URL Parameters:**
- `sessionId` - Pairing session ID

**Request Body:**
```json
{
  "pin": "123456",
  "deviceName": "Living Room Tablet",
  "deviceType": "tablet"
}
```

**Device Types:** `phone`, `tablet`, `desktop`, `kiosk`, `tv`, `other`

**Response (200 OK):**
```json
{
  "verified": true,
  "sessionId": "pairing-session-uuid"
}
```

**Events:** Triggers WebSocket event `pairing_verified` to notify admin interface.

---

### Complete Pairing (Admin Side)

**POST** `/api/pairing/:sessionId/complete`

Admin completes the pairing by assigning areas and client name.

**Authentication Required:** Yes (Admin JWT)

**URL Parameters:**
- `sessionId` - Pairing session ID

**Request Body:**
```json
{
  "clientName": "Living Room Tablet",
  "areaIds": ["area-uuid-1", "area-uuid-2"]
}
```

**Response (200 OK):**
```json
{
  "client": {
    "id": "client-uuid",
    "name": "Living Room Tablet",
    "deviceType": "tablet",
    "token": "client-access-token-hash",
    "areaIds": ["area-uuid-1", "area-uuid-2"],
    "createdAt": "2025-12-02T15:00:00.000Z",
    "lastSeen": "2025-12-02T15:00:00.000Z"
  },
  "token": "actual-client-token-for-client-use"
}
```

**Important:**
- The `token` in the response is the **raw client token** that the client device should store.
- The `client.token` field is the **hashed version** stored in the database.
- Client tokens do not expire and are used for WebSocket authentication.

**Events:** Triggers WebSocket event `pairing_completed` to notify client device.

---

### Get Pairing Session

**GET** `/api/pairing/:sessionId`

Get details of a pairing session.

**Authentication Required:** No (needed for client polling)

**URL Parameters:**
- `sessionId` - Pairing session ID

**Response (200 OK):**
```json
{
  "id": "pairing-session-uuid",
  "pin": "123456",
  "verified": false,
  "deviceName": null,
  "deviceType": null,
  "expiresAt": "2025-12-02T15:30:00.000Z",
  "completed": false
}
```

---

### Cancel Pairing

**DELETE** `/api/pairing/:sessionId`

Admin cancels an ongoing pairing session.

**Authentication Required:** Yes (Admin JWT)

**URL Parameters:**
- `sessionId` - Pairing session ID

**Response (200 OK):**
```json
{
  "message": "Pairing session cancelled"
}
```

---

## Entities

### Get All Entities

**GET** `/api/entities`

Fetch all Home Assistant entities available to the addon.

**Authentication Required:** Yes (Admin JWT or Client Token)

**Response (200 OK):**
```json
{
  "entities": [
    {
      "entity_id": "light.living_room",
      "state": "on",
      "attributes": {
        "friendly_name": "Living Room Light",
        "brightness": 255,
        "supported_features": 41
      },
      "last_changed": "2025-12-02T14:00:00.000Z"
    }
  ]
}
```

**Note:** Entities are fetched from Home Assistant via the configured HA URL and Long-Lived Access Token.

---

## Areas

Areas are logical groupings of entities assigned to specific client devices.

### List All Areas

**GET** `/api/areas`

Get all configured areas.

**Authentication Required:** Yes (Admin JWT)

**Response (200 OK):**
```json
{
  "areas": [
    {
      "id": "area-uuid",
      "name": "Living Room",
      "entities": ["light.living_room", "switch.tv"],
      "icon": "mdi:sofa",
      "order": 1,
      "enabled": true,
      "createdAt": "2025-12-01T10:00:00.000Z",
      "updatedAt": "2025-12-02T14:00:00.000Z"
    }
  ]
}
```

---

### Create Area

**POST** `/api/areas`

Create a new area.

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**Request Body:**
```json
{
  "name": "Kitchen",
  "entities": ["light.kitchen", "switch.coffee_maker"],
  "icon": "mdi:chef-hat",
  "order": 2,
  "enabled": true
}
```

**Response (201 Created):**
```json
{
  "area": {
    "id": "new-area-uuid",
    "name": "Kitchen",
    "entities": ["light.kitchen", "switch.coffee_maker"],
    "icon": "mdi:chef-hat",
    "order": 2,
    "enabled": true,
    "createdAt": "2025-12-02T15:00:00.000Z",
    "updatedAt": "2025-12-02T15:00:00.000Z"
  }
}
```

---

### Update Area (Full Replace)

**PUT** `/api/areas/:id`

Completely replace an area's configuration.

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**URL Parameters:**
- `id` - Area UUID

**Request Body:**
```json
{
  "name": "Updated Kitchen",
  "entities": ["light.kitchen", "switch.coffee_maker", "sensor.temperature"],
  "icon": "mdi:silverware-fork-knife",
  "order": 2,
  "enabled": true
}
```

**Response (200 OK):**
```json
{
  "area": {
    "id": "area-uuid",
    "name": "Updated Kitchen",
    "entities": ["light.kitchen", "switch.coffee_maker", "sensor.temperature"],
    "icon": "mdi:silverware-fork-knife",
    "order": 2,
    "enabled": true,
    "updatedAt": "2025-12-02T15:30:00.000Z"
  }
}
```

---

### Update Area (Partial)

**PATCH** `/api/areas/:id`

Partially update an area (only specified fields).

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**URL Parameters:**
- `id` - Area UUID

**Request Body (any subset):**
```json
{
  "name": "New Name",
  "icon": "mdi:new-icon"
}
```

**Response (200 OK):**
```json
{
  "area": {
    "id": "area-uuid",
    "name": "New Name",
    "icon": "mdi:new-icon",
    "entities": ["light.kitchen"],
    "order": 2,
    "enabled": true,
    "updatedAt": "2025-12-02T15:45:00.000Z"
  }
}
```

---

### Toggle Area

**PATCH** `/api/areas/:id/toggle`

Toggle area enabled/disabled state.

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**URL Parameters:**
- `id` - Area UUID

**Response (200 OK):**
```json
{
  "area": {
    "id": "area-uuid",
    "enabled": false,
    "updatedAt": "2025-12-02T16:00:00.000Z"
  }
}
```

---

### Reorder Area

**PATCH** `/api/areas/:id/reorder`

Change the display order of an area.

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**URL Parameters:**
- `id` - Area UUID

**Request Body:**
```json
{
  "order": 5
}
```

**Response (200 OK):**
```json
{
  "area": {
    "id": "area-uuid",
    "order": 5,
    "updatedAt": "2025-12-02T16:15:00.000Z"
  }
}
```

---

### Get Area Entities

**GET** `/api/areas/:id/entities`

Get all entities assigned to a specific area with their current states.

**Authentication Required:** Yes (Admin JWT)

**URL Parameters:**
- `id` - Area UUID

**Response (200 OK):**
```json
{
  "entities": [
    {
      "entity_id": "light.living_room",
      "state": "on",
      "attributes": {
        "friendly_name": "Living Room Light",
        "brightness": 255
      }
    }
  ]
}
```

---

### Delete Area

**DELETE** `/api/areas/:id`

Delete an area and remove it from all clients.

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**URL Parameters:**
- `id` - Area UUID

**Response (200 OK):**
```json
{
  "message": "Area deleted successfully"
}
```

**Events:** Triggers WebSocket event `area_removed` to notify affected clients.

---

## Clients

### List All Clients

**GET** `/api/clients`

Get all paired client devices.

**Authentication Required:** Yes (Admin JWT)

**Response (200 OK):**
```json
{
  "clients": [
    {
      "id": "client-uuid",
      "name": "Living Room Tablet",
      "deviceType": "tablet",
      "deviceName": "Samsung Galaxy Tab",
      "areaIds": ["area-uuid-1", "area-uuid-2"],
      "createdAt": "2025-12-01T10:00:00.000Z",
      "lastSeen": "2025-12-02T16:00:00.000Z",
      "connected": true
    }
  ]
}
```

**Note:** `connected` status is determined by active WebSocket connections.

---

### Get Current Client

**GET** `/api/clients/me`

Get information about the currently authenticated client.

**Authentication Required:** Yes (Client Token)

**Response (200 OK):**
```json
{
  "client": {
    "id": "client-uuid",
    "name": "Living Room Tablet",
    "deviceType": "tablet",
    "areaIds": ["area-uuid-1"],
    "createdAt": "2025-12-01T10:00:00.000Z",
    "lastSeen": "2025-12-02T16:30:00.000Z"
  }
}
```

---

### Get Specific Client

**GET** `/api/clients/:id`

Get details of a specific client.

**Authentication Required:** Yes (Admin JWT)

**URL Parameters:**
- `id` - Client UUID

**Response (200 OK):**
```json
{
  "client": {
    "id": "client-uuid",
    "name": "Living Room Tablet",
    "deviceType": "tablet",
    "deviceName": "Samsung Galaxy Tab",
    "areaIds": ["area-uuid-1", "area-uuid-2"],
    "createdAt": "2025-12-01T10:00:00.000Z",
    "lastSeen": "2025-12-02T16:30:00.000Z",
    "connected": true
  }
}
```

---

### Update Client

**PUT** `/api/clients/:id`

Update client configuration (name, assigned areas).

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**URL Parameters:**
- `id` - Client UUID

**Request Body:**
```json
{
  "name": "Updated Tablet Name",
  "areaIds": ["area-uuid-1", "area-uuid-3"]
}
```

**Response (200 OK):**
```json
{
  "client": {
    "id": "client-uuid",
    "name": "Updated Tablet Name",
    "areaIds": ["area-uuid-1", "area-uuid-3"],
    "updatedAt": "2025-12-02T17:00:00.000Z"
  }
}
```

**Events:** Triggers WebSocket events to notify the client of area changes:
- `area_added` - When new areas are assigned
- `area_removed` - When areas are removed

---

### Delete Client

**DELETE** `/api/clients/:id`

Delete a client and revoke its access.

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**URL Parameters:**
- `id` - Client UUID

**Response (200 OK):**
```json
{
  "message": "Client deleted successfully"
}
```

**Side Effects:**
- Revokes client token
- Disconnects active WebSocket connection
- Removes client from database

---

### Revoke Client Token

**POST** `/api/clients/:id/revoke`

Revoke a client's access token without deleting the client record.

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**URL Parameters:**
- `id` - Client UUID

**Response (200 OK):**
```json
{
  "message": "Client token revoked",
  "newToken": "new-client-access-token"
}
```

**Note:** A new token is automatically generated. The client must be re-paired to obtain the new token.

---

## Configuration

### Save Home Assistant Config

**POST** `/api/config/ha`

Save Home Assistant connection details (URL and Long-Lived Access Token).

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**Request Body:**
```json
{
  "url": "http://homeassistant.local:8123",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-ha-token"
}
```

**Response (200 OK):**
```json
{
  "message": "Configuration saved successfully"
}
```

**Important:**
- This saves the **Home Assistant Long-Lived Access Token**, NOT the admin JWT token
- The HA token is used to fetch entities from Home Assistant
- Do NOT call `setAuth()` with these credentials as it will overwrite the admin JWT token

---

### Get Home Assistant Config

**GET** `/api/config/ha`

Retrieve saved Home Assistant connection details.

**Authentication Required:** Yes (Admin JWT)

**Response (200 OK):**
```json
{
  "url": "http://homeassistant.local:8123",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-ha-token"
}
```

**Note:** Token is returned in plain text for display/editing purposes.

---

## Health & Monitoring

### Health Check

**GET** `/api/health`

Check server health and status.

**Authentication Required:** No (public endpoint)

**Response (200 OK):**
```json
{
  "status": "healthy",
  "version": "1.4.0",
  "timestamp": "2025-12-02T17:30:00.000Z",
  "uptime": 86400,
  "connectedClients": 5,
  "database": "connected"
}
```

---

## Privacy & GDPR

### Export User Data

**GET** `/api/user/data-export`

Export all user data in JSON format (GDPR compliance).

**Authentication Required:** Yes (Admin JWT)

**Response (200 OK):**
```json
{
  "exportDate": "2025-12-02T18:00:00.000Z",
  "data": {
    "admin": {
      "username": "admin"
    },
    "clients": [...],
    "areas": [...],
    "config": {...}
  }
}
```

---

### Delete User Data

**DELETE** `/api/user/data-delete`

Delete all user data (GDPR right to be forgotten).

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**Response (200 OK):**
```json
{
  "message": "All user data deleted successfully"
}
```

**Warning:** This is irreversible and will delete all clients, areas, and configuration.

---

### Get Consent Status

**GET** `/api/user/consent`

Get current privacy consent status.

**Authentication Required:** Yes (Admin JWT)

**Response (200 OK):**
```json
{
  "consented": true,
  "consentDate": "2025-12-01T10:00:00.000Z"
}
```

---

### Update Consent

**POST** `/api/user/consent`

Update privacy consent status.

**Authentication Required:** Yes (Admin JWT)
**CSRF Protection:** Required

**Request Body:**
```json
{
  "consented": true
}
```

**Response (200 OK):**
```json
{
  "message": "Consent updated successfully"
}
```

---

### Get Privacy Policy

**GET** `/api/privacy-policy`

Get the privacy policy text.

**Authentication Required:** No (public endpoint)

**Response (200 OK):**
```json
{
  "policy": "Privacy policy text...",
  "lastUpdated": "2025-01-01T00:00:00.000Z"
}
```

---

## Rate Limiting

All endpoints are rate-limited to prevent abuse:

| Endpoint Type | Rate Limit |
|--------------|------------|
| Authentication | 10 requests / 15 minutes per IP |
| Read Operations (GET) | 500 requests / 15 minutes per IP |
| Write Operations (POST/PUT/DELETE/PATCH) | 100 requests / 15 minutes per IP |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1701619200
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "ErrorType",
  "message": "Human-readable error message",
  "statusCode": 400
}
```

### Common Status Codes

| Status Code | Description |
|------------|-------------|
| 200 OK | Success |
| 201 Created | Resource created successfully |
| 400 Bad Request | Invalid request data |
| 401 Unauthorized | Missing or invalid authentication |
| 403 Forbidden | Insufficient permissions |
| 404 Not Found | Resource not found |
| 429 Too Many Requests | Rate limit exceeded |
| 500 Internal Server Error | Server error |
| 503 Service Unavailable | Service temporarily unavailable |

---

## WebSocket Events

HAsync uses Socket.IO for real-time updates. See separate documentation for WebSocket protocol.

**Connection URL:** `ws://[host]:8099` or `wss://[host]:8099` (if TLS enabled)

**Authentication:** Client tokens are passed via `handshake.auth.token` during connection.

**Common Events:**
- `pairing_verified` - Client verified PIN
- `pairing_completed` - Pairing completed by admin
- `area_added` - New area assigned to client
- `area_removed` - Area removed from client
- `entity_update` - Entity state changed
- `client_connected` - Client connected to server
- `client_disconnected` - Client disconnected from server

---

## OpenAPI/Swagger Documentation

Interactive API documentation is available at:

**Swagger UI:** `http://[host]:8099/api-docs`

**Swagger JSON:** `http://[host]:8099/api-docs/swagger.json`

---

## Security Notes

1. **JWT Tokens:**
   - Admin JWT tokens expire after 24 hours
   - Client tokens do not expire
   - Tokens are signed with HS256 algorithm

2. **CSRF Protection:**
   - Automatically skipped when using JWT Bearer authentication
   - Only required for session-based authentication (currently not used)

3. **Token Storage:**
   - Admin JWT tokens: Stored in Zustand state + localStorage
   - Client tokens: Hashed with SHA-256 before database storage

4. **Password Security:**
   - Admin password stored in config.yaml (change in production!)
   - No password hashing currently implemented (TODO)

5. **Rate Limiting:**
   - All endpoints are rate-limited
   - Failed authentication attempts are logged

---

**Last Updated:** 2025-12-02 (v1.4.0)
