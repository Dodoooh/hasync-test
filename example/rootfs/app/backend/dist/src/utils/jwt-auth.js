"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_EXPIRATION = void 0;
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
exports.authenticateJWT = authenticateJWT;
exports.getTokenExpiration = getTokenExpiration;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)('JWTAuth');
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-use-long-random-string';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';
exports.JWT_EXPIRATION = JWT_EXPIRATION;
const JWT_ISSUER = 'hasync-backend';
const JWT_AUDIENCE = 'hasync-client';
if (JWT_SECRET === 'change-this-in-production-use-long-random-string' && process.env.NODE_ENV === 'production') {
    logger.warn('⚠ WARNING: Using default JWT_SECRET in production. Set JWT_SECRET environment variable!');
}
function generateToken(username, role) {
    const payload = {
        username,
        role,
        iat: Math.floor(Date.now() / 1000)
    };
    const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRATION,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
    });
    logger.info(`Token generated for user: ${username}`);
    return token;
}
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        });
        return decoded;
    }
    catch (error) {
        logger.warn(`Token verification failed: ${error.message}`);
        throw error;
    }
}
function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'No token provided'
        });
    }
    try {
        const decoded = verifyToken(token);
        req.user = {
            id: decoded.username,
            username: decoded.username,
            role: decoded.role
        };
        next();
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Your session has expired. Please log in again.',
                expiredAt: error.expiredAt
            });
        }
        else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Token signature verification failed'
            });
        }
        else {
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Token validation failed'
            });
        }
    }
}
function getTokenExpiration(token) {
    try {
        const decoded = verifyToken(token);
        if (decoded.exp) {
            return {
                exp: decoded.exp,
                expiresAt: new Date(decoded.exp * 1000).toISOString()
            };
        }
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=jwt-auth.js.map