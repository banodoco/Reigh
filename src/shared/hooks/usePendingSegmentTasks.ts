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
  // Track optimistic pending IDs (for immediate UI feedback before task is detected)
  const [optimisticPendingIds, setOptimisticPendingIds] = useState<Set<string>>(new Set());

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

  // Auto-clear optimistic IDs when they appear in real pending tasks
  useEffect(() => {
    if (pendingPairIds.size > 0 && optimisticPendingIds.size > 0) {
      setOptimisticPendingIds(prev => {
        const next = new Set(prev);
        let changed = false;
        pendingPairIds.forEach(id => {
          if (next.has(id)) {
            next.delete(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [pendingPairIds, optimisticPendingIds.size]);

  // Add an optimistic pending ID for immediate UI feedback
  const addOptimisticPending = useCallback((pairShotGenerationId: string | null | undefined) => {
    if (pairShotGenerationId) {
      console.log('[usePendingSegmentTasks] Adding optimistic pending:', pairShotGenerationId.substring(0, 8));
      setOptimisticPendingIds(prev => new Set(prev).add(pairShotGenerationId));
    }
  }, []);

  // Helper to check if a pair has a pending task (real or optimistic)
  const hasPendingTask = useCallback((pairShotGenerationId: string | null | undefined): boolean => {
    if (!pairShotGenerationId) return false;
    return pendingPairIds.has(pairShotGenerationId) || optimisticPendingIds.has(pairShotGenerationId);
  }, [pendingPairIds, optimisticPendingIds]);

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
