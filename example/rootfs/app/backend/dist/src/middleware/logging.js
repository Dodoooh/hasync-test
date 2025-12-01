"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detailedRequestLogging = exports.sanitizeForLogging = exports.performanceMonitoringMiddleware = exports.securityLoggingMiddleware = exports.errorLoggingMiddleware = exports.requestTimingMiddleware = exports.requestIdMiddleware = exports.httpLogger = void 0;
const morgan_1 = __importDefault(require("morgan"));
const logger_1 = __importStar(require("../utils/logger"));
morgan_1.default.token('response-time-ms', (req, res) => {
    if (!req._startTime)
        return '0';
    const diff = process.hrtime(req._startTime);
    const ms = diff[0] * 1000 + diff[1] / 1000000;
    return ms.toFixed(2);
});
morgan_1.default.token('request-id', (req) => req.id || 'unknown');
const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time-ms ms';
exports.httpLogger = (0, morgan_1.default)(morganFormat, {
    stream: logger_1.morganStream,
    skip: (req) => {
        if (process.env.NODE_ENV === 'production' && req.url === '/api/health') {
            return true;
        }
        return false;
    },
});
const requestIdMiddleware = (req, res, next) => {
    req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-ID', req.id);
    next();
};
exports.requestIdMiddleware = requestIdMiddleware;
const requestTimingMiddleware = (req, res, next) => {
    req._startTime = process.hrtime();
    const cleanup = () => {
        const diff = process.hrtime(req._startTime);
        const duration = diff[0] * 1000 + diff[1] / 1000000;
        (0, logger_1.logRequest)(req, res.statusCode, Math.round(duration));
    };
    res.on('finish', cleanup);
    res.on('close', cleanup);
    next();
};
exports.requestTimingMiddleware = requestTimingMiddleware;
const errorLoggingMiddleware = (err, req, res, next) => {
    logger_1.default.error('Request error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: req.body,
        params: req.params,
        query: req.query,
    });
    next(err);
};
exports.errorLoggingMiddleware = errorLoggingMiddleware;
const securityLoggingMiddleware = (req, res, next) => {
    const suspiciousPatterns = [
        /\.\./,
        /<script>/i,
        /union.*select/i,
        /eval\(/i,
    ];
    const url = req.url;
    const body = JSON.stringify(req.body);
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(url) || pattern.test(body)) {
            (0, logger_1.logSecurity)('Suspicious request pattern detected', 'high', {
                pattern: pattern.toString(),
                method: req.method,
                url: req.url,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                body: req.body,
            });
            break;
        }
    }
    res.on('finish', () => {
        if (res.statusCode === 429) {
            (0, logger_1.logSecurity)('Rate limit exceeded', 'medium', {
                method: req.method,
                url: req.url,
                ip: req.ip,
                userAgent: req.get('user-agent'),
            });
        }
    });
    next();
};
exports.securityLoggingMiddleware = securityLoggingMiddleware;
const performanceMonitoringMiddleware = (slowThreshold = 1000) => {
    return (req, res, next) => {
        const startTime = process.hrtime();
        res.on('finish', () => {
            const diff = process.hrtime(startTime);
            const duration = diff[0] * 1000 + diff[1] / 1000000;
            if (duration > slowThreshold) {
                logger_1.default.warn('Slow request detected', {
                    duration: `${duration.toFixed(2)}ms`,
                    threshold: `${slowThreshold}ms`,
                    method: req.method,
                    url: req.url,
                    statusCode: res.statusCode,
                    ip: req.ip,
                });
            }
        });
        next();
    };
};
exports.performanceMonitoringMiddleware = performanceMonitoringMiddleware;
const sanitizeForLogging = (obj) => {
    if (!obj || typeof obj !== 'object')
        return obj;
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];
    const sanitized = { ...obj };
    for (const key in sanitized) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
            sanitized[key] = '[REDACTED]';
        }
        else if (typeof sanitized[key] === 'object') {
            sanitized[key] = (0, exports.sanitizeForLogging)(sanitized[key]);
        }
    }
    return sanitized;
};
exports.sanitizeForLogging = sanitizeForLogging;
const detailedRequestLogging = (req, res, next) => {
    const startTime = Date.now();
    logger_1.default.debug('Incoming request', {
        requestId: req.id,
        method: req.method,
        url: req.url,
        headers: (0, exports.sanitizeForLogging)(req.headers),
        body: (0, exports.sanitizeForLogging)(req.body),
        query: req.query,
        params: req.params,
        ip: req.ip,
    });
    const originalJson = res.json.bind(res);
    res.json = function (body) {
        const duration = Date.now() - startTime;
        logger_1.default.debug('Outgoing response', {
            requestId: req.id,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            body: (0, exports.sanitizeForLogging)(body),
        });
        return originalJson(body);
    };
    next();
};
exports.detailedRequestLogging = detailedRequestLogging;
exports.default = {
    httpLogger: exports.httpLogger,
    requestIdMiddleware: exports.requestIdMiddleware,
    requestTimingMiddleware: exports.requestTimingMiddleware,
    errorLoggingMiddleware: exports.errorLoggingMiddleware,
    securityLoggingMiddleware: exports.securityLoggingMiddleware,
    performanceMonitoringMiddleware: exports.performanceMonitoringMiddleware,
    detailedRequestLogging: exports.detailedRequestLogging,
};
//# sourceMappingURL=logging.js.map