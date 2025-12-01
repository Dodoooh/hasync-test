"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const ws_1 = __importDefault(require("ws"));
class WebSocketServer {
    pairingService;
    haService;
    wss;
    clients = new Map();
    heartbeatInterval;
    constructor(server, pairingService, haService) {
        this.pairingService = pairingService;
        this.haService = haService;
        this.wss = new ws_1.default.Server({ server, path: '/ws' });
        this.wss.on('connection', this.handleConnection.bind(this));
        this.heartbeatInterval = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
        this.haService.on('state_changed', this.handleStateChange.bind(this));
        console.log('WebSocket server initialized');
    }
    handleConnection(ws, req) {
        console.log('New WebSocket connection from', req.socket.remoteAddress);
        ws.isAlive = true;
        ws.isAuthenticated = false;
        ws.on('pong', () => {
            ws.isAlive = true;
        });
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(ws, message);
            }
            catch (error) {
                console.error('Invalid WebSocket message:', error);
                this.sendError(ws, 'Invalid message format');
            }
        });
        ws.on('close', () => {
            if (ws.clientId) {
                this.clients.delete(ws.clientId);
                console.log(`Client ${ws.clientId} disconnected`);
            }
        });
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
        this.send(ws, {
            type: 'connected',
            payload: {
                message: 'Connected to APP01 WebSocket server',
                timestamp: Date.now()
            }
        });
    }
    async handleMessage(ws, message) {
        switch (message.type) {
            case 'auth':
                await this.handleAuth(ws, message);
                break;
            case 'ping':
                this.send(ws, { type: 'pong', payload: { timestamp: Date.now() } });
                break;
            case 'subscribe_entities':
                if (!ws.isAuthenticated) {
                    this.sendError(ws, 'Authentication required');
                    return;
                }
                this.handleSubscribeEntities(ws, message);
                break;
            case 'call_service':
                if (!ws.isAuthenticated) {
                    this.sendError(ws, 'Authentication required');
                    return;
                }
                await this.handleServiceCall(ws, message);
                break;
            default:
                this.sendError(ws, `Unknown message type: ${message.type}`);
        }
    }
    async handleAuth(ws, message) {
        try {
            const { client_id, certificate } = message.payload;
            if (!client_id || !certificate) {
                this.sendError(ws, 'Missing credentials');
                return;
            }
            const isValid = this.pairingService.verifyClientCertificate(client_id, certificate);
            if (!isValid) {
                this.sendError(ws, 'Invalid credentials');
                ws.close();
                return;
            }
            ws.isAuthenticated = true;
            ws.clientId = client_id;
            this.clients.set(client_id, ws);
            this.pairingService.updateClientActivity(client_id);
            this.send(ws, {
                type: 'auth_ok',
                payload: {
                    message: 'Authentication successful',
                    client_id
                }
            });
            console.log(`Client ${client_id} authenticated via WebSocket`);
        }
        catch (error) {
            console.error('Auth error:', error);
            this.sendError(ws, 'Authentication failed');
            ws.close();
        }
    }
    handleSubscribeEntities(ws, message) {
        const { entity_ids } = message.payload || {};
        this.send(ws, {
            type: 'subscribed',
            payload: {
                entity_ids: entity_ids || 'all',
                message: 'Subscribed to entity updates'
            }
        });
    }
    async handleServiceCall(ws, message) {
        try {
            const { domain, service, service_data, target } = message.payload;
            const result = await this.haService.callService(domain, service, service_data, target);
            this.send(ws, {
                type: 'service_call_result',
                payload: {
                    success: true,
                    result
                }
            });
        }
        catch (error) {
            this.sendError(ws, `Service call failed: ${error.message}`);
        }
    }
    handleStateChange(data) {
        const { entity_id, new_state } = data;
        const message = {
            type: 'entity_update',
            payload: {
                entity_id,
                state: new_state
            },
            timestamp: Date.now()
        };
        this.broadcast(message);
    }
    send(ws, message) {
        if (ws.readyState === ws_1.default.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    sendError(ws, error) {
        this.send(ws, {
            type: 'error',
            payload: { error }
        });
    }
    broadcast(message) {
        this.clients.forEach((ws) => {
            if (ws.isAuthenticated) {
                this.send(ws, message);
            }
        });
    }
    sendToClient(clientId, message) {
        const ws = this.clients.get(clientId);
        if (ws && ws.isAuthenticated) {
            this.send(ws, message);
            return true;
        }
        return false;
    }
    getConnectedClients() {
        return this.clients.size;
    }
    close() {
        clearInterval(this.heartbeatInterval);
        this.wss.close();
    }
}
exports.WebSocketServer = WebSocketServer;
//# sourceMappingURL=server.js.map