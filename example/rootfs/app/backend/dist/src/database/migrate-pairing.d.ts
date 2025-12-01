import type { Database } from 'better-sqlite3';
export declare function migratePairingTables(db: Database): void;
export declare function cleanupExpiredPairingSessions(db: Database): number;
export declare function startPairingCleanupJob(db: Database): NodeJS.Timeout;
export declare function verifyPairingSession(db: Database, pin: string, deviceName?: string, deviceType?: string): string | null;
export declare function completePairingSession(db: Database, sessionId: string): boolean;
export declare function expirePairingSession(db: Database, sessionId: string): boolean;
export declare function getPairingSession(db: Database, sessionId: string): any | null;
export declare function createPairingSession(db: Database, adminUsername: string): {
    id: string;
    pin: string;
    expiresAt: number;
    status: string;
};
//# sourceMappingURL=migrate-pairing.d.ts.map