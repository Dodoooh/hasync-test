import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { FixedSizeList } from 'react-window';
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  Stack,
  Alert,
  Grid,
  Menu,
  MenuItem,
  Collapse,
  Divider,
  alpha,
  CircularProgress,
  Tooltip,
  Switch,
  FormHelperText,
  FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import GridViewIcon from '@mui/icons-material/GridView';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CategoryIcon from '@mui/icons-material/Category';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useAppStore } from '@/context/AppContext';
import { useAreas } from '@/hooks/useApi';
import { EntitySelector } from './EntitySelector';
import { ErrorSnackbar, SuccessSnackbar } from './ErrorSnackbar';
import { OfflineBanner } from './OfflineBanner';
import { apiClient } from '@/api/client';
import { retryWithBackoff } from '@/utils/retry';
import { getErrorMessage } from '@/utils/errorMessages';
import { validateAreaName, validateEntityIds } from '@/utils/validation';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import type { Area } from '@/types';
import type { FormattedError } from '@/utils/errorMessages';
import { SectionErrorBoundary } from './ErrorBoundary';

// Single consistent color scheme - WCAG AA compliant colors
const AREA_COLOR = '#5568d3'; // Darker shade for better contrast (4.5:1 ratio)

// Focus indicator styles (WCAG 2.1 AA compliant)
const focusStyles = {
  '&:focus-visible': {
    outline: '3px solid #005fcc',
    outlineOffset: '2px',
    borderRadius: '4px',
  },
};

// Simple Entity Chip Component with arrow buttons
interface SimpleEntityChipProps {
  id: string;
  entityName: string;
  color: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const SimpleEntityChip: React.FC<SimpleEntityChipProps> = React.memo(({
  entityName,
  color,
  onMoveUp,
  onMoveDown,
  onDelete,
  isFirst,
  isLast,
}) => {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        p: 0.5,
        border: `1px solid ${alpha(color, 0.5)}`,
        borderRadius: 2,
        backgroundColor: alpha(color, 0.08),
      }}
      role="group"
      aria-label={`Entity ${entityName} controls`}
    >
      <Chip
        label={entityName}
        size="small"
        variant="outlined"
        sx={{
          fontSize: '0.875rem',
          borderColor: color,
          color: '#1a1a1a', // High contrast text
          fontWeight: 500,
        }}
      />
      <Box sx={{ display: 'flex', gap: 0.25 }} role="toolbar" aria-label="Entity position controls">
        <Tooltip title={isFirst ? "Already at top" : "Move up"}>
          <span>
            <IconButton
              size="small"
              onClick={onMoveUp}
              disabled={isFirst}
              aria-label={`Move ${entityName} up in list`}
              aria-disabled={isFirst}
              sx={{
                minWidth: 48,
                minHeight: 48,
                p: 1.5,
                color: isFirst ? '#999999' : '#1a1a1a', // High contrast for enabled state
                '&:hover:not(:disabled)': { bgcolor: alpha(color, 0.15) },
                '&.Mui-disabled': {
                  color: '#999999',
                  opacity: 0.6,
                },
                ...focusStyles,
              }}
            >
              <ArrowUpwardIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={isLast ? "Already at bottom" : "Move down"}>
          <span>
            <IconButton
              size="small"
              onClick={onMoveDown}
              disabled={isLast}
              aria-label={`Move ${entityName} down in list`}
              aria-disabled={isLast}
              sx={{
                minWidth: 48,
                minHeight: 48,
                p: 1.5,
                color: isLast ? '#999999' : '#1a1a1a',
                '&:hover:not(:disabled)': { bgcolor: alpha(color, 0.15) },
                '&.Mui-disabled': {
                  color: '#999999',
                  opacity: 0.6,
                },
                ...focusStyles,
              }}
            >
              <ArrowDownwardIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Remove from area">
          <IconButton
            size="small"
            onClick={onDelete}
            aria-label={`Remove ${entityName} from this area`}
            sx={{
              minWidth: 48,
              minHeight: 48,
              p: 1.5,
              color: '#c62828', // WCAG AA compliant error red
              '&:hover': { bgcolor: alpha('#c62828', 0.1) },
              ...focusStyles,
            }}
          >
            <DeleteIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) =>
  prevProps.id === nextProps.id &&
  prevProps.color === nextProps.color &&
  prevProps.entityName === nextProps.entityName &&
  prevProps.isFirst === nextProps.isFirst &&
  prevProps.isLast === nextProps.isLast
);

// Virtual scrolling row component for react-window
interface VirtualEntityRowData {
  entityIds: string[];
  entities: Array<{ id: string; name: string }>;
  color: string;
  onMoveUp: (entityId: string) => void;
  onMoveDown: (entityId: string) => void;
  onDelete: (entityId: string) => void;
  totalCount: number;
}

interface VirtualEntityRowProps {
  index: number;
  style: React.CSSProperties;
  data: VirtualEntityRowData;
}

