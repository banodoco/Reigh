import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

// Performance constants
const THROTTLE_DELAY = 500; // Standard throttle delay
const HEAVY_QUERY_THROTTLE_DELAY = 2000; // Heavy queries
const BATCH_FLUSH_DELAY = 150; // Reduced flush delay for better responsiveness
const DEBUG_MODE = process.env.NODE_ENV === 'development'; // Only log in dev

// Optimized key serialization - avoid JSON.stringify in hot paths
const createKeyHash = (key: any): string => {
  if (typeof key === 'string') return key;
  if (Array.isArray(key)) {
    return key.join('|'); // Much faster than JSON.stringify
  }
  return JSON.stringify(key); // Fallback for complex objects
};

// High-performance throttling with minimal overhead
const createOptimizedThrottling = () => {
  const lastTimes = new Map<string, number>();
  
  return (key: any): boolean => {
    const keyHash = createKeyHash(key);
    const now = Date.now();
    const lastTime = lastTimes.get(keyHash) || 0;
    
    // Smart throttle delay based on query type
    const isHeavyQuery = Array.isArray(key) && key[0] === 'all-shot-generations';
    const delay = isHeavyQuery ? HEAVY_QUERY_THROTTLE_DELAY : THROTTLE_DELAY;
    
    if (now - lastTime > delay) {
      lastTimes.set(keyHash, now);
      return true;
    }
    return false;
  };
};

