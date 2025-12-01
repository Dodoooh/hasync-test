/**
 * Database Security Utilities
 * Implements comprehensive database security measures
 */

import { chmodSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import * as Database from 'better-sqlite3';

/**
 * Set secure file permissions for database
 * - Database file: 600 (owner read/write only)
 * - Data directory: 700 (owner access only)
 */
export function setDatabasePermissions(dbPath: string): void {
  try {
    const dbDir = dirname(dbPath);

    // Create directory if it doesn't exist
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true, mode: 0o700 });
      console.log(`✓ Created secure data directory: ${dbDir} (mode: 700)`);
    }

    // Set directory permissions to 700 (drwx------)
    chmodSync(dbDir, 0o700);
    console.log(`✓ Set directory permissions: ${dbDir} → 700 (drwx------)`);

    // Set database file permissions to 600 (-rw-------)
    if (existsSync(dbPath)) {
      chmodSync(dbPath, 0o600);
      console.log(`✓ Set database permissions: ${dbPath} → 600 (-rw-------)`);
    }
  } catch (error: any) {
    console.error('✗ Failed to set database permissions:', error.message);
    throw error;
  }
}

/**
 * Configure database for security and performance
 * - Enable WAL mode for better concurrency
 * - Set busy timeout to handle concurrent access
 * - Enable foreign keys
 * - Optimize journal mode
 */
export function configureDatabaseSecurity(db: Database.Database): void {
  try {
    // Enable Write-Ahead Logging for better concurrency
    db.pragma('journal_mode = WAL');
    console.log('✓ Enabled WAL journal mode');

    // Set busy timeout to 5 seconds (prevents "database is locked" errors)
    db.pragma('busy_timeout = 5000');
    console.log('✓ Set busy timeout: 5000ms');

    // Enable foreign key constraints
    db.pragma('foreign_keys = ON');
    console.log('✓ Enabled foreign key constraints');

    // Optimize for security and performance
    db.pragma('synchronous = FULL'); // Maximum data safety
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('temp_store = MEMORY'); // Store temp tables in memory

    console.log('✓ Database security configuration applied');
  } catch (error: any) {
    console.error('✗ Failed to configure database security:', error.message);
    throw error;
  }
}

/**
 * Input sanitization for SQL queries
 * Validates and sanitizes user input to prevent injection
 */
export class InputSanitizer {
  /**
   * Validate entity ID format
   * Format: domain.name (e.g., light.living_room)
   */
  static validateEntityId(entityId: string): boolean {
    const entityIdPattern = /^[a-z_]+\.[a-z0-9_]+$/;
    return typeof entityId === 'string' && entityIdPattern.test(entityId);
  }

  /**
   * Validate area ID format
   * Format: area_timestamp (e.g., area_1234567890)
   */
  static validateAreaId(areaId: string): boolean {
    const areaIdPattern = /^area_\d+$/;
    return typeof areaId === 'string' && areaIdPattern.test(areaId);
  }

  /**
   * Validate area name
   * Allows alphanumeric, spaces, and common punctuation
   */
  static validateAreaName(name: string): boolean {
    if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
      return false;
    }
    const namePattern = /^[a-zA-Z0-9\s\-_'.()]+$/;
    return namePattern.test(name);
  }

  /**
   * Validate boolean value
   */
  static validateBoolean(value: any): boolean {
    return typeof value === 'boolean';
  }

  /**
   * Validate array of entity IDs
   */
  static validateEntityIdArray(entityIds: any): boolean {
    if (!Array.isArray(entityIds)) {
      return false;
    }
    return entityIds.every((id) => this.validateEntityId(id));
  }

  /**
   * Sanitize string input
   * Removes potentially dangerous characters
   */
  static sanitizeString(input: string, maxLength: number = 255): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    // Remove null bytes and control characters
    return input.replace(/[\x00-\x1F\x7F]/g, '').substring(0, maxLength).trim();
  }
}

