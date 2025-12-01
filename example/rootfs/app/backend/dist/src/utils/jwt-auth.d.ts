import { Request, Response, NextFunction } from 'express';
declare const JWT_EXPIRATION: string;
export interface JWTPayload {
    username: string;
    role: string;
    iat?: number;
    exp?: number;
}
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        username: string;
        role: string;
    };
}
export declare function generateToken(username: string, role: string): string;
export declare function verifyToken(token: string): JWTPayload;
export declare function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): Response<any, Record<string, any>>;
export declare function getTokenExpiration(token: string): {
    exp: number;
    expiresAt: string;
} | null;
export { JWT_EXPIRATION };
//# sourceMappingURL=jwt-auth.d.ts.map