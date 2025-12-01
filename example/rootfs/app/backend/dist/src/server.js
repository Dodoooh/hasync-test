"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.App01Server = void 0;
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const http_1 = require("http");
const database_1 = require("./database");
const homeassistant_1 = require("./services/homeassistant");
const pairing_1 = require("./services/pairing");
const server_1 = require("./websocket/server");
const auth_1 = require("./middleware/auth");
const logger_1 = require("./middleware/logger");
const errorHandler_1 = require("./middleware/errorHandler");
const pairing_2 = require("./routes/pairing");
const clients_1 = require("./routes/clients");
const homeassistant_2 = require("./routes/homeassistant");
const health_1 = require("./routes/health");
const auth_2 = require("./routes/auth");
const errors_1 = __importDefault(require("./routes/errors"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const fs_1 = require("fs");
const js_yaml_1 = require("js-yaml");
const path_1 = require("path");
class App01Server {
    app;
    server;
    db;
    haService;
    pairingService;
    wsServer;
    config;
    constructor(config) {
        this.config = config;
        this.app = (0, express_1.default)();
        this.server = (0, http_1.createServer)(this.app);
        this.db = new database_1.DatabaseService(config.database.path);
        this.haService = new homeassistant_1.HomeAssistantService(config.homeAssistant);
        this.pairingService = new pairing_1.PairingService(this.db);
        this.wsServer = new server_1.WebSocketServer(this.server, this.pairingService, this.haService);
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    setupMiddleware() {
        this.app.use((0, cors_1.default)({
            origin: this.config.env === 'development' ? '*' : process.env.ALLOWED_ORIGINS?.split(','),
            credentials: true,
        }));
        this.app.use((0, cookie_parser_1.default)());
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.urlencoded({ extended: true }));
        this.app.use(logger_1.requestLogger);
    }
    setupRoutes() {
        const authMiddleware = new auth_1.AuthMiddleware(this.pairingService);
        this.app.use('/api/health', (0, health_1.createHealthRouter)(this.db, this.haService));
        this.app.use('/api/auth', (0, auth_2.createAuthRouter)(this.pairingService));
        this.app.use('/api/pairing', (0, pairing_2.createPairingRouter)(this.pairingService));
        this.app.use('/api/clients', (0, clients_1.createClientsRouter)(this.pairingService, authMiddleware));
        this.app.use('/api/ha', (0, homeassistant_2.createHomeAssistantRouter)(this.haService, authMiddleware));
        this.app.use('/api/errors', errors_1.default);
        try {
            const swaggerDocument = (0, js_yaml_1.load)((0, fs_1.readFileSync)((0, path_1.join)(__dirname, 'swagger.yaml'), 'utf-8'));
            this.app.use('/api/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocument));
        }
        catch (error) {
            console.warn('Swagger documentation not available:', error);
        }
        this.app.get('/', (req, res) => {
            res.json({
                name: 'APP01 Backend Server',
                version: '1.0.0',
                status: 'running',
                endpoints: {
                    health: '/api/health',
                    docs: '/api/docs',
                    pairing: '/api/pairing',
                    clients: '/api/clients',
                    homeAssistant: '/api/ha',
                    websocket: '/ws'
                }
            });
        });
    }
    setupErrorHandling() {
        this.app.use(errorHandler_1.notFoundHandler);
        this.app.use(errorHandler_1.errorHandler);
    }
    async start() {
        try {
            console.log('Connecting to Home Assistant...');
            await this.haService.connect();
            console.log('Connected to Home Assistant');
            await new Promise((resolve) => {
                this.server.listen(this.config.port, this.config.host, () => {
                    console.log(`
╔════════════════════════════════════════════════════════════╗
║                   APP01 Backend Server                     ║
╠════════════════════════════════════════════════════════════╣
║  Status:        Running                                    ║
║  Environment:   ${this.config.env.padEnd(44)} ║
║  Host:          ${this.config.host.padEnd(44)} ║
║  Port:          ${this.config.port.toString().padEnd(44)} ║
║  API Docs:      http://${this.config.host}:${this.config.port}/api/docs${' '.repeat(20)} ║
║  WebSocket:     ws://${this.config.host}:${this.config.port}/ws${' '.repeat(23)} ║
║  HA Mode:       ${this.config.homeAssistant.mode.padEnd(44)} ║
╚════════════════════════════════════════════════════════════╝
          `);
                    resolve();
                });
            });
        }
        catch (error) {
            console.error('Failed to start server:', error);
            throw error;
        }
    }
    async stop() {
        console.log('Shutting down server...');
        this.wsServer.close();
        this.haService.disconnect();
        this.db.close();
        await new Promise((resolve) => {
            this.server.close(() => {
                console.log('Server stopped');
                resolve();
            });
        });
    }
    getApp() {
        return this.app;
    }
}
exports.App01Server = App01Server;
function createServer(config) {
    return new App01Server(config);
}
//# sourceMappingURL=server.js.map