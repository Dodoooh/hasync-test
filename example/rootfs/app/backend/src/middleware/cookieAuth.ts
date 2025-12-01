/**
 * Cookie-based Authentication Middleware
 * Replaces localStorage-based token authentication with secure httpOnly cookies
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from '../types';

export interface AuthToken {
  clientId: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  clientId?: string;
  client?: any;
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-use-env-variable';
const TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

/**
 * Cookie configuration for secure authentication
 */
export const cookieConfig = {
  httpOnly: true, // Prevents XSS attacks
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict' as const, // CSRF protection
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/',
};

/**
 * Refresh token cookie configuration
 */
export const refreshCookieConfig = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth/refresh',
};

/**
 * Generate JWT access token
 */
export function generateAccessToken(clientId: string): string {
  return jwt.sign({ clientId }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(clientId: string): string {
  return jwt.sign({ clientId, type: 'refresh' }, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): AuthToken {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthToken;
    return decoded;
  } catch (error) {
    throw new AuthenticationError('Invalid or expired token');
  }
}

/**
 * Set authentication cookies on response
 */
export function setAuthCookies(res: Response, clientId: string): void {
  const accessToken = generateAccessToken(clientId);
  const refreshToken = generateRefreshToken(clientId);

  // Set access token cookie
  res.cookie('accessToken', accessToken, cookieConfig);

  // Set refresh token cookie
  res.cookie('refreshToken', refreshToken, refreshCookieConfig);

  // Set a readable session indicator (non-httpOnly) for client-side checks
  res.cookie('auth_session', 'true', {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });
}

/**
 * Clear authentication cookies
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  res.clearCookie('auth_session', { path: '/' });
}

/**
 * Authentication middleware using httpOnly cookies
 */
export function authenticateWithCookie(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    // Get token from cookie
    const token = req.cookies?.accessToken;

    if (!token) {
      throw new AuthenticationError('No authentication token provided');
    }

    // Verify token
    const decoded = verifyToken(token);

    // Attach client ID to request
    req.clientId = decoded.clientId;

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: 'AUTHENTICATION_REQUIRED',
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Authentication failed',
        code: 'AUTHENTICATION_FAILED',
      });
    }
  }
}

/**
 * Optional authentication middleware
 */
export function optionalAuthWithCookie(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = req.cookies?.accessToken;

    if (token) {
      const decoded = verifyToken(token);
      req.clientId = decoded.clientId;
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors
    next();
  }
}

/**
 * Refresh token middleware
 */
export function refreshTokenMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new AuthenticationError('No refresh token provided');
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);

    // Check if it's a refresh token
    if ((decoded as any).type !== 'refresh') {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Attach client ID to request
    req.clientId = decoded.clientId;

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: 'REFRESH_TOKEN_INVALID',
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Token refresh failed',
        code: 'REFRESH_FAILED',
      });
    }
  }
}
