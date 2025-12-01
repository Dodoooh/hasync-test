/**
 * Centralized Error Handling Middleware
 * Provides consistent error responses and comprehensive logging
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { createLogger } from '../utils/logger';

const logger = createLogger('ErrorHandler');

/**
 * Async route handler wrapper
 * Catches async errors and passes them to error middleware
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 * Should be registered before error handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  logger.warn('Endpoint not found', {
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    error: 'Endpoint not found',
    statusCode: 404,
    path: req.path,
    timestamp: new Date().toISOString()
  });
};

/**
 * Error handling middleware
 * Must be registered AFTER all routes
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Build comprehensive error info
  const errorInfo = {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    timestamp: new Date().toISOString()
  };

  // Check if this is an operational error
  if (err instanceof AppError && err.isOperational) {
    // Log operational errors as warnings
    logger.warn('Operational error occurred', errorInfo);

    // Return structured error response
    res.status(err.statusCode).json({
      error: err.message,
      statusCode: err.statusCode,
      timestamp: errorInfo.timestamp,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        path: req.path
      })
    });
    return;
  }

  // Programming/unexpected error - log as error
  logger.error('Unexpected error occurred', errorInfo);

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'development'
    ? err.message
    : 'Internal server error';

  res.status(500).json({
    error: message,
    statusCode: 500,
    timestamp: errorInfo.timestamp,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      path: req.path,
      details: err.message
    })
  });
};

/**
 * Unhandled rejection handler
 * Prevents application crashes
 */
export const setupUnhandledRejectionHandler = () => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString()
    });

    // Optionally exit process in production
    if (process.env.NODE_ENV === 'production') {
      logger.error('Exiting due to unhandled rejection');
      process.exit(1);
    }
  });
};

/**
 * Uncaught exception handler
 * Last resort error handling
 */
export const setupUncaughtExceptionHandler = () => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack
    });

    // Always exit on uncaught exceptions
    logger.error('Exiting due to uncaught exception');
    process.exit(1);
  });
};
