import {
  resolveProjectResolution,
  generateTaskId,
  generateRunId,
  createTask,
  expandArrayToCount,
  validateRequiredFields,
  TaskValidationError,
  safeParseJson
} from "../taskCreation";
import { PhaseConfig } from '@/tools/travel-between-images/settings';

// ============================================================================
// Video Generation API Param Interfaces (Single Source of Truth)
// ============================================================================
// These interfaces define the snake_case params sent to the backend.
// UI code should re-export these types and use them when building task params.

/**
 * Structure video parameters for VACE mode.
 * Controls how a reference video guides the motion/structure of generation.
 */
export interface VideoStructureApiParams {
  /** Path to structure video (S3/Storage URL) */
  structure_video_path?: string | null;
  /** How to handle frame count mismatches between structure video and generation */
  structure_video_treatment?: 'adjust' | 'clip';
  /** Motion strength: 0.0 = no motion, 1.0 = full motion, >1.0 = amplified */
  structure_video_motion_strength?: number;
  /** Type of structure extraction from video: uni3c (raw), optical flow, canny, or depth */
  structure_video_type?: 'uni3c' | 'flow' | 'canny' | 'depth';
  /** Uni3C end percent (0-1, only used when structure_video_type is 'uni3c') */
  uni3c_end_percent?: number;
}

/**
 * Motion control parameters for video generation.
 * Controls the amount and type of motion in generated videos.
 */
export interface VideoMotionApiParams {
  /** Amount of motion: 0.0 = static, 1.0 = maximum motion (UI slider is 0-100, divide by 100) */
  amount_of_motion?: number;
  /** Motion control mode for UI state */
  motion_mode?: 'basic' | 'presets' | 'advanced';
  /** Whether using advanced phase configuration */
  advanced_mode?: boolean;
  /** Advanced phase configuration for multi-phase generation */
  phase_config?: PhaseConfig;
  /** Selected phase preset ID for UI state restoration */
  selected_phase_preset_id?: string | null;
}

/**
 * Model and generation settings for video tasks.
 */
export interface VideoModelApiParams {
  /** Model name/identifier */
  model_name?: string;
  /** Model type: i2v (image-to-video) or vace (video-guided) */
  model_type?: 'i2v' | 'vace';
  /** Random seed for reproducibility */
  seed?: number;
  /** Number of inference steps (when not using phase_config) */
  steps?: number;
  /** Whether to use a random seed */
  random_seed?: boolean;
  /** Enable turbo/fast generation mode */
  turbo_mode?: boolean;
  /** Enable debug output */
  debug?: boolean;
}

/**
 * Prompt-related parameters for video generation.
 */
export interface VideoPromptApiParams {
  /** Default/base prompt used for all segments */
  base_prompt?: string;
  /** Per-segment prompts (overrides base_prompt when non-empty) */
  base_prompts?: string[];
  /** Negative prompts per segment */
  negative_prompts?: string[];
  /** AI-enhanced prompts per segment */
  enhanced_prompts?: string[];
  /** Whether to enable AI prompt enhancement */
  enhance_prompt?: boolean;
  /** Text prepended to all prompts */
  text_before_prompts?: string;
  /** Text appended to all prompts */
  text_after_prompts?: string;
}

/**
 * Default values for video structure API params
 */
export const DEFAULT_VIDEO_STRUCTURE_PARAMS: Required<Pick<VideoStructureApiParams, 'structure_video_treatment' | 'structure_video_motion_strength' | 'structure_video_type'>> = {
  structure_video_treatment: 'adjust',
  structure_video_motion_strength: 1.0,
  structure_video_type: 'flow',
};

/**
 * Default values for video motion API params
 */
export const DEFAULT_VIDEO_MOTION_PARAMS: Required<Pick<VideoMotionApiParams, 'amount_of_motion' | 'motion_mode' | 'advanced_mode'>> = {
  amount_of_motion: 0.5,
  motion_mode: 'basic',
  advanced_mode: false,
};

/**
 * UI-controlled prompt configuration for video generation.
 * Uses snake_case to match API params directly - no conversion needed.
 *
 * Note: Array fields (base_prompts, negative_prompts, enhanced_prompts) are
 * computed from database in generateVideoService, not passed from UI.
 */
