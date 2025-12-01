import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Stack,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff, Login } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthSchema, type AuthFormData } from '@/utils/validation';
import { useAppStore } from '@/context/AppContext';
import { apiClient } from '@/api/client';

interface AuthFormProps {
  onSuccess: () => void;
}

export const AuthForm: React.FC<AuthFormProps> = ({ onSuccess }) => {
  const { setAuth } = useAppStore();
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthFormData>({
    resolver: zodResolver(AuthSchema),
    defaultValues: {
      ingressUrl: localStorage.getItem('ingressUrl') || '',
      accessToken: localStorage.getItem('accessToken') || '',
    },
  });

  const onSubmit = async (data: AuthFormData) => {
    setLoading(true);
    setError(null);

    try {
      // Set auth in API client
      apiClient.setAuth(data.ingressUrl, data.accessToken);

      // Test connection
      await apiClient.healthCheck();

      // Update app state
      setAuth(data.ingressUrl, data.accessToken);

      // Success
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate. Please check your credentials.');
      apiClient.clearAuth();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor="background.default"
      p={2}
    >
      <Card sx={{ maxWidth: 500, width: '100%' }}>
        <CardContent>
          <Stack spacing={3}>
            <Box textAlign="center">
              <Typography variant="h4" gutterBottom>
                HAsync Management
              </Typography>
              <Typography color="text.secondary">
                Connect to your Home Assistant instance
              </Typography>
            </Box>

            {error && <Alert severity="error">{error}</Alert>}

            <form onSubmit={handleSubmit(onSubmit)}>
              <Stack spacing={3}>
                <Controller
                  name="ingressUrl"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Home Assistant Ingress URL"
                      placeholder="https://your-instance.ui.nabu.casa"
                      error={!!errors.ingressUrl}
                      helperText={errors.ingressUrl?.message}
                      autoFocus
                    />
                  )}
                />

                <Controller
                  name="accessToken"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Long-Lived Access Token"
                      type={showToken ? 'text' : 'password'}
                      error={!!errors.accessToken}
                      helperText={
                        errors.accessToken?.message ||
                        'Create a long-lived token in Home Assistant Profile settings'
                      }
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowToken(!showToken)}
                              edge="end"
                            >
                              {showToken ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={loading}
                  startIcon={<Login />}
                >
                  {loading ? 'Connecting...' : 'Connect'}
                </Button>
              </Stack>
            </form>

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="caption" display="block" gutterBottom>
                <strong>Setup Instructions:</strong>
              </Typography>
              <Typography variant="caption" component="ol" sx={{ pl: 2, m: 0 }}>
                <li>Go to your Home Assistant Profile</li>
                <li>Scroll to "Long-Lived Access Tokens"</li>
                <li>Click "Create Token"</li>
                <li>Copy and paste the token here</li>
              </Typography>
            </Alert>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};
