# Client Pairing Process (v1.4.0)

Complete guide to pairing client devices with HAsync.

## Table of Contents

- [Overview](#overview)
- [Pairing Flow](#pairing-flow)
- [Step-by-Step Guide](#step-by-step-guide)
- [WebSocket Events](#websocket-events)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Overview

The pairing process securely connects client devices (tablets, phones, kiosks) to the HAsync management system using a PIN-based verification flow.

### Key Features

- **Secure PIN Verification:** 6-digit random PIN (5-minute expiration)
- **Real-time Updates:** WebSocket events for instant feedback
- **Device Information:** Captures device name and type
- **Area Assignment:** Admin assigns specific areas to each client
- **Token Generation:** Long-lived tokens for client authentication
- **Visual Countdown:** Enhanced UI with prominent timer (v1.4.0)

---

## Pairing Flow

```
┌─────────────────┐                           ┌─────────────────┐
│   Admin UI      │                           │  Client Device  │
│  (Browser)      │                           │  (Tablet/Phone) │
└────────┬────────┘                           └────────┬────────┘
         │                                             │
         │ 1. Click "Generate PIN"                    │
         ▼                                             │
    POST /api/pairing/create                          │
         │                                             │
         │ 2. PIN: "123456"                           │
         │    Expires: +5 minutes                     │
         │    ┌─────────────────────┐                │
         │    │  PIN: 123456        │                │
         │    │  ⏱️  4:58 remaining │ ◄── New in v1.4.0!
         │    │  ▓▓▓▓▓▓▓▓▓░░ (90%)  │
         │    └─────────────────────┘                │
         │                                             │
         │                                             │ 3. User enters PIN
         │                                             ▼
         │                          POST /api/pairing/:sessionId/verify
         │                                {
         │                                  "pin": "123456",
         │                                  "deviceName": "Living Room",
         │                                  "deviceType": "tablet"
         │                                }
         │                                             │
         │ 4. WebSocket Event: "pairing_verified"     │
         │ ◄───────────────────────────────────────────┤
         │    {                                        │
         │      "sessionId": "...",                   │
         │      "deviceName": "Living Room",          │
         │      "deviceType": "tablet"                │
         │    }                                        │
         │                                             │
         │ 5. Admin assigns areas                     │
         │    - Client name                           │
         │    - Area selection                        │
         ▼                                             │
    POST /api/pairing/:sessionId/complete             │
    {                                                  │
      "clientName": "Living Room Tablet",             │
      "areaIds": ["area-1", "area-2"]                 │
    }                                                  │
         │                                             │
         │ 6. WebSocket Event: "pairing_completed"    │
         ├─────────────────────────────────────────────►
         │    {                                        │
         │      "clientId": "...",                    │
         │      "token": "client-access-token"        │
         │    }                                        │
         │                                             │
         │                                             │ 7. Client stores token
         │                                             │    Connects to WebSocket
         │                                             │    Fetches assigned areas
         │                                             ▼
```

---

## Step-by-Step Guide

### Admin Side (React UI)

#### Step 1: Generate Pairing Session

```typescript
// Component: PairingWizard.tsx
const handleStartPairing = async () => {
  const session = await apiClient.createPairingSession();
  // session = {
  //   id: "pairing-uuid",
  //   pin: "123456",
  //   expiresAt: "2025-12-02T15:30:00.000Z",
  //   verified: false
  // }
  setPairingSession(session);
  setActiveStep(1); // Move to "Waiting for Client" step
};
```

**Backend Processing:**

```typescript
// Backend: index-simple.ts
app.post('/api/pairing/create', authenticate, (req, res) => {
  const sessionId = crypto.randomUUID();
  const pin = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  db.prepare(`
    INSERT INTO pairing_sessions (id, pin, expiresAt, verified)
    VALUES (?, ?, ?, 0)
  `).run(sessionId, pin, expiresAt.toISOString());

  res.status(201).json({
    id: sessionId,
    pin,
    expiresAt: expiresAt.toISOString(),
    verified: false
  });
});
```

#### Step 2: Display PIN with Countdown (NEW in v1.4.0!)

```typescript
// Component: PairingWizard.tsx

// Real-time countdown timer
const [timeRemaining, setTimeRemaining] = useState<number>(0);

useEffect(() => {
  if (!pairingSession || activeStep !== 1) return;

  const updateCountdown = () => {
    const expiryTime = new Date(pairingSession.expiresAt).getTime();
    const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
    setTimeRemaining(remaining);

    if (remaining <= 0) {
      setPinExpired(true);
    }
  };

  updateCountdown();
  const interval = setInterval(updateCountdown, 1000);
  return () => clearInterval(interval);
}, [pairingSession, activeStep]);

// Display component
<Paper
  elevation={2}
  sx={{
    p: 3,
    bgcolor: timeRemaining > 60 ? 'success.light' :
             timeRemaining > 30 ? 'warning.light' : 'error.light'
  }}
>
  <Stack direction="row" alignItems="center" spacing={1}>
    <TimerIcon sx={{ fontSize: 40 }} />
    <Typography variant="h3" fontWeight="bold">
      {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
    </Typography>
  </Stack>
  <Typography variant="subtitle1">Time Remaining</Typography>
</Paper>

{/* Progress Bar */}
<LinearProgress
  variant="determinate"
  value={(timeRemaining / 300) * 100} // 5 minutes = 300 seconds
  sx={{
    height: 8,
    '& .MuiLinearProgress-bar': {
      bgcolor: timeRemaining > 60 ? 'success.main' :
               timeRemaining > 30 ? 'warning.main' : 'error.main'
    }
  }}
/>
```

**Visual Improvements:**
- ✅ Large, prominent countdown (H3 typography)
- ✅ Color-coded by urgency (green → yellow → red)
- ✅ Timer icon for visual clarity
- ✅ Progress bar showing depletion
- ✅ Removed end time display
- ✅ Updates every second in real-time

#### Step 3: Wait for Client Verification

```typescript
// Component: PairingWizard.tsx
useEffect(() => {
  const unsubscribeVerified = onWsEvent('pairing_verified', (data) => {
    if (data.sessionId === pairingSession?.id) {
      setVerifiedDeviceName(data.deviceName);
      setVerifiedDeviceType(data.deviceType);
      setClientName(data.deviceName); // Pre-fill client name
      setDeviceType(data.deviceType as Client['deviceType']);
      setActiveStep(2); // Move to area assignment
    }
  });

  return () => unsubscribeVerified();
}, [pairingSession, onWsEvent]);
```

#### Step 4: Assign Areas and Complete Pairing

```typescript
// Component: PairingWizard.tsx
const handleCompletePairing = async () => {
  const client = await apiClient.completePairing(
    pairingSession.id,
    clientName,
    selectedAreas
  );

  setPairedClient(client);
  setActiveStep(3); // Success!
};
```

**Backend Processing:**

```typescript
// Backend: index-simple.ts
app.post('/api/pairing/:sessionId/complete', authenticate, async (req, res) => {
  const { sessionId } = req.params;
  const { clientName, areaIds } = req.body;

  // Verify pairing session
  const session = db.prepare(`
    SELECT * FROM pairing_sessions
    WHERE id = ? AND verified = 1 AND completed = 0
  `).get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Invalid pairing session' });
  }

  // Generate client token
  const clientId = crypto.randomUUID();
  const clientToken = generateClientToken();
  const hashedToken = hashToken(clientToken);

  // Create client record
  db.prepare(`
    INSERT INTO clients (id, name, deviceType, deviceName, token, areaIds, createdAt, lastSeen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clientId,
    clientName,
    session.deviceType,
    session.deviceName,
    hashedToken,
    JSON.stringify(areaIds),
    new Date().toISOString(),
    new Date().toISOString()
  );

  // Mark session as completed
  db.prepare(`
    UPDATE pairing_sessions
    SET completed = 1, completedAt = ?
    WHERE id = ?
  `).run(new Date().toISOString(), sessionId);

  // Notify client via WebSocket
  notifyPairingCompleted(sessionId, {
    clientId,
    token: clientToken,
    areaIds
  });

  res.json({
    client: {
      id: clientId,
      name: clientName,
      deviceType: session.deviceType,
      token: hashedToken,
      areaIds
    },
    token: clientToken // RAW token (only shown once!)
  });
});
```

---

### Client Side (Device Implementation)

#### Step 1: User Enters PIN

```typescript
// Client app should provide UI for PIN entry
const pairDevice = async (pin: string, deviceName: string, deviceType: string) => {
  try {
    // Step 1: Verify PIN with backend
    const response = await fetch(`${API_URL}/api/pairing/${sessionId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin,
        deviceName,
        deviceType
      })
    });

    if (!response.ok) {
      throw new Error('Invalid PIN');
    }

    const { verified, sessionId } = await response.json();

    // Step 2: Connect to WebSocket and wait for completion
    const socket = io(WS_URL);

    socket.on('pairing_completed', (data) => {
      if (data.sessionId === sessionId) {
        // Step 3: Store client token securely
        await secureStorage.set('client_token', data.token);

        // Step 4: Reconnect with token
        connectToHAsync(data.token);
      }
    });

  } catch (error) {
    console.error('Pairing failed:', error);
  }
};
```

#### Step 2: Connect with Client Token

```typescript
// Client connects to HAsync with authenticated WebSocket
const connectToHAsync = (token: string) => {
  const socket = io(WS_URL, {
    auth: { token }
  });

  socket.on('connect', () => {
    console.log('Connected to HAsync!');

    // Fetch assigned areas
    fetchAreas(token);
  });

  socket.on('entity_update', (data) => {
    // Update UI with entity state changes
    updateEntityState(data.entity_id, data.state);
  });

  socket.on('area_added', (data) => {
    // Admin assigned new area to this client
    fetchAreas(token);
  });

  socket.on('area_removed', (data) => {
    // Admin removed area from this client
    removeArea(data.areaId);
  });
};
```

---

## WebSocket Events

### pairing_verified

**Direction:** Backend → Admin UI

**Triggered When:** Client successfully verifies PIN

**Payload:**
```json
{
  "sessionId": "pairing-uuid",
  "deviceName": "Living Room Tablet",
  "deviceType": "tablet"
}
```

**Admin UI Reaction:**
- Move to area assignment step
- Pre-fill client name with device name
- Pre-select device type

---

### pairing_completed

**Direction:** Backend → Client Device

**Triggered When:** Admin completes pairing

**Payload:**
```json
{
  "clientId": "client-uuid",
  "token": "raw-client-access-token",
  "areaIds": ["area-1", "area-2"]
}
```

**Client Reaction:**
- Store token securely
- Disconnect from WebSocket
- Reconnect with authenticated token
- Fetch assigned areas and entities

---

## Security

### PIN Security

- **Random Generation:** Cryptographically secure random bytes
- **Short Lifespan:** 5-minute expiration
- **One-Time Use:** PIN invalidated after verification
- **Rate Limited:** Maximum 10 pairing attempts per 15 minutes

### Token Security

- **Long Token:** 64-character hex string (256 bits)
- **Hashed Storage:** SHA-256 hash stored in database
- **One-Time Display:** Raw token shown only during pairing
- **No Expiration:** Tokens remain valid until revoked

### Best Practices

1. **Display PIN Prominently:** Ensure user can clearly see PIN on admin interface
2. **Secure Token Storage:** Use platform-specific secure storage on client devices
3. **Revoke on Device Loss:** Immediately revoke tokens if device is lost/stolen
4. **Network Security:** Always use TLS in production environments

---

## Troubleshooting

### Problem: "PIN has expired"

**Symptoms:**
- Countdown timer reaches 0:00
- Error message displayed

**Solution:**
- Click "Generate New PIN" to create fresh pairing session
- PIN expires after 5 minutes for security

---

### Problem: Client can't verify PIN

**Symptoms:**
- Client submits PIN but gets "Invalid PIN" error

**Possible Causes:**

1. **Wrong PIN entered**
   ```
   Solution: Double-check PIN display on admin UI
   ```

2. **PIN expired**
   ```
   Solution: Generate new PIN
   ```

3. **Network connectivity**
   ```bash
   # Test backend connectivity
   curl http://hasync-server:8099/api/health
   ```

4. **Session already completed**
   ```
   Solution: Generate new pairing session
   ```

---

### Problem: Pairing verified but not completed

**Symptoms:**
- Admin UI shows "Client connected!"
- Client waiting indefinitely

**Cause:** Admin hasn't clicked "Complete Pairing"

**Solution:** Admin must assign areas and click "Complete Pairing" button

---

### Problem: Client token not working

**Symptoms:**
- WebSocket connection rejected with "Invalid token"

**Possible Causes:**

1. **Token not stored correctly**
   ```typescript
   // Verify token storage
   const storedToken = await secureStorage.get('client_token');
   console.log('Stored token:', storedToken);
   ```

2. **Token revoked by admin**
   ```bash
   # Check client status
   GET /api/clients/:id
   Authorization: Bearer <admin-jwt>
   ```

3. **Wrong token format**
   ```typescript
   // Token should be 64-character hex string
   if (!/^[0-9a-f]{64}$/.test(token)) {
     console.error('Invalid token format');
   }
   ```

---

### Problem: Countdown timer not updating

**Symptoms:**
- Timer shows static time
- No color changes

**Solution:** Refresh admin interface (fixed in v1.4.0)

**Technical Details:**
```typescript
// Countdown updates via useEffect with 1-second interval
useEffect(() => {
  const interval = setInterval(updateCountdown, 1000);
  return () => clearInterval(interval);
}, [pairingSession, activeStep]);
```

---

## Database Schema

### pairing_sessions Table

```sql
CREATE TABLE pairing_sessions (
  id TEXT PRIMARY KEY,
  pin TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  deviceName TEXT,
  deviceType TEXT,
  completed INTEGER DEFAULT 0,
  completedAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pairing_pin ON pairing_sessions(pin);
CREATE INDEX idx_pairing_expires ON pairing_sessions(expiresAt);
```

### clients Table

```sql
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  deviceType TEXT NOT NULL,
  deviceName TEXT,
  token TEXT NOT NULL UNIQUE, -- SHA-256 hashed
  areaIds TEXT, -- JSON array
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  lastSeen TEXT,
  UNIQUE(token)
);

CREATE INDEX idx_client_token ON clients(token);
```

---

## Version History

- **v1.4.0:** Enhanced pairing UI with prominent countdown timer, color coding, and progress bar
- **v1.3.0:** Improved WebSocket event notifications
- **v1.2.0:** Added device name and type capture
- **v1.1.0:** Implemented PIN-based pairing

---

**Last Updated:** 2025-12-02 (v1.4.0)
