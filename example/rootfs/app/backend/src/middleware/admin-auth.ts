/**
 * Admin Authentication Middleware
 * Protects admin-only endpoints
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Verify admin token
 * In production, this should validate against a proper auth system
 */
export function authenticateAdmin(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Decode token and verify admin role
    // In production, use proper JWT validation
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [username] = decoded.split(':');

      const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

      if (username !== ADMIN_USERNAME) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Admin privileges required'
        });
        return;
      }

      // Token is valid, proceed
      next();
    } catch (error) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token format'
      });
    }
  } catch (error: any) {
    res.status(500).json({
      error: 'Internal server error',
      message: error?.message || 'Authentication failed'
    });
  }
}

/**
 * Rate limiter specifically for admin endpoints
 * More restrictive than normal endpoints
 */
import rateLimit from 'express-rate-limit';

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 requests per window
  message: {
    error: 'Too many admin requests',
    message: 'Please try again later. Maximum 10 admin operations per 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many admin requests',
      message: 'Please try again later. Maximum 10 admin operations per 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});
