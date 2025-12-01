/**
 * JWT Authentication Middleware
 * Validates JWT tokens and protects routes
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production';

export const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
export const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        username: string;
        role: string;
      };
    }
  }
}

/**
 * Generate access token
 */
export function generateAccessToken(username: string, role: string = 'admin'): string {
  return jwt.sign(
    { username, role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(username: string, role: string = 'admin'): string {
  return jwt.sign(
    { username, role },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): { username: string; role: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'hasync-backend',
      audience: 'hasync-client'
    }) as { username: string; role: string };
    return decoded;
  } catch (error) {
    console.error('[Auth] Token verification failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): { username: string; role: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { username: string; role: string };
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * JWT Authentication Middleware
 * Protects routes by validating JWT tokens
 */
export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
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

  // Attach user to request
  req.user = decoded;
  next();
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
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
