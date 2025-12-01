# Pairing System End-to-End Test Plan

## Overview
Comprehensive test plan for the client-server pairing system with PIN-based authentication, certificate management, and WebSocket communication.

---

## Test Environment Setup

### Prerequisites
- Server running on `https://localhost:3000` (or your configured domain)
- Admin credentials: `admin` / `admin123` (default)
- Client application or testing tool (curl, Postman)
- WebSocket client (wscat, browser console)

### Environment Variables
```bash
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production
```

---

## Test Scenarios

---

## 1. Happy Path - Complete Pairing Flow

### Objective
Validate the complete pairing flow from admin PIN generation to client WebSocket connection.

### Prerequisites
- Fresh server instance
- No existing paired clients

### Test Steps

#### Step 1: Admin Login
```bash
# Login as admin
curl -X POST https://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' \
  -k

# Expected Response:
{
  "success": true,
  "data": {
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc...",
    "user": {
      "username": "admin",
      "role": "admin"
    }
  }
}
```

**Save the `access_token` for subsequent requests.**

#### Step 2: Generate Pairing PIN
```bash
# Generate PIN (admin authentication required)
curl -X GET https://localhost:3000/api/pairing/pin \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -k

# Expected Response:
{
  "success": true,
  "data": {
    "pin": "123456",
    "expires_at": 1701234567890,
    "expires_in": 300
  },
  "timestamp": 1701234267890
}
```

**Save the `pin` value.**

#### Step 3: Client Verifies PIN and Completes Pairing
```bash
# Generate a public key for testing (in production, client generates this)
PUBLIC_KEY=$(openssl rand -hex 32)

# Complete pairing
curl -X POST https://localhost:3000/api/pairing/complete \
  -H "Content-Type: application/json" \
  -d "{
    \"pin\": \"123456\",
    \"device_name\": \"Test Client Device\",
    \"device_type\": \"mobile\",
    \"public_key\": \"$PUBLIC_KEY\"
  }" \
  -k

# Expected Response:
{
  "success": true,
  "data": {
    "client_id": "uuid-v4-string",
    "certificate": "certificate-hash-string",
    "paired_at": 1701234567890
  },
  "timestamp": 1701234567890
}
```

**Save `client_id` and `certificate`.**

#### Step 4: Admin Verifies Client List
```bash
# List all paired clients
curl -X GET https://localhost:3000/api/clients \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -k

# Expected Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid-v4-string",
      "name": "Test Client Device",
      "device_type": "mobile",
      "public_key": "...",
      "certificate": "...",
      "paired_at": 1701234567890,
      "last_seen": 1701234567890,
      "is_active": true
    }
  ]
}
```

#### Step 5: Client Connects via WebSocket
```bash
# Using wscat
wscat -c wss://localhost:3000/ws --no-check

# After connection, authenticate:
{"type":"auth","payload":{"client_id":"YOUR_CLIENT_ID","certificate":"YOUR_CERTIFICATE"}}

# Expected Response:
{"type":"auth_ok","payload":{"message":"Authentication successful","client_id":"YOUR_CLIENT_ID"}}
```

#### Step 6: Client Subscribes to Entity Updates
```bash
# Send subscription message
{"type":"subscribe_entities","payload":{"entity_ids":["light.living_room","sensor.temperature"]}}

# Expected Response:
{"type":"subscribed","payload":{"entity_ids":["light.living_room","sensor.temperature"],"message":"Subscribed to entity updates"}}
```

### Expected Results
- ✅ Admin successfully authenticates
- ✅ PIN is generated and valid for 5 minutes
- ✅ Client successfully pairs using PIN
- ✅ Client appears in admin's client list
- ✅ Client successfully authenticates via WebSocket
- ✅ Client receives entity update subscriptions

### Test Data
```javascript
{
  admin: {
    username: "admin",
    password: "admin123"
  },
  client: {
    device_name: "Test Client Device",
    device_type: "mobile"
  }
}
```

