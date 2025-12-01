import { Request, Response, NextFunction } from 'express';
export interface RequestLoggerOptions {
    allowedOrigins: string[];
}
export declare const createRequestLoggerMiddleware: (options: RequestLoggerOptions) => (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=requestLogger.d.ts.map