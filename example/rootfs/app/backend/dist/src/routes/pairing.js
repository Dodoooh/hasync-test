"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPairingRouter = createPairingRouter;
const express_1 = require("express");
const validation_1 = require("../middleware/validation");
function createPairingRouter(pairingService) {
    const router = (0, express_1.Router)();
    router.get('/pin', (req, res) => {
        const session = pairingService.generatePairingPin();
        const response = {
            success: true,
            data: {
                pin: session.pin,
                expires_at: session.expires_at,
                expires_in: Math.floor((session.expires_at - Date.now()) / 1000)
            },
            timestamp: Date.now()
        };
        res.json(response);
    });
    router.post('/complete', validation_1.validatePairingRequest, async (req, res, next) => {
        try {
            const client = await pairingService.completePairing(req.body);
            const response = {
                success: true,
                data: {
                    client_id: client.id,
                    certificate: client.certificate,
                    paired_at: client.paired_at
                },
                timestamp: Date.now()
            };
            res.status(201).json(response);
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
//# sourceMappingURL=pairing.js.map