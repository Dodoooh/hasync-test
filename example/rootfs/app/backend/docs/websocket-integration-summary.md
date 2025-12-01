# WebSocket Events Integration - Implementation Summary

## Overview
WebSocket real-time event notifications have been fully integrated into all area management endpoints in the backend API.

## Files Involved

### 1. `/src/services/websocket-events.ts`
Core WebSocket event handling module containing:

#### Client Socket Management Functions
- `registerClientSocket(clientId, socket)` - Register client for notifications
- `unregisterClientSocket(clientId)` - Remove client from tracking
- `getClientSocket(clientId)` - Retrieve socket for specific client
- `getConnectedClientCount()` - Get total connected clients

#### Notification Functions
- `notifyClient(clientId, event, data)` - Send event to specific client
- `notifyClientsWithArea(db, areaId, event, data)` - Notify all clients assigned to area
- `notifyAllClients(event, data)` - Broadcast to all connected clients
- `disconnectClient(clientId, reason)` - Force disconnect client

#### Helper Functions
- `notifyAreaAdded(clientId, area)` - Notify client of new area assignment
- `notifyAreaRemoved(clientId, areaId, areaName)` - Notify client of area removal
- `notifyPairingCompleted(clientId, token, clientInfo)` - Send pairing success notification

#### Event Types Defined
```typescript
export const EVENT_TYPES = {
  CONNECTED: 'connected',
  AREA_ADDED: 'area_added',
  AREA_REMOVED: 'area_removed',
  AREA_UPDATED: 'area_updated',
  AREA_ENABLED: 'area_enabled',
  AREA_DISABLED: 'area_disabled',
  TOKEN_REVOKED: 'token_revoked',
  PAIRING_COMPLETED: 'pairing_completed',
}
```

### 2. `/src/index-simple.ts`
Main backend server with WebSocket integration in area endpoints.

## Endpoint Integrations

### 1. PUT `/api/areas/:id` (Full Update)
**Location:** Line ~1100-1151

**Integration:**
```typescript
// After successful update
notifyClientsWithArea(db, id, EVENT_TYPES.AREA_UPDATED, {
  areaId: id,
  name: sanitizedName,
  entityIds: entityIds || [],
  isEnabled: is_enabled === 1,
  message: 'Area has been updated by admin'
});
```

**Event:** `area_updated`
**Payload:**
- `areaId`: Area identifier
- `name`: Updated area name
- `entityIds`: Array of entity IDs in area
- `isEnabled`: Boolean area enabled state
- `message`: User-friendly message
- `timestamp`: ISO timestamp (auto-added)

---

### 2. PATCH `/api/areas/:id` (Partial Update)
**Location:** Line ~1155-1254

**Integration:**
```typescript
// After successful update
notifyClientsWithArea(db, id, EVENT_TYPES.AREA_UPDATED, {
  areaId: id,
  name: updated.name,
  entityIds: updated.entity_ids ? JSON.parse(updated.entity_ids) : [],
  isEnabled: updated.is_enabled === 1,
  updatedFields: Object.keys(updates),
  message: 'Area has been updated by admin'
});
```

**Event:** `area_updated`
**Payload:**
- `areaId`: Area identifier
- `name`: Updated area name
- `entityIds`: Array of entity IDs
- `isEnabled`: Boolean enabled state
- `updatedFields`: Array of field names that were updated
- `message`: User-friendly message
- `timestamp`: ISO timestamp (auto-added)

---

### 3. PATCH `/api/areas/:id/toggle` (Enable/Disable Area)
**Location:** Line ~1259-1306

**Integration:**
```typescript
// After toggle
const eventName = is_enabled === 1 ? EVENT_TYPES.AREA_ENABLED : EVENT_TYPES.AREA_DISABLED;
notifyClientsWithArea(db, id, eventName, {
  areaId: id,
  name: updated.name,
  isEnabled: is_enabled === 1,
  message: `Area has been ${is_enabled === 1 ? 'enabled' : 'disabled'} by admin`
});
```

**Events:** `area_enabled` OR `area_disabled`
**Payload:**
- `areaId`: Area identifier
- `name`: Area name
- `isEnabled`: Boolean enabled state
- `message`: Dynamic message based on state
- `timestamp`: ISO timestamp (auto-added)

---

### 4. DELETE `/api/areas/:id` (Remove Area)
**Location:** Line ~1453-1486

**Integration:**
```typescript
// BEFORE deletion (so clients can still be found in assigned_areas)
const deletedAreaName = existing.name;

notifyClientsWithArea(db, id, EVENT_TYPES.AREA_REMOVED, {
  areaId: id,
  name: deletedAreaName,
  message: 'Area has been removed by admin'
});

// Then delete
db.prepare('DELETE FROM areas WHERE id = ?').run(id);
```

**Event:** `area_removed`
**Payload:**
- `areaId`: Area identifier
- `name`: Name of removed area
- `message`: User-friendly message
- `timestamp`: ISO timestamp (auto-added)

