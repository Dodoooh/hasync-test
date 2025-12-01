"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClientToken = generateClientToken;
exports.hashToken = hashToken;
exports.verifyClientToken = verifyClientToken;
exports.createClientAuthMiddleware = createClientAuthMiddleware;
exports.createUnifiedAuthMiddleware = createUnifiedAuthMiddleware;
exports.revokeClientToken = revokeClientToken;
exports.cleanupExpiredTokens = cleanupExpiredTokens;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)('TokenUtils');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY_YEARS = 10;
function generateClientToken(clientId, assignedAreas) {
    try {
        const payload = {
            clientId,
            role: 'client',
            assignedAreas,
            type: 'client'
        };
        const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, {
            expiresIn: `${TOKEN_EXPIRY_YEARS * 365}d`,
            issuer: 'hasync-backend',
            audience: 'hasync-client'
        });
        logger.info(`Generated client token for: ${clientId} with ${assignedAreas.length} areas`);
        return token;
    }
    catch (error) {
        logger.error(`Failed to generate client token: ${error.message}`);
        throw new Error(`Token generation failed: ${error.message}`);
    }
}
function hashToken(token) {
    try {
        const hash = (0, crypto_1.createHash)('sha256')
            .update(token)
            .digest('hex');
        logger.debug(`Token hashed successfully (length: ${token.length})`);
        return hash;
    }
    catch (error) {
        logger.error(`Failed to hash token: ${error.message}`);
        throw new Error(`Token hashing failed: ${error.message}`);
    }
}
function verifyClientToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET, {
            issuer: 'hasync-backend',
            audience: 'hasync-client'
        });
        if (decoded.role !== 'client' || decoded.type !== 'client') {
            logger.warn(`Invalid token type or role: ${decoded.role}/${decoded.type}`);
            return null;
        }
        if (!Array.isArray(decoded.assignedAreas)) {
            logger.warn(`Invalid assignedAreas format in token`);
            return null;
        }
        logger.debug(`Client token verified: ${decoded.clientId}`);
        return {
            clientId: decoded.clientId,
            assignedAreas: decoded.assignedAreas
        };
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            logger.warn(`Client token expired: ${error.expiredAt}`);
        }
        else if (error.name === 'JsonWebTokenError') {
            logger.warn(`Invalid client token signature: ${error.message}`);
        }
        else {
            logger.error(`Token verification error: ${error.message}`);
        }
        return null;
    }
}
function createClientAuthMiddleware(db) {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'No token provided'
                });
            }
            const token = authHeader.replace('Bearer ', '');
            const decoded = verifyClientToken(token);
            if (!decoded) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Invalid or expired token'
                });
            }
            const tokenHash = hashToken(token);
            const tokenRecord = db.prepare(`
        SELECT id, client_id, assigned_areas, is_revoked, expires_at
        FROM client_tokens
        WHERE token_hash = ?
      `).get(tokenHash);
            if (!tokenRecord) {
                logger.warn(`Token not found in database for client: ${decoded.clientId}`);
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Token not found or has been revoked'
                });
            }
            if (tokenRecord.is_revoked === 1) {
                logger.warn(`Revoked token attempted use by client: ${decoded.clientId}`);
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Token has been revoked'
                });
            }
            const now = Math.floor(Date.now() / 1000);
            if (tokenRecord.expires_at && tokenRecord.expires_at < now) {
                logger.warn(`Expired token attempted use by client: ${decoded.clientId}`);
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Token has expired'
                });
            }
            try {
                db.prepare(`
          UPDATE client_tokens
          SET last_used = strftime('%s', 'now')
          WHERE id = ?
        `).run(tokenRecord.id);
            }
            catch (error) {
                logger.warn(`Failed to update token last_used: ${error}`);
            }
            let assignedAreas = [];
            try {
                assignedAreas = JSON.parse(tokenRecord.assigned_areas);
            }
            catch (error) {
                logger.error(`Failed to parse assigned_areas for client ${decoded.clientId}`);
                assignedAreas = [];
            }
            req.client = {
                id: decoded.clientId,
                clientId: decoded.clientId,
                role: 'client',
                assignedAreas: assignedAreas
            };
            logger.debug(`Client authenticated: ${decoded.clientId} (${assignedAreas.length} areas)`);
            next();
        }
        catch (error) {
            logger.error(`Client authentication error: ${error.message}`);
            return res.status(500).json({
                error: 'Authentication failed',
                message: 'Internal server error during authentication'
            });
        }
    };
}
function createUnifiedAuthMiddleware(db) {
    const clientAuthMiddleware = createClientAuthMiddleware(db);
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'No token provided'
                });
            }
            const token = authHeader.replace('Bearer ', '');
            let decodedPreview;
            try {
                decodedPreview = jsonwebtoken_1.default.decode(token);
            }
            catch (error) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Invalid token format'
                });
            }
            if (!decodedPreview || !decodedPreview.role) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Invalid token structure'
                });
            }
            if (decodedPreview.role === 'client') {
                logger.debug('Routing to client authentication');
                return clientAuthMiddleware(req, res, next);
            }
            else if (decodedPreview.role === 'admin') {
                logger.debug('Routing to admin authentication');
                try {
                    const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET, {
                        issuer: 'hasync-backend',
                        audience: 'hasync-client'
                    });
                    req.user = {
                        id: decoded.username,
                        username: decoded.username,
                        role: decoded.role
                    };
                    logger.debug(`Admin authenticated: ${decoded.username}`);
                    next();
                }
                catch (error) {
                    logger.warn(`Admin authentication failed: ${error.message}`);
                    if (error.name === 'TokenExpiredError') {
                        return res.status(401).json({
                            error: 'Token expired',
                            message: 'Your session has expired. Please log in again.',
                            expiredAt: error.expiredAt
                        });
                    }
                    else if (error.name === 'JsonWebTokenError') {
                        return res.status(401).json({
                            error: 'Invalid token signature'
                        });
                    }
                    else {
                        return res.status(401).json({
                            error: 'Authentication failed'
                        });
                    }
                }
            }
            else {
                logger.warn(`Unknown token role: ${decodedPreview.role}`);
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Invalid token role'
                });
            }
        }
        catch (error) {
            logger.error(`Unified authentication error: ${error.message}`);
            return res.status(500).json({
                error: 'Authentication failed',
                message: 'Internal server error during authentication'
            });
        }
    };
}
function revokeClientToken(db, tokenHash, reason = 'Manual revocation') {
    try {
        const result = db.prepare(`
      UPDATE client_tokens
      SET is_revoked = 1,
          revoked_at = strftime('%s', 'now'),
          revoked_reason = ?
      WHERE token_hash = ? AND is_revoked = 0
    `).run(reason, tokenHash);
        if (result.changes > 0) {
            logger.info(`Token revoked: ${tokenHash.substring(0, 8)}... (${reason})`);
            return true;
        }
        else {
            logger.warn(`Token not found or already revoked: ${tokenHash.substring(0, 8)}...`);
            return false;
        }
    }
    catch (error) {
        logger.error(`Failed to revoke token: ${error.message}`);
        return false;
    }
}
function cleanupExpiredTokens(db) {
    try {
        const now = Math.floor(Date.now() / 1000);
        const result = db.prepare(`
      DELETE FROM client_tokens
      WHERE expires_at < ?
    `).run(now);
        logger.info(`Cleaned up ${result.changes} expired tokens`);
        return result.changes;
    }
    catch (error) {
        logger.error(`Failed to cleanup expired tokens: ${error.message}`);
        return 0;
    }
}
//# sourceMappingURL=tokenUtils.js.map