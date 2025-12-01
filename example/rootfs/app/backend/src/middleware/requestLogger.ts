/**
 * Comprehensive Request Logging Middleware
 * Logs CORS decisions, authentication attempts, and rate limiting status
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const requestLogger = createLogger('Request');

export interface RequestLoggerOptions {
  allowedOrigins: string[];
}

export const createRequestLoggerMiddleware = (options: RequestLoggerOptions) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const origin = req.get('origin') || 'no-origin';
    const authHeader = req.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    // Log incoming request
    requestLogger.info('Incoming request', {
      method: req.method,
      path: req.path,
      origin,
      hasAuth: !!authHeader,
      hasToken: !!token,
      contentType: req.get('content-type'),
      userAgent: req.get('user-agent'),
      ip: req.ip
    });

    // Check CORS decision
    if (origin !== 'no-origin') {
      const corsAllowed = options.allowedOrigins.includes(origin);
      requestLogger.info('CORS decision', {
        origin,
        decision: corsAllowed ? 'ALLOWED' : 'REJECTED',
        allowedOrigins: options.allowedOrigins.join(', ')
      });

      if (!corsAllowed) {
        requestLogger.warn('CORS rejection', {
          rejectedOrigin: origin,
          method: req.method,
          path: req.path
        });
      }
    }

    // Check authentication attempt
    if (authHeader) {
      try {
        const decoded = Buffer.from(token!, 'base64').toString('utf8');
        const username = decoded.split(':')[0];
        requestLogger.info('Authentication attempt', {
          username,
          path: req.path,
          method: req.method,
          status: 'VALID_FORMAT'
        });
      } catch (error) {
        requestLogger.warn('Authentication failed', {
          path: req.path,
          method: req.method,
          status: 'INVALID_TOKEN_FORMAT',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Intercept response to log completion and errors
    const originalSend = res.send;
    res.send = function(data: any): Response {
      const duration = Date.now() - startTime;
      const rateLimitRemaining = res.get('RateLimit-Remaining');
      const rateLimitLimit = res.get('RateLimit-Limit');

      requestLogger.info('Response sent', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        rateLimitStatus: rateLimitRemaining ? `${rateLimitRemaining}/${rateLimitLimit}` : 'N/A'
      });

      // Log rate limiting events
      if (res.statusCode === 429) {
        requestLogger.warn('Rate limit exceeded', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          origin,
          retryAfter: res.get('Retry-After') || 'Not set'
        });
      }

      // Log authentication failures
      if (res.statusCode === 401) {
        requestLogger.warn('Unauthorized access attempt', {
          path: req.path,
          method: req.method,
          origin,
          hasAuth: !!authHeader,
          ip: req.ip
        });
      }

      // Log forbidden access
      if (res.statusCode === 403) {
        requestLogger.warn('Forbidden access attempt', {
          path: req.path,
          method: req.method,
          origin,
          ip: req.ip
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
};
