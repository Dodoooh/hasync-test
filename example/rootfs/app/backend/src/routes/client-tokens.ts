/**
 * Client Token Management Routes
 * Admin-only endpoints for managing client authentication tokens
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import {
  generateClientToken,
  hashToken,
  revokeClientToken,
  cleanupExpiredTokens
} from '../utils/tokenUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('ClientTokenRoutes');

/**
 * Create router for client token management
 * @param db - Database instance
 * @param authenticate - Authentication middleware
 * @returns Express router
 */
export function createClientTokenRouter(db: Database.Database, authenticate: any): Router {
  const router = Router();

  /**
   * Generate a new client token
   * POST /api/client-tokens
   * Body: { clientId: string, assignedAreas: string[] }
   * Admin only
   */
  router.post('/', authenticate, async (req: any, res: Response) => {
    try {
      // Only admin can generate tokens
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admin users can generate client tokens'
        });
      }

      const { clientId, assignedAreas } = req.body;

      // Validate input
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

      // Check if client exists
      const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
      if (!client) {
        return res.status(404).json({
          error: 'Client not found',
          message: `Client with id '${clientId}' does not exist`
        });
      }

      // Generate token
      const token = generateClientToken(clientId, assignedAreas);
      const tokenHash = hashToken(token);

      // Store in database
      const tokenId = `token_${Date.now()}`;
      const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60); // 10 years

      db.prepare(`
        INSERT INTO client_tokens (id, client_id, token_hash, assigned_areas, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(tokenId, clientId, tokenHash, JSON.stringify(assignedAreas), expiresAt);

      logger.info(`Generated client token for: ${clientId} by admin: ${req.user.username}`);

      res.status(201).json({
        tokenId,
        token, // Only returned once on creation
        clientId,
        assignedAreas,
        expiresAt: new Date(expiresAt * 1000).toISOString()
      });
    } catch (error: any) {
      logger.error(`Error generating client token: ${error.message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to generate client token'
      });
    }
  });

  /**
   * List all client tokens
   * GET /api/client-tokens
   * Query: ?clientId=<id> (optional filter)
   * Admin only
   */
  router.get('/', authenticate, async (req: any, res: Response) => {
    try {
      // Only admin can view tokens
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
      } else {
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

      // Parse assigned_areas JSON
      const formattedTokens = tokens.map((token: any) => ({
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
    } catch (error: any) {
      logger.error(`Error listing client tokens: ${error.message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list client tokens'
      });
    }
  });

  /**
   * Get specific token details
   * GET /api/client-tokens/:tokenId
   * Admin only
   */
  router.get('/:tokenId', authenticate, async (req: any, res: Response) => {
    try {
      // Only admin can view token details
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
      `).get(tokenId) as any;

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
    } catch (error: any) {
      logger.error(`Error getting token details: ${error.message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get token details'
      });
    }
  });

  /**
   * Revoke a client token
   * POST /api/client-tokens/:tokenId/revoke
   * Body: { reason: string } (optional)
   * Admin only
   */
  router.post('/:tokenId/revoke', authenticate, async (req: any, res: Response) => {
    try {
      // Only admin can revoke tokens
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admin users can revoke client tokens'
        });
      }

      const { tokenId } = req.params;
      const { reason } = req.body;

      // Get token hash from database
      const tokenRecord = db.prepare('SELECT token_hash, client_id, is_revoked FROM client_tokens WHERE id = ?').get(tokenId) as any;

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

      // Revoke token
      const revocationReason = reason || `Revoked by admin: ${req.user.username}`;
      const revoked = revokeClientToken(db, tokenRecord.token_hash, revocationReason);

      if (revoked) {
        logger.info(`Token ${tokenId} revoked by admin: ${req.user.username} - Reason: ${revocationReason}`);

        res.json({
          success: true,
          tokenId,
          clientId: tokenRecord.client_id,
          revokedAt: new Date().toISOString(),
          reason: revocationReason
        });
      } else {
        res.status(500).json({
          error: 'Revocation failed',
          message: 'Failed to revoke token'
        });
      }
    } catch (error: any) {
      logger.error(`Error revoking token: ${error.message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to revoke token'
      });
    }
  });

  /**
   * Update assigned areas for a token
   * PATCH /api/client-tokens/:tokenId
   * Body: { assignedAreas: string[] }
   * Admin only
   */
  router.patch('/:tokenId', authenticate, async (req: any, res: Response) => {
    try {
      // Only admin can update tokens
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admin users can update client tokens'
        });
      }

      const { tokenId } = req.params;
      const { assignedAreas } = req.body;

      // Validate input
      if (!Array.isArray(assignedAreas)) {
        return res.status(400).json({
          error: 'Invalid input',
          message: 'assignedAreas must be an array'
        });
      }

      // Check if token exists and is not revoked
      const tokenRecord = db.prepare('SELECT id, client_id, is_revoked FROM client_tokens WHERE id = ?').get(tokenId) as any;

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

      // Update assigned areas
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
    } catch (error: any) {
      logger.error(`Error updating token: ${error.message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update token'
      });
    }
  });

  /**
   * Cleanup expired tokens
   * POST /api/client-tokens/cleanup
   * Admin only
   */
  router.post('/cleanup', authenticate, async (req: any, res: Response) => {
    try {
      // Only admin can cleanup tokens
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admin users can cleanup tokens'
        });
      }

      const cleaned = cleanupExpiredTokens(db);

      logger.info(`Cleaned ${cleaned} expired tokens by admin: ${req.user.username}`);

      res.json({
        success: true,
        cleanedCount: cleaned,
        message: `Cleaned up ${cleaned} expired token(s)`
      });
    } catch (error: any) {
      logger.error(`Error cleaning up tokens: ${error.message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to cleanup tokens'
      });
    }
  });

  /**
   * Get token statistics
   * GET /api/client-tokens/stats
   * Admin only
   */
  router.get('/stats', authenticate, async (req: any, res: Response) => {
    try {
      // Only admin can view stats
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admin users can view token statistics'
        });
      }

      const stats = {
        total: db.prepare('SELECT COUNT(*) as count FROM client_tokens').get() as any,
        active: db.prepare('SELECT COUNT(*) as count FROM client_tokens WHERE is_revoked = 0').get() as any,
        revoked: db.prepare('SELECT COUNT(*) as count FROM client_tokens WHERE is_revoked = 1').get() as any,
        expired: db.prepare('SELECT COUNT(*) as count FROM client_tokens WHERE expires_at < strftime("%s", "now")').get() as any,
        recentlyUsed: db.prepare('SELECT COUNT(*) as count FROM client_tokens WHERE last_used > strftime("%s", "now") - 86400').get() as any, // Last 24h
      };

      res.json({
        totalTokens: stats.total.count,
        activeTokens: stats.active.count,
        revokedTokens: stats.revoked.count,
        expiredTokens: stats.expired.count,
        recentlyUsedTokens: stats.recentlyUsed.count
      });
    } catch (error: any) {
      logger.error(`Error getting token stats: ${error.message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get token statistics'
      });
    }
  });

  return router;
}
