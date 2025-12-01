import axios, { AxiosInstance, AxiosError } from 'axios';
import type { Entity, Area, Dashboard, Client, PairingSession, AppConfig, ApiError } from '@/types';

class ApiClient {
  private instance: AxiosInstance;
  private baseURL: string;
  private csrfToken: string | null = null;

  constructor() {
    this.baseURL = '/api';

    this.instance = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // CRITICAL: Include httpOnly cookies in all requests
    });

    // Request interceptor - add CSRF token for state-changing requests
    this.instance.interceptors.request.use(
      async (config) => {
        // Add CSRF token for state-changing requests (POST, PUT, PATCH, DELETE)
        if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
          if (!this.csrfToken) {
            await this.fetchCsrfToken();
          }
          if (this.csrfToken) {
            config.headers['X-CSRF-Token'] = this.csrfToken;
          }
        }
        // Cookies are automatically included via withCredentials
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling and token refresh
    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        // Handle CSRF token errors (403 Forbidden with EBADCSRFTOKEN)
        if (error.response?.status === 403 && error.response?.data?.code === 'EBADCSRFTOKEN') {
          // Token invalid or expired, fetch new token and retry
          this.csrfToken = null;
          await this.fetchCsrfToken();

          // Retry the original request with new CSRF token
          if (error.config && this.csrfToken) {
            error.config.headers['X-CSRF-Token'] = this.csrfToken;
            return this.instance.request(error.config);
          }
        }

        // Handle 401 errors by attempting token refresh
        if (error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
          try {
            // Attempt to refresh the token
            await this.instance.post('/auth/refresh');

            // Retry the original request with new token in cookie
            if (error.config) {
              return this.instance.request(error.config);
            }
          } catch (refreshError) {
            // Refresh failed, dispatch event for app to handle re-auth
            window.dispatchEvent(new Event('auth:expired'));
          }
        }

        const apiError: ApiError = {
          message: error.response?.data?.message || error.message || 'An error occurred',
          code: error.response?.data?.code || error.code,
          details: error.response?.data?.details,
        };
        return Promise.reject(apiError);
      }
    );

    // Initialize CSRF token on startup
    this.initializeCsrfToken();
  }

  /**
   * Fetch CSRF token from backend
   */
  private async fetchCsrfToken(): Promise<void> {
    try {
      const response = await axios.get(`${this.baseURL}/csrf-token`, {
        withCredentials: true,
      });
      this.csrfToken = response.data.csrfToken;
      console.log('✓ CSRF token fetched successfully');
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
      this.csrfToken = null;
    }
  }

  /**
   * Initialize CSRF token on app start
   */
  private async initializeCsrfToken(): Promise<void> {
    await this.fetchCsrfToken();
  }

  /**
   * Login and set authentication cookies
   * SECURITY: No longer stores tokens in localStorage - uses httpOnly cookies
   */
  async setAuth(ingressUrl: string, token: string): Promise<void> {
    // Call backend login endpoint which sets httpOnly cookies
    await this.instance.post('/auth/login', {
      ingressUrl,
      token,
    });

    // Only store non-sensitive data
    localStorage.setItem('ingressUrl', ingressUrl);
  }

  /**
   * Clear authentication by calling logout endpoint
   * This clears the httpOnly cookies on the server
   */
  async clearAuth(): Promise<void> {
    try {
      await this.instance.post('/auth/logout');
    } catch (error) {
      console.error('Logout request failed:', error);
    }

    // Clear non-sensitive stored data
    localStorage.removeItem('ingressUrl');
  }

  /**
   * Check if user is authenticated
   */
  async checkAuth(): Promise<boolean> {
    try {
      const response = await this.instance.get('/auth/status');
      return response.data.data?.authenticated === true;
    } catch (error) {
      return false;
    }
  }

  // Config endpoints
  async getConfig(): Promise<AppConfig> {
    const { data } = await this.instance.get<AppConfig>('/config');
    return data;
  }

  async updateConfig(config: Partial<AppConfig>): Promise<AppConfig> {
    const { data } = await this.instance.put<AppConfig>('/config', config);
    return data;
  }

  // Entity endpoints
  async getEntities(): Promise<Entity[]> {
    // Get HA URL from localStorage if available
    const haUrl = localStorage.getItem('ingressUrl') || '';
    const params = haUrl ? { ha_url: haUrl } : {};

    const { data } = await this.instance.get<any[]>('/entities', { params });
    // Transform API response to match Entity type
    return data.map((entity) => ({
      id: entity.entity_id,
      name: entity.friendly_name || entity.attributes?.friendly_name || entity.entity_id,
      type: this.extractEntityType(entity.entity_id),
      state: entity.state,
      attributes: entity.attributes,
    }));
  }

  private extractEntityType(entityId: string): Entity['type'] {
    const domain = entityId.split('.')[0];
    const typeMap: Record<string, Entity['type']> = {
      light: 'light',
      switch: 'switch',
      sensor: 'sensor',
      climate: 'climate',
      cover: 'cover',
      media_player: 'media_player',
      camera: 'camera',
    };
    return typeMap[domain] || 'other';
  }

  async getEntity(id: string): Promise<Entity> {
    const { data } = await this.instance.get<Entity>(`/entities/${id}`);
    return data;
  }

  async syncEntities(): Promise<Entity[]> {
    const { data } = await this.instance.post<Entity[]>('/entities/sync');
    return data;
  }

  // Area endpoints
  async getAreas(): Promise<Area[]> {
    const { data } = await this.instance.get<Area[]>('/areas');
    return data;
  }

  async createArea(area: Omit<Area, 'id'>): Promise<Area> {
    const { data } = await this.instance.post<Area>('/areas', area);
    return data;
  }

  async updateArea(id: string, area: Partial<Area>): Promise<Area> {
    const { data } = await this.instance.put<Area>(`/areas/${id}`, area);
    return data;
  }

  async deleteArea(id: string): Promise<void> {
    await this.instance.delete(`/areas/${id}`);
  }

  async patchArea(id: string, updates: Partial<Area>): Promise<Area> {
    const { data} = await this.instance.patch<Area>(`/areas/${id}`, updates);
    return data;
  }

  async assignEntitiesToArea(areaId: string, entityIds: string[]): Promise<Area> {
    const { data } = await this.instance.post<Area>(`/areas/${areaId}/entities`, { entityIds });
    return data;
  }

  // Generic patch method for flexibility
  async patch<T = any>(url: string, data?: any): Promise<T> {
    const response = await this.instance.patch<T>(url, data);
    return response.data;
  }

  // Dashboard endpoints
  async getDashboards(): Promise<Dashboard[]> {
    const { data } = await this.instance.get<Dashboard[]>('/dashboards');
    return data;
  }

  async getDashboard(id: string): Promise<Dashboard> {
    const { data } = await this.instance.get<Dashboard>(`/dashboards/${id}`);
    return data;
  }

  async syncDashboards(): Promise<Dashboard[]> {
    const { data } = await this.instance.post<Dashboard[]>('/dashboards/sync');
    return data;
  }

  // Client endpoints
  async getClients(): Promise<Client[]> {
    const { data } = await this.instance.get<Client[]>('/clients');
    return data;
  }

  async getClient(id: string): Promise<Client> {
    const { data } = await this.instance.get<Client>(`/clients/${id}`);
    return data;
  }

  async updateClient(id: string, client: Partial<Client>): Promise<Client> {
    const { data } = await this.instance.put<Client>(`/clients/${id}`, client);
    return data;
  }

  async deleteClient(id: string): Promise<void> {
    await this.instance.delete(`/clients/${id}`);
  }

  async assignAreasToClient(clientId: string, areaIds: string[]): Promise<Client> {
    const { data } = await this.instance.post<Client>(`/clients/${clientId}/areas`, { areaIds });
    return data;
  }

  async assignDashboardToClient(clientId: string, dashboardId: string): Promise<Client> {
    const { data } = await this.instance.post<Client>(`/clients/${clientId}/dashboard`, { dashboardId });
    return data;
  }

  // Pairing endpoints
  async createPairingSession(): Promise<PairingSession> {
    const { data } = await this.instance.post<PairingSession>('/pairing/create');
    return data;
  }

  async getPairingSession(id: string): Promise<PairingSession> {
    const { data } = await this.instance.get<PairingSession>(`/pairing/${id}`);
    return data;
  }

  async completePairing(sessionId: string, clientInfo: Partial<Client>): Promise<Client> {
    const { data } = await this.instance.post<Client>(`/pairing/${sessionId}/complete`, clientInfo);
    return data;
  }

  async cancelPairing(sessionId: string): Promise<void> {
    await this.instance.delete(`/pairing/${sessionId}`);
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const { data } = await this.instance.get('/health');
    return data;
  }
}

export const apiClient = new ApiClient();
