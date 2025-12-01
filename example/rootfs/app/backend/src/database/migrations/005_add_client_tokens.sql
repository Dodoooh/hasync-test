-- Migration: Add client_tokens table for long-lived client authentication
-- This supports area-based access control for paired devices

-- Client tokens table - stores hashed tokens for client authentication
CREATE TABLE IF NOT EXISTS client_tokens (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    assigned_areas TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER NOT NULL,
    last_used INTEGER,
    is_revoked INTEGER NOT NULL DEFAULT 0,
    revoked_at INTEGER,
    revoked_reason TEXT,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_client_tokens_client ON client_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tokens_hash ON client_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_client_tokens_revoked ON client_tokens(is_revoked);
CREATE INDEX IF NOT EXISTS idx_client_tokens_expires ON client_tokens(expires_at);

-- Trigger for last_used timestamp
CREATE TRIGGER IF NOT EXISTS update_token_last_used
AFTER UPDATE ON client_tokens
WHEN NEW.last_used != OLD.last_used
BEGIN
    UPDATE client_tokens SET last_used = strftime('%s', 'now') WHERE id = NEW.id;
END;
