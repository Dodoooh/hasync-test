import React, { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DashboardIcon from '@mui/icons-material/Dashboard';
import { useAppStore } from '@/context/AppContext';
import { useApi } from '@/hooks/useApi';
import { apiClient } from '@/api/client';
import type { Dashboard } from '@/types';

export const DashboardConfig: React.FC = () => {
  const { dashboards, selectedDashboard, setDashboards, setSelectedDashboard } = useAppStore();
  const { loading, error, execute } = useApi<Dashboard[]>();

  const loadDashboards = async () => {
    const data = await execute(() => apiClient.getDashboards());
    if (data) {
      setDashboards(data);
    }
  };

  const syncDashboards = async () => {
    const data = await execute(() => apiClient.syncDashboards());
    if (data) {
      setDashboards(data);
    }
  };

  useEffect(() => {
    loadDashboards();
  }, []);

  const handleSelectDashboard = (dashboardId: string) => {
    setSelectedDashboard(dashboardId === selectedDashboard ? null : dashboardId);
  };

  const selectedDashboardData = dashboards.find((d) => d.id === selectedDashboard);

  return (
    <Box>
      <Stack spacing={2}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h5">Dashboard Configuration</Typography>
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={syncDashboards}
            disabled={loading}
          >
            Sync from Home Assistant
          </Button>
        </Box>

        {error && <Alert severity="error">{error.message}</Alert>}

        {/* Dashboard List */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Available Dashboards
            </Typography>
            {loading && dashboards.length === 0 ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : dashboards.length === 0 ? (
              <Typography color="text.secondary" align="center" py={4}>
                No dashboards found. Click "Sync from Home Assistant" to load dashboards.
              </Typography>
            ) : (
              <List>
                {dashboards.map((dashboard) => (
                  <ListItemButton
                    key={dashboard.id}
                    selected={dashboard.id === selectedDashboard}
                    onClick={() => handleSelectDashboard(dashboard.id)}
                  >
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <DashboardIcon fontSize="small" />
                          <Typography variant="subtitle1">{dashboard.name}</Typography>
                        </Box>
                      }
                      secondary={`${dashboard.views?.length || 0} views`}
                    />
                    {dashboard.id === selectedDashboard && (
                      <Chip label="Selected" color="primary" size="small" />
                    )}
                  </ListItemButton>
                ))}
              </List>
            )}
          </CardContent>
        </Card>

        {/* Selected Dashboard Details */}
        {selectedDashboardData && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Dashboard Details: {selectedDashboardData.name}
              </Typography>
              <Stack spacing={2}>
                {selectedDashboardData.views.map((view) => (
                  <Box key={view.id}>
                    <Typography variant="subtitle2" gutterBottom>
                      {view.title}
                    </Typography>
                    <Box display="flex" gap={1}>
                      <Chip label={`Type: ${view.type}`} size="small" variant="outlined" />
                      <Chip
                        label={`${view.cards?.length || 0} cards`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Usage Instructions */}
        <Alert severity="info">
          Select a dashboard to assign to clients. This dashboard will be displayed on their devices.
        </Alert>
      </Stack>
    </Box>
  );
};
