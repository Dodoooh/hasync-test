/**
 * Entities API Client
 * Production-ready client with retry logic, error handling, and type safety
 */

import type { Entity, ApiError } from '../types';

// Configuration constants
const API_BASE_URL = '/api';
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 5000; // 5 seconds

/**
 * Custom error class for API errors
 */
export class EntitiesApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'EntitiesApiError';
  }
}

/**
 * Retry configuration interface
 */
interface RetryConfig {
  maxRetries: number;
  currentAttempt: number;
  lastError?: Error;
}

/**
 * Response type guard for Entity array
 */
function isEntityArray(data: unknown): data is Entity[] {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true; // Empty array is valid

  // Check first item has required Entity properties
  const firstItem = data[0];
  return (
    typeof firstItem === 'object' &&
    firstItem !== null &&
    'id' in firstItem &&
    'name' in firstItem &&
    'type' in firstItem &&
    typeof firstItem.id === 'string' &&
    typeof firstItem.name === 'string' &&
    typeof firstItem.type === 'string'
  );
}

/**
 * Response type guard for object containing entities
 */
function isEntityResponse(data: unknown): data is { entities: Entity[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'entities' in data &&
    Array.isArray((data as any).entities)
  );
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number): number {
  const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
  return Math.min(delay, MAX_RETRY_DELAY);
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Log API request attempt
 */
function logAttempt(
  method: string,
  url: string,
  attempt: number,
  maxRetries: number
): void {
  const attemptInfo = attempt > 0 ? ` (retry ${attempt}/${maxRetries})` : '';
  console.log(`[EntitiesAPI] ${method} ${url}${attemptInfo}`);
}

/**
 * Log API error
 */
function logError(
  method: string,
  url: string,
  error: Error,
  attempt: number,
  willRetry: boolean
): void {
  const retryInfo = willRetry ? ' - will retry' : ' - final attempt';
  console.error(
    `[EntitiesAPI] ${method} ${url} failed on attempt ${attempt + 1}${retryInfo}:`,
    {
      error: error.message,
      stack: error.stack,
      name: error.name
    }
  );
}

/**
 * Log successful response
 */
function logSuccess(
  method: string,
  url: string,
  attempt: number,
  dataLength?: number
): void {
  const attemptInfo = attempt > 0 ? ` after ${attempt + 1} attempts` : '';
  const lengthInfo = dataLength !== undefined ? ` (${dataLength} items)` : '';
  console.log(`[EntitiesAPI] ${method} ${url} succeeded${attemptInfo}${lengthInfo}`);
}

/**
 * Parse and validate response data
 */
async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');

  if (!contentType?.includes('application/json')) {
    throw new EntitiesApiError(
      `Expected JSON response, got ${contentType}`,
      'INVALID_CONTENT_TYPE',
      { contentType },
      response.status
    );
  }

  try {
    const data = await response.json();
    return data as T;
  } catch (error) {
    throw new EntitiesApiError(
      'Failed to parse JSON response',
      'JSON_PARSE_ERROR',
      { originalError: error instanceof Error ? error.message : String(error) },
      response.status
    );
  }
}

/**
 * Handle HTTP errors
 */
async function handleHttpError(response: Response): Promise<never> {
  let errorDetails: ApiError | undefined;

  try {
    errorDetails = await response.json();
  } catch {
    // If JSON parsing fails, use default error message
  }

  const message = errorDetails?.message || `HTTP ${response.status}: ${response.statusText}`;
  const code = errorDetails?.code || `HTTP_${response.status}`;

  throw new EntitiesApiError(
    message,
    code,
    errorDetails?.details,
    response.status
  );
}

/**
 * Execute fetch with retry logic
 */
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  validator?: (data: unknown) => data is T
): Promise<T> {
  const config: RetryConfig = {
    maxRetries: MAX_RETRIES,
    currentAttempt: 0
  };

  const method = options.method || 'GET';

  while (config.currentAttempt <= config.maxRetries) {
    try {
      logAttempt(method, url, config.currentAttempt, config.maxRetries);

      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        await handleHttpError(response);
      }

      const data = await parseResponse<T>(response);

      // Validate response if validator provided
      if (validator && !validator(data)) {
        throw new EntitiesApiError(
          'Response validation failed',
          'VALIDATION_ERROR',
          { receivedData: data }
        );
      }

      const dataLength = Array.isArray(data) ? data.length : undefined;
      logSuccess(method, url, config.currentAttempt, dataLength);

      return data;

    } catch (error) {
      config.lastError = error instanceof Error ? error : new Error(String(error));

      const willRetry = config.currentAttempt < config.maxRetries;
      logError(method, url, config.lastError, config.currentAttempt, willRetry);

      if (!willRetry) {
        // Final attempt failed
        if (error instanceof EntitiesApiError) {
          throw error;
        }
        throw new EntitiesApiError(
          `Failed after ${config.maxRetries + 1} attempts: ${config.lastError.message}`,
          'MAX_RETRIES_EXCEEDED',
          {
            attempts: config.maxRetries + 1,
            lastError: config.lastError.message
          }
        );
      }

      // Calculate backoff and wait before retry
      const backoffDelay = calculateBackoff(config.currentAttempt);
      console.log(`[EntitiesAPI] Waiting ${backoffDelay}ms before retry...`);
      await sleep(backoffDelay);

      config.currentAttempt++;
    }
  }

  // Should never reach here, but TypeScript needs this
  throw new EntitiesApiError(
    'Unexpected error in retry logic',
    'RETRY_LOGIC_ERROR'
  );
}

