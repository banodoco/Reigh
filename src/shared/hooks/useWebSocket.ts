import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.hostname}:8085`;

export function useWebSocket() {
  const queryClient = useQueryClient();
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (ws.current) return;

    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log('[WebSocket] Connected to server');
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Received message:', message);

        switch (message.type) {
          case 'TASK_COMPLETED': {
            const { projectId } = message.payload;
            console.log(`[WebSocket] Invalidating task queries for project: ${projectId}`);
            queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
            queryClient.invalidateQueries({ queryKey: ['tasks'] }); // Invalidate general task list if any
            break;
          }
          case 'TASKS_STATUS_UPDATE': {
            const { projectId } = message.payload;
            // console.log(`[WebSocket] Invalidating task queries for project ${projectId} due to status update.`);
            queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
            break;
          }
          case 'GENERATIONS_UPDATED': {
            const { projectId, shotId } = message.payload;
            console.log(`[WebSocket] Invalidating generation/shot queries for project: ${projectId}, shot: ${shotId}`);
            queryClient.invalidateQueries({ queryKey: ['shots', { projectId }] });
            queryClient.invalidateQueries({ queryKey: ['generations', { projectId }] });
            if (shotId) {
              queryClient.invalidateQueries({ queryKey: ['shots', { shotId }] });
            }
            break;
          }
          default:
            console.warn('[WebSocket] Received unknown message type:', message.type);
            break;
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message or handling event:', error);
      }
    };

    ws.current.onclose = () => {
      console.log(`[WebSocket] Disconnected from ${WS_URL}`);
      ws.current = null;
    };

    ws.current.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [queryClient]);
} 