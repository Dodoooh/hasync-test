import Database from 'better-sqlite3';
import { Client, PairingSession } from '../types';
export declare class DatabaseService {
    private db;
    private migrationRunner;
    constructor(dbPath: string, runMigrations?: boolean);
    private runMigrations;
    getMigrationStatus(): {
        currentVersion: number;
        appliedCount: number;
        pendingCount: number;
        applied: import("./migration-runner").Migration[];
        pending: import("./migration-runner").Migration[];
    };
    getSchemaVersion(): number;
    createClient(client: Omit<Client, 'id'>): Client;
    getClient(id: string): Client | null;
    getClientByPublicKey(publicKey: string): Client | null;
    getAllClients(activeOnly?: boolean): Client[];
    updateClient(id: string, updates: Partial<Client>): boolean;
    deleteClient(id: string): boolean;
    createPairingSession(pin: string, expiresAt: number): PairingSession;
    getPairingSession(pin: string): PairingSession | null;
    markPairingSessionUsed(pin: string): boolean;
    cleanExpiredPairingSessions(): number;
    logActivity(clientId: string | null, action: string, details?: string, ipAddress?: string): void;
    cacheEntity(entityId: string, state: any): void;
    getCachedEntity(entityId: string): any | null;
    getConfig(key: string): string | null;
    setConfig(key: string, value: string): void;
    private mapClient;
    private generateId;
    close(): void;
    healthCheck(): boolean;
    getDatabase(): Database.Database;
}
//# sourceMappingURL=index-with-migrations.d.ts.map