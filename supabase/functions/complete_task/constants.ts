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
  JOIN_FINAL_STITCH: 'join_final_stitch',

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
  JOIN_FINAL_STITCH: 'join_final_stitch',
  INDIVIDUAL_SEGMENT: 'individual_segment',
} as const;

export type VariantType = typeof VARIANT_TYPES[keyof typeof VARIANT_TYPES];

// ===== COMPLETION BEHAVIOR =====

/**
 * Completion behaviors determine how a task's output is stored:
 * - 'variant_on_parent': Final steps (stitch tasks) - create variant on orchestrator's parent generation
 * - 'variant_on_child': Regeneration of existing child - create variant on specified child generation
 * - 'child_generation': Segment tasks - create child generation under parent (with single-item propagation)
 * - 'standalone_generation': Regular tasks - create normal generation (image gen, i2v, etc.)
 */
export type CompletionBehavior =
  | 'variant_on_parent'
  | 'variant_on_child'
  | 'child_generation'
  | 'standalone_generation';

// ===== TASK COMPLETION CONFIGURATION =====

/** What to do when single-item is detected */
export type SingleItemBehavior = 'variant_only' | 'variant_and_child';

/**
 * Configuration for how a task type's output should be stored as generations/variants
 */
export interface TaskCompletionConfig {
  /** How the completed task output is stored */
  completionBehavior: CompletionBehavior;
  /** Variant type when creating variants */
  variantType: VariantType;
  /** Tool type to associate with the generation/variant */
  toolType: ToolType;
  /** For child_generation: which param field determines child_order */
  childOrderField?: string;
  /** Whether to check for existing generation at same position (for variant creation) */
  checkExistingAtPosition?: boolean;

  /** Count-based single-item detection (e.g., num_segments === 1) */
  singleItemDetection?: {
    countField: string;
    expectedCount: number;
    /** 'variant_only' = just update parent; 'variant_and_child' = update parent AND create child */
    behavior: SingleItemBehavior;
    /** Extra params to include in variant */
    extraParams?: Record<string, any>;
  };

  /** Flag-based single-item detection (e.g., is_first && is_last) */
  singleItemFlags?: {
    firstFlag: string;
    lastFlag: string;
    behavior: SingleItemBehavior;
    /** Extra params to include in variant (e.g., join_index) */
    extraParams?: Record<string, any>;
  };
}

/**
 * Configuration for each task type's completion behavior.
 * Adding a new task type = add config entry here (no code changes needed).
 */
export const TASK_COMPLETION_CONFIG: Partial<Record<TaskType, TaskCompletionConfig>> = {
  // ─────────────────────────────────────────────────────────────────────────────
  // FINAL STITCH TASKS - create variant on parent generation
  // ─────────────────────────────────────────────────────────────────────────────
  [TASK_TYPES.TRAVEL_STITCH]: {
    completionBehavior: 'variant_on_parent',
    variantType: VARIANT_TYPES.TRAVEL_STITCH,
    toolType: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES,
  },
  [TASK_TYPES.JOIN_FINAL_STITCH]: {
    completionBehavior: 'variant_on_parent',
    variantType: VARIANT_TYPES.JOIN_FINAL_STITCH,
    toolType: TOOL_TYPES.JOIN_CLIPS,
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SEGMENT TASKS - create child generation under parent
  // ─────────────────────────────────────────────────────────────────────────────
  [TASK_TYPES.TRAVEL_SEGMENT]: {
    completionBehavior: 'child_generation',
    variantType: VARIANT_TYPES.TRAVEL_SEGMENT,
    toolType: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES,
    childOrderField: 'segment_index',
    checkExistingAtPosition: true, // Check for existing gen at same segment position
    singleItemDetection: {
      countField: 'num_new_segments_to_generate',
      expectedCount: 1,
      behavior: 'variant_and_child', // Create variant on parent AND child generation
      extraParams: { is_single_segment: true },
    },
  },

  [TASK_TYPES.JOIN_CLIPS_SEGMENT]: {
    completionBehavior: 'child_generation',
    variantType: VARIANT_TYPES.JOIN_CLIPS_SEGMENT,
    toolType: TOOL_TYPES.JOIN_CLIPS,
    childOrderField: 'join_index',
    singleItemFlags: {
      firstFlag: 'is_first_join',
      lastFlag: 'is_last_join',
      behavior: 'variant_only', // Only create variant on parent (no child generation)
      extraParams: { is_single_join: true },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // INDIVIDUAL SEGMENT - dual behavior based on params
  // ─────────────────────────────────────────────────────────────────────────────
  [TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT]: {
    completionBehavior: 'variant_on_child', // When child_generation_id exists
    variantType: VARIANT_TYPES.INDIVIDUAL_SEGMENT,
    toolType: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES,
    childOrderField: 'segment_index',
    checkExistingAtPosition: true,
    // No singleItemDetection - individual segments don't trigger parent propagation
  },
};

/**
 * Get completion config for a task type, falling back to standalone_generation
 */
export function getCompletionConfig(taskType: string): TaskCompletionConfig {
  const config = TASK_COMPLETION_CONFIG[taskType as TaskType];
  if (config) return config;

  // Default: standalone generation
  return {
    completionBehavior: 'standalone_generation',
    variantType: 'original' as VariantType,
    toolType: TOOL_TYPES.IMAGE_GENERATION,
  };
}

// ===== SEGMENT TYPE CONFIGURATION =====

/**
 * Configuration for segment types that participate in orchestrator completion
 */
export interface SegmentTypeConfig {
  segmentType: TaskType;
  runIdField: string;
  expectedCountField: string;
  /**
   * If true, this task type is the final step that directly completes the orchestrator.
   * When it completes, the orchestrator is marked complete immediately (no sibling counting).
   */
  isFinalStep?: boolean;
  /**
   * If set, when this segment type completes, check if there's a pending task of this type
   * before marking the orchestrator complete. Used to wait for a final stitch step.
   */
  waitForFinalStepType?: TaskType;
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
    expectedCountField: 'num_joins',
    // Wait for join_final_stitch before marking orchestrator complete
    waitForFinalStepType: TASK_TYPES.JOIN_FINAL_STITCH
  },
  [TASK_TYPES.JOIN_FINAL_STITCH]: {
    segmentType: TASK_TYPES.JOIN_FINAL_STITCH,
    runIdField: 'run_id',
    expectedCountField: '', // Not used - this is a single task
    isFinalStep: true
  }
};

// ===== HELPER FUNCTIONS =====

/**
 * Check if a task type is a segment type (part of an orchestrator workflow)
 */
export function isSegmentType(taskType: string): boolean {
  return taskType === TASK_TYPES.TRAVEL_SEGMENT ||
         taskType === TASK_TYPES.JOIN_CLIPS_SEGMENT ||
         taskType === TASK_TYPES.JOIN_FINAL_STITCH;
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
