"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEntityId = exports.validateServiceCall = exports.validatePairingRequest = void 0;
const types_1 = require("../types");
const validatePairingRequest = (req, res, next) => {
    const { pin, device_name, device_type, public_key } = req.body;
    if (!pin || typeof pin !== 'string' || pin.length !== 6) {
        throw new types_1.ValidationError('PIN must be a 6-digit string');
    }
    if (!device_name || typeof device_name !== 'string' || device_name.trim().length === 0) {
        throw new types_1.ValidationError('Device name is required');
    }
    if (!device_type || typeof device_type !== 'string') {
        throw new types_1.ValidationError('Device type is required');
    }
    if (!public_key || typeof public_key !== 'string') {
        throw new types_1.ValidationError('Public key is required');
    }
    next();
};
exports.validatePairingRequest = validatePairingRequest;
const validateServiceCall = (req, res, next) => {
    const { domain, service } = req.body;
    if (!domain || typeof domain !== 'string') {
        throw new types_1.ValidationError('Service domain is required');
    }
    if (!service || typeof service !== 'string') {
        throw new types_1.ValidationError('Service name is required');
    }
    next();
};
exports.validateServiceCall = validateServiceCall;
const validateEntityId = (req, res, next) => {
    const { entity_id } = req.params;
    if (!entity_id || !entity_id.includes('.')) {
        throw new types_1.ValidationError('Invalid entity ID format');
    }
    next();
};
exports.validateEntityId = validateEntityId;
//# sourceMappingURL=validation.js.map