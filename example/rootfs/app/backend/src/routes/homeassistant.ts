/**
 * Home Assistant Proxy Routes
 */

import { Router } from 'express';
import { HomeAssistantService } from '../services/homeassistant';
import { AuthMiddleware } from '../middleware/auth';
import { validateServiceCall, validateEntityId } from '../middleware/validation';
import { ApiResponse } from '../types';

export function createHomeAssistantRouter(
  haService: HomeAssistantService,
  authMiddleware: AuthMiddleware
): Router {
  const router = Router();

  // Apply authentication to all HA routes
  router.use(authMiddleware.authenticate);

  /**
   * GET /api/ha/states
   * Get all entity states
   */
  router.get('/states', async (req, res, next) => {
    try {
      const states = await haService.getStates();

      const response: ApiResponse = {
        success: true,
        data: states,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/ha/states/:entity_id
   * Get specific entity state
   */
  router.get('/states/:entity_id', validateEntityId, async (req, res, next) => {
    try {
      const state = await haService.getState(req.params.entity_id);

      const response: ApiResponse = {
        success: true,
        data: state,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/ha/areas
   * Get all areas
   */
  router.get('/areas', async (req, res, next) => {
    try {
      const areas = await haService.getAreas();

      const response: ApiResponse = {
        success: true,
        data: areas,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/ha/areas/:area_id/entities
   * Get entities in an area
   */
  router.get('/areas/:area_id/entities', async (req, res, next) => {
    try {
      const entities = await haService.getEntitiesByArea(req.params.area_id);

      const response: ApiResponse = {
        success: true,
        data: entities,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/ha/dashboards
   * Get all dashboards
   */
  router.get('/dashboards', async (req, res, next) => {
    try {
      const dashboards = await haService.getDashboards();

      const response: ApiResponse = {
        success: true,
        data: dashboards,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/ha/config
   * Get Home Assistant configuration
   */
  router.get('/config', async (req, res, next) => {
    try {
      const config = await haService.getConfig();

      const response: ApiResponse = {
        success: true,
        data: config,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/ha/services
   * Get available services
   */
  router.get('/services', async (req, res, next) => {
    try {
      const services = await haService.getServices();

      const response: ApiResponse = {
        success: true,
        data: services,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/ha/services/call
   * Call a Home Assistant service
   */
  router.post('/services/call', validateServiceCall, async (req, res, next) => {
    try {
      const { domain, service, service_data, target } = req.body;
      const result = await haService.callService(domain, service, service_data, target);

      const response: ApiResponse = {
        success: true,
        data: result,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
