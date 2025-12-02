-- ============================================================================
-- Migration: Add HA token column to clients table
-- Version: 006
-- Date: 2024-12-02
-- Author: System
-- ============================================================================

-- Description:
-- Adds ha_token column to clients table to store Home Assistant long-lived
-- access tokens per client. This enables each client to have their own
-- HA token instead of sharing a single backend token.

-- Changes:
-- 1. Add ha_token TEXT column (nullable)
-- 2. Add ha_token_set_at INTEGER column for tracking

-- ============================================================================
-- UP Migration
-- ============================================================================

-- Add ha_token column for storing client-specific HA tokens
ALTER TABLE clients ADD COLUMN ha_token TEXT;

-- Add timestamp for when HA token was set
ALTER TABLE clients ADD COLUMN ha_token_set_at INTEGER;

-- ============================================================================
-- DOWN Migration (for rollback)
-- ============================================================================

-- To rollback:
-- ALTER TABLE clients DROP COLUMN ha_token;
-- ALTER TABLE clients DROP COLUMN ha_token_set_at;