export interface PromptConfig {
  /** Default/base prompt used for all segments */
  base_prompt: string;
  /** Whether to enable AI prompt enhancement */
  enhance_prompt: boolean;
  /** Text prepended to all prompts (optional) */
  text_before_prompts?: string;
  /** Text appended to all prompts (optional) */
  text_after_prompts?: string;
  /** Default negative prompt (used as fallback for negative_prompts array) */
  default_negative_prompt: string;
}

/**
 * Default values for prompt config
 */
export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  base_prompt: '',
  enhance_prompt: false,
  text_before_prompts: '',
  text_after_prompts: '',
  default_negative_prompt: '',
};

/**
 * UI-controlled motion configuration for video generation.
 * Uses snake_case to match API params directly - no conversion needed.
 */
export interface MotionConfig {
  /** Amount of motion: 0-100 (divided by 100 before sending to API) */
  amount_of_motion: number;
  /** Motion control mode for UI */
  motion_mode: 'basic' | 'presets' | 'advanced';
  /** Whether using advanced phase configuration */
  advanced_mode: boolean;
  /** Advanced phase configuration for multi-phase generation */
  phase_config?: PhaseConfig;
  /** Selected phase preset ID for UI state restoration */
  selected_phase_preset_id?: string;
}

/**
 * Default values for motion config
 */
export const DEFAULT_MOTION_CONFIG: MotionConfig = {
  amount_of_motion: 50,
  motion_mode: 'basic',
  advanced_mode: false,
  phase_config: undefined,
  selected_phase_preset_id: undefined,
};

/**
 * UI-controlled model/generation configuration for video generation.
 * Uses snake_case to match API params directly - no conversion needed.
 */
export interface ModelConfig {
  /** Random seed for reproducibility */
  seed: number;
  /** Whether to use a random seed each generation */
  random_seed: boolean;
  /** Enable turbo/fast generation mode */
  turbo_mode: boolean;
  /** Enable debug output */
  debug: boolean;
  /** Generation type mode: i2v (image-to-video) or vace (video-guided) */
  generation_type_mode: 'i2v' | 'vace';
  /** Enable smooth video interpolation (SVI) for smoother transitions */
  use_svi?: boolean;
}

/**
 * Default values for model config
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  seed: 11111,
  random_seed: true,
  turbo_mode: false,
  debug: false,
  generation_type_mode: 'i2v',
  use_svi: false,
};

/**
 * Interface for travel between images (steerable motion) task parameters.
 * Extends from shared API param interfaces for consistent typing.
 * This matches the original steerable-motion edge function request body.
 */
export interface TravelBetweenImagesTaskParams extends
  Partial<VideoStructureApiParams>,
  Partial<VideoMotionApiParams>,
  Partial<VideoModelApiParams>,
  Partial<VideoPromptApiParams> {
  // Required fields (override Partial<> for fields that must be present)
  project_id: string;
  image_urls: string[];
  base_prompts: string[]; // Required - per-segment prompts
  segment_frames: number[];
  frame_overlap: number[];

  // Optional task-specific fields (not in shared interfaces)
  shot_id?: string;
  /** Generation IDs corresponding to image_urls (for clickable images in SegmentCard) */
  image_generation_ids?: string[];
  resolution?: string;
  params_json_str?: string;
  main_output_dir_for_run?: string;
  openai_api_key?: string;
  /** Legacy LoRA format - prefer phase_config.phases[].loras */
  loras?: Array<{ path: string; strength: number }>;
  show_input_images?: boolean;
  generation_mode?: 'batch' | 'timeline';
  dimension_source?: 'project' | 'firstImage' | 'custom';
  /** Whether to regenerate anchor images (Advanced Mode only) */
  regenerate_anchors?: boolean;
  /** Saturation adjustment (1.0 = no change) */
  after_first_post_generation_saturation?: number;
  /** Brightness adjustment (0 = no change) */
  after_first_post_generation_brightness?: number;
  /** Optional variant name for the generation */
  generation_name?: string;
  /** Whether segments are generated independently */
  independent_segments?: boolean;
  /** Enable smooth video interpolation (SVI) for smoother transitions */
  use_svi?: boolean;
  /** Uni3C start percent (0-1, used when structure_video_type is 'raw'/uni3c) */
  uni3c_start_percent?: number;
  /** Uni3C end percent (0-1, used when structure_video_type is 'raw'/uni3c) */
  uni3c_end_percent?: number;
}

