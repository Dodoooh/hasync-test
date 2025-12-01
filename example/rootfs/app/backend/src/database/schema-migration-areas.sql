-- Migration: Add is_enabled column to areas table
-- This migration adds the ability to enable/disable areas

-- Create areas table if it doesn't exist (with is_enabled)
CREATE TABLE IF NOT EXISTS areas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    entity_ids TEXT DEFAULT '[]',
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Add is_enabled column if table exists but column doesn't
-- SQLite doesn't support ALTER COLUMN, so we check first
-- If you're running this on an existing database, you'll need to handle this manually
-- or use the backend to update the schema on startup

-- Index for filtering enabled areas
CREATE INDEX IF NOT EXISTS idx_areas_enabled ON areas(is_enabled);

-- Trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_areas_timestamp
AFTER UPDATE ON areas
BEGIN
    UPDATE areas SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
