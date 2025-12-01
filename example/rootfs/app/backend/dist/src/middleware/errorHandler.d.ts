import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
export declare const asyncHandler: (fn: Function) => (req: Request, res: Response, next: NextFunction) => void;
export declare const notFoundHandler: (req: Request, res: Response) => void;
export declare const errorHandler: (err: Error | AppError, req: Request, res: Response, _next: NextFunction) => void;
export declare const setupUnhandledRejectionHandler: () => void;
export declare const setupUncaughtExceptionHandler: () => void;
//# sourceMappingURL=errorHandler.d.ts.map