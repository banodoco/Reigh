import { useMemo } from 'react';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';
import { deriveInputImages } from '@/shared/utils/taskParamsUtils';

interface UseTaskDetailsProps {
  generationId: string | null;
}

interface UseTaskDetailsReturn {
  taskDetailsData: {
    task: any;
    isLoading: boolean;
    error: any;
    inputImages: string[];
    taskId: string | null;
    onApplySettingsFromTask?: undefined;
    onClose?: undefined;
  } | null;
}

/**
 * Hook to fetch and manage task details for a generation
 * Used to display task information in the MediaLightbox sidebar
 */
export function useTaskDetails({
  generationId
}: UseTaskDetailsProps): UseTaskDetailsReturn {
  // Fetch task mapping from unified cache
  const { data: taskMapping } = useTaskFromUnifiedCache(generationId || '');
  
  // Fetch actual task data
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(
    (taskMapping?.taskId as string) || ''
  );
  
  // Derive input images from task params using shared utility
  const inputImages = useMemo(() => {
    if (!task?.params) return [];
    const params = typeof task.params === 'string' ? JSON.parse(task.params) : task.params;
    return deriveInputImages(params);
  }, [task]);
  
  console.log('[BasedOnNav] 🔍 useTaskDetails:', {
    generationId: generationId?.substring(0, 8),
    hasTaskMapping: !!taskMapping,
    taskId: taskMapping?.taskId,
    hasTask: !!task,
    isLoadingTask,
    hasError: !!taskError,
    inputImagesCount: inputImages.length,
    taskKeys: task ? Object.keys(task) : []
  });
  
  // Return null if no generation ID (lightbox closed)
  if (!generationId) {
    return { taskDetailsData: null };
  }
  
  // Return task details data
  return {
    taskDetailsData: {
      task,
      isLoading: isLoadingTask,
      error: taskError,
      inputImages,
      taskId: taskMapping?.taskId || null,
      // These handlers are undefined for ShotImageManager
      // They're only used in ImageGallery
      onApplySettingsFromTask: undefined,
      onClose: undefined
    }
  };
}

