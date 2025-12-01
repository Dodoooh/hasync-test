#!/bin/bash
# Integration Test for HAsync Pairing System v1.3.25
# Tests complete pairing flow from PIN generation to token revocation

set -e

# Configuration
SERVER="${PAIRING_SERVER:-http://localhost:8099}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-test123}"
DEVICE_NAME="Test iPad Pro"
DEVICE_TYPE="tablet"
CLIENT_NAME="Integration Test Client"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TEST_START_TIME=$(date +%s)

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((TESTS_PASSED++))
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((TESTS_FAILED++))
}

log_warning() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Error handler
handle_error() {
  log_error "Test failed at line $1"
  log_error "Command: $BASH_COMMAND"
  cleanup
  exit 1
}

trap 'handle_error $LINENO' ERR

# Cleanup function
cleanup() {
  log_info "Cleaning up test data..."
  if [ ! -z "$CLIENT_ID" ] && [ ! -z "$TOKEN" ]; then
    curl -s -X DELETE "$SERVER/api/clients/$CLIENT_ID" \
      -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1 || true
  fi
}

# HTTP request helper with retry
make_request() {
  local method=$1
  local endpoint=$2
  local auth_header=$3
  local data=$4
  local max_retries=3
  local retry_count=0

  while [ $retry_count -lt $max_retries ]; do
    if [ -z "$data" ]; then
      response=$(curl -s -w "\n%{http_code}" -X "$method" "$SERVER$endpoint" \
        -H "Content-Type: application/json" \
        ${auth_header:+-H "Authorization: Bearer $auth_header"})
    else
      response=$(curl -s -w "\n%{http_code}" -X "$method" "$SERVER$endpoint" \
        -H "Content-Type: application/json" \
        ${auth_header:+-H "Authorization: Bearer $auth_header"} \
        -d "$data")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
      echo "$body"
      return 0
    fi

    ((retry_count++))
    if [ $retry_count -lt $max_retries ]; then
      log_warning "Request failed (HTTP $http_code), retrying... ($retry_count/$max_retries)"
      sleep 1
    fi
  done

  log_error "Request failed after $max_retries attempts (HTTP $http_code)"
  echo "$body"
  return 1
}

# Test banner
echo
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║        HAsync Pairing System Integration Test v1.3.25        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo
log_info "Server: $SERVER"
log_info "Test started at: $(date '+%Y-%m-%d %H:%M:%S')"
echo

# Test 1: Server Health Check
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 1: Server Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if curl -s -f "$SERVER/health" > /dev/null 2>&1; then
  log_success "Server is healthy and responding"
else
  log_error "Server is not responding at $SERVER"
  exit 1
fi
echo

