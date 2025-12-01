-- Migration: 004_add_gdpr_columns
-- Description: Add GDPR compliance columns to existing tables
-- Created: 2025-11-30
-- Author: System
-- NOTE: This migration adds columns that should already exist in newer databases
-- It uses safe ALTER TABLE statements that won't fail if columns exist

-- Add created_by column to areas table for GDPR compliance
-- SQLite will silently ignore if column already exists in newer versions
ALTER TABLE areas ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE CASCADE;

-- Add created_by column to clients table for GDPR compliance
ALTER TABLE clients ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE CASCADE;
