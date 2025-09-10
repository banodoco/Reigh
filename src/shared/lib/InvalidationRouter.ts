import { QueryClient } from '@tanstack/react-query';
import { runtimeConfig } from '@/shared/lib/config';

type EventPayload = any;

export type DomainEventType = 
  // Task events
  | 'TASK_CREATED'
  | 'TASK_STATUS_CHANGE'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'TASK_CANCELLED'
  | 'TASK_DELETED'
  
  // Generation events
  | 'GENERATION_INSERT'
  | 'GENERATION_UPDATE'
  | 'GENERATION_DELETE'
  | 'GENERATION_STAR_TOGGLE'
  | 'GENERATION_LOCATION_UPDATE'
  
  // Shot events
  | 'SHOT_CREATED'
  | 'SHOT_UPDATED'
  | 'SHOT_DELETED'
  | 'SHOT_GENERATION_CHANGE'
  | 'SHOT_REORDER'
  
  // Project events
  | 'PROJECT_UPDATED'
  
  // Credit events
  | 'CREDITS_UPDATED'
  | 'TOPUP_COMPLETED'
  
  // Settings events
  | 'TOOL_SETTINGS_CHANGED'
  | 'API_TOKEN_CHANGED'
  
  // Resource events
  | 'RESOURCE_UPLOADED'
  | 'RESOURCE_DELETED'
  
  // Batch events
  | 'GENERATIONS_UPDATED'
  | 'TASKS_BATCH_UPDATE';

export type InvalidationEvent = {
  type: DomainEventType;
  payload: EventPayload;
};

// Simple backpressure: flush once per tick
let pending = new Map<string, any>();
let flushTimer: number | null = null;
let debugLastFlushAt = 0;

function scheduleInvalidate(queryClient: QueryClient, key: any) {
  const hash = Array.isArray(key) ? key.join('|') : String(key);
  pending.set(hash, key);
  if (flushTimer == null) {
    flushTimer = (setTimeout(() => {
      const items = Array.from(pending.values());
      pending.clear();
      flushTimer = null;
      try {
        if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
          // Gather observer counts for visibility
          // Note: QueryClient API differs; we guard and best-effort log
          const summary = (items || []).slice(0, 20).map((k) => ({ key: k }));
          // eslint-disable-next-line no-console
          console.log('[ReconnectionIssue][RouterFlush] flushing', {
            count: items.length,
            sample: summary,
            sinceLastMs: Date.now() - debugLastFlushAt,
          });
          debugLastFlushAt = Date.now();
        }
      } catch {}
      // DEEP UI UPDATE LOGGING: Check if queries actually exist and have observers
      const queryCache = queryClient.getQueryCache();
      const allQueries = queryCache.getAll();
      const invalidationResults = items.map(k => {
        const matching = allQueries.filter(q => {
          const qKey = q.queryKey;
          return Array.isArray(k) ? k.every((segment, i) => qKey[i] === segment) : qKey[0] === k;
        });
        const totalObservers = matching.reduce((sum, q) => sum + q.getObserversCount(), 0);
        return {
          key: k,
          matchingQueries: matching.length,
          totalObservers,
          queryStates: matching.slice(0, 2).map(q => ({
            key: q.queryKey,
            status: q.state.status,
            observers: q.getObserversCount(),
            dataAge: q.state.dataUpdatedAt ? Date.now() - q.state.dataUpdatedAt : null
          }))
        };
      });
      
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.warn('[ReconnectionIssue][UI_UPDATE_TRACE] Pre-invalidation analysis', {
          totalInvalidations: items.length,
          totalQueriesInCache: allQueries.length,
          timestamp: Date.now()
        });
        // Log each invalidation result separately for visibility
        invalidationResults.forEach((result, i) => {
          console.warn(`[ReconnectionIssue][UI_UPDATE_TRACE] Invalidation ${i + 1}:`, result);
        });
      }
      
      for (const k of items) {
        try { 
          // REMOVED: Healing window check - was causing delays in invalidations
          const beforeInvalidate = queryClient.getQueryCache().getAll().filter(q => {
            const qKey = q.queryKey;
            return Array.isArray(k) ? k.every((segment, i) => qKey[i] === segment) : qKey[0] === k;
          });
          
          queryClient.invalidateQueries({ queryKey: k }); 
          
          // Check immediately after invalidation
          setTimeout(() => {
            const afterInvalidate = queryClient.getQueryCache().getAll().filter(q => {
              const qKey = q.queryKey;
              return Array.isArray(k) ? k.every((segment, i) => qKey[i] === segment) : qKey[0] === k;
            });
            
            const refetchingNow = afterInvalidate.filter(q => q.state.fetchStatus === 'fetching').length;
            const totalObservers = afterInvalidate.reduce((sum, q) => sum + q.getObserversCount(), 0);
            
            if (runtimeConfig.RECONNECTION_LOGS_ENABLED && refetchingNow === 0 && totalObservers > 0) {
              console.error('[ReconnectionIssue][INVALIDATION_FAILURE]', {
                key: k,
                beforeCount: beforeInvalidate.length,
                afterCount: afterInvalidate.length,
                refetchingNow,
                totalObservers,
                queryStates: afterInvalidate.map(q => ({
                  key: q.queryKey.slice(0, 3),
                  status: q.state.status,
                  fetchStatus: q.state.fetchStatus,
                  observers: q.getObserversCount()
                })),
                CRITICAL: 'Queries have observers but are not refetching after invalidation!'
              });
            }
          }, 50);
        } catch {}
      }
      
      // POST-INVALIDATION CHECK
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        setTimeout(() => {
          const postResults = items.slice(0, 5).map(k => {
            const matching = allQueries.filter(q => {
              const qKey = q.queryKey;
              return Array.isArray(k) ? k.every((segment, i) => qKey[i] === segment) : qKey[0] === k;
            });
            return {
              key: k,
              refetchingCount: matching.filter(q => q.state.fetchStatus === 'fetching').length,
              totalQueries: matching.length
            };
          });
          console.warn('[ReconnectionIssue][UI_UPDATE_TRACE] Post-invalidation check', {
            timestamp: Date.now()
          });
          // Log each refetching result separately for visibility
          postResults.forEach((result, i) => {
            console.warn(`[ReconnectionIssue][UI_UPDATE_TRACE] Post-invalidation ${i + 1}:`, result);
          });
        }, 100);
      }
    }, 500) as unknown) as number;
  }
}

