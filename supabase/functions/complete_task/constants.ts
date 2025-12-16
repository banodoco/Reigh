/**
 * Constants for complete_task edge function
 * Centralizes magic strings to reduce typos and improve maintainability
 */

// ===== TASK TYPES =====

/**
 * Task type identifiers used throughout the completion flow
 */
export const TASK_TYPES = {
  // Segment tasks (part of orchestrator workflows)
  TRAVEL_SEGMENT: 'travel_segment',
  JOIN_CLIPS_SEGMENT: 'join_clips_segment',
  INDIVIDUAL_TRAVEL_SEGMENT: 'individual_travel_segment',
  
  // Orchestrator tasks
  TRAVEL_ORCHESTRATOR: 'travel_orchestrator',
  JOIN_CLIPS_ORCHESTRATOR: 'join_clips_orchestrator',
  
  // Processing tasks
  TRAVEL_STITCH: 'travel_stitch',
  IMAGE_INPAINT: 'image_inpaint',
  IMAGE_UPSCALE: 'image_upscale',
  IMAGE_EDIT: 'image_edit',
  MAGIC_EDIT: 'magic_edit',
  QWEN_IMAGE_EDIT: 'qwen_image_edit',
  ANNOTATED_IMAGE_EDIT: 'annotated_image_edit',
  
  // Generation tasks
  SINGLE_IMAGE: 'single_image',
  WAN_2_2_I2V: 'wan_2_2_i2v',
} as const;

export type TaskType = typeof TASK_TYPES[keyof typeof TASK_TYPES];

// ===== TOOL TYPES =====

/**
 * Tool type identifiers corresponding to frontend tool routes
 */
export const TOOL_TYPES = {
  IMAGE_GENERATION: 'image-generation',
  IMAGE_TO_VIDEO: 'image-to-video',
  TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
  JOIN_CLIPS: 'join-clips',
  MAGIC_EDIT: 'magic-edit',
  UPSCALE: 'upscale',
} as const;

export type ToolType = typeof TOOL_TYPES[keyof typeof TOOL_TYPES];

// ===== TASK CATEGORIES =====

/**
 * Task category identifiers from task_types table
 */
export const TASK_CATEGORIES = {
  GENERATION: 'generation',
  PROCESSING: 'processing',
  UPSCALE: 'upscale',
  ORCHESTRATION: 'orchestration',
} as const;

export type TaskCategory = typeof TASK_CATEGORIES[keyof typeof TASK_CATEGORIES];

// ===== VARIANT TYPES =====

/**
 * Variant type identifiers for generation_variants table
 */
export const VARIANT_TYPES = {
  EDIT: 'edit',
  INPAINT: 'inpaint',
  ANNOTATED_EDIT: 'annotated_edit',
  MAGIC_EDIT: 'magic_edit',
  UPSCALED: 'upscaled',
  REGENERATED: 'regenerated',
  TRAVEL_SEGMENT: 'travel_segment',
  TRAVEL_STITCH: 'travel_stitch',
  JOIN_CLIPS_SEGMENT: 'join_clips_segment',
  CLIP_JOIN: 'clip_join',
  INDIVIDUAL_SEGMENT: 'individual_segment',
} as const;

export type VariantType = typeof VARIANT_TYPES[keyof typeof VARIANT_TYPES];

// ===== SEGMENT TYPE CONFIGURATION =====

/**
 * Configuration for segment types that participate in orchestrator completion
 */
export interface SegmentTypeConfig {
  segmentType: TaskType;
  runIdField: string;
  expectedCountField: string;
}

export const SEGMENT_TYPE_CONFIG: Record<string, SegmentTypeConfig> = {
  [TASK_TYPES.TRAVEL_SEGMENT]: {
    segmentType: TASK_TYPES.TRAVEL_SEGMENT,
    runIdField: 'orchestrator_run_id',
    expectedCountField: 'num_new_segments_to_generate'
  },
  [TASK_TYPES.JOIN_CLIPS_SEGMENT]: {
    segmentType: TASK_TYPES.JOIN_CLIPS_SEGMENT,
    runIdField: 'run_id',
    expectedCountField: 'num_joins'
  }
};

// ===== HELPER FUNCTIONS =====

/**
 * Check if a task type is a segment type (part of an orchestrator workflow)
 */
export function isSegmentType(taskType: string): boolean {
  return taskType === TASK_TYPES.TRAVEL_SEGMENT || 
         taskType === TASK_TYPES.JOIN_CLIPS_SEGMENT;
}

/**
 * Check if a task type is an orchestrator type
 */
export function isOrchestratorType(taskType: string): boolean {
  return taskType.includes('orchestrator');
}

/**
 * Check if a task type is an edit/inpaint type
 */
export function isEditType(taskType: string): boolean {
  return taskType === TASK_TYPES.IMAGE_INPAINT ||
         taskType === TASK_TYPES.IMAGE_EDIT ||
         taskType === TASK_TYPES.MAGIC_EDIT ||
         taskType === TASK_TYPES.QWEN_IMAGE_EDIT ||
         taskType === TASK_TYPES.ANNOTATED_IMAGE_EDIT;
}

/**
 * Get the variant type for an edit task
 */
export function getEditVariantType(taskType: string): VariantType {
  switch (taskType) {
    case TASK_TYPES.IMAGE_INPAINT:
      return VARIANT_TYPES.INPAINT;
    case TASK_TYPES.ANNOTATED_IMAGE_EDIT:
      return VARIANT_TYPES.ANNOTATED_EDIT;
    case TASK_TYPES.QWEN_IMAGE_EDIT:
    case TASK_TYPES.IMAGE_EDIT:
    case TASK_TYPES.MAGIC_EDIT:
      return VARIANT_TYPES.MAGIC_EDIT;
    default:
      return VARIANT_TYPES.EDIT;
  }
}
