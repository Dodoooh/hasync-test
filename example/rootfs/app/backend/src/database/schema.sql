-- APP01 SQLite Database Schema

-- Clients table - stores paired client information
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    public_key TEXT NOT NULL UNIQUE,
    certificate TEXT NOT NULL,
    paired_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Pairing sessions table - temporary PIN-based pairing
CREATE TABLE IF NOT EXISTS pairing_sessions (
    id TEXT PRIMARY KEY,
    pin TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
);

-- Activity log table - audit trail for security
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- Entity cache table - cache HA entities for performance
CREATE TABLE IF NOT EXISTS entity_cache (
    entity_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    attributes TEXT NOT NULL,
    last_changed TEXT NOT NULL,
    last_updated TEXT NOT NULL,
    cached_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Configuration table - key-value store for settings
CREATE TABLE IF NOT EXISTS configuration (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Areas table - stores area information with entity ordering
CREATE TABLE IF NOT EXISTS areas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    entity_ids TEXT DEFAULT '[]',
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);
CREATE INDEX IF NOT EXISTS idx_clients_last_seen ON clients(last_seen);
CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_client ON activity_log(client_id);
CREATE INDEX IF NOT EXISTS idx_entity_cache_updated ON entity_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_areas_name ON areas(name);
CREATE INDEX IF NOT EXISTS idx_areas_enabled ON areas(is_enabled);

-- Triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_clients_timestamp
AFTER UPDATE ON clients
BEGIN
    UPDATE clients SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_config_timestamp
AFTER UPDATE ON configuration
BEGIN
    UPDATE configuration SET updated_at = strftime('%s', 'now') WHERE key = NEW.key;
END;

CREATE TRIGGER IF NOT EXISTS update_areas_timestamp
AFTER UPDATE ON areas
BEGIN
    UPDATE areas SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

-- User consent table - GDPR compliance for tracking user consent
CREATE TABLE IF NOT EXISTS user_consent (
    user_id TEXT PRIMARY KEY,
    data_processing INTEGER DEFAULT 0,
    analytics INTEGER DEFAULT 0,
    marketing INTEGER DEFAULT 0,
    consent_date INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    ip_address TEXT
);

-- Users table - for authentication (if not already exists)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'user',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Dashboards table - for user dashboards
CREATE TABLE IF NOT EXISTS dashboards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config TEXT DEFAULT '{}',
    created_by TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for user consent
CREATE INDEX IF NOT EXISTS idx_consent_user ON user_consent(user_id);

-- Trigger for user_consent updated_at
CREATE TRIGGER IF NOT EXISTS update_consent_timestamp
AFTER UPDATE ON user_consent
BEGIN
    UPDATE user_consent SET updated_at = strftime('%s', 'now') WHERE user_id = NEW.user_id;
END;