---

## 2. PIN Expiration Test

### Objective
Verify that PINs expire after 5 minutes and cannot be used.

### Test Steps

#### Step 1: Generate PIN
```bash
curl -X GET https://localhost:3000/api/pairing/pin \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -k
```

**Record the PIN and timestamp.**

#### Step 2: Wait 5+ Minutes
```bash
# Wait 5 minutes and 10 seconds
sleep 310
```

#### Step 3: Attempt to Use Expired PIN
```bash
PUBLIC_KEY=$(openssl rand -hex 32)

curl -X POST https://localhost:3000/api/pairing/complete \
  -H "Content-Type: application/json" \
  -d "{
    \"pin\": \"EXPIRED_PIN\",
    \"device_name\": \"Test Client\",
    \"device_type\": \"mobile\",
    \"public_key\": \"$PUBLIC_KEY\"
  }" \
  -k

# Expected Response:
{
  "success": false,
  "error": {
    "message": "PIN has expired",
    "code": "VALIDATION_ERROR"
  },
  "timestamp": 1701234567890
}
```

### Expected Results
- ✅ PIN generation succeeds
- ✅ After 5 minutes, PIN is expired
- ✅ Pairing attempt with expired PIN returns 400 error
- ✅ Error message: "PIN has expired"

---

## 3. Invalid PIN Test

### Objective
Verify that invalid PINs are rejected.

### Test Steps

#### Step 1: Generate Valid PIN
```bash
curl -X GET https://localhost:3000/api/pairing/pin \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -k
```

**Note the valid PIN but don't use it.**

#### Step 2: Attempt Pairing with Wrong PIN
```bash
PUBLIC_KEY=$(openssl rand -hex 32)

curl -X POST https://localhost:3000/api/pairing/complete \
  -H "Content-Type: application/json" \
  -d "{
    \"pin\": \"999999\",
    \"device_name\": \"Test Client\",
    \"device_type\": \"mobile\",
    \"public_key\": \"$PUBLIC_KEY\"
  }" \
  -k

# Expected Response:
{
  "success": false,
  "error": {
    "message": "Invalid or expired PIN",
    "code": "VALIDATION_ERROR"
  },
  "timestamp": 1701234567890
}
```

### Expected Results
- ✅ Invalid PIN is rejected
- ✅ Error message: "Invalid or expired PIN"
- ✅ HTTP Status: 400 Bad Request
- ✅ Valid PIN remains unused and available

---

## 4. Token Revocation Test

### Objective
Verify that revoking a client's token prevents further access.

### Prerequisites
- One paired client with valid certificate

### Test Steps

#### Step 1: Complete Initial Pairing
```bash
# Follow steps from Test 1 to pair a client
# Save client_id and certificate
```

#### Step 2: Client Connects via WebSocket
```bash
wscat -c wss://localhost:3000/ws --no-check

# Authenticate
{"type":"auth","payload":{"client_id":"YOUR_CLIENT_ID","certificate":"YOUR_CERTIFICATE"}}

# Should succeed
```

#### Step 3: Admin Revokes Client
```bash
curl -X POST https://localhost:3000/api/clients/YOUR_CLIENT_ID/revoke \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -k

# Expected Response:
{
  "success": true,
  "data": {
    "revoked": true
  },
  "timestamp": 1701234567890
}
```

#### Step 4: Verify Client is Revoked
```bash
curl -X GET https://localhost:3000/api/clients/YOUR_CLIENT_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -k

# Expected Response:
{
  "success": true,
  "data": {
    "id": "YOUR_CLIENT_ID",
    "is_active": false,
    ...
  }
}
```

#### Step 5: Client Attempts New WebSocket Connection
```bash
wscat -c wss://localhost:3000/ws --no-check

# Authenticate with revoked credentials
{"type":"auth","payload":{"client_id":"YOUR_CLIENT_ID","certificate":"YOUR_CERTIFICATE"}}

# Expected Response:
{"type":"error","payload":{"error":"Invalid credentials"}}
# Connection should be closed by server
```

