import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Task } from '@/types/tasks';
import { GenerationRow } from '@/types/shots';
import { useTaskGenerationMapping } from '@/shared/lib/generationTaskBridge';
import { extractSourceGenerationId } from '../utils/task-utils';

interface UseImageGenerationOptions {
  task: Task;
  taskParams: { parsed: Record<string, any>; promptText: string };
  isImageTask: boolean;
}

/**
 * Hook to fetch generation data for image tasks
 */
export function useImageGeneration({
  task,
  taskParams,
  isImageTask,
}: UseImageGenerationOptions) {
  // Check if this is a successful image task with output
  const hasGeneratedImage = useMemo(() => {
    return isImageTask && task.status === 'Complete' && !!task.outputLocation;
  }, [isImageTask, task.status, task.outputLocation]);

  // Use the generalized bridge for task-to-generation mapping
  const { data: actualGeneration, isLoading: isLoadingGeneration, error: generationError } = useTaskGenerationMapping(
    task.id, 
    hasGeneratedImage ? task.outputLocation : null, 
    task.projectId
  );

  // Legacy fallback query
  const { data: legacyGeneration } = useQuery({
    queryKey: ['generation-for-task-legacy', task.id, task.outputLocation],
    queryFn: async () => {
      if (!hasGeneratedImage || !task.outputLocation || actualGeneration !== undefined) return null;
      
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('location', task.outputLocation)
        .eq('project_id', task.projectId)
        .maybeSingle();
      
      if (error) {
        console.error('[useImageGeneration] Error fetching generation:', error);
        return null;
      }
      
      return data;
    },
    enabled: hasGeneratedImage && !!task.outputLocation,
  });

  // Create GenerationRow data for MediaLightbox
  const generationData: GenerationRow | null = useMemo(() => {
    // Fallback: If no generation record exists, create a minimal GenerationRow from outputLocation
    if (isImageTask && hasGeneratedImage && task.outputLocation && !actualGeneration) {
      const sourceGenerationId = extractSourceGenerationId(taskParams.parsed);
      
      return {
        id: task.id,
        location: task.outputLocation,
        imageUrl: task.outputLocation,
        thumbUrl: task.outputLocation,
        type: 'image',
        createdAt: task.createdAt || new Date().toISOString(),
        metadata: task.params || {},
        taskId: task.id,
        generation_id: sourceGenerationId || undefined,
        parent_generation_id: sourceGenerationId || undefined,
        based_on: sourceGenerationId || undefined,
      } as GenerationRow;
    }
    
    if (!hasGeneratedImage || !actualGeneration) return null;
    
    const basedOnValue = (actualGeneration as any).based_on || (actualGeneration.metadata as any)?.based_on || null;
    
    // Transform shot associations
    const shotGenerations = (actualGeneration as any).shot_generations || [];
    const shotIds = shotGenerations.map((sg: any) => sg.shot_id);
    const timelineFrames = shotGenerations.reduce((acc: any, sg: any) => {
      acc[sg.shot_id] = sg.timeline_frame;
      return acc;
    }, {});
    
    const allShotAssociations = shotGenerations.map((sg: any) => ({
      shot_id: sg.shot_id,
      position: sg.timeline_frame,
    }));
    
    const imageUrl = actualGeneration.location || (actualGeneration as any).thumbnail_url;
    const thumbUrl = (actualGeneration as any).thumbnail_url || actualGeneration.location;
    
    return {
      id: actualGeneration.id,
      location: actualGeneration.location,
      imageUrl,
      thumbUrl,
      type: actualGeneration.type || 'image',
      createdAt: (actualGeneration as any).created_at || actualGeneration.createdAt,
      metadata: actualGeneration.metadata || {},
      based_on: basedOnValue,
      sourceGenerationId: basedOnValue,
      parent_generation_id: (actualGeneration as any).parent_generation_id || undefined,
      shotIds,
      timelineFrames,
      all_shot_associations: allShotAssociations,
      name: (actualGeneration as any).name || undefined,
    } as GenerationRow;
  }, [hasGeneratedImage, actualGeneration, task, taskParams.parsed, isImageTask]);

  return {
    generationData,
    actualGeneration,
    isLoadingGeneration,
    generationError,
    hasGeneratedImage,
  };
}


