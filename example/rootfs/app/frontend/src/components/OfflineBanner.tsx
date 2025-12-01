import React from 'react';
import { Alert, Box, Chip, Collapse, LinearProgress } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import WifiIcon from '@mui/icons-material/Wifi';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';

export interface OfflineBannerProps {
  online: boolean;
  queueSize: number;
  isProcessingQueue: boolean;
}

/**
 * Banner that displays network status and queued operations
 * Shows:
 * - Offline warning when disconnected
 * - Number of queued operations
 * - Processing indicator when syncing
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  online,
  queueSize,
  isProcessingQueue,
}) => {
  return (
    <>
      {/* Offline warning */}
      <Collapse in={!online}>
        <Alert
          severity="warning"
          icon={<WifiOffIcon />}
          sx={{
            mb: 2,
            borderRadius: 2,
          }}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <Box flex={1}>
              You are currently offline. Changes will be saved when connection is restored.
            </Box>
            {queueSize > 0 && (
              <Chip
                icon={<CloudQueueIcon />}
                label={`${queueSize} queued`}
                size="small"
                color="warning"
              />
            )}
          </Box>
        </Alert>
      </Collapse>

      {/* Syncing indicator */}
      <Collapse in={online && isProcessingQueue}>
        <Alert
          severity="info"
          icon={<WifiIcon />}
          sx={{
            mb: 2,
            borderRadius: 2,
          }}
        >
          <Box>
            Syncing queued changes...
            <LinearProgress sx={{ mt: 1 }} />
          </Box>
        </Alert>
      </Collapse>

      {/* Successfully synced */}
      <Collapse in={online && !isProcessingQueue && queueSize === 0}>
        {/* This will be hidden by default, only shown briefly after sync */}
      </Collapse>
    </>
  );
};
