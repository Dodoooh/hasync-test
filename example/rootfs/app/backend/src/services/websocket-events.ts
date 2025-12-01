/**
 * WebSocket Client-Specific Events System
 *
 * Handles real-time notifications to clients for:
 * - Area assignments/updates
 * - Token revocation
 * - Pairing completion
 */

import { createLogger } from '../utils/logger';
import type { Socket } from 'socket.io';
import type Database from 'better-sqlite3';

// Type definitions for better-sqlite3 (if not available from @types)
type DatabaseInstance = {
  prepare: (sql: string) => {
    all: (params?: any) => any[];
    get: (params?: any) => any;
    run: (params?: any) => any;
  };
};

const logger = createLogger('WebSocketEvents');

// Map of clientId -> Socket connection
const clientSockets = new Map<string, Socket>();

/**
 * Register a client socket connection for tracking
 * @param clientId - Client identifier from database
 * @param socket - Socket.IO socket instance
 */
export function registerClientSocket(clientId: string, socket: Socket): void {
  clientSockets.set(clientId, socket);
  logger.info(`[WebSocket] Client ${clientId} registered for notifications (socket: ${socket.id})`);

  // Send welcome message to client
  socket.emit('connected', {
    clientId,
    message: 'Connected successfully',
    features: ['area_updates', 'token_management', 'real_time_sync'],
    timestamp: new Date().toISOString()
  });
}

/**
 * Unregister a client socket connection
 * @param clientId - Client identifier
 */
export function unregisterClientSocket(clientId: string): void {
  if (clientSockets.has(clientId)) {
    clientSockets.delete(clientId);
    logger.info(`[WebSocket] Client ${clientId} unregistered from notifications`);
  }
}

/**
 * Get socket for a specific client
 * @param clientId - Client identifier
 * @returns Socket instance or undefined
 */
export function getClientSocket(clientId: string): Socket | undefined {
  return clientSockets.get(clientId);
}

/**
 * Get count of connected clients
 */
export function getConnectedClientCount(): number {
  return clientSockets.size;
}

/**
 * Notify a specific client by clientId
 * @param clientId - Client identifier from database
 * @param event - Event name to emit
 * @param data - Event payload
 */
export function notifyClient(clientId: string, event: string, data: any): void {
  const socket = clientSockets.get(clientId);
  if (socket) {
    logger.info(`[WebSocket] Emitting '${event}' to client ${clientId}`, { event, clientId });
    socket.emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  } else {
    logger.warn(`[WebSocket] Client ${clientId} not connected, cannot emit '${event}'`);
  }
}

/**
 * Notify all clients that have a specific area assigned
 * @param db - Database instance
 * @param areaId - Area identifier
 * @param event - Event name to emit
 * @param data - Event payload
 */
export function notifyClientsWithArea(db: any, areaId: string, event: string, data: any): void {
  try {
    // Get all active clients that have this area in their assigned_areas JSON array
    const clients = db.prepare('SELECT id, assigned_areas FROM clients WHERE is_active = ?').all(1) as any[];

    // Filter clients that have this area assigned
    const clientsWithArea = clients.filter((client: any) => {
      if (!client.assigned_areas) return false;
      try {
        const assignedAreas = JSON.parse(client.assigned_areas);
        return Array.isArray(assignedAreas) && assignedAreas.includes(areaId);
      } catch (e) {
        return false;
      }
    });

    logger.info(`[WebSocket] Notifying ${clientsWithArea.length} clients with area ${areaId}`, {
      event,
      areaId,
      clientCount: clientsWithArea.length
    });

    clientsWithArea.forEach((client: any) => {
      notifyClient(client.id, event, {
        ...data,
        areaId
      });
    });
  } catch (error: any) {
    logger.error(`[WebSocket] Error notifying clients with area ${areaId}:`, error.message);
  }
}

/**
 * Notify all connected clients (broadcast)
 * @param event - Event name to emit
 * @param data - Event payload
 */
export function notifyAllClients(event: string, data: any): void {
  logger.info(`[WebSocket] Broadcasting '${event}' to ${clientSockets.size} connected clients`);

  clientSockets.forEach((socket, clientId) => {
    socket.emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  });
}

/**
 * Disconnect a client and notify them of token revocation
 * @param clientId - Client identifier
 * @param reason - Reason for disconnection
 */
export function disconnectClient(clientId: string, reason: string): void {
  const socket = clientSockets.get(clientId);
  if (socket) {
    logger.warn(`[WebSocket] Disconnecting client ${clientId}: ${reason}`);

    // Send final notification before disconnect
    socket.emit('token_revoked', {
      reason,
      message: 'Your access token has been revoked. Please re-pair your device.',
      timestamp: new Date().toISOString()
    });

    // Wait a moment for message to be sent, then disconnect
    setTimeout(() => {
      socket.disconnect(true);
      clientSockets.delete(clientId);
      logger.info(`[WebSocket] Client ${clientId} disconnected and removed from tracking`);
    }, 500);
  } else {
    logger.warn(`[WebSocket] Client ${clientId} not connected, cannot disconnect`);
  }
}

/**
 * Notify a client that a new area has been assigned to them
 * @param clientId - Client identifier
 * @param area - Area data
 */
export function notifyAreaAdded(clientId: string, area: any): void {
  notifyClient(clientId, 'area_added', {
    areaId: area.id,
    name: area.name,
    entityIds: area.entityIds || [],
    isEnabled: area.isEnabled,
    message: 'New area has been assigned to your device'
  });
}

/**
 * Notify a client that an area has been removed from them
 * @param clientId - Client identifier
 * @param areaId - Area identifier
 * @param areaName - Area name
 */
export function notifyAreaRemoved(clientId: string, areaId: string, areaName: string): void {
  notifyClient(clientId, 'area_removed', {
    areaId,
    name: areaName,
    message: 'Area has been removed from your device'
  });
}

/**
 * Notify client that pairing is complete and provide token
 * @param clientId - Client identifier
 * @param token - JWT token for client
 * @param clientInfo - Client information
 */
export function notifyPairingCompleted(clientId: string, token: string, clientInfo: any): void {
  notifyClient(clientId, 'pairing_completed', {
    token,
    clientId: clientInfo.id,
    clientName: clientInfo.name,
    assignedAreas: clientInfo.assignedAreas || [],
    message: 'Pairing completed successfully'
  });
}

// Event Types for documentation
export const EVENT_TYPES = {
  // Connection events
  CONNECTED: 'connected',

  // Area events
  AREA_ADDED: 'area_added',
  AREA_REMOVED: 'area_removed',
  AREA_UPDATED: 'area_updated',
  AREA_ENABLED: 'area_enabled',
  AREA_DISABLED: 'area_disabled',

  // Token events
  TOKEN_REVOKED: 'token_revoked',

  // Pairing events
  PAIRING_COMPLETED: 'pairing_completed',
} as const;
