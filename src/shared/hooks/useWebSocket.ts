import React from 'react';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { log } from '@/shared/lib/logger';

export function useWebSocket(projectId: string | null) {
  const queryClient = useQueryClient();
  // --- BEGIN batching invalidations logic ---
  // We frequently receive rapid-fire Realtime messages (especially while many tasks
  // are running). Calling `queryClient.invalidateQueries` for each message can be
  // expensive because every invalidation triggers React Query to evaluate all
  // observers synchronously – easily blowing past the 50 ms "long task" budget
  // and flooding DevTools with `[Violation] 'message' handler took …` warnings.

  // Instead, we batch invalidations arriving within a short window (100 ms).
  // Every message adds its queryKey to `pendingInvalidationsRef`; a single
  // debounced timer then flushes the unique set of keys.

  // Using `JSON.stringify` to store keys allows us to dedupe array/object keys in a Set.
  const pendingInvalidationsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scheduleInvalidation = (key: any) => {
    pendingInvalidationsRef.current.add(JSON.stringify(key));

    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        log('PerfDebug:WebSocketFlush', `Flushing ${pendingInvalidationsRef.current.size} invalidations`);

        pendingInvalidationsRef.current.forEach((keyString) => {
          try {
            const parsedKey = JSON.parse(keyString);
            queryClient.invalidateQueries({ queryKey: parsedKey });
          } catch (err) {
            // Fallback for primitive keys that can't be parsed
            queryClient.invalidateQueries({ queryKey: keyString as any });
          }
        });
        pendingInvalidationsRef.current.clear();
        flushTimerRef.current = null;
      }, 100); // Flush once every 100 ms max
    }
  };
  // --- END batching invalidations logic ---
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
                // Batch invalidations to avoid excessive synchronous work
                scheduleInvalidation(['tasks', { projectId }]);
                break;

              case 'TASK_COMPLETED':
                scheduleInvalidation(['tasks', { projectId }]);
                scheduleInvalidation(['tasks']);
                scheduleInvalidation(['generations', projectId]);
                break;

              case 'TASKS_STATUS_UPDATE':
                scheduleInvalidation(['tasks', { projectId }]);
                break;

              case 'GENERATIONS_UPDATED':
                const { shotId } = message.payload;
                scheduleInvalidation(['shots', projectId]);
                scheduleInvalidation(['generations', projectId]);
                if (shotId) {
                  scheduleInvalidation(['shots', shotId]);
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