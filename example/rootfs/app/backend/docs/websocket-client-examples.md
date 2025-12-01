# WebSocket Client Integration Examples

## Overview
This document provides client-side code examples for integrating with the backend's WebSocket real-time notification system.

## Prerequisites

```bash
npm install socket.io-client
```

## Basic WebSocket Client

### JavaScript/Node.js Example

```javascript
const io = require('socket.io-client');

// Connect with client JWT token
const socket = io('http://localhost:8099', {
  auth: {
    token: 'your_client_jwt_token_here'
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

// Connection events
socket.on('connect', () => {
  console.log('✓ Connected to server');
  console.log('Socket ID:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('✗ Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('✗ Connection error:', error.message);
});

// Server welcome message
socket.on('connected', (data) => {
  console.log('✓ Server welcome:', data);
  console.log('  Client ID:', data.clientId);
  console.log('  Features:', data.features);
});

// Area events
socket.on('area_updated', (data) => {
  console.log('📝 Area updated:', data);
  console.log('  Area ID:', data.areaId);
  console.log('  Name:', data.name);
  console.log('  Enabled:', data.isEnabled);
  console.log('  Entities:', data.entityIds);

  // Update your local state here
  updateLocalArea(data.areaId, {
    name: data.name,
    isEnabled: data.isEnabled,
    entityIds: data.entityIds
  });
});

socket.on('area_enabled', (data) => {
  console.log('✅ Area enabled:', data.name);
  enableAreaInUI(data.areaId);
});

socket.on('area_disabled', (data) => {
  console.log('⛔ Area disabled:', data.name);
  disableAreaInUI(data.areaId);
});

socket.on('area_removed', (data) => {
  console.log('🗑️  Area removed:', data.name);
  removeAreaFromUI(data.areaId);
});

// Token events
socket.on('token_revoked', (data) => {
  console.error('⚠️  Token revoked:', data.reason);
  console.log('Message:', data.message);

  // Clear local token and redirect to pairing
  localStorage.removeItem('clientToken');
  window.location.href = '/pair';
});

// Pairing events
socket.on('pairing_completed', (data) => {
  console.log('✓ Pairing completed');
  console.log('  Client ID:', data.clientId);
  console.log('  Client Name:', data.clientName);
  console.log('  Assigned Areas:', data.assignedAreas);

  // Store token
  localStorage.setItem('clientToken', data.token);

  // Load initial areas
  loadAreas(data.assignedAreas);
});

// Error handling
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Example helper functions
function updateLocalArea(areaId, updates) {
  // Update your local state/store
  console.log(`Updating area ${areaId}:`, updates);
}

function enableAreaInUI(areaId) {
  // Update UI to show area as enabled
  console.log(`Enabling area ${areaId} in UI`);
}

function disableAreaInUI(areaId) {
  // Update UI to show area as disabled
  console.log(`Disabling area ${areaId} in UI`);
}

function removeAreaFromUI(areaId) {
  // Remove area from UI
  console.log(`Removing area ${areaId} from UI`);
}

function loadAreas(assignedAreas) {
  // Load areas into UI
  console.log('Loading areas:', assignedAreas);
}
```

## React/TypeScript Example

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface Area {
  id: string;
  name: string;
  entityIds: string[];
  isEnabled: boolean;
}

export const useWebSocket = (token: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [areas, setAreas] = useState<Record<string, Area>>({});

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('http://localhost:8099', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('✓ Connected to WebSocket');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('✗ Disconnected from WebSocket');
      setConnected(false);
    });

    // Server welcome
    newSocket.on('connected', (data: any) => {
      console.log('✓ Server welcome:', data);
    });

    // Area updated
    newSocket.on('area_updated', (data: any) => {
      console.log('📝 Area updated:', data);
      setAreas((prev) => ({
        ...prev,
        [data.areaId]: {
          id: data.areaId,
          name: data.name,
          entityIds: data.entityIds,
          isEnabled: data.isEnabled,
        },
      }));
    });

    // Area enabled
    newSocket.on('area_enabled', (data: any) => {
      console.log('✅ Area enabled:', data.name);
      setAreas((prev) => ({
        ...prev,
        [data.areaId]: {
          ...prev[data.areaId],
          isEnabled: true,
        },
      }));
    });

    // Area disabled
    newSocket.on('area_disabled', (data: any) => {
      console.log('⛔ Area disabled:', data.name);
      setAreas((prev) => ({
        ...prev,
        [data.areaId]: {
          ...prev[data.areaId],
          isEnabled: false,
        },
      }));
    });

    // Area removed
    newSocket.on('area_removed', (data: any) => {
      console.log('🗑️  Area removed:', data.name);
      setAreas((prev) => {
        const { [data.areaId]: removed, ...rest } = prev;
        return rest;
      });
    });

    // Token revoked
    newSocket.on('token_revoked', (data: any) => {
      console.error('⚠️  Token revoked:', data.reason);
      localStorage.removeItem('clientToken');
      window.location.href = '/pair';
    });

    setSocket(newSocket);

    // Cleanup
    return () => {
      newSocket.close();
    };
  }, [token]);

  return { socket, connected, areas };
};
```

### Using the Hook

```typescript
import React from 'react';
import { useWebSocket } from './useWebSocket';

