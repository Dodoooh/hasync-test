-- Migration: 003_add_auth_tables
-- Description: Add user authentication and authorization tables
-- Created: 2025-11-30
-- Author: System

-- Users table - for authentication
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

-- User consent table - GDPR compliance
CREATE TABLE IF NOT EXISTS user_consent (
    user_id TEXT PRIMARY KEY,
    data_processing INTEGER DEFAULT 0,
    analytics INTEGER DEFAULT 0,
    marketing INTEGER DEFAULT 0,
    consent_date INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    ip_address TEXT
);

-- Refresh tokens table for token management
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_consent_user ON user_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Trigger for user_consent updated_at
CREATE TRIGGER IF NOT EXISTS update_consent_timestamp
AFTER UPDATE ON user_consent
BEGIN
    UPDATE user_consent SET updated_at = strftime('%s', 'now') WHERE user_id = NEW.user_id;
END;

-- Trigger for users updated_at
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

-- Trigger for dashboards updated_at
CREATE TRIGGER IF NOT EXISTS update_dashboards_timestamp
AFTER UPDATE ON dashboards
BEGIN
    UPDATE dashboards SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