**Important:** Notification sent BEFORE deletion so `notifyClientsWithArea()` can still find clients in database with this area assignment.

---

## How It Works

### Client Notification Flow

1. **Client connects via WebSocket** with client token
2. **Server authenticates** and extracts `clientId` from token
3. **Server registers socket** via `registerClientSocket(clientId, socket)`
4. **Client socket stored** in Map for O(1) lookup
5. **Admin performs area operation** (update, toggle, delete)
6. **Server queries database** for all active clients with this area
7. **Server notifies each client** via their registered socket
8. **Client receives real-time event** with full data payload

### Database Query for Client Lookup
```typescript
// Get all active clients that have this area in their assigned_areas JSON array
const clients = db.prepare('SELECT id, assigned_areas FROM clients WHERE is_active = ?').all(1);

// Filter clients that have this area assigned
const clientsWithArea = clients.filter((client) => {
  const assignedAreas = JSON.parse(client.assigned_areas);
  return Array.isArray(assignedAreas) && assignedAreas.includes(areaId);
});

// Notify each client
clientsWithArea.forEach((client) => {
  notifyClient(client.id, event, data);
});
```

### Socket Emission
```typescript
const socket = clientSockets.get(clientId);
if (socket) {
  socket.emit(event, {
    ...data,
    timestamp: new Date().toISOString()
  });
}
```

---

## Event Payload Structure

All events follow this standard structure:

```typescript
{
  // Event-specific fields (areaId, name, etc.)
  ...data,

  // Auto-added by notifyClient/notifyClientsWithArea
  timestamp: "2025-12-02T10:30:45.123Z"
}
```

---

## Security & Authentication

1. **Client Authentication Required:**
   - Clients must provide valid JWT token on WebSocket connection
   - Token contains `clientId` for socket registration

2. **Admin-Only Modifications:**
   - All area endpoints require admin role
   - Only authenticated admins can trigger events

3. **Scoped Notifications:**
   - Clients only receive events for areas assigned to them
   - No broadcast of sensitive data to unauthorized clients

---

## Client-Side Integration

Clients should listen for these events:

```typescript
// Connection
socket.on('connected', (data) => {
  console.log('Connected:', data.features);
});

// Area events
socket.on('area_updated', (data) => {
  // Update local state with data.areaId, data.name, etc.
});

socket.on('area_enabled', (data) => {
  // Enable area in UI
});

socket.on('area_disabled', (data) => {
  // Disable area in UI
});

socket.on('area_removed', (data) => {
  // Remove area from local state
});

// Token events
socket.on('token_revoked', (data) => {
  // Clear token, redirect to pairing
});
```

---

## Testing WebSocket Events

### Test with Socket.IO Client
```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:8099', {
  auth: {
    token: 'client_jwt_token_here'
  }
});

socket.on('connected', (data) => {
  console.log('✓ Connected:', data);
});

socket.on('area_updated', (data) => {
  console.log('✓ Area updated:', data);
});

// Trigger update via admin API
// Watch for WebSocket event
```

### Test Flow
1. Start backend server
2. Connect client via WebSocket with valid client token
3. Perform admin area operation (update, toggle, delete)
4. Verify client receives real-time event
5. Check payload contains expected fields

---

## Performance Considerations

1. **O(1) Socket Lookup:**
   - `clientSockets` Map provides constant-time socket retrieval

2. **Database Query Optimization:**
   - Single query to fetch all active clients
   - Client-side filtering of JSON arrays

3. **Async Event Emission:**
   - Events sent asynchronously, don't block API response

4. **Connection Tracking:**
   - Automatic cleanup on disconnect
   - No memory leaks from stale connections

---

## Error Handling

1. **Socket Not Found:**
   - Logs warning if client not connected
   - Fails gracefully without throwing error

2. **Invalid JSON in assigned_areas:**
   - Caught and logged
   - Client skipped from notification

3. **Database Errors:**
   - Try-catch wrapper in `notifyClientsWithArea()`
   - Error logged but doesn't crash server

---

## Logging

All WebSocket operations are logged:

```
[WebSocket] Client abc123 registered for notifications (socket: xyz789)
[WebSocket] Notifying 3 clients with area area_1234567890
[WebSocket] Emitting 'area_updated' to client abc123
[WebSocket] Client abc123 not connected, cannot emit 'area_updated'
```

---

## Summary

✅ **All area endpoints integrated** with WebSocket events
✅ **Real-time notifications** to affected clients only
✅ **Secure, scoped events** based on area assignments
✅ **Complete event types** for all area operations
✅ **Robust error handling** and logging
✅ **Performance optimized** with Map-based socket tracking
✅ **Client connection lifecycle** fully managed

The WebSocket integration is production-ready and provides seamless real-time updates to all connected clients when areas are modified by administrators.
