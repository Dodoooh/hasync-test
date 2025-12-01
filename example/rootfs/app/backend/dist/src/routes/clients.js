"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClientsRouter = createClientsRouter;
const express_1 = require("express");
const types_1 = require("../types");
function createClientsRouter(pairingService, authMiddleware) {
    const router = (0, express_1.Router)();
    router.get('/', (req, res) => {
        const activeOnly = req.query.active !== 'false';
        const clients = pairingService.getAllClients(activeOnly);
        const response = {
            success: true,
            data: clients,
            timestamp: Date.now()
        };
        res.json(response);
    });
    router.get('/:id', (req, res, next) => {
        try {
            const client = pairingService.getClient(req.params.id);
            if (!client) {
                throw new types_1.NotFoundError('Client not found');
            }
            const response = {
                success: true,
                data: client,
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    router.delete('/:id', (req, res, next) => {
        try {
            const success = pairingService.deleteClient(req.params.id);
            if (!success) {
                throw new types_1.NotFoundError('Client not found');
            }
            const response = {
                success: true,
                data: { deleted: true },
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    router.post('/:id/revoke', (req, res, next) => {
        try {
            const success = pairingService.revokeClient(req.params.id);
            if (!success) {
                throw new types_1.NotFoundError('Client not found');
            }
            const response = {
                success: true,
                data: { revoked: true },
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
//# sourceMappingURL=clients.js.map