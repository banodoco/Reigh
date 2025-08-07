import React from 'react';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

  // Simple logging function for performance debugging
const log = (category: string, message: string, data?: any) => {
  console.log(`[${category}] ${message}`, data);
};

// Throttle function to prevent excessive invalidations of the same key
const createThrottledInvalidation = () => {
  const lastInvalidationTimes = new Map<string, number>();
  const THROTTLE_DELAY = 500; // Don't invalidate the same key more than once per 500ms
  
  return (key: any): boolean => {
    const keyString = JSON.stringify(key);
    const now = Date.now();
    const lastTime = lastInvalidationTimes.get(keyString) || 0;
    
    if (now - lastTime > THROTTLE_DELAY) {
      lastInvalidationTimes.set(keyString, now);
      return true; // Allow invalidation
    }
    return false; // Skip invalidation (too recent)
  };
};

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
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingInvalidationsRef = useRef<Set<string>>(new Set());
  const shouldThrottle = useRef(createThrottledInvalidation());

  const scheduleInvalidation = (key: any) => {
    // Check if this key should be throttled
    if (!shouldThrottle.current(key)) {
      console.log('[VideoLoadSpeedIssue] Skipped invalidation (throttled):', {
        queryKey: key,
        timestamp: Date.now()
      });
      return;
    }
    
    pendingInvalidationsRef.current.add(JSON.stringify(key));
    
    console.log('[VideoLoadSpeedIssue] Scheduled invalidation:', {
      queryKey: key,
      serializedKey: JSON.stringify(key),
      totalPending: pendingInvalidationsRef.current.size,
      timestamp: Date.now()
    });

    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        const invalidationCount = pendingInvalidationsRef.current.size;
        log('PerfDebug:WebSocketFlush', `Flushing ${invalidationCount} invalidations`);
        
        console.log('[VideoLoadSpeedIssue] Flushing invalidations:', {
          count: invalidationCount,
          keys: Array.from(pendingInvalidationsRef.current),
          timestamp: Date.now()
        });

        let successCount = 0;
        pendingInvalidationsRef.current.forEach((keyString) => {
          try {
            const parsedKey = JSON.parse(keyString);
            queryClient.invalidateQueries({ queryKey: parsedKey });
            successCount++;
          } catch (err) {
            // Fallback for primitive keys that can't be parsed
            console.warn('[VideoLoadSpeedIssue] Failed to parse query key:', {
              keyString,
              error: err,
              timestamp: Date.now()
            });
            queryClient.invalidateQueries({ queryKey: keyString as any });
            successCount++;
          }
        });
        
        pendingInvalidationsRef.current.clear();
        flushTimerRef.current = null;
        console.log('[VideoLoadSpeedIssue] Invalidation flush completed:', {
          processed: successCount,
          timestamp: Date.now()
        });
      }, 200); // Flush once every 200 ms max (reduced frequency)
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
            
            // Keep broadcast handling for backwards compatibility and custom events
            switch (message.type) {
              case 'TASK_CREATED':
                scheduleInvalidation(['tasks', { projectId }]);
                break;

              case 'TASK_COMPLETED':
                console.log('[VideoLoadSpeedIssue] TASK_COMPLETED broadcast received:', {
                  projectId,
                  timestamp: Date.now()
                });
                scheduleInvalidation(['tasks', { projectId }]);
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
            console.error('[WebSocket] Error parsing broadcast message:', error);
          }
        })
        // Listen to database changes on tasks table (primary real-time mechanism)
        .on('postgres_changes', 
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'tasks',
            filter: `project_id=eq.${projectId}`
          }, 
          (payload) => {
            log('PerfDebug:DBChange', 'Task updated:', payload);
            console.log(`[${Date.now()}] [WebSocket] Task status changed:`, {
              taskId: payload.new?.id,
              oldStatus: payload.old?.status,
              newStatus: payload.new?.status,
              projectId,
            });
            
            const newRecord = payload.new as any;
            const oldRecord = payload.old as any;
            
            // Optimized invalidation: Only invalidate the most specific queries needed
            scheduleInvalidation(['tasks', { projectId }]);
            scheduleInvalidation(['task-status-counts', projectId]);
            
            // If task completed, also invalidate generations
            if (newRecord?.status === 'Complete' && oldRecord?.status !== 'Complete') {
              log('PerfDebug:DBChange', 'Task completed, invalidating generations');
              scheduleInvalidation(['generations', projectId]);
            }
          }
        )
        // Listen to database changes on generations table (primary real-time mechanism)
        .on('postgres_changes', 
          { 
            event: 'INSERT',
            schema: 'public', 
            table: 'generations',
            filter: `project_id=eq.${projectId}`
          }, 
          (payload) => {
            log('PerfDebug:DBChange', 'Generation created:', payload);
            
            const newRecord = payload.new as any;
            
            console.log('[VideoLoadSpeedIssue] Generation INSERT detected:', {
              generationId: newRecord?.id,
              projectId: newRecord?.project_id,
              type: newRecord?.type,
              timestamp: Date.now()
            });
            
            // Invalidate generations and shots queries
            scheduleInvalidation(['generations', projectId]);
            scheduleInvalidation(['shots', projectId]);
            
            // If there's a shot_id in params, invalidate that specific shot
            const shotId = newRecord?.params?.shotId || newRecord?.params?.shot_id;
            
            if (shotId) {
              scheduleInvalidation(['shots', shotId]);
              // CRITICAL: Also invalidate the all-shot-generations query used by ShotEditor
              scheduleInvalidation(['all-shot-generations', shotId]);
              console.log('[VideoLoadSpeedIssue] Scheduled shot invalidation:', {
                shotId,
                timestamp: Date.now()
              });
            }
          }
        )
        // Listen to shot_generations changes
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'shot_generations'
          }, 
          (payload) => {
            log('PerfDebug:DBChange', 'Shot generation changed:', payload);
            
            const record = payload.new || payload.old;
            const shotId = (record as any)?.shot_id;
            
            console.log('[VideoLoadSpeedIssue] Shot generation change:', {
              event: payload.eventType,
              shotId,
              timestamp: Date.now()
            });
            
            // Invalidate shots and generations
            scheduleInvalidation(['shots', projectId]);
            scheduleInvalidation(['generations', projectId]);
            
            // CRITICAL: Also invalidate the specific shot's all-shot-generations query
            if (shotId) {
              scheduleInvalidation(['all-shot-generations', shotId]);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' && err) {
            console.error('[VideoLoadSpeedIssue] WebSocket channel error:', { status, error: err, projectId, timestamp: Date.now() });
          } else if (status === 'CLOSED') {
            console.warn('[VideoLoadSpeedIssue] WebSocket channel closed:', { status, projectId, timestamp: Date.now() });
          } else if (status === 'SUBSCRIBED') {
            console.log('[VideoLoadSpeedIssue] WebSocket channel subscribed successfully:', { status, projectId, timestamp: Date.now() });
          } else {
            console.log('[VideoLoadSpeedIssue] WebSocket status change:', { status, projectId, timestamp: Date.now() });
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