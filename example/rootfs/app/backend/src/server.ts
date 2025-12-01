/**
 * APP01 Express Server
 * Main entry point for the backend API server
 */

import express, { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { DatabaseService } from './database';
import { HomeAssistantService } from './services/homeassistant';
import { PairingService } from './services/pairing';
import { WebSocketServer } from './websocket/server';
import { AuthMiddleware } from './middleware/auth';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createPairingRouter } from './routes/pairing';
import { createClientsRouter } from './routes/clients';
import { createHomeAssistantRouter } from './routes/homeassistant';
import { createHealthRouter } from './routes/health';
import { createAuthRouter } from './routes/auth';
import errorRouter from './routes/errors';
import { ServerConfig } from './types';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

export class App01Server {
  private app: Express;
  private server: any;
  private db: DatabaseService;
  private haService: HomeAssistantService;
  private pairingService: PairingService;
  private wsServer: WebSocketServer;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);

    // Initialize services
    this.db = new DatabaseService(config.database.path);
    this.haService = new HomeAssistantService(config.homeAssistant);
    this.pairingService = new PairingService(this.db);
    this.wsServer = new WebSocketServer(this.server, this.pairingService, this.haService);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // CORS - CRITICAL: Must allow credentials for httpOnly cookies
    this.app.use(cors({
      origin: this.config.env === 'development' ? '*' : process.env.ALLOWED_ORIGINS?.split(','),
      credentials: true, // Required for httpOnly cookies
    }));

    // Cookie parsing - CRITICAL: Must parse cookies before auth
    this.app.use(cookieParser());

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use(requestLogger);
  }

  private setupRoutes(): void {
    const authMiddleware = new AuthMiddleware(this.pairingService);

    // Health check (no auth required)
    this.app.use('/api/health', createHealthRouter(this.db, this.haService));

    // Authentication routes (cookie-based auth)
    this.app.use('/api/auth', createAuthRouter(this.pairingService));

    // Pairing routes (no auth required for PIN generation)
    this.app.use('/api/pairing', createPairingRouter(this.pairingService));

    // Client management routes
    this.app.use('/api/clients', createClientsRouter(this.pairingService, authMiddleware));

    // Home Assistant proxy routes (auth required)
    this.app.use('/api/ha', createHomeAssistantRouter(this.haService, authMiddleware));

    // Error logging endpoint (no auth required - frontend errors need to be logged even when not authenticated)
    this.app.use('/api/errors', errorRouter);

    // Swagger documentation
    try {
      const swaggerDocument = load(
        readFileSync(join(__dirname, 'swagger.yaml'), 'utf-8')
      ) as object;

      this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    } catch (error) {
      console.warn('Swagger documentation not available:', error);
    }

    // Root endpoint
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

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    try {
      // Connect to Home Assistant
      console.log('Connecting to Home Assistant...');
      await this.haService.connect();
      console.log('Connected to Home Assistant');

      // Start HTTP server
      await new Promise<void>((resolve) => {
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
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('Shutting down server...');

    // Close WebSocket server
    this.wsServer.close();

    // Disconnect from Home Assistant
    this.haService.disconnect();

    // Close database
    this.db.close();

    // Close HTTP server
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        console.log('Server stopped');
        resolve();
      });
    });
  }

  getApp(): Express {
    return this.app;
  }
}

// Factory function for easy initialization
export function createServer(config: ServerConfig): App01Server {
  return new App01Server(config);
}
