import { z } from 'zod';
export declare const createAreaSchema: z.ZodObject<{
    name: z.ZodString;
    entityIds: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    isEnabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export declare const updateAreaSchema: z.ZodObject<{
    name: z.ZodString;
    entityIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    isEnabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const patchAreaSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    entityIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    isEnabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const toggleAreaSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
}, z.core.$strip>;
export declare const reorderEntitiesSchema: z.ZodObject<{
    entityIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const areaIdParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const createDashboardSchema: z.ZodObject<{
    name: z.ZodString;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    isDefault: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export declare const updateDashboardSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    isDefault: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const dashboardIdParamSchema: z.ZodObject<{
    dashboard_id: z.ZodString;
}, z.core.$strip>;
export declare const loginSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const haConfigSchema: z.ZodObject<{
    url: z.ZodString;
    token: z.ZodString;
}, z.core.$strip>;
export declare const createClientSchema: z.ZodObject<{
    name: z.ZodString;
    device_type: z.ZodOptional<z.ZodEnum<{
        mobile: "mobile";
        desktop: "desktop";
        tablet: "tablet";
        other: "other";
    }>>;
    platform: z.ZodOptional<z.ZodString>;
    isActive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export declare const updateClientSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    device_type: z.ZodOptional<z.ZodEnum<{
        mobile: "mobile";
        desktop: "desktop";
        tablet: "tablet";
        other: "other";
    }>>;
    platform: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const clientIdParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const pairingCreateSchema: z.ZodObject<{
    clientName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const pairingVerifySchema: z.ZodObject<{
    pin: z.ZodString;
    sessionId: z.ZodString;
}, z.core.$strip>;
export declare const areasQuerySchema: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodEnum<{
        true: "true";
        false: "false";
    }>>;
}, z.core.$strip>;
export declare const paginationQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    offset: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
}, z.core.$strip>;
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
//# sourceMappingURL=schemas.d.ts.map