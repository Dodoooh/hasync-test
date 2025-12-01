-- Migration: XXX_descriptive_name
-- Description: Brief description of what this migration does
-- Created: YYYY-MM-DD
-- Author: Your Name
-- Dependencies: List any migrations this depends on (optional)

-- Write your SQL migration here
-- Each migration should be:
--   1. Idempotent (safe to run multiple times)
--   2. Forward-only (no rollback - create new migration to undo)
--   3. Atomic (group related changes together)

-- Example: Add a new table
CREATE TABLE IF NOT EXISTS example_table (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Example: Add a new column (use ALTER TABLE)
-- Note: SQLite has limitations with ALTER TABLE
-- ALTER TABLE existing_table ADD COLUMN new_column TEXT;

-- Example: Add an index
CREATE INDEX IF NOT EXISTS idx_example_name ON example_table(name);

-- Example: Add a trigger
CREATE TRIGGER IF NOT EXISTS update_example_timestamp
AFTER UPDATE ON example_table
BEGIN
    UPDATE example_table SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
