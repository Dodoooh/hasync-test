"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthRouter = createHealthRouter;
const express_1 = require("express");
function createHealthRouter(db, haService) {
    const router = (0, express_1.Router)();
    router.get('/', (req, res) => {
        const response = {
            success: true,
            data: {
                status: 'healthy',
                uptime: process.uptime(),
                timestamp: Date.now()
            },
            timestamp: Date.now()
        };
        res.json(response);
    });
    router.get('/detailed', async (req, res) => {
        const dbHealthy = db.healthCheck();
        const haConnected = haService.isConnected();
        const response = {
            success: dbHealthy && haConnected,
            data: {
                status: dbHealthy && haConnected ? 'healthy' : 'degraded',
                components: {
                    database: dbHealthy ? 'healthy' : 'unhealthy',
                    homeAssistant: haConnected ? 'connected' : 'disconnected'
                },
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: Date.now()
            },
            timestamp: Date.now()
        };
        res.status(response.success ? 200 : 503).json(response);
    });
    return router;
}
//# sourceMappingURL=health.js.map