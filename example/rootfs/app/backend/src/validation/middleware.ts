/**
 * Validation Middleware
 * Express middleware for request validation using Zod schemas
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Input sanitization utilities
 */
export const sanitizers = {
  /**
   * Sanitize string to prevent XSS attacks
   * Removes or escapes potentially dangerous characters
   */
  sanitizeString: (input: string): string => {
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  },

  /**
   * Sanitize HTML content - more aggressive
   */
  sanitizeHtml: (input: string): string => {
    return input
      .replace(/[<>'"]/g, '') // Remove HTML special chars
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .replace(/&/g, '&amp;')
      .trim();
  },

  /**
   * Sanitize for SQL - extra layer of protection
   * Note: Should ALWAYS use prepared statements as primary defense
   */
  sanitizeForSQL: (input: string): string => {
    return input
      .replace(/['";\\]/g, '') // Remove SQL special chars
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove block comment start
      .replace(/\*\//g, '') // Remove block comment end
      .trim();
  }
};

/**
 * Validate request body against a Zod schema
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate the request body
      const validated = schema.parse(req.body);

      // Replace request body with validated data
      req.body = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }

      // Unknown error
      return res.status(500).json({
        error: 'Validation error',
        message: 'An unexpected error occurred during validation'
      });
    }
  };
};

/**
 * Validate request params against a Zod schema
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Invalid path parameters',
          details: error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }

      return res.status(500).json({
        error: 'Validation error',
        message: 'An unexpected error occurred during validation'
      });
    }
  };
};

/**
 * Validate request query parameters against a Zod schema
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }

      return res.status(500).json({
        error: 'Validation error',
        message: 'An unexpected error occurred during validation'
      });
    }
  };
};

/**
 * General purpose request sanitizer middleware
 * Applies basic sanitization to all string fields in body, params, and query
 */
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  // Sanitize params
  if (req.params && typeof req.params === 'object') {
    sanitizeObject(req.params);
  }

  // Sanitize query
  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }

  next();
};

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any): void {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = sanitizers.sanitizeString(obj[key]);
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

/**
 * Content Security Policy headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  );

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
};

/**
 * Rate limiting helper - basic implementation
 * Tracks requests by IP address
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export const rateLimit = (options: {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const record = requestCounts.get(ip);

    if (!record || now > record.resetTime) {
      // New window or expired window
      requestCounts.set(ip, {
        count: 1,
        resetTime: now + options.windowMs
      });
      return next();
    }

    if (record.count >= options.maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again later.`,
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    record.count++;
    next();
  };
};

/**
 * Cleanup rate limit records periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(ip);
    }
  }
}, 60000); // Clean up every minute
