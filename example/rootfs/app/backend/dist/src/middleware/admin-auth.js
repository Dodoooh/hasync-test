"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminLimiter = void 0;
exports.authenticateAdmin = authenticateAdmin;
function authenticateAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid authorization header'
            });
            return;
        }
        const token = authHeader.replace('Bearer ', '');
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf8');
            const [username] = decoded.split(':');
            const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
            if (username !== ADMIN_USERNAME) {
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Admin privileges required'
                });
                return;
            }
            next();
        }
        catch (error) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token format'
            });
        }
    }
    catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error?.message || 'Authentication failed'
        });
    }
}
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.adminLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        error: 'Too many admin requests',
        message: 'Please try again later. Maximum 10 admin operations per 15 minutes.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many admin requests',
            message: 'Please try again later. Maximum 10 admin operations per 15 minutes.',
            retryAfter: '15 minutes'
        });
    }
});
//# sourceMappingURL=admin-auth.js.map