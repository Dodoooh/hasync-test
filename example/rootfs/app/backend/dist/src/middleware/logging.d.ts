import { Request, Response, NextFunction } from 'express';
export declare const httpLogger: any;
export declare const requestIdMiddleware: (req: any, res: Response, next: NextFunction) => void;
export declare const requestTimingMiddleware: (req: any, res: Response, next: NextFunction) => void;
export declare const errorLoggingMiddleware: (err: any, req: Request, res: Response, next: NextFunction) => void;
export declare const securityLoggingMiddleware: (req: Request, res: Response, next: NextFunction) => void;
export declare const performanceMonitoringMiddleware: (slowThreshold?: number) => (req: any, res: Response, next: NextFunction) => void;
export declare const sanitizeForLogging: (obj: any) => any;
export declare const detailedRequestLogging: (req: any, res: Response, next: NextFunction) => void;
declare const _default: {
    httpLogger: any;
    requestIdMiddleware: (req: any, res: Response, next: NextFunction) => void;
    requestTimingMiddleware: (req: any, res: Response, next: NextFunction) => void;
    errorLoggingMiddleware: (err: any, req: Request, res: Response, next: NextFunction) => void;
    securityLoggingMiddleware: (req: Request, res: Response, next: NextFunction) => void;
    performanceMonitoringMiddleware: (slowThreshold?: number) => (req: any, res: Response, next: NextFunction) => void;
    detailedRequestLogging: (req: any, res: Response, next: NextFunction) => void;
};
export default _default;
//# sourceMappingURL=logging.d.ts.map