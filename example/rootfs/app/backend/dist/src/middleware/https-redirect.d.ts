import { Request, Response, NextFunction } from 'express';
export interface RedirectOptions {
    enabled: boolean;
    httpsPort: number;
    excludePaths?: string[];
}
export declare function httpsRedirect(options: RedirectOptions): (req: Request, res: Response, next: NextFunction) => void;
export declare function securityHeaders(): (_req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=https-redirect.d.ts.map