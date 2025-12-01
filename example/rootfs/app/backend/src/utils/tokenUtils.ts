/**
 * Token Generation and Verification Utilities
 * Handles JWT token creation for client authentication with area-based access control
 */

import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { createLogger } from './logger';
import type { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';

const logger = createLogger('TokenUtils');

// JWT Configuration from environment
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY_YEARS = 10;

// JWT payload interface for client tokens
interface ClientTokenPayload {
  clientId: string;
  role: 'client';
  assignedAreas: string[];
  type: 'client';
  iat?: number;
  exp?: number;
}

// JWT payload interface for admin tokens
interface AdminTokenPayload {
  username: string;
  role: 'admin';
  iat?: number;
  exp?: number;
}

// Decoded token result
interface DecodedClientToken {
  clientId: string;
  assignedAreas: string[];
}

/**
 * Generate a long-lived JWT token for a client
 * @param clientId - Unique client identifier
 * @param assignedAreas - Array of area IDs the client can access
 * @returns Signed JWT token string
 */
export function generateClientToken(clientId: string, assignedAreas: string[]): string {
  try {
    const payload: ClientTokenPayload = {
      clientId,
      role: 'client',
      assignedAreas,
      type: 'client'
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: `${TOKEN_EXPIRY_YEARS * 365}d`, // 10 years
      issuer: 'hasync-backend',
      audience: 'hasync-client'
    });

    logger.info(`Generated client token for: ${clientId} with ${assignedAreas.length} areas`);
    return token;
  } catch (error: any) {
    logger.error(`Failed to generate client token: ${error.message}`);
    throw new Error(`Token generation failed: ${error.message}`);
  }
}

/**
 * Hash a token using SHA256 for database storage
 * @param token - Raw JWT token
 * @returns Hex-encoded SHA256 hash
 */
export function hashToken(token: string): string {
  try {
    const hash = createHash('sha256')
      .update(token)
      .digest('hex');

    logger.debug(`Token hashed successfully (length: ${token.length})`);
    return hash;
  } catch (error: any) {
    logger.error(`Failed to hash token: ${error.message}`);
    throw new Error(`Token hashing failed: ${error.message}`);
  }
}

/**
 * Verify a client JWT token and extract payload
 * @param token - JWT token string
 * @returns Decoded token payload or null if invalid
 */
export function verifyClientToken(token: string): DecodedClientToken | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'hasync-backend',
      audience: 'hasync-client'
    }) as ClientTokenPayload;

    // Validate token type and role
    if (decoded.role !== 'client' || decoded.type !== 'client') {
      logger.warn(`Invalid token type or role: ${decoded.role}/${decoded.type}`);
      return null;
    }

    // Ensure assignedAreas is an array
    if (!Array.isArray(decoded.assignedAreas)) {
      logger.warn(`Invalid assignedAreas format in token`);
      return null;
    }

    logger.debug(`Client token verified: ${decoded.clientId}`);
    return {
      clientId: decoded.clientId,
      assignedAreas: decoded.assignedAreas
    };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      logger.warn(`Client token expired: ${error.expiredAt}`);
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn(`Invalid client token signature: ${error.message}`);
    } else {
      logger.error(`Token verification error: ${error.message}`);
    }
    return null;
  }
}

/**
 * Express middleware to authenticate client tokens
 * Verifies JWT signature, checks database for revocation, and attaches client info to request
 */
