/**
 * WebSocket Message Validation
 * Validates all incoming Socket.IO messages using Zod schemas
 */

import { z } from 'zod';

/**
 * Subscribe event validation schema
 */
export const subscribeSchema = z.object({
  type: z.enum(['entities', 'areas', 'dashboards', 'clients']),
  id: z.string().optional(),
});

/**
 * Entity update event validation schema
 */
export const entityUpdateSchema = z.object({
  entityId: z.string().min(1),
  state: z.string(),
  attributes: z.record(z.string(), z.any()).optional(),
});

/**
 * Pairing event validation schema
 */
export const pairingSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
  clientId: z.string().min(1),
});

/**
 * Config update event validation schema
 */
export const configUpdateSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
});

/**
 * Generic message validation
 */
export const messageSchema = z.object({
  type: z.string().min(1),
  payload: z.any(),
  timestamp: z.number().optional(),
});

/**
 * Validate subscribe event data
 */
export function validateSubscribe(data: unknown): z.infer<typeof subscribeSchema> {
  return subscribeSchema.parse(data);
}

/**
 * Validate entity update event data
 */
export function validateEntityUpdate(data: unknown): z.infer<typeof entityUpdateSchema> {
  return entityUpdateSchema.parse(data);
}

/**
 * Validate pairing event data
 */
export function validatePairing(data: unknown): z.infer<typeof pairingSchema> {
  return pairingSchema.parse(data);
}

/**
 * Validate config update event data
 */
export function validateConfigUpdate(data: unknown): z.infer<typeof configUpdateSchema> {
  return configUpdateSchema.parse(data);
}

/**
 * Validate generic message
 */
export function validateMessage(data: unknown): z.infer<typeof messageSchema> {
  return messageSchema.parse(data);
}

/**
 * Sanitize string input to prevent XSS
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove inline event handlers
    .trim();
}

/**
 * Validate and sanitize room name for Socket.IO
 */
export function validateRoomName(room: string): string {
  const sanitized = sanitizeString(room);

  if (sanitized.length === 0 || sanitized.length > 100) {
    throw new Error('Invalid room name length');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    throw new Error('Invalid room name format. Use only alphanumeric, underscore, and hyphen.');
  }

  return sanitized;
}
