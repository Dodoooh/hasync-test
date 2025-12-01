import { useEffect, useCallback } from 'react';
import { wsClient } from '@/api/websocket';
import { useAppStore } from '@/context/AppContext';

export const useWebSocket = () => {
  const { updateEntity, updateClient } = useAppStore();

  const connect = useCallback(() => {
    wsClient.connect();
  }, []);

  const disconnect = useCallback(() => {
    wsClient.disconnect();
  }, []);

  useEffect(() => {
    // Entity updates
    const unsubEntity = wsClient.on('entity_update', (data) => {
      updateEntity(data.entity);
    });

    // Client connections
    const unsubClientConnect = wsClient.on('client_connected', (data) => {
      updateClient(data.client);
    });

    const unsubClientDisconnect = wsClient.on('client_disconnected', (data) => {
      updateClient(data.client);
    });

    // Cleanup
    return () => {
      unsubEntity();
      unsubClientConnect();
      unsubClientDisconnect();
    };
  }, [updateEntity, updateClient]);

  return {
    connect,
    disconnect,
    isConnected: wsClient.isConnected,
    on: wsClient.on.bind(wsClient),
    send: wsClient.send.bind(wsClient),
  };
};
