import React from 'react';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useWebSocket(projectId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (channelRef.current) return;

    // Create a Supabase Realtime channel for task updates
    channelRef.current = supabase
      .channel('task-updates')
      .on('broadcast', { event: 'task-update' }, (payload) => {
        try {
          const message = payload.payload;
          
          switch (message.type) {
            case 'TASK_CREATED': {
              const { projectId } = message.payload;
              console.log(`[WebSocket] Task created for project ${projectId}, invalidating task queries.`);
              queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
              break;
            }
            case 'TASK_COMPLETED': {
              const { projectId } = message.payload;
              console.log(`[WebSocket] Task completed for project ${projectId}. Invalidating task & generation queries.`);
              queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
              queryClient.invalidateQueries({ queryKey: ['tasks'] }); // General task list
              queryClient.invalidateQueries({ queryKey: ['generations', projectId] });
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
              queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
              queryClient.invalidateQueries({ queryKey: ['generations', projectId] });
              if (shotId) {
                queryClient.invalidateQueries({ queryKey: ['shots', shotId] });
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
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[WebSocket] Connected to Supabase Realtime');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[WebSocket] Supabase Realtime channel error');
        } else if (status === 'TIMED_OUT') {
          console.error('[WebSocket] Supabase Realtime connection timed out');
        } else if (status === 'CLOSED') {
          console.log('[WebSocket] Disconnected from Supabase Realtime');
        }
      });

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [queryClient]);
} 