/**
 * Central InvalidationRouter - Routes domain events to canonical React Query invalidations
 * 
 * This replaces scattered manual queryClient.invalidateQueries() calls with a centralized
 * event-driven system. Components emit domain events, and this router performs the minimal,
 * canonical invalidations based on the event type and payload.
 */
// Global event emitter for domain events
class InvalidationEventEmitter {
  private queryClient: QueryClient | null = null;
  private eventQueue: InvalidationEvent[] = [];

  setQueryClient(queryClient: QueryClient) {
    this.queryClient = queryClient;
    // Process any queued events
    const queuedEvents = [...this.eventQueue];
    this.eventQueue = [];
    queuedEvents.forEach(event => this.emit(event));
  }

  emit(event: InvalidationEvent) {
    if (!this.queryClient) {
      // Queue the event until queryClient is available
      this.eventQueue.push(event);
      console.warn('[InvalidationRouter] QueryClient not ready, queuing event:', event.type);
      return;
    }

    routeEvent(this.queryClient, event);
  }

  // Convenience methods for common events
  taskCreated(payload: { projectId: string; taskId?: string }) {
    this.emit({ type: 'TASK_CREATED', payload });
  }

  taskStatusChanged(payload: { projectId: string; taskId: string; status?: string }) {
    this.emit({ type: 'TASK_STATUS_CHANGE', payload });
  }

  generationInserted(payload: { projectId: string; shotId?: string; generationId?: string }) {
    this.emit({ type: 'GENERATION_INSERT', payload });
  }

  generationUpdated(payload: { projectId: string; shotId?: string; generationId?: string }) {
    this.emit({ type: 'GENERATION_UPDATE', payload });
  }

  generationDeleted(payload: { projectId: string; shotId?: string; generationId?: string }) {
    this.emit({ type: 'GENERATION_DELETE', payload });
  }

  shotCreated(payload: { projectId: string; shotId?: string }) {
    this.emit({ type: 'SHOT_CREATED', payload });
  }

  shotUpdated(payload: { projectId: string; shotId?: string }) {
    this.emit({ type: 'SHOT_UPDATED', payload });
  }

