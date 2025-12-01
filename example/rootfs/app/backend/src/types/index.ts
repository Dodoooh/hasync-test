/**
 * Type Definitions for APP01 Backend
 */

// Home Assistant Types
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

// Client Types
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

// WebSocket Types
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

// API Response Types
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

// Configuration Types
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

// Error Types
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(401, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(404, message);
  }
}
