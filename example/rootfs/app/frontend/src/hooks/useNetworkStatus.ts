import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
  online: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

export interface QueuedOperation {
  id: string;
  operation: () => Promise<any>;
  retryCount: number;
  maxRetries: number;
}

/**
 * Hook for network status detection and offline operation queueing
 * Features:
 * - Real-time network status monitoring
 * - Offline mode detection
 * - Operation queuing when offline
 * - Auto-retry when back online
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>(() => ({
    online: navigator.onLine,
  }));
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Update network status
  const updateNetworkStatus = useCallback(() => {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

    setStatus({
      online: navigator.onLine,
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
    });
  }, []);

  // Process queued operations when back online
  const processQueue = useCallback(async () => {
    if (!navigator.onLine || queue.length === 0 || isProcessingQueue) {
      return;
    }

    setIsProcessingQueue(true);

    const remainingQueue: QueuedOperation[] = [];

    for (const item of queue) {
      try {
        await item.operation();
        console.log(`Successfully processed queued operation: ${item.id}`);
      } catch (error) {
        console.error(`Failed to process queued operation: ${item.id}`, error);

        // Retry if under max retries
        if (item.retryCount < item.maxRetries) {
          remainingQueue.push({
            ...item,
            retryCount: item.retryCount + 1,
          });
        } else {
          console.error(`Max retries reached for operation: ${item.id}`);
        }
      }
    }

    setQueue(remainingQueue);
    setIsProcessingQueue(false);
  }, [queue, isProcessingQueue]);

  // Queue an operation for later execution
  const queueOperation = useCallback((
    id: string,
    operation: () => Promise<any>,
    maxRetries: number = 3
  ) => {
    setQueue(prev => [...prev, {
      id,
      operation,
      retryCount: 0,
      maxRetries,
    }]);
  }, []);

  // Clear the queue
  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  // Set up event listeners
  useEffect(() => {
    const handleOnline = () => {
      updateNetworkStatus();
      processQueue();
    };

    const handleOffline = () => {
      updateNetworkStatus();
    };

    const handleConnectionChange = () => {
      updateNetworkStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    connection?.addEventListener('change', handleConnectionChange);

    // Initial status check
    updateNetworkStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      connection?.removeEventListener('change', handleConnectionChange);
    };
  }, [updateNetworkStatus, processQueue]);

  // Auto-process queue when it changes and we're online
  useEffect(() => {
    if (status.online && queue.length > 0 && !isProcessingQueue) {
      processQueue();
    }
  }, [status.online, queue.length, isProcessingQueue, processQueue]);

  return {
    status,
    queue,
    queueOperation,
    clearQueue,
    queueSize: queue.length,
    isProcessingQueue,
  };
}
