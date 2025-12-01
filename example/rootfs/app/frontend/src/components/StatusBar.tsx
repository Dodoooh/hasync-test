import React, { useState, useEffect } from 'react';
import {
  Box,
  Chip,
  Stack,
  Tooltip,
  IconButton,
  Link,
  Typography,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  CheckCircle as ConnectedIcon,
  Error as DisconnectedIcon,
  Warning as WarningIcon,
  People as PeopleIcon,
  Api as ApiIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
} from '@mui/icons-material';
import { useAppStore } from '@/context/AppContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useThemeMode } from '@/context/ThemeContext';
import { apiClient } from '@/api/client';
import { wsClient } from '@/api/websocket';

export const StatusBar: React.FC = () => {
  const { ingressUrl } = useAppStore();
  const { isConnected } = useWebSocket();
  const { darkMode, toggleDarkMode } = useThemeMode();
  const [haConnected, setHaConnected] = useState<boolean | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [wsError, setWsError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);

  // Check HA connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await apiClient.healthCheck();
        setHaConnected(true);
      } catch {
        setHaConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Get client count
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const clients = await apiClient.getClients();
        setClientCount(clients.length);
      } catch {
        setClientCount(0);
      }
    };

    fetchClients();
    const interval = setInterval(fetchClients, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Monitor WebSocket errors
  useEffect(() => {
    const handleWsError = (data: any) => {
      console.error('WebSocket error detected:', data);
      setWsError(data.error || 'WebSocket connection error');
      setShowError(true);
    };

    const handleAuthError = (data: any) => {
      console.error('WebSocket auth error:', data);
      setWsError('Authentication failed. Please login again.');
      setShowError(true);
    };

    const handleConnected = () => {
      setWsError(null);
      setShowError(false);
    };

    const unsubError = wsClient.on('error', handleWsError);
    const unsubAuthError = wsClient.on('auth_error', handleAuthError);
    const unsubConnected = wsClient.on('connected', handleConnected);

    return () => {
      unsubError();
      unsubAuthError();
      unsubConnected();
    };
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        backgroundColor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ flexGrow: 1, alignItems: 'center' }}>
        {/* Home Assistant Status */}
        <Tooltip
          title={
            haConnected === null
              ? 'Checking connection...'
              : haConnected
              ? `Connected to ${ingressUrl || 'Home Assistant'}`
              : 'Not connected to Home Assistant'
          }
        >
          <Chip
            icon={
              haConnected ? (
                <ConnectedIcon sx={{ fontSize: 16 }} />
              ) : (
                <DisconnectedIcon sx={{ fontSize: 16 }} />
              )
            }
            label={haConnected ? 'HA Connected' : 'HA Disconnected'}
            color={haConnected ? 'success' : 'error'}
            size="small"
            variant="outlined"
          />
        </Tooltip>

        {/* WebSocket Status */}
        <Tooltip
          title={
            wsError
              ? `WebSocket error: ${wsError}`
              : isConnected
              ? 'WebSocket connected - receiving live updates'
              : 'WebSocket disconnected - updates paused'
          }
        >
          <Chip
            icon={
              wsError ? (
                <WarningIcon sx={{ fontSize: 16 }} />
              ) : isConnected ? (
                <ConnectedIcon sx={{ fontSize: 16 }} />
              ) : (
                <DisconnectedIcon sx={{ fontSize: 16 }} />
              )
            }
            label={wsError ? 'Error' : isConnected ? 'Live' : 'Offline'}
            color={wsError ? 'error' : isConnected ? 'success' : 'default'}
            size="small"
            variant="outlined"
          />
        </Tooltip>

        {/* Client Count */}
        <Tooltip title={`${clientCount} client(s) connected`}>
          <Chip
            icon={<PeopleIcon sx={{ fontSize: 16 }} />}
            label={`${clientCount} Client${clientCount !== 1 ? 's' : ''}`}
            color="primary"
            size="small"
            variant="outlined"
          />
        </Tooltip>
      </Stack>

      {/* API Link */}
      <Tooltip title="Open API Documentation">
        <Link
          href="http://localhost:8099/api-docs"
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            textDecoration: 'none',
            color: 'primary.main',
            '&:hover': {
              textDecoration: 'underline',
            },
          }}
        >
          <ApiIcon sx={{ fontSize: 18 }} />
          <Typography variant="caption" fontWeight={500}>
            API Docs
          </Typography>
        </Link>
      </Tooltip>

      {/* Dark Mode Toggle */}
      <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
        <IconButton onClick={toggleDarkMode} size="small" color="inherit">
          {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
        </IconButton>
      </Tooltip>

      {/* WebSocket Error Notification */}
      <Snackbar
        open={showError && wsError !== null}
        autoHideDuration={6000}
        onClose={() => setShowError(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowError(false)}
          severity="error"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {wsError}
        </Alert>
      </Snackbar>
    </Box>
  );
};