export function useWebSocket(projectId: string | null) {
  const queryClient = useQueryClient();
  
  // --- HIGH-PERFORMANCE BATCHING SYSTEM ---
  // Priority-based invalidation queue with smart batching
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingInvalidationsRef = useRef<Map<string, any>>(new Map()); // key -> original key object
  const shouldThrottle = useRef(createOptimizedThrottling());

  const scheduleInvalidation = (key: any) => {
    // Fast throttle check
    if (!shouldThrottle.current(key)) {
      DEBUG_MODE && console.log('[WebSocket] Throttled:', createKeyHash(key));
      return;
    }
    
    // Smart deferral for heavy queries
    const isHeavyQuery = Array.isArray(key) && key[0] === 'all-shot-generations';
    if (isHeavyQuery) {
      const queryState = queryClient.getQueryState(key);
      if (queryState?.fetchStatus === 'fetching') {
        DEBUG_MODE && console.log('[WebSocket] Deferred (fetching):', createKeyHash(key));
        setTimeout(() => scheduleInvalidation(key), 1000);
        return;
      }
    }
    
    // Use hash as key to avoid duplicate JSON.stringify
    const keyHash = createKeyHash(key);
    pendingInvalidationsRef.current.set(keyHash, key);
    
    // Minimal debug logging (only in dev mode)
    DEBUG_MODE && console.log('[WebSocket] Scheduled:', keyHash, `(${pendingInvalidationsRef.current.size} pending)`);

    // Smart batching with reduced timer overhead
    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        const invalidations = pendingInvalidationsRef.current;
        const count = invalidations.size;
        
        DEBUG_MODE && console.log(`[WebSocket] Flushing ${count} invalidations`);

        // Process invalidations efficiently
        invalidations.forEach((originalKey) => {
          queryClient.invalidateQueries({ queryKey: originalKey });
        });
        
        invalidations.clear();
        flushTimerRef.current = null;
      }, BATCH_FLUSH_DELAY);
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
            DEBUG_MODE && console.log('[WebSocket] Broadcast:', message.type);
            
            // High-performance event handling with minimal cache scanning
            switch (message.type) {
              case 'TASK_CREATED':
                scheduleInvalidation(['task-status-counts', projectId]);
                scheduleInvalidation(['tasks', 'paginated', projectId, 1, 50, undefined]);
                break;

              case 'TASK_COMPLETED':
                // Avoid expensive getQueriesData - use targeted invalidation
                scheduleInvalidation(['task-status-counts', projectId]);
                
                // Be more selective about generations invalidation to avoid interfering with page transitions
                // Only invalidate if no generations queries are currently fetching
                const generationsQueries = queryClient.getQueriesData({ queryKey: ['generations', projectId] });
                const hasActiveFetch = generationsQueries.length === 0 || 
                  queryClient.isFetching({ queryKey: ['generations', projectId] }) > 0;
                
                if (!hasActiveFetch) {
                  scheduleInvalidation(['generations', projectId]);
                }
                
                // Invalidate task queries with common patterns only
                ['Queued', 'In Progress', undefined].forEach(status => {
                  scheduleInvalidation(['tasks', 'paginated', projectId, 1, 50, status ? [status] : undefined]);
                });
                break;

              case 'TASKS_STATUS_UPDATE':
                scheduleInvalidation(['task-status-counts', projectId]);
                // Targeted invalidation instead of scanning all queries
                ['Queued', 'In Progress', 'Complete', 'Failed'].forEach(status => {
                  scheduleInvalidation(['tasks', 'paginated', projectId, 1, 50, [status]]);
                });
                break;

              case 'GENERATIONS_UPDATED':
                const { shotId } = message.payload;
                
                // Direct invalidation without expensive cache scans
                scheduleInvalidation(['shots', projectId]);
                scheduleInvalidation(['generations', projectId]);
                
                if (shotId) {
                  scheduleInvalidation(['all-shot-generations', shotId]);
                  // Use targeted patterns instead of scanning
                  scheduleInvalidation(['unified-generations', 'shot', shotId]);
                }
                
                // Project-wide unified generations
                scheduleInvalidation(['unified-generations', 'project', projectId]);
                break;

              default:
                DEBUG_MODE && console.warn('[WebSocket] Unknown message type:', message.type);
                break;
            }
          } catch (error) {
            console.error('[WebSocket] Error in broadcast handler:', error);
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
            
            DEBUG_MODE && console.log('[WebSocket] Task UPDATE:', {
              taskId: newRecord?.id,
              oldStatus: oldRecord?.status,
              newStatus: newRecord?.status
            });
            
            // High-performance targeted invalidation
            scheduleInvalidation(['task-status-counts', projectId]);
            
            // Smart invalidation based on status change
            const statusChanged = oldRecord?.status !== newRecord?.status;
            
            if (statusChanged) {
              // Invalidate relevant status filter pages
              const relevantStatuses = [oldRecord?.status, newRecord?.status].filter(Boolean);
              relevantStatuses.forEach(status => {
                scheduleInvalidation(['tasks', 'paginated', projectId, 1, 50, [status]]);
              });
              
              // Task completion handling
              if (newRecord?.status === 'Complete' && oldRecord?.status !== 'Complete') {
                scheduleInvalidation(['video-outputs', projectId]);
                scheduleInvalidation(['generations', projectId]);
                scheduleInvalidation(['unified-generations', 'project', projectId]);
              }
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
            
            DEBUG_MODE && console.log('[WebSocket] Generation INSERT:', {
              generationId: newRecord?.id,
              type: newRecord?.type,
              shotId
            });
            
            // High-performance direct invalidation
            scheduleInvalidation(['generations', projectId]);
            scheduleInvalidation(['shots', projectId]);
            scheduleInvalidation(['unified-generations', 'project', projectId]);
            
            if (shotId) {
              scheduleInvalidation(['all-shot-generations', shotId]);
              scheduleInvalidation(['unified-generations', 'shot', shotId]);
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
            const record = payload.new || payload.old;
            const shotId = (record as any)?.shot_id;
            
            DEBUG_MODE && console.log('[WebSocket] Shot generation change:', {
              event: payload.eventType,
              shotId
            });
            
            // Targeted invalidation for shot associations
            scheduleInvalidation(['shots', projectId]);
            scheduleInvalidation(['generations', projectId]);
            
            if (shotId) {
              scheduleInvalidation(['all-shot-generations', shotId]);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' && err) {
            console.error('[WebSocket] Channel error:', { status, error: err, projectId });
          } else if (status === 'CLOSED') {
            console.warn('[WebSocket] Channel closed:', { status, projectId });
          } else if (status === 'SUBSCRIBED') {
            DEBUG_MODE && console.log('[WebSocket] Channel subscribed:', { status, projectId });
          } else {
            DEBUG_MODE && console.log('[WebSocket] Status change:', { status, projectId });
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