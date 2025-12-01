"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageSchema = exports.configUpdateSchema = exports.pairingSchema = exports.entityUpdateSchema = exports.subscribeSchema = void 0;
exports.validateSubscribe = validateSubscribe;
exports.validateEntityUpdate = validateEntityUpdate;
exports.validatePairing = validatePairing;
exports.validateConfigUpdate = validateConfigUpdate;
exports.validateMessage = validateMessage;
exports.sanitizeString = sanitizeString;
exports.validateRoomName = validateRoomName;
const zod_1 = require("zod");
exports.subscribeSchema = zod_1.z.object({
    type: zod_1.z.enum(['entities', 'areas', 'dashboards', 'clients']),
    id: zod_1.z.string().optional(),
});
exports.entityUpdateSchema = zod_1.z.object({
    entityId: zod_1.z.string().min(1),
    state: zod_1.z.string(),
    attributes: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
});
exports.pairingSchema = zod_1.z.object({
    pin: zod_1.z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
    clientId: zod_1.z.string().min(1),
});
exports.configUpdateSchema = zod_1.z.object({
    key: zod_1.z.string().min(1),
    value: zod_1.z.any(),
});
exports.messageSchema = zod_1.z.object({
    type: zod_1.z.string().min(1),
    payload: zod_1.z.any(),
    timestamp: zod_1.z.number().optional(),
});
function validateSubscribe(data) {
    return exports.subscribeSchema.parse(data);
}
function validateEntityUpdate(data) {
    return exports.entityUpdateSchema.parse(data);
}
function validatePairing(data) {
    return exports.pairingSchema.parse(data);
}
function validateConfigUpdate(data) {
    return exports.configUpdateSchema.parse(data);
}
function validateMessage(data) {
    return exports.messageSchema.parse(data);
}
function sanitizeString(input) {
    return input
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim();
}
function validateRoomName(room) {
    const sanitized = sanitizeString(room);
    if (sanitized.length === 0 || sanitized.length > 100) {
        throw new Error('Invalid room name length');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
        throw new Error('Invalid room name format. Use only alphanumeric, underscore, and hyphen.');
    }
    return sanitized;
}
//# sourceMappingURL=socketValidation.js.map