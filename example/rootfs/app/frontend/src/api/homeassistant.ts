/**
 * Home Assistant API Integration
 * Provides functions for connecting to and syncing with Home Assistant instances
 */

// ============================================================================
// TypeScript Types & Interfaces
// ============================================================================

export interface HAConnectionConfig {
  url: string;
  token: string;
}

export interface HAEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
  context: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

export interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

export interface HAConfig {
  components: string[];
  config_dir: string;
  elevation: number;
  latitude: number;
  longitude: number;
  location_name: string;
  time_zone: string;
  unit_system: {
    length: string;
    mass: string;
    temperature: string;
    volume: string;
  };
  version: string;
  whitelist_external_dirs: string[];
}

export interface HAConnectionTestResult {
  success: boolean;
  message: string;
  version?: string;
  error?: string;
}

export interface HASyncResult {
  success: boolean;
  entitiesCount?: number;
  entities?: HAEntity[];
  error?: string;
  timestamp: string;
}

export interface HAApiError {
  message: string;
  statusCode?: number;
  originalError?: any;
}

// ============================================================================
// Error Handling
// ============================================================================

export class HomeAssistantError extends Error {
  statusCode?: number;
  originalError?: any;

  constructor(message: string, statusCode?: number, originalError?: any) {
    super(message);
    this.name = 'HomeAssistantError';
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

/**
 * Handle fetch errors with detailed error messages
 */
function handleFetchError(error: any, context: string): never {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    throw new HomeAssistantError(
      `Network error: Unable to connect to Home Assistant. Please check the URL and ensure CORS is configured correctly.`,
      0,
      error
    );
  }

  if (error.name === 'AbortError') {
    throw new HomeAssistantError(
      `Request timeout: Home Assistant did not respond in time.`,
      0,
      error
    );
  }

  throw new HomeAssistantError(
    `${context}: ${error.message}`,
    error.statusCode,
    error
  );
}

/**
 * Handle HTTP response errors
 */
async function handleResponseError(response: Response, context: string): Promise<never> {
  let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

  try {
    const errorData = await response.json();
    if (errorData.message) {
      errorMessage = errorData.message;
    }
  } catch {
    // Unable to parse error response, use default message
  }

  switch (response.status) {
    case 401:
      throw new HomeAssistantError(
        'Authentication failed: Invalid or expired access token.',
        401
      );
    case 403:
      throw new HomeAssistantError(
        'Access forbidden: Token does not have required permissions.',
        403
      );
    case 404:
      throw new HomeAssistantError(
        'Endpoint not found: Please verify Home Assistant URL and API availability.',
        404
      );
    case 500:
    case 502:
    case 503:
      throw new HomeAssistantError(
        'Home Assistant server error: The server encountered an error.',
        response.status
      );
    default:
      throw new HomeAssistantError(
        `${context}: ${errorMessage}`,
        response.status
      );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize Home Assistant URL
 * Removes trailing slashes and ensures proper format
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();

  // Remove trailing slash
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  // Ensure protocol is present
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `http://${normalized}`;
  }

  return normalized;
}

/**
 * Create request headers for Home Assistant API
 */
function createHeaders(token: string): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

/**
 * Make authenticated request to Home Assistant API
 */
async function fetchHA<T>(
  url: string,
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const normalizedUrl = normalizeUrl(url);
  const fullUrl = `${normalizedUrl}/api/${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        ...createHeaders(token),
        ...options.headers
      },
      signal: controller.signal,
      mode: 'cors', // Explicitly set CORS mode
      credentials: 'omit' // Don't send cookies
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      await handleResponseError(response, `Request to ${endpoint}`);
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);
    handleFetchError(error, `Request to ${endpoint}`);
  }
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Test connection to Home Assistant
 * Validates URL, token, and returns basic instance info
 *
 * @param url - Home Assistant instance URL (e.g., http://homeassistant.local:8123)
 * @param token - Long-lived access token
 * @returns Connection test result with version info
 *
 * @example
 * const result = await testConnection('http://homeassistant.local:8123', 'your-token');
 * if (result.success) {
 *   console.log(`Connected to HA version ${result.version}`);
 * }
 */
export async function testConnection(
  url: string,
  token: string
): Promise<HAConnectionTestResult> {
  try {
    // Validate inputs
    if (!url || url.trim() === '') {
      return {
        success: false,
        message: 'URL is required'
      };
    }

    if (!token || token.trim() === '') {
      return {
        success: false,
        message: 'Access token is required'
      };
    }

    // Fetch Home Assistant config to test connection
    const config = await fetchHA<HAConfig>(url, token, 'config');

    return {
      success: true,
      message: `Successfully connected to Home Assistant at ${config.location_name}`,
      version: config.version
    };
  } catch (error) {
    if (error instanceof HomeAssistantError) {
      return {
        success: false,
        message: error.message,
        error: error.message
      };
    }

    return {
      success: false,
      message: 'Unknown error occurred',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Fetch all entities from Home Assistant
 * Retrieves complete state information for all entities
 *
 * @param url - Home Assistant instance URL
 * @param token - Long-lived access token
 * @returns Array of all entities with their current states
 *
 * @example
 * const entities = await fetchEntitiesFromHA('http://homeassistant.local:8123', 'your-token');
 * const lights = entities.filter(e => e.entity_id.startsWith('light.'));
 */
export async function fetchEntitiesFromHA(
  url: string,
  token: string
): Promise<HAEntity[]> {
  try {
    // Validate inputs
    if (!url || url.trim() === '') {
      throw new HomeAssistantError('URL is required');
    }

    if (!token || token.trim() === '') {
      throw new HomeAssistantError('Access token is required');
    }

    // Fetch all states from Home Assistant
    const states = await fetchHA<HAState[]>(url, token, 'states');

    // Transform states to entities format
    const entities: HAEntity[] = states.map(state => ({
      entity_id: state.entity_id,
      state: state.state,
      attributes: state.attributes,
      last_changed: state.last_changed,
      last_updated: state.last_updated,
      context: {
        id: '',
        parent_id: null,
        user_id: null
      }
    }));

    return entities;
  } catch (error) {
    if (error instanceof HomeAssistantError) {
      throw error;
    }

    throw new HomeAssistantError(
      `Failed to fetch entities: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      error
    );
  }
}

