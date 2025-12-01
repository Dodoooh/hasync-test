"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFRESH_TOKEN_EXPIRY = exports.ACCESS_TOKEN_EXPIRY = void 0;
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.authenticateJWT = authenticateJWT;
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production';
exports.ACCESS_TOKEN_EXPIRY = '15m';
exports.REFRESH_TOKEN_EXPIRY = '7d';
function generateAccessToken(username, role = 'admin') {
    return jsonwebtoken_1.default.sign({ username, role }, JWT_SECRET, { expiresIn: exports.ACCESS_TOKEN_EXPIRY });
}
function generateRefreshToken(username, role = 'admin') {
    return jsonwebtoken_1.default.sign({ username, role }, JWT_REFRESH_SECRET, { expiresIn: exports.REFRESH_TOKEN_EXPIRY });
}
function verifyAccessToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET, {
            issuer: 'hasync-backend',
            audience: 'hasync-client'
        });
        return decoded;
    }
    catch (error) {
        console.error('[Auth] Token verification failed:', error instanceof Error ? error.message : 'Unknown error');
        return null;
    }
}
function verifyRefreshToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_REFRESH_SECRET);
        return decoded;
    }
    catch (error) {
        return null;
    }
}
function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'No authentication token provided'
        });
        return;
    }
    const token = authHeader.replace('Bearer ', '');
    const decoded = verifyAccessToken(token);
    if (!decoded) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token'
        });
        return;
    }
    req.user = decoded;
    next();
}
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const decoded = verifyAccessToken(token);
        if (decoded) {
            req.user = decoded;
        }
    }
    next();
}
//# sourceMappingURL=auth.js.map