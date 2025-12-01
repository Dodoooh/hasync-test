"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthRouter = createAuthRouter;
const express_1 = require("express");
const cookieAuth_1 = require("../middleware/cookieAuth");
function createAuthRouter(pairingService) {
    const router = (0, express_1.Router)();
    router.post('/login', async (req, res) => {
        try {
            const { ingressUrl, token } = req.body;
            if (!ingressUrl || !token) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    code: 'VALIDATION_ERROR',
                });
                return;
            }
            const clientId = `session_${Date.now()}`;
            (0, cookieAuth_1.setAuthCookies)(res, clientId);
            const response = {
                success: true,
                data: {
                    authenticated: true,
                    clientId,
                    message: 'Authentication successful',
                },
                timestamp: Date.now(),
            };
            res.json(response);
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Login failed',
                code: 'LOGIN_FAILED',
            });
        }
    });
    router.post('/logout', (req, res) => {
        (0, cookieAuth_1.clearAuthCookies)(res);
        const response = {
            success: true,
            data: {
                message: 'Logged out successfully',
            },
            timestamp: Date.now(),
        };
        res.json(response);
    });
    router.post('/refresh', cookieAuth_1.refreshTokenMiddleware, (req, res) => {
        try {
            if (!req.clientId) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid refresh token',
                    code: 'INVALID_REFRESH_TOKEN',
                });
                return;
            }
            (0, cookieAuth_1.setAuthCookies)(res, req.clientId);
            const response = {
                success: true,
                data: {
                    message: 'Token refreshed successfully',
                },
                timestamp: Date.now(),
            };
            res.json(response);
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Token refresh failed',
                code: 'REFRESH_FAILED',
            });
        }
    });
    router.get('/status', cookieAuth_1.authenticateWithCookie, (req, res) => {
        const response = {
            success: true,
            data: {
                authenticated: true,
                clientId: req.clientId,
            },
            timestamp: Date.now(),
        };
        res.json(response);
    });
    return router;
}
//# sourceMappingURL=auth.js.map