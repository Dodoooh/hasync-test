import type { Socket } from 'socket.io';
export declare function registerClientSocket(clientId: string, socket: Socket): void;
export declare function unregisterClientSocket(clientId: string): void;
export declare function getClientSocket(clientId: string): Socket | undefined;
export declare function getConnectedClientCount(): number;
export declare function notifyClient(clientId: string, event: string, data: any): void;
export declare function notifyClientsWithArea(db: any, areaId: string, event: string, data: any): void;
export declare function notifyAllClients(event: string, data: any): void;
export declare function disconnectClient(clientId: string, reason: string): void;
export declare function notifyAreaAdded(clientId: string, area: any): void;
export declare function notifyAreaRemoved(clientId: string, areaId: string, areaName: string): void;
export declare function notifyPairingCompleted(clientId: string, token: string, clientInfo: any): void;
export declare const EVENT_TYPES: {
    readonly CONNECTED: "connected";
    readonly AREA_ADDED: "area_added";
    readonly AREA_REMOVED: "area_removed";
    readonly AREA_UPDATED: "area_updated";
    readonly AREA_ENABLED: "area_enabled";
    readonly AREA_DISABLED: "area_disabled";
    readonly TOKEN_REVOKED: "token_revoked";
    readonly PAIRING_COMPLETED: "pairing_completed";
};
//# sourceMappingURL=websocket-events.d.ts.map