/**
 * Client Management Routes
 */

import { Router } from 'express';
import { PairingService } from '../services/pairing';
import { AuthMiddleware } from '../middleware/auth';
import { ApiResponse, NotFoundError } from '../types';

export function createClientsRouter(
  pairingService: PairingService,
  authMiddleware: AuthMiddleware
): Router {
  const router = Router();

  /**
   * GET /api/clients
   * List all paired clients
   */
  router.get('/', (req, res) => {
    const activeOnly = req.query.active !== 'false';
    const clients = pairingService.getAllClients(activeOnly);

    const response: ApiResponse = {
      success: true,
      data: clients,
      timestamp: Date.now()
    };

    res.json(response);
  });

  /**
   * GET /api/clients/:id
   * Get client by ID
   */
  router.get('/:id', (req, res, next) => {
    try {
      const client = pairingService.getClient(req.params.id);
      if (!client) {
        throw new NotFoundError('Client not found');
      }

      const response: ApiResponse = {
        success: true,
        data: client,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/clients/:id
   * Delete a client
   */
  router.delete('/:id', (req, res, next) => {
    try {
      const success = pairingService.deleteClient(req.params.id);
      if (!success) {
        throw new NotFoundError('Client not found');
      }

      const response: ApiResponse = {
        success: true,
        data: { deleted: true },
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/clients/:id/revoke
   * Revoke client access
   */
  router.post('/:id/revoke', (req, res, next) => {
    try {
      const success = pairingService.revokeClient(req.params.id);
      if (!success) {
        throw new NotFoundError('Client not found');
      }

      const response: ApiResponse = {
        success: true,
        data: { revoked: true },
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
