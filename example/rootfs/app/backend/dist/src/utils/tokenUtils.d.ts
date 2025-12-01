import type { Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
interface DecodedClientToken {
    clientId: string;
    assignedAreas: string[];
}
export declare function generateClientToken(clientId: string, assignedAreas: string[]): string;
export declare function hashToken(token: string): string;
export declare function verifyClientToken(token: string): DecodedClientToken | null;
export declare function createClientAuthMiddleware(db: Database.Database): (req: any, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>>>;
export declare function createUnifiedAuthMiddleware(db: Database.Database): (req: any, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>>>;
export declare function revokeClientToken(db: Database.Database, tokenHash: string, reason?: string): boolean;
export declare function cleanupExpiredTokens(db: Database.Database): number;
export {};
//# sourceMappingURL=tokenUtils.d.ts.map