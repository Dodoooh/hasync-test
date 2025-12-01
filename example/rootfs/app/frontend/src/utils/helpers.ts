import type { Entity, EntityFilter } from '@/types';

export const filterEntities = (entities: Entity[], filter: EntityFilter): Entity[] => {
  return entities.filter((entity) => {
    // Skip invalid entities
    if (!entity || !entity.id || !entity.name) {
      return false;
    }

    // Search filter
    if (filter.search) {
      const search = filter.search.toLowerCase();
      if (
        !entity.name.toLowerCase().includes(search) &&
        !entity.id.toLowerCase().includes(search)
      ) {
        return false;
      }
    }

    // Type filter
    if (filter.types.length > 0 && !filter.types.includes(entity.type)) {
      return false;
    }

    // Domain filter (extract domain from entity.id)
    if (filter.domains && filter.domains.length > 0) {
      const domain = entity.id.split('.')[0];
      if (!filter.domains.includes(domain)) {
        return false;
      }
    }

    // State filter
    if (filter.states && filter.states.length > 0 && entity.state) {
      if (!filter.states.includes(entity.state.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
};

export const groupEntitiesByType = (entities: Entity[]): Record<string, Entity[]> => {
  return entities.reduce((acc, entity) => {
    if (!acc[entity.type]) {
      acc[entity.type] = [];
    }
    acc[entity.type].push(entity);
    return acc;
  }, {} as Record<string, Entity[]>);
};

export const formatEntityState = (entity: Entity): string => {
  if (!entity.state) return 'Unknown';

  switch (entity.type) {
    case 'light':
      return entity.state === 'on' ? 'On' : 'Off';
    case 'switch':
      return entity.state === 'on' ? 'On' : 'Off';
    case 'sensor':
      return entity.state;
    case 'climate':
      return `${entity.state}°`;
    default:
      return entity.state;
  }
};

export const getEntityIcon = (type: string): string => {
  const iconMap: Record<string, string> = {
    light: '💡',
    switch: '🔌',
    sensor: '📊',
    climate: '🌡️',
    cover: '🪟',
    media_player: '📺',
    camera: '📷',
    other: '⚙️',
  };
  return iconMap[type] || iconMap.other;
};

export const generatePIN = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const formatDateTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
