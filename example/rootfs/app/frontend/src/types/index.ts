// Core types for HAsync Management UI

export interface Entity {
  id: string;
  name: string;
  type: 'light' | 'switch' | 'sensor' | 'climate' | 'cover' | 'media_player' | 'camera' | 'other';
  state?: string;
  attributes?: Record<string, any>;
}

export interface Area {
  id: string;
  name: string;
  entityIds: string[];
  isEnabled?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Dashboard {
  id: string;
  name: string;
  views: DashboardView[];
}

export interface DashboardView {
  id: string;
  title: string;
  type: 'grid' | 'panel' | 'masonry';
  cards: DashboardCard[];
}

export interface DashboardCard {
  id: string;
  type: string;
  entity?: string;
  entities?: string[];
  config?: Record<string, any>;
}

export interface Client {
  id: string;
  name: string;
  deviceType: 'phone' | 'tablet' | 'desktop';
  status: 'online' | 'offline' | 'pairing';
  assignedAreas: string[];
  assignedDashboard?: string;
  lastSeen: Date;
  ipAddress?: string;
}

export interface PairingSession {
  id: string;
  pin: string;
  clientId?: string;
  status: 'pending' | 'active' | 'completed' | 'expired';
  createdAt: Date;
  expiresAt: Date;
}

export interface AppConfig {
  ingressUrl: string;
  accessToken: string;
  entities: Entity[];
  areas: Area[];
  dashboards: Dashboard[];
  clients: Client[];
}

export interface EntityFilter {
  search: string;
  types: string[];
  areas: string[];
  states: string[];
  domains: string[];
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export interface WebSocketMessage {
  type: 'entity_update' | 'client_connected' | 'client_disconnected' | 'pairing_request' | 'config_update';
  payload: any;
}
