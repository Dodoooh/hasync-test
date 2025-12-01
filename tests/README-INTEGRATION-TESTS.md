# HAsync Pairing System Integration Tests

## Overview

Comprehensive integration test suite for the HAsync Pairing System v1.3.25, testing the complete pairing flow from PIN generation through token revocation.

## Test Script

**Location:** `/tests/test-pairing-integration.sh`

## Prerequisites

1. **Server Running:** The HAsync server must be running on the configured port (default: 8099)
2. **Dependencies:**
   - `curl` for HTTP requests
   - `jq` for JSON parsing
   - `bash` 4.0 or higher

## Configuration

The test script uses environment variables for configuration:

```bash
# Server configuration
export PAIRING_SERVER="http://localhost:8099"

# Admin credentials
export ADMIN_USER="admin"
export ADMIN_PASS="test123"
```

## Running Tests

### Basic Usage

```bash
cd /Users/domde/Documents/CLAUDE/Addon/githubv4
./tests/test-pairing-integration.sh
```

### With Custom Configuration

```bash
PAIRING_SERVER="http://localhost:8080" \
ADMIN_USER="myuser" \
ADMIN_PASS="mypass" \
./tests/test-pairing-integration.sh
```

### Generate Test Report

```bash
./tests/test-pairing-integration.sh > test-report-$(date +%Y%m%d-%H%M%S).log 2>&1
```

## Test Coverage

The integration test suite covers 12 comprehensive test scenarios:

### 1. Server Health Check
- **Purpose:** Verify server is running and accessible
- **Validates:** HTTP connectivity, server availability

### 2. Admin Authentication
- **Purpose:** Test admin login flow
- **Validates:**
  - Credential validation
  - JWT token generation
  - Token format correctness

### 3. Generate Pairing PIN
- **Purpose:** Create new pairing session
- **Validates:**
  - PIN generation (6-digit format)
  - Session ID creation
  - Expiration timestamp setting

### 4. Invalid PIN Verification (Security Test)
- **Purpose:** Ensure invalid PINs are rejected
- **Validates:**
  - Security against PIN guessing
  - Proper HTTP error codes (401/403)
  - Rate limiting behavior

### 5. Valid PIN Verification
- **Purpose:** Test correct PIN acceptance
- **Validates:**
  - PIN matching logic
  - Device information capture
  - Session state transition (pending → verified)

### 6. Complete Pairing
- **Purpose:** Finalize pairing process
- **Validates:**
  - Client creation
  - Client token generation
  - Assignment data storage

### 7. Client Self-Access
- **Purpose:** Verify client can access own data
- **Validates:**
  - Client token authentication
  - Data access permissions
  - Correct data returned

### 8. Admin Client List Access
- **Purpose:** Test admin viewing all clients
- **Validates:**
  - Admin privileges
  - Client list retrieval
  - New client appears in list

### 9. Unauthorized Access Prevention
- **Purpose:** Security test for protected endpoints
- **Validates:**
  - Endpoints require authentication
  - Proper HTTP 401 responses
  - No data leakage

### 10. Token Revocation
- **Purpose:** Test admin revoking client access
- **Validates:**
  - Revocation endpoint functionality
  - Database token invalidation
  - Revocation response format

### 11. Verify Revoked Token Cannot Access
- **Purpose:** Ensure revoked tokens are rejected
- **Validates:**
  - Token blacklisting/invalidation
  - Immediate access denial
  - Proper error responses

### 12. Session Lifecycle
- **Purpose:** Test session state management
- **Validates:**
  - Session creation
  - Status tracking
  - State transitions

## Expected Output

### Successful Test Run

```
╔═══════════════════════════════════════════════════════════════╗
║        HAsync Pairing System Integration Test v1.3.25        ║
╚═══════════════════════════════════════════════════════════════╝

[INFO] Server: http://localhost:8099
[INFO] Test started at: 2025-12-02 14:30:45

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[INFO] Test 1: Server Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[PASS] Server is healthy and responding

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[INFO] Test 2: Admin Authentication
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[PASS] Admin authenticated successfully
[INFO] Token: eyJhbGciOiJIUzI1NiIs...

[... more tests ...]

╔═══════════════════════════════════════════════════════════════╗
║                        Test Summary                           ║
╚═══════════════════════════════════════════════════════════════╝

Total Tests Passed: 12
Total Tests Failed: 0
Duration: 8s
Timestamp: 2025-12-02 14:30:53

═══════════════════════════════════════════════════════════════
           ALL INTEGRATION TESTS PASSED ✓
═══════════════════════════════════════════════════════════════
```

### Failed Test Example

```
[FAIL] PIN verification failed
Response: {"error":"Invalid PIN"}

╔═══════════════════════════════════════════════════════════════╗
║                        Test Summary                           ║
╚═══════════════════════════════════════════════════════════════╝

Total Tests Passed: 4
Total Tests Failed: 1
Duration: 5s

═══════════════════════════════════════════════════════════════
           SOME TESTS FAILED ✗
═══════════════════════════════════════════════════════════════
```

## Error Handling

The test script includes comprehensive error handling:

1. **Retry Logic:** Automatic retry for transient network failures (up to 3 attempts)
2. **Cleanup:** Automatic cleanup of test data on failure
3. **Error Trapping:** Detailed error reporting with line numbers
4. **HTTP Status Validation:** Checks for proper HTTP status codes
5. **JSON Validation:** Verifies response structure using `jq`

## Exit Codes

- **0:** All tests passed
- **1:** One or more tests failed or error occurred

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Start Server
        run: |
          npm install
          npm start &
          sleep 5

      - name: Run Integration Tests
        run: ./tests/test-pairing-integration.sh
        env:
          PAIRING_SERVER: http://localhost:8099
          ADMIN_USER: admin
          ADMIN_PASS: test123
```

## Troubleshooting

### Common Issues

**Server Not Responding:**
```
[FAIL] Server is not responding at http://localhost:8099
```
- Solution: Ensure server is running on correct port
- Check: `curl http://localhost:8099/health`

**Authentication Failed:**
```
[FAIL] Admin login failed - no token received
```
- Solution: Verify admin credentials in database
- Check: Admin user exists and password is correct

**jq Command Not Found:**
```
bash: jq: command not found
```
- Solution: Install jq
  - macOS: `brew install jq`
  - Ubuntu: `sudo apt-get install jq`
  - CentOS: `sudo yum install jq`

## Test Data Cleanup

The script automatically cleans up test data on completion or failure. Manual cleanup if needed:

```bash
# View test clients
curl -X GET http://localhost:8099/api/clients \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Delete specific client
curl -X DELETE http://localhost:8099/api/clients/CLIENT_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Performance Benchmarks

Expected test execution times:

- **Minimum:** ~5 seconds (fast network, local server)
- **Average:** ~8-10 seconds (typical conditions)
- **Maximum:** ~15 seconds (slow network, retry scenarios)

## Security Considerations

1. **Credentials:** Never commit real credentials to version control
2. **Test Tokens:** Test tokens are automatically revoked
3. **Network Security:** Use HTTPS in production environments
4. **Rate Limiting:** Tests respect rate limiting (includes retry delays)

## Future Enhancements

- [ ] WebSocket connection testing
- [ ] Concurrent pairing session tests
- [ ] Session expiration timing tests
- [ ] Load testing with multiple simultaneous pairings
- [ ] Token refresh flow testing
- [ ] Area assignment validation tests

## Support

For issues or questions:
- Create GitHub issue with test output
- Include server logs from the test timeframe
- Provide environment details (OS, Node version, etc.)
