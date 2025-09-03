import { QueryClient } from '@tanstack/react-query';

type EventPayload = any;

export type InvalidationEvent = {
  type: 'GENERATION_INSERT' | 'GENERATION_UPDATE' | 'GENERATION_DELETE' | 'SHOT_GENERATION_CHANGE' | 'TASK_STATUS_CHANGE' | 'GENERATIONS_UPDATED' | string;
  payload: EventPayload;
};

// Simple backpressure: flush once per tick
let pending = new Map<string, any>();
let flushTimer: number | null = null;

function scheduleInvalidate(queryClient: QueryClient, key: any) {
  const hash = Array.isArray(key) ? key.join('|') : String(key);
  pending.set(hash, key);
  if (flushTimer == null) {
    flushTimer = (setTimeout(() => {
      const items = Array.from(pending.values());
      pending.clear();
      flushTimer = null;
      for (const k of items) {
        try { queryClient.invalidateQueries({ queryKey: k }); } catch {}
      }
    }, 500) as unknown) as number;
  }
}

export function routeEvent(queryClient: QueryClient, event: InvalidationEvent) {
  try {
    switch (event.type) {
      case 'GENERATION_INSERT':
      case 'GENERATION_UPDATE':
      case 'GENERATION_DELETE': {
        const { projectId, shotId } = event.payload || {};
        if (projectId) scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        if (shotId) scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
        // Legacy compatibility
        if (projectId) scheduleInvalidate(queryClient, ['generations', projectId]);
        if (projectId) scheduleInvalidate(queryClient, ['shots', projectId]);
        break;
      }
      case 'SHOT_GENERATION_CHANGE': {
        const { projectId, shotId } = event.payload || {};
        if (projectId) scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        if (shotId) scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
        // Legacy compatibility
        if (projectId) scheduleInvalidate(queryClient, ['generations', projectId]);
        break;
      }
      case 'TASK_STATUS_CHANGE': {
        const { projectId } = event.payload || {};
        if (projectId) scheduleInvalidate(queryClient, ['task-status-counts', projectId]);
        if (projectId) scheduleInvalidate(queryClient, ['tasks', 'paginated', projectId, 1]);
        break;
      }
      case 'GENERATIONS_UPDATED': {
        const { projectId, shotId } = event.payload || {};
        if (projectId) scheduleInvalidate(queryClient, ['unified-generations', 'project', projectId]);
        if (shotId) scheduleInvalidate(queryClient, ['unified-generations', 'shot', shotId]);
        // Legacy compatibility
        if (projectId) scheduleInvalidate(queryClient, ['generations', projectId]);
        break;
      }
      default: {
        // noop
      }
    }
  } catch {}
}


