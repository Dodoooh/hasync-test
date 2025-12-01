"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationRunner = void 0;
exports.runMigrationCLI = runMigrationCLI;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = require("fs");
const path_1 = require("path");
class MigrationRunner {
    db;
    migrationsPath;
    constructor(db, migrationsPath) {
        this.db = db;
        this.migrationsPath = migrationsPath || (0, path_1.join)(__dirname, 'migrations');
        this.initializeMigrationTracking();
    }
    initializeMigrationTracking() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        filename TEXT NOT NULL,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        checksum TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_migrations_applied ON schema_migrations(applied_at);
    `);
    }
    getAvailableMigrations() {
        try {
            const files = (0, fs_1.readdirSync)(this.migrationsPath)
                .filter(f => f.endsWith('.sql') && !f.startsWith('TEMPLATE'))
                .sort();
            return files.map(filename => {
                const match = filename.match(/^(\d+)_(.+)\.sql$/);
                if (!match) {
                    throw new Error(`Invalid migration filename format: ${filename}`);
                }
                const version = parseInt(match[1], 10);
                const name = match[2].replace(/_/g, ' ');
                return {
                    version,
                    name,
                    filename
                };
            });
        }
        catch (error) {
            console.error('Error reading migrations directory:', error);
            return [];
        }
    }
    getAppliedMigrations() {
        const stmt = this.db.prepare('SELECT * FROM schema_migrations ORDER BY version');
        const rows = stmt.all();
        return rows.map(row => ({
            version: row.version,
            name: row.name,
            filename: row.filename,
            appliedAt: row.applied_at
        }));
    }
    getPendingMigrations() {
        const available = this.getAvailableMigrations();
        const applied = this.getAppliedMigrations();
        const appliedVersions = new Set(applied.map(m => m.version));
        return available.filter(m => !appliedVersions.has(m.version));
    }
    calculateChecksum(content) {
        return content.length.toString(36) + content.slice(0, 100).length.toString(36);
    }
    applyMigration(migration) {
        const filePath = (0, path_1.join)(this.migrationsPath, migration.filename);
        const sql = (0, fs_1.readFileSync)(filePath, 'utf-8');
        const checksum = this.calculateChecksum(sql);
        const applyTransaction = this.db.transaction(() => {
            this.db.exec(sql);
            const stmt = this.db.prepare(`
        INSERT INTO schema_migrations (version, name, filename, checksum)
        VALUES (?, ?, ?, ?)
      `);
            stmt.run(migration.version, migration.name, migration.filename, checksum);
        });
        applyTransaction();
    }
    migrate() {
        const result = {
            success: true,
            appliedMigrations: [],
            errors: []
        };
        const pending = this.getPendingMigrations();
        if (pending.length === 0) {
            console.log('No pending migrations to apply');
            return result;
        }
        console.log(`Found ${pending.length} pending migration(s)`);
        for (const migration of pending) {
            try {
                console.log(`Applying migration ${migration.version}: ${migration.name}...`);
                this.applyMigration(migration);
                result.appliedMigrations.push(migration);
                console.log(`✓ Migration ${migration.version} applied successfully`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`✗ Failed to apply migration ${migration.version}:`, errorMessage);
                result.errors.push({
                    migration: migration.filename,
                    error: errorMessage
                });
                result.success = false;
                break;
            }
        }
        return result;
    }
    getCurrentVersion() {
        const stmt = this.db.prepare('SELECT MAX(version) as version FROM schema_migrations');
        const row = stmt.get();
        return row?.version || 0;
    }
    getStatus() {
        const applied = this.getAppliedMigrations();
        const pending = this.getPendingMigrations();
        return {
            currentVersion: this.getCurrentVersion(),
            appliedCount: applied.length,
            pendingCount: pending.length,
            applied,
            pending
        };
    }
    verify() {
        const issues = [];
        const applied = this.getAppliedMigrations();
        for (const migration of applied) {
            const filePath = (0, path_1.join)(this.migrationsPath, migration.filename);
            try {
                const sql = (0, fs_1.readFileSync)(filePath, 'utf-8');
                const currentChecksum = this.calculateChecksum(sql);
                const stmt = this.db.prepare('SELECT checksum FROM schema_migrations WHERE version = ?');
                const row = stmt.get(migration.version);
                if (row?.checksum && row.checksum !== currentChecksum) {
                    issues.push(`Migration ${migration.version} (${migration.filename}) has been modified after being applied`);
                }
            }
            catch (error) {
                issues.push(`Migration ${migration.version} (${migration.filename}) file not found or unreadable`);
            }
        }
        return {
            valid: issues.length === 0,
            issues
        };
    }
    static createMigrationFile(name, migrationsPath) {
        const path = migrationsPath || (0, path_1.join)(__dirname, 'migrations');
        const files = (0, fs_1.readdirSync)(path)
            .filter(f => f.endsWith('.sql') && !f.startsWith('TEMPLATE'));
        const versions = files
            .map(f => parseInt(f.match(/^(\d+)_/)?.[1] || '0', 10))
            .filter(v => !isNaN(v));
        const nextVersion = versions.length > 0 ? Math.max(...versions) + 1 : 1;
        const versionStr = nextVersion.toString().padStart(3, '0');
        const filename = `${versionStr}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
        const filePath = (0, path_1.join)(path, filename);
        const templatePath = (0, path_1.join)(path, 'TEMPLATE.sql');
        let content = (0, fs_1.readFileSync)(templatePath, 'utf-8');
        const now = new Date().toISOString().split('T')[0];
        content = content
            .replace('XXX_descriptive_name', `${versionStr}_${name.toLowerCase().replace(/\s+/g, '_')}`)
            .replace('Brief description of what this migration does', `Add ${name}`)
            .replace('YYYY-MM-DD', now);
        require('fs').writeFileSync(filePath, content);
        return { filename, path: filePath };
    }
}
exports.MigrationRunner = MigrationRunner;
function runMigrationCLI(dbPath) {
    const db = new better_sqlite3_1.default(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const runner = new MigrationRunner(db);
    const command = process.argv[2];
    switch (command) {
        case 'status':
            const status = runner.getStatus();
            console.log('\n=== Migration Status ===');
            console.log(`Current version: ${status.currentVersion}`);
            console.log(`Applied migrations: ${status.appliedCount}`);
            console.log(`Pending migrations: ${status.pendingCount}`);
            if (status.applied.length > 0) {
                console.log('\nApplied:');
                status.applied.forEach(m => {
                    const date = new Date(m.appliedAt * 1000).toISOString();
                    console.log(`  ${m.version}. ${m.name} (${date})`);
                });
            }
            if (status.pending.length > 0) {
                console.log('\nPending:');
                status.pending.forEach(m => {
                    console.log(`  ${m.version}. ${m.name}`);
                });
            }
            break;
        case 'migrate':
            console.log('Running migrations...\n');
            const result = runner.migrate();
            if (result.success) {
                console.log(`\n✓ All migrations applied successfully (${result.appliedMigrations.length} total)`);
            }
            else {
                console.log('\n✗ Migration failed');
                result.errors.forEach(err => {
                    console.log(`  ${err.migration}: ${err.error}`);
                });
                process.exit(1);
            }
            break;
        case 'verify':
            const verification = runner.verify();
            if (verification.valid) {
                console.log('✓ All migrations verified successfully');
            }
            else {
                console.log('✗ Migration verification failed:');
                verification.issues.forEach(issue => console.log(`  - ${issue}`));
                process.exit(1);
            }
            break;
        case 'create':
            const migrationName = process.argv[3];
            if (!migrationName) {
                console.error('Please provide a migration name');
                console.error('Usage: npm run migrate create <migration_name>');
                process.exit(1);
            }
            const { filename, path } = MigrationRunner.createMigrationFile(migrationName);
            console.log(`✓ Created migration: ${filename}`);
            console.log(`  Path: ${path}`);
            break;
        default:
            console.log('Database Migration System');
            console.log('\nUsage:');
            console.log('  npm run migrate status  - Show migration status');
            console.log('  npm run migrate migrate - Run pending migrations');
            console.log('  npm run migrate verify  - Verify migration integrity');
            console.log('  npm run migrate create <name> - Create new migration');
    }
    db.close();
}
//# sourceMappingURL=migration-runner.js.map