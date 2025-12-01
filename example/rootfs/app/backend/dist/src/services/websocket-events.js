"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_TYPES = void 0;
exports.registerClientSocket = registerClientSocket;
exports.unregisterClientSocket = unregisterClientSocket;
exports.getClientSocket = getClientSocket;
exports.getConnectedClientCount = getConnectedClientCount;
exports.notifyClient = notifyClient;
exports.notifyClientsWithArea = notifyClientsWithArea;
exports.notifyAllClients = notifyAllClients;
exports.disconnectClient = disconnectClient;
exports.notifyAreaAdded = notifyAreaAdded;
exports.notifyAreaRemoved = notifyAreaRemoved;
exports.notifyPairingCompleted = notifyPairingCompleted;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('WebSocketEvents');
const clientSockets = new Map();
function registerClientSocket(clientId, socket) {
    clientSockets.set(clientId, socket);
    logger.info(`[WebSocket] Client ${clientId} registered for notifications (socket: ${socket.id})`);
    socket.emit('connected', {
        clientId,
        message: 'Connected successfully',
        features: ['area_updates', 'token_management', 'real_time_sync'],
        timestamp: new Date().toISOString()
    });
}
function unregisterClientSocket(clientId) {
    if (clientSockets.has(clientId)) {
        clientSockets.delete(clientId);
        logger.info(`[WebSocket] Client ${clientId} unregistered from notifications`);
    }
}
function getClientSocket(clientId) {
    return clientSockets.get(clientId);
}
function getConnectedClientCount() {
    return clientSockets.size;
}
function notifyClient(clientId, event, data) {
    const socket = clientSockets.get(clientId);
    if (socket) {
        logger.info(`[WebSocket] Emitting '${event}' to client ${clientId}`, { event, clientId });
        socket.emit(event, {
            ...data,
            timestamp: new Date().toISOString()
        });
    }
    else {
        logger.warn(`[WebSocket] Client ${clientId} not connected, cannot emit '${event}'`);
    }
}
function notifyClientsWithArea(db, areaId, event, data) {
    try {
        const clients = db.prepare('SELECT id, assigned_areas FROM clients WHERE is_active = ?').all(1);
        const clientsWithArea = clients.filter((client) => {
            if (!client.assigned_areas)
                return false;
            try {
                const assignedAreas = JSON.parse(client.assigned_areas);
                return Array.isArray(assignedAreas) && assignedAreas.includes(areaId);
            }
            catch (e) {
                return false;
            }
        });
        logger.info(`[WebSocket] Notifying ${clientsWithArea.length} clients with area ${areaId}`, {
            event,
            areaId,
            clientCount: clientsWithArea.length
        });
        clientsWithArea.forEach((client) => {
            notifyClient(client.id, event, {
                ...data,
                areaId
            });
        });
    }
    catch (error) {
        logger.error(`[WebSocket] Error notifying clients with area ${areaId}:`, error.message);
    }
}
function notifyAllClients(event, data) {
    logger.info(`[WebSocket] Broadcasting '${event}' to ${clientSockets.size} connected clients`);
    clientSockets.forEach((socket, clientId) => {
        socket.emit(event, {
            ...data,
            timestamp: new Date().toISOString()
        });
    });
}
function disconnectClient(clientId, reason) {
    const socket = clientSockets.get(clientId);
    if (socket) {
        logger.warn(`[WebSocket] Disconnecting client ${clientId}: ${reason}`);
        socket.emit('token_revoked', {
            reason,
            message: 'Your access token has been revoked. Please re-pair your device.',
            timestamp: new Date().toISOString()
        });
        setTimeout(() => {
            socket.disconnect(true);
            clientSockets.delete(clientId);
            logger.info(`[WebSocket] Client ${clientId} disconnected and removed from tracking`);
        }, 500);
    }
    else {
        logger.warn(`[WebSocket] Client ${clientId} not connected, cannot disconnect`);
    }
}
function notifyAreaAdded(clientId, area) {
    notifyClient(clientId, 'area_added', {
        areaId: area.id,
        name: area.name,
        entityIds: area.entityIds || [],
        isEnabled: area.isEnabled,
        message: 'New area has been assigned to your device'
    });
}
function notifyAreaRemoved(clientId, areaId, areaName) {
    notifyClient(clientId, 'area_removed', {
        areaId,
        name: areaName,
        message: 'Area has been removed from your device'
    });
}
function notifyPairingCompleted(clientId, token, clientInfo) {
    notifyClient(clientId, 'pairing_completed', {
        token,
        clientId: clientInfo.id,
        clientName: clientInfo.name,
        assignedAreas: clientInfo.assignedAreas || [],
        message: 'Pairing completed successfully'
    });
}
exports.EVENT_TYPES = {
    CONNECTED: 'connected',
    AREA_ADDED: 'area_added',
    AREA_REMOVED: 'area_removed',
    AREA_UPDATED: 'area_updated',
    AREA_ENABLED: 'area_enabled',
    AREA_DISABLED: 'area_disabled',
    TOKEN_REVOKED: 'token_revoked',
    PAIRING_COMPLETED: 'pairing_completed',
};
//# sourceMappingURL=websocket-events.js.map