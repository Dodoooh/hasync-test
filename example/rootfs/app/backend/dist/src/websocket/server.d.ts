import { Server as HTTPServer } from 'http';
import { PairingService } from '../services/pairing';
import { HomeAssistantService } from '../services/homeassistant';
import { WSMessage } from '../types';
export declare class WebSocketServer {
    private pairingService;
    private haService;
    private wss;
    private clients;
    private heartbeatInterval;
    constructor(server: HTTPServer, pairingService: PairingService, haService: HomeAssistantService);
    private handleConnection;
    private handleMessage;
    private handleAuth;
    private handleSubscribeEntities;
    private handleServiceCall;
    private handleStateChange;
    private send;
    private sendError;
    private broadcast;
    sendToClient(clientId: string, message: WSMessage): boolean;
    getConnectedClients(): number;
    close(): void;
}
//# sourceMappingURL=server.d.ts.map