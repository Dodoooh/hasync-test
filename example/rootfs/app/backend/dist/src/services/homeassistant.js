"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomeAssistantService = void 0;
const ws_1 = __importDefault(require("ws"));
class HomeAssistantService {
    config;
    ws = null;
    messageId = 1;
    pendingRequests = new Map();
    eventHandlers = new Map();
    reconnectTimer = null;
    isAuthenticated = false;
    constructor(config) {
        this.config = config;
    }
    async connect() {
        return new Promise((resolve, reject) => {
            const wsUrl = this.config.url.replace('http', 'ws') + '/api/websocket';
            this.ws = new ws_1.default(wsUrl);
            this.ws.on('open', () => {
                console.log('Connected to Home Assistant WebSocket');
            });
            this.ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                this.handleMessage(message, resolve, reject);
            });
            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            });
            this.ws.on('close', () => {
                console.log('WebSocket connection closed');
                this.isAuthenticated = false;
                this.scheduleReconnect();
            });
        });
    }
    handleMessage(message, resolve, reject) {
        switch (message.type) {
            case 'auth_required':
                this.authenticate();
                break;
            case 'auth_ok':
                this.isAuthenticated = true;
                console.log('Authenticated with Home Assistant');
                if (resolve)
                    resolve();
                this.subscribeToEvents();
                break;
            case 'auth_invalid':
                console.error('Authentication failed');
                if (reject)
                    reject(new Error('Authentication failed'));
                break;
            case 'result':
                this.handleResult(message);
                break;
            case 'event':
                this.handleEvent(message);
                break;
        }
    }
    authenticate() {
        const token = this.config.supervisorToken || this.config.token;
        if (!token) {
            throw new Error('No authentication token provided');
        }
        this.send({
            type: 'auth',
            access_token: token
        });
    }
    handleResult(message) {
        const { id, success, result, error } = message;
        const resolver = this.pendingRequests.get(id);
        if (resolver) {
            this.pendingRequests.delete(id);
            if (success) {
                resolver(result);
            }
            else {
                console.error('Request failed:', error);
                resolver(null);
            }
        }
    }
    handleEvent(message) {
        const { event } = message;
        const eventType = event.event_type;
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            handlers.forEach(handler => handler(event.data));
        }
        const wildcardHandlers = this.eventHandlers.get('*');
        if (wildcardHandlers) {
            wildcardHandlers.forEach(handler => handler(event));
        }
    }
    subscribeToEvents() {
        this.sendRequest({
            type: 'subscribe_events',
            event_type: 'state_changed'
        });
    }
    send(message) {
        if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
    sendRequest(message) {
        return new Promise((resolve) => {
            const id = this.messageId++;
            this.pendingRequests.set(id, resolve);
            this.send({ ...message, id });
        });
    }
    async getStates() {
        return this.sendRequest({
            type: 'get_states'
        });
    }
    async getState(entityId) {
        const states = await this.getStates();
        return states.find(s => s.entity_id === entityId) || null;
    }
    async callService(domain, service, serviceData, target) {
        return this.sendRequest({
            type: 'call_service',
            domain,
            service,
            service_data: serviceData,
            target
        });
    }
    async getConfig() {
        return this.sendRequest({
            type: 'get_config'
        });
    }
    async getServices() {
        return this.sendRequest({
            type: 'get_services'
        });
    }
    async getAreas() {
        const response = await fetch(`${this.config.url}/api/config/area_registry/list`, {
            headers: this.getAuthHeaders()
        });
        return response.json();
    }
    async getDashboards() {
        const response = await fetch(`${this.config.url}/api/lovelace/dashboards`, {
            headers: this.getAuthHeaders()
        });
        return response.json();
    }
    async getEntitiesByArea(areaId) {
        const allStates = await this.getStates();
        return allStates.filter(state => state.attributes.area_id === areaId);
    }
    on(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, new Set());
        }
        this.eventHandlers.get(eventType).add(handler);
    }
    off(eventType, handler) {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            handlers.delete(handler);
        }
    }
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(() => {
            console.log('Attempting to reconnect to Home Assistant...');
            this.connect().catch(err => {
                console.error('Reconnection failed:', err);
            });
        }, 5000);
    }
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.pendingRequests.clear();
        this.isAuthenticated = false;
    }
    isConnected() {
        return this.ws !== null &&
            this.ws.readyState === ws_1.default.OPEN &&
            this.isAuthenticated;
    }
    getAuthHeaders() {
        const token = this.config.supervisorToken || this.config.token;
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }
}
exports.HomeAssistantService = HomeAssistantService;
//# sourceMappingURL=homeassistant.js.map