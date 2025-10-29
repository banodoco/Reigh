import { useMemo } from 'react';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';

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
 * Derives input images from task params
 * Checks multiple possible locations where images might be stored
 */
function deriveInputImages(task: any): string[] {
  if (!task?.params) return [];
  
  const params = task.params;
  const inputImages: string[] = [];
  
  // Check various possible locations for input images
  if (params.input_image) inputImages.push(params.input_image);
  if (params.image) inputImages.push(params.image);
  if (params.init_image) inputImages.push(params.init_image);
  if (params.control_image) inputImages.push(params.control_image);
  if (params.images && Array.isArray(params.images)) {
    inputImages.push(...params.images);
  }
  if (params.input_images && Array.isArray(params.input_images)) {
    inputImages.push(...params.input_images);
  }
  
  return inputImages.filter(Boolean);
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
  
  // Derive input images from task params
  const inputImages = useMemo(() => deriveInputImages(task), [task]);
  
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

