import { Request, Response } from 'express';
export declare function initializeAdminUser(db: any): Promise<void>;
export declare function handleLogin(req: Request, res: Response, db: any): Promise<void>;
export declare function handleRefreshToken(req: Request, res: Response): Promise<void>;
export declare function handleVerifyToken(req: Request, res: Response): void;
//# sourceMappingURL=auth-routes.d.ts.map