/**
 * Default values for travel between images task settings
 */
const DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES = {
  model_name: "base_tester_model",
  seed: 789,
  steps: 20,
  after_first_post_generation_saturation: 1,
  after_first_post_generation_brightness: 0,
  debug: true,
  main_output_dir_for_run: "./outputs/default_travel_output",
  enhance_prompt: false,
  show_input_images: false,
  generation_mode: "batch" as const,
  dimension_source: "project" as const,
  amount_of_motion: 0.5, // Default to 0.5 (equivalent to UI value of 50)
};

/**
 * Validates travel between images task parameters
 * 
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateTravelBetweenImagesParams(params: TravelBetweenImagesTaskParams): void {
  validateRequiredFields(params, [
    'project_id',
    'image_urls',
    'base_prompts',
    'segment_frames',
    'frame_overlap'
  ]);

  // Additional steerable motion specific validations
  if (params.image_urls.length === 0) {
    throw new TaskValidationError("At least one image_url is required", 'image_urls');
  }

  if (params.base_prompts.length === 0) {
    throw new TaskValidationError("base_prompts is required (at least one prompt)", 'base_prompts');
  }

  if (params.segment_frames.length === 0) {
    throw new TaskValidationError("segment_frames is required", 'segment_frames');
  }

  if (params.frame_overlap.length === 0) {
    throw new TaskValidationError("frame_overlap is required", 'frame_overlap');
  }
}

/**
 * Processes travel between images parameters and builds the orchestrator payload
 * This replicates the logic from the original steerable-motion edge function
 * 
 * @param params - Raw travel between images parameters
 * @returns Processed orchestrator payload
 */
