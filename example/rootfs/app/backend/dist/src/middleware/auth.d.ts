import { Request, Response, NextFunction } from 'express';
export declare const ACCESS_TOKEN_EXPIRY = "15m";
export declare const REFRESH_TOKEN_EXPIRY = "7d";
declare global {
    namespace Express {
        interface Request {
            user?: {
                username: string;
                role: string;
            };
        }
    }
}
export declare function generateAccessToken(username: string, role?: string): string;
export declare function generateRefreshToken(username: string, role?: string): string;
export declare function verifyAccessToken(token: string): {
    username: string;
    role: string;
} | null;
export declare function verifyRefreshToken(token: string): {
    username: string;
    role: string;
} | null;
export declare function authenticateJWT(req: Request, res: Response, next: NextFunction): void;
export declare function optionalAuth(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map