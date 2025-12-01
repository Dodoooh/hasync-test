"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClientTokenRouter = createClientTokenRouter;
const express_1 = require("express");
const tokenUtils_1 = require("../utils/tokenUtils");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ClientTokenRoutes');
function createClientTokenRouter(db, authenticate) {
    const router = (0, express_1.Router)();
    router.post('/', authenticate, async (req, res) => {
        try {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Only admin users can generate client tokens'
                });
            }
            const { clientId, assignedAreas } = req.body;
            if (!clientId || typeof clientId !== 'string') {
                return res.status(400).json({
                    error: 'Invalid input',
                    message: 'clientId is required and must be a string'
                });
            }
            if (!Array.isArray(assignedAreas)) {
                return res.status(400).json({
                    error: 'Invalid input',
                    message: 'assignedAreas must be an array'
                });
            }
            const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
            if (!client) {
                return res.status(404).json({
                    error: 'Client not found',
                    message: `Client with id '${clientId}' does not exist`
                });
            }
            const token = (0, tokenUtils_1.generateClientToken)(clientId, assignedAreas);
            const tokenHash = (0, tokenUtils_1.hashToken)(token);
            const tokenId = `token_${Date.now()}`;
            const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60);
            db.prepare(`
        INSERT INTO client_tokens (id, client_id, token_hash, assigned_areas, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(tokenId, clientId, tokenHash, JSON.stringify(assignedAreas), expiresAt);
            logger.info(`Generated client token for: ${clientId} by admin: ${req.user.username}`);
            res.status(201).json({
                tokenId,
                token,
                clientId,
                assignedAreas,
                expiresAt: new Date(expiresAt * 1000).toISOString()
            });
        }
        catch (error) {
            logger.error(`Error generating client token: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to generate client token'
            });
        }
    });
    router.get('/', authenticate, async (req, res) => {
        try {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Only admin users can view client tokens'
                });
            }
            const { clientId } = req.query;
            let tokens;
            if (clientId) {
                tokens = db.prepare(`
          SELECT
            id,
            client_id,
            assigned_areas,
            created_at,
            expires_at,
            last_used,
            is_revoked,
            revoked_at,
            revoked_reason
          FROM client_tokens
          WHERE client_id = ?
          ORDER BY created_at DESC
        `).all(clientId);
            }
            else {
                tokens = db.prepare(`
          SELECT
            id,
            client_id,
            assigned_areas,
            created_at,
            expires_at,
            last_used,
            is_revoked,
            revoked_at,
            revoked_reason
          FROM client_tokens
          ORDER BY created_at DESC
        `).all();
            }
            const formattedTokens = tokens.map((token) => ({
                ...token,
                assignedAreas: JSON.parse(token.assigned_areas),
                isRevoked: token.is_revoked === 1,
                createdAt: new Date(token.created_at * 1000).toISOString(),
                expiresAt: new Date(token.expires_at * 1000).toISOString(),
                lastUsed: token.last_used ? new Date(token.last_used * 1000).toISOString() : null,
                revokedAt: token.revoked_at ? new Date(token.revoked_at * 1000).toISOString() : null
            }));
            res.json({
                tokens: formattedTokens,
                count: formattedTokens.length
            });
        }
        catch (error) {
            logger.error(`Error listing client tokens: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to list client tokens'
            });
        }
    });
    router.get('/:tokenId', authenticate, async (req, res) => {
        try {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Only admin users can view token details'
                });
            }
            const { tokenId } = req.params;
            const token = db.prepare(`
        SELECT
          id,
          client_id,
          assigned_areas,
          created_at,
          expires_at,
          last_used,
          is_revoked,
          revoked_at,
          revoked_reason
        FROM client_tokens
        WHERE id = ?
      `).get(tokenId);
            if (!token) {
                return res.status(404).json({
                    error: 'Token not found',
                    message: `Token with id '${tokenId}' does not exist`
                });
            }
            res.json({
                ...token,
                assignedAreas: JSON.parse(token.assigned_areas),
                isRevoked: token.is_revoked === 1,
                createdAt: new Date(token.created_at * 1000).toISOString(),
                expiresAt: new Date(token.expires_at * 1000).toISOString(),
                lastUsed: token.last_used ? new Date(token.last_used * 1000).toISOString() : null,
                revokedAt: token.revoked_at ? new Date(token.revoked_at * 1000).toISOString() : null
            });
        }
        catch (error) {
            logger.error(`Error getting token details: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to get token details'
            });
        }
    });
    router.post('/:tokenId/revoke', authenticate, async (req, res) => {
        try {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Only admin users can revoke client tokens'
                });
            }
            const { tokenId } = req.params;
            const { reason } = req.body;
            const tokenRecord = db.prepare('SELECT token_hash, client_id, is_revoked FROM client_tokens WHERE id = ?').get(tokenId);
            if (!tokenRecord) {
                return res.status(404).json({
                    error: 'Token not found',
                    message: `Token with id '${tokenId}' does not exist`
                });
            }
            if (tokenRecord.is_revoked === 1) {
                return res.status(400).json({
                    error: 'Token already revoked',
                    message: 'This token has already been revoked'
                });
            }
            const revocationReason = reason || `Revoked by admin: ${req.user.username}`;
            const revoked = (0, tokenUtils_1.revokeClientToken)(db, tokenRecord.token_hash, revocationReason);
            if (revoked) {
                logger.info(`Token ${tokenId} revoked by admin: ${req.user.username} - Reason: ${revocationReason}`);
                res.json({
                    success: true,
                    tokenId,
                    clientId: tokenRecord.client_id,
                    revokedAt: new Date().toISOString(),
                    reason: revocationReason
                });
            }
            else {
                res.status(500).json({
                    error: 'Revocation failed',
                    message: 'Failed to revoke token'
                });
            }
        }
        catch (error) {
            logger.error(`Error revoking token: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to revoke token'
            });
        }
    });
    router.patch('/:tokenId', authenticate, async (req, res) => {
        try {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Only admin users can update client tokens'
                });
            }
            const { tokenId } = req.params;
            const { assignedAreas } = req.body;
            if (!Array.isArray(assignedAreas)) {
                return res.status(400).json({
                    error: 'Invalid input',
                    message: 'assignedAreas must be an array'
                });
            }
            const tokenRecord = db.prepare('SELECT id, client_id, is_revoked FROM client_tokens WHERE id = ?').get(tokenId);
            if (!tokenRecord) {
                return res.status(404).json({
                    error: 'Token not found',
                    message: `Token with id '${tokenId}' does not exist`
                });
            }
            if (tokenRecord.is_revoked === 1) {
                return res.status(400).json({
                    error: 'Token revoked',
                    message: 'Cannot update a revoked token'
                });
            }
            db.prepare(`
        UPDATE client_tokens
        SET assigned_areas = ?
        WHERE id = ?
      `).run(JSON.stringify(assignedAreas), tokenId);
            logger.info(`Token ${tokenId} areas updated by admin: ${req.user.username}`);
            res.json({
                success: true,
                tokenId,
                clientId: tokenRecord.client_id,
                assignedAreas
            });
        }
        catch (error) {
            logger.error(`Error updating token: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to update token'
            });
        }
    });
    router.post('/cleanup', authenticate, async (req, res) => {
        try {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Only admin users can cleanup tokens'
                });
            }
            const cleaned = (0, tokenUtils_1.cleanupExpiredTokens)(db);
            logger.info(`Cleaned ${cleaned} expired tokens by admin: ${req.user.username}`);
            res.json({
                success: true,
                cleanedCount: cleaned,
                message: `Cleaned up ${cleaned} expired token(s)`
            });
        }
        catch (error) {
            logger.error(`Error cleaning up tokens: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to cleanup tokens'
            });
        }
    });
    router.get('/stats', authenticate, async (req, res) => {
        try {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Only admin users can view token statistics'
                });
            }
            const stats = {
                total: db.prepare('SELECT COUNT(*) as count FROM client_tokens').get(),
                active: db.prepare('SELECT COUNT(*) as count FROM client_tokens WHERE is_revoked = 0').get(),
                revoked: db.prepare('SELECT COUNT(*) as count FROM client_tokens WHERE is_revoked = 1').get(),
                expired: db.prepare('SELECT COUNT(*) as count FROM client_tokens WHERE expires_at < strftime("%s", "now")').get(),
                recentlyUsed: db.prepare('SELECT COUNT(*) as count FROM client_tokens WHERE last_used > strftime("%s", "now") - 86400').get(),
            };
            res.json({
                totalTokens: stats.total.count,
                activeTokens: stats.active.count,
                revokedTokens: stats.revoked.count,
                expiredTokens: stats.expired.count,
                recentlyUsedTokens: stats.recentlyUsed.count
            });
        }
        catch (error) {
            logger.error(`Error getting token stats: ${error.message}`);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to get token statistics'
            });
        }
    });
    return router;
}
//# sourceMappingURL=client-tokens.js.map