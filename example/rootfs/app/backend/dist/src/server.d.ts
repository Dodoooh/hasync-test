import { Express } from 'express';
import { ServerConfig } from './types';
export declare class App01Server {
    private app;
    private server;
    private db;
    private haService;
    private pairingService;
    private wsServer;
    private config;
    constructor(config: ServerConfig);
    private setupMiddleware;
    private setupRoutes;
    private setupErrorHandling;
    start(): Promise<void>;
    stop(): Promise<void>;
    getApp(): Express;
}
export declare function createServer(config: ServerConfig): App01Server;
//# sourceMappingURL=server.d.ts.map