/**
 * Fetch all entities from the API
 * Handles both array and object responses
 * Includes retry logic with exponential backoff
 *
 * @returns Promise resolving to array of Entity objects
 * @throws EntitiesApiError on failure after retries
 *
 * @example
 * ```typescript
 * try {
 *   const entities = await fetchEntities();
 *   console.log(`Loaded ${entities.length} entities`);
 * } catch (error) {
 *   if (error instanceof EntitiesApiError) {
 *     console.error('API Error:', error.code, error.message);
 *   }
 * }
 * ```
 */
export async function fetchEntities(): Promise<Entity[]> {
  const url = `${API_BASE_URL}/entities`;

  console.log('[EntitiesAPI] Starting fetchEntities request');

  try {
    const data = await fetchWithRetry<Entity[] | { entities: Entity[] }>(url);

    // Handle both response formats
    let entities: Entity[];

    if (isEntityArray(data)) {
      entities = data;
    } else if (isEntityResponse(data)) {
      entities = data.entities;
    } else {
      throw new EntitiesApiError(
        'Response is neither Entity[] nor { entities: Entity[] }',
        'INVALID_RESPONSE_FORMAT',
        { receivedData: data }
      );
    }

    // Final validation of each entity
    entities.forEach((entity, index) => {
      if (!entity.id || !entity.name || !entity.type) {
        throw new EntitiesApiError(
          `Invalid entity at index ${index}: missing required fields`,
          'INVALID_ENTITY_DATA',
          { entity, index }
        );
      }
    });

    console.log(`[EntitiesAPI] Successfully fetched ${entities.length} entities`);
    return entities;

  } catch (error) {
    console.error('[EntitiesAPI] fetchEntities failed:', error);
    throw error;
  }
}

/**
 * Fetch a single entity by ID
 *
 * @param id - Entity ID to fetch
 * @returns Promise resolving to Entity object
 * @throws EntitiesApiError on failure after retries
 */
export async function fetchEntityById(id: string): Promise<Entity> {
  if (!id || typeof id !== 'string') {
    throw new EntitiesApiError(
      'Invalid entity ID',
      'INVALID_PARAMETER',
      { id }
    );
  }

  const url = `${API_BASE_URL}/entities/${encodeURIComponent(id)}`;

  console.log(`[EntitiesAPI] Fetching entity with ID: ${id}`);

  try {
    const entity = await fetchWithRetry<Entity>(url);

    if (!entity.id || !entity.name || !entity.type) {
      throw new EntitiesApiError(
        'Fetched entity is missing required fields',
        'INVALID_ENTITY_DATA',
        { entity }
      );
    }

    console.log(`[EntitiesAPI] Successfully fetched entity: ${entity.name}`);
    return entity;

  } catch (error) {
    console.error(`[EntitiesAPI] fetchEntityById(${id}) failed:`, error);
    throw error;
  }
}

/**
 * Update entity state
 *
 * @param id - Entity ID to update
 * @param state - New state value
 * @returns Promise resolving to updated Entity
 * @throws EntitiesApiError on failure after retries
 */
export async function updateEntityState(id: string, state: string): Promise<Entity> {
  if (!id || typeof id !== 'string') {
    throw new EntitiesApiError(
      'Invalid entity ID',
      'INVALID_PARAMETER',
      { id }
    );
  }

  const url = `${API_BASE_URL}/entities/${encodeURIComponent(id)}/state`;

  console.log(`[EntitiesAPI] Updating entity ${id} state to: ${state}`);

  try {
    const entity = await fetchWithRetry<Entity>(url, {
      method: 'PUT',
      body: JSON.stringify({ state })
    });

    console.log(`[EntitiesAPI] Successfully updated entity ${id}`);
    return entity;

  } catch (error) {
    console.error(`[EntitiesAPI] updateEntityState(${id}) failed:`, error);
    throw error;
  }
}

// Export types for consumers
export type { Entity, ApiError };
