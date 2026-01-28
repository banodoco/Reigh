/**
 * usePendingGenerationTasks Hook
 *
 * Tracks tasks that are "Queued" or "In Progress" that will create
 * variants or derived generations from a given source generation.
 *
 * Works for both images and videos - checks task params for source generation references.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TASK_STATUS } from '@/types/tasks';

interface PendingGenerationTask {
  id: string;
  status: string;
  task_type: string;
}

export interface UsePendingGenerationTasksReturn {
  /** Number of pending tasks that will create variants/derived from this generation */
  pendingCount: number;
  /** The pending tasks */
  pendingTasks: PendingGenerationTask[];
  /** Loading state */
  isLoading: boolean;
}

/**
 * Check if task params reference a specific generation ID as a source.
 * Checks common param fields where source generation is stored.
 */
function taskReferencesGeneration(params: any, generationId: string): boolean {
  if (!params || !generationId) return false;

  // Direct source references
  if (params.based_on === generationId) return true;
  if (params.source_generation_id === generationId) return true;
  if (params.generation_id === generationId) return true;
  if (params.input_generation_id === generationId) return true;
  if (params.parent_generation_id === generationId) return true;

  // Check nested in orchestrator_details
  const orchDetails = params.orchestrator_details;
  if (orchDetails) {
    if (orchDetails.based_on === generationId) return true;
    if (orchDetails.source_generation_id === generationId) return true;
    if (orchDetails.parent_generation_id === generationId) return true;
  }

  // Check full_orchestrator_payload
  const fullPayload = params.full_orchestrator_payload;
  if (fullPayload) {
    if (fullPayload.based_on === generationId) return true;
    if (fullPayload.source_generation_id === generationId) return true;
    if (fullPayload.parent_generation_id === generationId) return true;
  }

  return false;
}

export function usePendingGenerationTasks(
  generationId: string | null | undefined,
  projectId: string | null | undefined
): UsePendingGenerationTasksReturn {
  // Query pending tasks for this project
  const { data: pendingTasks, isLoading } = useQuery({
    queryKey: ['pending-generation-tasks', generationId, projectId],
    queryFn: async () => {
      if (!generationId || !projectId) return [];

      // Query tasks that are Queued or In Progress
      const { data, error } = await supabase
        .from('tasks')
        .select('id, status, task_type, params')
        .eq('project_id', projectId)
        .in('status', [TASK_STATUS.QUEUED, TASK_STATUS.IN_PROGRESS]);

      if (error) {
        console.error('[usePendingGenerationTasks] Query error:', error);
        return [];
      }

      // Filter to tasks that reference this generation
      const matchingTasks: PendingGenerationTask[] = (data || [])
        .filter((task: any) => taskReferencesGeneration(task.params, generationId))
        .map((task: any) => ({
          id: task.id,
          status: task.status,
          task_type: task.task_type,
        }));

      if (matchingTasks.length > 0) {
        console.log('[usePendingGenerationTasks] Found pending tasks for generation:', {
          generationId: generationId.substring(0, 8),
          count: matchingTasks.length,
          taskTypes: matchingTasks.map(t => t.task_type),
        });
      }

      return matchingTasks;
    },
    enabled: !!generationId && !!projectId,
    // Poll to catch status changes
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const result = useMemo(() => ({
    pendingCount: pendingTasks?.length || 0,
    pendingTasks: pendingTasks || [],
    isLoading,
  }), [pendingTasks, isLoading]);

  return result;
}

export default usePendingGenerationTasks;