### Expected Results
- ✅ Client successfully pairs and connects initially
- ✅ Admin can revoke client access
- ✅ Revoked client shows `is_active: false`
- ✅ Revoked client cannot authenticate via WebSocket
- ✅ Error message: "Invalid credentials"

---

## 5. Area Assignment Changes Test

### Objective
Verify that clients receive real-time notifications when their assigned areas change.

### Prerequisites
- Paired client with active WebSocket connection
- Home Assistant integration configured

### Test Steps

#### Step 1: Setup - Pair Client and Connect
```bash
# Complete pairing (Test 1, Steps 1-3)
# Connect via WebSocket (Test 1, Step 5)
```

#### Step 2: Admin Assigns Initial Areas
```bash
# Assuming area assignment endpoint exists
curl -X POST https://localhost:3000/api/clients/YOUR_CLIENT_ID/areas \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "areas": ["living_room", "bedroom"]
  }' \
  -k
```

**Client should receive WebSocket message:**
```json
{
  "type": "area_assigned",
  "payload": {
    "areas": ["living_room", "bedroom"]
  },
  "timestamp": 1701234567890
}
```

#### Step 3: Admin Adds Third Area
```bash
curl -X POST https://localhost:3000/api/clients/YOUR_CLIENT_ID/areas/add \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "area": "kitchen"
  }' \
  -k
```

**Client should receive:**
```json
{
  "type": "area_added",
  "payload": {
    "area": "kitchen"
  },
  "timestamp": 1701234567890
}
```

#### Step 4: Admin Removes First Area
```bash
curl -X DELETE https://localhost:3000/api/clients/YOUR_CLIENT_ID/areas/living_room \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -k
```

**Client should receive:**
```json
{
  "type": "area_removed",
  "payload": {
    "area": "living_room"
  },
  "timestamp": 1701234567890
}
```

### Expected Results
- ✅ Client receives initial area assignment
- ✅ Client receives `area_added` event when area is added
- ✅ Client receives `area_removed` event when area is removed
- ✅ All events received in real-time via WebSocket

**Note:** This test requires area management endpoints to be implemented.

---

## 6. Security Tests

### Objective
Verify authentication and authorization controls.

### Test 6.1: Unauthorized Access to Admin Endpoints

```bash
# Attempt to access /api/clients without token
curl -X GET https://localhost:3000/api/clients -k

# Expected Response:
{
  "error": "Unauthorized",
  "message": "No authentication token provided"
}
# HTTP Status: 401
```

### Test 6.2: Client Token Cannot Access Admin Endpoints

```bash
# Generate client certificate (from pairing)
# Attempt to use client credentials for admin endpoint
curl -X GET https://localhost:3000/api/clients \
  -H "Authorization: Bearer CLIENT_CERTIFICATE" \
  -k

# Expected Response:
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
# HTTP Status: 401
```

### Test 6.3: Expired Session Verification

```bash
# Use expired admin token (15+ minutes old)
curl -X GET https://localhost:3000/api/clients \
  -H "Authorization: Bearer EXPIRED_ADMIN_TOKEN" \
  -k

# Expected Response:
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
# HTTP Status: 401
```

### Test 6.4: Verify Non-Verified Session

```bash
# Attempt to complete pairing with non-existent PIN
curl -X POST https://localhost:3000/api/pairing/complete \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "000000",
    "device_name": "Test",
    "device_type": "mobile",
    "public_key": "fake-key"
  }' \
  -k

# Expected Response:
{
  "success": false,
  "error": {
    "message": "Invalid or expired PIN",
    "code": "VALIDATION_ERROR"
  }
}
# HTTP Status: 400
```

### Test 6.5: Duplicate Public Key

