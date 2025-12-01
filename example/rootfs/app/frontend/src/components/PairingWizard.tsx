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
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useAppStore } from '@/context/AppContext';
import { useApi } from '@/hooks/useApi';
import { useWebSocket } from '@/hooks/useWebSocket';
import { apiClient } from '@/api/client';
import { EntitySelector } from './EntitySelector';
import type { PairingSession, Client } from '@/types';

const steps = ['Generate PIN', 'Client Connection', 'Configure Client', 'Complete'];

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

  useEffect(() => {
    // Listen for pairing requests
    const unsubscribe = onWsEvent('pairing_request', (data: { session: PairingSession }) => {
      if (data.session.id === pairingSession?.id) {
        setPairingSession(data.session);
        if (data.session.status === 'active') {
          setActiveStep(2); // Move to configuration step
        }
      }
    });

    return unsubscribe;
  }, [pairingSession, onWsEvent]);

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
      const client = await apiClient.completePairing(pairingSession.id, {
        name: clientName,
        deviceType,
        assignedAreas: selectedAreas,
        assignedDashboard: selectedDashboard || undefined,
      });

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

            {/* Step 1: Show PIN */}
            {activeStep === 1 && pairingSession && (
              <Stack spacing={3} alignItems="center" py={4}>
                <Typography variant="h6">Enter this PIN on your client device:</Typography>
                <Paper
                  elevation={3}
                  sx={{
                    p: 4,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                  }}
                >
                  <Typography variant="h2" fontWeight="bold" letterSpacing={4}>
                    {pairingSession.pin}
                  </Typography>
                </Paper>
                <Typography color="text.secondary" align="center">
                  Waiting for client to connect...
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  PIN expires: {new Date(pairingSession.expiresAt).toLocaleTimeString()}
                </Typography>
                <Button variant="outlined" onClick={handleCancel}>
                  Cancel Pairing
                </Button>
              </Stack>
            )}

            {/* Step 2: Configure Client */}
            {activeStep === 2 && (
              <Stack spacing={3}>
                <Alert severity="success">Client connected successfully!</Alert>

                <TextField
                  fullWidth
                  label="Client Name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g., Living Room Tablet"
                />

                <FormControl fullWidth>
                  <InputLabel>Device Type</InputLabel>
                  <Select
                    value={deviceType}
                    label="Device Type"
                    onChange={(e) => setDeviceType(e.target.value as Client['deviceType'])}
                  >
                    <MenuItem value="phone">Phone</MenuItem>
                    <MenuItem value="tablet">Tablet</MenuItem>
                    <MenuItem value="desktop">Desktop</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Assign Areas</InputLabel>
                  <Select
                    multiple
                    value={selectedAreas}
                    label="Assign Areas"
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

                <FormControl fullWidth>
                  <InputLabel>Assign Dashboard</InputLabel>
                  <Select
                    value={selectedDashboard}
                    label="Assign Dashboard"
                    onChange={(e) => setSelectedDashboard(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {dashboards.map((dashboard) => (
                      <MenuItem key={dashboard.id} value={dashboard.id}>
                        {dashboard.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Box display="flex" gap={2} justifyContent="flex-end">
                  <Button onClick={handleCancel}>Cancel</Button>
                  <Button
                    variant="contained"
                    onClick={handleCompletePairing}
                    disabled={!clientName.trim()}
                  >
                    Complete Pairing
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Step 3: Complete */}
            {activeStep === 3 && pairedClient && (
              <Stack spacing={3} alignItems="center" py={4}>
                <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main' }} />
                <Typography variant="h6">Pairing Complete!</Typography>
                <Paper sx={{ p: 2, bgcolor: 'background.default', width: '100%' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Client Details:
                  </Typography>
                  <Stack spacing={1}>
                    <Typography>Name: {pairedClient.name}</Typography>
                    <Typography>Device: {pairedClient.deviceType}</Typography>
                    <Typography>
                      Areas: {selectedAreas.length > 0 ? selectedAreas.length : 'None'}
                    </Typography>
                    <Typography>
                      Dashboard:{' '}
                      {selectedDashboard
                        ? dashboards.find((d) => d.id === selectedDashboard)?.name
                        : 'None'}
                    </Typography>
                  </Stack>
                </Paper>
                <Button variant="contained" onClick={handleReset}>
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