export function createClientAuthMiddleware(db: Database.Database) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'No token provided'
        });
      }

      const token = authHeader.replace('Bearer ', '');

      // Verify JWT token
      const decoded = verifyClientToken(token);
      if (!decoded) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }

      // Hash token to check database
      const tokenHash = hashToken(token);

      // Check if token exists in database and is not revoked
      const tokenRecord = db.prepare(`
        SELECT id, client_id, assigned_areas, is_revoked, expires_at
        FROM client_tokens
        WHERE token_hash = ?
      `).get(tokenHash) as any;

      if (!tokenRecord) {
        logger.warn(`Token not found in database for client: ${decoded.clientId}`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token not found or has been revoked'
        });
      }

      // Check if token is revoked
      if (tokenRecord.is_revoked === 1) {
        logger.warn(`Revoked token attempted use by client: ${decoded.clientId}`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has been revoked'
        });
      }

      // Check if token is expired (database-level check)
      const now = Math.floor(Date.now() / 1000);
      if (tokenRecord.expires_at && tokenRecord.expires_at < now) {
        logger.warn(`Expired token attempted use by client: ${decoded.clientId}`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has expired'
        });
      }

      // Update last_used timestamp
      try {
        db.prepare(`
          UPDATE client_tokens
          SET last_used = strftime('%s', 'now')
          WHERE id = ?
        `).run(tokenRecord.id);
      } catch (error) {
        logger.warn(`Failed to update token last_used: ${error}`);
        // Don't fail the request if we can't update last_used
      }

      // Parse assigned areas from database (JSON string)
      let assignedAreas: string[] = [];
      try {
        assignedAreas = JSON.parse(tokenRecord.assigned_areas);
      } catch (error) {
        logger.error(`Failed to parse assigned_areas for client ${decoded.clientId}`);
        assignedAreas = [];
      }

      // Attach client information to request
      req.client = {
        id: decoded.clientId,
        clientId: decoded.clientId,
        role: 'client',
        assignedAreas: assignedAreas
      };

      logger.debug(`Client authenticated: ${decoded.clientId} (${assignedAreas.length} areas)`);
      next();
    } catch (error: any) {
      logger.error(`Client authentication error: ${error.message}`);
      return res.status(500).json({
        error: 'Authentication failed',
        message: 'Internal server error during authentication'
      });
    }
  };
}

/**
 * Enhanced authenticate middleware that handles BOTH admin and client tokens
 * Determines token type and routes to appropriate authentication flow
 */
export function createUnifiedAuthMiddleware(db: Database.Database) {
  const clientAuthMiddleware = createClientAuthMiddleware(db);

  return async (req: any, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'No token provided'
        });
      }

      const token = authHeader.replace('Bearer ', '');

      // Try to decode without verification first to check token type
      let decodedPreview: any;
      try {
        decodedPreview = jwt.decode(token);
      } catch (error) {
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

      // Route based on token role
      if (decodedPreview.role === 'client') {
        // Use client authentication flow
        logger.debug('Routing to client authentication');
        return clientAuthMiddleware(req, res, next);
      } else if (decodedPreview.role === 'admin') {
        // Use admin authentication flow (existing logic)
        logger.debug('Routing to admin authentication');
        try {
          const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'hasync-backend',
            audience: 'hasync-client'
          }) as AdminTokenPayload;

          // Attach admin user information to request
          req.user = {
            id: decoded.username,
            username: decoded.username,
            role: decoded.role
          };

          logger.debug(`Admin authenticated: ${decoded.username}`);
          next();
        } catch (error: any) {
          logger.warn(`Admin authentication failed: ${error.message}`);

          if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
              error: 'Token expired',
              message: 'Your session has expired. Please log in again.',
              expiredAt: error.expiredAt
            });
          } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
              error: 'Invalid token signature'
            });
          } else {
            return res.status(401).json({
              error: 'Authentication failed'
            });
          }
        }
      } else {
        logger.warn(`Unknown token role: ${decodedPreview.role}`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token role'
        });
      }
    } catch (error: any) {
      logger.error(`Unified authentication error: ${error.message}`);
      return res.status(500).json({
        error: 'Authentication failed',
        message: 'Internal server error during authentication'
      });
    }
  };
}

/**
 * Revoke a client token (mark as revoked in database)
 * @param db - Database instance
 * @param tokenHash - SHA256 hash of the token
 * @param reason - Reason for revocation
 */
export function revokeClientToken(
  db: Database.Database,
  tokenHash: string,
  reason: string = 'Manual revocation'
): boolean {
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
    } else {
      logger.warn(`Token not found or already revoked: ${tokenHash.substring(0, 8)}...`);
      return false;
    }
  } catch (error: any) {
    logger.error(`Failed to revoke token: ${error.message}`);
    return false;
  }
}

/**
 * Clean up expired tokens from database (maintenance function)
 * @param db - Database instance
 * @returns Number of tokens deleted
 */
export function cleanupExpiredTokens(db: Database.Database): number {
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = db.prepare(`
      DELETE FROM client_tokens
      WHERE expires_at < ?
    `).run(now);

    logger.info(`Cleaned up ${result.changes} expired tokens`);
    return result.changes;
  } catch (error: any) {
    logger.error(`Failed to cleanup expired tokens: ${error.message}`);
    return 0;
  }
}