```bash
# Complete pairing with a public key
PUBLIC_KEY=$(openssl rand -hex 32)
# (use from successful pairing)

# Attempt to pair again with same public key
curl -X POST https://localhost:3000/api/pairing/complete \
  -H "Content-Type: application/json" \
  -d "{
    \"pin\": \"NEW_PIN\",
    \"device_name\": \"Duplicate Client\",
    \"device_type\": \"mobile\",
    \"public_key\": \"$PUBLIC_KEY\"
  }" \
  -k

# Expected Response:
{
  "success": false,
  "error": {
    "message": "Client already paired",
    "code": "VALIDATION_ERROR"
  }
}
# HTTP Status: 400
```

### Expected Results
- ✅ Unauthenticated requests return 401
- ✅ Client credentials cannot access admin endpoints
- ✅ Expired tokens are rejected
- ✅ Invalid PINs return 400
- ✅ Duplicate public keys are rejected

---

## WebSocket Testing Instructions

### Using wscat (Command Line)

#### Installation
```bash
npm install -g wscat
```

#### Connect and Test
```bash
# Connect to WebSocket server
wscat -c wss://localhost:3000/ws --no-check

# After "connected" message, authenticate
> {"type":"auth","payload":{"client_id":"YOUR_CLIENT_ID","certificate":"YOUR_CERTIFICATE"}}

# Expected response
< {"type":"auth_ok","payload":{"message":"Authentication successful","client_id":"YOUR_CLIENT_ID"}}

# Subscribe to entities
> {"type":"subscribe_entities","payload":{"entity_ids":["light.living_room"]}}

# Expected response
< {"type":"subscribed","payload":{"entity_ids":["light.living_room"],"message":"Subscribed to entity updates"}}

# Send ping
> {"type":"ping"}

# Expected response
< {"type":"pong","payload":{"timestamp":1701234567890}}
```

### Using Browser Console

```javascript
// Connect to WebSocket
const ws = new WebSocket('wss://localhost:3000/ws');

// Handle connection
ws.onopen = () => {
  console.log('Connected');

  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    payload: {
      client_id: 'YOUR_CLIENT_ID',
      certificate: 'YOUR_CERTIFICATE'
    }
  }));
};

// Handle messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

// Handle errors
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// Handle close
ws.onclose = (event) => {
  console.log('Connection closed:', event.code, event.reason);
};

// Subscribe to entities
function subscribe() {
  ws.send(JSON.stringify({
    type: 'subscribe_entities',
    payload: {
      entity_ids: ['light.living_room', 'sensor.temperature']
    }
  }));
}

// Call service
function toggleLight() {
  ws.send(JSON.stringify({
    type: 'call_service',
    payload: {
      domain: 'light',
      service: 'toggle',
      target: { entity_id: 'light.living_room' }
    }
  }));
}
```

### WebSocket Message Types

#### Client → Server
- `auth` - Authenticate with client credentials
- `ping` - Heartbeat check
- `subscribe_entities` - Subscribe to entity updates
- `call_service` - Call Home Assistant service

#### Server → Client
- `connected` - Connection established
- `auth_ok` - Authentication successful
- `subscribed` - Subscription confirmed
- `entity_update` - Entity state changed
- `service_call_result` - Service call result
- `error` - Error message
- `pong` - Ping response

---

## Automation Testing Scripts

### Bash Script: Full Happy Path Test

