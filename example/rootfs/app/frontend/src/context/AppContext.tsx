import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Entity, Area, Dashboard, Client, AppConfig, EntityFilter } from '@/types';

interface AppState {
  // Auth
  isAuthenticated: boolean;
  ingressUrl: string;
  accessToken: string;

  // Data
  entities: Entity[];
  areas: Area[];
  dashboards: Dashboard[];
  clients: Client[];

  // UI State
  entityFilter: EntityFilter;
  selectedEntities: Set<string>;
  selectedArea: string | null;
  selectedDashboard: string | null;
  selectedClient: string | null;

  // Loading states
  loading: {
    entities: boolean;
    areas: boolean;
    dashboards: boolean;
    clients: boolean;
  };

  // Error states
  errors: {
    entities: string | null;
    areas: string | null;
    dashboards: string | null;
    clients: string | null;
  };

  // Actions
  setAuth: (ingressUrl: string, token: string) => void;
  clearAuth: () => void;
  setEntities: (entities: Entity[]) => void;
  setAreas: (areas: Area[] | ((prev: Area[]) => Area[])) => void;
  setDashboards: (dashboards: Dashboard[]) => void;
  setClients: (clients: Client[]) => void;
  updateEntity: (entity: Entity) => void;
  updateClient: (client: Client) => void;
  setEntityFilter: (filter: Partial<EntityFilter>) => void;
  toggleEntitySelection: (entityId: string) => void;
  clearEntitySelection: () => void;
  selectAllEntities: () => void;
  setSelectedArea: (areaId: string | null) => void;
  setSelectedDashboard: (dashboardId: string | null) => void;
  setSelectedClient: (clientId: string | null) => void;
  setLoading: (key: keyof AppState['loading'], value: boolean) => void;
  setError: (key: keyof AppState['errors'], error: string | null) => void;
  clearErrors: () => void;

  // Debug utilities
  logEntities: () => void;
  getEntityCount: () => number;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      ingressUrl: '',
      accessToken: '',
      entities: [],
      areas: [],
      dashboards: [],
      clients: [],
      entityFilter: {
        search: '',
        types: [],
        areas: [],
        states: [],
        domains: [],
      },
      selectedEntities: new Set(),
      selectedArea: null,
      selectedDashboard: null,
      selectedClient: null,
      loading: {
        entities: false,
        areas: false,
        dashboards: false,
        clients: false,
      },
      errors: {
        entities: null,
        areas: null,
        dashboards: null,
        clients: null,
      },

      // Actions
      setAuth: (ingressUrl, token) =>
        set({
          isAuthenticated: true,
          ingressUrl,
          accessToken: token,
        }),

      clearAuth: () =>
        set({
          isAuthenticated: false,
          ingressUrl: '',
          accessToken: '',
          entities: [],
          areas: [],
          dashboards: [],
          clients: [],
          selectedEntities: new Set(),
          selectedArea: null,
          selectedDashboard: null,
          selectedClient: null,
          errors: {
            entities: null,
            areas: null,
            dashboards: null,
            clients: null,
          },
        }),

      setEntities: (entities) =>
        set({
          entities,
          loading: { ...get().loading, entities: false },
          errors: { ...get().errors, entities: null },
        }),

      setAreas: (areas) => {
        // Support both functional updates and direct values
        if (typeof areas === 'function') {
          set((state) => {
            const newAreas = areas(state.areas);
            // Validate the result is an array
            if (!Array.isArray(newAreas)) {
              console.error('[useAppStore] setAreas function returned non-array:', newAreas);
              return state; // Return unchanged state
            }
            return { areas: newAreas };
          });
        } else {
          // Direct value - ensure it's an array
          if (!Array.isArray(areas)) {
            console.error('[useAppStore] setAreas called with non-array:', areas);
            return;
          }
          set({ areas });
        }
      },

      setDashboards: (dashboards) => set({ dashboards }),

      setClients: (clients) => set({ clients }),

      updateEntity: (entity) =>
        set((state) => ({
          entities: state.entities.map((e) =>
            e.id === entity.id ? entity : e
          ),
        })),

      updateClient: (client) =>
        set((state) => ({
          clients: state.clients.map((c) =>
            c.id === client.id ? client : c
          ),
        })),

      setEntityFilter: (filter) =>
        set((state) => ({
          entityFilter: { ...state.entityFilter, ...filter },
        })),

      toggleEntitySelection: (entityId) =>
        set((state) => {
          const newSelection = new Set(state.selectedEntities);
          if (newSelection.has(entityId)) {
            newSelection.delete(entityId);
          } else {
            newSelection.add(entityId);
          }
          return { selectedEntities: newSelection };
        }),

      clearEntitySelection: () => set({ selectedEntities: new Set() }),

      selectAllEntities: () =>
        set((state) => ({
          selectedEntities: new Set(state.entities.map((e) => e.id)),
        })),

      setSelectedArea: (areaId) => set({ selectedArea: areaId }),

      setSelectedDashboard: (dashboardId) => set({ selectedDashboard: dashboardId }),

      setSelectedClient: (clientId) => set({ selectedClient: clientId }),

      setLoading: (key, value) =>
        set((state) => ({
          loading: { ...state.loading, [key]: value },
        })),

      setError: (key, error) =>
        set((state) => ({
          errors: { ...state.errors, [key]: error },
          loading: { ...state.loading, [key]: false },
        })),

      clearErrors: () =>
        set({
          errors: {
            entities: null,
            areas: null,
            dashboards: null,
            clients: null,
          },
        }),

      // Debug utilities
      logEntities: () => {
        const state = get();
        console.log('=== AppContext Entity Debug ===');
        console.log('Total entities:', state.entities.length);
        console.log('Entities:', state.entities);
        console.log('Loading state:', state.loading.entities);
        console.log('Error state:', state.errors.entities);
        console.log('Selected entities:', Array.from(state.selectedEntities));
        console.log('Entity filter:', state.entityFilter);
        console.log('==============================');
      },

      getEntityCount: () => get().entities.length,
    }),
    {
      name: 'hasync-storage',
      partialize: (state) => ({
        // Auth data - persist token for session restoration
        ingressUrl: state.ingressUrl,
        accessToken: state.accessToken, // Persist token for auto-login
        // NOTE: isAuthenticated will be derived from accessToken presence on load

        // Entity data - persist for page reload but clear on logout
        entities: state.entities,
        areas: state.areas,
        dashboards: state.dashboards,
        clients: state.clients,

        // UI state - persist for better UX
        entityFilter: state.entityFilter,
        selectedArea: state.selectedArea,
        selectedDashboard: state.selectedDashboard,
        selectedClient: state.selectedClient,
      }),
      // Restore isAuthenticated based on token presence
      onRehydrateStorage: () => (state) => {
        if (state && state.accessToken) {
          state.isAuthenticated = true;
        }
      },
    }
  )
);
