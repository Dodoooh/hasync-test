import { z } from 'zod';
export declare const subscribeSchema: z.ZodObject<{
    type: z.ZodEnum<{
        entities: "entities";
        areas: "areas";
        dashboards: "dashboards";
        clients: "clients";
    }>;
    id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const entityUpdateSchema: z.ZodObject<{
    entityId: z.ZodString;
    state: z.ZodString;
    attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strip>;
export declare const pairingSchema: z.ZodObject<{
    pin: z.ZodString;
    clientId: z.ZodString;
}, z.core.$strip>;
export declare const configUpdateSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodAny;
}, z.core.$strip>;
export declare const messageSchema: z.ZodObject<{
    type: z.ZodString;
    payload: z.ZodAny;
    timestamp: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare function validateSubscribe(data: unknown): z.infer<typeof subscribeSchema>;
export declare function validateEntityUpdate(data: unknown): z.infer<typeof entityUpdateSchema>;
export declare function validatePairing(data: unknown): z.infer<typeof pairingSchema>;
export declare function validateConfigUpdate(data: unknown): z.infer<typeof configUpdateSchema>;
export declare function validateMessage(data: unknown): z.infer<typeof messageSchema>;
export declare function sanitizeString(input: string): string;
export declare function validateRoomName(room: string): string;
//# sourceMappingURL=socketValidation.d.ts.map