import { routeEvent } from '@/shared/lib/InvalidationRouter';
import { QueryClient } from '@tanstack/react-query';
import { createLogger } from './logger';

const log = createLogger('EventRouter');

export type TaskBroadcastMessage = {
  type?: 'TASK_CREATED' | 'TASKS_STATUS_UPDATE' | 'TASK_COMPLETED' | 'GENERATIONS_UPDATED' | string;
  payload?: any;
};

export function routeBroadcast(queryClient: QueryClient, projectId: string, message: TaskBroadcastMessage) {
  try {
    if (!projectId) return;
    switch (message?.type) {
      case 'TASK_CREATED':
      case 'TASKS_STATUS_UPDATE':
      case 'TASK_COMPLETED':
        routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId } });
        if (message?.type === 'TASK_COMPLETED') {
          routeEvent(queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId } });
        }
        break;
      case 'GENERATIONS_UPDATED':
        routeEvent(queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId, shotId: message?.payload?.shotId } });
        break;
      default:
        // ignore
        break;
    }
  } catch (e) {
    log.warn('routeBroadcast failed', e);
  }
}

export function routeTaskUpdate(queryClient: QueryClient, projectId: string, oldStatus?: string, newStatus?: string) {
  try {
    if (!projectId) return;
    if (oldStatus !== newStatus) {
      routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId } });
      if (newStatus === 'Complete') routeEvent(queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId } });
    }
  } catch (e) {
    log.warn('routeTaskUpdate failed', e);
  }
}

export function routeTaskInsert(queryClient: QueryClient, projectId: string) {
  try {
    if (!projectId) return;
    routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId } });
  } catch (e) {
    log.warn('routeTaskInsert failed', e);
  }
}

export function routeGenerationInsert(queryClient: QueryClient, projectId: string, shotId?: string) {
  try {
    if (!projectId) return;
    routeEvent(queryClient, { type: 'GENERATION_INSERT', payload: { projectId, shotId } });
  } catch (e) {
    log.warn('routeGenerationInsert failed', e);
  }
}

export function routeShotGenerationChange(queryClient: QueryClient, projectId: string, shotId?: string) {
  try {
    if (!projectId) return;
    routeEvent(queryClient, { type: 'SHOT_GENERATION_CHANGE', payload: { projectId, shotId } });
  } catch (e) {
    log.warn('routeShotGenerationChange failed', e);
  }
}


