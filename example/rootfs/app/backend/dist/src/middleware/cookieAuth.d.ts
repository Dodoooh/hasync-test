import { Request, Response, NextFunction } from 'express';
export interface AuthToken {
    clientId: string;
    iat: number;
    exp: number;
}
export interface AuthenticatedRequest extends Request {
    clientId?: string;
    client?: any;
}
export declare const cookieConfig: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "strict";
    maxAge: number;
    path: string;
};
export declare const refreshCookieConfig: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "strict";
    maxAge: number;
    path: string;
};
export declare function generateAccessToken(clientId: string): string;
export declare function generateRefreshToken(clientId: string): string;
export declare function verifyToken(token: string): AuthToken;
export declare function setAuthCookies(res: Response, clientId: string): void;
export declare function clearAuthCookies(res: Response): void;
export declare function authenticateWithCookie(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
export declare function optionalAuthWithCookie(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
export declare function refreshTokenMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
//# sourceMappingURL=cookieAuth.d.ts.map