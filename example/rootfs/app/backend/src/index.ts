/**
 * Backend Entry Point
 */

import { config } from 'dotenv';
import { createServer } from './server';
import { ServerConfig } from './types';

// Load environment variables
config();

// Build configuration
const serverConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  env: (process.env.NODE_ENV as 'development' | 'production') || 'development',

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

// Create and start server
const server = createServer(serverConfig);

// Graceful shutdown
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

// Start server
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export { server };
