import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Stack,
  Divider,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Policy as PolicyIcon,
} from '@mui/icons-material';

interface ConsentState {
  data_processing: boolean;
  analytics: boolean;
  marketing: boolean;
  consent_date: number | null;
}

export const GdprCompliance: React.FC = () => {
  const [consent, setConsent] = useState<ConsentState>({
    data_processing: false,
    analytics: false,
    marketing: false,
    consent_date: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [privacyPolicy, setPrivacyPolicy] = useState<any>(null);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);

  // Load consent status
  useEffect(() => {
    loadConsent();
    loadPrivacyPolicy();
  }, []);

  const loadConsent = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/user/consent', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConsent(data);
      }
    } catch (error) {
      console.error('Failed to load consent:', error);
      setMessage({ type: 'error', text: 'Failed to load consent preferences' });
    } finally {
      setLoading(false);
    }
  };

  const loadPrivacyPolicy = async () => {
    try {
      const response = await fetch('/api/privacy-policy');
      if (response.ok) {
        const data = await response.json();
        setPrivacyPolicy(data);
      }
    } catch (error) {
      console.error('Failed to load privacy policy:', error);
    }
  };

  const handleConsentChange = (field: keyof ConsentState) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setConsent((prev) => ({
      ...prev,
      [field]: event.target.checked,
    }));
  };

  const handleSaveConsent = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/user/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(consent),
      });

      if (response.ok) {
        const data = await response.json();
        setConsent(data.consent);
        setMessage({ type: 'success', text: 'Consent preferences saved successfully' });
      } else {
        throw new Error('Failed to save consent');
      }
    } catch (error) {
      console.error('Save consent error:', error);
      setMessage({ type: 'error', text: 'Failed to save consent preferences' });
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      setExporting(true);
      setMessage(null);

      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/user/data-export', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user-data-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setMessage({ type: 'success', text: 'Data exported successfully' });
      } else {
        throw new Error('Failed to export data');
      }
    } catch (error) {
      console.error('Export error:', error);
      setMessage({ type: 'error', text: 'Failed to export data' });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteData = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setMessage({ type: 'error', text: 'Please type DELETE to confirm' });
      return;
    }

    try {
      setDeleting(true);
      setMessage(null);

      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/user/data-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmDelete: true }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'All data deleted. You will be logged out.' });
        setTimeout(() => {
          localStorage.clear();
          window.location.href = '/';
        }, 2000);
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete data');
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to delete data' });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Privacy & Data Management
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Manage your data privacy preferences and exercise your GDPR rights
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mt: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Privacy Policy */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Stack spacing={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <PolicyIcon color="primary" />
            <Typography variant="h6">Privacy Policy</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Learn about how we collect, use, and protect your data
          </Typography>
          <Button
            variant="outlined"
            startIcon={<PolicyIcon />}
            onClick={() => setPolicyDialogOpen(true)}
          >
            View Privacy Policy
          </Button>
        </Stack>
      </Paper>

      {/* Consent Management */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Stack spacing={3}>
          <Typography variant="h6">Consent Preferences</Typography>

          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={consent.data_processing}
                  onChange={handleConsentChange('data_processing')}
                  disabled={saving}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">Data Processing (Required)</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Allow processing of your data to provide core application functionality
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={consent.analytics}
                  onChange={handleConsentChange('analytics')}
                  disabled={saving}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">Analytics (Optional)</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Help us improve the application by collecting anonymous usage data
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={consent.marketing}
                  onChange={handleConsentChange('marketing')}
                  disabled={saving}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">Marketing (Optional)</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Receive updates about new features and improvements
                  </Typography>
                </Box>
              }
            />
          </FormGroup>

          {consent.consent_date && (
            <Typography variant="caption" color="text.secondary">
              Last updated: {new Date(consent.consent_date * 1000).toLocaleString()}
            </Typography>
          )}

          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} /> : <CheckCircleIcon />}
            onClick={handleSaveConsent}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </Stack>
      </Paper>

      {/* Data Export - Right to Access */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Export Your Data</Typography>
          <Typography variant="body2" color="text.secondary">
            Download a complete copy of all your data in JSON format. This includes your account
            information, areas, dashboards, clients, and activity logs.
          </Typography>
          <Button
            variant="outlined"
            color="primary"
            startIcon={exporting ? <CircularProgress size={20} /> : <DownloadIcon />}
            onClick={handleExportData}
            disabled={exporting}
          >
            {exporting ? 'Exporting...' : 'Export My Data'}
          </Button>
        </Stack>
      </Paper>

      {/* Data Deletion - Right to Erasure */}
      <Paper sx={{ p: 3, mt: 3, borderColor: 'error.main', borderWidth: 1, borderStyle: 'solid' }}>
        <Stack spacing={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <WarningIcon color="error" />
            <Typography variant="h6" color="error">
              Delete All My Data
            </Typography>
          </Box>
          <Alert severity="warning">
            <strong>This action is permanent and cannot be undone!</strong>
            <br />
            All your data including account, areas, dashboards, and clients will be permanently deleted.
            You will be logged out and your account will be removed.
          </Alert>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete My Data
          </Button>
        </Stack>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle color="error">Confirm Data Deletion</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete all your data including:
          </DialogContentText>
          <Box component="ul" sx={{ mt: 2 }}>
            <li>Your user account</li>
            <li>All areas and configurations</li>
            <li>All dashboards</li>
            <li>All paired clients</li>
            <li>Activity logs</li>
            <li>Consent preferences</li>
          </Box>
          <DialogContentText sx={{ mt: 2, fontWeight: 'bold' }}>
            Type "DELETE" to confirm:
          </DialogContentText>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '8px',
              fontSize: '16px',
              border: '2px solid #ccc',
              borderRadius: '4px',
            }}
            placeholder="Type DELETE"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteData}
            color="error"
            variant="contained"
            disabled={deleting || deleteConfirmText !== 'DELETE'}
            startIcon={deleting ? <CircularProgress size={20} /> : <DeleteIcon />}
          >
            {deleting ? 'Deleting...' : 'Delete All Data'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Privacy Policy Dialog */}
      <Dialog
        open={policyDialogOpen}
        onClose={() => setPolicyDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Privacy Policy</DialogTitle>
        <DialogContent>
          {privacyPolicy && (
            <Stack spacing={2}>
              <Typography variant="caption" color="text.secondary">
                Version {privacyPolicy.version} - Last Updated: {privacyPolicy.lastUpdated}
              </Typography>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Data Controller</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2">
                    Name: {privacyPolicy.policy.dataController.name}<br />
                    Contact: {privacyPolicy.policy.dataController.contact}
                  </Typography>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Data We Collect</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <ul>
                    {privacyPolicy.policy.dataCollected.map((item: string, idx: number) => (
                      <li key={idx}><Typography variant="body2">{item}</Typography></li>
                    ))}
                  </ul>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Purpose of Processing</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <ul>
                    {privacyPolicy.policy.purposeOfProcessing.map((item: string, idx: number) => (
                      <li key={idx}><Typography variant="body2">{item}</Typography></li>
                    ))}
                  </ul>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Your Rights</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <ul>
                    {privacyPolicy.policy.userRights.map((item: string, idx: number) => (
                      <li key={idx}><Typography variant="body2">{item}</Typography></li>
                    ))}
                  </ul>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Data Retention</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2">
                    Active Users: {privacyPolicy.policy.dataRetention.activeUsers}<br />
                    Deleted Accounts: {privacyPolicy.policy.dataRetention.deletedAccounts}<br />
                    Activity Logs: {privacyPolicy.policy.dataRetention.activityLogs}
                  </Typography>
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Data Security</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <ul>
                    {privacyPolicy.policy.dataSecurity.map((item: string, idx: number) => (
                      <li key={idx}><Typography variant="body2">{item}</Typography></li>
                    ))}
                  </ul>
                </AccordionDetails>
              </Accordion>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPolicyDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
