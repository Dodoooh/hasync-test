import React, { useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Checkbox,
  FormGroup,
  FormControlLabel,
  Chip,
  Typography,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Stack,
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import ClearIcon from '@mui/icons-material/Clear';
import { useAppStore } from '@/context/AppContext';
import { filterEntities, getEntityIcon, groupEntitiesByType } from '@/utils/helpers';
import type { Entity } from '@/types';

interface EntitySelectorProps {
  onSelectionChange?: (selectedIds: Set<string>) => void;
  multiSelect?: boolean;
  title?: string;
}

export const EntitySelector: React.FC<EntitySelectorProps> = ({
  onSelectionChange,
  multiSelect = true,
  title = 'Select Entities',
}) => {
  const {
    entities,
    entityFilter,
    selectedEntities,
    loading,
    setEntityFilter,
    toggleEntitySelection,
    clearEntitySelection,
    selectAllEntities,
  } = useAppStore();

  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['light', 'switch']));

  // Local search state for immediate UI feedback
  const [searchTerm, setSearchTerm] = useState(entityFilter.search);

  // Debounce search input with 300ms delay
  const [debouncedSearch] = useDebounce(searchTerm, 300);

  // Sync debounced search to global state
  React.useEffect(() => {
    if (debouncedSearch !== entityFilter.search) {
      setEntityFilter({ search: debouncedSearch });
    }
  }, [debouncedSearch, entityFilter.search, setEntityFilter]);

  // Debug logging
  React.useEffect(() => {
    console.log('[EntitySelector] Entities received:', {
      count: entities.length,
      entities: entities,
      loading: loading.entities,
    });
  }, [entities, loading.entities]);

  React.useEffect(() => {
    console.log('[EntitySelector] Entity filter changed:', entityFilter);
  }, [entityFilter]);

  React.useEffect(() => {
    console.log('[EntitySelector] Selected entities:', {
      count: selectedEntities.size,
      ids: Array.from(selectedEntities),
    });
  }, [selectedEntities]);

  // Available domains (extracted from entity IDs) - used as "types"
  const entityDomains = useMemo(() => {
    return Array.from(new Set(entities.map((e) => e.id.split('.')[0]))).sort();
  }, [entities]);

  // Only show useful states
  const usefulStates = ['on', 'off', 'unknown'];
  const availableStates = useMemo(() => {
    const states = new Set<string>();
    entities.forEach((e) => {
      if (e.state && usefulStates.includes(e.state.toLowerCase())) {
        states.add(e.state.toLowerCase());
      }
    });
    return Array.from(states).sort();
  }, [entities]);

  // Memoized filtered entities with debounced search
  const filteredEntities = useMemo(() => {
    const filtered = filterEntities(entities, entityFilter);
    console.log('[EntitySelector] Filtered entities:', {
      total: entities.length,
      filtered: filtered.length,
      filter: entityFilter,
    });
    return filtered;
  }, [entities, entityFilter]);

  // Memoized grouped entities to prevent unnecessary recalculations
  const groupedEntities = useMemo(() => {
    const grouped = groupEntitiesByType(filteredEntities);
    console.log('[EntitySelector] Grouped entities:', {
      types: Object.keys(grouped),
      counts: Object.entries(grouped).map(([type, ents]) => ({ type, count: ents.length })),
    });
    return grouped;
  }, [filteredEntities]);

  // Check if search is actively debouncing
  const isSearching = searchTerm !== debouncedSearch;

  const handleToggleEntity = (entityId: string) => {
    toggleEntitySelection(entityId);
    onSelectionChange?.(selectedEntities);
  };

  const handleSelectAll = () => {
    selectAllEntities();
    onSelectionChange?.(new Set(entities.map((e) => e.id)));
  };

  const handleClearSelection = () => {
    clearEntitySelection();
    onSelectionChange?.(new Set());
  };

  const toggleTypeExpansion = (type: string) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedTypes(newExpanded);
  };

  const handleDomainFilterToggle = (domain: string) => {
    const newDomains = entityFilter.domains.includes(domain)
      ? entityFilter.domains.filter((d) => d !== domain)
      : [...entityFilter.domains, domain];
    setEntityFilter({ domains: newDomains });
  };

  const handleStateFilterToggle = (state: string) => {
    const newStates = entityFilter.states.includes(state)
      ? entityFilter.states.filter((s) => s !== state)
      : [...entityFilter.states, state];
    setEntityFilter({ states: newStates });
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          {/* Header */}
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">{title}</Typography>
            <Box>
              <Button
                size="small"
                startIcon={<SelectAllIcon />}
                onClick={handleSelectAll}
                disabled={!multiSelect}
              >
                Select All
              </Button>
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={handleClearSelection}
                disabled={selectedEntities.size === 0}
              >
                Clear
              </Button>
            </Box>
          </Box>

          {/* Search with debouncing and loading indicator */}
          <TextField
            fullWidth
            size="small"
            placeholder="Search entities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />,
              endAdornment: isSearching ? (
                <CircularProgress size={20} sx={{ color: 'action.active' }} />
              ) : null,
            }}
            helperText={isSearching ? 'Searching...' : ''}
          />

          {/* Type/Domain filters */}
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              Filter by type (domain):
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap" sx={{ maxHeight: 150, overflowY: 'auto' }}>
              {entityDomains.map((domain) => (
                <Chip
                  key={domain}
                  label={domain}
                  size="small"
                  onClick={() => handleDomainFilterToggle(domain)}
                  color={entityFilter.domains.includes(domain) ? 'primary' : 'default'}
                  variant={entityFilter.domains.includes(domain) ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          </Box>

          {/* Status filters - only useful states */}
          {availableStates.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Filter by status:
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {availableStates.map((state) => (
                  <Chip
                    key={state}
                    label={state}
                    size="small"
                    onClick={() => handleStateFilterToggle(state)}
                    color={entityFilter.states.includes(state) ? 'secondary' : 'default'}
                    variant={entityFilter.states.includes(state) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Selected count and result count */}
          <Box display="flex" gap={1} alignItems="center">
            {selectedEntities.size > 0 && (
              <Chip
                label={`${selectedEntities.size} selected`}
                color="primary"
                size="small"
              />
            )}
            <Chip
              label={`${filteredEntities.length} result${filteredEntities.length !== 1 ? 's' : ''}`}
              color="default"
              variant="outlined"
              size="small"
            />
          </Box>

          <Divider />

          {/* Entity list */}
          <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
            {loading.entities ? (
              <Typography color="text.secondary" align="center" py={4}>
                Loading entities...
              </Typography>
            ) : entities.length === 0 ? (
              <Typography color="text.secondary" align="center" py={4}>
                No entities available. Please connect to Home Assistant first.
              </Typography>
            ) : Object.entries(groupedEntities).length === 0 ? (
              <Typography color="text.secondary" align="center" py={4}>
                No entities match your filters. Try adjusting the search or type filters.
              </Typography>
            ) : (
              Object.entries(groupedEntities).map(([type, typeEntities]) => (
                <Box key={type} mb={2}>
                  <ListItem
                    button
                    onClick={() => toggleTypeExpansion(type)}
                    sx={{ bgcolor: 'action.hover', borderRadius: 1 }}
                  >
                    <ListItemText
                      primary={
                        <Typography variant="subtitle2">
                          {getEntityIcon(type)} {type.toUpperCase()} ({typeEntities.length})
                        </Typography>
                      }
                    />
                  </ListItem>
                  {expandedTypes.has(type) && (
                    <List dense>
                      {typeEntities.map((entity) => (
                        <ListItemButton
                          key={entity.id}
                          onClick={() => handleToggleEntity(entity.id)}
                          dense
                        >
                          <ListItemIcon>
                            <Checkbox
                              edge="start"
                              checked={selectedEntities.has(entity.id)}
                              tabIndex={-1}
                              disableRipple
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={entity.name}
                            secondary={entity.id}
                            primaryTypographyProps={{ variant: 'body2' }}
                            secondaryTypographyProps={{ variant: 'caption' }}
                          />
                          {entity.state && (
                            <Chip label={entity.state} size="small" variant="outlined" />
                          )}
                        </ListItemButton>
                      ))}
                    </List>
                  )}
                </Box>
              ))
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};
