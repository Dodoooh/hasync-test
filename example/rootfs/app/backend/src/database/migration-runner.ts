/**
 * Database Migration Runner
 *
 * Handles versioned database migrations with tracking and rollback prevention.
 * Migrations are forward-only and idempotent.
 */

import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';

export interface Migration {
  version: number;
  name: string;
  filename: string;
  appliedAt?: number;
}

export interface MigrationResult {
  success: boolean;
  appliedMigrations: Migration[];
  errors: Array<{ migration: string; error: string }>;
}

export class MigrationRunner {
  private db: Database.Database;
  private migrationsPath: string;

  constructor(db: Database.Database, migrationsPath?: string) {
    this.db = db;
    this.migrationsPath = migrationsPath || join(__dirname, 'migrations');
    this.initializeMigrationTracking();
  }

  /**
   * Initialize the migration tracking table
   */
  private initializeMigrationTracking(): void {
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

  /**
   * Get all available migration files
   */
  private getAvailableMigrations(): Migration[] {
    try {
      const files = readdirSync(this.migrationsPath)
        .filter(f => f.endsWith('.sql') && !f.startsWith('TEMPLATE'))
        .sort();

      return files.map(filename => {
        // Extract version from filename (e.g., "001_initial_schema.sql" -> 1)
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
    } catch (error) {
      console.error('Error reading migrations directory:', error);
      return [];
    }
  }

  /**
   * Get applied migrations from database
   */
  private getAppliedMigrations(): Migration[] {
    const stmt = this.db.prepare('SELECT * FROM schema_migrations ORDER BY version');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      version: row.version,
      name: row.name,
      filename: row.filename,
      appliedAt: row.applied_at
    }));
  }

  /**
   * Get pending migrations that haven't been applied
   */
  getPendingMigrations(): Migration[] {
    const available = this.getAvailableMigrations();
    const applied = this.getAppliedMigrations();
    const appliedVersions = new Set(applied.map(m => m.version));

    return available.filter(m => !appliedVersions.has(m.version));
  }

  /**
   * Calculate checksum for migration file
   */
  private calculateChecksum(content: string): string {
    // Simple checksum - in production, use crypto.createHash
    return content.length.toString(36) + content.slice(0, 100).length.toString(36);
  }

  /**
   * Apply a single migration
   */
  private applyMigration(migration: Migration): void {
    const filePath = join(this.migrationsPath, migration.filename);
    const sql = readFileSync(filePath, 'utf-8');
    const checksum = this.calculateChecksum(sql);

    // Execute migration in a transaction
    const applyTransaction = this.db.transaction(() => {
      // Execute the migration SQL
      this.db.exec(sql);

      // Record the migration
      const stmt = this.db.prepare(`
        INSERT INTO schema_migrations (version, name, filename, checksum)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(migration.version, migration.name, migration.filename, checksum);
    });

    applyTransaction();
  }

  /**
   * Run all pending migrations
   */
  migrate(): MigrationResult {
    const result: MigrationResult = {
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

    // Apply each migration in order
    for (const migration of pending) {
      try {
        console.log(`Applying migration ${migration.version}: ${migration.name}...`);
        this.applyMigration(migration);
        result.appliedMigrations.push(migration);
        console.log(`✓ Migration ${migration.version} applied successfully`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to apply migration ${migration.version}:`, errorMessage);
        result.errors.push({
          migration: migration.filename,
          error: errorMessage
        });
        result.success = false;
        // Stop on first error
        break;
      }
    }

    return result;
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): number {
    const stmt = this.db.prepare('SELECT MAX(version) as version FROM schema_migrations');
    const row = stmt.get() as any;
    return row?.version || 0;
  }

  /**
   * Get migration status and history
   */
  getStatus(): {
    currentVersion: number;
    appliedCount: number;
    pendingCount: number;
    applied: Migration[];
    pending: Migration[];
  } {
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

  /**
   * Verify migration integrity (check if applied migrations match files)
   */
  verify(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const applied = this.getAppliedMigrations();

    for (const migration of applied) {
      const filePath = join(this.migrationsPath, migration.filename);

      try {
        const sql = readFileSync(filePath, 'utf-8');
        const currentChecksum = this.calculateChecksum(sql);

        // Get stored checksum
        const stmt = this.db.prepare('SELECT checksum FROM schema_migrations WHERE version = ?');
        const row = stmt.get(migration.version) as any;

        if (row?.checksum && row.checksum !== currentChecksum) {
          issues.push(
            `Migration ${migration.version} (${migration.filename}) has been modified after being applied`
          );
        }
      } catch (error) {
        issues.push(
          `Migration ${migration.version} (${migration.filename}) file not found or unreadable`
        );
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Create a new migration file
   */
  static createMigrationFile(
    name: string,
    migrationsPath?: string
  ): { filename: string; path: string } {
    const path = migrationsPath || join(__dirname, 'migrations');

    // Get next version number
    const files = readdirSync(path)
      .filter(f => f.endsWith('.sql') && !f.startsWith('TEMPLATE'));

    const versions = files
      .map(f => parseInt(f.match(/^(\d+)_/)?.[1] || '0', 10))
      .filter(v => !isNaN(v));

    const nextVersion = versions.length > 0 ? Math.max(...versions) + 1 : 1;
    const versionStr = nextVersion.toString().padStart(3, '0');
    const filename = `${versionStr}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
    const filePath = join(path, filename);

    // Read template
    const templatePath = join(path, 'TEMPLATE.sql');
    let content = readFileSync(templatePath, 'utf-8');

    // Replace placeholders
    const now = new Date().toISOString().split('T')[0];
    content = content
      .replace('XXX_descriptive_name', `${versionStr}_${name.toLowerCase().replace(/\s+/g, '_')}`)
      .replace('Brief description of what this migration does', `Add ${name}`)
      .replace('YYYY-MM-DD', now);

    // Write new migration file
    require('fs').writeFileSync(filePath, content);

    return { filename, path: filePath };
  }
}

/**
 * CLI for running migrations
 */
export function runMigrationCLI(dbPath: string): void {
  const db = new Database(dbPath);
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
          const date = new Date(m.appliedAt! * 1000).toISOString();
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
      } else {
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
      } else {
        console.log('✗ Migration verification failed:');
        verification.issues.forEach(issue => console.log(`  - ${issue}`);
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
