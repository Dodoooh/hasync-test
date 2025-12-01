/**
 * Request Validation Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../types';

export const validatePairingRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { pin, device_name, device_type, public_key } = req.body;

  if (!pin || typeof pin !== 'string' || pin.length !== 6) {
    throw new ValidationError('PIN must be a 6-digit string');
  }

  if (!device_name || typeof device_name !== 'string' || device_name.trim().length === 0) {
    throw new ValidationError('Device name is required');
  }

  if (!device_type || typeof device_type !== 'string') {
    throw new ValidationError('Device type is required');
  }

  if (!public_key || typeof public_key !== 'string') {
    throw new ValidationError('Public key is required');
  }

  next();
};

export const validateServiceCall = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { domain, service } = req.body;

  if (!domain || typeof domain !== 'string') {
    throw new ValidationError('Service domain is required');
  }

  if (!service || typeof service !== 'string') {
    throw new ValidationError('Service name is required');
  }

  next();
};

export const validateEntityId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { entity_id } = req.params;

  if (!entity_id || !entity_id.includes('.')) {
    throw new ValidationError('Invalid entity ID format');
  }

  next();
};