# Test 2: Admin Authentication
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 2: Admin Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LOGIN_RESPONSE=$(make_request POST "/api/auth/login" "" \
  "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  log_error "Admin login failed - no token received"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

log_success "Admin authenticated successfully"
log_info "Token: ${TOKEN:0:20}..."
echo

# Test 3: Generate Pairing PIN
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 3: Generate Pairing PIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PIN_RESPONSE=$(make_request POST "/api/pairing/create" "$TOKEN")

SESSION_ID=$(echo "$PIN_RESPONSE" | jq -r '.id // empty')
PIN=$(echo "$PIN_RESPONSE" | jq -r '.pin // empty')
EXPIRES_AT=$(echo "$PIN_RESPONSE" | jq -r '.expiresAt // empty')

if [ -z "$SESSION_ID" ] || [ -z "$PIN" ]; then
  log_error "PIN generation failed"
  echo "Response: $PIN_RESPONSE"
  exit 1
fi

log_success "Pairing PIN generated successfully"
log_info "Session ID: $SESSION_ID"
log_info "PIN: $PIN"
log_info "Expires at: $EXPIRES_AT"
echo

# Test 4: Invalid PIN Verification
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 4: Invalid PIN Verification (Security Test)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

INVALID_VERIFY=$(curl -s -w "\n%{http_code}" -X POST "$SERVER/api/pairing/$SESSION_ID/verify" \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"000000\",\"deviceName\":\"$DEVICE_NAME\",\"deviceType\":\"$DEVICE_TYPE\"}")

INVALID_HTTP_CODE=$(echo "$INVALID_VERIFY" | tail -n1)
if [ "$INVALID_HTTP_CODE" -eq 401 ] || [ "$INVALID_HTTP_CODE" -eq 403 ]; then
  log_success "Invalid PIN correctly rejected (HTTP $INVALID_HTTP_CODE)"
else
  log_error "Invalid PIN was not rejected (HTTP $INVALID_HTTP_CODE)"
fi
echo

# Test 5: Valid PIN Verification
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 5: Valid PIN Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

VERIFY_RESPONSE=$(make_request POST "/api/pairing/$SESSION_ID/verify" "" \
  "{\"pin\":\"$PIN\",\"deviceName\":\"$DEVICE_NAME\",\"deviceType\":\"$DEVICE_TYPE\"}")

if echo "$VERIFY_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
  log_success "PIN verified successfully"
  log_info "Device: $DEVICE_NAME ($DEVICE_TYPE)"
else
  log_error "PIN verification failed"
  echo "Response: $VERIFY_RESPONSE"
  exit 1
fi
echo

# Test 6: Complete Pairing
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 6: Complete Pairing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

COMPLETE_RESPONSE=$(make_request POST "/api/pairing/$SESSION_ID/complete" "$TOKEN" \
  "{\"clientName\":\"$CLIENT_NAME\",\"assignedAreas\":[]}")

CLIENT_ID=$(echo "$COMPLETE_RESPONSE" | jq -r '.clientId // empty')
CLIENT_TOKEN=$(echo "$COMPLETE_RESPONSE" | jq -r '.clientToken // empty')

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_TOKEN" ]; then
  log_error "Pairing completion failed"
  echo "Response: $COMPLETE_RESPONSE"
  exit 1
fi

log_success "Pairing completed successfully"
log_info "Client ID: $CLIENT_ID"
log_info "Client Token: ${CLIENT_TOKEN:0:20}..."
echo

# Test 7: Client Self-Access
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 7: Client Self-Access"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CLIENT_DATA=$(make_request GET "/api/clients/me" "$CLIENT_TOKEN")

RETURNED_ID=$(echo "$CLIENT_DATA" | jq -r '.id // empty')
if [ "$RETURNED_ID" = "$CLIENT_ID" ]; then
  log_success "Client can access own data"
  log_info "Name: $(echo "$CLIENT_DATA" | jq -r '.name')"
  log_info "Device: $(echo "$CLIENT_DATA" | jq -r '.deviceInfo.name')"
else
  log_error "Client self-access failed or returned wrong ID"
  echo "Response: $CLIENT_DATA"
fi
echo

# Test 8: Admin Client List
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 8: Admin Client List Access"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CLIENTS_LIST=$(make_request GET "/api/clients" "$TOKEN")

if echo "$CLIENTS_LIST" | jq -e ".[] | select(.id == \"$CLIENT_ID\")" > /dev/null 2>&1; then
  log_success "Admin can view clients list"
  CLIENT_COUNT=$(echo "$CLIENTS_LIST" | jq 'length')
  log_info "Total clients: $CLIENT_COUNT"
else
  log_error "New client not found in admin list"
  echo "Response: $CLIENTS_LIST"
fi
echo

# Test 9: Unauthorized Access Prevention
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 9: Unauthorized Access Prevention"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

UNAUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$SERVER/api/clients" \
  -H "Content-Type: application/json")

UNAUTH_HTTP_CODE=$(echo "$UNAUTH_RESPONSE" | tail -n1)
if [ "$UNAUTH_HTTP_CODE" -eq 401 ]; then
  log_success "Unauthorized access correctly rejected (HTTP $UNAUTH_HTTP_CODE)"
else
  log_error "Unauthorized access was not properly rejected (HTTP $UNAUTH_HTTP_CODE)"
fi
echo

# Test 10: Token Revocation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 10: Token Revocation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REVOKE_RESPONSE=$(make_request POST "/api/clients/$CLIENT_ID/revoke" "$TOKEN")

if echo "$REVOKE_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
  log_success "Client token revoked successfully"
else
  log_error "Token revocation failed"
  echo "Response: $REVOKE_RESPONSE"
fi
echo

# Test 11: Verify Revoked Token Cannot Access
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 11: Verify Revoked Token Cannot Access"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REVOKED_ACCESS=$(curl -s -w "\n%{http_code}" -X GET "$SERVER/api/clients/me" \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json")

REVOKED_HTTP_CODE=$(echo "$REVOKED_ACCESS" | tail -n1)
if [ "$REVOKED_HTTP_CODE" -eq 401 ] || [ "$REVOKED_HTTP_CODE" -eq 403 ]; then
  log_success "Revoked client correctly rejected (HTTP $REVOKED_HTTP_CODE)"
else
  log_error "Revoked client still has access! (HTTP $REVOKED_HTTP_CODE)"
fi
echo

# Test 12: Session Expiration (Optional - requires waiting)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Test 12: Session Lifecycle"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create new session for expiration test
NEW_PIN_RESPONSE=$(make_request POST "/api/pairing/create" "$TOKEN")
NEW_SESSION_ID=$(echo "$NEW_PIN_RESPONSE" | jq -r '.id // empty')

if [ ! -z "$NEW_SESSION_ID" ]; then
  log_success "Created new pairing session for lifecycle test"
  log_info "Session ID: $NEW_SESSION_ID"

  # Check session status
  SESSION_STATUS=$(make_request GET "/api/pairing/$NEW_SESSION_ID/status" "$TOKEN")
  STATUS=$(echo "$SESSION_STATUS" | jq -r '.status // empty')

  if [ "$STATUS" = "pending" ]; then
    log_success "Session status correctly shows 'pending'"
  else
    log_error "Session status incorrect: $STATUS"
  fi
else
  log_error "Could not create new session for lifecycle test"
fi
echo

# Final Summary
TEST_END_TIME=$(date +%s)
TEST_DURATION=$((TEST_END_TIME - TEST_START_TIME))

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                        Test Summary                           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo
echo "Total Tests Passed: $TESTS_PASSED"
echo "Total Tests Failed: $TESTS_FAILED"
echo "Duration: ${TEST_DURATION}s"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}           ALL INTEGRATION TESTS PASSED ✓                      ${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  exit 0
else
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}           SOME TESTS FAILED ✗                                 ${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  exit 1
fi
