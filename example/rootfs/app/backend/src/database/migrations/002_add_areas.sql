-- Migration: 002_add_areas
-- Description: Add areas table for entity organization
-- Created: 2025-11-30
-- Author: System

-- Areas table - stores area information with entity ordering
CREATE TABLE IF NOT EXISTS areas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    entity_ids TEXT DEFAULT '[]',
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes for areas
CREATE INDEX IF NOT EXISTS idx_areas_name ON areas(name);
CREATE INDEX IF NOT EXISTS idx_areas_enabled ON areas(is_enabled);

-- Trigger for areas updated_at
CREATE TRIGGER IF NOT EXISTS update_areas_timestamp
AFTER UPDATE ON areas
BEGIN
    UPDATE areas SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
