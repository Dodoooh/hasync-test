/**
 * Authentication Routes
 * Handles cookie-based authentication endpoints
 */

import { Router, Response } from 'express';
import { PairingService } from '../services/pairing';
import {
  AuthenticatedRequest,
  setAuthCookies,
  clearAuthCookies,
  authenticateWithCookie,
  refreshTokenMiddleware,
} from '../middleware/cookieAuth';
import { ApiResponse } from '../types';

export function createAuthRouter(pairingService: PairingService): Router {
  const router = Router();

  /**
   * POST /api/auth/login
   * Login with credentials and set httpOnly cookies
   */
  router.post('/login', async (req, res: Response) => {
    try {
      const { ingressUrl, token } = req.body;

      if (!ingressUrl || !token) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      // Verify credentials (this would normally validate against HA)
      // For now, we'll create a session-based client ID
      const clientId = `session_${Date.now()}`;

      // Set secure httpOnly cookies
      setAuthCookies(res, clientId);

      const response: ApiResponse = {
        success: true,
        data: {
          authenticated: true,
          clientId,
          message: 'Authentication successful',
        },
        timestamp: Date.now(),
      };

      res.json(response);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
        code: 'LOGIN_FAILED',
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Clear authentication cookies
   */
  router.post('/logout', (req, res: Response) => {
    clearAuthCookies(res);

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Logged out successfully',
      },
      timestamp: Date.now(),
    };

    res.json(response);
  });

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   */
  router.post('/refresh', refreshTokenMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.clientId) {
        res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        });
        return;
      }

      // Generate new access token
      setAuthCookies(res, req.clientId);

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Token refreshed successfully',
        },
        timestamp: Date.now(),
      };

      res.json(response);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
        code: 'REFRESH_FAILED',
      });
    }
  });

  /**
   * GET /api/auth/status
   * Check authentication status
   */
  router.get('/status', authenticateWithCookie, (req: AuthenticatedRequest, res: Response) => {
    const response: ApiResponse = {
      success: true,
      data: {
        authenticated: true,
        clientId: req.clientId,
      },
      timestamp: Date.now(),
    };

    res.json(response);
  });

  return router;
}