  shotGenerationChanged(payload: { projectId: string; shotId?: string }) {
    this.emit({ type: 'SHOT_GENERATION_CHANGE', payload });
  }

  creditsUpdated() {
    this.emit({ type: 'CREDITS_UPDATED', payload: {} });
  }

  toolSettingsChanged(payload: { toolId?: string }) {
    this.emit({ type: 'TOOL_SETTINGS_CHANGED', payload });
  }
}

// Global singleton instance
const invalidationRouter = new InvalidationEventEmitter();

// Export for use in components
export { invalidationRouter };

/**
 * Hook to get the invalidation router instance
 * This ensures components have a consistent way to emit domain events
 */
export function useInvalidationRouter() {
  return invalidationRouter;
}

export function routeEvent(queryClient: QueryClient, event: InvalidationEvent) {
  try {
    if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
      console.log('[InvalidationRouter] Processing domain event', { 
        type: event.type, 
        payload: event.payload,
        timestamp: Date.now() 
      });
    }
    
    switch (event.type) {
      // === TASK EVENTS ===
      case 'TASK_CREATED':
      case 'TASK_STATUS_CHANGE':
      case 'TASK_COMPLETED':
      case 'TASK_FAILED':
      case 'TASK_CANCELLED': {
        const { projectId, taskId } = event.payload || {};
        if (projectId) {
          // Invalidate task status counts (for badges)
          scheduleInvalidate(queryClient, ['task-status-counts', projectId]);
          // Invalidate paginated tasks for this project
          scheduleInvalidate(queryClient, ['tasks', 'paginated', projectId]);
          // Invalidate unified generations (tasks may have associated generations)
          scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        }
        if (taskId) {
          // Invalidate single task queries
          scheduleInvalidate(queryClient, ['tasks', 'single', taskId]);
          // Invalidate task-generation mapping
          scheduleInvalidate(queryClient, ['task-generation-mapping', taskId]);
        }
        break;
      }
      
      case 'TASK_DELETED': {
        const { projectId, taskId } = event.payload || {};
        if (projectId) {
          scheduleInvalidate(queryClient, ['task-status-counts', projectId]);
          scheduleInvalidate(queryClient, ['tasks', 'paginated', projectId]);
        }
        if (taskId) {
          scheduleInvalidate(queryClient, ['tasks', 'single', taskId]);
          scheduleInvalidate(queryClient, ['task-generation-mapping', taskId]);
        }
        break;
      }
      
      case 'TASKS_BATCH_UPDATE': {
        const { projectId, taskIds } = event.payload || {};
        if (projectId) {
          scheduleInvalidate(queryClient, ['task-status-counts', projectId]);
          scheduleInvalidate(queryClient, ['tasks', 'paginated', projectId]);
          scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        }
        // Invalidate individual tasks if provided
        if (taskIds && Array.isArray(taskIds)) {
          taskIds.forEach((taskId: string) => {
            scheduleInvalidate(queryClient, ['tasks', 'single', taskId]);
            scheduleInvalidate(queryClient, ['task-generation-mapping', taskId]);
          });
        }
        break;
      }

      // === GENERATION EVENTS ===
      case 'GENERATION_INSERT':
      case 'GENERATION_UPDATE': {
        const { projectId, shotId, generationId } = event.payload || {};
        if (projectId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
          scheduleInvalidate(queryClient, ['shots', projectId]); // Shots may have generation counts
        }
        if (shotId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
          // Invalidate unpositioned count as new generations may affect the count
          scheduleInvalidate(queryClient, ['unpositioned-count', shotId]);
        }
        // Failsafe: if shotId is not known in payload, refresh all unpositioned counters
        scheduleInvalidate(queryClient, 'unpositioned-count');
        if (generationId) {
          scheduleInvalidate(queryClient, ['generation-task-mapping', generationId]);
        }
        break;
      }
      
      case 'GENERATION_DELETE': {
        const { projectId, shotId, generationId } = event.payload || {};
        if (projectId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
          scheduleInvalidate(queryClient, ['shots', projectId]);
        }
        if (shotId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
          // Invalidate unpositioned count as deleted generations may affect the count
          scheduleInvalidate(queryClient, ['unpositioned-count', shotId]);
        }
        // Failsafe: refresh all unpositioned counters
        scheduleInvalidate(queryClient, 'unpositioned-count');
        if (generationId) {
          scheduleInvalidate(queryClient, ['generation-task-mapping', generationId]);
        }
        break;
      }
      
      case 'GENERATION_STAR_TOGGLE':
      case 'GENERATION_LOCATION_UPDATE': {
        const { projectId, shotId, generationId } = event.payload || {};
        // These are metadata-only changes, so we can be more targeted
        if (projectId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        }
        if (shotId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
        }
        break;
      }

      // === SHOT EVENTS ===
      case 'SHOT_CREATED':
      case 'SHOT_UPDATED':
      case 'SHOT_DELETED': {
        const { projectId, shotId } = event.payload || {};
        if (projectId) {
          scheduleInvalidate(queryClient, ['shots', projectId]);
          scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        }
        if (shotId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
        }
        break;
      }
      
      case 'SHOT_GENERATION_CHANGE': {
        const { projectId, shotId } = event.payload || {};
        if (projectId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
          scheduleInvalidate(queryClient, ['shots', projectId]);
        }
        if (shotId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
          // Invalidate unpositioned count for this shot when positions change
          scheduleInvalidate(queryClient, ['unpositioned-count', shotId]);
        }
        // Failsafe: refresh all unpositioned counters
        scheduleInvalidate(queryClient, 'unpositioned-count');
        break;
      }
      
      case 'SHOT_REORDER': {
        const { projectId } = event.payload || {};
        if (projectId) {
          scheduleInvalidate(queryClient, ['shots', projectId]);
        }
        break;
      }

      // === PROJECT EVENTS ===
      case 'PROJECT_UPDATED': {
        const { projectId } = event.payload || {};
        if (projectId) {
          // Invalidate all project-scoped data
          scheduleInvalidate(queryClient, ['shots', projectId]);
          scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
          scheduleInvalidate(queryClient, ['task-status-counts', projectId]);
          scheduleInvalidate(queryClient, ['tasks', 'paginated', projectId]);
        }
        break;
      }

      // === CREDIT EVENTS ===
      case 'CREDITS_UPDATED':
      case 'TOPUP_COMPLETED': {
        scheduleInvalidate(queryClient, ['credits', 'balance']);
        scheduleInvalidate(queryClient, ['credits', 'ledger']);
        scheduleInvalidate(queryClient, ['autoTopup', 'preferences']);
        break;
      }

      // === SETTINGS EVENTS ===
      case 'TOOL_SETTINGS_CHANGED': {
        const { toolId } = event.payload || {};
        if (toolId) {
          scheduleInvalidate(queryClient, ['tool-settings', toolId]);
        } else {
          // Invalidate all tool settings
          scheduleInvalidate(queryClient, ['tool-settings']);
        }
        break;
      }
      
      case 'API_TOKEN_CHANGED': {
        scheduleInvalidate(queryClient, ['apiTokens']);
        break;
      }

      // === RESOURCE EVENTS ===
      case 'RESOURCE_UPLOADED':
      case 'RESOURCE_DELETED': {
        const { type } = event.payload || {};
        if (type) {
          scheduleInvalidate(queryClient, ['resources', type]);
        } else {
          scheduleInvalidate(queryClient, ['resources']);
        }
        break;
      }

      // === BATCH EVENTS ===
      case 'GENERATIONS_UPDATED': {
        const { projectId, shotId } = event.payload || {};
        if (projectId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
          scheduleInvalidate(queryClient, ['shots', projectId]);
        }
        if (shotId) {
          scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
          // Ensure unpositioned helper updates when generations change for this shot
          scheduleInvalidate(queryClient, ['unpositioned-count', shotId]);
        }
        // Failsafe: project-scoped broadcast may omit shotId; refresh all counters
        scheduleInvalidate(queryClient, 'unpositioned-count');
        break;
      }

      default: {
        console.warn('[InvalidationRouter] Unknown event type:', event.type);
        break;
      }
    }
  } catch (error) {
    console.error('[InvalidationRouter] Error processing event:', error, event);
  } finally {
    if (runtimeConfig.RECONNECTION_LOGS_ENABLED && flushTimer == null && pending.size > 0) {
      console.log('[InvalidationRouter] Scheduled flush', { 
        pendingCount: pending.size,
        timestamp: Date.now() 
      });
    }
  }
}


