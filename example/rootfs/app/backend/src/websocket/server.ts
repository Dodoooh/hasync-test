/**
 * WebSocket Server for Real-time Communication
 */

import WebSocket from 'ws';
import { Server as HTTPServer } from 'http';
import { PairingService } from '../services/pairing';
import { HomeAssistantService } from '../services/homeassistant';
import { WSMessage, WSAuthMessage, WSEntityUpdateMessage } from '../types';
import { IncomingMessage } from 'http';

interface AuthenticatedWebSocket extends WebSocket {
  clientId?: string;
  isAuthenticated?: boolean;
  isAlive?: boolean;
}

export class WebSocketServer {
  private wss: WebSocket.Server;
  private clients = new Map<string, AuthenticatedWebSocket>();
  private heartbeatInterval: NodeJS.Timeout;

  constructor(
    server: HTTPServer,
    private pairingService: PairingService,
    private haService: HomeAssistantService
  ) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });

    this.wss.on('connection', this.handleConnection.bind(this));

    // Setup heartbeat to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    // Subscribe to Home Assistant state changes
    this.haService.on('state_changed', this.handleStateChange.bind(this));

    console.log('WebSocket server initialized');
  }

  private handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage): void {
    console.log('New WebSocket connection from', req.socket.remoteAddress);

    ws.isAlive = true;
    ws.isAuthenticated = false;

    // Handle pong messages for heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      if (ws.clientId) {
        this.clients.delete(ws.clientId);
        console.log(`Client ${ws.clientId} disconnected`);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Send connection acknowledgment
    this.send(ws, {
      type: 'connected',
      payload: {
        message: 'Connected to APP01 WebSocket server',
        timestamp: Date.now()
      }
    });
  }

  private async handleMessage(ws: AuthenticatedWebSocket, message: WSMessage): Promise<void> {
    switch (message.type) {
      case 'auth':
        await this.handleAuth(ws, message as WSAuthMessage);
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

  private async handleAuth(ws: AuthenticatedWebSocket, message: WSAuthMessage): Promise<void> {
    try {
      const { client_id, certificate } = message.payload;

      if (!client_id || !certificate) {
        this.sendError(ws, 'Missing credentials');
        return;
      }

      // Verify credentials
      const isValid = this.pairingService.verifyClientCertificate(client_id, certificate);
      if (!isValid) {
        this.sendError(ws, 'Invalid credentials');
        ws.close();
        return;
      }

      // Mark as authenticated
      ws.isAuthenticated = true;
      ws.clientId = client_id;
      this.clients.set(client_id, ws);

      // Update activity
      this.pairingService.updateClientActivity(client_id);

      // Send auth success
      this.send(ws, {
        type: 'auth_ok',
        payload: {
          message: 'Authentication successful',
          client_id
        }
      });

      console.log(`Client ${client_id} authenticated via WebSocket`);
    } catch (error) {
      console.error('Auth error:', error);
      this.sendError(ws, 'Authentication failed');
      ws.close();
    }
  }

  private handleSubscribeEntities(ws: AuthenticatedWebSocket, message: WSMessage): void {
    // Client can specify which entities to subscribe to
    const { entity_ids } = message.payload || {};

    this.send(ws, {
      type: 'subscribed',
      payload: {
        entity_ids: entity_ids || 'all',
        message: 'Subscribed to entity updates'
      }
    });
  }

  private async handleServiceCall(ws: AuthenticatedWebSocket, message: WSMessage): Promise<void> {
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
    } catch (error: any) {
      this.sendError(ws, `Service call failed: ${error.message}`);
    }
  }

  private handleStateChange(data: any): void {
    // Broadcast state changes to all authenticated clients
    const { entity_id, new_state } = data;

    const message: WSEntityUpdateMessage = {
      type: 'entity_update',
      payload: {
        entity_id,
        state: new_state
      },
      timestamp: Date.now()
    };

    this.broadcast(message);
  }

  private send(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, {
      type: 'error',
      payload: { error }
    });
  }

  private broadcast(message: WSMessage): void {
    this.clients.forEach((ws) => {
      if (ws.isAuthenticated) {
        this.send(ws, message);
      }
    });
  }

  // Public method to send message to specific client
  sendToClient(clientId: string, message: WSMessage): boolean {
    const ws = this.clients.get(clientId);
    if (ws && ws.isAuthenticated) {
      this.send(ws, message);
      return true;
    }
    return false;
  }

  // Get connected clients count
  getConnectedClients(): number {
    return this.clients.size;
  }

  // Shutdown
  close(): void {
    clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}
