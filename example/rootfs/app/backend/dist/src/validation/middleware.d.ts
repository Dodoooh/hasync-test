import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
export declare const sanitizers: {
    sanitizeString: (input: string) => string;
    sanitizeHtml: (input: string) => string;
    sanitizeForSQL: (input: string) => string;
};
export declare const validateBody: (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
export declare const validateParams: (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
export declare const validateQuery: (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
export declare const sanitizeRequest: (req: Request, res: Response, next: NextFunction) => void;
export declare const securityHeaders: (req: Request, res: Response, next: NextFunction) => void;
export declare const rateLimit: (options: {
    windowMs: number;
    maxRequests: number;
}) => (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
//# sourceMappingURL=middleware.d.ts.map