function buildTravelBetweenImagesPayload(
  params: TravelBetweenImagesTaskParams, 
  finalResolution: string,
  taskId: string,
  runId: string
): Record<string, unknown> {
  // Calculate number of segments (matching original logic)
  const numSegments = Math.max(1, params.image_urls.length - 1);

  // Expand arrays if they have a single element and numSegments > 1
  const basePromptsExpanded = expandArrayToCount(params.base_prompts, numSegments);
  const negativePromptsExpanded = expandArrayToCount(params.negative_prompts, numSegments) || Array(numSegments).fill("");
  
  // CRITICAL FIX: Only expand enhanced_prompts if they were actually provided OR if enhance_prompt is requested
  // If enhance_prompt is true, we must provide an array (even if empty strings) for the backend to populate
  const enhancedPromptsExpanded = params.enhanced_prompts 
    ? expandArrayToCount(params.enhanced_prompts, numSegments) 
    : (params.enhance_prompt ? Array(numSegments).fill("") : undefined);
    
  const segmentFramesExpanded = expandArrayToCount(params.segment_frames, numSegments);
  const frameOverlapExpanded = expandArrayToCount(params.frame_overlap, numSegments);

  // Extract steps parameter - only needed if NOT in Advanced Mode
  // In Advanced Mode, steps come from steps_per_phase in phase_config
  let stepsValue = params.steps;
  if (!params.advanced_mode) {
    if (stepsValue === undefined && params.params_json_str) {
      const parsedParams = safeParseJson(params.params_json_str, {} as any);
      if (typeof (parsedParams as any).steps === 'number') {
        stepsValue = (parsedParams as any).steps;
      }
    }
    if (stepsValue === undefined) {
      stepsValue = DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.steps;
    }
  }

  // Handle random seed generation - if random_seed is true, generate a new random seed
  // Otherwise use the provided seed or default
  const finalSeed = params.random_seed 
    ? Math.floor(Math.random() * 1000000) 
    : (params.seed ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.seed);
  
  if (params.random_seed) {
    console.log(`[RandomSeed] Generated random seed: ${finalSeed}`);
  }

  // Build orchestrator payload matching the original edge function structure
  const orchestratorPayload: Record<string, unknown> = {
    orchestrator_task_id: taskId,
    run_id: runId,
    input_image_paths_resolved: params.image_urls,
    // Include generation IDs for clickable images in SegmentCard
    ...(params.image_generation_ids && params.image_generation_ids.length > 0 
      ? { input_image_generation_ids: params.image_generation_ids } 
      : {}),
    num_new_segments_to_generate: numSegments,
    base_prompts_expanded: basePromptsExpanded,
    base_prompt: params.base_prompt, // Singular - the default/base prompt
    negative_prompts_expanded: negativePromptsExpanded,
    // CRITICAL FIX: Only include enhanced_prompts_expanded if actually provided
    // This prevents the backend from misinterpreting empty arrays
    ...(enhancedPromptsExpanded !== undefined ? { enhanced_prompts_expanded: enhancedPromptsExpanded } : {}),
    segment_frames_expanded: segmentFramesExpanded,
    frame_overlap_expanded: frameOverlapExpanded,
    parsed_resolution_wh: finalResolution,
    model_name: params.model_name ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.model_name,
    model_type: params.model_type,
    seed_base: finalSeed,
    // Only include steps if NOT in Advanced Mode (Advanced Mode uses steps_per_phase)
    ...(params.advanced_mode ? {} : { steps: stepsValue }),
    after_first_post_generation_saturation: params.after_first_post_generation_saturation ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.after_first_post_generation_saturation,
    after_first_post_generation_brightness: params.after_first_post_generation_brightness ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.after_first_post_generation_brightness,
    debug_mode_enabled: params.debug ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.debug,
    shot_id: params.shot_id ?? undefined,
    main_output_dir_for_run: params.main_output_dir_for_run ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.main_output_dir_for_run,
    enhance_prompt: params.enhance_prompt ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.enhance_prompt,
    show_input_images: params.show_input_images ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.show_input_images,
    generation_mode: params.generation_mode ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.generation_mode,
    dimension_source: params.dimension_source ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.dimension_source,
    // Only include amount_of_motion if NOT in Advanced Mode
    ...(params.advanced_mode ? {} : { amount_of_motion: params.amount_of_motion ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.amount_of_motion }),
    advanced_mode: params.advanced_mode ?? false,
    // Always set regenerate_anchors to false in Advanced Mode
    ...(params.advanced_mode ? { regenerate_anchors: false } : {}),
    // Include generation_name in orchestrator payload so it flows to child tasks
    generation_name: params.generation_name ?? undefined,
    independent_segments: params.independent_segments ?? true,
    // Text before/after prompts
    ...(params.text_before_prompts ? { text_before_prompts: params.text_before_prompts } : {}),
    ...(params.text_after_prompts ? { text_after_prompts: params.text_after_prompts } : {}),
    // Motion control mode
    ...(params.motion_mode ? { motion_mode: params.motion_mode } : {}),
    // Smooth video interpolation (SVI) for smoother transitions - always explicit
    use_svi: params.use_svi ?? false,
  };

  // Log the enhance_prompt value that will be sent to orchestrator
  console.log("[EnhancePromptDebug] ⚠️ Task Creation - Value being sent to orchestrator:", {
    enhance_prompt_in_orchestratorPayload: orchestratorPayload.enhance_prompt,
    enhance_prompt_in_params: params.enhance_prompt,
    enhance_prompt_default: DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.enhance_prompt,
    was_params_value_undefined: params.enhance_prompt === undefined,
    was_params_value_null: params.enhance_prompt === null,
    WARNING: orchestratorPayload.enhance_prompt === true ? '⚠️ enhance_prompt is TRUE - check if this is intentional' : '✅ enhance_prompt is false'
  });

  // Add structure video parameters if provided (use defaults from single source of truth)
  if (params.structure_video_path) {
    orchestratorPayload.structure_video_path = params.structure_video_path;
    orchestratorPayload.structure_video_treatment = params.structure_video_treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment;
    orchestratorPayload.structure_video_motion_strength = params.structure_video_motion_strength ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_motion_strength;
    orchestratorPayload.structure_video_type = params.structure_video_type ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_type;
    
    // Add uni3c parameters if structure_video_type is 'raw' (uni3c mode)
    if (params.structure_video_type === 'raw' || params.uni3c_start_percent !== undefined || params.uni3c_end_percent !== undefined) {
      orchestratorPayload.uni3c_start_percent = params.uni3c_start_percent ?? 0;
      orchestratorPayload.uni3c_end_percent = params.uni3c_end_percent ?? 0.1;
      console.log("[createTravelBetweenImagesTask] Uni3C mode - adding uni3c parameters:", {
        uni3c_start_percent: orchestratorPayload.uni3c_start_percent,
        uni3c_end_percent: orchestratorPayload.uni3c_end_percent
      });
    }
  }

  // Attach additional_loras mapping if provided (matching original logic)
  if (params.loras && params.loras.length > 0) {
    const additionalLoras: Record<string, number> = params.loras.reduce<Record<string, number>>((acc, lora) => {
      acc[lora.path] = lora.strength;
      return acc;
    }, {});
    orchestratorPayload.additional_loras = additionalLoras;
  }

  // Add phase_config if provided (for advanced mode)
  if (params.phase_config) {
    orchestratorPayload.phase_config = params.phase_config;
    console.log("[createTravelBetweenImagesTask] Including phase_config in orchestrator payload:", params.phase_config);
  }

  // Add selected_phase_preset_id if provided (for UI state restoration)
  if (params.selected_phase_preset_id) {
    orchestratorPayload.selected_phase_preset_id = params.selected_phase_preset_id;
    console.log("[createTravelBetweenImagesTask] Including selected_phase_preset_id in orchestrator payload:", params.selected_phase_preset_id);
  }

  return orchestratorPayload;
}

