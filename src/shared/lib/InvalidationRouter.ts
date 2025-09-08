import { QueryClient } from '@tanstack/react-query';
import { runtimeConfig } from '@/shared/lib/config';

type EventPayload = any;

export type InvalidationEvent = {
  type: 'GENERATION_INSERT' | 'GENERATION_UPDATE' | 'GENERATION_DELETE' | 'SHOT_GENERATION_CHANGE' | 'TASK_INSERT' | 'TASK_STATUS_CHANGE' | 'GENERATIONS_UPDATED' | string;
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

export function routeEvent(queryClient: QueryClient, event: InvalidationEvent) {
  try {
    if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
      // eslint-disable-next-line no-console
      console.log('[ReconnectionIssue][AppInteraction] routeEvent', { type: event.type, payload: event.payload });
    }
    switch (event.type) {
      case 'GENERATION_INSERT':
      case 'GENERATION_UPDATE':
      case 'GENERATION_DELETE': {
        const { projectId, shotId } = event.payload || {};
        if (projectId) scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        if (shotId) scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
        if (projectId) scheduleInvalidate(queryClient, ['shots', projectId]);
        break;
      }
      case 'SHOT_GENERATION_CHANGE': {
        const { projectId, shotId } = event.payload || {};
        if (projectId) scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        if (shotId) scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
        break;
      }
      case 'TASK_INSERT':
      case 'TASK_STATUS_CHANGE': {
        const { projectId } = event.payload || {};
        if (projectId) scheduleInvalidate(queryClient, ['task-status-counts', projectId]);
        // Invalidate the paginated family for this project, not just page 1
        if (projectId) scheduleInvalidate(queryClient, ['tasks', 'paginated', projectId]);
        break;
      }
      case 'GENERATIONS_UPDATED': {
        const { projectId, shotId } = event.payload || {};
        if (projectId) scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        if (shotId) scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
        break;
      }
      default: {
        // noop
      }
    }
  } catch {}
  finally {
    if (runtimeConfig.RECONNECTION_LOGS_ENABLED && flushTimer == null && pending.size > 0) {
      // eslint-disable-next-line no-console
      console.log('[ReconnectionIssue][RouterFlush] scheduled', { count: pending.size });
    }
  }
}


