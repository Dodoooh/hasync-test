"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHomeAssistantRouter = createHomeAssistantRouter;
const express_1 = require("express");
const validation_1 = require("../middleware/validation");
function createHomeAssistantRouter(haService, authMiddleware) {
    const router = (0, express_1.Router)();
    router.use(authMiddleware.authenticate);
    router.get('/states', async (req, res, next) => {
        try {
            const states = await haService.getStates();
            const response = {
                success: true,
                data: states,
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/states/:entity_id', validation_1.validateEntityId, async (req, res, next) => {
        try {
            const state = await haService.getState(req.params.entity_id);
            const response = {
                success: true,
                data: state,
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/areas', async (req, res, next) => {
        try {
            const areas = await haService.getAreas();
            const response = {
                success: true,
                data: areas,
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/areas/:area_id/entities', async (req, res, next) => {
        try {
            const entities = await haService.getEntitiesByArea(req.params.area_id);
            const response = {
                success: true,
                data: entities,
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/dashboards', async (req, res, next) => {
        try {
            const dashboards = await haService.getDashboards();
            const response = {
                success: true,
                data: dashboards,
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/config', async (req, res, next) => {
        try {
            const config = await haService.getConfig();
            const response = {
                success: true,
                data: config,
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/services', async (req, res, next) => {
        try {
            const services = await haService.getServices();
            const response = {
                success: true,
                data: services,
                timestamp: Date.now()
            };
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    });
    router.post('/services/call', validation_1.validateServiceCall, async (req, res, next) => {
        try {
            const { domain, service, service_data, target } = req.body;
            const result = await haService.callService(domain, service, service_data, target);
            const response = {
                success: true,
                data: result,
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
//# sourceMappingURL=homeassistant.js.map