/**
 * Admin Routes
 * Administrative endpoints for system management
 */

import { Router } from 'express';
import * as Database from 'better-sqlite3';
import { authenticateAdmin, adminLimiter } from '../middleware/admin-auth';
import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  cleanOldBackups,
  setDatabasePermissions
} from '../utils/database-security';
import { join } from 'path';

export function createAdminRouter(db: Database.Database): Router {
  const router = Router();

  // Apply admin authentication and rate limiting to all routes
  router.use(authenticateAdmin);
  router.use(adminLimiter);

  /**
   * Create database backup
   * POST /api/admin/backup
   */
  router.post('/backup', (req, res) => {
    try {
      const backupDir = process.env.BACKUP_DIR || join(__dirname, '../../../backups');
      const backupPath = createDatabaseBackup(db, backupDir);

      // Clean old backups (keep last 10)
      cleanOldBackups(backupDir, 10);

      res.json({
        success: true,
        backup: backupPath,
        timestamp: new Date().toISOString(),
        message: 'Database backup created successfully'
      });
    } catch (error: any) {
      console.error('Backup error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create backup',
        message: error?.message || 'Unknown error'
      });
    }
  });

  /**
   * List available backups
   * GET /api/admin/backups
   */
  router.get('/backups', (req, res) => {
    try {
      const fs = require('fs');
      const backupDir = process.env.BACKUP_DIR || join(__dirname, '../../../backups');

      if (!fs.existsSync(backupDir)) {
        return res.json({ backups: [] });
      }

      const files = fs.readdirSync(backupDir)
        .filter((f: string) => f.startsWith('app01_') && f.endsWith('.db'))
        .map((f: string) => {
          const stats = fs.statSync(join(backupDir, f));
          return {
            name: f,
            path: join(backupDir, f),
            size: stats.size,
            created: stats.mtime.toISOString()
          };
        })
        .sort((a: any, b: any) => new Date(b.created).getTime() - new Date(a.created).getTime());

      res.json({ backups: files });
    } catch (error: any) {
      console.error('List backups error:', error);
      res.status(500).json({
        error: 'Failed to list backups',
        message: error?.message || 'Unknown error'
      });
    }
  });

  /**
   * Restore database from backup
   * POST /api/admin/restore
   * Body: { backupPath: string }
   */
  router.post('/restore', (req, res) => {
    try {
      const { backupPath } = req.body;

      if (!backupPath) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'backupPath is required'
        });
      }

      const dbPath = process.env.DATABASE_PATH || '/data/app01.db';

      // Close current database connection
      db.close();

      // Restore from backup
      restoreDatabaseBackup(backupPath, dbPath);

      res.json({
        success: true,
        message: 'Database restored successfully. Server restart required.',
        restored: backupPath
      });

      // Exit process to force restart (in production, use proper restart mechanism)
      setTimeout(() => process.exit(0), 1000);
    } catch (error: any) {
      console.error('Restore error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to restore backup',
        message: error?.message || 'Unknown error'
      });
    }
  });

  /**
   * Fix database permissions
   * POST /api/admin/fix-permissions
   */
  router.post('/fix-permissions', (req, res) => {
    try {
      const dbPath = process.env.DATABASE_PATH || '/data/app01.db';
      setDatabasePermissions(dbPath);

      res.json({
        success: true,
        message: 'Database permissions updated successfully',
        permissions: {
          directory: '700 (drwx------)',
          database: '600 (-rw-------)'
        }
      });
    } catch (error: any) {
      console.error('Fix permissions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fix permissions',
        message: error?.message || 'Unknown error'
      });
    }
  });

  /**
   * Get database statistics
   * GET /api/admin/stats
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = {
        tables: {} as Record<string, number>,
        databaseSize: 0,
        walSize: 0,
        pageSize: 0,
        pageCount: 0
      };

      // Get table counts
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      for (const table of tables) {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as any;
        stats.tables[table.name] = count.count;
      }

      // Get database size info
      const pageInfo = db.pragma('page_size') as any;
      const pageCount = db.pragma('page_count') as any;
      stats.pageSize = pageInfo;
      stats.pageCount = pageCount;
      stats.databaseSize = pageInfo * pageCount;

      res.json({
        success: true,
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
        message: error?.message || 'Unknown error'
      });
    }
  });

  /**
   * Vacuum database (optimize and reclaim space)
   * POST /api/admin/vacuum
   */
  router.post('/vacuum', (req, res) => {
    try {
      // Create backup before vacuum
      const backupDir = process.env.BACKUP_DIR || join(__dirname, '../../../backups');
      const backupPath = createDatabaseBackup(db, backupDir);

      // Perform vacuum
      db.exec('VACUUM');

      res.json({
        success: true,
        message: 'Database optimized successfully',
        backup: backupPath
      });
    } catch (error: any) {
      console.error('Vacuum error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to optimize database',
        message: error?.message || 'Unknown error'
      });
    }
  });

  return router;
}
