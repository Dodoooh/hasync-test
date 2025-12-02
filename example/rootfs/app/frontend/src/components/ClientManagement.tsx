import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  Snackbar,
  Paper,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TabletIcon from '@mui/icons-material/Tablet';
import ComputerIcon from '@mui/icons-material/Computer';
import { useAppStore } from '@/context/AppContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { apiClient } from '@/api/client';
import { formatDateTime } from '@/utils/helpers';
import type { Client, Area } from '@/types';

const getDeviceIcon = (deviceType: Client['deviceType']) => {
  switch (deviceType) {
    case 'phone':
      return <PhoneAndroidIcon fontSize="small" />;
    case 'tablet':
      return <TabletIcon fontSize="small" />;
    case 'desktop':
      return <ComputerIcon fontSize="small" />;
  }
};

const getStatusColor = (status: Client['status']) => {
  switch (status) {
    case 'online':
      return 'success';
    case 'offline':
      return 'default';
    case 'pairing':
      return 'warning';
  }
};

interface EditDialogProps {
  open: boolean;
  client: Client | null;
  areas: Area[];
  onClose: () => void;
  onSave: (clientId: string, updates: Partial<Client>) => Promise<void>;
}

const EditClientDialog: React.FC<EditDialogProps> = ({
  open,
  client,
  areas,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<Area[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setName(client.name);
      const clientAreas = areas.filter((area) =>
        client.assignedAreas.includes(area.id)
      );
      setSelectedAreas(clientAreas);
    }
  }, [client, areas]);

  const handleSave = async () => {
    if (!client) return;

    setSaving(true);
    try {
      await onSave(client.id, {
        name,
        assignedAreas: selectedAreas.map((a) => a.id),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save client:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Client</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <TextField
            label="Client Name"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            fullWidth
            autoFocus
          />

          <Autocomplete
            multiple
            options={areas}
            value={selectedAreas}
            onChange={(_: React.SyntheticEvent, newValue: Area[]) => setSelectedAreas(newValue)}
            getOptionLabel={(option) => option.name}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Assigned Areas"
                placeholder="Select areas..."
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={option.name}
                  {...getTagProps({ index })}
                  size="small"
                />
              ))
            }
          />

          {client && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Device Type: {client.deviceType}
              </Typography>
              <br />
              <Typography variant="caption" color="text.secondary">
                Status: {client.status}
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || !name.trim()}
        >
          {saving ? <CircularProgress size={24} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mt: 1 }}>
          {message}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color="error"
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface HaTokenDialogProps {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSave: (clientId: string, token: string) => Promise<void>;
}

