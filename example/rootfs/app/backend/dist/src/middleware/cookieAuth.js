"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshCookieConfig = exports.cookieConfig = void 0;
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyToken = verifyToken;
exports.setAuthCookies = setAuthCookies;
exports.clearAuthCookies = clearAuthCookies;
exports.authenticateWithCookie = authenticateWithCookie;
exports.optionalAuthWithCookie = optionalAuthWithCookie;
exports.refreshTokenMiddleware = refreshTokenMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const types_1 = require("../types");
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-use-env-variable';
const TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
exports.cookieConfig = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
    path: '/',
};
exports.refreshCookieConfig = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth/refresh',
};
function generateAccessToken(clientId) {
    return jsonwebtoken_1.default.sign({ clientId }, JWT_SECRET, {
        expiresIn: TOKEN_EXPIRY,
    });
}
function generateRefreshToken(clientId) {
    return jsonwebtoken_1.default.sign({ clientId, type: 'refresh' }, JWT_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
    });
}
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return decoded;
    }
    catch (error) {
        throw new types_1.AuthenticationError('Invalid or expired token');
    }
}
function setAuthCookies(res, clientId) {
    const accessToken = generateAccessToken(clientId);
    const refreshToken = generateRefreshToken(clientId);
    res.cookie('accessToken', accessToken, exports.cookieConfig);
    res.cookie('refreshToken', refreshToken, exports.refreshCookieConfig);
    res.cookie('auth_session', 'true', {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/',
    });
}
function clearAuthCookies(res) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    res.clearCookie('auth_session', { path: '/' });
}
function authenticateWithCookie(req, res, next) {
    try {
        const token = req.cookies?.accessToken;
        if (!token) {
            throw new types_1.AuthenticationError('No authentication token provided');
        }
        const decoded = verifyToken(token);
        req.clientId = decoded.clientId;
        next();
    }
    catch (error) {
        if (error instanceof types_1.AuthenticationError) {
            res.status(401).json({
                success: false,
                error: error.message,
                code: 'AUTHENTICATION_REQUIRED',
            });
        }
        else {
            res.status(401).json({
                success: false,
                error: 'Authentication failed',
                code: 'AUTHENTICATION_FAILED',
            });
        }
    }
}
function optionalAuthWithCookie(req, res, next) {
    try {
        const token = req.cookies?.accessToken;
        if (token) {
            const decoded = verifyToken(token);
            req.clientId = decoded.clientId;
        }
        next();
    }
    catch (error) {
        next();
    }
}
function refreshTokenMiddleware(req, res, next) {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            throw new types_1.AuthenticationError('No refresh token provided');
        }
        const decoded = verifyToken(refreshToken);
        if (decoded.type !== 'refresh') {
            throw new types_1.AuthenticationError('Invalid refresh token');
        }
        req.clientId = decoded.clientId;
        next();
    }
    catch (error) {
        if (error instanceof types_1.AuthenticationError) {
            res.status(401).json({
                success: false,
                error: error.message,
                code: 'REFRESH_TOKEN_INVALID',
            });
        }
        else {
            res.status(401).json({
                success: false,
                error: 'Token refresh failed',
                code: 'REFRESH_FAILED',
            });
        }
    }
}
//# sourceMappingURL=cookieAuth.js.map