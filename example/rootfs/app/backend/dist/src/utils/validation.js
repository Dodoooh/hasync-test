"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validator = void 0;
class Validator {
    static isValidEntityId(entityId) {
        return /^[a-z_]+\.[a-z0-9_]+$/.test(entityId);
    }
    static isValidPin(pin) {
        return /^\d{6}$/.test(pin);
    }
    static isValidClientId(clientId) {
        return /^\d+-[a-z0-9]+$/.test(clientId);
    }
    static sanitizeString(input, maxLength = 255) {
        return input
            .trim()
            .substring(0, maxLength)
            .replace(/[<>]/g, '');
    }
    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.Validator = Validator;
//# sourceMappingURL=validation.js.map