```bash
#!/bin/bash

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

BASE_URL="https://localhost:3000"

echo "Starting Pairing Flow Test..."

# Step 1: Admin Login
echo -e "\n${GREEN}Step 1: Admin Login${NC}"
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' \
  -k)

ADMIN_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.access_token')

if [ "$ADMIN_TOKEN" == "null" ]; then
  echo -e "${RED}✗ Admin login failed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Admin logged in${NC}"

# Step 2: Generate PIN
echo -e "\n${GREEN}Step 2: Generate Pairing PIN${NC}"
PIN_RESPONSE=$(curl -s -X GET $BASE_URL/api/pairing/pin \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -k)

PIN=$(echo $PIN_RESPONSE | jq -r '.data.pin')
EXPIRES_IN=$(echo $PIN_RESPONSE | jq -r '.data.expires_in')

if [ "$PIN" == "null" ]; then
  echo -e "${RED}✗ PIN generation failed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ PIN generated: $PIN (expires in ${EXPIRES_IN}s)${NC}"

# Step 3: Complete Pairing
echo -e "\n${GREEN}Step 3: Complete Pairing${NC}"
PUBLIC_KEY=$(openssl rand -hex 32)

PAIRING_RESPONSE=$(curl -s -X POST $BASE_URL/api/pairing/complete \
  -H "Content-Type: application/json" \
  -d "{
    \"pin\": \"$PIN\",
    \"device_name\": \"Test Client Device\",
    \"device_type\": \"mobile\",
    \"public_key\": \"$PUBLIC_KEY\"
  }" \
  -k)

CLIENT_ID=$(echo $PAIRING_RESPONSE | jq -r '.data.client_id')
CERTIFICATE=$(echo $PAIRING_RESPONSE | jq -r '.data.certificate')

if [ "$CLIENT_ID" == "null" ]; then
  echo -e "${RED}✗ Pairing failed${NC}"
  echo $PAIRING_RESPONSE | jq .
  exit 1
fi
echo -e "${GREEN}✓ Client paired successfully${NC}"
echo "  Client ID: $CLIENT_ID"

# Step 4: Verify Client List
echo -e "\n${GREEN}Step 4: Verify Client List${NC}"
CLIENTS_RESPONSE=$(curl -s -X GET $BASE_URL/api/clients \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -k)

CLIENT_COUNT=$(echo $CLIENTS_RESPONSE | jq '.data | length')

echo -e "${GREEN}✓ Found $CLIENT_COUNT paired client(s)${NC}"

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}All tests passed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Admin Token: $ADMIN_TOKEN"
echo "Client ID: $CLIENT_ID"
echo "Certificate: $CERTIFICATE"
```

### Python Script: Comprehensive Test Suite

