import * as Database from 'better-sqlite3';
export declare function setDatabasePermissions(dbPath: string): void;
export declare function configureDatabaseSecurity(db: Database.Database): void;
export declare class InputSanitizer {
    static validateEntityId(entityId: string): boolean;
    static validateAreaId(areaId: string): boolean;
    static validateAreaName(name: string): boolean;
    static validateBoolean(value: any): boolean;
    static validateEntityIdArray(entityIds: any): boolean;
    static sanitizeString(input: string, maxLength?: number): string;
}
export declare function createDatabaseBackup(db: Database.Database, backupDir: string): string;
export declare function restoreDatabaseBackup(backupPath: string, targetPath: string): void;
export declare function cleanOldBackups(backupDir: string, keepCount?: number): void;
export declare function queryWithTimeout(db: Database.Database, query: string, params?: any[], timeout?: number): any;
export declare function executeTransaction(db: Database.Database, operations: (db: Database.Database) => void, timeout?: number): Promise<void>;
//# sourceMappingURL=database-security.d.ts.map