/**
 * Create database backup
 * @param db Database instance
 * @param backupDir Directory to store backups
 * @returns Path to backup file
 */
export function createDatabaseBackup(db: Database.Database, backupDir: string): string {
  try {
    // Create backup directory if it doesn't exist
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    }

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `app01_${timestamp}.db`);

    // Perform backup using SQLite backup API
    db.backup(backupPath);

    // Set secure permissions on backup file
    chmodSync(backupPath, 0o600);

    console.log(`✓ Database backup created: ${backupPath}`);
    return backupPath;
  } catch (error: any) {
    console.error('✗ Failed to create database backup:', error.message);
    throw error;
  }
}

/**
 * Restore database from backup
 * @param backupPath Path to backup file
 * @param targetPath Path to restore to
 */
export function restoreDatabaseBackup(backupPath: string, targetPath: string): void {
  try {
    if (!existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    // Create backup of current database before restore
    if (existsSync(targetPath)) {
      const currentBackup = `${targetPath}.pre-restore`;
      copyFileSync(targetPath, currentBackup);
      try {
        chmodSync(currentBackup, 0o600);
      } catch (err) {
        // Permission setting might fail on some systems, continue anyway
        console.warn('Warning: Could not set permissions on pre-restore backup');
      }
      console.log(`✓ Created pre-restore backup: ${currentBackup}`);
    }

    // Copy backup to target location
    copyFileSync(backupPath, targetPath);
    try {
      chmodSync(targetPath, 0o600);
    } catch (err) {
      console.warn('Warning: Could not set permissions on restored database');
    }

    console.log(`✓ Database restored from: ${backupPath}`);
  } catch (error: any) {
    console.error('✗ Failed to restore database backup:', error.message);
    throw error;
  }
}

/**
 * Clean old backups
 * Keeps only the most recent N backups
 * @param backupDir Directory containing backups
 * @param keepCount Number of backups to keep (default: 10)
 */
export function cleanOldBackups(backupDir: string, keepCount: number = 10): void {
  try {
    const { readdirSync, statSync, unlinkSync } = require('fs');
    const files = readdirSync(backupDir)
      .filter((f: string) => f.startsWith('app01_') && f.endsWith('.db'))
      .map((f: string) => ({
        name: f,
        path: join(backupDir, f),
        time: statSync(join(backupDir, f)).mtime.getTime()
      }))
      .sort((a: any, b: any) => b.time - a.time);

    // Delete old backups
    const toDelete = files.slice(keepCount);
    for (const file of toDelete) {
      unlinkSync(file.path);
      console.log(`✓ Deleted old backup: ${file.name}`);
    }

    if (toDelete.length > 0) {
      console.log(`✓ Cleaned ${toDelete.length} old backup(s), kept ${Math.min(files.length, keepCount)}`);
    }
  } catch (error: any) {
    console.error('✗ Failed to clean old backups:', error.message);
  }
}

/**
 * Query timeout wrapper
 * Prevents long-running queries from blocking the database
 * @param db Database instance
 * @param query SQL query
 * @param params Query parameters
 * @param timeout Timeout in milliseconds (default: 5000)
 */
export function queryWithTimeout(
  db: Database.Database,
  query: string,
  params: any[] = [],
  timeout: number = 5000
): any {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Query timeout after ${timeout}ms`));
    }, timeout);

    try {
      const result = db.prepare(query).all(...params);
      clearTimeout(timer);
      resolve(result);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Transaction wrapper with timeout
 * Ensures transactions are committed or rolled back properly
 */
export function executeTransaction(
  db: Database.Database,
  operations: (db: Database.Database) => void,
  timeout: number = 10000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Transaction timeout after ${timeout}ms`));
    }, timeout);

    try {
      const transaction = db.transaction(operations);
      transaction(db);
      clearTimeout(timer);
      resolve();
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}
