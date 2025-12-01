/**
 * Zod Validation Schemas
 * Comprehensive input validation for all API endpoints
 */

import { z } from 'zod';

// Entity ID regex - alphanumeric, dots, underscores, hyphens only
const ENTITY_ID_REGEX = /^[a-zA-Z0-9._-]+$/;
// Safe string regex - alphanumeric, spaces, underscores, hyphens only
const SAFE_STRING_REGEX = /^[a-zA-Z0-9\s_-]+$/;
// URL regex - basic URL validation
const URL_REGEX = /^https?:\/\/[a-zA-Z0-9.-]+(:[0-9]+)?(\/.*)?$/;
// Pin regex - 6 digit numeric
const PIN_REGEX = /^\d{6}$/;

/**
 * Area Schemas
 */
export const createAreaSchema = z.object({
  name: z.string()
    .min(1, 'Area name is required')
    .max(100, 'Area name must be less than 100 characters')
    .regex(SAFE_STRING_REGEX, 'Area name contains invalid characters'),
  entityIds: z.array(
    z.string().regex(ENTITY_ID_REGEX, 'Invalid entity ID format')
  ).optional().default([]),
  isEnabled: z.boolean().optional().default(true)
});

export const updateAreaSchema = z.object({
  name: z.string()
    .min(1, 'Area name is required')
    .max(100, 'Area name must be less than 100 characters')
    .regex(SAFE_STRING_REGEX, 'Area name contains invalid characters'),
  entityIds: z.array(
    z.string().regex(ENTITY_ID_REGEX, 'Invalid entity ID format')
  ).optional(),
  isEnabled: z.boolean().optional()
});

export const patchAreaSchema = z.object({
  name: z.string()
    .min(1)
    .max(100)
    .regex(SAFE_STRING_REGEX, 'Area name contains invalid characters')
    .optional(),
  entityIds: z.array(
    z.string().regex(ENTITY_ID_REGEX, 'Invalid entity ID format')
  ).optional(),
  isEnabled: z.boolean().optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  'At least one field must be provided for update'
);

export const toggleAreaSchema = z.object({
  enabled: z.boolean()
});

export const reorderEntitiesSchema = z.object({
  entityIds: z.array(
    z.string().regex(ENTITY_ID_REGEX, 'Invalid entity ID format')
  ).min(1, 'Entity IDs array cannot be empty')
});

export const areaIdParamSchema = z.object({
  id: z.string()
    .min(1)
    .regex(/^area_\d+$/, 'Invalid area ID format')
});

/**
 * Dashboard Schemas
 */
export const createDashboardSchema = z.object({
  name: z.string()
    .min(1, 'Dashboard name is required')
    .max(100, 'Dashboard name must be less than 100 characters')
    .regex(SAFE_STRING_REGEX, 'Dashboard name contains invalid characters'),
  config: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional().default(false)
});

export const updateDashboardSchema = z.object({
  name: z.string()
    .min(1)
    .max(100)
    .regex(SAFE_STRING_REGEX, 'Dashboard name contains invalid characters')
    .optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional()
});

export const dashboardIdParamSchema = z.object({
  dashboard_id: z.string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid dashboard ID format')
});

/**
 * Authentication Schemas
 */
export const loginSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username contains invalid characters'),
  password: z.string()
    .min(1, 'Password is required')
    .max(200, 'Password too long')
    // Don't regex validate password - allow any characters for flexibility
});

/**
 * Home Assistant Config Schemas
 */
export const haConfigSchema = z.object({
  url: z.string()
    .url('Invalid URL format')
    .regex(URL_REGEX, 'URL must be HTTP or HTTPS')
    .max(500, 'URL too long'),
  token: z.string()
    .min(1, 'Token is required')
    .max(500, 'Token too long')
    // Token can contain any characters, so no regex validation
});

/**
 * Client Schemas
 */
export const createClientSchema = z.object({
  name: z.string()
    .min(1, 'Client name is required')
    .max(100, 'Client name must be less than 100 characters')
    .regex(SAFE_STRING_REGEX, 'Client name contains invalid characters'),
  device_type: z.enum(['mobile', 'desktop', 'tablet', 'other']).optional(),
  platform: z.string()
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid platform format')
    .optional(),
  isActive: z.boolean().optional().default(true)
});

export const updateClientSchema = z.object({
  name: z.string()
    .min(1)
    .max(100)
    .regex(SAFE_STRING_REGEX, 'Client name contains invalid characters')
    .optional(),
  device_type: z.enum(['mobile', 'desktop', 'tablet', 'other']).optional(),
  platform: z.string()
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid platform format')
    .optional(),
  isActive: z.boolean().optional()
});

export const clientIdParamSchema = z.object({
  id: z.string()
    .min(1)
    .regex(/^client_\d+$/, 'Invalid client ID format')
});

/**
 * Pairing Schemas
 */
export const pairingCreateSchema = z.object({
  clientName: z.string()
    .max(100)
    .regex(SAFE_STRING_REGEX, 'Client name contains invalid characters')
    .optional()
});

export const pairingVerifySchema = z.object({
  pin: z.string()
    .regex(PIN_REGEX, 'PIN must be 6 digits'),
  sessionId: z.string()
    .min(1)
    .max(100)
    .regex(/^pairing_\d+$/, 'Invalid session ID format')
});

/**
 * Query Parameter Schemas
 */
export const areasQuerySchema = z.object({
  enabled: z.enum(['true', 'false']).optional()
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0)
});

/**
 * Type exports for use in controllers
 */
export type CreateAreaInput = z.infer<typeof createAreaSchema>;
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>;
export type PatchAreaInput = z.infer<typeof patchAreaSchema>;
export type ToggleAreaInput = z.infer<typeof toggleAreaSchema>;
export type ReorderEntitiesInput = z.infer<typeof reorderEntitiesSchema>;
export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;
export type UpdateDashboardInput = z.infer<typeof updateDashboardSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type HAConfigInput = z.infer<typeof haConfigSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type PairingCreateInput = z.infer<typeof pairingCreateSchema>;
export type PairingVerifyInput = z.infer<typeof pairingVerifySchema>;
