/**
 * Home Assistant Integration Service
 */

import WebSocket from 'ws';
import { HAEntity, HAArea, HADashboard, HAConfig } from '../types';

export class HomeAssistantService {
  private config: HAConfig;
  private ws: WebSocket | null = null;
  private messageId = 1;
  private pendingRequests = new Map<number, (data: any) => void>();
  private eventHandlers = new Map<string, Set<(data: any) => void>>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isAuthenticated = false;

  constructor(config: HAConfig) {
    this.config = config;
  }

  // Initialize WebSocket connection to HA
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.config.url.replace('http', 'ws') + '/api/websocket';
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('Connected to Home Assistant WebSocket');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
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

  private handleMessage(message: any, resolve?: () => void, reject?: (err: Error) => void): void {
    switch (message.type) {
      case 'auth_required':
        this.authenticate();
        break;

      case 'auth_ok':
        this.isAuthenticated = true;
        console.log('Authenticated with Home Assistant');
        if (resolve) resolve();
        this.subscribeToEvents();
        break;

      case 'auth_invalid':
        console.error('Authentication failed');
        if (reject) reject(new Error('Authentication failed'));
        break;

      case 'result':
        this.handleResult(message);
        break;

      case 'event':
        this.handleEvent(message);
        break;
    }
  }

  private authenticate(): void {
    const token = this.config.supervisorToken || this.config.token;
    if (!token) {
      throw new Error('No authentication token provided');
    }

    this.send({
      type: 'auth',
      access_token: token
    });
  }

  private handleResult(message: any): void {
    const { id, success, result, error } = message;
    const resolver = this.pendingRequests.get(id);

    if (resolver) {
      this.pendingRequests.delete(id);
      if (success) {
        resolver(result);
      } else {
        console.error('Request failed:', error);
        resolver(null);
      }
    }
  }

  private handleEvent(message: any): void {
    const { event } = message;
    const eventType = event.event_type;

    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => handler(event.data));
    }

    // Also trigger wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => handler(event));
    }
  }

  // Subscribe to HA state changes
  private subscribeToEvents(): void {
    this.sendRequest({
      type: 'subscribe_events',
      event_type: 'state_changed'
    });
  }

  // Send message to HA
  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // Send request and wait for response
  private sendRequest<T>(message: any): Promise<T> {
    return new Promise((resolve) => {
      const id = this.messageId++;
      this.pendingRequests.set(id, resolve);
      this.send({ ...message, id });
    });
  }

  // Public API Methods

  async getStates(): Promise<HAEntity[]> {
    return this.sendRequest<HAEntity[]>({
      type: 'get_states'
    });
  }

  async getState(entityId: string): Promise<HAEntity | null> {
    const states = await this.getStates();
    return states.find(s => s.entity_id === entityId) || null;
  }

  async callService(domain: string, service: string, serviceData?: any, target?: any): Promise<any> {
    return this.sendRequest({
      type: 'call_service',
      domain,
      service,
      service_data: serviceData,
      target
    });
  }

  async getConfig(): Promise<any> {
    return this.sendRequest({
      type: 'get_config'
    });
  }

  async getServices(): Promise<any> {
    return this.sendRequest({
      type: 'get_services'
    });
  }

  // REST API methods (for add-on mode)
  async getAreas(): Promise<HAArea[]> {
    const response = await fetch(`${this.config.url}/api/config/area_registry/list`, {
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  async getDashboards(): Promise<HADashboard[]> {
    const response = await fetch(`${this.config.url}/api/lovelace/dashboards`, {
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  async getEntitiesByArea(areaId: string): Promise<HAEntity[]> {
    const allStates = await this.getStates();
    // Filter by area - would need device registry integration for proper filtering
    return allStates.filter(state =>
      state.attributes.area_id === areaId
    );
  }

  // Event subscription
  on(eventType: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  off(eventType: string, handler: (data: any) => void): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  // Connection management
  private scheduleReconnect(): void {
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

  disconnect(): void {
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

  isConnected(): boolean {
    return this.ws !== null &&
           this.ws.readyState === WebSocket.OPEN &&
           this.isAuthenticated;
  }

  // Helper methods
  private getAuthHeaders(): HeadersInit {
    const token = this.config.supervisorToken || this.config.token;
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }
}
