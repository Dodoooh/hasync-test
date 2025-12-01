-- Migration: Add device info and client tracking to pairing_sessions
-- Run this after initial schema to support full pairing flow

-- Add new columns for device information and pairing status
ALTER TABLE pairing_sessions ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE pairing_sessions ADD COLUMN device_name TEXT;
ALTER TABLE pairing_sessions ADD COLUMN device_type TEXT;
ALTER TABLE pairing_sessions ADD COLUMN client_id TEXT;
ALTER TABLE pairing_sessions ADD COLUMN client_token_hash TEXT;

-- Add foreign key manually through a new table (SQLite doesn't support ADD CONSTRAINT)
-- This is optional but recommended for data integrity
CREATE INDEX IF NOT EXISTS idx_pairing_status ON pairing_sessions(status);
CREATE INDEX IF NOT EXISTS idx_pairing_client ON pairing_sessions(client_id);

-- Add assigned_areas column to clients table for area-based access control
ALTER TABLE clients ADD COLUMN assigned_areas TEXT DEFAULT '[]';
