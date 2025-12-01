import { z } from 'zod';

export const AuthSchema = z.object({
  ingressUrl: z.string().url('Invalid URL format'),
  accessToken: z.string().min(10, 'Access token must be at least 10 characters'),
});

// Enhanced area name validation
const areaNameRegex = /^[a-zA-Z0-9\s\-]+$/;

export const AreaSchema = z.object({
  name: z.string()
    .min(2, 'Area name must be at least 2 characters')
    .max(50, 'Area name cannot exceed 50 characters')
    .regex(areaNameRegex, 'Area name can only contain letters, numbers, spaces, and hyphens')
    .transform(val => val.trim()),
  entityIds: z.array(z.string())
    .min(1, 'At least one entity is required')
    .default([]),
});

export const ClientSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(50, 'Client name too long'),
  deviceType: z.enum(['phone', 'tablet', 'desktop']),
  assignedAreas: z.array(z.string()).default([]),
  assignedDashboard: z.string().optional(),
});

export type AuthFormData = z.infer<typeof AuthSchema>;
export type AreaFormData = z.infer<typeof AreaSchema>;
export type ClientFormData = z.infer<typeof ClientSchema>;

/**
 * Real-time validation helpers
 */
export const validateAreaName = (name: string): string | null => {
  if (!name || name.trim().length === 0) {
    return 'Area name is required';
  }
  if (name.trim().length < 2) {
    return 'Area name must be at least 2 characters';
  }
  if (name.length > 50) {
    return 'Area name cannot exceed 50 characters';
  }
  if (!areaNameRegex.test(name)) {
    return 'Area name can only contain letters, numbers, spaces, and hyphens';
  }
  return null;
};

export const validateEntityIds = (entityIds: string[]): string | null => {
  if (!entityIds || entityIds.length === 0) {
    return 'At least one entity is required';
  }
  return null;
};

/**
 * Check for duplicate entity in area
 */
export const hasDuplicateEntity = (
  entityIds: string[],
  newEntityId: string
): boolean => {
  return entityIds.includes(newEntityId);
};