```python
#!/usr/bin/env python3

import requests
import json
import time
from websocket import create_connection
import urllib3

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://localhost:3000"

class TestRunner:
    def __init__(self):
        self.admin_token = None
        self.client_id = None
        self.certificate = None

    def login_admin(self):
        """Test 1: Admin Login"""
        print("\n🔐 Test: Admin Login")
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"},
            verify=False
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        self.admin_token = data['data']['access_token']
        print("✓ Admin login successful")

    def test_generate_pin(self):
        """Test 2: Generate PIN"""
        print("\n📌 Test: Generate Pairing PIN")
        response = requests.get(
            f"{BASE_URL}/api/pairing/pin",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            verify=False
        )
        assert response.status_code == 200
        data = response.json()
        pin = data['data']['pin']
        expires_in = data['data']['expires_in']
        print(f"✓ PIN generated: {pin} (expires in {expires_in}s)")
        return pin

    def test_complete_pairing(self, pin):
        """Test 3: Complete Pairing"""
        print("\n🔗 Test: Complete Pairing")
        import hashlib
        public_key = hashlib.sha256(str(time.time()).encode()).hexdigest()

        response = requests.post(
            f"{BASE_URL}/api/pairing/complete",
            json={
                "pin": pin,
                "device_name": "Python Test Client",
                "device_type": "script",
                "public_key": public_key
            },
            verify=False
        )
        assert response.status_code == 201, f"Expected 201, got {response.status_code}"
        data = response.json()
        self.client_id = data['data']['client_id']
        self.certificate = data['data']['certificate']
        print(f"✓ Pairing successful - Client ID: {self.client_id}")

    def test_expired_pin(self):
        """Test 4: PIN Expiration"""
        print("\n⏰ Test: PIN Expiration")
        pin = self.test_generate_pin()
        print("  Waiting 310 seconds for PIN to expire...")
        time.sleep(310)

        import hashlib
        public_key = hashlib.sha256(str(time.time()).encode()).hexdigest()

        response = requests.post(
            f"{BASE_URL}/api/pairing/complete",
            json={
                "pin": pin,
                "device_name": "Expired Test",
                "device_type": "script",
                "public_key": public_key
            },
            verify=False
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Expired PIN correctly rejected")

    def test_invalid_pin(self):
        """Test 5: Invalid PIN"""
        print("\n❌ Test: Invalid PIN")
        import hashlib
        public_key = hashlib.sha256(str(time.time()).encode()).hexdigest()

        response = requests.post(
            f"{BASE_URL}/api/pairing/complete",
            json={
                "pin": "999999",
                "device_name": "Invalid Test",
                "device_type": "script",
                "public_key": public_key
            },
            verify=False
        )
        assert response.status_code == 400
        print("✓ Invalid PIN correctly rejected")

    def test_websocket_connection(self):
        """Test 6: WebSocket Connection"""
        print("\n🔌 Test: WebSocket Connection")
        ws = create_connection(
            f"wss://localhost:3000/ws",
            sslopt={"cert_reqs": 0}
        )

        # Receive connected message
        msg = ws.recv()
        print(f"  Received: {msg}")

        # Authenticate
        auth_msg = json.dumps({
            "type": "auth",
            "payload": {
                "client_id": self.client_id,
                "certificate": self.certificate
            }
        })
        ws.send(auth_msg)

        # Receive auth_ok
        response = json.loads(ws.recv())
        assert response['type'] == 'auth_ok'
        print("✓ WebSocket authentication successful")

        ws.close()

    def run_all_tests(self):
        """Run all tests"""
        print("=" * 50)
        print("PAIRING SYSTEM TEST SUITE")
        print("=" * 50)

        try:
            self.login_admin()
            pin = self.test_generate_pin()
            self.test_complete_pairing(pin)
            self.test_invalid_pin()
            # self.test_expired_pin()  # Uncomment for full test (takes 5+ mins)
            self.test_websocket_connection()

            print("\n" + "=" * 50)
            print("✅ ALL TESTS PASSED")
            print("=" * 50)

        except AssertionError as e:
            print(f"\n❌ TEST FAILED: {e}")
        except Exception as e:
            print(f"\n❌ ERROR: {e}")

if __name__ == "__main__":
    runner = TestRunner()
    runner.run_all_tests()
```

---

## Test Results Documentation Template

### Test Execution Record

**Date:** YYYY-MM-DD
**Tester:** [Name]
**Environment:** [Production/Staging/Development]
**Server Version:** [Version]

| Test # | Test Name | Status | Duration | Notes |
|--------|-----------|--------|----------|-------|
| 1 | Happy Path - Complete Flow | ✅ Pass | 15s | All steps successful |
| 2 | PIN Expiration | ✅ Pass | 5m 15s | PIN expired correctly |
| 3 | Invalid PIN | ✅ Pass | 2s | Error message correct |
| 4 | Token Revocation | ✅ Pass | 10s | Client blocked after revocation |
| 5 | Area Assignment Changes | ⏸️ Pending | - | Feature not implemented |
| 6.1 | Security - Unauthorized Access | ✅ Pass | 2s | 401 returned |
| 6.2 | Security - Client Token | ✅ Pass | 2s | 401 returned |
| 6.3 | Security - Expired Session | ✅ Pass | 2s | 401 returned |
| 6.4 | Security - Non-Verified Session | ✅ Pass | 2s | 400 returned |
| 6.5 | Security - Duplicate Public Key | ✅ Pass | 3s | Duplicate rejected |

### Issues Found

| Issue # | Severity | Description | Status |
|---------|----------|-------------|--------|
| - | - | - | - |

---

