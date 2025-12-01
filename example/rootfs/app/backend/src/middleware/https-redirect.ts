/**
 * HTTPS Redirect Middleware
 * Redirects HTTP requests to HTTPS
 */

import { Request, Response, NextFunction } from 'express';

export interface RedirectOptions {
  enabled: boolean;
  httpsPort: number;
  excludePaths?: string[];
}

/**
 * Middleware to redirect HTTP to HTTPS
 */
export function httpsRedirect(options: RedirectOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip if redirect is disabled
    if (!options.enabled) {
      return next();
    }

    // Skip if already HTTPS
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }

    // Skip excluded paths (e.g., health checks)
    if (options.excludePaths?.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Build HTTPS URL
    const host = req.hostname;
    const port = options.httpsPort === 443 ? '' : `:${options.httpsPort}`;
    const httpsUrl = `https://${host}${port}${req.url}`;

    console.log(`↻ Redirecting HTTP → HTTPS: ${req.url}`);
    res.redirect(301, httpsUrl);
  };
}

/**
 * Security headers middleware
 */
export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    // Strict Transport Security - force HTTPS for 1 year
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // XSS Protection (legacy browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");

    next();
  };
}
