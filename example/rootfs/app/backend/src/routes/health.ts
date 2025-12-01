/**
 * Health Check Routes
 */

import { Router } from 'express';
import { DatabaseService } from '../database';
import { HomeAssistantService } from '../services/homeassistant';
import { ApiResponse } from '../types';

export function createHealthRouter(
  db: DatabaseService,
  haService: HomeAssistantService
): Router {
  const router = Router();

  /**
   * GET /api/health
   * Basic health check
   */
  router.get('/', (req, res) => {
    const response: ApiResponse = {
      success: true,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };

    res.json(response);
  });

  /**
   * GET /api/health/detailed
   * Detailed health check with dependencies
   */
  router.get('/detailed', async (req, res) => {
    const dbHealthy = db.healthCheck();
    const haConnected = haService.isConnected();

    const response: ApiResponse = {
      success: dbHealthy && haConnected,
      data: {
        status: dbHealthy && haConnected ? 'healthy' : 'degraded',
        components: {
          database: dbHealthy ? 'healthy' : 'unhealthy',
          homeAssistant: haConnected ? 'connected' : 'disconnected'
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };

    res.status(response.success ? 200 : 503).json(response);
  });

  return router;
}
