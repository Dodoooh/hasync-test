"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRequestLoggerMiddleware = void 0;
const logger_1 = require("../utils/logger");
const requestLogger = (0, logger_1.createLogger)('Request');
const LOG_LEVEL = process.env.LOG_LEVEL?.toLowerCase() || 'info';
const ROUTINE_PATHS = [
    '/api/health',
    '/api/clients',
    '/api/entities',
    '/api/csrf-token',
    '/socket.io/',
    '/api-docs/'
];
const IMPORTANT_PATHS = [
    '/api/auth/',
    '/api/config/',
    '/api/admin/'
];
const isRoutinePath = (path) => {
    return ROUTINE_PATHS.some(p => path.startsWith(p));
};
const isImportantPath = (path) => {
    return IMPORTANT_PATHS.some(p => path.startsWith(p));
};
const createRequestLoggerMiddleware = (options) => {
    return (req, res, next) => {
        const startTime = Date.now();
        const authHeader = req.get('authorization');
        const isRoutine = isRoutinePath(req.path);
        const isImportant = isImportantPath(req.path);
        if (authHeader && req.path.includes('/auth/')) {
            try {
                const token = authHeader.replace('Bearer ', '');
                const decoded = Buffer.from(token, 'base64').toString('utf8');
                const username = decoded.split(':')[0];
                requestLogger.info('Authentication attempt', {
                    username,
                    path: req.path,
                    method: req.method,
                    ip: req.ip
                });
            }
            catch (error) {
                requestLogger.warn('Invalid authentication format', {
                    path: req.path,
                    ip: req.ip
                });
            }
        }
        const originalSend = res.send;
        res.send = function (data) {
            const duration = Date.now() - startTime;
            if (res.statusCode >= 400) {
                const logData = {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration: `${duration}ms`,
                    ip: req.ip,
                    userAgent: req.get('user-agent')
                };
                if (res.statusCode === 429) {
                    requestLogger.warn('Rate limit exceeded', logData);
                }
                else if (res.statusCode === 401) {
                    requestLogger.warn('Unauthorized access', logData);
                }
                else if (res.statusCode === 403) {
                    requestLogger.warn('Forbidden access', logData);
                }
                else if (res.statusCode >= 500) {
                    requestLogger.error('Server error', logData);
                }
                else {
                    requestLogger.warn('Client error', logData);
                }
            }
            else if (isImportant && req.method !== 'GET') {
                requestLogger.info('Config/Admin operation', {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration: `${duration}ms`,
                    ip: req.ip
                });
            }
            else if (isRoutine && LOG_LEVEL === 'debug') {
                requestLogger.info('Routine request', {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration: `${duration}ms`
                });
            }
            else if (!isRoutine && res.statusCode < 400) {
                requestLogger.info('Request completed', {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration: `${duration}ms`
                });
            }
            return originalSend.call(this, data);
        };
        next();
    };
};
exports.createRequestLoggerMiddleware = createRequestLoggerMiddleware;
//# sourceMappingURL=requestLogger.js.map