/**
 * usePendingSegmentTasks Hook
 *
 * Tracks travel segment tasks that are "Queued" or "In Progress" for a given shot.
 * Returns a function to check if a specific pair_shot_generation_id has a pending task.
 * Supports optimistic updates for immediate UI feedback when generate is clicked.
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TASK_STATUS } from '@/types/tasks';

interface PendingSegmentTask {
  id: string;
  status: string;
  pair_shot_generation_id: string | null;
}

export interface UsePendingSegmentTasksReturn {
  /** Check if a pair_shot_generation_id has a pending task (real or optimistic) */
  hasPendingTask: (pairShotGenerationId: string | null | undefined) => boolean;
  /** Get the task status for a pair_shot_generation_id */
  getTaskStatus: (pairShotGenerationId: string | null | undefined) => string | null;
  /** Set of all pair_shot_generation_ids with pending tasks */
  pendingPairIds: Set<string>;
  /** Loading state */
  isLoading: boolean;
  /** Add an optimistic pending ID (for immediate UI feedback when generate is clicked) */
  addOptimisticPending: (pairShotGenerationId: string | null | undefined) => void;
}

/**
 * Extract pair_shot_generation_id from task params
 */
function extractPairShotGenId(params: any): string | null {
  if (!params) return null;

  // Direct param (individual_travel_segment)
  if (params.pair_shot_generation_id) {
    return params.pair_shot_generation_id;
  }

  // From orchestrator_details with segment_index (travel_segment from orchestrator)
  const orchDetails = params.orchestrator_details;
  if (orchDetails?.pair_shot_generation_ids && typeof params.segment_index === 'number') {
    const ids = orchDetails.pair_shot_generation_ids;
    if (Array.isArray(ids) && ids[params.segment_index]) {
      return ids[params.segment_index];
    }
  }

  return null;
}

export function usePendingSegmentTasks(
  shotId: string | null,
  projectId: string | null
): UsePendingSegmentTasksReturn {
  // Track optimistic pending IDs with timestamps (for immediate UI feedback before task is detected)
  // Map of pairShotGenerationId -> timestamp when added
  const [optimisticPending, setOptimisticPending] = useState<Map<string, number>>(new Map());

  // How long to wait for a task to appear in real pending before clearing optimistic
  const OPTIMISTIC_TIMEOUT_MS = 8000; // 8 seconds (covers ~2-3 query cycles)

  // Query pending segment tasks for this shot
  const { data: pendingTasks, isLoading } = useQuery({
    queryKey: ['pending-segment-tasks', shotId, projectId],
    queryFn: async () => {
      if (!shotId || !projectId) return [];

      // Query tasks that are Queued or In Progress
      // Filter for travel segment task types
      const { data, error } = await supabase
        .from('tasks')
        .select('id, status, params')
        .eq('project_id', projectId)
        .in('status', [TASK_STATUS.QUEUED, TASK_STATUS.IN_PROGRESS])
        .in('task_type', ['travel_segment', 'individual_travel_segment']);

      if (error) {
        console.error('[usePendingSegmentTasks] Query error:', error);
        return [];
      }

      // Extract pair_shot_generation_id from each task
      const tasks: PendingSegmentTask[] = (data || []).map((task: any) => ({
        id: task.id,
        status: task.status,
        pair_shot_generation_id: extractPairShotGenId(task.params),
      }));

      // Filter to only tasks for this shot (by checking if pair_shot_generation_id exists)
      // Note: We can't directly filter by shot_id in the query since it's in params
      // The pair_shot_generation_id links to a shot_generations record for this shot

      console.log('[usePendingSegmentTasks] Found pending tasks:', {
        shotId: shotId.substring(0, 8),
        count: tasks.length,
        pairIds: tasks.map(t => t.pair_shot_generation_id?.substring(0, 8)).filter(Boolean),
      });

      return tasks;
    },
    enabled: !!shotId && !!projectId,
    // Poll frequently to catch status changes
    refetchInterval: 3000,
    staleTime: 1000,
  });

  // Build a map of pair_shot_generation_id -> status
  const { pendingPairIds, statusMap } = useMemo(() => {
    const ids = new Set<string>();
    const map = new Map<string, string>();

    (pendingTasks || []).forEach(task => {
      if (task.pair_shot_generation_id) {
        ids.add(task.pair_shot_generation_id);
        map.set(task.pair_shot_generation_id, task.status);
      }
    });

    return { pendingPairIds: ids, statusMap: map };
  }, [pendingTasks]);

  // Clear optimistic IDs that are either:
  // 1. Confirmed (appear in real pending tasks)
  // 2. Expired (older than timeout and not in real pending - task was cancelled/failed)
  useEffect(() => {
    if (optimisticPending.size === 0 || isLoading) return;

    const now = Date.now();

    setOptimisticPending(prev => {
      const next = new Map<string, number>();
      let changed = false;

      prev.forEach((addedAt, id) => {
        const isInRealPending = pendingPairIds.has(id);
        const isExpired = now - addedAt > OPTIMISTIC_TIMEOUT_MS;

        if (isInRealPending) {
          // Confirmed by real query - clear from optimistic (real will show it)
          changed = true;
          console.log('[usePendingSegmentTasks] Optimistic ID confirmed:', id.substring(0, 8));
        } else if (isExpired) {
          // Not in real pending after timeout - was cancelled or failed
          changed = true;
          console.log('[usePendingSegmentTasks] Optimistic ID expired:', id.substring(0, 8));
        } else {
          // Keep it - still within timeout window
          next.set(id, addedAt);
        }
      });

      return changed ? next : prev;
    });
  }, [pendingPairIds, optimisticPending.size, isLoading, OPTIMISTIC_TIMEOUT_MS]);

  // Add an optimistic pending ID for immediate UI feedback
  const addOptimisticPending = useCallback((pairShotGenerationId: string | null | undefined) => {
    if (pairShotGenerationId) {
      console.log('[usePendingSegmentTasks] Adding optimistic pending:', pairShotGenerationId.substring(0, 8));
      setOptimisticPending(prev => new Map(prev).set(pairShotGenerationId, Date.now()));
    }
  }, []);

  // Helper to check if a pair has a pending task (real or optimistic)
  const hasPendingTask = useCallback((pairShotGenerationId: string | null | undefined): boolean => {
    if (!pairShotGenerationId) return false;
    return pendingPairIds.has(pairShotGenerationId) || optimisticPending.has(pairShotGenerationId);
  }, [pendingPairIds, optimisticPending]);

  // Helper to get task status for a pair
  const getTaskStatus = useCallback((pairShotGenerationId: string | null | undefined): string | null => {
    if (!pairShotGenerationId) return null;
    return statusMap.get(pairShotGenerationId) || null;
  }, [statusMap]);

  return {
    hasPendingTask,
    getTaskStatus,
    pendingPairIds,
    isLoading,
    addOptimisticPending,
  };
}

export default usePendingSegmentTasks;
