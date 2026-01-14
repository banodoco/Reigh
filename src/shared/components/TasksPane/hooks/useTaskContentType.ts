import { useMemo } from 'react';
import { Task } from '@/types/tasks';
import { KNOWN_IMAGE_TASK_TYPES } from '../constants';

interface TaskContentTypeInfo {
  isVideoTask: boolean;
  isImageTask: boolean;
  isCompletedVideoTask: boolean;
  isCompletedImageTask: boolean;
  showsTooltip: boolean;
  contentType: string | null;
}

interface TaskTypeInfo {
  content_type?: string | null;
  display_name?: string | null;
}

interface UseTaskContentTypeOptions {
  task: Task;
  taskParams: { parsed: Record<string, any>; promptText: string };
  /** Pass taskTypeInfo from parent to avoid duplicate useTaskType calls */
  taskTypeInfo?: TaskTypeInfo | null;
}

/**
 * Hook to determine task content type (video/image) using database info
 * with fallback logic for known task types.
 * 
 * Accepts taskTypeInfo as a prop to avoid duplicate useTaskType queries
 * when the parent already fetches it.
 */
export function useTaskContentType({ task, taskParams, taskTypeInfo }: UseTaskContentTypeOptions): TaskContentTypeInfo {
  return useMemo(() => {
    const dbContentType = taskTypeInfo?.content_type;
    
    // Fallback: Infer content_type from task type name if not in database
    // This ensures "Open Image" button shows for image editing tasks
    const inferredContentType = KNOWN_IMAGE_TASK_TYPES.includes(task.taskType as any) ? 'image' : null;
    const contentType = dbContentType || inferredContentType;
    
    const isVideoTask = contentType === 'video';
    const isImageTask = contentType === 'image';
    
    // For individual_travel_segment tasks with child_generation_id, show button even without outputLocation
    // (because the variant may not be primary, so outputLocation won't be synced to the task)
    const hasChildGenerationId = task.taskType === 'individual_travel_segment' && !!taskParams.parsed?.child_generation_id;
    const isCompletedVideoTask = isVideoTask && task.status === 'Complete' && (!!task.outputLocation || hasChildGenerationId);
    const isCompletedImageTask = isImageTask && task.status === 'Complete';
    
    // Show tooltips for all video and image tasks
    const showsTooltip = isVideoTask || isImageTask;
    
    return { 
      isVideoTask, 
      isImageTask, 
      isCompletedVideoTask, 
      isCompletedImageTask,
      showsTooltip,
      contentType,
    };
  }, [taskTypeInfo?.content_type, task.status, task.outputLocation, task.taskType, taskParams.parsed?.child_generation_id]);
}

