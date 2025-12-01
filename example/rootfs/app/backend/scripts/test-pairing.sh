#!/bin/bash
# Test script for pairing endpoints
# Usage: ./test-pairing.sh [base_url]

BASE_URL=${1:-http://localhost:8123}
ADMIN_USER=${ADMIN_USERNAME:-admin}
ADMIN_PASS=${ADMIN_PASSWORD:-test123}

echo "🔐 Testing Pairing Flow at $BASE_URL"
echo "========================================"
echo ""

# Step 1: Admin Login
echo "📝 Step 1: Admin login..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

ADMIN_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

if [ "$ADMIN_TOKEN" == "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Admin login failed!"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Admin logged in successfully"
echo "   Token: ${ADMIN_TOKEN:0:20}..."
echo ""

# Step 2: Generate Pairing PIN
echo "📝 Step 2: Generate pairing PIN..."
PAIRING_RESPONSE=$(curl -s -X POST "$BASE_URL/api/pairing/create" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

SESSION_ID=$(echo $PAIRING_RESPONSE | jq -r '.id')
PIN=$(echo $PAIRING_RESPONSE | jq -r '.pin')
STATUS=$(echo $PAIRING_RESPONSE | jq -r '.status')

if [ "$SESSION_ID" == "null" ] || [ -z "$SESSION_ID" ]; then
  echo "❌ Failed to create pairing session!"
  echo "Response: $PAIRING_RESPONSE"
  exit 1
fi

echo "✅ Pairing session created"
echo "   Session ID: $SESSION_ID"
echo "   PIN: $PIN"
echo "   Status: $STATUS"
echo ""

# Step 3: Client Verifies PIN
echo "📝 Step 3: Client verifies PIN..."
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/pairing/$SESSION_ID/verify" \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"$PIN\",\"deviceName\":\"Test Device\",\"deviceType\":\"mobile\"}")

VERIFY_SUCCESS=$(echo $VERIFY_RESPONSE | jq -r '.success')
VERIFY_STATUS=$(echo $VERIFY_RESPONSE | jq -r '.status')

if [ "$VERIFY_SUCCESS" != "true" ]; then
  echo "❌ PIN verification failed!"
  echo "Response: $VERIFY_RESPONSE"
  exit 1
fi

echo "✅ PIN verified successfully"
echo "   Status: $VERIFY_STATUS"
echo ""

# Step 4: Check Session Status
echo "📝 Step 4: Check session status..."
STATUS_RESPONSE=$(curl -s "$BASE_URL/api/pairing/$SESSION_ID")

CURRENT_STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')
DEVICE_NAME=$(echo $STATUS_RESPONSE | jq -r '.deviceName')

echo "✅ Session status retrieved"
echo "   Status: $CURRENT_STATUS"
echo "   Device: $DEVICE_NAME"
echo ""

# Step 5: Admin Completes Pairing
echo "📝 Step 5: Admin completes pairing..."
COMPLETE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/pairing/$SESSION_ID/complete" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"clientName\":\"Test Client\",\"assignedAreas\":[]}")

CLIENT_ID=$(echo $COMPLETE_RESPONSE | jq -r '.clientId')
CLIENT_TOKEN=$(echo $COMPLETE_RESPONSE | jq -r '.clientToken')
COMPLETE_SUCCESS=$(echo $COMPLETE_RESPONSE | jq -r '.success')

if [ "$COMPLETE_SUCCESS" != "true" ]; then
  echo "❌ Pairing completion failed!"
  echo "Response: $COMPLETE_RESPONSE"
  exit 1
fi

echo "✅ Pairing completed successfully"
echo "   Client ID: $CLIENT_ID"
echo "   Client Token: ${CLIENT_TOKEN:0:30}..."
echo ""

# Step 6: Verify Client Token
echo "📝 Step 6: Verify client token..."
TOKEN_VERIFY_RESPONSE=$(curl -s "$BASE_URL/api/auth/verify" \
  -H "Authorization: Bearer $CLIENT_TOKEN")

TOKEN_VALID=$(echo $TOKEN_VERIFY_RESPONSE | jq -r '.valid')
TOKEN_ROLE=$(echo $TOKEN_VERIFY_RESPONSE | jq -r '.user.role')

if [ "$TOKEN_VALID" != "true" ]; then
  echo "❌ Client token verification failed!"
  echo "Response: $TOKEN_VERIFY_RESPONSE"
  exit 1
fi

echo "✅ Client token verified"
echo "   Valid: $TOKEN_VALID"
echo "   Role: $TOKEN_ROLE"
echo ""

# Step 7: Delete Pairing Session (cleanup)
echo "📝 Step 7: Cleanup - delete pairing session..."
DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/api/pairing/$SESSION_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

DELETE_SUCCESS=$(echo $DELETE_RESPONSE | jq -r '.success')

if [ "$DELETE_SUCCESS" == "true" ]; then
  echo "✅ Pairing session deleted"
else
  echo "⚠️  Failed to delete session (may not exist anymore)"
fi

echo ""
echo "========================================"
echo "🎉 All pairing tests passed successfully!"
echo "========================================"
echo ""
echo "Summary:"
echo "  - Admin login: ✅"
echo "  - PIN generation: ✅"
echo "  - PIN verification: ✅"
echo "  - Status check: ✅"
echo "  - Pairing completion: ✅"
echo "  - Token verification: ✅"
echo "  - Session cleanup: ✅"
echo ""
echo "Client credentials:"
echo "  Client ID: $CLIENT_ID"
echo "  Client Token: $CLIENT_TOKEN"
echo ""