## Troubleshooting Guide

### Common Issues

#### 1. SSL Certificate Errors
```bash
# Add -k flag to curl commands
curl -k https://localhost:3000/...

# Or use --insecure
curl --insecure https://localhost:3000/...
```

#### 2. CORS Errors in Browser
- Ensure server has CORS configured
- Check browser console for specific errors
- Use browser DevTools Network tab

#### 3. WebSocket Connection Fails
```bash
# Check server is running
curl -k https://localhost:3000/api/health

# Verify WebSocket endpoint
wscat -c wss://localhost:3000/ws --no-check
```

#### 4. Authentication Fails
```bash
# Verify token is valid
echo $ADMIN_TOKEN

# Check token expiration (decode JWT)
# Use jwt.io or:
echo $ADMIN_TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq .
```

#### 5. PIN Already Used
- Each PIN can only be used once
- Generate new PIN for each pairing attempt
- Check server logs for PIN status

---

## Performance Benchmarks

### Expected Response Times

| Operation | Expected Time | Acceptable Range |
|-----------|---------------|------------------|
| Admin Login | < 100ms | 50-200ms |
| Generate PIN | < 50ms | 10-100ms |
| Complete Pairing | < 200ms | 100-500ms |
| List Clients | < 100ms | 50-300ms |
| WebSocket Auth | < 200ms | 100-500ms |
| Revoke Client | < 100ms | 50-300ms |

### Load Testing
```bash
# Using Apache Bench
ab -n 100 -c 10 -H "Authorization: Bearer $ADMIN_TOKEN" \
  -k https://localhost:3000/api/clients

# Expected: > 100 req/s
```

---

## Test Coverage Checklist

- [ ] Admin authentication
- [ ] PIN generation
- [ ] PIN expiration (5 minutes)
- [ ] PIN validation
- [ ] Client pairing flow
- [ ] Certificate generation
- [ ] Certificate validation
- [ ] Client listing
- [ ] Client details retrieval
- [ ] Client revocation
- [ ] Client deletion
- [ ] WebSocket connection
- [ ] WebSocket authentication
- [ ] Entity subscriptions
- [ ] Real-time updates
- [ ] Security: Unauthorized access
- [ ] Security: Invalid tokens
- [ ] Security: Expired tokens
- [ ] Security: Duplicate public keys
- [ ] Error handling
- [ ] Input validation
- [ ] Rate limiting (if implemented)

---

## Appendix

### A. Test Data Generator

```javascript
// Generate test data
function generateTestData() {
  return {
    admin: {
      username: 'admin',
      password: 'admin123'
    },
    clients: [
      {
        device_name: 'iPhone 15 Pro',
        device_type: 'mobile'
      },
      {
        device_name: 'iPad Air',
        device_type: 'tablet'
      },
      {
        device_name: 'MacBook Pro',
        device_type: 'desktop'
      }
    ]
  };
}
```

### B. Helper Functions

```bash
# Extract JSON field
extract_json() {
  echo $1 | jq -r ".$2"
}

# Generate random public key
generate_public_key() {
  openssl rand -hex 32
}

# Wait for PIN expiry
wait_for_expiry() {
  echo "Waiting for PIN to expire..."
  sleep 310
}
```

### C. Environment Setup Script

```bash
#!/bin/bash

# Setup test environment
echo "Setting up test environment..."

# Install dependencies
npm install -g wscat jq

# Verify server is running
if curl -k -s https://localhost:3000/api/health > /dev/null; then
  echo "✓ Server is running"
else
  echo "✗ Server is not running"
  exit 1
fi

# Verify SSL
if openssl s_client -connect localhost:3000 < /dev/null 2>/dev/null | grep -q "CONNECTED"; then
  echo "✓ SSL is configured"
else
  echo "✗ SSL connection failed"
fi

echo "Environment setup complete"
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-12-01 | QA Team | Initial test plan creation |

---

**End of Test Plan**
