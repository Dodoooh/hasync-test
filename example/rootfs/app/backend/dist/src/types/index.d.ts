export interface HAEntity {
    entity_id: string;
    state: string;
    attributes: Record<string, any>;
    last_changed: string;
    last_updated: string;
    context: {
        id: string;
        parent_id?: string;
        user_id?: string;
    };
}
export interface HAArea {
    area_id: string;
    name: string;
    picture?: string;
    aliases?: string[];
}
export interface HADashboard {
    id: string;
    title: string;
    icon?: string;
    url_path: string;
    require_admin?: boolean;
    show_in_sidebar?: boolean;
}
export interface Client {
    id: string;
    name: string;
    device_type: string;
    public_key: string;
    certificate: string;
    paired_at: number;
    last_seen: number;
    is_active: boolean;
    metadata?: Record<string, any>;
}
export interface PairingRequest {
    pin: string;
    device_name: string;
    device_type: string;
    public_key: string;
}
export interface PairingSession {
    id: string;
    pin: string;
    expires_at: number;
    created_at: number;
}
export interface WSMessage {
    type: string;
    payload: any;
    timestamp?: number;
}
export interface WSAuthMessage extends WSMessage {
    type: 'auth';
    payload: {
        client_id: string;
        certificate: string;
    };
}
export interface WSEntityUpdateMessage extends WSMessage {
    type: 'entity_update';
    payload: {
        entity_id: string;
        state: HAEntity;
    };
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: number;
}
export interface PaginatedResponse<T> extends ApiResponse<T> {
    pagination?: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
    };
}
export interface ServerConfig {
    port: number;
    host: string;
    env: 'development' | 'production';
    homeAssistant: HAConfig;
    security: SecurityConfig;
    database: DatabaseConfig;
}
export interface HAConfig {
    url: string;
    token?: string;
    supervisorToken?: string;
    mode: 'addon' | 'standalone';
}
export interface SecurityConfig {
    certificateDir: string;
    sessionSecret: string;
    maxPairingAttempts: number;
    pairingTimeout: number;
}
export interface DatabaseConfig {
    path: string;
    backupEnabled: boolean;
    backupInterval: number;
}
export declare class AppError extends Error {
    statusCode: number;
    isOperational: boolean;
    constructor(statusCode: number, message: string, isOperational?: boolean);
}
export declare class ValidationError extends AppError {
    constructor(message: string);
}
export declare class AuthenticationError extends AppError {
    constructor(message?: string);
}
export declare class NotFoundError extends AppError {
    constructor(message?: string);
}
//# sourceMappingURL=index.d.ts.map