/**
 * Smart Request Logging Middleware
 * Logs only important events: errors, authentication, config changes
 * Filters out routine healthchecks and polling requests
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const requestLogger = createLogger('Request');
const LOG_LEVEL = process.env.LOG_LEVEL?.toLowerCase() || 'info';

export interface RequestLoggerOptions {
  allowedOrigins: string[];
}

// Paths that should be logged on DEBUG level only
const ROUTINE_PATHS = [
  '/api/health',
  '/api/clients',
  '/api/entities',
  '/api/csrf-token',
  '/socket.io/',
  '/api-docs/'
];

// Paths that are always important
const IMPORTANT_PATHS = [
  '/api/auth/',
  '/api/config/',
  '/api/admin/'
];

const isRoutinePath = (path: string): boolean => {
  return ROUTINE_PATHS.some(p => path.startsWith(p));
};

const isImportantPath = (path: string): boolean => {
  return IMPORTANT_PATHS.some(p => path.startsWith(p));
};

export const createRequestLoggerMiddleware = (options: RequestLoggerOptions) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const authHeader = req.get('authorization');
    const isRoutine = isRoutinePath(req.path);
    const isImportant = isImportantPath(req.path);

    // Log authentication attempts (always important)
    if (authHeader && req.path.includes('/auth/')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const username = decoded.split(':')[0];
        requestLogger.info('Authentication attempt', {
          username,
          path: req.path,
          method: req.method,
          ip: req.ip
        });
      } catch (error) {
        requestLogger.warn('Invalid authentication format', {
          path: req.path,
          ip: req.ip
        });
      }
    }

    // Intercept response to log important events and errors
    const originalSend = res.send;
    res.send = function(data: any): Response {
      const duration = Date.now() - startTime;

      // Always log errors (4xx, 5xx)
      if (res.statusCode >= 400) {
        const logData = {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip,
          userAgent: req.get('user-agent')
        };

        if (res.statusCode === 429) {
          requestLogger.warn('Rate limit exceeded', logData);
        } else if (res.statusCode === 401) {
          requestLogger.warn('Unauthorized access', logData);
        } else if (res.statusCode === 403) {
          requestLogger.warn('Forbidden access', logData);
        } else if (res.statusCode >= 500) {
          requestLogger.error('Server error', logData);
        } else {
          requestLogger.warn('Client error', logData);
        }
      }
      // Log important operations (config changes, admin actions)
      else if (isImportant && req.method !== 'GET') {
        requestLogger.info('Config/Admin operation', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip
        });
      }
      // Debug level for routine paths (if LOG_LEVEL=debug)
      else if (isRoutine && LOG_LEVEL === 'debug') {
        requestLogger.info('Routine request', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`
        });
      }
      // Info level for other successful requests (but not healthchecks)
      else if (!isRoutine && res.statusCode < 400) {
        requestLogger.info('Request completed', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
};
