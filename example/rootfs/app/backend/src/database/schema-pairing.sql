-- ============================================================================
-- PAIRING SYSTEM DATABASE SCHEMA
-- ============================================================================
-- This schema supports a PIN-based pairing system where:
-- 1. Server generates a 6-digit PIN and creates a pairing session
-- 2. Client verifies the PIN within 5 minutes
-- 3. Client receives a long-lived token (10 years) upon successful pairing
-- 4. Tokens are stored as SHA-256 hashes for security
-- ============================================================================

-- ============================================================================
-- TABLE: pairing_sessions
-- ============================================================================
-- Purpose: Temporary storage for PIN-based pairing sessions
-- Lifecycle: 5-minute expiry, auto-cleanup on access
-- Security: PINs are temporary and single-use
-- ============================================================================

CREATE TABLE IF NOT EXISTS pairing_sessions (
    -- Primary identifier with prefix for type safety
    id TEXT PRIMARY KEY NOT NULL,
    -- Example: 'pairing_abc123def456'

    -- 6-digit PIN code for user verification
    pin TEXT NOT NULL,
    -- Example: '123456'
    -- Note: Should be unique during active sessions

    -- Session status tracking
    status TEXT NOT NULL DEFAULT 'pending',
    -- Values: 'pending' → 'verified' → 'completed' | 'expired'
    -- pending: PIN generated, waiting for client verification
    -- verified: Client verified PIN, token generated
    -- completed: Client successfully paired and token stored
    -- expired: Session exceeded 5-minute window

    -- Device information (populated after PIN verification)
    device_name TEXT,
    -- Example: 'iPhone 15 Pro'

    device_type TEXT,
    -- Example: 'mobile', 'desktop', 'tablet'

    device_os TEXT,
    -- Example: 'iOS 17.2', 'Windows 11', 'Android 14'

    device_id TEXT,
    -- Example: 'device_abc123' (client-generated unique identifier)

    -- Area assignments (JSON array, set by server)
    assigned_areas TEXT,
    -- Example: '["bedroom", "living_room"]'
    -- Stored as JSON array of area names

    -- Generated token (stored temporarily until client confirms receipt)
    token_hash TEXT,
    -- SHA-256 hash of the generated token
    -- Only stored temporarily during 'verified' status
    -- Moved to clients table upon completion

    -- Timestamps (Unix epoch in milliseconds)
    created_at INTEGER NOT NULL,
    -- When the pairing session was initiated

    expires_at INTEGER NOT NULL,
    -- When the session will expire (created_at + 5 minutes)

    verified_at INTEGER,
    -- When the client verified the PIN (null until verified)

    completed_at INTEGER,
    -- When the pairing was fully completed (null until completed)

    -- Constraints
    CHECK (status IN ('pending', 'verified', 'completed', 'expired')),
    CHECK (expires_at > created_at),
    CHECK (created_at > 0),
    CHECK (LENGTH(pin) = 6)
);

