/**
 * JWT Authentication Utilities
 * Secure token generation and validation with JWT
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from './logger';

const logger = createLogger('JWTAuth');

// JWT Configuration from environment
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-use-long-random-string';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';
const JWT_ISSUER = 'hasync-backend';
const JWT_AUDIENCE = 'hasync-client';

// Warn if using default secret in production
if (JWT_SECRET === 'change-this-in-production-use-long-random-string' && process.env.NODE_ENV === 'production') {
  logger.warn('⚠ WARNING: Using default JWT_SECRET in production. Set JWT_SECRET environment variable!');
}

export interface JWTPayload {
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

/**
 * Generate a secure JWT token with user information
 * @param username - Username
 * @param role - User role (e.g., 'admin')
 * @returns Signed JWT token
 */
export function generateToken(username: string, role: string): string {
  const payload: JWTPayload = {
    username,
    role,
    iat: Math.floor(Date.now() / 1000)
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });

  logger.info(`Token generated for user: ${username}`);
  return token;
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token to verify
 * @returns Decoded payload if valid
 * @throws Error if token is invalid or expired
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    }) as JWTPayload;

    return decoded;
  } catch (error: any) {
    logger.warn(`Token verification failed: ${error.message}`);
    throw error;
  }
}

/**
 * Express middleware to authenticate JWT tokens
 * Extracts and verifies the Bearer token from Authorization header
 */
export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

    // Attach user information to request
    req.user = {
      id: decoded.username,
      username: decoded.username,
      role: decoded.role
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.',
        expiredAt: error.expiredAt
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token signature verification failed'
      });
    } else {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Token validation failed'
      });
    }
  }
}

/**
 * Get token expiration information
 * @param token - JWT token
 * @returns Expiration timestamp and formatted date
 */
export function getTokenExpiration(token: string): { exp: number; expiresAt: string } | null {
  try {
    const decoded = verifyToken(token);
    if (decoded.exp) {
      return {
        exp: decoded.exp,
        expiresAt: new Date(decoded.exp * 1000).toISOString()
      };
    }
    return null;
  } catch {
    return null;
  }
}

export { JWT_EXPIRATION };
