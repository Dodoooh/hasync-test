import { useState, useCallback } from 'react';
import { apiClient } from '@/api/client';
import type { ApiError } from '@/types';

interface UseApiOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: ApiError) => void;
}

export const useApi = <T = any>(options: UseApiOptions = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async (apiCall: () => Promise<T>) => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall();
        setData(result);
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError);
        options.onError?.(apiError);
        throw apiError;
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return {
    loading,
    error,
    data,
    execute,
    reset,
  };
};

// Specific hooks for common operations
export const useEntities = () => {
  const api = useApi();

  const fetchEntities = useCallback(() => {
    return api.execute(() => apiClient.getEntities());
  }, [api]);

  const syncEntities = useCallback(() => {
    return api.execute(() => apiClient.syncEntities());
  }, [api]);

  return {
    ...api,
    fetchEntities,
    syncEntities,
  };
};

export const useAreas = () => {
  const api = useApi();

  const fetchAreas = useCallback(() => {
    return api.execute(() => apiClient.getAreas());
  }, [api]);

  const createArea = useCallback((area: { name: string; entityIds: string[] }) => {
    return api.execute(() => apiClient.createArea(area));
  }, [api]);

  const updateArea = useCallback((id: string, area: Partial<{ name: string; entityIds: string[] }>) => {
    return api.execute(() => apiClient.updateArea(id, area));
  }, [api]);

  const deleteArea = useCallback((id: string) => {
    return api.execute(() => apiClient.deleteArea(id));
  }, [api]);

  return {
    ...api,
    fetchAreas,
    createArea,
    updateArea,
    deleteArea,
  };
};

export const useClients = () => {
  const api = useApi();

  const fetchClients = useCallback(() => {
    return api.execute(() => apiClient.getClients());
  }, [api]);

  const updateClient = useCallback((id: string, client: Partial<any>) => {
    return api.execute(() => apiClient.updateClient(id, client));
  }, [api]);

  const deleteClient = useCallback((id: string) => {
    return api.execute(() => apiClient.deleteClient(id));
  }, [api]);

  return {
    ...api,
    fetchClients,
    updateClient,
    deleteClient,
  };
};
