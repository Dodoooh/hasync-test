"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
const dotenv_1 = require("dotenv");
const server_1 = require("./server");
(0, dotenv_1.config)();
const serverConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
    homeAssistant: {
        url: process.env.HA_URL || 'http://supervisor/core',
        token: process.env.HA_TOKEN,
        supervisorToken: process.env.SUPERVISOR_TOKEN,
        mode: process.env.HA_MODE === 'standalone' ? 'standalone' : 'addon'
    },
    security: {
        certificateDir: process.env.CERT_DIR || '/data/certificates',
        sessionSecret: process.env.SESSION_SECRET || 'change-this-in-production',
        maxPairingAttempts: parseInt(process.env.MAX_PAIRING_ATTEMPTS || '3', 10),
        pairingTimeout: parseInt(process.env.PAIRING_TIMEOUT || '300000', 10)
    },
    database: {
        path: process.env.DB_PATH || '/data/app01.db',
        backupEnabled: process.env.DB_BACKUP === 'true',
        backupInterval: parseInt(process.env.DB_BACKUP_INTERVAL || '86400000', 10)
    }
};
const server = (0, server_1.createServer)(serverConfig);
exports.server = server;
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
});
server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map