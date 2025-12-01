"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputSanitizer = void 0;
exports.setDatabasePermissions = setDatabasePermissions;
exports.configureDatabaseSecurity = configureDatabaseSecurity;
exports.createDatabaseBackup = createDatabaseBackup;
exports.restoreDatabaseBackup = restoreDatabaseBackup;
exports.cleanOldBackups = cleanOldBackups;
exports.queryWithTimeout = queryWithTimeout;
exports.executeTransaction = executeTransaction;
const fs_1 = require("fs");
const path_1 = require("path");
function setDatabasePermissions(dbPath) {
    try {
        const dbDir = (0, path_1.dirname)(dbPath);
        if (!(0, fs_1.existsSync)(dbDir)) {
            (0, fs_1.mkdirSync)(dbDir, { recursive: true, mode: 0o700 });
            console.log(`✓ Created secure data directory: ${dbDir} (mode: 700)`);
        }
        (0, fs_1.chmodSync)(dbDir, 0o700);
        console.log(`✓ Set directory permissions: ${dbDir} → 700 (drwx------)`);
        if ((0, fs_1.existsSync)(dbPath)) {
            (0, fs_1.chmodSync)(dbPath, 0o600);
            console.log(`✓ Set database permissions: ${dbPath} → 600 (-rw-------)`);
        }
    }
    catch (error) {
        console.error('✗ Failed to set database permissions:', error.message);
        throw error;
    }
}
function configureDatabaseSecurity(db) {
    try {
        db.pragma('journal_mode = WAL');
        console.log('✓ Enabled WAL journal mode');
        db.pragma('busy_timeout = 5000');
        console.log('✓ Set busy timeout: 5000ms');
        db.pragma('foreign_keys = ON');
        console.log('✓ Enabled foreign key constraints');
        db.pragma('synchronous = FULL');
        db.pragma('cache_size = -64000');
        db.pragma('temp_store = MEMORY');
        console.log('✓ Database security configuration applied');
    }
    catch (error) {
        console.error('✗ Failed to configure database security:', error.message);
        throw error;
    }
}
class InputSanitizer {
    static validateEntityId(entityId) {
        const entityIdPattern = /^[a-z_]+\.[a-z0-9_]+$/;
        return typeof entityId === 'string' && entityIdPattern.test(entityId);
    }
    static validateAreaId(areaId) {
        const areaIdPattern = /^area_\d+$/;
        return typeof areaId === 'string' && areaIdPattern.test(areaId);
    }
    static validateAreaName(name) {
        if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
            return false;
        }
        const namePattern = /^[a-zA-Z0-9\s\-_'.()]+$/;
        return namePattern.test(name);
    }
    static validateBoolean(value) {
        return typeof value === 'boolean';
    }
    static validateEntityIdArray(entityIds) {
        if (!Array.isArray(entityIds)) {
            return false;
        }
        return entityIds.every((id) => this.validateEntityId(id));
    }
    static sanitizeString(input, maxLength = 255) {
        if (typeof input !== 'string') {
            throw new Error('Input must be a string');
        }
        return input.replace(/[\x00-\x1F\x7F]/g, '').substring(0, maxLength).trim();
    }
}
exports.InputSanitizer = InputSanitizer;
function createDatabaseBackup(db, backupDir) {
    try {
        if (!(0, fs_1.existsSync)(backupDir)) {
            (0, fs_1.mkdirSync)(backupDir, { recursive: true, mode: 0o700 });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = (0, path_1.join)(backupDir, `app01_${timestamp}.db`);
        db.backup(backupPath);
        if ((0, fs_1.existsSync)(backupPath)) {
            (0, fs_1.chmodSync)(backupPath, 0o600);
            console.log(`✓ Database backup created: ${backupPath}`);
        }
        else {
            console.warn(`⚠ Backup file not created: ${backupPath}`);
        }
        return backupPath;
    }
    catch (error) {
        console.error('✗ Failed to create database backup:', error.message);
        return '';
    }
}
function restoreDatabaseBackup(backupPath, targetPath) {
    try {
        if (!(0, fs_1.existsSync)(backupPath)) {
            throw new Error(`Backup file not found: ${backupPath}`);
        }
        if ((0, fs_1.existsSync)(targetPath)) {
            const currentBackup = `${targetPath}.pre-restore`;
            (0, fs_1.copyFileSync)(targetPath, currentBackup);
            try {
                (0, fs_1.chmodSync)(currentBackup, 0o600);
            }
            catch (err) {
                console.warn('Warning: Could not set permissions on pre-restore backup');
            }
            console.log(`✓ Created pre-restore backup: ${currentBackup}`);
        }
        (0, fs_1.copyFileSync)(backupPath, targetPath);
        try {
            (0, fs_1.chmodSync)(targetPath, 0o600);
        }
        catch (err) {
            console.warn('Warning: Could not set permissions on restored database');
        }
        console.log(`✓ Database restored from: ${backupPath}`);
    }
    catch (error) {
        console.error('✗ Failed to restore database backup:', error.message);
        throw error;
    }
}
function cleanOldBackups(backupDir, keepCount = 10) {
    try {
        const { readdirSync, statSync, unlinkSync } = require('fs');
        const files = readdirSync(backupDir)
            .filter((f) => f.startsWith('app01_') && f.endsWith('.db'))
            .map((f) => ({
            name: f,
            path: (0, path_1.join)(backupDir, f),
            time: statSync((0, path_1.join)(backupDir, f)).mtime.getTime()
        }))
            .sort((a, b) => b.time - a.time);
        const toDelete = files.slice(keepCount);
        for (const file of toDelete) {
            unlinkSync(file.path);
            console.log(`✓ Deleted old backup: ${file.name}`);
        }
        if (toDelete.length > 0) {
            console.log(`✓ Cleaned ${toDelete.length} old backup(s), kept ${Math.min(files.length, keepCount)}`);
        }
    }
    catch (error) {
        console.error('✗ Failed to clean old backups:', error.message);
    }
}
function queryWithTimeout(db, query, params = [], timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Query timeout after ${timeout}ms`));
        }, timeout);
        try {
            const result = db.prepare(query).all(...params);
            clearTimeout(timer);
            resolve(result);
        }
        catch (error) {
            clearTimeout(timer);
            reject(error);
        }
    });
}
function executeTransaction(db, operations, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Transaction timeout after ${timeout}ms`));
        }, timeout);
        try {
            const transaction = db.transaction(operations);
            transaction(db);
            clearTimeout(timer);
            resolve();
        }
        catch (error) {
            clearTimeout(timer);
            reject(error);
        }
    });
}
//# sourceMappingURL=database-security.js.map