/**
 * Creates a travel between images task using the unified approach
 * This replaces the direct call to the steerable-motion edge function
 * 
 * @param params - Travel between images task parameters
 * @returns Promise resolving to the created task
 */
export async function createTravelBetweenImagesTask(params: TravelBetweenImagesTaskParams): Promise<any> {
  console.log("[EnhancePromptDebug] Creating task with params:", params);
  console.log("[EnhancePromptDebug] enhance_prompt parameter received:", {
    enhance_prompt: params.enhance_prompt,
    default_enhance_prompt: DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.enhance_prompt,
    will_be_set_to: params.enhance_prompt ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.enhance_prompt
  });

  try {
    // 1. Validate parameters
    validateTravelBetweenImagesParams(params);

    // 2. Resolve project resolution
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id, 
      params.resolution
    );

    // 3. Generate IDs for orchestrator payload (not for database)
    const orchestratorTaskId = generateTaskId("sm_travel_orchestrator");
    const runId = generateRunId();

    // 4. Build orchestrator payload
    const orchestratorPayload = buildTravelBetweenImagesPayload(
      params, 
      finalResolution, 
      orchestratorTaskId, 
      runId
    );

  // 5. Determine task type based on turbo mode
  const isTurboMode = params.turbo_mode === true;
  const taskType = isTurboMode ? 'wan_2_2_i2v' : 'travel_orchestrator';
    
    console.log("[createTravelBetweenImagesTask] Task type determination:", {
      modelName: params.model_name,
      turboMode: isTurboMode,
      taskType
    });

    // Create task using unified create-task function (no task_id - let DB auto-generate)
    const result = await createTask({
      project_id: params.project_id,
      task_type: taskType,
      params: {
        tool_type: 'travel-between-images', // Override tool_type for proper generation tagging
        orchestrator_details: orchestratorPayload,
        // Also store at top level for direct access by worker (not just in orchestrator_details)
        ...(params.generation_name ? { generation_name: params.generation_name } : {}),
      }
    });

    console.log("[createTravelBetweenImagesTask] Task created successfully:", result);
    return result;

  } catch (error) {
    console.error("[createTravelBetweenImagesTask] Error creating task:", error);
    throw error;
  }
}

/**
 * Re-export the interface and error class for convenience
 */
export { TaskValidationError } from "../taskCreation";
