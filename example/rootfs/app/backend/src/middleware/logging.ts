/**
 * Logging Middleware for Express
 * Integrates Winston and Morgan for comprehensive request/response logging
 */

import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import logger, { logRequest, logSecurity, morganStream } from '../utils/logger';

// Morgan token for response time in milliseconds
morgan.token('response-time-ms', (req: any, res: any) => {
  if (!req._startTime) return '0';
  const diff = process.hrtime(req._startTime);
  const ms = diff[0] * 1000 + diff[1] / 1000000;
  return ms.toFixed(2);
});

// Morgan token for request ID
morgan.token('request-id', (req: any) => req.id || 'unknown');

// Custom Morgan format with more details
const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time-ms ms';

// Create Morgan middleware
export const httpLogger = morgan(morganFormat, {
  stream: morganStream,
  skip: (req: Request) => {
    // Skip health check logs in production to reduce noise
    if (process.env.NODE_ENV === 'production' && req.url === '/api/health') {
      return true;
    }
    return false;
  },
});

// Request ID middleware - adds unique ID to each request
export const requestIdMiddleware = (req: any, res: Response, next: NextFunction) => {
  req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
};

// Request timing middleware - tracks request duration
export const requestTimingMiddleware = (req: any, res: Response, next: NextFunction) => {
  req._startTime = process.hrtime();

  const cleanup = () => {
    const diff = process.hrtime(req._startTime);
    const duration = diff[0] * 1000 + diff[1] / 1000000;
    logRequest(req, res.statusCode, Math.round(duration));
  };

  res.on('finish', cleanup);
  res.on('close', cleanup);

  next();
};

// Error logging middleware - logs all errors
export const errorLoggingMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    params: req.params,
    query: req.query,
  });

  next(err);
};

// Security logging middleware - logs suspicious activity
export const securityLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./,  // Path traversal
    /<script>/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /eval\(/i,  // Code injection
  ];

  const url = req.url;
  const body = JSON.stringify(req.body);

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(body)) {
      logSecurity('Suspicious request pattern detected', 'high', {
        pattern: pattern.toString(),
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: req.body,
      });
      break;
    }
  }

  // Log rate limit violations
  res.on('finish', () => {
    if (res.statusCode === 429) {
      logSecurity('Rate limit exceeded', 'medium', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    }
  });

  next();
};

// Performance monitoring middleware - logs slow requests
export const performanceMonitoringMiddleware = (slowThreshold: number = 1000) => {
  return (req: any, res: Response, next: NextFunction) => {
    const startTime = process.hrtime();

    res.on('finish', () => {
      const diff = process.hrtime(startTime);
      const duration = diff[0] * 1000 + diff[1] / 1000000;

      if (duration > slowThreshold) {
        logger.warn('Slow request detected', {
          duration: `${duration.toFixed(2)}ms`,
          threshold: `${slowThreshold}ms`,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          ip: req.ip,
        });
      }
    });

    next();
  };
};

// Request body sanitization for logging - removes sensitive data
export const sanitizeForLogging = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];
  const sanitized = { ...obj };

  for (const key in sanitized) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeForLogging(sanitized[key]);
    }
  }

  return sanitized;
};

// Detailed request logging middleware - logs request/response details
export const detailedRequestLogging = (req: any, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Log incoming request
  logger.debug('Incoming request', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    headers: sanitizeForLogging(req.headers),
    body: sanitizeForLogging(req.body),
    query: req.query,
    params: req.params,
    ip: req.ip,
  });

  // Capture original res.json
  const originalJson = res.json.bind(res);

  // Override res.json to log response
  res.json = function(body: any) {
    const duration = Date.now() - startTime;

    logger.debug('Outgoing response', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      body: sanitizeForLogging(body),
    });

    return originalJson(body);
  };

  next();
};

export default {
  httpLogger,
  requestIdMiddleware,
  requestTimingMiddleware,
  errorLoggingMiddleware,
  securityLoggingMiddleware,
  performanceMonitoringMiddleware,
  detailedRequestLogging,
};
