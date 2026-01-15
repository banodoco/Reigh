import { Task } from '@/types/tasks';
import { TASK_NAME_ABBREVIATIONS } from '../constants';

/**
 * Derive input images from task params
 * Extracts image URLs from various param locations based on task type
 */
export const deriveInputImages = (task: Task | null): string[] => {
  if (!task?.params) return [];
  const params = task.params as Record<string, any>;
  
  // For individual_travel_segment, use top-level or individual_segment_params (2 images only)
  if (task.taskType === 'individual_travel_segment') {
    const images = params.individual_segment_params?.input_image_paths_resolved || 
                   params.input_image_paths_resolved || 
                   [];
    return images.filter(Boolean);
  }
  
  const inputImages: string[] = [];
  if (params.input_image) inputImages.push(params.input_image);
  if (params.image) inputImages.push(params.image);
  if (params.init_image) inputImages.push(params.init_image);
  if (params.control_image) inputImages.push(params.control_image);
  if (params.images && Array.isArray(params.images)) inputImages.push(...params.images);
  if (params.input_images && Array.isArray(params.input_images)) inputImages.push(...params.input_images);
  // For travel tasks, also check orchestrator paths
  if (params.full_orchestrator_payload?.input_image_paths_resolved && Array.isArray(params.full_orchestrator_payload.input_image_paths_resolved)) {
    inputImages.push(...params.full_orchestrator_payload.input_image_paths_resolved);
  }
  if (params.orchestrator_details?.input_image_paths_resolved && Array.isArray(params.orchestrator_details.input_image_paths_resolved)) {
    inputImages.push(...params.orchestrator_details.input_image_paths_resolved);
  }
  // Also check top-level input_image_paths_resolved
  if (params.input_image_paths_resolved && Array.isArray(params.input_image_paths_resolved)) {
    inputImages.push(...params.input_image_paths_resolved);
  }
  return inputImages.filter(Boolean);
};

/**
 * Get abbreviated task name for tight spaces
 */
export const getAbbreviatedTaskName = (fullName: string): string => {
  return TASK_NAME_ABBREVIATIONS[fullName] || fullName;
};

/**
 * Parse task params safely (handles both string and object formats)
 */
export const parseTaskParamsForDisplay = (params: unknown): { parsed: Record<string, any>; promptText: string } => {
  const parsed = typeof params === 'string' 
    ? (() => { try { return JSON.parse(params); } catch { return {}; } })() 
    : (params || {}) as Record<string, any>;
  
  const promptText = parsed?.orchestrator_details?.prompt || parsed?.prompt || '';
  return { parsed, promptText };
};

/**
 * Extract shot_id from task params for video tasks
 */
export const extractShotId = (task: Task): string | null => {
  const params = task.params as Record<string, any>;
  
  // Try different locations where shot_id might be stored based on task type
  return (
    params?.orchestrator_details?.shot_id ||           // travel_orchestrator, wan_2_2_i2v
    params?.full_orchestrator_payload?.shot_id ||      // travel_stitch, wan_2_2_i2v fallback
    params?.shot_id ||                                 // direct shot_id
    null
  );
};

/**
 * Extract source generation ID from task params
 * Used for variant fetching and "Based On" feature
 */
export const extractSourceGenerationId = (params: Record<string, any>): string | undefined => {
  return (
    params?.based_on ||
    params?.source_generation_id ||
    params?.generation_id ||
    params?.input_generation_id ||
    params?.parent_generation_id
  );
};

/**
 * Extract parent generation ID from task params
 * For edit-video tasks, the REAL parent is in task params, not the generation's parent_generation_id
 */
export const extractTaskParentGenerationId = (params: Record<string, any>): string | undefined => {
  return (
    params?.parent_generation_id ||
    params?.orchestrator_details?.parent_generation_id ||
    params?.full_orchestrator_payload?.parent_generation_id
  );
};


