import { HAEntity, HAArea, HADashboard, HAConfig } from '../types';
export declare class HomeAssistantService {
    private config;
    private ws;
    private messageId;
    private pendingRequests;
    private eventHandlers;
    private reconnectTimer;
    private isAuthenticated;
    constructor(config: HAConfig);
    connect(): Promise<void>;
    private handleMessage;
    private authenticate;
    private handleResult;
    private handleEvent;
    private subscribeToEvents;
    private send;
    private sendRequest;
    getStates(): Promise<HAEntity[]>;
    getState(entityId: string): Promise<HAEntity | null>;
    callService(domain: string, service: string, serviceData?: any, target?: any): Promise<any>;
    getConfig(): Promise<any>;
    getServices(): Promise<any>;
    getAreas(): Promise<HAArea[]>;
    getDashboards(): Promise<HADashboard[]>;
    getEntitiesByArea(areaId: string): Promise<HAEntity[]>;
    on(eventType: string, handler: (data: any) => void): void;
    off(eventType: string, handler: (data: any) => void): void;
    private scheduleReconnect;
    disconnect(): void;
    isConnected(): boolean;
    private getAuthHeaders;
}
//# sourceMappingURL=homeassistant.d.ts.map