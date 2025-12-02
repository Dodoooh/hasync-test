import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Alert,
  Paper,
  Chip,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimerIcon from '@mui/icons-material/Timer';
import { useAppStore } from '@/context/AppContext';
import { useApi } from '@/hooks/useApi';
import { useWebSocket } from '@/hooks/useWebSocket';
import { apiClient } from '@/api/client';
import { EntitySelector } from './EntitySelector';
import type { PairingSession, Client } from '@/types';

const steps = ['Generate PIN', 'Waiting for Client', 'Assign Areas', 'Success'];

export const PairingWizard: React.FC = () => {
  const { areas, dashboards, selectedEntities, clearEntitySelection } = useAppStore();
  const { on: onWsEvent } = useWebSocket();
  const { loading, error, execute } = useApi<PairingSession>();

  const [activeStep, setActiveStep] = useState(0);
  const [pairingSession, setPairingSession] = useState<PairingSession | null>(null);
  const [clientName, setClientName] = useState('');
  const [deviceType, setDeviceType] = useState<Client['deviceType']>('phone');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState<string>('');
  const [pairedClient, setPairedClient] = useState<Client | null>(null);
  const [verifiedDeviceName, setVerifiedDeviceName] = useState('');
  const [verifiedDeviceType, setVerifiedDeviceType] = useState('');
  const [pinExpired, setPinExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0); // seconds remaining

  useEffect(() => {
    // Listen for pairing verification
    const unsubscribeVerified = onWsEvent('pairing_verified', (data: {
      sessionId: string;
      deviceName: string;
      deviceType: string;
    }) => {
      if (data.sessionId === pairingSession?.id) {
        setVerifiedDeviceName(data.deviceName);
        setVerifiedDeviceType(data.deviceType);
        setClientName(data.deviceName); // Prefill client name
        setDeviceType(data.deviceType as Client['deviceType']);
        setActiveStep(2); // Move to area assignment step
      }
    });

    return () => {
      unsubscribeVerified();
    };
  }, [pairingSession, onWsEvent]);

  // PIN expiry countdown timer (updates every second)
  useEffect(() => {
    if (!pairingSession || activeStep !== 1) {
      setPinExpired(false);
      setTimeRemaining(0);
      return;
    }

    // Update countdown every second
    const updateCountdown = () => {
      const expiryTime = new Date(pairingSession.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));

      setTimeRemaining(remaining);

      if (remaining <= 0) {
        setPinExpired(true);
      }
    };

    // Initial update
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [pairingSession, activeStep]);

  const handleStartPairing = async () => {
    const session = await execute(() => apiClient.createPairingSession());
    if (session) {
      setPairingSession(session);
      setActiveStep(1);
    }
  };

  const handleCompletePairing = async () => {
    if (!pairingSession) return;

    try {
      const client = await apiClient.completePairing(
        pairingSession.id,
        clientName,
        selectedAreas
      );

      setPairedClient(client);
      setActiveStep(3);
      clearEntitySelection();
    } catch (err) {
      console.error('Failed to complete pairing:', err);
    }
  };

  const handleReset = () => {
    setActiveStep(0);
    setPairingSession(null);
    setClientName('');
    setDeviceType('phone');
    setSelectedAreas([]);
    setSelectedDashboard('');
    setPairedClient(null);
    setVerifiedDeviceName('');
    setVerifiedDeviceType('');
    setPinExpired(false);
    setTimeRemaining(0);
    clearEntitySelection();
  };

  const handleCancel = async () => {
    if (pairingSession) {
      try {
        await apiClient.cancelPairing(pairingSession.id);
      } catch (err) {
        console.error('Failed to cancel pairing:', err);
      }
    }
    handleReset();
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Typography variant="h5">Client Pairing Wizard</Typography>

        <Stepper activeStep={activeStep}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && <Alert severity="error">{error.message}</Alert>}

        <Card>
          <CardContent>
            {/* Step 0: Start */}
            {activeStep === 0 && (
              <Stack spacing={3} alignItems="center" py={4}>
                <QrCode2Icon sx={{ fontSize: 80, color: 'primary.main' }} />
                <Typography variant="h6">Ready to pair a new client</Typography>
                <Typography color="text.secondary" align="center">
                  Click "Generate PIN" to create a pairing code for your client device
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleStartPairing}
                  disabled={loading}
                >
                  Generate PIN
                </Button>
              </Stack>
            )}

            {/* Step 1: Waiting for Client */}
            {activeStep === 1 && pairingSession && (
              <Stack spacing={3} alignItems="center" py={4}>
                <Typography variant="h6">Enter this PIN on your client device:</Typography>
                <Paper
                  elevation={3}
                  sx={{
                    p: 4,
                    bgcolor: pinExpired ? 'error.main' : 'primary.main',
                    color: 'primary.contrastText',
                  }}
                >
                  <Typography variant="h2" fontWeight="bold" letterSpacing={4}>
                    {pairingSession.pin}
                  </Typography>
                </Paper>

                {pinExpired ? (
                  <Alert severity="error" sx={{ width: '100%' }}>
                    PIN has expired. Please generate a new PIN.
                  </Alert>
                ) : (
                  <>
                    {/* Countdown Timer Display */}
                    <Box
                      sx={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2
                      }}
                    >
                      {/* Large Countdown */}
                      <Paper
                        elevation={2}
                        sx={{
                          p: 3,
                          bgcolor: timeRemaining > 60 ? 'success.light' : timeRemaining > 30 ? 'warning.light' : 'error.light',
                          borderRadius: 2,
                          minWidth: 200,
                          textAlign: 'center'
                        }}
                      >
                        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                          <TimerIcon
                            sx={{
                              fontSize: 40,
                              color: timeRemaining > 60 ? 'success.dark' : timeRemaining > 30 ? 'warning.dark' : 'error.dark'
                            }}
                          />
                          <Typography
                            variant="h3"
                            fontWeight="bold"
                            sx={{
                              color: timeRemaining > 60 ? 'success.dark' : timeRemaining > 30 ? 'warning.dark' : 'error.dark'
                            }}
                          >
                            {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                          </Typography>
                        </Stack>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            mt: 1,
                            color: timeRemaining > 60 ? 'success.dark' : timeRemaining > 30 ? 'warning.dark' : 'error.dark'
                          }}
                        >
                          Time Remaining
                        </Typography>
                      </Paper>

                      {/* Progress Bar */}
                      <Box sx={{ width: '100%', maxWidth: 400 }}>
                        <LinearProgress
                          variant="determinate"
                          value={(timeRemaining / 300) * 100} // Assuming 5 minute max
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            bgcolor: 'grey.200',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: timeRemaining > 60 ? 'success.main' : timeRemaining > 30 ? 'warning.main' : 'error.main',
                              borderRadius: 4
                            }
                          }}
                        />
                      </Box>
                    </Box>

                    <Alert severity="info" sx={{ width: '100%' }}>
                      Waiting for client to enter PIN...
                    </Alert>
                  </>
                )}

                <Button
                  variant="outlined"
                  onClick={handleCancel}
                >
                  {pinExpired ? 'Generate New PIN' : 'Cancel Pairing'}
                </Button>
              </Stack>
            )}

            {/* Step 2: Admin Assigns Areas */}
            {activeStep === 2 && (
              <Stack spacing={3}>
                <Alert severity="success">
                  Client connected! Device: {verifiedDeviceName} ({verifiedDeviceType})
                </Alert>

                <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Connected Device Information
                  </Typography>
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      Device Name: {verifiedDeviceName}
                    </Typography>
                    <Typography variant="body2">
                      Device Type: {verifiedDeviceType}
                    </Typography>
                  </Stack>
                </Paper>

                <TextField
                  fullWidth
                  label="Client Name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g., Living Room Tablet"
                  helperText="Customize the display name for this client"
                />

                <FormControl fullWidth>
                  <InputLabel>Assigned Areas *</InputLabel>
                  <Select
                    multiple
                    value={selectedAreas}
                    label="Assigned Areas *"
                    onChange={(e) => setSelectedAreas(e.target.value as string[])}
                    renderValue={(selected) => (
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {selected.map((id) => (
                          <Chip
                            key={id}
                            label={areas.find((a) => a.id === id)?.name || id}
                            size="small"
                          />
                        ))}
                      </Box>
                    )}
                  >
                    {areas.map((area) => (
                      <MenuItem key={area.id} value={area.id}>
                        {area.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Box display="flex" gap={2} justifyContent="flex-end">
                  <Button onClick={handleCancel}>Cancel</Button>
                  <Button
                    variant="contained"
                    onClick={handleCompletePairing}
                    disabled={!clientName.trim() || selectedAreas.length === 0}
                  >
                    Complete Pairing
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Step 3: Success */}
            {activeStep === 3 && pairedClient && (
              <Stack spacing={3} alignItems="center" py={4}>
                <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main' }} />
                <Typography variant="h6">Pairing Complete!</Typography>

                <Paper sx={{ p: 3, bgcolor: 'background.default', width: '100%' }}>
                  <Typography variant="subtitle2" gutterBottom color="primary">
                    Client Details
                  </Typography>
                  <Stack spacing={2} mt={2}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Name
                      </Typography>
                      <Typography variant="body1" fontWeight="medium">
                        {pairedClient.name}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Device Type
                      </Typography>
                      <Typography variant="body1" fontWeight="medium">
                        {pairedClient.deviceType}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Assigned Areas
                      </Typography>
                      <Box display="flex" gap={0.5} flexWrap="wrap" mt={0.5}>
                        {selectedAreas.length > 0 ? (
                          selectedAreas.map((areaId) => (
                            <Chip
                              key={areaId}
                              label={areas.find((a) => a.id === areaId)?.name || areaId}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          ))
                        ) : (
                          <Typography variant="body1">None</Typography>
                        )}
                      </Box>
                    </Box>
                  </Stack>
                </Paper>

                <Button variant="contained" onClick={handleReset} size="large">
                  Pair Another Client
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};
