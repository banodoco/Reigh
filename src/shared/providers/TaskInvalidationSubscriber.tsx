import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/shared/contexts/ProjectContext';
import { runtimeConfig } from '@/shared/lib/config';

/**
 * Centralized task invalidation subscriber that handles all task-related cache invalidations.
 * This replaces the scattered event listeners in UI components and provides consistent
 * read-after-write handling with exponential backoff retry.
 */
export function TaskInvalidationSubscriber({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();

  useEffect(() => {
    if (!selectedProjectId) return;

    const handleTaskCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      
      // Only handle events for the current project
      if (detail.projectId && detail.projectId !== selectedProjectId) return;
      
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.log('[Polling:Tasks] task-created event received, scheduling invalidation', {
          selectedProjectId,
          eventDetail: detail,
          timestamp: Date.now()
        });
      }
      
      // Exponential backoff retry for read-after-write consistency
      // The task creation edge function returns success before DB transaction commits
      const scheduleInvalidation = (attempt: number = 1) => {
        const delay = Math.min(50 * Math.pow(1.5, attempt - 1), 300); // 50ms → 75ms → 112ms → 168ms → 252ms → 300ms max
        
        setTimeout(() => {
          if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
            console.log('[Polling:Tasks] Executing invalidation attempt', {
              attempt,
              delay,
              selectedProjectId,
              timestamp: Date.now()
            });
          }
          
          try {
            // Invalidate all task-related queries for this project
            queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
            queryClient.invalidateQueries({ queryKey: ['task-status-counts', selectedProjectId] });
            
            // Also invalidate unified generations that might include task data
            queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId] });
            
            if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
              console.log('[Polling:Tasks] Invalidation completed successfully', {
                attempt,
                selectedProjectId,
                timestamp: Date.now()
              });
            }
          } catch (error) {
            console.error('[Polling:Tasks] Invalidation failed, will retry', {
              attempt,
              error: (error as Error).message,
              selectedProjectId,
              timestamp: Date.now()
            });
            
            // Retry up to 3 times with exponential backoff
            if (attempt < 3) {
              scheduleInvalidation(attempt + 1);
            }
          }
        }, delay);
      };
      
      scheduleInvalidation();
    };

    const handleTaskStatusChange = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      
      // Only handle events for the current project
      if (detail.projectId && detail.projectId !== selectedProjectId) return;
      
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.log('[Polling:Tasks] task-status-change event received', {
          selectedProjectId,
          taskId: detail.taskId,
          oldStatus: detail.oldStatus,
          newStatus: detail.newStatus,
          timestamp: Date.now()
        });
      }
      
      // Immediate invalidation for status changes (no retry needed as task already exists)
      queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['task-status-counts', selectedProjectId] });
      
      // If task completed, also invalidate generations
      if (detail.newStatus === 'Complete') {
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId] });
      }
    };

    // Register event listeners
    window.addEventListener('task-created', handleTaskCreated as EventListener);
    window.addEventListener('task-status-change', handleTaskStatusChange as EventListener);
    
    if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
      console.log('[Polling:Tasks] Task invalidation subscriber initialized', {
        selectedProjectId,
        timestamp: Date.now()
      });
    }

    return () => {
      window.removeEventListener('task-created', handleTaskCreated as EventListener);
      window.removeEventListener('task-status-change', handleTaskStatusChange as EventListener);
      
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.log('[Polling:Tasks] Task invalidation subscriber cleaned up', {
          selectedProjectId,
          timestamp: Date.now()
        });
      }
    };
  }, [selectedProjectId, queryClient]);

  return <>{children}</>;
}
