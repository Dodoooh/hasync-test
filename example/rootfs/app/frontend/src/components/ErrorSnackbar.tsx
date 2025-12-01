import React from 'react';
import {
  Snackbar,
  Alert,
  AlertTitle,
  Button,
  Box,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { FormattedError } from '@/utils/errorMessages';

export interface ErrorSnackbarProps {
  open: boolean;
  error: FormattedError | null;
  onClose: () => void;
  onAction?: () => void;
  autoHideDuration?: number;
}

/**
 * Enhanced error snackbar with severity levels and actions
 * Features:
 * - Different severity levels (error, warning, info)
 * - Auto-dismiss after configurable duration
 * - Manual close option
 * - Optional action button (e.g., Retry)
 * - Accessible with ARIA labels
 */
export const ErrorSnackbar: React.FC<ErrorSnackbarProps> = ({
  open,
  error,
  onClose,
  onAction,
  autoHideDuration = 6000,
}) => {
  if (!error) return null;

  const handleAction = () => {
    onAction?.();
    onClose();
  };

  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={error.severity}
        onClose={onClose}
        sx={{
          width: '100%',
          minWidth: 300,
          maxWidth: 600,
        }}
        action={
          <Box display="flex" alignItems="center" gap={1}>
            {error.action && onAction && (
              <Button
                color="inherit"
                size="small"
                onClick={handleAction}
                startIcon={<RefreshIcon />}
              >
                {error.action}
              </Button>
            )}
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={onClose}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        }
      >
        <AlertTitle>{error.title}</AlertTitle>
        {error.message}
      </Alert>
    </Snackbar>
  );
};

/**
 * Simple snackbar for success messages
 */
export interface SuccessSnackbarProps {
  open: boolean;
  message: string;
  onClose: () => void;
  autoHideDuration?: number;
}

export const SuccessSnackbar: React.FC<SuccessSnackbarProps> = ({
  open,
  message,
  onClose,
  autoHideDuration = 3000,
}) => {
  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert onClose={onClose} severity="success" sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  );
};