const HaTokenDialog: React.FC<HaTokenDialogProps> = ({
  open,
  client,
  onClose,
  onSave,
}) => {
  const [haToken, setHaToken] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setHaToken('');
    }
  }, [open]);

  const handleSave = async () => {
    if (!client || !haToken.trim()) return;

    setSaving(true);
    try {
      await onSave(client.id, haToken.trim());
      onClose();
    } catch (error) {
      console.error('Failed to set HA token:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Home Assistant Token</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Alert severity="info">
            Enter a long-lived access token from Home Assistant for this client.
            The client will use this token to access Home Assistant independently.
          </Alert>

          <TextField
            label="Home Assistant Token"
            value={haToken}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHaToken(e.target.value)}
            fullWidth
            autoFocus
            multiline
            rows={4}
            placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
            helperText="Get a long-lived token from Home Assistant Profile → Security → Long-Lived Access Tokens"
          />

          {client && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Client: {client.name}
              </Typography>
              <br />
              <Typography variant="caption" color="text.secondary">
                Device: {client.deviceType}
              </Typography>
              {client.hasHaToken && client.haTokenSetAt && (
                <>
                  <br />
                  <Typography variant="caption" color="success.main">
                    ✓ Token already set on {new Date(client.haTokenSetAt).toLocaleString()}
                  </Typography>
                </>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || !haToken.trim()}
          startIcon={saving ? <CircularProgress size={20} /> : <VpnKeyIcon />}
        >
          {saving ? 'Setting Token...' : 'Set Token'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export const ClientManagement: React.FC = () => {
  const { areas } = useAppStore();
  const { on } = useWebSocket();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [haTokenDialogOpen, setHaTokenDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Snackbar for feedback
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getClients();
      setClients(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load clients');
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // WebSocket real-time updates
  useEffect(() => {
    const unsubConnect = on('client_connected', (data: { client: Client }) => {
      setClients((prev) => {
        const index = prev.findIndex((c) => c.id === data.client.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = data.client;
          return updated;
        }
        return [...prev, data.client];
      });
      showSnackbar(`Client "${data.client.name}" connected`, 'success');
    });

    const unsubDisconnect = on('client_disconnected', (data: { client: Client }) => {
      setClients((prev) => {
        const index = prev.findIndex((c) => c.id === data.client.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = data.client;
          return updated;
        }
        return prev;
      });
      showSnackbar(`Client "${data.client.name}" disconnected`, 'success');
    });

    const unsubAreaAdded = on('area_added', (data: { clientId: string; areaId: string }) => {
      setClients((prev) =>
        prev.map((c) =>
          c.id === data.clientId
            ? { ...c, assignedAreas: [...c.assignedAreas, data.areaId] }
            : c
        )
      );
    });

    const unsubAreaRemoved = on('area_removed', (data: { clientId: string; areaId: string }) => {
      setClients((prev) =>
        prev.map((c) =>
          c.id === data.clientId
            ? {
                ...c,
                assignedAreas: c.assignedAreas.filter((id) => id !== data.areaId),
              }
            : c
        )
      );
    });

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubAreaAdded();
      unsubAreaRemoved();
    };
  }, [on]);

  const handleEditClick = (client: Client) => {
    setSelectedClient(client);
    setEditDialogOpen(true);
  };

  const handleSaveClient = async (clientId: string, updates: Partial<Client>) => {
    try {
      const updatedClient = await apiClient.updateClient(clientId, updates);
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? updatedClient : c))
      );
      showSnackbar('Client updated successfully', 'success');
    } catch (err: any) {
      showSnackbar(err.message || 'Failed to update client', 'error');
      throw err;
    }
  };

  const handleRevokeClick = (client: Client) => {
    setSelectedClient(client);
    setRevokeDialogOpen(true);
  };

  const handleRevokeConfirm = async () => {
    if (!selectedClient) return;

    setActionLoading(true);
    try {
      await apiClient.revokeClientToken(selectedClient.id);
      // Update client status to offline
      setClients((prev) =>
        prev.map((c) =>
          c.id === selectedClient.id ? { ...c, status: 'offline' as const } : c
        )
      );
      showSnackbar('Client token revoked successfully', 'success');
      setRevokeDialogOpen(false);
      setSelectedClient(null);
    } catch (err: any) {
      showSnackbar(err.message || 'Failed to revoke token', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteClick = (client: Client) => {
    setSelectedClient(client);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedClient) return;

    setActionLoading(true);
    try {
      await apiClient.deleteClient(selectedClient.id);
      setClients((prev) => prev.filter((c) => c.id !== selectedClient.id));
      showSnackbar('Client deleted successfully', 'success');
      setDeleteDialogOpen(false);
      setSelectedClient(null);
    } catch (err: any) {
      showSnackbar(err.message || 'Failed to delete client', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleHaTokenClick = (client: Client) => {
    setSelectedClient(client);
    setHaTokenDialogOpen(true);
  };

  const handleSaveHaToken = async (clientId: string, token: string) => {
    try {
      await apiClient.setClientHaToken(clientId, token);
      // Update client in state
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, hasHaToken: true, haTokenSetAt: Date.now() }
            : c
        )
      );
      showSnackbar('HA token set successfully and sent to client', 'success');
    } catch (err: any) {
      showSnackbar(err.message || 'Failed to set HA token', 'error');
      throw err;
    }
  };

  const getAreaNames = (areaIds: string[]): string[] => {
    return areaIds
      .map((id) => areas.find((a) => a.id === id)?.name)
      .filter(Boolean) as string[];
  };

  return (
    <Box>
      <Stack spacing={3}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h5">Client Management</Typography>
          <Typography variant="body2" color="text.secondary">
            {clients.length} client{clients.length !== 1 ? 's' : ''} total
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        {/* Client Table */}
        <Card>
          <CardContent>
            {loading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : clients.length === 0 ? (
              <Typography color="text.secondary" align="center" py={4}>
                No clients connected yet. Use the Pairing Wizard to add new clients.
              </Typography>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Device Type</TableCell>
                      <TableCell>Assigned Areas</TableCell>
                      <TableCell>HA Token</TableCell>
                      <TableCell>Last Seen</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            {getDeviceIcon(client.deviceType)}
                            <Typography variant="body2">{client.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                            {client.deviceType}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {client.assignedAreas.length > 0 ? (
                            <Box display="flex" gap={0.5} flexWrap="wrap">
                              {getAreaNames(client.assignedAreas).map((name, i) => (
                                <Chip key={i} label={name} size="small" />
                              ))}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              None
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {client.hasHaToken ? (
                            <Chip
                              icon={<CheckCircleIcon />}
                              label="Set"
                              color="success"
                              size="small"
                              variant="outlined"
                            />
                          ) : (
                            <Chip
                              label="Not Set"
                              color="warning"
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDateTime(client.lastSeen)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={client.status}
                            color={getStatusColor(client.status)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <IconButton
                              size="small"
                              onClick={() => handleHaTokenClick(client)}
                              title={client.hasHaToken ? "Update HA token" : "Add HA token"}
                              color={client.hasHaToken ? "success" : "warning"}
                            >
                              <VpnKeyIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleEditClick(client)}
                              title="Edit client"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleRevokeClick(client)}
                              title="Revoke token"
                              color="warning"
                            >
                              <BlockIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteClick(client)}
                              title="Delete client"
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              Statistics
            </Typography>
            <Stack direction="row" spacing={2}>
              <Chip label={`Total: ${clients.length}`} variant="outlined" />
              <Chip
                label={`Online: ${clients.filter((c) => c.status === 'online').length}`}
                color="success"
                variant="outlined"
              />
              <Chip
                label={`Offline: ${clients.filter((c) => c.status === 'offline').length}`}
                variant="outlined"
              />
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      {/* Edit Dialog */}
      <EditClientDialog
        open={editDialogOpen}
        client={selectedClient}
        areas={areas}
        onClose={() => {
          setEditDialogOpen(false);
          setSelectedClient(null);
        }}
        onSave={handleSaveClient}
      />

      {/* HA Token Dialog */}
      <HaTokenDialog
        open={haTokenDialogOpen}
        client={selectedClient}
        onClose={() => {
          setHaTokenDialogOpen(false);
          setSelectedClient(null);
        }}
        onSave={handleSaveHaToken}
      />

      {/* Revoke Token Confirmation */}
      <ConfirmDialog
        open={revokeDialogOpen}
        title="Revoke Client Token"
        message="This will disconnect the client immediately and invalidate its access token. The client will need to be re-paired to reconnect."
        confirmText="Revoke Token"
        onConfirm={handleRevokeConfirm}
        onCancel={() => {
          setRevokeDialogOpen(false);
          setSelectedClient(null);
        }}
        loading={actionLoading}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Client"
        message="This will permanently delete the client and all its associated data. This action cannot be undone."
        confirmText="Delete Client"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setSelectedClient(null);
        }}
        loading={actionLoading}
      />

      {/* Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};
