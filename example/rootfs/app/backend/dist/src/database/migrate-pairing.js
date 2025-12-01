"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migratePairingTables = migratePairingTables;
exports.cleanupExpiredPairingSessions = cleanupExpiredPairingSessions;
exports.startPairingCleanupJob = startPairingCleanupJob;
exports.verifyPairingSession = verifyPairingSession;
exports.completePairingSession = completePairingSession;
exports.expirePairingSession = expirePairingSession;
exports.getPairingSession = getPairingSession;
exports.createPairingSession = createPairingSession;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('PairingMigration');
function migratePairingTables(db) {
    try {
        logger.info('Starting pairing tables migration...');
        db.exec(`
      CREATE TABLE IF NOT EXISTS pairing_sessions (
        id TEXT PRIMARY KEY,
        pin TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'verified', 'completed', 'expired')),
        device_name TEXT,
        device_type TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        verified_at INTEGER
      );
    `);
        logger.info('✓ Created pairing_sessions table');
        db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        device_name TEXT,
        device_type TEXT,
        assigned_areas TEXT DEFAULT '[]',
        token_hash TEXT,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER,
        created_by TEXT
      );
    `);
        logger.info('✓ Created/verified clients table');
        try {
            db.exec(`ALTER TABLE clients ADD COLUMN device_name TEXT;`);
            logger.info('✓ Added device_name column to clients');
        }
        catch (error) {
            if (error.message && error.message.includes('duplicate column')) {
                logger.info('→ device_name column already exists');
            }
            else {
                throw error;
            }
        }
        try {
            db.exec(`ALTER TABLE clients ADD COLUMN device_type TEXT;`);
            logger.info('✓ Added device_type column to clients');
        }
        catch (error) {
            if (error.message && error.message.includes('duplicate column')) {
                logger.info('→ device_type column already exists');
            }
            else {
                throw error;
            }
        }
        try {
            db.exec(`ALTER TABLE clients ADD COLUMN assigned_areas TEXT DEFAULT '[]';`);
            logger.info('✓ Added assigned_areas column to clients');
        }
        catch (error) {
            if (error.message && error.message.includes('duplicate column')) {
                logger.info('→ assigned_areas column already exists');
            }
            else {
                throw error;
            }
        }
        try {
            db.exec(`ALTER TABLE clients ADD COLUMN token_hash TEXT;`);
            logger.info('✓ Added token_hash column to clients');
        }
        catch (error) {
            if (error.message && error.message.includes('duplicate column')) {
                logger.info('→ token_hash column already exists');
            }
            else {
                throw error;
            }
        }
        try {
            db.exec(`ALTER TABLE clients ADD COLUMN created_by TEXT;`);
            logger.info('✓ Added created_by column to clients');
        }
        catch (error) {
            if (error.message && error.message.includes('duplicate column')) {
                logger.info('→ created_by column already exists');
            }
            else {
                throw error;
            }
        }
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pairing_pin ON pairing_sessions(pin);
      CREATE INDEX IF NOT EXISTS idx_pairing_status ON pairing_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);
      CREATE INDEX IF NOT EXISTS idx_clients_token ON clients(token_hash);
    `);
        logger.info('✓ Created database indexes');
        logger.info('✓ Pairing tables migration completed successfully');
    }
    catch (error) {
        logger.error('✗ Pairing migration failed:', error.message);
        throw error;
    }
}
function cleanupExpiredPairingSessions(db) {
    try {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare(`
      DELETE FROM pairing_sessions
      WHERE status = 'pending'
      AND expires_at < ?
    `);
        const result = stmt.run(now);
        const deletedCount = result.changes;
        if (deletedCount > 0) {
            logger.info(`✓ Cleaned up ${deletedCount} expired pairing session(s)`);
        }
        return deletedCount;
    }
    catch (error) {
        logger.error('✗ Cleanup failed:', error.message);
        return 0;
    }
}
function startPairingCleanupJob(db) {
    const CLEANUP_INTERVAL = 5 * 60 * 1000;
    logger.info('Starting pairing cleanup job (runs every 5 minutes)');
    cleanupExpiredPairingSessions(db);
    const intervalId = setInterval(() => {
        cleanupExpiredPairingSessions(db);
    }, CLEANUP_INTERVAL);
    return intervalId;
}
function verifyPairingSession(db, pin, deviceName, deviceType) {
    try {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare(`
      SELECT id, expires_at
      FROM pairing_sessions
      WHERE pin = ?
      AND status = 'pending'
      AND expires_at > ?
      LIMIT 1
    `);
        const session = stmt.get(pin, now);
        if (!session) {
            logger.warn(`Invalid or expired pairing PIN: ${pin}`);
            return null;
        }
        const updateStmt = db.prepare(`
      UPDATE pairing_sessions
      SET status = 'verified',
          verified_at = ?,
          device_name = ?,
          device_type = ?
      WHERE id = ?
    `);
        updateStmt.run(now, deviceName || null, deviceType || null, session.id);
        logger.info(`✓ Pairing session verified: ${session.id}`);
        return session.id;
    }
    catch (error) {
        logger.error('✗ Verify pairing failed:', error.message);
        return null;
    }
}
function completePairingSession(db, sessionId) {
    try {
        const stmt = db.prepare(`
      UPDATE pairing_sessions
      SET status = 'completed'
      WHERE id = ?
      AND status = 'verified'
    `);
        const result = stmt.run(sessionId);
        if (result.changes > 0) {
            logger.info(`✓ Pairing session completed: ${sessionId}`);
            return true;
        }
        logger.warn(`Failed to complete pairing session: ${sessionId} (not found or not verified)`);
        return false;
    }
    catch (error) {
        logger.error('✗ Complete pairing failed:', error.message);
        return false;
    }
}
function expirePairingSession(db, sessionId) {
    try {
        const stmt = db.prepare(`
      UPDATE pairing_sessions
      SET status = 'expired'
      WHERE id = ?
    `);
        const result = stmt.run(sessionId);
        if (result.changes > 0) {
            logger.info(`✓ Pairing session expired: ${sessionId}`);
            return true;
        }
        return false;
    }
    catch (error) {
        logger.error('✗ Expire pairing failed:', error.message);
        return false;
    }
}
function getPairingSession(db, sessionId) {
    try {
        const stmt = db.prepare(`
      SELECT * FROM pairing_sessions WHERE id = ?
    `);
        return stmt.get(sessionId) || null;
    }
    catch (error) {
        logger.error('✗ Get pairing session failed:', error.message);
        return null;
    }
}
function createPairingSession(db, adminUsername) {
    try {
        const { randomBytes } = require('crypto');
        const pinNumber = randomBytes(3).readUIntBE(0, 3) % 900000 + 100000;
        const pin = pinNumber.toString();
        const sessionId = `pairing_${Date.now()}_${randomBytes(4).toString('hex')}`;
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + (5 * 60);
        const stmt = db.prepare(`
      INSERT INTO pairing_sessions (id, pin, status, created_at, expires_at)
      VALUES (?, ?, 'pending', ?, ?)
    `);
        stmt.run(sessionId, pin, now, expiresAt);
        logger.info(`✓ Pairing session created by ${adminUsername}: ${sessionId} (PIN: ${pin})`);
        return {
            id: sessionId,
            pin,
            expiresAt,
            status: 'pending'
        };
    }
    catch (error) {
        logger.error('✗ Create pairing session failed:', error.message);
        throw error;
    }
}
//# sourceMappingURL=migrate-pairing.js.map