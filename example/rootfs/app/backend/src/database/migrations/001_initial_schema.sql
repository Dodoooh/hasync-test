-- Migration: 001_initial_schema
-- Description: Initial database schema with core tables
-- Created: 2025-11-30
-- Author: System

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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);
CREATE INDEX IF NOT EXISTS idx_clients_last_seen ON clients(last_seen);
CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_client ON activity_log(client_id);
CREATE INDEX IF NOT EXISTS idx_entity_cache_updated ON entity_cache(cached_at);

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
