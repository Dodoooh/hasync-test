/**
 * Pairing Routes
 */

import { Router } from 'express';
import { PairingService } from '../services/pairing';
import { validatePairingRequest } from '../middleware/validation';
import { ApiResponse } from '../types';

export function createPairingRouter(pairingService: PairingService): Router {
  const router = Router();

  /**
   * GET /api/pairing/pin
   * Generate a new pairing PIN
   */
  router.get('/pin', (req, res) => {
    const session = pairingService.generatePairingPin();

    const response: ApiResponse = {
      success: true,
      data: {
        pin: session.pin,
        expires_at: session.expires_at,
        expires_in: Math.floor((session.expires_at - Date.now()) / 1000)
      },
      timestamp: Date.now()
    };

    res.json(response);
  });

  /**
   * POST /api/pairing/complete
   * Complete pairing with PIN
   */
  router.post('/complete', validatePairingRequest, async (req, res, next) => {
    try {
      const client = await pairingService.completePairing(req.body);

      const response: ApiResponse = {
        success: true,
        data: {
          client_id: client.id,
          certificate: client.certificate,
          paired_at: client.paired_at
        },
        timestamp: Date.now()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
