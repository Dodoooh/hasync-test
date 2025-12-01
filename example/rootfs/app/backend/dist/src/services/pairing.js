"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PairingService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const types_1 = require("../types");
class PairingService {
    db;
    static PIN_LENGTH = 6;
    static PIN_EXPIRY_MS = 5 * 60 * 1000;
    constructor(db) {
        this.db = db;
        setInterval(() => {
            const cleaned = this.db.cleanExpiredPairingSessions();
            if (cleaned > 0) {
                console.log(`Cleaned ${cleaned} expired pairing sessions`);
            }
        }, 60000);
    }
    generatePairingPin() {
        const pin = this.generateRandomPin();
        const expiresAt = Date.now() + PairingService.PIN_EXPIRY_MS;
        return this.db.createPairingSession(pin, expiresAt);
    }
    async completePairing(request) {
        const session = this.db.getPairingSession(request.pin);
        if (!session) {
            throw new types_1.ValidationError('Invalid or expired PIN');
        }
        if (Date.now() > session.expires_at) {
            throw new types_1.ValidationError('PIN has expired');
        }
        const existingClient = this.db.getClientByPublicKey(request.public_key);
        if (existingClient) {
            throw new types_1.ValidationError('Client already paired');
        }
        const certificate = this.generateCertificate(request.public_key);
        const client = this.db.createClient({
            name: request.device_name,
            device_type: request.device_type,
            public_key: request.public_key,
            certificate,
            paired_at: Date.now(),
            last_seen: Date.now(),
            is_active: true,
            metadata: {}
        });
        this.db.markPairingSessionUsed(request.pin);
        this.db.logActivity(client.id, 'pairing_completed', `Device: ${request.device_name}`);
        return client;
    }
    verifyClientCertificate(clientId, certificate) {
        const client = this.db.getClient(clientId);
        if (!client || !client.is_active) {
            return false;
        }
        return crypto_1.default.timingSafeEqual(Buffer.from(client.certificate), Buffer.from(certificate));
    }
    revokeClient(clientId) {
        const success = this.db.updateClient(clientId, { is_active: false });
        if (success) {
            this.db.logActivity(clientId, 'client_revoked', 'Access revoked by admin');
        }
        return success;
    }
    updateClientActivity(clientId) {
        this.db.updateClient(clientId, { last_seen: Date.now() });
    }
    getAllClients(activeOnly = true) {
        return this.db.getAllClients(activeOnly);
    }
    getClient(clientId) {
        return this.db.getClient(clientId);
    }
    deleteClient(clientId) {
        const client = this.db.getClient(clientId);
        if (!client) {
            return false;
        }
        const success = this.db.deleteClient(clientId);
        if (success) {
            this.db.logActivity(clientId, 'client_deleted', `Client: ${client.name}`);
        }
        return success;
    }
    generateRandomPin() {
        let pin = '';
        for (let i = 0; i < PairingService.PIN_LENGTH; i++) {
            pin += Math.floor(Math.random() * 10);
        }
        return pin;
    }
    generateCertificate(publicKey) {
        const hash = crypto_1.default.createHash('sha256');
        hash.update(publicKey);
        hash.update(Date.now().toString());
        hash.update(crypto_1.default.randomBytes(32));
        return hash.digest('hex');
    }
}
exports.PairingService = PairingService;
//# sourceMappingURL=pairing.js.map