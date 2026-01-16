import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Task } from '@/types/tasks';
import { GenerationRow } from '@/types/shots';
import { extractTaskParentGenerationId } from '../utils/task-utils';

interface UseVideoGenerationsOptions {
  task: Task;
  taskParams: { parsed: Record<string, any>; promptText: string };
  isVideoTask: boolean;
  isCompletedVideoTask: boolean;
  isHovering: boolean;
}

/**
 * Hook to fetch video generations for video tasks
 * Only fetches when hovering (lazy loading to avoid query spam)
 */
export function useVideoGenerations({
  task,
  taskParams,
  isVideoTask,
  isCompletedVideoTask,
  isHovering,
}: UseVideoGenerationsOptions) {
  // State to control when to fetch video generations (on hover)
  const [shouldFetchVideo, setShouldFetchVideo] = useState(false);

  // State to track if user clicked the button (not just hovered)
  const [waitingForVideoToOpen, setWaitingForVideoToOpen] = useState(false);

  // Debug: Log hook inputs on every render
  console.log('[VideoQueryDebug] Hook called:', {
    taskId: task.id.substring(0, 8),
    taskType: task.taskType,
    status: task.status,
    isVideoTask,
    isCompletedVideoTask,
    isHovering,
    shouldFetchVideo,
    waitingForVideoToOpen,
    hasOutputLocation: !!task.outputLocation,
    queryEnabled: shouldFetchVideo && isVideoTask && task.status === 'Complete',
  });

  // Trigger video fetch when hovering over completed video tasks
  useEffect(() => {
    if (isHovering && isCompletedVideoTask && !shouldFetchVideo) {
      console.log('[VideoQueryDebug] Hover triggered fetch for task:', task.id.substring(0, 8));
      setShouldFetchVideo(true);
    }
  }, [isHovering, isCompletedVideoTask, shouldFetchVideo, task.id]);

  // Fetch video generations
  const { data: videoGenerations, isLoading: isLoadingVideoGen } = useQuery({
    queryKey: ['video-generations-for-task', task.id, task.outputLocation],
    queryFn: async () => {
      console.log('[useVideoGenerations] Starting query for task:', {
        taskId: task.id,
        taskType: task.taskType,
        outputLocation: task.outputLocation?.substring(0, 50),
        status: task.status,
      });

      if (!isVideoTask || task.status !== 'Complete') {
        console.log('[useVideoGenerations] Skipping - not a completed video task');
        return null;
      }

      // For individual_travel_segment tasks with child_generation_id, fetch that generation directly
      const childGenerationId = taskParams.parsed?.child_generation_id;
      if (task.taskType === 'individual_travel_segment' && childGenerationId) {
        const { data: childGen, error: childError } = await supabase
          .from('generations')
          .select('*, generation_variants(*)')
          .eq('id', childGenerationId)
          .single();

        if (!childError && childGen) {
          const variants = (childGen as any).generation_variants || [];
          const taskVariant = variants.find((v: any) => v.params?.source_task_id === task.id);
          const primaryVariant = variants.find((v: any) => v.is_primary);
          const targetVariant = taskVariant || primaryVariant;

          if (targetVariant) {
            return [{
              ...childGen,
              location: targetVariant.location,
              thumbnail_url: targetVariant.thumbnail_url || childGen.thumbnail_url,
              _variant_id: targetVariant.id,
              _variant_is_primary: targetVariant.is_primary,
            }];
          }
          return [childGen];
        }
      }

      // Try to find generation by output location first (most reliable)
      if (task.outputLocation) {
        console.log('[useVideoGenerations] Trying generations by location...');
        const { data: byLocation, error: locError } = await supabase
          .from('generations')
          .select('*')
          .eq('location', task.outputLocation)
          .eq('project_id', task.projectId);

        if (!locError && byLocation && byLocation.length > 0) {
          console.log('[useVideoGenerations] Found in generations table:', byLocation.length);
          return byLocation;
        }
        console.log('[useVideoGenerations] Not found in generations, trying variants...', { locError });

        // If not found in generations, check generation_variants by location
        const { data: variantByLocation, error: variantError } = await supabase
          .from('generation_variants')
          .select('id, generation_id, location, thumbnail_url, is_primary, params')
          .eq('location', task.outputLocation)
          .limit(1);

        console.log('[useVideoGenerations] Variant query result:', {
          found: variantByLocation?.length || 0,
          error: variantError?.message,
        });

        if (!variantError && variantByLocation && variantByLocation.length > 0) {
          const variant = variantByLocation[0];
          const { data: parentGen, error: parentError } = await supabase
            .from('generations')
            .select('*')
            .eq('id', variant.generation_id)
            .single();

          if (!parentError && parentGen) {
            console.log('[useVideoGenerations] Found via variant, returning with parent gen');
            return [{
              ...parentGen,
              location: variant.location,
              thumbnail_url: variant.thumbnail_url || parentGen.thumbnail_url,
              _variant_id: variant.id,
              _variant_is_primary: variant.is_primary,
            }];
          }
          console.log('[useVideoGenerations] Variant found but parent gen fetch failed:', parentError);
        }
      } else {
        console.log('[useVideoGenerations] No outputLocation on task, skipping location queries');
      }

      // Fallback: Search by task ID in the tasks JSONB array
      console.log('[useVideoGenerations] Trying fallback: search by task ID in tasks array...');
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .filter('tasks', 'cs', JSON.stringify([task.id]))
        .eq('project_id', task.projectId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useVideoGenerations] Error fetching video generations:', error);
        return null;
      }

      console.log('[useVideoGenerations] Fallback result:', { found: data?.length || 0 });
      return data || [];
    },
    enabled: shouldFetchVideo && isVideoTask && task.status === 'Complete',
  });

  // Transform video generations to GenerationRow format
  const videoOutputs = useMemo(() => {
    if (!videoGenerations) return null;
    
    const taskParentGenerationId = extractTaskParentGenerationId(taskParams.parsed);
    
    return videoGenerations.map(gen => {
      const genAny = gen as any;
      const isIndividualSegment = task.taskType === 'individual_travel_segment';
      const effectiveParentGenId = isIndividualSegment
        ? undefined
        : (taskParentGenerationId || genAny.parent_generation_id);

      return {
        id: gen.id,
        location: gen.location,
        imageUrl: gen.location,
        thumbUrl: gen.thumbnail_url || gen.location,
        videoUrl: genAny.video_url || gen.location,
        type: gen.type || 'video',
        createdAt: gen.created_at,
        taskId: genAny.task_id,
        metadata: gen.params || {},
        name: genAny.name || undefined,
        parent_generation_id: effectiveParentGenId || undefined,
        _variant_id: genAny._variant_id,
        _variant_is_primary: genAny._variant_is_primary,
      } as GenerationRow;
    });
  }, [videoGenerations, taskParams.parsed, task.taskType]);

  // Trigger fetch (for click before hover)
  const ensureFetch = useCallback(() => {
    console.log('[VideoQueryDebug] ensureFetch called for task:', task.id.substring(0, 8));
    setShouldFetchVideo(true);
  }, [task.id]);

  const triggerOpen = useCallback(() => {
    console.log('[VideoQueryDebug] triggerOpen called for task:', task.id.substring(0, 8), {
      isVideoTask,
      status: task.status,
      willEnableQuery: isVideoTask && task.status === 'Complete',
    });
    setShouldFetchVideo(true);
    setWaitingForVideoToOpen(true);
  }, [task.id, isVideoTask, task.status]);

  const clearWaiting = () => {
    setWaitingForVideoToOpen(false);
  };

  return {
    videoOutputs,
    isLoadingVideoGen,
    shouldFetchVideo,
    waitingForVideoToOpen,
    ensureFetch,
    triggerOpen,
    clearWaiting,
  };
}

