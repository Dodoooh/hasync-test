/**
 * Cookie-based Authentication Utilities
 * Provides secure authentication using httpOnly cookies instead of localStorage
 */

/**
 * Check if user is authenticated by checking for auth cookie
 * This is a client-side check only - server validates the actual token
 */
export function isAuthenticated(): boolean {
  // Check if auth cookie exists (we can't read httpOnly cookies, but we can check if requests succeed)
  // The actual authentication is verified by the server
  return document.cookie.includes('auth_session=');
}

/**
 * Clear authentication cookies
 * Called on logout - instructs server to clear the httpOnly cookies
 */
export async function clearAuthCookies(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include', // Include cookies in request
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to clear auth cookies:', error);
  }
}

/**
 * Refresh authentication token
 * Called periodically to maintain session
 */
export async function refreshAuthToken(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include', // Include cookies in request
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to refresh auth token:', error);
    return false;
  }
}

/**
 * Check authentication status with server
 * Verifies that the httpOnly cookie is still valid
 */
export async function checkAuthStatus(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/status', {
      method: 'GET',
      credentials: 'include', // Include cookies in request
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.authenticated === true;
  } catch (error) {
    console.error('Failed to check auth status:', error);
    return false;
  }
}

/**
 * Setup automatic token refresh
 * Refreshes the token before it expires
 */
export function setupTokenRefresh(interval: number = 14 * 60 * 1000): () => void {
  // Refresh every 14 minutes (tokens expire after 15 minutes)
  const intervalId = setInterval(async () => {
    const success = await refreshAuthToken();
    if (!success) {
      console.warn('Token refresh failed - user may need to re-authenticate');
      clearInterval(intervalId);
    }
  }, interval);

  // Return cleanup function
  return () => clearInterval(intervalId);
}

/**
 * Cookie utility to check if a specific cookie exists (for non-httpOnly cookies only)
 */
export function cookieExists(name: string): boolean {
  return document.cookie.split(';').some((cookie) => {
    return cookie.trim().startsWith(`${name}=`);
  });
}

/**
 * Get CSRF token from cookie (if implemented)
 */
export function getCSRFToken(): string | null {
  const match = document.cookie.match(/csrfToken=([^;]+)/);
  return match ? match[1] : null;
}
