"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const migration_runner_1 = require("./migration-runner");
class DatabaseService {
    db;
    migrationRunner;
    constructor(dbPath, runMigrations = true) {
        this.db = new better_sqlite3_1.default(dbPath, { verbose: console.log });
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.migrationRunner = new migration_runner_1.MigrationRunner(this.db);
        if (runMigrations) {
            this.runMigrations();
        }
    }
    runMigrations() {
        console.log('Checking for database migrations...');
        const result = this.migrationRunner.migrate();
        if (!result.success) {
            console.error('Database migration failed!');
            result.errors.forEach(err => {
                console.error(`  ${err.migration}: ${err.error}`);
            });
            throw new Error('Database migration failed');
        }
        if (result.appliedMigrations.length > 0) {
            console.log(`Applied ${result.appliedMigrations.length} migration(s)`);
        }
        else {
            console.log('Database is up to date');
        }
    }
    getMigrationStatus() {
        return this.migrationRunner.getStatus();
    }
    getSchemaVersion() {
        return this.migrationRunner.getCurrentVersion();
    }
    createClient(client) {
        const id = this.generateId();
        const stmt = this.db.prepare(`
      INSERT INTO clients (id, name, device_type, public_key, certificate, paired_at, last_seen, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(id, client.name, client.device_type, client.public_key, client.certificate, client.paired_at, client.last_seen, JSON.stringify(client.metadata || {}));
        return { ...client, id, is_active: true };
    }
    getClient(id) {
        const stmt = this.db.prepare('SELECT * FROM clients WHERE id = ?');
        const row = stmt.get(id);
        return row ? this.mapClient(row) : null;
    }
    getClientByPublicKey(publicKey) {
        const stmt = this.db.prepare('SELECT * FROM clients WHERE public_key = ?');
        const row = stmt.get(publicKey);
        return row ? this.mapClient(row) : null;
    }
    getAllClients(activeOnly = false) {
        const query = activeOnly
            ? 'SELECT * FROM clients WHERE is_active = 1 ORDER BY last_seen DESC'
            : 'SELECT * FROM clients ORDER BY last_seen DESC';
        const stmt = this.db.prepare(query);
        const rows = stmt.all();
        return rows.map(this.mapClient);
    }
    updateClient(id, updates) {
        const fields = [];
        const values = [];
        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.last_seen !== undefined) {
            fields.push('last_seen = ?');
            values.push(updates.last_seen);
        }
        if (updates.is_active !== undefined) {
            fields.push('is_active = ?');
            values.push(updates.is_active ? 1 : 0);
        }
        if (updates.metadata !== undefined) {
            fields.push('metadata = ?');
            values.push(JSON.stringify(updates.metadata));
        }
        if (fields.length === 0)
            return false;
        values.push(id);
        const stmt = this.db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`);
        const result = stmt.run(...values);
        return result.changes > 0;
    }
    deleteClient(id) {
        const stmt = this.db.prepare('DELETE FROM clients WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
    createPairingSession(pin, expiresAt) {
        const id = this.generateId();
        const now = Date.now();
        const stmt = this.db.prepare(`
      INSERT INTO pairing_sessions (id, pin, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(id, pin, expiresAt, now);
        return { id, pin, expires_at: expiresAt, created_at: now };
    }
    getPairingSession(pin) {
        const stmt = this.db.prepare('SELECT * FROM pairing_sessions WHERE pin = ? AND used = 0');
        const row = stmt.get(pin);
        return row ? {
            id: row.id,
            pin: row.pin,
            expires_at: row.expires_at,
            created_at: row.created_at
        } : null;
    }
    markPairingSessionUsed(pin) {
        const stmt = this.db.prepare('UPDATE pairing_sessions SET used = 1 WHERE pin = ?');
        const result = stmt.run(pin);
        return result.changes > 0;
    }
    cleanExpiredPairingSessions() {
        const now = Date.now();
        const stmt = this.db.prepare('DELETE FROM pairing_sessions WHERE expires_at < ? OR used = 1');
        const result = stmt.run(now);
        return result.changes;
    }
    logActivity(clientId, action, details, ipAddress) {
        const stmt = this.db.prepare(`
      INSERT INTO activity_log (client_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(clientId, action, details || null, ipAddress || null);
    }
    cacheEntity(entityId, state) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO entity_cache (entity_id, state, attributes, last_changed, last_updated)
      VALUES (?, ?, ?, ?, ?)
    `);
        stmt.run(entityId, state.state, JSON.stringify(state.attributes), state.last_changed, state.last_updated);
    }
    getCachedEntity(entityId) {
        const stmt = this.db.prepare('SELECT * FROM entity_cache WHERE entity_id = ?');
        const row = stmt.get(entityId);
        if (!row)
            return null;
        return {
            entity_id: row.entity_id,
            state: row.state,
            attributes: JSON.parse(row.attributes),
            last_changed: row.last_changed,
            last_updated: row.last_updated
        };
    }
    getConfig(key) {
        const stmt = this.db.prepare('SELECT value FROM configuration WHERE key = ?');
        const row = stmt.get(key);
        return row ? row.value : null;
    }
    setConfig(key, value) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO configuration (key, value)
      VALUES (?, ?)
    `);
        stmt.run(key, value);
    }
    mapClient(row) {
        return {
            id: row.id,
            name: row.name,
            device_type: row.device_type,
            public_key: row.public_key,
            certificate: row.certificate,
            paired_at: row.paired_at,
            last_seen: row.last_seen,
            is_active: row.is_active === 1,
            metadata: JSON.parse(row.metadata || '{}')
        };
    }
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    close() {
        this.db.close();
    }
    healthCheck() {
        try {
            this.db.prepare('SELECT 1').get();
            return true;
        }
        catch {
            return false;
        }
    }
    getDatabase() {
        return this.db;
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=index-with-migrations.js.map