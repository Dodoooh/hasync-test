import { z } from 'zod';
export declare const subscribeSchema: any;
export declare const entityUpdateSchema: any;
export declare const pairingSchema: any;
export declare const configUpdateSchema: any;
export declare const messageSchema: any;
export declare function validateSubscribe(data: unknown): z.infer<typeof subscribeSchema>;
export declare function validateEntityUpdate(data: unknown): z.infer<typeof entityUpdateSchema>;
export declare function validatePairing(data: unknown): z.infer<typeof pairingSchema>;
export declare function validateConfigUpdate(data: unknown): z.infer<typeof configUpdateSchema>;
export declare function validateMessage(data: unknown): z.infer<typeof messageSchema>;
export declare function sanitizeString(input: string): string;
export declare function validateRoomName(room: string): string;
//# sourceMappingURL=socketValidation.d.ts.map