/**
 * Sync all data from Home Assistant
 * Performs a full sync of entities and returns summary
 *
 * @returns Sync result with entity count and data
 *
 * @example
 * const result = await syncWithHomeAssistant();
 * if (result.success) {
 *   console.log(`Synced ${result.entitiesCount} entities`);
 *   // Store result.entities in your app state
 * }
 */
export async function syncWithHomeAssistant(): Promise<HASyncResult> {
  try {
    // Get connection config from localStorage or environment
    const storedConfig = localStorage.getItem('ha_connection');

    if (!storedConfig) {
      return {
        success: false,
        error: 'No Home Assistant connection configured. Please configure connection first.',
        timestamp: new Date().toISOString()
      };
    }

    const config: HAConnectionConfig = JSON.parse(storedConfig);

    // Test connection first
    const connectionTest = await testConnection(config.url, config.token);

    if (!connectionTest.success) {
      return {
        success: false,
        error: connectionTest.error || 'Connection test failed',
        timestamp: new Date().toISOString()
      };
    }

    // Fetch all entities
    const entities = await fetchEntitiesFromHA(config.url, config.token);

    // Store entities in localStorage for offline access
    localStorage.setItem('ha_entities', JSON.stringify(entities));
    localStorage.setItem('ha_last_sync', new Date().toISOString());

    return {
      success: true,
      entitiesCount: entities.length,
      entities: entities,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const errorMessage = error instanceof HomeAssistantError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Unknown error occurred';

    return {
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Save Home Assistant connection configuration
 *
 * @param url - Home Assistant instance URL
 * @param token - Long-lived access token
 */
export function saveConnectionConfig(url: string, token: string): void {
  const config: HAConnectionConfig = {
    url: normalizeUrl(url),
    token: token.trim()
  };

  localStorage.setItem('ha_connection', JSON.stringify(config));
}

/**
 * Get stored Home Assistant connection configuration
 *
 * @returns Connection config or null if not configured
 */
export function getConnectionConfig(): HAConnectionConfig | null {
  const stored = localStorage.getItem('ha_connection');

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as HAConnectionConfig;
  } catch {
    return null;
  }
}

/**
 * Clear stored Home Assistant connection configuration
 */
export function clearConnectionConfig(): void {
  localStorage.removeItem('ha_connection');
  localStorage.removeItem('ha_entities');
  localStorage.removeItem('ha_last_sync');
}

/**
 * Get cached entities from localStorage
 *
 * @returns Cached entities or null if not available
 */
export function getCachedEntities(): HAEntity[] | null {
  const stored = localStorage.getItem('ha_entities');

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as HAEntity[];
  } catch {
    return null;
  }
}

/**
 * Get last sync timestamp
 *
 * @returns ISO timestamp or null if never synced
 */
export function getLastSyncTime(): string | null {
  return localStorage.getItem('ha_last_sync');
}

// ============================================================================
// Advanced API Functions
// ============================================================================

/**
 * Call a service on Home Assistant
 *
 * @param url - Home Assistant instance URL
 * @param token - Long-lived access token
 * @param domain - Service domain (e.g., 'light', 'switch')
 * @param service - Service name (e.g., 'turn_on', 'turn_off')
 * @param serviceData - Optional service data
 * @returns Service call result
 */
export async function callService(
  url: string,
  token: string,
  domain: string,
  service: string,
  serviceData?: Record<string, any>
): Promise<HAState[]> {
  return fetchHA<HAState[]>(
    url,
    token,
    `services/${domain}/${service}`,
    {
      method: 'POST',
      body: JSON.stringify(serviceData || {})
    }
  );
}

/**
 * Get history for specific entities
 *
 * @param url - Home Assistant instance URL
 * @param token - Long-lived access token
 * @param entityIds - Array of entity IDs
 * @param startTime - Optional start time (ISO string)
 * @param endTime - Optional end time (ISO string)
 * @returns Entity history
 */
export async function getHistory(
  url: string,
  token: string,
  entityIds?: string[],
  startTime?: string,
  endTime?: string
): Promise<HAState[][]> {
  let endpoint = 'history/period';

  if (startTime) {
    endpoint += `/${startTime}`;
  }

  const params = new URLSearchParams();

  if (entityIds && entityIds.length > 0) {
    params.append('filter_entity_id', entityIds.join(','));
  }

  if (endTime) {
    params.append('end_time', endTime);
  }

  const queryString = params.toString();
  if (queryString) {
    endpoint += `?${queryString}`;
  }

  return fetchHA<HAState[][]>(url, token, endpoint);
}

/**
 * Get entity state
 *
 * @param url - Home Assistant instance URL
 * @param token - Long-lived access token
 * @param entityId - Entity ID
 * @returns Entity state
 */
export async function getEntityState(
  url: string,
  token: string,
  entityId: string
): Promise<HAState> {
  return fetchHA<HAState>(url, token, `states/${entityId}`);
}

/**
 * Update entity state
 *
 * @param url - Home Assistant instance URL
 * @param token - Long-lived access token
 * @param entityId - Entity ID
 * @param state - New state
 * @param attributes - Optional attributes
 * @returns Updated entity state
 */
export async function updateEntityState(
  url: string,
  token: string,
  entityId: string,
  state: string,
  attributes?: Record<string, any>
): Promise<HAState> {
  return fetchHA<HAState>(
    url,
    token,
    `states/${entityId}`,
    {
      method: 'POST',
      body: JSON.stringify({
        state,
        attributes: attributes || {}
      })
    }
  );
}
