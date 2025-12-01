"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminRouter = createAdminRouter;
const express_1 = require("express");
const admin_auth_1 = require("../middleware/admin-auth");
const database_security_1 = require("../utils/database-security");
const path_1 = require("path");
function createAdminRouter(db) {
    const router = (0, express_1.Router)();
    router.use(admin_auth_1.authenticateAdmin);
    router.use(admin_auth_1.adminLimiter);
    router.post('/backup', (req, res) => {
        try {
            const backupDir = process.env.BACKUP_DIR || (0, path_1.join)(__dirname, '../../../backups');
            const backupPath = (0, database_security_1.createDatabaseBackup)(db, backupDir);
            (0, database_security_1.cleanOldBackups)(backupDir, 10);
            res.json({
                success: true,
                backup: backupPath,
                timestamp: new Date().toISOString(),
                message: 'Database backup created successfully'
            });
        }
        catch (error) {
            console.error('Backup error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create backup',
                message: error?.message || 'Unknown error'
            });
        }
    });
    router.get('/backups', (req, res) => {
        try {
            const fs = require('fs');
            const backupDir = process.env.BACKUP_DIR || (0, path_1.join)(__dirname, '../../../backups');
            if (!fs.existsSync(backupDir)) {
                return res.json({ backups: [] });
            }
            const files = fs.readdirSync(backupDir)
                .filter((f) => f.startsWith('app01_') && f.endsWith('.db'))
                .map((f) => {
                const stats = fs.statSync((0, path_1.join)(backupDir, f));
                return {
                    name: f,
                    path: (0, path_1.join)(backupDir, f),
                    size: stats.size,
                    created: stats.mtime.toISOString()
                };
            })
                .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
            res.json({ backups: files });
        }
        catch (error) {
            console.error('List backups error:', error);
            res.status(500).json({
                error: 'Failed to list backups',
                message: error?.message || 'Unknown error'
            });
        }
    });
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
            db.close();
            (0, database_security_1.restoreDatabaseBackup)(backupPath, dbPath);
            res.json({
                success: true,
                message: 'Database restored successfully. Server restart required.',
                restored: backupPath
            });
            setTimeout(() => process.exit(0), 1000);
        }
        catch (error) {
            console.error('Restore error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to restore backup',
                message: error?.message || 'Unknown error'
            });
        }
    });
    router.post('/fix-permissions', (req, res) => {
        try {
            const dbPath = process.env.DATABASE_PATH || '/data/app01.db';
            (0, database_security_1.setDatabasePermissions)(dbPath);
            res.json({
                success: true,
                message: 'Database permissions updated successfully',
                permissions: {
                    directory: '700 (drwx------)',
                    database: '600 (-rw-------)'
                }
            });
        }
        catch (error) {
            console.error('Fix permissions error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fix permissions',
                message: error?.message || 'Unknown error'
            });
        }
    });
    router.get('/stats', (req, res) => {
        try {
            const stats = {
                tables: {},
                databaseSize: 0,
                walSize: 0,
                pageSize: 0,
                pageCount: 0
            };
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            for (const table of tables) {
                const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                stats.tables[table.name] = count.count;
            }
            const pageInfo = db.pragma('page_size');
            const pageCount = db.pragma('page_count');
            stats.pageSize = pageInfo;
            stats.pageCount = pageCount;
            stats.databaseSize = pageInfo * pageCount;
            res.json({
                success: true,
                stats,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('Stats error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get statistics',
                message: error?.message || 'Unknown error'
            });
        }
    });
    router.post('/vacuum', (req, res) => {
        try {
            const backupDir = process.env.BACKUP_DIR || (0, path_1.join)(__dirname, '../../../backups');
            const backupPath = (0, database_security_1.createDatabaseBackup)(db, backupDir);
            db.exec('VACUUM');
            res.json({
                success: true,
                message: 'Database optimized successfully',
                backup: backupPath
            });
        }
        catch (error) {
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
//# sourceMappingURL=admin.js.map