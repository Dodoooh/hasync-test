import Database from 'better-sqlite3';
export interface Migration {
    version: number;
    name: string;
    filename: string;
    appliedAt?: number;
}
export interface MigrationResult {
    success: boolean;
    appliedMigrations: Migration[];
    errors: Array<{
        migration: string;
        error: string;
    }>;
}
export declare class MigrationRunner {
    private db;
    private migrationsPath;
    constructor(db: Database.Database, migrationsPath?: string);
    private initializeMigrationTracking;
    private getAvailableMigrations;
    private getAppliedMigrations;
    getPendingMigrations(): Migration[];
    private calculateChecksum;
    private applyMigration;
    migrate(): MigrationResult;
    getCurrentVersion(): number;
    getStatus(): {
        currentVersion: number;
        appliedCount: number;
        pendingCount: number;
        applied: Migration[];
        pending: Migration[];
    };
    verify(): {
        valid: boolean;
        issues: string[];
    };
    static createMigrationFile(name: string, migrationsPath?: string): {
        filename: string;
        path: string;
    };
}
export declare function runMigrationCLI(dbPath: string): void;
//# sourceMappingURL=migration-runner.d.ts.map