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
    console.log('[WebSocket] New connection attempt from:', socket.handshake.address);

    // Rate limit check
    if (!rateLimitConnection(socket)) {
      console.warn('[WebSocket] Rate limit exceeded for:', socket.handshake.address);
      const error = new Error('Too many connection attempts. Please try again later.') as ExtendedError;
      error.data = { code: 'RATE_LIMIT_EXCEEDED' };
      return next(error);
    }

    // Validate origin - allow internal networks (same logic as Socket.IO CORS and HTTP CORS)
    const origin = socket.handshake.headers.origin;
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

    console.log('[WebSocket] Origin:', origin || 'none');
    console.log('[WebSocket] Allowed origins:', allowedOrigins.join(', '));

    if (origin) {
      // Check if origin is in allowed list OR is an internal network IP
      const isOriginAllowed = allowedOrigins.includes(origin);
      const isInternalOrigin = origin.includes('://10.') ||
                               origin.includes('://172.') ||
                               origin.includes('://192.168.') ||
                               origin.includes('://localhost') ||
                               origin.includes('://127.0.0.1');

      if (!isOriginAllowed && !isInternalOrigin) {
        console.warn(`[WebSocket] ❌ REJECTED - Unauthorized origin: ${origin}`);
        console.warn('[WebSocket] Allowed origins are:', allowedOrigins.join(', '));
        const error = new Error('Unauthorized origin') as ExtendedError;
        error.data = { code: 'INVALID_ORIGIN' };
        return next(error);
      }

      if (isInternalOrigin) {
        console.log(`[WebSocket] ✅ ACCEPTED - Internal network origin: ${origin}`);
      }
    }

    // Extract token from auth object or query
    const token = socket.handshake.auth?.token || socket.handshake.query?.token as string;

    console.log('[WebSocket] Token present:', !!token);
    console.log('[WebSocket] Token source:', socket.handshake.auth?.token ? 'auth' : socket.handshake.query?.token ? 'query' : 'none');

    if (!token) {
      console.warn('[WebSocket] ❌ REJECTED - No token provided');
      const error = new Error('Authentication required') as ExtendedError;
      error.data = { code: 'NO_TOKEN' };
      return next(error);
    }

    // Verify JWT token
    console.log('[WebSocket] Verifying token...');
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      console.warn('[WebSocket] ❌ REJECTED - Invalid or expired token');
      const error = new Error('Invalid or expired token') as ExtendedError;
      error.data = { code: 'INVALID_TOKEN' };
      return next(error);
    }

    // Attach user info to socket
    (socket as any).user = {
      username: decoded.username,
      role: decoded.role,
    };

    console.log(`[WebSocket] ✅ SUCCESS - User authenticated: ${decoded.username} (${socket.id})`);
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
