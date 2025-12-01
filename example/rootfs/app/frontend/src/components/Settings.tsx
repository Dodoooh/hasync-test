import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Stack,
  Divider,
  Chip,
  IconButton,
  InputAdornment,
} from '@mui/material';
import {
  Save as SaveIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { useAppStore } from '@/context/AppContext';
import { apiClient } from '@/api/client';

interface ConnectionStatus {
  status: 'idle' | 'testing' | 'success' | 'error';
  message: string;
}

export const Settings: React.FC = () => {
  const { ingressUrl, accessToken, setAuth } = useAppStore();

  // Form state
  const [url, setUrl] = useState(ingressUrl);
  const [token, setToken] = useState(accessToken);
  const [showToken, setShowToken] = useState(false);

  // UI state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'idle',
    message: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Validation errors
  const [urlError, setUrlError] = useState('');
  const [tokenError, setTokenError] = useState('');

  // Load saved config from database on mount
  useEffect(() => {
    const loadSavedConfig = async () => {
      try {
        const response = await fetch('/api/config/ha');
        if (response.ok) {
          const config = await response.json();
          if (config.url) setUrl(config.url);
          if (config.token) setToken(config.token);
          console.log('Loaded saved config from database');
        }
      } catch (error) {
        console.error('Failed to load saved config:', error);
      }
    };

    loadSavedConfig();
  }, []);

  // Also initialize from context if available
  useEffect(() => {
    if (ingressUrl) setUrl(ingressUrl);
    if (accessToken) setToken(accessToken);
  }, [ingressUrl, accessToken]);

  // Validate URL format
  const validateUrl = (value: string): boolean => {
    if (!value.trim()) {
      setUrlError('URL is required');
      return false;
    }

    try {
      const urlObj = new URL(value);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        setUrlError('URL must start with http:// or https://');
        return false;
      }
      setUrlError('');
      return true;
    } catch {
      setUrlError('Invalid URL format (e.g., http://homeassistant.local:8123)');
      return false;
    }
  };

  // Validate token format
  const validateToken = (value: string): boolean => {
    if (!value.trim()) {
      setTokenError('Access token is required');
      return false;
    }

    if (value.length < 20) {
      setTokenError('Token appears to be too short');
      return false;
    }

    setTokenError('');
    return true;
  };

  // Test Home Assistant connection
  const testConnection = async () => {
    // Validate before testing
    const isUrlValid = validateUrl(url);
    const isTokenValid = validateToken(token);

    if (!isUrlValid || !isTokenValid) {
      setConnectionStatus({
        status: 'error',
        message: 'Please fix validation errors before testing',
      });
      return;
    }

    setConnectionStatus({
      status: 'testing',
      message: 'Testing connection...',
    });

    try {
      // Temporarily set auth to test the connection
      apiClient.setAuth(url, token);

      // Test the connection by making a health check
      await apiClient.healthCheck();

      setConnectionStatus({
        status: 'success',
        message: 'Connection successful! Home Assistant is reachable.',
      });
    } catch (error: any) {
      console.error('Connection test failed:', error);
      setConnectionStatus({
        status: 'error',
        message: error.message || 'Failed to connect to Home Assistant. Check URL and token.',
      });

      // Restore previous auth if test failed
      apiClient.setAuth(ingressUrl, accessToken);
    }
  };

  // Save settings
  const handleSave = async () => {
    // Validate before saving
    const isUrlValid = validateUrl(url);
    const isTokenValid = validateToken(token);

    if (!isUrlValid || !isTokenValid) {
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      // Save to backend database (persistent across sessions)
      const response = await fetch('/api/config/ha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, token }),
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      // Update local state
      setAuth(url, token);

      setSaveSuccess(true);
      setConnectionStatus({
        status: 'success',
        message: 'Settings saved to database! Settings are now persistent.',
      });

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      setConnectionStatus({
        status: 'error',
        message: error.message || 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle URL change
  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = event.target.value;
    setUrl(newUrl);
    setSaveSuccess(false);
    setConnectionStatus({ status: 'idle', message: '' });

    // Clear error when user starts typing
    if (urlError) {
      setUrlError('');
    }
  };

  // Handle token change
  const handleTokenChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newToken = event.target.value;
    setToken(newToken);
    setSaveSuccess(false);
    setConnectionStatus({ status: 'idle', message: '' });

    // Clear error when user starts typing
    if (tokenError) {
      setTokenError('');
    }
  };

  // Handle URL blur (validate on blur)
  const handleUrlBlur = () => {
    if (url.trim()) {
      validateUrl(url);
    }
  };

  // Handle token blur (validate on blur)
  const handleTokenBlur = () => {
    if (token.trim()) {
      validateToken(token);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Home Assistant Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Configure connection to your Home Assistant instance
      </Typography>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Stack spacing={3}>
          {/* Connection Status Display */}
          {connectionStatus.status !== 'idle' && (
            <Alert
              severity={
                connectionStatus.status === 'success'
                  ? 'success'
                  : connectionStatus.status === 'error'
                  ? 'error'
                  : 'info'
              }
              icon={
                connectionStatus.status === 'testing' ? (
                  <CircularProgress size={20} />
                ) : connectionStatus.status === 'success' ? (
                  <CheckCircleIcon />
                ) : (
                  <ErrorIcon />
                )
              }
            >
              {connectionStatus.message}
            </Alert>
          )}

          {saveSuccess && (
            <Alert severity="success" icon={<CheckCircleIcon />}>
              Settings saved successfully!
            </Alert>
          )}

          {/* Current Connection Status */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Current Status
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                label={ingressUrl || 'Not configured'}
                color={ingressUrl ? 'success' : 'default'}
                size="small"
              />
              <Chip
                label={accessToken ? 'Token configured' : 'No token'}
                color={accessToken ? 'success' : 'default'}
                size="small"
              />
            </Stack>
          </Box>

          <Divider />

          {/* Home Assistant URL */}
          <TextField
            label="Home Assistant URL"
            placeholder="http://homeassistant.local:8123"
            value={url}
            onChange={handleUrlChange}
            onBlur={handleUrlBlur}
            error={!!urlError}
            helperText={
              urlError || 'Enter the full URL of your Home Assistant instance'
            }
            fullWidth
            required
            disabled={isSaving || connectionStatus.status === 'testing'}
            InputProps={{
              endAdornment: url && (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    onClick={() => {
                      setUrl('');
                      setUrlError('');
                    }}
                    size="small"
                  >
                    <RefreshIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {/* Long-Lived Access Token */}
          <TextField
            label="Long-Lived Access Token"
            placeholder="Enter your Home Assistant access token"
            value={token}
            onChange={handleTokenChange}
            onBlur={handleTokenBlur}
            error={!!tokenError}
            helperText={
              tokenError ||
              'Create a long-lived access token in Home Assistant Profile settings'
            }
            fullWidth
            required
            type={showToken ? 'text' : 'password'}
            disabled={isSaving || connectionStatus.status === 'testing'}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    onClick={() => setShowToken(!showToken)}
                    size="small"
                  >
                    {showToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Divider />

          {/* Action Buttons */}
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              color="primary"
              startIcon={
                isSaving ? <CircularProgress size={20} /> : <SaveIcon />
              }
              onClick={handleSave}
              disabled={
                isSaving ||
                connectionStatus.status === 'testing' ||
                !url.trim() ||
                !token.trim() ||
                !!urlError ||
                !!tokenError
              }
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>

            <Button
              variant="outlined"
              color="secondary"
              startIcon={
                connectionStatus.status === 'testing' ? (
                  <CircularProgress size={20} />
                ) : (
                  <CheckCircleIcon />
                )
              }
              onClick={testConnection}
              disabled={
                isSaving ||
                connectionStatus.status === 'testing' ||
                !url.trim() ||
                !token.trim() ||
                !!urlError ||
                !!tokenError
              }
            >
              {connectionStatus.status === 'testing'
                ? 'Testing...'
                : 'Test Connection'}
            </Button>
          </Stack>

          {/* Help Information */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              How to get a Long-Lived Access Token:
            </Typography>
            <Typography variant="body2" color="text.secondary" component="ol" sx={{ pl: 2 }}>
              <li>Open Home Assistant</li>
              <li>Click on your profile (bottom left)</li>
              <li>Scroll down to "Long-Lived Access Tokens"</li>
              <li>Click "Create Token"</li>
              <li>Give it a name (e.g., "HAsync Management")</li>
              <li>Copy the token and paste it above</li>
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
};
