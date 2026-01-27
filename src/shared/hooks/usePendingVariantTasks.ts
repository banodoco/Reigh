/**
 * usePendingVariantTasks Hook
 *
 * Tracks tasks that are "Queued" or "In Progress" that will create variants
 * for a given generation (images or videos).
 *
 * Returns the count of pending tasks so we can display "Variants (6, 4 pending)"
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TASK_STATUS } from '@/types/tasks';

// Task types that create variants (edit operations on existing generations)
const VARIANT_CREATING_TASK_TYPES = [
  'image_inpaint',
  'image_upscale',
  'annotated_image_edit',
  'magic_edit',
  'individual_travel_segment', // Video regeneration creates variants
];

export interface UsePendingVariantTasksReturn {
  /** Number of pending tasks that will create variants for this generation */
  pendingCount: number;
  /** Loading state */
  isLoading: boolean;
}

/**
 * Extract the target generation_id from task params
 * Different task types store this in different places
 */
function extractTargetGenerationId(params: any): string | null {
  if (!params) return null;

  // Direct generation_id (used by inpaint, upscale, etc.)
  if (params.generation_id) {
    return params.generation_id;
  }

  // child_generation_id (used by individual_travel_segment for regeneration)
  if (params.child_generation_id) {
    return params.child_generation_id;
  }

  return null;
}

export function usePendingVariantTasks(
  generationId: string | null,
  projectId: string | null
): UsePendingVariantTasksReturn {
  // Query pending variant tasks for this generation
  const { data: pendingCount = 0, isLoading } = useQuery({
    queryKey: ['pending-variant-tasks', generationId, projectId],
    queryFn: async () => {
      if (!generationId || !projectId) return 0;

      // Query tasks that are Queued or In Progress
      // Filter for task types that create variants
      const { data, error } = await supabase
        .from('tasks')
        .select('id, params')
        .eq('project_id', projectId)
        .in('status', [TASK_STATUS.QUEUED, TASK_STATUS.IN_PROGRESS])
        .in('task_type', VARIANT_CREATING_TASK_TYPES);

      if (error) {
        console.error('[usePendingVariantTasks] Query error:', error);
        return 0;
      }

      // Count tasks that target this generation
      const matchingTasks = (data || []).filter((task: any) => {
        const targetGenId = extractTargetGenerationId(task.params);
        return targetGenId === generationId;
      });

      console.log('[usePendingVariantTasks] Found pending tasks:', {
        generationId: generationId.substring(0, 8),
        totalPending: data?.length || 0,
        matchingCount: matchingTasks.length,
      });

      return matchingTasks.length;
    },
    enabled: !!generationId && !!projectId,
    // Poll frequently to catch status changes
    refetchInterval: 3000,
    staleTime: 1000,
  });

  return {
    pendingCount,
    isLoading,
  };
}

export default usePendingVariantTasks;
