"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationQuerySchema = exports.areasQuerySchema = exports.pairingVerifySchema = exports.pairingCreateSchema = exports.clientIdParamSchema = exports.updateClientSchema = exports.createClientSchema = exports.haConfigSchema = exports.loginSchema = exports.dashboardIdParamSchema = exports.updateDashboardSchema = exports.createDashboardSchema = exports.areaIdParamSchema = exports.reorderEntitiesSchema = exports.toggleAreaSchema = exports.patchAreaSchema = exports.updateAreaSchema = exports.createAreaSchema = void 0;
const zod_1 = require("zod");
const ENTITY_ID_REGEX = /^[a-zA-Z0-9._-]+$/;
const SAFE_STRING_REGEX = /^[a-zA-Z0-9\s_-]+$/;
const URL_REGEX = /^https?:\/\/[a-zA-Z0-9.-]+(:[0-9]+)?(\/.*)?$/;
const PIN_REGEX = /^\d{6}$/;
exports.createAreaSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(1, 'Area name is required')
        .max(100, 'Area name must be less than 100 characters')
        .regex(SAFE_STRING_REGEX, 'Area name contains invalid characters'),
    entityIds: zod_1.z.array(zod_1.z.string().regex(ENTITY_ID_REGEX, 'Invalid entity ID format')).optional().default([]),
    isEnabled: zod_1.z.boolean().optional().default(true)
});
exports.updateAreaSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(1, 'Area name is required')
        .max(100, 'Area name must be less than 100 characters')
        .regex(SAFE_STRING_REGEX, 'Area name contains invalid characters'),
    entityIds: zod_1.z.array(zod_1.z.string().regex(ENTITY_ID_REGEX, 'Invalid entity ID format')).optional(),
    isEnabled: zod_1.z.boolean().optional()
});
exports.patchAreaSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(1)
        .max(100)
        .regex(SAFE_STRING_REGEX, 'Area name contains invalid characters')
        .optional(),
    entityIds: zod_1.z.array(zod_1.z.string().regex(ENTITY_ID_REGEX, 'Invalid entity ID format')).optional(),
    isEnabled: zod_1.z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');
exports.toggleAreaSchema = zod_1.z.object({
    enabled: zod_1.z.boolean()
});
exports.reorderEntitiesSchema = zod_1.z.object({
    entityIds: zod_1.z.array(zod_1.z.string().regex(ENTITY_ID_REGEX, 'Invalid entity ID format')).min(1, 'Entity IDs array cannot be empty')
});
exports.areaIdParamSchema = zod_1.z.object({
    id: zod_1.z.string()
        .min(1)
        .regex(/^area_\d+$/, 'Invalid area ID format')
});
exports.createDashboardSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(1, 'Dashboard name is required')
        .max(100, 'Dashboard name must be less than 100 characters')
        .regex(SAFE_STRING_REGEX, 'Dashboard name contains invalid characters'),
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    isDefault: zod_1.z.boolean().optional().default(false)
});
exports.updateDashboardSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(1)
        .max(100)
        .regex(SAFE_STRING_REGEX, 'Dashboard name contains invalid characters')
        .optional(),
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    isDefault: zod_1.z.boolean().optional()
});
exports.dashboardIdParamSchema = zod_1.z.object({
    dashboard_id: zod_1.z.string()
        .min(1)
        .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid dashboard ID format')
});
exports.loginSchema = zod_1.z.object({
    username: zod_1.z.string()
        .min(1, 'Username is required')
        .max(50, 'Username must be less than 50 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Username contains invalid characters'),
    password: zod_1.z.string()
        .min(1, 'Password is required')
        .max(200, 'Password too long')
});
exports.haConfigSchema = zod_1.z.object({
    url: zod_1.z.string()
        .url('Invalid URL format')
        .regex(URL_REGEX, 'URL must be HTTP or HTTPS')
        .max(500, 'URL too long'),
    token: zod_1.z.string()
        .min(1, 'Token is required')
        .max(500, 'Token too long')
});
exports.createClientSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(1, 'Client name is required')
        .max(100, 'Client name must be less than 100 characters')
        .regex(SAFE_STRING_REGEX, 'Client name contains invalid characters'),
    device_type: zod_1.z.enum(['mobile', 'desktop', 'tablet', 'other']).optional(),
    platform: zod_1.z.string()
        .max(50)
        .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid platform format')
        .optional(),
    isActive: zod_1.z.boolean().optional().default(true)
});
exports.updateClientSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(1)
        .max(100)
        .regex(SAFE_STRING_REGEX, 'Client name contains invalid characters')
        .optional(),
    device_type: zod_1.z.enum(['mobile', 'desktop', 'tablet', 'other']).optional(),
    platform: zod_1.z.string()
        .max(50)
        .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid platform format')
        .optional(),
    isActive: zod_1.z.boolean().optional()
});
exports.clientIdParamSchema = zod_1.z.object({
    id: zod_1.z.string()
        .min(1)
        .regex(/^client_\d+$/, 'Invalid client ID format')
});
exports.pairingCreateSchema = zod_1.z.object({
    clientName: zod_1.z.string()
        .max(100)
        .regex(SAFE_STRING_REGEX, 'Client name contains invalid characters')
        .optional()
});
exports.pairingVerifySchema = zod_1.z.object({
    pin: zod_1.z.string()
        .regex(PIN_REGEX, 'PIN must be 6 digits'),
    sessionId: zod_1.z.string()
        .min(1)
        .max(100)
        .regex(/^pairing_\d+$/, 'Invalid session ID format')
});
exports.areasQuerySchema = zod_1.z.object({
    enabled: zod_1.z.enum(['true', 'false']).optional()
});
exports.paginationQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().min(1).max(100).optional().default(20),
    offset: zod_1.z.coerce.number().min(0).optional().default(0)
});
//# sourceMappingURL=schemas.js.map