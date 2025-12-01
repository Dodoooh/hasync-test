import { io, Socket } from 'socket.io-client';
import type { WebSocketMessage } from '@/types';

type EventHandler = (data: any) => void;

class WebSocketClient {
  private socket: Socket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private authToken: string | null = null;

  /**
   * Set authentication token for WebSocket connection
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  /**
   * Get current authentication token
   */
  private getAuthToken(): string | null {
    // Try to get from stored token or localStorage
    if (this.authToken) {
      return this.authToken;
    }

    // Fallback to localStorage
    try {
      return localStorage.getItem('auth_token');
    } catch {
      return null;
    }
  }

  connect(url?: string): void {
    if (this.socket?.connected) {
      console.warn('WebSocket already connected');
      return;
    }

    const token = this.getAuthToken();
    if (!token) {
      console.error('Cannot connect to WebSocket: No authentication token available');
      this.emit('error', {
        error: 'No authentication token available. Please login first.',
        code: 'NO_TOKEN',
        timestamp: new Date()
      });
      return;
    }

    console.log('Connecting to WebSocket with authentication token...');

    // Use relative path for Vite proxy, or explicit URL if provided
    const socketUrl = url || '/';

    this.socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      auth: {
        token, // Send JWT token for authentication
      },
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected successfully');
      this.reconnectAttempts = 0;
      this.emit('connected', {
        timestamp: new Date(),
        authenticated: true
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.emit('disconnected', { reason, timestamp: new Date() });
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;

      // Handle authentication errors
      if (error.data?.code === 'NO_TOKEN' || error.data?.code === 'INVALID_TOKEN') {
        console.error('WebSocket authentication failed:', error.message);
        this.emit('auth_error', {
          error: error.message,
          code: error.data?.code,
          timestamp: new Date(),
        });

        // Don't retry on auth errors - disconnect and require re-login
        this.disconnect();
        return;
      }

      // Handle rate limiting
      if (error.data?.code === 'RATE_LIMIT_EXCEEDED') {
        console.warn('WebSocket rate limit exceeded');
        this.emit('rate_limit', {
          error: error.message,
          timestamp: new Date(),
        });
        return;
      }

      this.emit('error', {
        error: error.message,
        code: error.data?.code,
        timestamp: new Date(),
      });
    });

    // Handle all message types
    this.socket.on('message', (message: WebSocketMessage) => {
      this.handleMessage(message);
    });

    // Specific event handlers
    this.socket.on('entity_update', (data) => {
      this.emit('entity_update', data);
    });

    this.socket.on('client_connected', (data) => {
      this.emit('client_connected', data);
    });

    this.socket.on('client_disconnected', (data) => {
      this.emit('client_disconnected', data);
    });

    this.socket.on('pairing_request', (data) => {
      this.emit('pairing_request', data);
    });

    this.socket.on('config_update', (data) => {
      this.emit('config_update', data);
    });

    // Handle server-side errors
    this.socket.on('error', (data) => {
      console.error('WebSocket server error:', data);
      this.emit('server_error', data);
    });

    // Handle subscription confirmations
    this.socket.on('subscribed', (data) => {
      console.log('Subscribed to:', data.type);
      this.emit('subscribed', data);
    });

    this.socket.on('unsubscribed', (data) => {
      console.log('Unsubscribed from:', data.type);
      this.emit('unsubscribed', data);
    });

    // Handle pong for heartbeat
    this.socket.on('pong', (data) => {
      this.emit('pong', data);
    });
  }

  disconnect(): void {
    if (this.socket) {
      console.log('Disconnecting WebSocket...');
      this.socket.disconnect();
      this.socket = null;
    }
    this.handlers.clear();
    this.reconnectAttempts = 0;
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(event);
        }
      }
    };
  }

  once(event: string, handler: EventHandler): void {
    const wrappedHandler = (data: any) => {
      handler(data);
      this.off(event, wrappedHandler);
    };
    this.on(event, wrappedHandler);
  }

  off(event: string, handler?: EventHandler): void {
    if (!handler) {
      this.handlers.delete(event);
      return;
    }

    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  send(event: string, data: any): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot send:', event);
      return;
    }
    this.socket.emit(event, data);
  }

  private handleMessage(message: WebSocketMessage): void {
    this.emit(message.type, message.payload);
    this.emit('message', message);
  }

  private emit(event: string, data: any): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  get isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Subscribe to real-time updates for a specific type
   */
  subscribe(type: 'entities' | 'areas' | 'dashboards' | 'clients', id?: string): void {
    this.send('subscribe', { type, id });
  }

  /**
   * Unsubscribe from real-time updates
   */
  unsubscribe(type: 'entities' | 'areas' | 'dashboards' | 'clients', id?: string): void {
    this.send('unsubscribe', { type, id });
  }

  /**
   * Send heartbeat ping
   */
  ping(): void {
    this.send('ping', {});
  }

  /**
   * Reconnect with new token (after token refresh)
   */
  reconnectWithToken(token: string): void {
    this.setAuthToken(token);
    this.disconnect();
    this.connect();
  }
}

export const wsClient = new WebSocketClient();
