"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = exports.securityHeaders = exports.sanitizeRequest = exports.validateQuery = exports.validateParams = exports.validateBody = exports.sanitizers = void 0;
const zod_1 = require("zod");
exports.sanitizers = {
    sanitizeString: (input) => {
        return input
            .replace(/[<>]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '')
            .trim();
    },
    sanitizeHtml: (input) => {
        return input
            .replace(/[<>'"]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '')
            .replace(/&/g, '&amp;')
            .trim();
    },
    sanitizeForSQL: (input) => {
        return input
            .replace(/['";\\]/g, '')
            .replace(/--/g, '')
            .replace(/\/\*/g, '')
            .replace(/\*\//g, '')
            .trim();
    }
};
const validateBody = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.body);
            req.body = validated;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.issues.map(err => ({
                        field: err.path.join('.'),
                        message: err.message,
                        code: err.code
                    }))
                });
            }
            return res.status(500).json({
                error: 'Validation error',
                message: 'An unexpected error occurred during validation'
            });
        }
    };
};
exports.validateBody = validateBody;
const validateParams = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.params);
            req.params = validated;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                return res.status(400).json({
                    error: 'Invalid path parameters',
                    details: error.issues.map(err => ({
                        field: err.path.join('.'),
                        message: err.message,
                        code: err.code
                    }))
                });
            }
            return res.status(500).json({
                error: 'Validation error',
                message: 'An unexpected error occurred during validation'
            });
        }
    };
};
exports.validateParams = validateParams;
const validateQuery = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.query);
            req.query = validated;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                return res.status(400).json({
                    error: 'Invalid query parameters',
                    details: error.issues.map(err => ({
                        field: err.path.join('.'),
                        message: err.message,
                        code: err.code
                    }))
                });
            }
            return res.status(500).json({
                error: 'Validation error',
                message: 'An unexpected error occurred during validation'
            });
        }
    };
};
exports.validateQuery = validateQuery;
const sanitizeRequest = (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        sanitizeObject(req.body);
    }
    if (req.params && typeof req.params === 'object') {
        sanitizeObject(req.params);
    }
    if (req.query && typeof req.query === 'object') {
        sanitizeObject(req.query);
    }
    next();
};
exports.sanitizeRequest = sanitizeRequest;
function sanitizeObject(obj) {
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            obj[key] = exports.sanitizers.sanitizeString(obj[key]);
        }
        else if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitizeObject(obj[key]);
        }
    }
}
const securityHeaders = (req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
};
exports.securityHeaders = securityHeaders;
const requestCounts = new Map();
const rateLimit = (options) => {
    return (req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const record = requestCounts.get(ip);
        if (!record || now > record.resetTime) {
            requestCounts.set(ip, {
                count: 1,
                resetTime: now + options.windowMs
            });
            return next();
        }
        if (record.count >= options.maxRequests) {
            return res.status(429).json({
                error: 'Too many requests',
                message: `Rate limit exceeded. Please try again later.`,
                retryAfter: Math.ceil((record.resetTime - now) / 1000)
            });
        }
        record.count++;
        next();
    };
};
exports.rateLimit = rateLimit;
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of requestCounts.entries()) {
        if (now > record.resetTime) {
            requestCounts.delete(ip);
        }
    }
}, 60000);
//# sourceMappingURL=middleware.js.map