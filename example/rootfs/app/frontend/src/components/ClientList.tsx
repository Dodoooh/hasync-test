import React, { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Avatar,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TabletIcon from '@mui/icons-material/Tablet';
import ComputerIcon from '@mui/icons-material/Computer';
import { useAppStore } from '@/context/AppContext';
import { useClients } from '@/hooks/useApi';
import { formatDateTime } from '@/utils/helpers';
import type { Client } from '@/types';

const getDeviceIcon = (deviceType: Client['deviceType']) => {
  switch (deviceType) {
    case 'phone':
      return <PhoneAndroidIcon />;
    case 'tablet':
      return <TabletIcon />;
    case 'desktop':
      return <ComputerIcon />;
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

export const ClientList: React.FC = () => {
  const { clients, areas, dashboards, setClients } = useAppStore();
  const { fetchClients, deleteClient, loading, error } = useClients();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const data = await fetchClients();
    if (data) {
      setClients(data);
    }
  };

  const handleDelete = async (clientId: string) => {
    if (!confirm('Are you sure you want to delete this client?')) return;

    try {
      await deleteClient(clientId);
      setClients(clients.filter((c) => c.id !== clientId));
    } catch (err) {
      console.error('Failed to delete client:', err);
    }
  };

  const getAreaNames = (areaIds: string[]): string[] => {
    return areaIds
      .map((id) => areas.find((a) => a.id === id)?.name)
      .filter(Boolean) as string[];
  };

  const getDashboardName = (dashboardId?: string): string | undefined => {
    return dashboards.find((d) => d.id === dashboardId)?.name;
  };

  return (
    <Box>
      <Stack spacing={2}>
        {/* Header */}
        <Typography variant="h5">Connected Clients</Typography>

        {error && <Alert severity="error">{error.message}</Alert>}

        {/* Client List */}
        <Card>
          <CardContent>
            {loading && clients.length === 0 ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : clients.length === 0 ? (
              <Typography color="text.secondary" align="center" py={4}>
                No clients connected yet. Use the Pairing Wizard to add new clients.
              </Typography>
            ) : (
              <List>
                {clients.map((client, index) => (
                  <React.Fragment key={client.id}>
                    {index > 0 && <Box sx={{ borderTop: 1, borderColor: 'divider', my: 1 }} />}
                    <ListItem alignItems="flex-start">
                      <Avatar sx={{ mr: 2, mt: 1 }}>{getDeviceIcon(client.deviceType)}</Avatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <Typography variant="h6">{client.name}</Typography>
                            <Chip
                              label={client.status}
                              color={getStatusColor(client.status)}
                              size="small"
                            />
                          </Box>
                        }
                        secondary={
                          <Stack spacing={1}>
                            <Typography variant="body2" color="text.secondary">
                              Device Type: {client.deviceType}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Last Seen: {formatDateTime(client.lastSeen)}
                            </Typography>
                            {client.ipAddress && (
                              <Typography variant="body2" color="text.secondary">
                                IP: {client.ipAddress}
                              </Typography>
                            )}
                            {client.assignedAreas.length > 0 && (
                              <Box>
                                <Typography variant="caption" color="text.secondary">
                                  Assigned Areas:
                                </Typography>
                                <Box display="flex" gap={0.5} flexWrap="wrap" mt={0.5}>
                                  {getAreaNames(client.assignedAreas).map((name, i) => (
                                    <Chip key={i} label={name} size="small" />
                                  ))}
                                </Box>
                              </Box>
                            )}
                            {client.assignedDashboard && (
                              <Box>
                                <Typography variant="caption" color="text.secondary">
                                  Dashboard:
                                </Typography>
                                <Box mt={0.5}>
                                  <Chip
                                    label={getDashboardName(client.assignedDashboard) || 'Unknown'}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                  />
                                </Box>
                              </Box>
                            )}
                          </Stack>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton edge="end" sx={{ mr: 1 }}>
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          edge="end"
                          onClick={() => handleDelete(client.id)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
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
              <Chip
                label={`Total: ${clients.length}`}
                variant="outlined"
              />
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
    </Box>
  );
};
