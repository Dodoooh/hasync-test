/**
 * Retry utility with exponential backoff
 * Implements automatic retry logic for failed API calls
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param options Retry configuration
 * @returns Promise that resolves with the function result
 * @throws RetryError if all retries fail
 *
 * @example
 * const data = await retryWithBackoff(
 *   () => apiClient.getAreas(),
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 8000,
    onRetry,
  } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate exponential backoff: 1s, 2s, 4s, 8s (capped at maxDelay)
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

      // Notify about retry
      onRetry?.(attempt + 1, lastError);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new RetryError(
    `Failed after ${maxRetries + 1} attempts: ${lastError.message}`,
    maxRetries + 1,
    lastError
  );
}

/**
 * Check if an error is worth retrying
 * Network errors and 5xx errors should be retried
 * 4xx client errors (except 408, 429) should not be retried
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error.name === 'NetworkError' || error.message?.includes('fetch')) {
    return true;
  }

  // HTTP status codes
  const status = error.status || error.response?.status;
  if (status) {
    // Retry server errors (5xx)
    if (status >= 500) return true;

    // Retry specific client errors
    if (status === 408 || status === 429) return true;

    // Don't retry other client errors (4xx)
    if (status >= 400 && status < 500) return false;
  }

  // Default to retrying unknown errors
  return true;
}

/**
 * Retry with conditional logic
 * Only retries if the error passes the shouldRetry check
 */
export async function retryIf<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: Error) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, onRetry } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      if (!shouldRetry(lastError) || attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), 8000);
      onRetry?.(attempt + 1, lastError);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
