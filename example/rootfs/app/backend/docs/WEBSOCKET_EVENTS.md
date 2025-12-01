# WebSocket Client-Specific Events System

## Overview

The WebSocket events system provides real-time notifications to clients for:
- Area assignments and updates
- Token revocation
- Pairing completion
- Configuration changes

## Architecture

### Client Socket Tracking

Each client connection is tracked in a `Map<clientId, Socket>` that allows server-side code to send targeted notifications to specific clients based on their database ID.

```typescript
// Client connects with JWT token
// Token contains: { username: clientId, role: 'client' }

// Socket is registered automatically
registerClientSocket(clientId, socket);

// Socket can now receive client-specific events
notifyClient(clientId, 'area_added', { ... });
```

### Event Flow

1. **Connection**: Client connects with valid JWT token
2. **Registration**: Socket auth middleware extracts `clientId` and attaches to socket
3. **Tracking**: Connection handler registers socket in `clientSockets` Map
4. **Notification**: Server emits events when area/token changes occur
5. **Disconnection**: Socket is unregistered on disconnect

## Supported Events

### Connection Events

#### `connected`
Sent immediately after successful authentication.

```json
{
  "clientId": "client_1234567890",
  "message": "Connected successfully",
  "features": ["area_updates", "token_management", "real_time_sync"],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Area Events

#### `area_added`
Emitted when admin assigns a new area to the client.

```json
{
  "areaId": "area_1234567890",
  "name": "Living Room",
  "entityIds": ["light.living_room", "switch.fan"],
  "isEnabled": true,
  "message": "New area has been assigned to your device",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### `area_removed`
Emitted when admin removes an area from the client.

```json
{
  "areaId": "area_1234567890",
  "name": "Living Room",
  "message": "Area has been removed from your device",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### `area_updated`
Emitted when admin modifies area name or entities.

```json
{
  "areaId": "area_1234567890",
  "name": "Living Room (Updated)",
  "entityIds": ["light.living_room", "switch.fan", "sensor.temp"],
  "isEnabled": true,
  "updatedFields": ["name", "entityIds"],
  "message": "Area has been updated by admin",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### `area_enabled`
Emitted when admin enables a previously disabled area.

```json
{
  "areaId": "area_1234567890",
  "name": "Living Room",
  "isEnabled": true,
  "message": "Area has been enabled by admin",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### `area_disabled`
Emitted when admin disables an area.

```json
{
  "areaId": "area_1234567890",
  "name": "Living Room",
  "isEnabled": false,
  "message": "Area has been disabled by admin",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Token Events

#### `token_revoked`
Emitted when admin revokes client token. Socket is disconnected after event is sent.

```json
{
  "reason": "Client removed by admin",
  "message": "Your access token has been revoked. Please re-pair your device.",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Client Action**: Display message to user and clear stored token. Navigate to pairing screen.

### Pairing Events

#### `pairing_completed`
Emitted when admin completes pairing request.

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "clientId": "client_1234567890",
  "clientName": "iPad - Living Room",
  "assignedAreas": [
    {
      "id": "area_1234567890",
      "name": "Living Room",
      "entityIds": ["light.living_room"],
      "isEnabled": true
    }
  ],
  "message": "Pairing completed successfully",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Client Action**: Store token securely, reconnect with new token.

## Client Implementation

### Connection Setup

```typescript
import io from 'socket.io-client';

const token = localStorage.getItem('client_token');
const socket = io('https://backend.example.com', {
  auth: { token },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('connected', (data) => {
  console.log('Client authenticated:', data.clientId);
  console.log('Available features:', data.features);
});
```

### Event Handlers

```typescript
// Area added
socket.on('area_added', (data) => {
  console.log('New area assigned:', data.name);
  // Fetch updated areas list
  fetchAreas();
  // Show notification
  showNotification(`New area "${data.name}" assigned`);
});

// Area removed
socket.on('area_removed', (data) => {
  console.log('Area removed:', data.name);
  // Remove from local state
  removeAreaFromState(data.areaId);
  // Show notification
  showNotification(`Area "${data.name}" removed`);
});

// Area updated
socket.on('area_updated', (data) => {
  console.log('Area updated:', data.name);
  // Update local state
  updateAreaInState(data.areaId, data);
  // Refresh entities if needed
  if (data.updatedFields.includes('entityIds')) {
    refreshAreaEntities(data.areaId);
  }
});

// Area enabled/disabled
socket.on('area_enabled', (data) => {
  console.log('Area enabled:', data.name);
  updateAreaStatus(data.areaId, true);
});

socket.on('area_disabled', (data) => {
  console.log('Area disabled:', data.name);
  updateAreaStatus(data.areaId, false);
});

// Token revoked
socket.on('token_revoked', (data) => {
  console.error('Token revoked:', data.reason);
  // Clear stored token
  localStorage.removeItem('client_token');
  // Show alert
  alert(data.message);
  // Navigate to pairing screen
  window.location.href = '/pairing';
});

// Pairing completed
socket.on('pairing_completed', (data) => {
  console.log('Pairing completed:', data.clientName);
  // Store new token
  localStorage.setItem('client_token', data.token);
  // Reconnect with new token
  socket.auth = { token: data.token };
  socket.disconnect();
  socket.connect();
  // Show success
  showNotification('Pairing successful!');
});
```

### Error Handling

```typescript
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  if (error.message === 'Authentication required') {
    // Invalid token - navigate to pairing
    window.location.href = '/pairing';
  }
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  if (reason === 'io server disconnect') {
    // Server disconnected client (token revoked)
    localStorage.removeItem('client_token');
    window.location.href = '/pairing';
  }
});
```

## Server Implementation

### Emitting Events

```typescript
import {
  notifyClient,
  notifyClientsWithArea,
  disconnectClient,
  notifyAreaAdded,
  notifyAreaRemoved,
  EVENT_TYPES
} from './services/websocket-events';

// Notify specific client
notifyClient(clientId, EVENT_TYPES.AREA_ADDED, {
  areaId: area.id,
  name: area.name,
  entityIds: area.entityIds,
  isEnabled: area.isEnabled
});

// Notify all clients with specific area
notifyClientsWithArea(db, areaId, EVENT_TYPES.AREA_UPDATED, {
  areaId: area.id,
  name: area.name,
  message: 'Area updated by admin'
});

// Disconnect client (revoke token)
disconnectClient(clientId, 'Client removed by admin');
```

### Integration Points

Events are automatically emitted when:

1. **Area Updated** (`PUT /api/areas/:id`, `PATCH /api/areas/:id`)
   - Emits `area_updated` to all clients with that area

2. **Area Toggled** (`PATCH /api/areas/:id/toggle`)
   - Emits `area_enabled` or `area_disabled` to all clients with that area

3. **Area Deleted** (`DELETE /api/areas/:id`)
   - Emits `area_removed` to all clients with that area

4. **Token Revoked** (Admin removes client)
   - Emits `token_revoked` then disconnects socket

5. **Pairing Completed** (Admin approves pairing)
   - Emits `pairing_completed` with new token

## Security Considerations

### Authentication
- All WebSocket connections require valid JWT tokens
- Tokens are verified in `socketAuthMiddleware`
- Invalid tokens result in connection rejection

### Authorization
- Clients only receive events for areas they have assigned
- Admin users receive all events
- Client tokens cannot access admin functions

### Rate Limiting
- WebSocket connections are rate-limited by IP
- Maximum 10 connections per minute per IP
- Prevents connection flooding attacks

### Data Validation
- All event payloads include only necessary data
- Sensitive information (HA tokens, passwords) never included
- Area entity IDs validated before emission

## Monitoring

### Connection Tracking

```typescript
import { getConnectedClientCount } from './services/websocket-events';

// Get number of connected clients
const count = getConnectedClientCount();
console.log(`${count} clients connected`);
```

### Logging

All WebSocket events are logged:
- Connection/disconnection events
- Event emissions (event name, clientId, data)
- Error conditions

Example log output:
```
[WebSocket] Client client_1234567890 registered for notifications
[WebSocket] Emitting 'area_updated' to client client_1234567890
[WebSocket] Notifying 3 clients with area area_1234567890
```

## Testing

### Manual Testing

1. **Connect client**:
   ```bash
   wscat -c wss://localhost:8443 -H "Authorization: Bearer <token>"
   ```

2. **Update area** (triggers `area_updated` event):
   ```bash
   curl -X PUT https://localhost:8443/api/areas/area_123 \
     -H "Authorization: Bearer <admin-token>" \
     -d '{"name": "Updated Name"}'
   ```

3. **Verify event received** in wscat output

### Automated Testing

```typescript
import io from 'socket.io-client';

describe('WebSocket Events', () => {
  it('should receive area_updated event', (done) => {
    const socket = io('http://localhost:8443', {
      auth: { token: clientToken }
    });

    socket.on('area_updated', (data) => {
      expect(data.areaId).toBe('area_123');
      expect(data.name).toBe('Updated Name');
      done();
    });

    // Trigger area update via API
    updateArea('area_123', { name: 'Updated Name' });
  });
});
```

## Troubleshooting

### Client Not Receiving Events

1. **Check connection status**:
   ```typescript
   console.log('Connected:', socket.connected);
   ```

2. **Verify token is valid**:
   ```bash
   curl https://localhost:8443/api/auth/verify \
     -H "Authorization: Bearer <token>"
   ```

3. **Check server logs** for:
   - Client registration message
   - Event emission messages

### Events Received Multiple Times

- Client likely has multiple socket connections
- Ensure old connections are closed before creating new ones:
  ```typescript
  if (socket) socket.disconnect();
  socket = io(...);
  ```

### Token Revoked Unexpectedly

- Check if admin removed client from system
- Verify token hasn't expired
- Check server logs for revocation events
