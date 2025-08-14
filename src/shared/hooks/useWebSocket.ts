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
    
    // Enhanced logging for task/generation debugging
    const isTaskQuery = Array.isArray(key) && key[0] === 'tasks';
    const isGenerationQuery = Array.isArray(key) && (key[0] === 'generations' || key[0] === 'unified-generations');
    
    console.log('[CacheInvalidationDebug] Scheduled invalidation:', {
      queryKey: key,
      serializedKey: JSON.stringify(key),
      totalPending: pendingInvalidationsRef.current.size,
      isTaskQuery,
      isGenerationQuery,
      projectId,
      visibilityState: document.visibilityState,
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
            
            console.log('[RealtimeDebug] Received broadcast message:', {
              messageType: message.type,
              payload: message.payload,
              projectId,
              visibilityState: document.visibilityState,
              timestamp: Date.now(),
              fullMessage: message
            });
            
            // Keep broadcast handling for backwards compatibility and custom events
            switch (message.type) {
              case 'TASK_CREATED':
                console.log('[RealtimeDebug] TASK_CREATED - invalidating task caches:', {
                  projectId,
                  cacheKeysToInvalidate: [
                    ['task-status-counts', projectId],
                    ['tasks', 'paginated', projectId, 1, 50, undefined]
                  ],
                  timestamp: Date.now()
                });
                scheduleInvalidation(['task-status-counts', projectId]);
                // Only invalidate first page where new tasks appear
                scheduleInvalidation(['tasks', 'paginated', projectId, 1, 50, undefined]);
                break;

              case 'TASK_COMPLETED':
                const taskQueryData = queryClient.getQueriesData({
                  queryKey: ['tasks', 'paginated', projectId]
                });
                console.log('[RealtimeDebug] TASK_COMPLETED - invalidating task and generation caches:', {
                  projectId,
                  taskPagesFound: taskQueryData.length,
                  cacheKeysToInvalidate: [
                    ['task-status-counts', projectId],
                    ['generations', projectId],
                    ...taskQueryData.map(([key]) => key)
                  ],
                  timestamp: Date.now()
                });
                scheduleInvalidation(['task-status-counts', projectId]);
                // Invalidate all cached task pages since status changes can move tasks between filters
                taskQueryData.forEach(([queryKey]) => scheduleInvalidation(queryKey));
                scheduleInvalidation(['generations', projectId]);
                break;

              case 'TASKS_STATUS_UPDATE':
                console.log('[PollingBreakageIssue] TASKS_STATUS_UPDATE broadcast, using GALLERY PATTERN invalidation');
                scheduleInvalidation(['task-status-counts', projectId]);
                // Invalidate cached task pages since status changes can move tasks between filters
                const statusUpdateQueries = queryClient.getQueriesData({
                  queryKey: ['tasks', 'paginated', projectId]
                });
                statusUpdateQueries.forEach(([queryKey]) => scheduleInvalidation(queryKey));
                break;

              case 'GENERATIONS_UPDATED':
                const { shotId } = message.payload;
                
                // Collect unified generations queries for both modes
                const unifiedProjectQueries = queryClient.getQueriesData({
                  queryKey: ['unified-generations', 'project', projectId]
                });
                const unifiedShotQueries = shotId ? queryClient.getQueriesData({
                  queryKey: ['unified-generations', 'shot', shotId]
                }) : [];
                
                console.log('[RealtimeDebug] GENERATIONS_UPDATED - invalidating generation caches:', {
                  projectId,
                  shotId,
                  unifiedProjectQueriesFound: unifiedProjectQueries.length,
                  unifiedShotQueriesFound: unifiedShotQueries.length,
                  cacheKeysToInvalidate: [
                    ['shots', projectId],
                    ['generations', projectId],
                    ...unifiedProjectQueries.map(([key]) => key),
                    ...(shotId ? [['shots', shotId], ['all-shot-generations', shotId]] : []),
                    ...unifiedShotQueries.map(([key]) => key)
                  ],
                  timestamp: Date.now()
                });
                
                scheduleInvalidation(['shots', projectId]);
                scheduleInvalidation(['generations', projectId]);
                
                // Invalidate unified generations cache for both project-wide and shot-specific modes
                unifiedProjectQueries.forEach(([queryKey]) => scheduleInvalidation(queryKey));
                
                if (shotId) {
                  scheduleInvalidation(['shots', shotId]);
                  // Invalidate unified generations cache for this specific shot
                  const unifiedShotQueries = queryClient.getQueriesData({
                    queryKey: ['unified-generations', 'shot', shotId]
                  });
                  unifiedShotQueries.forEach(([queryKey]) => scheduleInvalidation(queryKey));
                  
                  // Also invalidate legacy shot generations cache
                  scheduleInvalidation(['all-shot-generations', shotId]);
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
            const newRecord = payload.new as any;
            const oldRecord = payload.old as any;
            
            console.log('[RealtimeDebug] Database UPDATE on tasks table:', {
              taskId: newRecord?.id,
              oldStatus: oldRecord?.status,
              newStatus: newRecord?.status,
              oldUpdatedAt: oldRecord?.updated_at,
              newUpdatedAt: newRecord?.updated_at,
              projectId,
              taskType: newRecord?.task_type,
              outputLocation: newRecord?.output_location,
              errorMessage: newRecord?.error_message,
              generationCreated: newRecord?.generation_created,
              visibilityState: document.visibilityState,
              timestamp: Date.now(),
              fullPayload: payload
            });
            
            log('PerfDebug:DBChange', 'Task updated:', payload);
            
            // FIXED: Use targeted invalidation to prevent cascade storms
            console.log('[PollingBreakageIssue] Task status changed, using SMART invalidation:', {
              projectId,
              taskId: payload.new?.id,
              newStatus: newRecord?.status,
              timestamp: Date.now()
            });
            
            // Strategy: Only invalidate queries that are currently cached and relevant
            // This prevents the massive invalidation storm we were seeing
            
            // Always invalidate status counts (lightweight)
            scheduleInvalidation(['task-status-counts', projectId]);
            
            // Only invalidate first page of Processing tasks (where status changes matter most)
            // Use the exact same cache key format as usePaginatedTasks
            const processingStatuses = ['Queued', 'In Progress'];
            scheduleInvalidation(['tasks', 'paginated', projectId, 1, 50, processingStatuses]);
            
            // Only invalidate video outputs if this was a task completion
            if (newRecord?.status === 'Complete' && oldRecord?.status !== 'Complete') {
              scheduleInvalidation(['video-outputs', projectId]);
            }
            
            // If task completed, also invalidate generations
            if (newRecord?.status === 'Complete' && oldRecord?.status !== 'Complete') {
              log('PerfDebug:DBChange', 'Task completed, invalidating generations');
              scheduleInvalidation(['generations', projectId]);
              
              // Invalidate unified generations cache
              const unifiedProjectQueries = queryClient.getQueriesData({
                queryKey: ['unified-generations', 'project', projectId]
              });
              unifiedProjectQueries.forEach(([queryKey]) => scheduleInvalidation(queryKey));
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
            const newRecord = payload.new as any;
            
            // Extract shot ID from various possible locations
            const shotId = newRecord?.params?.shotId || 
                          newRecord?.params?.shot_id ||
                          newRecord?.metadata?.shotId ||
                          newRecord?.metadata?.shot_id;
            
            // Collect unified generations queries that will be invalidated
            const unifiedProjectQueries = queryClient.getQueriesData({
              queryKey: ['unified-generations', 'project', projectId]
            });
            const unifiedShotQueries = shotId ? queryClient.getQueriesData({
              queryKey: ['unified-generations', 'shot', shotId]
            }) : [];
            
            console.log('[RealtimeDebug] Database INSERT on generations table:', {
              generationId: newRecord?.id,
              projectId: newRecord?.project_id,
              type: newRecord?.type,
              mediaType: newRecord?.type?.includes('video') ? 'video' : 'image',
              location: newRecord?.location,
              starred: newRecord?.starred,
              shotId,
              tasks: newRecord?.tasks,
              unifiedProjectQueriesFound: unifiedProjectQueries.length,
              unifiedShotQueriesFound: unifiedShotQueries.length,
              cacheKeysToInvalidate: [
                ['generations', projectId],
                ['shots', projectId],
                ...unifiedProjectQueries.map(([key]) => key),
                ...(shotId ? [['shots', shotId], ['all-shot-generations', shotId]] : []),
                ...unifiedShotQueries.map(([key]) => key)
              ],
              visibilityState: document.visibilityState,
              timestamp: Date.now(),
              fullPayload: payload
            });
            
            log('PerfDebug:DBChange', 'Generation created:', payload);
            
            // Invalidate generations and shots queries
            scheduleInvalidation(['generations', projectId]);
            scheduleInvalidation(['shots', projectId]);
            
            // Invalidate unified generations cache for project-wide queries (already declared above)
            unifiedProjectQueries.forEach(([queryKey]) => scheduleInvalidation(queryKey));
            
            // If there's a shot_id in params, invalidate that specific shot (shotId already declared above)
            
            if (shotId) {
              scheduleInvalidation(['shots', shotId]);
              // CRITICAL: Also invalidate the all-shot-generations query used by ShotEditor
              scheduleInvalidation(['all-shot-generations', shotId]);
              
              // Invalidate unified generations cache for this specific shot
              const unifiedShotQueries = queryClient.getQueriesData({
                queryKey: ['unified-generations', 'shot', shotId]
              });
              unifiedShotQueries.forEach(([queryKey]) => scheduleInvalidation(queryKey));
              
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