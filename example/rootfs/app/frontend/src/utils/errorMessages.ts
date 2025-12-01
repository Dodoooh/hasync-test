/**
 * User-friendly error message mapping
 * Converts technical errors into human-readable messages
 */

export interface ErrorContext {
  operation?: string;
  resource?: string;
  details?: string;
}

export interface FormattedError {
  title: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  action?: string;
}

/**
 * Get user-friendly error message based on error type
 */
export function getErrorMessage(
  error: any,
  context: ErrorContext = {}
): FormattedError {
  const { operation = 'operation', resource = 'resource' } = context;

  // Network errors
  if (error.name === 'NetworkError' || error.message?.includes('fetch') || error.message?.includes('network')) {
    return {
      title: 'Connection Error',
      message: 'Cannot connect to server. Please check your internet connection and try again.',
      severity: 'error',
      action: 'Retry',
    };
  }

  // HTTP status code errors
  const status = error.status || error.response?.status;

  if (status === 400) {
    return {
      title: 'Invalid Request',
      message: error.message || 'The request contains invalid data. Please check your input and try again.',
      severity: 'warning',
      action: 'Fix Input',
    };
  }

  if (status === 401) {
    return {
      title: 'Authentication Required',
      message: 'Your session has expired. Please log in again.',
      severity: 'warning',
      action: 'Log In',
    };
  }

  if (status === 403) {
    return {
      title: 'Permission Denied',
      message: `You don't have permission to ${operation} this ${resource}.`,
      severity: 'warning',
      action: 'Contact Admin',
    };
  }

  if (status === 404) {
    return {
      title: 'Not Found',
      message: `${resource.charAt(0).toUpperCase() + resource.slice(1)} not found. It may have been deleted.`,
      severity: 'info',
      action: 'Refresh',
    };
  }

  if (status === 408) {
    return {
      title: 'Request Timeout',
      message: 'The request took too long. Please try again.',
      severity: 'warning',
      action: 'Retry',
    };
  }

  if (status === 409) {
    return {
      title: 'Conflict',
      message: error.message || 'This operation conflicts with existing data.',
      severity: 'warning',
      action: 'Refresh',
    };
  }

  if (status === 422) {
    return {
      title: 'Validation Error',
      message: error.message || 'Please check your input and try again.',
      severity: 'warning',
      action: 'Fix Input',
    };
  }

  if (status === 429) {
    return {
      title: 'Too Many Requests',
      message: 'You are making too many requests. Please wait a moment and try again.',
      severity: 'warning',
      action: 'Wait',
    };
  }

  if (status >= 500) {
    return {
      title: 'Server Error',
      message: 'A server error occurred. Our team has been notified. Please try again later.',
      severity: 'error',
      action: 'Retry Later',
    };
  }

  // Retry error with attempt count
  if (error.name === 'RetryError') {
    return {
      title: 'Operation Failed',
      message: `Failed after ${error.attempts} attempts. ${error.lastError?.message || 'Please try again.'}`,
      severity: 'error',
      action: 'Retry',
    };
  }

  // Validation errors
  if (error.name === 'ValidationError' || error.errors) {
    const validationMessage = Array.isArray(error.errors)
      ? error.errors.join(', ')
      : error.message;

    return {
      title: 'Validation Error',
      message: validationMessage || 'Please check your input.',
      severity: 'warning',
      action: 'Fix Input',
    };
  }

  // Generic fallback
  return {
    title: 'Error',
    message: error.message || 'An unexpected error occurred. Please try again.',
    severity: 'error',
    action: 'Retry',
  };
}

/**
 * Operation-specific error messages
 */
export const operationErrors = {
  create: (resource: string) => ({
    title: 'Creation Failed',
    message: `Failed to create ${resource}. Please try again.`,
  }),
  update: (resource: string) => ({
    title: 'Update Failed',
    message: `Failed to update ${resource}. Please try again.`,
  }),
  delete: (resource: string) => ({
    title: 'Deletion Failed',
    message: `Failed to delete ${resource}. Please try again.`,
  }),
  fetch: (resource: string) => ({
    title: 'Loading Failed',
    message: `Failed to load ${resource}. Please try again.`,
  }),
  reorder: (resource: string) => ({
    title: 'Reorder Failed',
    message: `Failed to reorder ${resource}. Changes have been reverted.`,
  }),
  toggle: (resource: string) => ({
    title: 'Toggle Failed',
    message: `Failed to toggle ${resource}. Please try again.`,
  }),
};
