#!/bin/bash
# Test Authentication Flow for v1.3.39

set -e

echo "======================================"
echo "🧪 Testing HAsync v1.3.39 Auth Fix"
echo "======================================"

# Kill any running servers
echo ""
echo "1️⃣  Stopping any running servers..."
pkill -f "tsx.*index-simple" || true
pkill -f "node.*index-simple" || true
sleep 2

# Start backend server in background
echo ""
echo "2️⃣  Starting backend server..."
cd /Users/domde/Documents/CLAUDE/Addon/githubv4/example/rootfs/app/backend

export JWT_SECRET="test-secret-$(openssl rand -hex 16)"
export DATABASE_PATH="/tmp/hasync-test-$(date +%s).db"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="testpass123"
export PORT=8099
export LOG_LEVEL="DEBUG"

npm run dev > /tmp/test-server.log 2>&1 &
SERVER_PID=$!
echo "   Server PID: $SERVER_PID"

# Wait for server to start
echo ""
echo "3️⃣  Waiting for server to start..."
sleep 8

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "   ❌ Server failed to start!"
    echo "   Logs:"
    tail -30 /tmp/test-server.log
    exit 1
fi

echo "   ✅ Server started successfully"

# Test 1: Login
echo ""
echo "4️⃣  TEST 1: Admin Login"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8099/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"testpass123"}')

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n 1)
BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Login successful (200)"
    TOKEN=$(echo "$BODY" | jq -r '.token')
    echo "   Token: ${TOKEN:0:50}..."
else
    echo "   ❌ Login failed ($HTTP_CODE)"
    echo "   Response: $BODY"
    kill $SERVER_PID
    exit 1
fi

# Test 2: Request WITH Authorization header
echo ""
echo "5️⃣  TEST 2: Request WITH Bearer Token"
CLIENTS_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://localhost:8099/api/clients \
  -H "Authorization: Bearer $TOKEN")

HTTP_CODE=$(echo "$CLIENTS_RESPONSE" | tail -n 1)
BODY=$(echo "$CLIENTS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ GET /api/clients successful with token ($HTTP_CODE)"
else
    echo "   ❌ GET /api/clients failed ($HTTP_CODE)"
    echo "   Response: $BODY"
fi

# Test 3: POST request WITH Authorization header (should SKIP CSRF)
echo ""
echo "6️⃣  TEST 3: POST WITH Bearer Token (Should Skip CSRF)"
CONFIG_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8099/api/config/ha \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localhost:8123","token":"test-token"}')

HTTP_CODE=$(echo "$CONFIG_RESPONSE" | tail -n 1)
BODY=$(echo "$CONFIG_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ POST /api/config/ha successful without CSRF ($HTTP_CODE)"
    echo "   🎉 CSRF SKIP WORKING!"
else
    echo "   ⚠️  POST /api/config/ha returned $HTTP_CODE"
    echo "   Response: $BODY"
    if [ "$HTTP_CODE" = "403" ]; then
        echo "   ❌ CSRF ERROR - Token not detected!"
    fi
fi

# Test 4: Request WITHOUT Authorization header (should fail)
echo ""
echo "7️⃣  TEST 4: Request WITHOUT Bearer Token (Should Fail 401)"
NO_AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://localhost:8099/api/clients)

HTTP_CODE=$(echo "$NO_AUTH_RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "401" ]; then
    echo "   ✅ Correctly rejected without token ($HTTP_CODE)"
else
    echo "   ⚠️  Unexpected response: $HTTP_CODE"
fi

# Check server logs for debug messages
echo ""
echo "8️⃣  Checking Server Logs for Debug Messages"
echo ""
echo "   Looking for: '✓ Skipping CSRF for JWT-authenticated request'"
if grep -q "Skipping CSRF for JWT" /tmp/test-server.log; then
    echo "   ✅ CSRF skip log found!"
    grep "Skipping CSRF" /tmp/test-server.log | tail -3
else
    echo "   ❌ CSRF skip log NOT found"
    echo "   Last 20 log lines:"
    tail -20 /tmp/test-server.log
fi

# Cleanup
echo ""
echo "9️⃣  Cleanup"
kill $SERVER_PID 2>/dev/null || true
echo "   Server stopped"

echo ""
echo "======================================"
echo "✅ Test Complete!"
echo "======================================"