const VirtualEntityRow: React.FC<VirtualEntityRowProps> = ({ index, style, data }) => {
  const { entityIds, entities, color, onMoveUp, onMoveDown, onDelete, totalCount } = data;
  const entityId = entityIds[index];
  const entity = entities.find((e) => e.id === entityId);

  if (!entity) return null;

  return (
    <div
      style={{
        ...style,
        padding: '4px 8px',
        boxSizing: 'border-box',
      }}
      role="listitem"
      aria-label={`Entity ${index + 1} of ${totalCount}: ${entity.name}`}
    >
      <SimpleEntityChip
        id={entityId}
        entityName={entity.name}
        color={color}
        onMoveUp={() => onMoveUp(entityId)}
        onMoveDown={() => onMoveDown(entityId)}
        onDelete={() => onDelete(entityId)}
        isFirst={index === 0}
        isLast={index === totalCount - 1}
      />
    </div>
  );
};

interface AreaCardProps {
  area: Area;
  color: string;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggle: (enabled: boolean) => void;
  onMoveEntityUp: (entityId: string) => void;
  onMoveEntityDown: (entityId: string) => void;
  onDeleteEntity: (entityId: string) => void;
  entities: Array<{ id: string; name: string }>;
  isReordering: boolean;
}

const AreaCard: React.FC<AreaCardProps> = memo(({
  area,
  color,
  onEdit,
  onDelete,
  onDuplicate,
  onToggle,
  onMoveEntityUp,
  onMoveEntityDown,
  onDeleteEntity,
  entities,
  isReordering,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [copyTooltip, setCopyTooltip] = useState('Click to copy ID');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const entityCount = useMemo(() => area.entityIds?.length || 0, [area.entityIds]);
  const lastModified = useMemo(() =>
    area.updatedAt
      ? new Date(area.updatedAt).toLocaleDateString()
      : 'Recently',
    [area.updatedAt]
  );

  const handleCopyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(area.id);
      setCopyTooltip('Copied!');
      setStatusMessage(`Area ID ${area.id} copied to clipboard`);
      setTimeout(() => {
        setCopyTooltip('Click to copy ID');
        setStatusMessage('');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy ID:', err);
      setCopyTooltip('Failed to copy');
      setStatusMessage('Failed to copy Area ID to clipboard');
      setTimeout(() => {
        setCopyTooltip('Click to copy ID');
        setStatusMessage('');
      }, 2000);
    }
  }, [area.id]);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>): void => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  }, []);

  const handleMenuClose = useCallback((): void => {
    setAnchorEl(null);
  }, []);

  const handleAction = useCallback((action: () => void): void => {
    handleMenuClose();
    action();
  }, [handleMenuClose]);

  const handleDeleteEntityClick = useCallback((entityId: string): void => {
    setEntityToDelete(entityId);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDeleteEntity = useCallback((): void => {
    if (entityToDelete) {
      onDeleteEntity(entityToDelete);
    }
    setDeleteDialogOpen(false);
    setEntityToDelete(null);
  }, [entityToDelete, onDeleteEntity]);

  const handleCancelDeleteEntity = useCallback((): void => {
    setDeleteDialogOpen(false);
    setEntityToDelete(null);
  }, []);

  return (
    <Card
      component="article"
      aria-label={`Area: ${area.name}`}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'visible',
        transition: 'all 0.2s ease-in-out',
        borderTop: `4px solid ${color}`,
        opacity: isReordering ? 0.6 : 1,
        pointerEvents: isReordering ? 'none' : 'auto',
        '&:hover': {
          transform: isReordering ? 'none' : 'translateY(-4px)',
          boxShadow: (theme) => `0 8px 24px ${alpha(color, 0.2)}`,
        },
      }}
    >
      {/* Screen reader status announcements */}
      <Box
        role="status"
        aria-live="polite"
        aria-atomic="true"
        sx={{
          position: 'absolute',
          left: -10000,
          width: 1,
          height: 1,
          overflow: 'hidden',
        }}
      >
        {statusMessage}
      </Box>
      {/* Color accent bar */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${color}, ${alpha(color, 0.6)})`,
        }}
      />

      <CardContent sx={{ flexGrow: 1, pt: 3 }}>
        {/* Area ID Badge - Prominent display */}
        <Box mb={2}>
          <Tooltip title={copyTooltip} arrow placement="top">
            <Chip
              icon={<FingerprintIcon aria-hidden="true" />}
              label={`ID: ${area.id}`}
              onClick={handleCopyId}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCopyId();
                }
              }}
              size="small"
              tabIndex={0}
              role="button"
              aria-label={`Copy Area ID ${area.id} to clipboard`}
              sx={{
                backgroundColor: alpha(color, 0.12),
                color: '#1a1a1a', // High contrast text
                fontWeight: 600,
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  backgroundColor: alpha(color, 0.25),
                  transform: 'scale(1.02)',
                },
                '& .MuiChip-icon': {
                  color: color,
                },
                ...focusStyles,
              }}
            />
          </Tooltip>
        </Box>

        {/* Header with icon and actions */}
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                background: `linear-gradient(135deg, ${alpha(color, 0.25)}, ${alpha(color, 0.1)})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden="true"
            >
              <GridViewIcon sx={{ color, fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h6" component="h2" fontWeight={600} gutterBottom sx={{ color: '#1a1a1a' }}>
                {area.name}
              </Typography>
              <Box display="flex" alignItems="center" gap={0.5}>
                <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} aria-hidden="true" />
                <Typography variant="caption" color="text.secondary">
                  Last modified: {lastModified}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={0.5}>
            {isReordering && (
              <CircularProgress
                size={20}
                sx={{ mr: 1 }}
                aria-label="Reordering entities"
              />
            )}
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              disabled={isReordering}
              aria-label={`Open menu for ${area.name}`}
              aria-haspopup="menu"
              aria-expanded={Boolean(anchorEl)}
              sx={{
                transition: 'all 0.2s',
                '&:hover': { backgroundColor: alpha(color, 0.1) },
                ...focusStyles,
              }}
            >
              <MoreVertIcon />
            </IconButton>
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            aria-label={`Actions for ${area.name}`}
          >
            <MenuItem
              onClick={() => handleAction(onEdit)}
              aria-label={`Edit ${area.name}`}
            >
              <EditIcon fontSize="small" sx={{ mr: 1 }} aria-hidden="true" />
              Edit Area
            </MenuItem>
            <MenuItem
              onClick={() => handleAction(onDuplicate)}
              aria-label={`Duplicate ${area.name}`}
            >
              <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} aria-hidden="true" />
              Duplicate
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => handleAction(onDelete)}
              sx={{ color: '#c62828' }}
              aria-label={`Delete ${area.name}`}
            >
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} aria-hidden="true" />
              Delete
            </MenuItem>
          </Menu>
        </Box>

        {/* Enable/Disable Toggle */}
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <FormControlLabel
            control={
              <Switch
                checked={area.isEnabled !== false}
                onChange={(e) => {
                  onToggle(e.target.checked);
                  setStatusMessage(`Area ${area.name} ${e.target.checked ? 'enabled' : 'disabled'}`);
                }}
                color="success"
                size="small"
                inputProps={{
                  'aria-label': `${area.isEnabled !== false ? 'Disable' : 'Enable'} ${area.name}`,
                }}
                sx={focusStyles}
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                {area.isEnabled !== false ? 'Enabled' : 'Disabled'}
              </Typography>
            }
          />
        </Box>

        {/* Entity count badge */}
        <Box mb={2}>
          <Chip
            icon={<CategoryIcon aria-hidden="true" />}
            label={`${entityCount} ${entityCount === 1 ? 'Entity' : 'Entities'}`}
            size="small"
            sx={{
              backgroundColor: alpha(color, 0.12),
              color: '#1a1a1a', // High contrast text
              fontWeight: 600,
            }}
            aria-label={`This area contains ${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}`}
          />
          {entityCount > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              mt={1}
              component="p"
              id={`area-${area.id}-instructions`}
            >
              Use arrow buttons or keyboard (Tab to navigate, Enter/Space to activate) to reorder entities
            </Typography>
          )}
        </Box>

        {/* Entity preview with arrow buttons */}
        {entityCount === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontStyle: 'italic' }}
            role="status"
          >
            No entities in this area
          </Typography>
        ) : (
          <Box
            role="region"
            aria-label={`Entities in ${area.name}`}
            aria-describedby={`area-${area.id}-instructions`}
          >
            {/* Show preview (non-virtualized) for small lists */}
            {!expanded && entityCount <= 3 ? (
              <Stack spacing={1} mb={1} role="list" aria-label="Entity list">
                {(area.entityIds || []).map((entityId, index) => {
                  const entity = entities.find((e) => e.id === entityId);
                  const totalCount = area.entityIds?.length || 0;
                  return entity ? (
                    <Box key={entityId} role="listitem">
                      <SimpleEntityChip
                        id={entityId}
                        entityName={entity.name}
                        color={color}
                        onMoveUp={() => {
                          onMoveEntityUp(entityId);
                          setStatusMessage(`Moved ${entity.name} up`);
                        }}
                        onMoveDown={() => {
                          onMoveEntityDown(entityId);
                          setStatusMessage(`Moved ${entity.name} down`);
                        }}
                        onDelete={() => handleDeleteEntityClick(entityId)}
                        isFirst={index === 0}
                        isLast={index === totalCount - 1}
                      />
                    </Box>
                  ) : null;
                })}
              </Stack>
            ) : !expanded ? (
              <Stack spacing={1} mb={1} role="list" aria-label="Entity list preview">
                {(area.entityIds || []).slice(0, 3).map((entityId, index) => {
                  const entity = entities.find((e) => e.id === entityId);
                  const totalCount = area.entityIds?.length || 0;
                  return entity ? (
                    <Box key={entityId} role="listitem">
                      <SimpleEntityChip
                        id={entityId}
                        entityName={entity.name}
                        color={color}
                        onMoveUp={() => {
                          onMoveEntityUp(entityId);
                          setStatusMessage(`Moved ${entity.name} up`);
                        }}
                        onMoveDown={() => {
                          onMoveEntityDown(entityId);
                          setStatusMessage(`Moved ${entity.name} down`);
                        }}
                        onDelete={() => handleDeleteEntityClick(entityId)}
                        isFirst={index === 0}
                        isLast={index === totalCount - 1}
                      />
                    </Box>
                  ) : null;
                })}
                {entityCount > 3 && (
                  <Chip
                    label={`+${entityCount - 3} more`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.875rem', color: '#1a1a1a' }}
                    aria-label={`${entityCount - 3} more entities. Click Show All to view.`}
                  />
                )}
              </Stack>
            ) : (
              /* Use virtual scrolling for expanded view with many items */
              <Collapse in={expanded}>
                <Divider sx={{ my: 2 }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  mb={1}
                  component="h3"
                  sx={{ fontWeight: 600 }}
                >
                  All Entities ({entityCount} total):
                </Typography>
                <Box
                  sx={{
                    border: `1px solid ${alpha(color, 0.3)}`,
                    borderRadius: 1,
                    overflow: 'hidden'
                  }}
                  role="list"
                  aria-label="Complete entity list"
                >
                  <FixedSizeList
                    height={Math.min(600, entityCount * 60)}
                    itemCount={entityCount}
                    itemSize={60}
                    width="100%"
                    itemData={{
                      entityIds: area.entityIds || [],
                      entities,
                      color,
                      onMoveUp: (entityId: string) => {
                        onMoveEntityUp(entityId);
                        const entity = entities.find(e => e.id === entityId);
                        if (entity) setStatusMessage(`Moved ${entity.name} up`);
                      },
                      onMoveDown: (entityId: string) => {
                        onMoveEntityDown(entityId);
                        const entity = entities.find(e => e.id === entityId);
                        if (entity) setStatusMessage(`Moved ${entity.name} down`);
                      },
                      onDelete: handleDeleteEntityClick,
                      totalCount: entityCount,
                    }}
                  >
                    {VirtualEntityRow}
                  </FixedSizeList>
                </Box>
              </Collapse>
            )}
          </Box>
        )}
      </CardContent>

      {/* Expand/Collapse footer */}
      {entityCount > 3 && (
        <CardActions sx={{ justifyContent: 'center', pt: 0 }}>
          <Button
            size="small"
            onClick={() => {
              setExpanded(!expanded);
              setStatusMessage(expanded ? 'Collapsed entity list' : 'Expanded entity list');
            }}
            endIcon={expanded ? <ExpandLessIcon aria-hidden="true" /> : <ExpandMoreIcon aria-hidden="true" />}
            sx={{
              color: '#1a1a1a',
              fontWeight: 500,
              ...focusStyles,
            }}
            disabled={isReordering}
            aria-expanded={expanded}
            aria-label={expanded ? 'Show less entities' : `Show all ${entityCount} entities`}
          >
            {expanded ? 'Show Less' : 'Show All'}
          </Button>
        </CardActions>
      )}

      {/* Delete Entity Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCancelDeleteEntity}
        aria-labelledby="delete-entity-dialog-title"
      >
        <DialogTitle id="delete-entity-dialog-title">
          Remove Entity from Area?
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove this entity from the area? The entity itself will not be deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeleteEntity}>Cancel</Button>
          <Button onClick={handleConfirmDeleteEntity} color="error" variant="contained">
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
});

export const AreaManagerEnhanced: React.FC = () => {
  const { areas: rawAreas, entities, selectedEntities, setAreas } = useAppStore();
  const { createArea, updateArea, deleteArea, loading } = useAreas();

  // Defensive: Ensure areas is always an array
  const areas = React.useMemo(() => {
    if (Array.isArray(rawAreas)) {
      return rawAreas;
    }
    console.error('[AreaManager] areas is not an array:', rawAreas);
    return [];
  }, [rawAreas]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [areaName, setAreaName] = useState('');
  const [showEntitySelector, setShowEntitySelector] = useState(false);
  const [reorderingAreaId, setReorderingAreaId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Ref for skip link target
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Validation state
  const [nameError, setNameError] = useState<string | null>(null);
  const [entityError, setEntityError] = useState<string | null>(null);

  // Network status
  const { status: networkStatus, queueOperation, queueSize, isProcessingQueue } = useNetworkStatus();

  // Enhanced error handling
  const [errorSnackbar, setErrorSnackbar] = useState<{
    open: boolean;
    error: FormattedError | null;
    retryAction?: () => void;
  }>({
    open: false,
    error: null,
  });

  const [successSnackbar, setSuccessSnackbar] = useState<{
    open: boolean;
    message: string;
  }>({
    open: false,
    message: '',
  });

  // Real-time validation
  useEffect(() => {
    if (dialogOpen) {
      setNameError(validateAreaName(areaName));
    }
  }, [areaName, dialogOpen]);

  useEffect(() => {
    if (dialogOpen) {
      setEntityError(validateEntityIds(Array.from(selectedEntities)));
    }
  }, [selectedEntities, dialogOpen]);

  const handleCreateNew = useCallback((): void => {
    setEditingArea(null);
    setAreaName('');
    setNameError(null);
    setEntityError(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((area: Area): void => {
    setEditingArea(area);
    setAreaName(area.name);
    setNameError(null);
    setEntityError(null);
    setDialogOpen(true);
  }, []);

  const handleSave = async (): Promise<void> => {
    // Validate before saving
    const nameValidation = validateAreaName(areaName);
    const entityValidation = validateEntityIds(Array.from(selectedEntities));

    if (nameValidation) {
      setNameError(nameValidation);
      return;
    }

    if (entityValidation) {
      setEntityError(entityValidation);
      return;
    }

    const performSave = async () => {
      const operation = editingArea ? 'update' : 'create';
      const resource = 'area';

      try {
        const result = await retryWithBackoff(
          async () => {
            if (editingArea) {
              return await updateArea(editingArea.id, {
                name: areaName.trim(),
                entityIds: Array.from(selectedEntities),
              });
            } else {
              return await createArea({
                name: areaName.trim(),
                entityIds: Array.from(selectedEntities),
              });
            }
          },
          {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (attempt) => {
              setRetryCount(attempt);
            },
          }
        );

        // Update local state using functional updates
        if (editingArea) {
          setAreas((prevAreas: Area[]) => prevAreas.map((a: Area) => (a.id === result.id ? result : a)));
        } else {
          setAreas((prevAreas: Area[]) => [...prevAreas, result]);
        }

        setSuccessSnackbar({
          open: true,
          message: `Area ${editingArea ? 'updated' : 'created'} successfully`,
        });

        setDialogOpen(false);
        setEditingArea(null);
        setAreaName('');
        setRetryCount(0);
      } catch (err) {
        console.error('Failed to save area:', err);
        const formattedError = getErrorMessage(err, { operation, resource });
        setErrorSnackbar({
          open: true,
          error: formattedError,
          retryAction: () => handleSave(),
        });
      }
    };

    // Queue if offline, execute immediately if online
    if (!networkStatus.online) {
      queueOperation(`save-area-${Date.now()}`, performSave);
      setSuccessSnackbar({
        open: true,
        message: 'Operation queued. Will sync when online.',
      });
      setDialogOpen(false);
    } else {
      await performSave();
    }
  };

  const handleDelete = async (areaId: string): Promise<void> => {
    if (!confirm('Are you sure you want to delete this area?')) return;

    const performDelete = async () => {
      // CAPTURE original state BEFORE optimistic update
      const originalAreas = [...areas];

      try {
        // Optimistic update using functional state update
        setAreas((prevAreas: Area[]) => prevAreas.filter((a: Area) => a.id !== areaId));

        await retryWithBackoff(
          () => deleteArea(areaId),
          {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (attempt) => setRetryCount(attempt),
          }
        );

        setSuccessSnackbar({
          open: true,
          message: 'Area deleted successfully',
        });
        setRetryCount(0);
      } catch (err) {
        console.error('Failed to delete area:', err);
        // ROLLBACK using captured original state
        setAreas(originalAreas);
        const formattedError = getErrorMessage(err, { operation: 'delete', resource: 'area' });
        setErrorSnackbar({
          open: true,
          error: formattedError,
          retryAction: () => handleDelete(areaId),
        });
      }
    };

    if (!networkStatus.online) {
      queueOperation(`delete-area-${areaId}`, performDelete);
      setSuccessSnackbar({
        open: true,
        message: 'Delete queued. Will sync when online.',
      });
    } else {
      await performDelete();
    }
  };

  const handleToggleArea = async (areaId: string, enabled: boolean): Promise<void> => {
    const performToggle = async () => {
      // CAPTURE original state BEFORE optimistic update
      const originalAreas = [...areas];

      try {
        // Optimistic update using functional state update
        setAreas((prevAreas: Area[]) => prevAreas.map((a: Area) =>
          a.id === areaId ? { ...a, isEnabled: enabled } : a
        ));

        const updatedArea = await retryWithBackoff(
          () => apiClient.patch(`/areas/${areaId}/toggle`, { enabled }),
          {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (attempt) => setRetryCount(attempt),
          }
        );

        // Update with server response using functional update
        setAreas((prevAreas: Area[]) => prevAreas.map((a: Area) =>
          a.id === updatedArea.id ? updatedArea : a
        ));

        setSuccessSnackbar({
          open: true,
          message: `Area ${enabled ? 'enabled' : 'disabled'} successfully`,
        });
        setRetryCount(0);
      } catch (err) {
        console.error('Failed to toggle area:', err);
        // ROLLBACK using captured original state
        setAreas(originalAreas);
        const formattedError = getErrorMessage(err, { operation: 'toggle', resource: 'area' });
        setErrorSnackbar({
          open: true,
          error: formattedError,
          retryAction: () => handleToggleArea(areaId, enabled),
        });
      }
    };

    if (!networkStatus.online) {
      queueOperation(`toggle-area-${areaId}`, performToggle);
      setSuccessSnackbar({
        open: true,
        message: 'Toggle queued. Will sync when online.',
      });
    } else {
      await performToggle();
    }
  };

  const handleDuplicate = async (area: Area): Promise<void> => {
    const performDuplicate = async () => {
      try {
        const created = await retryWithBackoff(
          () => createArea({
            name: `${area.name} (Copy)`,
            entityIds: area.entityIds || [],
          }),
          {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (attempt) => setRetryCount(attempt),
          }
        );

        setAreas((prevAreas: Area[]) => [...prevAreas, created]);
        setSuccessSnackbar({
          open: true,
          message: 'Area duplicated successfully',
        });
        setRetryCount(0);
      } catch (err) {
        console.error('Failed to duplicate area:', err);
        const formattedError = getErrorMessage(err, { operation: 'duplicate', resource: 'area' });
        setErrorSnackbar({
          open: true,
          error: formattedError,
          retryAction: () => handleDuplicate(area),
        });
      }
    };

    if (!networkStatus.online) {
      queueOperation(`duplicate-area-${area.id}`, performDuplicate);
      setSuccessSnackbar({
        open: true,
        message: 'Duplicate queued. Will sync when online.',
      });
    } else {
      await performDuplicate();
    }
  };

  const handleMoveEntityUp = async (areaId: string, entityId: string): Promise<void> => {
    const area = areas.find((a) => a.id === areaId);
    if (!area || !area.entityIds) return;

    const currentIndex = area.entityIds.indexOf(entityId);
    if (currentIndex <= 0) return; // Already at top or not found

    // CAPTURE original state BEFORE optimistic update
    const originalAreas = [...areas];

    // Swap with previous entity
    const newEntityIds = [...area.entityIds];
    [newEntityIds[currentIndex - 1], newEntityIds[currentIndex]] =
      [newEntityIds[currentIndex], newEntityIds[currentIndex - 1]];

    // Optimistic update using functional state update
    setAreas(prevAreas => prevAreas.map((a) =>
      a.id === areaId ? { ...a, entityIds: newEntityIds } : a
    ));

    setReorderingAreaId(areaId);
    try {
      await retryWithBackoff(
        () => apiClient.patchArea(areaId, { entityIds: newEntityIds }),
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt) => setRetryCount(attempt),
        }
      );
      setSuccessSnackbar({
        open: true,
        message: 'Entity moved up',
      });
      setRetryCount(0);
    } catch (err) {
      console.error('Failed to move entity up:', err);
      // ROLLBACK using captured original state
      setAreas(originalAreas);
      const formattedError = getErrorMessage(err, { operation: 'reorder', resource: 'entities' });
      setErrorSnackbar({
        open: true,
        error: formattedError,
        retryAction: () => handleMoveEntityUp(areaId, entityId),
      });
    } finally {
      setReorderingAreaId(null);
    }
  };

  const handleMoveEntityDown = async (areaId: string, entityId: string): Promise<void> => {
    const area = areas.find((a) => a.id === areaId);
    if (!area || !area.entityIds) return;

    const currentIndex = area.entityIds.indexOf(entityId);
    if (currentIndex === -1 || currentIndex >= area.entityIds.length - 1) return; // Already at bottom or not found

    // CAPTURE original state BEFORE optimistic update
    const originalAreas = [...areas];

    // Swap with next entity
    const newEntityIds = [...area.entityIds];
    [newEntityIds[currentIndex], newEntityIds[currentIndex + 1]] =
      [newEntityIds[currentIndex + 1], newEntityIds[currentIndex]];

    // Optimistic update using functional state update
    setAreas(prevAreas => prevAreas.map((a) =>
      a.id === areaId ? { ...a, entityIds: newEntityIds } : a
    ));

    setReorderingAreaId(areaId);
    try {
      await retryWithBackoff(
        () => apiClient.patchArea(areaId, { entityIds: newEntityIds }),
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt) => setRetryCount(attempt),
        }
      );
      setSuccessSnackbar({
        open: true,
        message: 'Entity moved down',
      });
      setRetryCount(0);
    } catch (err) {
      console.error('Failed to move entity down:', err);
      // ROLLBACK using captured original state
      setAreas(originalAreas);
      const formattedError = getErrorMessage(err, { operation: 'reorder', resource: 'entities' });
      setErrorSnackbar({
        open: true,
        error: formattedError,
        retryAction: () => handleMoveEntityDown(areaId, entityId),
      });
    } finally {
      setReorderingAreaId(null);
    }
  };

  const handleDeleteEntity = async (areaId: string, entityId: string): Promise<void> => {
    const area = areas.find((a) => a.id === areaId);
    if (!area || !area.entityIds) return;

    // CAPTURE original state BEFORE optimistic update
    const originalAreas = [...areas];

    // Remove entity from array
    const newEntityIds = area.entityIds.filter((id) => id !== entityId);

    // Optimistic update using functional state update
    setAreas((prevAreas: Area[]) => prevAreas.map((a: Area) =>
      a.id === areaId ? { ...a, entityIds: newEntityIds } : a
    ));

    setReorderingAreaId(areaId);
    try {
      await retryWithBackoff(
        () => apiClient.patchArea(areaId, { entityIds: newEntityIds }),
        {
          maxRetries: 3,
          baseDelay: 1000,
          onRetry: (attempt) => setRetryCount(attempt),
        }
      );
      setSuccessSnackbar({
        open: true,
        message: 'Entity removed from area',
      });
      setRetryCount(0);
    } catch (err) {
      console.error('Failed to remove entity:', err);
      // ROLLBACK using captured original state
      setAreas(originalAreas);
      const formattedError = getErrorMessage(err, { operation: 'remove', resource: 'entity' });
      setErrorSnackbar({
        open: true,
        error: formattedError,
        retryAction: () => handleDeleteEntity(areaId, entityId),
      });
    } finally {
      setReorderingAreaId(null);
    }
  };

  const handleErrorSnackbarClose = useCallback((): void => {
    setErrorSnackbar({ open: false, error: null });
  }, []);

  const handleSuccessSnackbarClose = useCallback((): void => {
    setSuccessSnackbar({ open: false, message: '' });
  }, []);

  return (
    <SectionErrorBoundary sectionName="Area Manager">
      <Box>
        {/* Skip to main content link for keyboard users */}
        <Box
          component="a"
          href="#main-content"
          sx={{
            position: 'absolute',
            left: -10000,
            top: 'auto',
            width: 1,
            height: 1,
            overflow: 'hidden',
            '&:focus': {
              position: 'fixed',
              top: 0,
              left: 0,
              width: 'auto',
              height: 'auto',
              padding: 2,
              backgroundColor: '#005fcc',
              color: '#ffffff',
              zIndex: 9999,
              textDecoration: 'none',
              borderRadius: 1,
            },
          }}
          onClick={(e) => {
            e.preventDefault();
            mainContentRef.current?.focus();
          }}
        >
          Skip to main content
        </Box>

        <Stack spacing={3} ref={mainContentRef} tabIndex={-1} id="main-content">
        {/* Offline Banner */}
        <OfflineBanner
          online={networkStatus.online}
          queueSize={queueSize}
          isProcessingQueue={isProcessingQueue}
        />

        {/* Retry Count Indicator */}
        {retryCount > 0 && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Retrying operation... (Attempt {retryCount}/3)
          </Alert>
        )}

        {/* Header */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          component="header"
          role="banner"
        >
          <Box>
            <Typography variant="h4" component="h1" fontWeight={700} gutterBottom sx={{ color: '#1a1a1a' }}>
              Area Management
            </Typography>
            <Typography variant="body2" color="text.secondary" component="p">
              Organize your entities into logical areas for better management
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            startIcon={<AddIcon aria-hidden="true" />}
            onClick={handleCreateNew}
            aria-label="Create new area"
            sx={{
              borderRadius: 2,
              px: 3,
              background: 'linear-gradient(135deg, #5568d3 0%, #63428a 100%)',
              color: '#ffffff',
              fontWeight: 600,
              '&:hover': {
                background: 'linear-gradient(135deg, #4557bc 0%, #522572 100%)',
              },
              ...focusStyles,
            }}
          >
            Create Area
          </Button>
        </Box>

        {/* Area Grid */}
        {areas.length === 0 ? (
          <Card
            component="section"
            aria-label="Empty state"
            sx={{
              py: 8,
              textAlign: 'center',
              background: (theme) => `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)}, ${alpha(theme.palette.secondary.main, 0.05)})`,
            }}
          >
            <FolderOpenIcon
              sx={{ fontSize: 80, color: 'text.secondary', opacity: 0.3, mb: 2 }}
              aria-hidden="true"
            />
            <Typography variant="h6" component="h2" gutterBottom color="text.secondary">
              No areas created yet
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3} component="p">
              Create your first area to organize entities into logical groups
            </Typography>
            <Button
              variant="outlined"
              startIcon={<AddIcon aria-hidden="true" />}
              onClick={handleCreateNew}
              size="large"
              aria-label="Create your first area"
              sx={{
                ...focusStyles,
                fontWeight: 500,
              }}
            >
              Create Your First Area
            </Button>
          </Card>
        ) : (
          <Grid
            container
            spacing={3}
            component="section"
            aria-label="Areas list"
          >
            {areas.map((area) => (
              <Grid item xs={12} sm={6} md={4} key={area.id}>
                <AreaCard
                  area={area}
                  color={AREA_COLOR}
                  onEdit={() => handleEdit(area)}
                  onDelete={() => handleDelete(area.id)}
                  onDuplicate={() => handleDuplicate(area)}
                  onToggle={(enabled) => handleToggleArea(area.id, enabled)}
                  onMoveEntityUp={(entityId) => handleMoveEntityUp(area.id, entityId)}
                  onMoveEntityDown={(entityId) => handleMoveEntityDown(area.id, entityId)}
                  onDeleteEntity={(entityId) => handleDeleteEntity(area.id, entityId)}
                  entities={entities}
                  isReordering={reorderingAreaId === area.id}
                />
              </Grid>
            ))}
          </Grid>
        )}

        {/* Summary Footer */}
        {areas.length > 0 && (
          <Box
            component="footer"
            role="contentinfo"
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 2,
              py: 2,
            }}
            aria-label="Summary statistics"
          >
            <Chip
              label={`${areas.length} ${areas.length === 1 ? 'Area' : 'Areas'}`}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 500 }}
              aria-label={`Total: ${areas.length} ${areas.length === 1 ? 'area' : 'areas'}`}
            />
            <Chip
              label={`${entities.length} Total Entities`}
              color="secondary"
              variant="outlined"
              sx={{ fontWeight: 500 }}
              aria-label={`Total: ${entities.length} entities across all areas`}
            />
          </Box>
        )}
      </Stack>

      {/* Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
        aria-labelledby="area-dialog-title"
        aria-describedby="area-dialog-description"
      >
        <DialogTitle id="area-dialog-title">
          {editingArea ? 'Edit Area' : 'Create New Area'}
        </DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            color="text.secondary"
            mb={2}
            id="area-dialog-description"
          >
            {editingArea
              ? 'Update the area name and entity assignments.'
              : 'Create a new area by providing a name and selecting entities to include.'}
          </Typography>
          <Stack spacing={3} mt={1}>
            <Box>
              <TextField
                fullWidth
                label="Area Name"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                autoFocus
                error={!!nameError}
                helperText={nameError || 'Min 2 chars, max 50 chars. Letters, numbers, spaces, and hyphens only.'}
                required
                inputProps={{
                  'aria-label': 'Area name',
                  'aria-required': 'true',
                  'aria-invalid': !!nameError,
                  'aria-describedby': nameError ? 'name-error' : 'name-helper',
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '&.Mui-focused fieldset': {
                      borderColor: '#005fcc',
                      borderWidth: 2,
                    },
                  },
                }}
              />
              {nameError && <FormHelperText error id="name-error">{nameError}</FormHelperText>}
            </Box>

            <Box>
              <Button
                variant="outlined"
                onClick={() => setShowEntitySelector(!showEntitySelector)}
                fullWidth
                aria-expanded={showEntitySelector}
                aria-controls="entity-selector-region"
                aria-label={`${showEntitySelector ? 'Hide' : 'Show'} entity selector. ${selectedEntities.size} entities currently selected.`}
                sx={{
                  ...focusStyles,
                  fontWeight: 500,
                }}
              >
                {showEntitySelector ? 'Hide' : 'Select'} Entities ({selectedEntities.size} selected)
              </Button>
              {entityError && (
                <FormHelperText error id="entity-error" role="alert">{entityError}</FormHelperText>
              )}
            </Box>

            {showEntitySelector && (
              <Box id="entity-selector-region" role="region" aria-label="Entity selection">
                <EntitySelector title="Assign Entities to Area" />
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDialogOpen(false)}
            sx={focusStyles}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!!nameError || !!entityError || loading}
            startIcon={loading ? <CircularProgress size={16} aria-label="Saving" /> : <SaveIcon aria-hidden="true" />}
            aria-label={loading ? 'Saving area...' : 'Save area'}
            sx={{
              ...focusStyles,
              fontWeight: 600,
            }}
          >
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Enhanced Error Snackbar */}
      <ErrorSnackbar
        open={errorSnackbar.open}
        error={errorSnackbar.error}
        onClose={handleErrorSnackbarClose}
        onAction={errorSnackbar.retryAction}
        autoHideDuration={6000}
      />

      {/* Success Snackbar */}
      <SuccessSnackbar
        open={successSnackbar.open}
        message={successSnackbar.message}
        onClose={handleSuccessSnackbarClose}
        autoHideDuration={3000}
      />
      </Box>
    </SectionErrorBoundary>
  );
};

export { AreaManagerEnhanced as AreaManager };
export default AreaManagerEnhanced;
