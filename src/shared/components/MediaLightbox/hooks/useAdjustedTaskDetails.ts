/**
 * useAdjustedTaskDetails - Fetches variant source task and computes adjusted task details
 *
 * For variants created by tasks, shows the variant's source task params
 * instead of the original generation's task. Preserves onApplySettingsFromTask.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Helper to derive input images from task params
function deriveInputImages(params: Record<string, unknown>): string[] {
  const images: string[] = [];

  // Check various param locations for input images
  const orchestratorDetails = params.orchestrator_details as Record<string, unknown> | undefined;

  // Direct input_images array
  if (Array.isArray(params.input_images)) {
    images.push(...params.input_images.filter((img): img is string => typeof img === 'string'));
  }

  // Orchestrator details input_images
  if (orchestratorDetails && Array.isArray(orchestratorDetails.input_images)) {
    images.push(...orchestratorDetails.input_images.filter((img): img is string => typeof img === 'string'));
  }

  // Start/end image URLs
  if (typeof params.start_image_url === 'string') images.push(params.start_image_url);
  if (typeof params.end_image_url === 'string') images.push(params.end_image_url);

  // Orchestrator start/end
  if (orchestratorDetails) {
    if (typeof orchestratorDetails.start_image_url === 'string') images.push(orchestratorDetails.start_image_url);
    if (typeof orchestratorDetails.end_image_url === 'string') images.push(orchestratorDetails.end_image_url);
  }

  return [...new Set(images)]; // Dedupe
}

export interface TaskDetailsData {
  task?: {
    id: string;
    taskType: string;
    params: Record<string, unknown>;
    status: string;
    createdAt: string;
  };
  isLoading: boolean;
  error: Error | null;
  inputImages?: string[];
  taskId?: string;
  onApplySettingsFromTask?: (params: Record<string, unknown>) => void;
}

export interface UseAdjustedTaskDetailsProps {
  activeVariant: {
    id: string;
    params?: Record<string, unknown>;
    variant_type?: string;
    created_at?: string;
    is_primary?: boolean;
  } | null;
  taskDetailsData: TaskDetailsData | undefined;
  isLoadingVariants: boolean;
  initialVariantId: string | undefined;
}

export interface UseAdjustedTaskDetailsReturn {
  adjustedTaskDetailsData: TaskDetailsData | undefined;
  isLoadingVariantTask: boolean;
}

export function useAdjustedTaskDetails({
  activeVariant,
  taskDetailsData,
  isLoadingVariants,
  initialVariantId,
}: UseAdjustedTaskDetailsProps): UseAdjustedTaskDetailsReturn {
  // Extract source_task_id and check if variant already has orchestrator_details
  const { variantSourceTaskId, variantHasOrchestratorDetails } = useMemo(() => {
    const variantParams = activeVariant?.params as Record<string, unknown> | undefined;
    // Try multiple possible field names for the source task ID
    const taskId = variantParams?.source_task_id ||
                   variantParams?.orchestrator_task_id ||
                   variantParams?.task_id ||
                   null;
    // Validate it's a UUID before using (some params have non-UUID identifiers)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validTaskId = typeof taskId === 'string' && uuidRegex.test(taskId) ? taskId : null;
    const hasOrchestratorDetails = !!variantParams?.orchestrator_details;
    return { variantSourceTaskId: validTaskId, variantHasOrchestratorDetails: hasOrchestratorDetails };
  }, [activeVariant?.params]);

  // Fetch the variant's source task when it differs from taskDetailsData
  // Skip fetch if variant already has orchestrator_details (e.g., clip_join variants)
  // NOTE: Uses ['tasks', 'single', taskId] query key to share cache with usePrefetchTaskData
  const { data: variantSourceTask, isLoading: isLoadingVariantTask } = useQuery({
    queryKey: ['tasks', 'single', variantSourceTaskId],
    queryFn: async () => {
      if (!variantSourceTaskId) return null;
      console.log('[VariantTaskDetails] Fetching task:', variantSourceTaskId.substring(0, 8));
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', variantSourceTaskId)
        .single();
      if (error) {
        console.error('[VariantTaskDetails] Error fetching source task:', error);
        return null;
      }
      return data;
    },
    // Don't fetch if: no task ID, already have matching taskDetailsData, or variant has orchestrator_details
    enabled: !!variantSourceTaskId && variantSourceTaskId !== taskDetailsData?.taskId && !variantHasOrchestratorDetails,
    staleTime: Infinity, // Task data is immutable - cache forever (matches prefetch)
  });

  // For variants, show the variant's source task params instead of the original task
  // But ALWAYS preserve onApplySettingsFromTask so the Apply button shows
  const adjustedTaskDetailsData = useMemo(() => {
    // Check if we're viewing a variant that was created by a task (has source_task_id in params)
    const variantParams = activeVariant?.params as Record<string, unknown> | undefined;
    const isTaskCreatedVariant = activeVariant && variantParams && (
      variantParams.source_task_id ||
      variantParams.created_from ||
      (activeVariant.variant_type && activeVariant.variant_type !== 'original')
    );

    if (isTaskCreatedVariant && variantParams) {
      // Check if taskDetailsData already has the correct task (e.g., when opened from TasksPane)
      const hasMatchingTaskData = taskDetailsData?.taskId === variantParams.source_task_id && taskDetailsData?.task?.params;

      // Determine the best source of task params:
      // 1. If taskDetailsData matches, use its params (already have full data)
      // 2. If we fetched the source task, use its params
      // 3. Fall back to variant params (may be incomplete)
      // IMPORTANT: Use variant_type for display (e.g., 'clip_join'), NOT tool_type
      // tool_type is the tool that launched the task (e.g., 'travel-between-images'),
      // which is different from what kind of variant this is
      let effectiveParams = variantParams;
      const effectiveTaskType = activeVariant.variant_type || 'variant';

      if (hasMatchingTaskData) {
        effectiveParams = taskDetailsData.task!.params as Record<string, unknown>;
      } else if (!variantParams.orchestrator_details && variantSourceTask?.params) {
        // Only use fetched task params if variant doesn't already have orchestrator_details
        // clip_join variants store orchestrator_details directly, so we don't want to overwrite
        effectiveParams = typeof variantSourceTask.params === 'string'
          ? JSON.parse(variantSourceTask.params)
          : variantSourceTask.params;
      }
      // Otherwise keep variantParams which may already have orchestrator_details (e.g., clip_join)

      // Extract input images using shared utility
      // This handles segment tasks (only segment images) vs full timeline tasks
      const variantInputImages = deriveInputImages(effectiveParams);

      return {
        task: {
          id: activeVariant.id,
          taskType: effectiveTaskType,
          params: effectiveParams,
          status: 'Complete',
          createdAt: activeVariant.created_at || new Date().toISOString(),
        },
        isLoading: isLoadingVariantTask,
        error: null,
        inputImages: variantInputImages,
        taskId: (variantParams.source_task_id as string) || activeVariant.id,
        // ALWAYS preserve onApplySettingsFromTask so Apply button shows for all variants
        onApplySettingsFromTask: taskDetailsData?.onApplySettingsFromTask,
      };
    }

    // If variants are still loading AND we don't have task data yet, show loading
    // But if we already have task data cached, show it immediately rather than blocking on variants
    // This provides better UX when task data is prefetched/cached
    // ALSO check if we're waiting for initialVariantId to be applied (clicked a specific variant)
    const waitingForInitialVariant = initialVariantId &&
      (!activeVariant || activeVariant.id !== initialVariantId);

    // Only override to loading if:
    // 1. Waiting for a specific variant (user clicked a variant)
    // 2. Variants loading AND no active variant AND task details still loading
    //    (If task details finished - either has task or knows there's none - don't block on variants)
    const shouldShowLoading = waitingForInitialVariant ||
      (isLoadingVariants && !activeVariant && taskDetailsData?.isLoading);

    if (shouldShowLoading) {
      return taskDetailsData ? { ...taskDetailsData, isLoading: true } : taskDetailsData;
    }

    // For all other cases, use the generation's task details as-is
    return taskDetailsData;
  }, [taskDetailsData, activeVariant, variantSourceTask, isLoadingVariantTask, isLoadingVariants, initialVariantId]);

  return {
    adjustedTaskDetailsData,
    isLoadingVariantTask,
  };
}