-- ============================================================================
-- TABLE: clients
-- ============================================================================
-- Purpose: Permanent storage for paired clients
-- Lifecycle: 10-year token validity, long-term storage
-- Security: Only token hashes stored, never plaintext tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS clients (
    -- Primary identifier with prefix for type safety
    id TEXT PRIMARY KEY NOT NULL,
    -- Example: 'client_xyz789abc012'
    -- Generated when client completes pairing

    -- Token security (SHA-256 hash only)
    token_hash TEXT UNIQUE NOT NULL,
    -- SHA-256 hash of the authentication token
    -- NEVER store plaintext tokens
    -- Used for authentication on subsequent requests

    -- Device information
    device_name TEXT NOT NULL,
    -- Example: 'iPhone 15 Pro'

    device_type TEXT NOT NULL,
    -- Example: 'mobile', 'desktop', 'tablet'

    device_os TEXT NOT NULL,
    -- Example: 'iOS 17.2', 'Windows 11', 'Android 14'

    device_id TEXT UNIQUE NOT NULL,
    -- Example: 'device_abc123'
    -- Client-generated unique identifier
    -- Used to prevent duplicate pairings

    -- Area assignments (JSON array)
    assigned_areas TEXT NOT NULL,
    -- Example: '["bedroom", "living_room", "kitchen"]'
    -- JSON array of area names this client can control
    -- Can be updated by admin

    -- Client metadata
    client_name TEXT,
    -- Optional friendly name set by user
    -- Example: "John's iPhone", "Living Room Tablet"

    last_seen INTEGER,
    -- Last time client made an authenticated request
    -- Unix epoch in milliseconds
    -- Used for monitoring inactive clients

    -- Status tracking
    is_active BOOLEAN NOT NULL DEFAULT 1,
    -- Whether the client is currently active
    -- Can be set to 0 to revoke access without deleting

    -- Timestamps (Unix epoch in milliseconds)
    created_at INTEGER NOT NULL,
    -- When the client was first paired

    updated_at INTEGER NOT NULL,
    -- Last time client record was modified

    token_expires_at INTEGER NOT NULL,
    -- When the token expires (created_at + 10 years)
    -- Used for automatic cleanup of expired tokens

    -- Constraints
    CHECK (created_at > 0),
    CHECK (updated_at >= created_at),
    CHECK (token_expires_at > created_at),
    CHECK (is_active IN (0, 1)),
    CHECK (device_type IN ('mobile', 'desktop', 'tablet', 'other'))
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for PIN lookup (most common query during pairing)
CREATE INDEX IF NOT EXISTS idx_pairing_sessions_pin
ON pairing_sessions(pin);

-- Index for status-based queries (finding active sessions)
CREATE INDEX IF NOT EXISTS idx_pairing_sessions_status
ON pairing_sessions(status);

-- Index for expiry cleanup (finding expired sessions)
CREATE INDEX IF NOT EXISTS idx_pairing_sessions_expires_at
ON pairing_sessions(expires_at);

-- Index for device_id lookup (preventing duplicate pairings in sessions)
CREATE INDEX IF NOT EXISTS idx_pairing_sessions_device_id
ON pairing_sessions(device_id);

-- Index for token authentication (most common query)
CREATE INDEX IF NOT EXISTS idx_clients_token_hash
ON clients(token_hash);

-- Index for device_id lookup (preventing duplicate pairings)
CREATE INDEX IF NOT EXISTS idx_clients_device_id
ON clients(device_id);

-- Index for active clients queries
CREATE INDEX IF NOT EXISTS idx_clients_is_active
ON clients(is_active);

-- Index for token expiry cleanup
CREATE INDEX IF NOT EXISTS idx_clients_token_expires_at
ON clients(token_expires_at);

-- Index for monitoring queries (last seen)
CREATE INDEX IF NOT EXISTS idx_clients_last_seen
ON clients(last_seen);

-- ============================================================================
-- EXAMPLE PREPARED STATEMENTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PAIRING SESSIONS
-- ----------------------------------------------------------------------------

-- 1. CREATE NEW PAIRING SESSION
-- Usage: When server generates a new PIN for pairing
/*
const stmt = db.prepare(`
    INSERT INTO pairing_sessions (
        id, pin, status, created_at, expires_at
    ) VALUES (?, ?, 'pending', ?, ?)
`);
stmt.run(sessionId, pin, now, expiresAt);
*/

-- 2. VERIFY PIN AND UPDATE SESSION
-- Usage: When client submits PIN and device info
/*
const stmt = db.prepare(`
    UPDATE pairing_sessions
    SET status = 'verified',
        device_name = ?,
        device_type = ?,
        device_os = ?,
        device_id = ?,
        assigned_areas = ?,
        token_hash = ?,
        verified_at = ?
    WHERE pin = ?
        AND status = 'pending'
        AND expires_at > ?
`);
stmt.run(deviceName, deviceType, deviceOs, deviceId, areasJson, tokenHash, now, pin, now);
*/

-- 3. COMPLETE PAIRING SESSION
-- Usage: After client confirms receipt of token
/*
const stmt = db.prepare(`
    UPDATE pairing_sessions
    SET status = 'completed',
        completed_at = ?
    WHERE id = ? AND status = 'verified'
`);
stmt.run(now, sessionId);
*/

-- 4. GET PAIRING SESSION BY PIN
-- Usage: When client verifies PIN
/*
const stmt = db.prepare(`
    SELECT * FROM pairing_sessions
    WHERE pin = ?
        AND status = 'pending'
        AND expires_at > ?
`);
const session = stmt.get(pin, now);
*/

-- 5. DELETE EXPIRED SESSIONS
-- Usage: Periodic cleanup of old sessions
/*
const stmt = db.prepare(`
    DELETE FROM pairing_sessions
    WHERE expires_at < ? OR status = 'completed'
`);
stmt.run(now);
*/

-- 6. MARK EXPIRED SESSIONS
-- Usage: Alternative to deletion - mark as expired for audit
/*
const stmt = db.prepare(`
    UPDATE pairing_sessions
    SET status = 'expired'
    WHERE expires_at < ? AND status = 'pending'
`);
stmt.run(now);
*/

-- ----------------------------------------------------------------------------
-- CLIENTS
-- ----------------------------------------------------------------------------

-- 7. CREATE NEW CLIENT (AFTER SUCCESSFUL PAIRING)
-- Usage: Move verified pairing to permanent client record
/*
const stmt = db.prepare(`
    INSERT INTO clients (
        id, token_hash, device_name, device_type, device_os,
        device_id, assigned_areas, created_at, updated_at,
        token_expires_at, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);
stmt.run(
    clientId, tokenHash, deviceName, deviceType, deviceOs,
    deviceId, areasJson, now, now, tokenExpiresAt
);
*/

-- 8. AUTHENTICATE CLIENT BY TOKEN
-- Usage: On every authenticated request
/*
const stmt = db.prepare(`
    SELECT * FROM clients
    WHERE token_hash = ?
        AND is_active = 1
        AND token_expires_at > ?
`);
const client = stmt.get(tokenHash, now);
*/

-- 9. UPDATE LAST SEEN
-- Usage: After successful authentication
/*
const stmt = db.prepare(`
    UPDATE clients
    SET last_seen = ?
    WHERE id = ?
`);
stmt.run(now, clientId);
*/

-- 10. UPDATE ASSIGNED AREAS
-- Usage: When admin changes client permissions
/*
const stmt = db.prepare(`
    UPDATE clients
    SET assigned_areas = ?,
        updated_at = ?
    WHERE id = ?
`);
stmt.run(newAreasJson, now, clientId);
*/

-- 11. DEACTIVATE CLIENT
-- Usage: Revoke access without deleting
/*
const stmt = db.prepare(`
    UPDATE clients
    SET is_active = 0,
        updated_at = ?
    WHERE id = ?
`);
stmt.run(now, clientId);
*/

-- 12. DELETE CLIENT
-- Usage: Permanently remove client
/*
const stmt = db.prepare(`
    DELETE FROM clients WHERE id = ?
`);
stmt.run(clientId);
*/

-- 13. GET ALL ACTIVE CLIENTS
-- Usage: Admin interface listing
/*
const stmt = db.prepare(`
    SELECT id, device_name, device_type, device_os, assigned_areas,
           last_seen, created_at
    FROM clients
    WHERE is_active = 1
    ORDER BY last_seen DESC
`);
const clients = stmt.all();
*/

-- 14. CHECK IF DEVICE ALREADY PAIRED
-- Usage: Prevent duplicate pairings
/*
const stmt = db.prepare(`
    SELECT id FROM clients
    WHERE device_id = ? AND is_active = 1
`);
const existing = stmt.get(deviceId);
*/

-- 15. CLEANUP EXPIRED TOKENS
-- Usage: Periodic maintenance
/*
const stmt = db.prepare(`
    DELETE FROM clients
    WHERE token_expires_at < ?
`);
stmt.run(now);
*/

-- ============================================================================
-- MIGRATION SCRIPT
-- ============================================================================
-- Purpose: Add these tables to an existing database
-- Usage: Run this script to add pairing functionality to existing DB
-- ============================================================================

-- Step 1: Check if tables exist (SQLite doesn't have IF NOT EXISTS for migration)
-- The CREATE TABLE IF NOT EXISTS statements above handle this

-- Step 2: Verify existing database structure
-- Query to check if migration is needed:
/*
SELECT name FROM sqlite_master
WHERE type='table'
    AND name IN ('pairing_sessions', 'clients');
*/

-- Step 3: Execute migration
-- Simply run all CREATE TABLE and CREATE INDEX statements above
-- SQLite's IF NOT EXISTS prevents errors if tables already exist

-- Step 4: Verify migration success
/*
-- Check table structure
PRAGMA table_info(pairing_sessions);
PRAGMA table_info(clients);

-- Check indexes
SELECT name FROM sqlite_master
WHERE type='index'
    AND tbl_name IN ('pairing_sessions', 'clients');
*/

-- ============================================================================
-- SAMPLE DATA FOR TESTING
-- ============================================================================

-- Sample pairing session (pending)
/*
INSERT INTO pairing_sessions (
    id, pin, status, created_at, expires_at
) VALUES (
    'pairing_test001',
    '123456',
    'pending',
    1701388800000,
    1701389100000
);
*/

-- Sample client (completed pairing)
/*
INSERT INTO clients (
    id, token_hash, device_name, device_type, device_os, device_id,
    assigned_areas, created_at, updated_at, token_expires_at, is_active
) VALUES (
    'client_test001',
    'abc123def456...', -- SHA-256 hash
    'Test iPhone',
    'mobile',
    'iOS 17.2',
    'device_test001',
    '["bedroom", "living_room"]',
    1701388800000,
    1701388800000,
    2017148800000, -- 10 years later
    1
);
*/

-- ============================================================================
-- SECURITY NOTES
-- ============================================================================
-- 1. NEVER store plaintext tokens - always use SHA-256 hashes
-- 2. PINs are temporary (5 min) and should be cryptographically random
-- 3. Use prepared statements to prevent SQL injection
-- 4. Regularly cleanup expired sessions and tokens
-- 5. Consider rate limiting PIN verification attempts
-- 6. Log all pairing attempts for security auditing
-- 7. Use HTTPS for all token transmissions
-- 8. Implement token rotation for enhanced security
-- ============================================================================

-- ============================================================================
-- PERFORMANCE NOTES
-- ============================================================================
-- 1. All indexes are optimized for common query patterns
-- 2. Use EXPLAIN QUERY PLAN to verify index usage
-- 3. Consider partitioning if client count exceeds 100,000
-- 4. Monitor query performance and adjust indexes as needed
-- 5. Use transactions for multi-step operations (pairing flow)
-- 6. Implement connection pooling for high-concurrency scenarios
-- ============================================================================

-- ============================================================================
-- MAINTENANCE QUERIES
-- ============================================================================

-- Count active pairing sessions
/*
SELECT COUNT(*) FROM pairing_sessions
WHERE status = 'pending' AND expires_at > ?;
*/

-- Count active clients
/*
SELECT COUNT(*) FROM clients WHERE is_active = 1;
*/

-- Find stale clients (not seen in 30 days)
/*
SELECT * FROM clients
WHERE last_seen < ? -- (now - 30 days)
ORDER BY last_seen ASC;
*/

-- Get pairing session statistics
/*
SELECT
    status,
    COUNT(*) as count,
    AVG(verified_at - created_at) as avg_verification_time_ms
FROM pairing_sessions
GROUP BY status;
*/

-- Get client device type distribution
/*
SELECT
    device_type,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM clients), 2) as percentage
FROM clients
WHERE is_active = 1
GROUP BY device_type;
*/

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