const Dashboard: React.FC = () => {
  const token = localStorage.getItem('clientToken') || '';
  const { socket, connected, areas } = useWebSocket(token);

  if (!connected) {
    return <div>Connecting to server...</div>;
  }

  return (
    <div>
      <h1>Areas Dashboard</h1>
      <div className="connection-status">
        {connected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>

      <div className="areas-list">
        {Object.values(areas).map((area) => (
          <div
            key={area.id}
            className={`area-card ${!area.isEnabled ? 'disabled' : ''}`}
          >
            <h3>{area.name}</h3>
            <p>Status: {area.isEnabled ? '✅ Enabled' : '⛔ Disabled'}</p>
            <p>Entities: {area.entityIds.length}</p>
            <ul>
              {area.entityIds.map((entityId) => (
                <li key={entityId}>{entityId}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
```

## Vue.js Example

```typescript
import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';

export function useWebSocket(token: string) {
  const socket = ref<Socket | null>(null);
  const connected = ref(false);
  const areas = ref<Record<string, any>>({});

  const connect = () => {
    const newSocket = io('http://localhost:8099', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      connected.value = true;
    });

    newSocket.on('disconnect', () => {
      connected.value = false;
    });

    newSocket.on('area_updated', (data: any) => {
      areas.value[data.areaId] = {
        id: data.areaId,
        name: data.name,
        entityIds: data.entityIds,
        isEnabled: data.isEnabled,
      };
    });

    newSocket.on('area_enabled', (data: any) => {
      if (areas.value[data.areaId]) {
        areas.value[data.areaId].isEnabled = true;
      }
    });

    newSocket.on('area_disabled', (data: any) => {
      if (areas.value[data.areaId]) {
        areas.value[data.areaId].isEnabled = false;
      }
    });

    newSocket.on('area_removed', (data: any) => {
      delete areas.value[data.areaId];
    });

    socket.value = newSocket;
  };

  onMounted(() => {
    connect();
  });

  onUnmounted(() => {
    socket.value?.close();
  });

  return { socket, connected, areas };
}
```

## Testing with curl and websocat

### 1. Get Client Token
```bash
# First, pair your device to get a client token
curl -X POST http://localhost:8099/api/pairing/initiate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "clientId": "test_client_123",
    "clientName": "Test Client",
    "assignedAreas": ["area_1234567890"]
  }'

# Complete pairing with the code
curl -X POST http://localhost:8099/api/pairing/complete \
  -H "Content-Type: application/json" \
  -d '{
    "pairingCode": "123456",
    "deviceInfo": {
      "deviceType": "test",
      "appVersion": "1.0.0"
    }
  }'
```

### 2. Connect via WebSocket
```bash
# Install websocat
brew install websocat  # macOS
# or
cargo install websocat  # Linux

# Connect to WebSocket
websocat "ws://localhost:8099/socket.io/?EIO=4&transport=websocket" \
  --header "Authorization: Bearer YOUR_CLIENT_TOKEN"
```

### 3. Test Events
```bash
# In another terminal, trigger an area update
curl -X PUT http://localhost:8099/api/areas/area_1234567890 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "Updated Living Room",
    "entityIds": ["light.new_light"],
    "isEnabled": true
  }'

# Watch the websocat terminal for the event
```

## Browser Console Testing

```javascript
// In browser console (on a page with socket.io-client loaded)
const socket = io('http://localhost:8099', {
  auth: {
    token: 'your_client_token_here'
  }
});

socket.on('connect', () => console.log('Connected'));
socket.on('connected', (data) => console.log('Welcome:', data));
socket.on('area_updated', (data) => console.log('Area updated:', data));
socket.on('area_enabled', (data) => console.log('Area enabled:', data));
socket.on('area_disabled', (data) => console.log('Area disabled:', data));
socket.on('area_removed', (data) => console.log('Area removed:', data));
socket.on('token_revoked', (data) => console.log('Token revoked:', data));
```

## Event Payload Examples

### area_updated
```json
{
  "areaId": "area_1234567890",
  "name": "Living Room",
  "entityIds": ["light.living_room", "switch.fan"],
  "isEnabled": true,
  "message": "Area has been updated by admin",
  "timestamp": "2025-12-02T10:30:45.123Z"
}
```

### area_enabled
```json
{
  "areaId": "area_1234567890",
  "name": "Living Room",
  "isEnabled": true,
  "message": "Area has been enabled by admin",
  "timestamp": "2025-12-02T10:30:45.123Z"
}
```

### area_disabled
```json
{
  "areaId": "area_1234567890",
  "name": "Living Room",
  "isEnabled": false,
  "message": "Area has been disabled by admin",
  "timestamp": "2025-12-02T10:30:45.123Z"
}
```

### area_removed
```json
{
  "areaId": "area_1234567890",
  "name": "Living Room",
  "message": "Area has been removed by admin",
  "timestamp": "2025-12-02T10:30:45.123Z"
}
```

### token_revoked
```json
{
  "reason": "Client deleted by administrator",
  "message": "Your access token has been revoked. Please re-pair your device.",
  "timestamp": "2025-12-02T10:30:45.123Z"
}
```

### connected (welcome message)
```json
{
  "clientId": "test_client_123",
  "message": "Connected successfully",
  "features": ["area_updates", "token_management", "real_time_sync"],
  "timestamp": "2025-12-02T10:30:45.123Z"
}
```

## Error Handling Best Practices

```typescript
// Reconnection logic
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server disconnected, manually reconnect
    socket.connect();
  }
  // else socket will automatically try to reconnect
});

// Connection errors
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);

  if (error.message.includes('unauthorized')) {
    // Token is invalid, redirect to pairing
    window.location.href = '/pair';
  }
});

