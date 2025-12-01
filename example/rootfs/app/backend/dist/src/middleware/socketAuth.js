"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitConnection = rateLimitConnection;
exports.socketAuthMiddleware = socketAuthMiddleware;
const auth_1 = require("./auth");
const tokenUtils_1 = require("../utils/tokenUtils");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const DATABASE_PATH = process.env.DATABASE_PATH || '/data/app01.db';
const db = new better_sqlite3_1.default(DATABASE_PATH);
const connectionAttempts = new Map();
const RATE_LIMIT_WINDOW = 60000;
const MAX_CONNECTIONS_PER_WINDOW = 10;
function rateLimitConnection(socket) {
    const ip = socket.handshake.address;
    const now = Date.now();
    const attempt = connectionAttempts.get(ip);
    if (!attempt) {
        connectionAttempts.set(ip, { count: 1, firstAttempt: now });
        return true;
    }
    if (now - attempt.firstAttempt > RATE_LIMIT_WINDOW) {
        connectionAttempts.set(ip, { count: 1, firstAttempt: now });
        return true;
    }
    if (attempt.count >= MAX_CONNECTIONS_PER_WINDOW) {
        console.warn(`[WebSocket] Rate limit exceeded for IP: ${ip}`);
        return false;
    }
    attempt.count++;
    return true;
}
setInterval(() => {
    const now = Date.now();
    for (const [ip, attempt] of connectionAttempts.entries()) {
        if (now - attempt.firstAttempt > RATE_LIMIT_WINDOW * 5) {
            connectionAttempts.delete(ip);
        }
    }
}, 5 * 60 * 1000);
function socketAuthMiddleware(socket, next) {
    try {
        console.log('[WebSocket] New connection attempt from:', socket.handshake.address);
        if (!rateLimitConnection(socket)) {
            console.warn('[WebSocket] Rate limit exceeded for:', socket.handshake.address);
            const error = new Error('Too many connection attempts. Please try again later.');
            error.data = { code: 'RATE_LIMIT_EXCEEDED' };
            return next(error);
        }
        const origin = socket.handshake.headers.origin;
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
        console.log('[WebSocket] Origin:', origin || 'none');
        console.log('[WebSocket] Allowed origins:', allowedOrigins.join(', '));
        if (origin) {
            const isOriginAllowed = allowedOrigins.includes(origin);
            const isInternalOrigin = origin.includes('://10.') ||
                origin.includes('://172.') ||
                origin.includes('://192.168.') ||
                origin.includes('://localhost') ||
                origin.includes('://127.0.0.1');
            if (!isOriginAllowed && !isInternalOrigin) {
                console.warn(`[WebSocket] ❌ REJECTED - Unauthorized origin: ${origin}`);
                console.warn('[WebSocket] Allowed origins are:', allowedOrigins.join(', '));
                const error = new Error('Unauthorized origin');
                error.data = { code: 'INVALID_ORIGIN' };
                return next(error);
            }
            if (isInternalOrigin) {
                console.log(`[WebSocket] ✅ ACCEPTED - Internal network origin: ${origin}`);
            }
        }
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        console.log('[WebSocket] Token present:', !!token);
        console.log('[WebSocket] Token source:', socket.handshake.auth?.token ? 'auth' : socket.handshake.query?.token ? 'query' : 'none');
        if (!token) {
            console.warn('[WebSocket] ❌ REJECTED - No token provided');
            const error = new Error('Authentication required');
            error.data = { code: 'NO_TOKEN' };
            return next(error);
        }
        console.log('[WebSocket] Verifying token...');
        const decoded = (0, auth_1.verifyAccessToken)(token);
        if (!decoded) {
            console.warn('[WebSocket] ❌ REJECTED - Invalid or expired token');
            const error = new Error('Invalid or expired token');
            error.data = { code: 'INVALID_TOKEN' };
            return next(error);
        }
        if (decoded.role === 'admin') {
            socket.user = {
                username: decoded.username,
                role: decoded.role,
            };
            console.log(`[WebSocket] ✅ SUCCESS - User authenticated: ${decoded.username} (${socket.id})`);
            return next();
        }
        else if (decoded.role === 'client') {
            const tokenHash = (0, tokenUtils_1.hashToken)(token);
            const client = db.prepare('SELECT * FROM clients WHERE token_hash = ? AND is_active = 1').get(tokenHash);
            if (!client) {
                const error = new Error('Token revoked or invalid');
                error.data = { code: 'TOKEN_REVOKED' };
                return next(error);
            }
            socket.user = {
                clientId: client.id,
                role: 'client',
                assignedAreas: client.assigned_areas ? JSON.parse(client.assigned_areas) : []
            };
            console.log(`[WebSocket] ✅ Client authenticated: ${client.id} (${socket.id})`);
            return next();
        }
        socket.user = {
            username: decoded.username,
            role: decoded.role,
        };
        if (decoded.role === 'client') {
            socket.clientId = decoded.username;
            console.log(`[WebSocket] ✅ SUCCESS - Client authenticated: ${decoded.username} (${socket.id})`);
        }
        else {
            console.log(`[WebSocket] ✅ SUCCESS - User authenticated: ${decoded.username} (${socket.id})`);
        }
        next();
    }
    catch (error) {
        console.error('[WebSocket] Authentication error:', error.message);
        const err = new Error('Authentication failed');
        err.data = { code: 'AUTH_ERROR', message: error.message };
        next(err);
    }
}
//# sourceMappingURL=socketAuth.js.map