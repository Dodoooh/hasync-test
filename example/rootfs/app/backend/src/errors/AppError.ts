/**
 * Custom Application Error Classes
 * Provides structured error handling with HTTP status codes
 */

/**
 * Base Application Error
 * All custom errors should extend this class
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - Invalid client input
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, message);
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(403, message);
  }
}

/**
 * 404 Not Found - Resource does not exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
  }
}

/**
 * 409 Conflict - Request conflicts with current state
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(429, message);
  }
}

/**
 * 503 Service Unavailable - External service error
 */
export class ServiceUnavailableError extends AppError {
  constructor(service: string, details?: string) {
    const message = details
      ? `${service} is unavailable: ${details}`
      : `${service} is unavailable`;
    super(503, message);
  }
}
