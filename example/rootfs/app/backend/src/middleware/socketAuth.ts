/**
 * Socket.IO Authentication Middleware
 * Validates JWT tokens on WebSocket connections
 */

import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import { verifyAccessToken } from './auth';
import rateLimit from 'express-rate-limit';

// Rate limiter for WebSocket connections
const connectionAttempts = new Map<string, { count: number; firstAttempt: number }>();

const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_CONNECTIONS_PER_WINDOW = 10;

/**
 * Rate limit WebSocket connections by IP
 */
export function rateLimitConnection(socket: Socket): boolean {
  const ip = socket.handshake.address;
  const now = Date.now();

  const attempt = connectionAttempts.get(ip);

  if (!attempt) {
    connectionAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  // Reset if window expired
  if (now - attempt.firstAttempt > RATE_LIMIT_WINDOW) {
    connectionAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  // Check rate limit
  if (attempt.count >= MAX_CONNECTIONS_PER_WINDOW) {
    console.warn(`[WebSocket] Rate limit exceeded for IP: ${ip}`);
    return false;
  }

  attempt.count++;
  return true;
}

/**
 * Clean up old rate limit entries every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, attempt] of connectionAttempts.entries()) {
    if (now - attempt.firstAttempt > RATE_LIMIT_WINDOW * 5) {
      connectionAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

/**
 * Socket.IO authentication middleware
 * Validates JWT token and attaches user info to socket
 */
export function socketAuthMiddleware(socket: Socket, next: (err?: ExtendedError) => void): void {
  try {
    // Rate limit check
    if (!rateLimitConnection(socket)) {
      const error = new Error('Too many connection attempts. Please try again later.') as ExtendedError;
      error.data = { code: 'RATE_LIMIT_EXCEEDED' };
      return next(error);
    }

    // Validate origin
    const origin = socket.handshake.headers.origin;
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

    if (origin && !allowedOrigins.includes(origin)) {
      console.warn(`[WebSocket] Rejected connection from unauthorized origin: ${origin}`);
      const error = new Error('Unauthorized origin') as ExtendedError;
      error.data = { code: 'INVALID_ORIGIN' };
      return next(error);
    }

    // Extract token from auth object or query
    const token = socket.handshake.auth?.token || socket.handshake.query?.token as string;

    if (!token) {
      console.warn('[WebSocket] Connection attempt without token');
      const error = new Error('Authentication required') as ExtendedError;
      error.data = { code: 'NO_TOKEN' };
      return next(error);
    }

    // Verify JWT token
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      console.warn('[WebSocket] Invalid token provided');
      const error = new Error('Invalid or expired token') as ExtendedError;
      error.data = { code: 'INVALID_TOKEN' };
      return next(error);
    }

    // Attach user info to socket
    (socket as any).user = {
      username: decoded.username,
      role: decoded.role,
    };

    console.log(`[WebSocket] User authenticated: ${decoded.username} (${socket.id})`);
    next();
  } catch (error: any) {
    console.error('[WebSocket] Authentication error:', error.message);
    const err = new Error('Authentication failed') as ExtendedError;
    err.data = { code: 'AUTH_ERROR', message: error.message };
    next(err);
  }
}

/**
 * Extend Socket type to include user
 */
declare module 'socket.io' {
  interface Socket {
    user?: {
      username: string;
      role: string;
    };
  }
}
