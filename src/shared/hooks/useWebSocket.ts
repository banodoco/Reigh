import React from 'react';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useWebSocket(projectId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const setupTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Don't create a channel if we don't have a projectId
    if (!projectId) {
      return;
    }

    // Clear any pending setup
    if (setupTimerRef.current) {
      clearTimeout(setupTimerRef.current);
      setupTimerRef.current = null;
    }

    // Clean up any existing channel before creating a new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Small delay to prevent race conditions when switching projects rapidly
    setupTimerRef.current = setTimeout(() => {
      // Create a project-specific channel topic
      const channelTopic = `task-updates:${projectId}`;
      
      // Create a Supabase Realtime channel for task updates
      const channel = supabase
        .channel(channelTopic, {
          config: {
            broadcast: {
              self: false, // Don't receive own messages
              ack: false,  // Don't require acknowledgment
            },
          },
        })
        .on('broadcast', { event: 'task-update' }, (payload) => {
          try {
            const message = payload.payload;
            
            // No need to check projectId - we're already subscribed to the right channel!
            switch (message.type) {
              case 'TASK_CREATED':
                console.log(`[WebSocket] Task created for project ${projectId}, invalidating task queries.`);
                queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
                break;

              case 'TASK_COMPLETED':
                console.log(`[WebSocket] Task completed for project ${projectId}. Invalidating task & generation queries.`);
                queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
                queryClient.invalidateQueries({ queryKey: ['tasks'] }); // General task list
                queryClient.invalidateQueries({ queryKey: ['generations', projectId] });
                break;

              case 'TASKS_STATUS_UPDATE':
                // console.log(`[WebSocket] Invalidating task queries for project ${projectId} due to status update.`);
                queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
                break;

              case 'GENERATIONS_UPDATED':
                const { shotId } = message.payload;
                console.log(`[WebSocket] Invalidating generation/shot queries for project: ${projectId}, shot: ${shotId}`);
                queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
                queryClient.invalidateQueries({ queryKey: ['generations', projectId] });
                if (shotId) {
                  queryClient.invalidateQueries({ queryKey: ['shots', shotId] });
                }
                break;

              default:
                console.warn('[WebSocket] Received unknown message type:', message.type);
                break;
            }
          } catch (error) {
            console.error('[WebSocket] Error parsing message or handling event:', error);
          }
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[WebSocket] Connected to Supabase Realtime for project ${projectId}`);
          } else if (status === 'CHANNEL_ERROR' && err) {
            console.error('[WebSocket] Supabase Realtime channel error:', err);
          } else if (status === 'TIMED_OUT') {
            console.error('[WebSocket] Supabase Realtime connection timed out');
          } else if (status === 'CLOSED') {
            console.log('[WebSocket] Disconnected from Supabase Realtime');
          }
        });

      channelRef.current = channel;
    }, 50); // 50ms delay to let any pending channel cleanup complete

    return () => {
      // Clear any pending setup
      if (setupTimerRef.current) {
        clearTimeout(setupTimerRef.current);
        setupTimerRef.current = null;
      }
      // Clean up the channel when the component unmounts or projectId changes
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient, projectId]);
} 