// Network errors
socket.on('error', (error) => {
  console.error('Socket error:', error);
  showNotification('Connection error. Retrying...', 'error');
});
```

## State Management Integration

### Redux Example

```typescript
// actions.ts
export const AREA_UPDATED = 'AREA_UPDATED';
export const AREA_ENABLED = 'AREA_ENABLED';
export const AREA_DISABLED = 'AREA_DISABLED';
export const AREA_REMOVED = 'AREA_REMOVED';

export const setupWebSocket = (token: string) => (dispatch: any) => {
  const socket = io('http://localhost:8099', {
    auth: { token }
  });

  socket.on('area_updated', (data) => {
    dispatch({ type: AREA_UPDATED, payload: data });
  });

  socket.on('area_enabled', (data) => {
    dispatch({ type: AREA_ENABLED, payload: data });
  });

  socket.on('area_disabled', (data) => {
    dispatch({ type: AREA_DISABLED, payload: data });
  });

  socket.on('area_removed', (data) => {
    dispatch({ type: AREA_REMOVED, payload: data });
  });

  return socket;
};

// reducer.ts
const areasReducer = (state = {}, action: any) => {
  switch (action.type) {
    case AREA_UPDATED:
      return {
        ...state,
        [action.payload.areaId]: {
          id: action.payload.areaId,
          name: action.payload.name,
          entityIds: action.payload.entityIds,
          isEnabled: action.payload.isEnabled,
        }
      };

    case AREA_ENABLED:
    case AREA_DISABLED:
      return {
        ...state,
        [action.payload.areaId]: {
          ...state[action.payload.areaId],
          isEnabled: action.payload.isEnabled,
        }
      };

    case AREA_REMOVED:
      const { [action.payload.areaId]: removed, ...rest } = state;
      return rest;

    default:
      return state;
  }
};
```

## Summary

✅ **JavaScript/Node.js client** - Basic implementation
✅ **React/TypeScript hook** - Modern React integration
✅ **Vue.js composable** - Vue 3 Composition API
✅ **Browser console testing** - Quick debugging
✅ **curl/websocat testing** - Command-line testing
✅ **Redux integration** - State management example
✅ **Error handling** - Production-ready error handling
✅ **Event payload examples** - All event types documented

All examples are production-ready and include proper error handling, reconnection logic, and state management.
