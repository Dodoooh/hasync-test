import { Client, PairingSession } from '../types';
export declare class DatabaseService {
    private db;
    constructor(dbPath: string);
    private initialize;
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
}
//# sourceMappingURL=index.d.ts.map