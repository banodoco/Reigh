import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { runtimeConfig } from '@/shared/lib/config';

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
  const visibilityAdaptiveRef = useRef({ hiddenThrottle: 2000, visibleThrottle: 500 });
  const isHiddenRef = useRef<boolean>(typeof document !== 'undefined' ? document.hidden : false);
  const reconnectMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const disconnectedSinceRef = useRef<number | null>(null);
  const lastRealtimeStateRef = useRef<string | undefined>(undefined);
  const lastReconnectAttemptAtRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);

  useEffect(() => {
    // Kill switch: disable realtime entirely
    if (runtimeConfig.REALTIME_ENABLED === false) {
      return;
    }
    // Visibility-driven throttling and reconnection hint
    const onVisibility = () => {
      const hidden = document.hidden;
      isHiddenRef.current = hidden;
      // Adapt throttle window to reduce invalidation storms while hidden
      shouldThrottle.current = createOptimizedThrottling();
      const newDelay = hidden ? visibilityAdaptiveRef.current.hiddenThrottle : visibilityAdaptiveRef.current.visibleThrottle;
      DEBUG_MODE && console.log('[WebSocket] Visibility changed, adapting throttle', { hidden, newDelay });
      // Hint to reconnect when becoming visible
      if (!hidden) {
        try {
          // If channel is closed or null, re-setup quickly
          if (!channelRef.current) {
            DEBUG_MODE && console.log('[WebSocket] No channel on visibility, scheduling setup');
            // Trigger re-setup by clearing timer (effect below will recreate)
            if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
          }
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    // External recovery signal from App
    const onRecover = () => {
      DEBUG_MODE && console.log('[WebSocket] Received realtime:visibility-recover event');
      try {
        // Light nudge: invalidate status counts and page-1 tasks for active project
        if (projectId) {
          queryClient.invalidateQueries({ queryKey: ['task-status-counts', projectId] });
          queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', projectId, 1] });
        }
        // Emit DeadModeInvestigation log for visibility-driven recovery
        try {
          const socket: any = (supabase as any)?.realtime?.socket;
          console.warn('[DeadModeInvestigation] Realtime visibility recovery hint', {
            timestamp: Date.now(),
            connected: !!socket?.isConnected?.(),
            state: socket?.connectionState,
            projectId,
            channels: (supabase as any)?.getChannels?.()?.map((c: any) => ({ topic: c.topic, state: c.state })) || []
          });
          // If still disconnected, attempt a soft reconnect
          if (socket && !socket.isConnected?.()) {
            try {
              (supabase as any)?.realtime?.connect?.();
              console.warn('[DeadModeInvestigation] Realtime soft connect invoked');
            } catch {}
          }
          // Nudge unified generations so galleries recover immediately upon focus
          try {
            if (projectId) {
              queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] });
            }
          } catch {}
        } catch {}
      } catch (e) {
        console.warn('[WebSocket] Recover invalidation error', e);
      }
    };
    window.addEventListener('realtime:visibility-recover', onRecover as EventListener);
    // Backward compatibility with earlier event name used in logs/spec
    window.addEventListener('deadMode:recover', onRecover as EventListener);
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

              case 'GENERATIONS_UPDATED': {
                const { shotId } = message.payload;
                scheduleInvalidation(['shots', projectId]);
                scheduleInvalidation(['unified-generations', 'project', projectId]);
                if (shotId) scheduleInvalidation(['unified-generations', 'shot', shotId]);
                break;
              }

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
        // Also listen for new tasks to ensure first-page reflects creations
        .on('postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'tasks',
            filter: `project_id=eq.${projectId}`
          },
          (payload) => {
            const newRecord = payload.new as any;
            DEBUG_MODE && console.log('[WebSocket] Task INSERT:', {
              taskId: newRecord?.id,
              status: newRecord?.status,
              taskType: newRecord?.task_type
            });
            scheduleInvalidation(['task-status-counts', projectId]);
            scheduleInvalidation(['tasks', 'paginated', projectId, 1]);
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
            // Ensure VideoOutputsGallery (shot-specific unified generations) updates instantly
            if (shotId) {
              scheduleInvalidation(['unified-generations', 'shot', shotId]);
            }
            // Also nudge project-wide unified cache for safety in cross-views
            scheduleInvalidation(['unified-generations', 'project', projectId]);
            
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

    // Background monitor: if realtime socket disconnected for >10s while visible, attempt reconnect
    try {
      if (reconnectMonitorRef.current) {
        clearInterval(reconnectMonitorRef.current);
      }
      reconnectMonitorRef.current = setInterval(() => {
        try {
          const socket: any = (supabase as any)?.realtime?.socket;
          const isConnected = !!socket?.isConnected?.();
          const connState = socket?.connectionState;
          const now = Date.now();
          // Log realtime state transitions (for correlation with dead mode)
          if (connState !== lastRealtimeStateRef.current) {
            console.warn('[DeadModeInvestigation] Realtime transition', {
              timestamp: now,
              connected: isConnected,
              connState,
              channels: (supabase as any)?.getChannels?.()?.map((c: any) => ({ topic: c.topic, state: c.state })) || [],
              projectId,
            });
            lastRealtimeStateRef.current = connState;
          }
          if (!isConnected) {
            if (disconnectedSinceRef.current == null) disconnectedSinceRef.current = now;
          } else {
            disconnectedSinceRef.current = null;
          }
          const disconnectedForMs = disconnectedSinceRef.current ? now - disconnectedSinceRef.current : 0;
          if (!isHiddenRef.current && !isConnected && disconnectedForMs > 10000) {
            console.warn('[DeadModeInvestigation] Realtime disconnected >10s, attempting forced reconnect', {
              timestamp: now,
              disconnectedForMs,
              state: connState,
              projectId,
              channels: (supabase as any)?.getChannels?.()?.map((c: any) => ({ topic: c.topic, state: c.state })) || []
            });
            // Exponential backoff to prevent reconnect storms
            const lastAttemptAt = lastReconnectAttemptAtRef.current || 0;
            const attempts = reconnectAttemptsRef.current || 0;
            const backoffMs = Math.min(30000, 1000 * Math.pow(2, Math.min(attempts, 5))); // cap at 30s
            if (now - lastAttemptAt >= backoffMs) {
              lastReconnectAttemptAtRef.current = now;
              reconnectAttemptsRef.current = attempts + 1;
              try { (supabase as any)?.realtime?.disconnect?.(); } catch {}
              try { (supabase as any)?.realtime?.connect?.(); } catch {}

              // Try to re-subscribe channel if not joined
              try {
                const topic = projectId ? `task-updates:${projectId}` : null;
                if (topic) {
                  const channels = (supabase as any)?.getChannels?.() || [];
                  const existing = channels.find((c: any) => c.topic === topic);
                  if (existing && existing.state !== 'joined' && existing.state !== 'joining') {
                    existing.subscribe((status: any, err: any) => {
                      if (status === 'SUBSCRIBED') {
                        reconnectAttemptsRef.current = 0;
                        console.warn('[DeadModeInvestigation] Channel re-subscribed after reconnect', { topic });
                      } else if (status === 'CHANNEL_ERROR') {
                        console.error('[DeadModeInvestigation] Channel error on resubscribe', { topic, err });
                      }
                    });
                    channelRef.current = existing;
                  } else if (!existing) {
                    // If channel missing, create a lightweight broadcast-only channel to trigger server reconnect
                    const ch = (supabase as any).channel(topic);
                    ch.subscribe((status: any) => {
                      if (status === 'SUBSCRIBED') {
                        reconnectAttemptsRef.current = 0;
                        console.warn('[DeadModeInvestigation] Channel created and subscribed after reconnect', { topic });
                      }
                    });
                    channelRef.current = ch as any;
                  }
                }
              } catch {}
            }

            // After forcing reconnect, nudge critical queries to self-heal via polling
            try {
              if (projectId) {
                queryClient.invalidateQueries({ queryKey: ['task-status-counts', projectId] });
                queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', projectId, 1] });
                // Also nudge unified generations project scope
                queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] });
              }
            } catch {}
          }
        } catch {}
      }, 5000);
    } catch {}

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
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('realtime:visibility-recover', onRecover as EventListener);
      window.removeEventListener('deadMode:recover', onRecover as EventListener);
      if (reconnectMonitorRef.current) {
        clearInterval(reconnectMonitorRef.current);
        reconnectMonitorRef.current = null;
      }
    };
  }, [queryClient, projectId]);
} 