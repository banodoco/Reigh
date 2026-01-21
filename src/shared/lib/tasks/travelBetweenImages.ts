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
import { supabase } from '@/integrations/supabase/client';
import { PhaseConfig } from '@/tools/travel-between-images/settings';

// ============================================================================
// Video Generation API Param Interfaces (Single Source of Truth)
// ============================================================================
// These interfaces define the snake_case params sent to the backend.
// UI code should re-export these types and use them when building task params.

// ============================================================================
// NEW UNIFIED STRUCTURE GUIDANCE FORMAT
// ============================================================================

/**
 * Unified structure guidance configuration.
 * This is the new format that combines VACE and Uni3C configuration into a single object.
 * 
 * Example VACE with flow:
 * ```
 * {
 *   target: "vace",
 *   preprocessing: "flow",
 *   strength: 1.2,
 * }
 * ```
 * 
 * Example Uni3C:
 * ```
 * {
 *   target: "uni3c",
 *   strength: 0.8,
 *   step_window: [0.1, 0.9],
 * }
 * ```
 */
export interface StructureGuidanceConfig {
  /** Target system for guidance: "vace" for VACE model, "uni3c" for I2V with guidance */
  target: 'vace' | 'uni3c';
  
  /** 
   * Preprocessing method (VACE only):
   * - "flow": optical flow extraction
   * - "canny": edge detection
   * - "depth": depth estimation
   * - "none": use raw frames (equivalent to old "raw" structure_type)
   */
  preprocessing?: 'flow' | 'canny' | 'depth' | 'none';
  
  /** Unified strength parameter (works for both VACE and Uni3C). Default: 1.0 */
  strength?: number;
  
  /** VACE-specific: canny edge detection intensity. Default: 1.0 */
  canny_intensity?: number;
  
  /** VACE-specific: depth contrast. Default: 1.0 */
  depth_contrast?: number;
  
  /** 
   * Uni3C-specific: step window as [start_percent, end_percent].
   * Controls when during inference uni3c guidance is applied.
   * Default: [0.0, 1.0]
   */
  step_window?: [number, number];
  
  /** Uni3C-specific: frame policy. Default: "fit" */
  frame_policy?: 'fit' | 'clip';
  
  /** Uni3C-specific: zero out empty frames. Default: true */
  zero_empty_frames?: boolean;
}

/**
 * Helper to convert old structure_type to new format
 */
export function convertLegacyStructureType(
  structureType: 'uni3c' | 'flow' | 'canny' | 'depth' | 'raw' | undefined,
  options?: {
    motionStrength?: number;
    uni3cStartPercent?: number;
    uni3cEndPercent?: number;
  }
): StructureGuidanceConfig | undefined {
  if (!structureType) return undefined;
  
  if (structureType === 'uni3c') {
    return {
      target: 'uni3c',
      strength: options?.motionStrength ?? 1.0,
      step_window: [
        options?.uni3cStartPercent ?? 0,
        options?.uni3cEndPercent ?? 1.0,
      ],
    };
  }
  
  // VACE modes
  const preprocessingMap: Record<string, 'flow' | 'canny' | 'depth' | 'none'> = {
    'flow': 'flow',
    'canny': 'canny',
    'depth': 'depth',
    'raw': 'none',
  };
  
  return {
    target: 'vace',
    preprocessing: preprocessingMap[structureType] ?? 'flow',
    strength: options?.motionStrength ?? 1.0,
  };
}

// ============================================================================
// LEGACY INTERFACES (kept for backward compatibility)
// ============================================================================

/**
 * Structure video parameters for VACE mode (LEGACY - single video format).
 * Controls how a reference video guides the motion/structure of generation.
 * @deprecated Use `structure_guidance` + `structure_videos` array format instead.
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
 * Single structure video configuration within the structure_videos array.
 * Defines which OUTPUT timeline frames this video guides and which SOURCE frames to use.
 * 
 * NOTE: In the new unified format, structure_type and strength params moved to
 * the separate `structure_guidance` config object. This now only contains
 * the video source and frame mapping info.
 * 
 * Frame ranges are half-open: start_frame inclusive, end_frame exclusive.
 * Example: start_frame=0, end_frame=81 covers frames 0-80 (81 frames total).
 */
export interface StructureVideoConfig {
  /** Path to structure video (S3/Storage URL) - REQUIRED */
  path: string;
  
  /** Where in OUTPUT timeline this video starts guiding (inclusive, 0-based) */
  start_frame: number;
  
  /** Where in OUTPUT timeline this video ends (exclusive) */
  end_frame: number;
  
  /**
   * How to handle frame count mismatches between SOURCE range and OUTPUT range:
   * - "adjust": resample (stretch/compress) SOURCE frames to exactly fill output range
   * - "clip": 1:1 mapping; if source shorter, remaining output frames are unguided;
   *           if source longer, extra source frames are ignored.
   * Default: "adjust"
   */
  treatment?: 'adjust' | 'clip';
  
  /**
   * Optional: Start frame within SOURCE video (inclusive, 0-based).
   * Default: 0
   */
  source_start_frame?: number;
  
  /**
   * Optional: End frame within SOURCE video (exclusive).
   * Default: null (meaning end of video)
   */
  source_end_frame?: number | null;
  
  // ============================================================================
  // LEGACY FIELDS (kept for backward compatibility, prefer structure_guidance)
  // ============================================================================
  
  /** @deprecated Use structure_guidance.strength instead */
  motion_strength?: number;
  
  /** @deprecated Use structure_guidance.target + preprocessing instead */
  structure_type?: 'uni3c' | 'flow' | 'canny' | 'depth';
  
  /** @deprecated Use structure_guidance.step_window[0] instead */
  uni3c_start_percent?: number;
  
  /** @deprecated Use structure_guidance.step_window[1] instead */
  uni3c_end_percent?: number;
}

/**
 * Extended structure video config with UI-only fields (not sent to backend).
 * Used for local state management in useStructureVideo hook.
 */
export interface StructureVideoConfigWithMetadata extends StructureVideoConfig {
  /** Video metadata (UI only - not sent to backend) */
  metadata?: import('@/shared/lib/videoUploader').VideoMetadata | null;
  
  /** Resource ID tracking (UI only - not sent to backend) */
  resource_id?: string | null;
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
  structure_video_motion_strength: 1.2,
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
  /** Parent generation ID - if not provided, one will be created */
  parent_generation_id?: string;
  /** Generation IDs corresponding to image_urls (for clickable images in SegmentCard) */
  image_generation_ids?: string[];
  /**
   * NEW: Stable IDs for tethering segment videos to timeline pairs.
   * For N images, this should be N-1 IDs: the `shot_generations.id` of each pair's START image.
   */
  pair_shot_generation_ids?: string[];
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

  // ============================================================================
  // PER-PAIR PARAMETER OVERRIDES
  // ============================================================================
  // These arrays allow per-segment customization of generation parameters.
  // null = use shot default, explicit value = use per-pair override.
  // Array length should match number of pairs (image_urls.length - 1).

  /** Per-pair phase config overrides (null = use shot default) */
  pair_phase_configs?: (PhaseConfig | null)[];

  /** Per-pair LoRA overrides (null = use shot default) */
  pair_loras?: (Array<{ path: string; strength: number }> | null)[];

  /** Per-pair motion settings overrides (null = use shot default) */
  pair_motion_settings?: (Record<string, any> | null)[];

  // ============================================================================
  // NEW UNIFIED STRUCTURE GUIDANCE FORMAT
  // ============================================================================
  
  /**
   * NEW: Unified structure guidance configuration.
   * Contains target (vace/uni3c), preprocessing, strength, and related params.
   * This is the preferred format - takes precedence over legacy scattered params.
   */
  structure_guidance?: StructureGuidanceConfig;
  
  /**
   * NEW: Array of structure video configurations for multi-video support.
   * Each video can target a specific output frame range with its own settings.
   */
  structure_videos?: StructureVideoConfig[];
  
  // ============================================================================
  // LEGACY PARAMS (kept for backward compatibility, prefer structure_guidance)
  // ============================================================================
  
  /** @deprecated Use structure_guidance.step_window[0] instead */
  uni3c_start_percent?: number;
  /** @deprecated Use structure_guidance.step_window[1] instead */
  uni3c_end_percent?: number;
  /** @deprecated Use structure_guidance.target === 'uni3c' instead */
  use_uni3c?: boolean;
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
 * @param parentGenerationId - Parent generation ID to include in payload
 * @returns Processed orchestrator payload
 */
function buildTravelBetweenImagesPayload(
  params: TravelBetweenImagesTaskParams, 
  finalResolution: string,
  taskId: string,
  runId: string,
  parentGenerationId?: string
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
    // Common identifier for comparing batch vs individual segment generation
    generation_source: 'batch',
    orchestrator_task_id: taskId,
    run_id: runId,
    input_image_paths_resolved: params.image_urls,
    // Include generation IDs for clickable images in SegmentCard
    ...(params.image_generation_ids && params.image_generation_ids.length > 0 
      ? { input_image_generation_ids: params.image_generation_ids } 
      : {}),
    // Include pair shot generation IDs for stable segment tethering
    ...(params.pair_shot_generation_ids && params.pair_shot_generation_ids.length > 0
      ? { pair_shot_generation_ids: params.pair_shot_generation_ids }
      : {}),
    num_new_segments_to_generate: numSegments,
    base_prompts_expanded: basePromptsExpanded,
    base_prompt: params.base_prompt, // Singular - the default/base prompt
    negative_prompts_expanded: negativePromptsExpanded,
    // CRITICAL FIX: Only include enhanced_prompts_expanded if actually provided
    // This prevents the backend from misinterpreting empty arrays
    ...(enhancedPromptsExpanded !== undefined ? { enhanced_prompts_expanded: enhancedPromptsExpanded } : {}),
    // NEW: Per-pair parameter overrides (only include if there are actual overrides)
    // Names must match backend expectations: phase_configs_expanded, loras_per_segment_expanded
    // IMPORTANT: Truncate to numSegments to handle deleted images with stale arrays
    ...(params.pair_phase_configs?.some(x => x !== null) ? { phase_configs_expanded: params.pair_phase_configs.slice(0, numSegments) } : {}),
    ...(params.pair_loras?.some(x => x !== null) ? { loras_per_segment_expanded: params.pair_loras.slice(0, numSegments) } : {}),
    ...(params.pair_motion_settings?.some(x => x !== null) ? { motion_settings_expanded: params.pair_motion_settings.slice(0, numSegments) } : {}),
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
    // Include parent_generation_id so complete_task uses it instead of creating a new one
    ...(parentGenerationId ? { parent_generation_id: parentGenerationId } : {}),
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
    // HARDCODED: SVI (smooth continuations) feature has been removed from UX
    // Always set to false regardless of any params passed
    use_svi: false,
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

  // ============================================================================
  // STRUCTURE GUIDANCE - NEW UNIFIED FORMAT
  // ============================================================================
  // Forward structure_guidance config and structure_videos array to orchestrator.
  // The new format separates guidance config (target, preprocessing, strength)
  // from video source info (path, frame range, treatment).
  
  // ============================================================================
  // STRUCTURE GUIDANCE - NEW UNIFIED FORMAT (videos INSIDE structure_guidance)
  // ============================================================================
  // The unified format nests videos inside structure_guidance:
  // {
  //   "structure_guidance": {
  //     "target": "uni3c" | "vace",
  //     "videos": [{ path, start_frame, end_frame, treatment }],
  //     "strength": 1.0,
  //     // Uni3C: step_window, frame_policy, zero_empty_frames
  //     // VACE: preprocessing, canny_intensity, depth_contrast
  //   }
  // }
  // NO SEPARATE structure_videos array - everything is in structure_guidance.
  
  if (params.structure_guidance) {
    // New unified format - structure_guidance contains videos inside
    orchestratorPayload.structure_guidance = params.structure_guidance;
    console.log("[createTravelBetweenImagesTask] Using UNIFIED structure_guidance format:", {
      target: params.structure_guidance.target,
      videosCount: (params.structure_guidance.videos as unknown[] | undefined)?.length ?? 0,
      strength: params.structure_guidance.strength,
    });
  } else if (params.structure_videos && params.structure_videos.length > 0) {
    // LEGACY: Separate structure_videos array - convert to unified format
    // Clean the array to only include backend-relevant fields
    const cleanedVideos = params.structure_videos.map(video => ({
      path: video.path,
      start_frame: video.start_frame ?? 0,
      end_frame: video.end_frame ?? null,
      treatment: video.treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    }));
    
    // Build unified structure_guidance from the first video's settings
    const firstVideo = params.structure_videos[0];
    const isUni3cTarget = (firstVideo as Record<string, unknown>).structure_type === 'uni3c';
    
    const unifiedGuidance: Record<string, unknown> = {
      target: isUni3cTarget ? 'uni3c' : 'vace',
      videos: cleanedVideos,
      strength: (firstVideo as Record<string, unknown>).motion_strength ?? 1.0,
    };
    
    if (isUni3cTarget) {
      unifiedGuidance.step_window = [
        (firstVideo as Record<string, unknown>).uni3c_start_percent ?? 0,
        (firstVideo as Record<string, unknown>).uni3c_end_percent ?? 1.0,
      ];
      unifiedGuidance.frame_policy = 'fit';
      unifiedGuidance.zero_empty_frames = true;
    } else {
      const preprocessingMap: Record<string, string> = {
        'flow': 'flow', 'canny': 'canny', 'depth': 'depth', 'raw': 'none',
      };
      unifiedGuidance.preprocessing = preprocessingMap[(firstVideo as Record<string, unknown>).structure_type as string ?? 'flow'] ?? 'flow';
    }
    
    orchestratorPayload.structure_guidance = unifiedGuidance;
    
    console.log("[createTravelBetweenImagesTask] Converted LEGACY structure_videos to UNIFIED format:", {
      target: unifiedGuidance.target,
      videosCount: cleanedVideos.length,
    });
  } else if (params.structure_video_path) {
    // LEGACY: Single video path - convert to unified format
    const isUni3cTarget = params.structure_video_type === 'uni3c' || params.use_uni3c;
    
    const unifiedGuidance: Record<string, unknown> = {
      target: isUni3cTarget ? 'uni3c' : 'vace',
      videos: [{
        path: params.structure_video_path,
        start_frame: 0,
        end_frame: null,
        treatment: params.structure_video_treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
      }],
      strength: params.structure_video_motion_strength ?? 1.0,
    };
    
    if (isUni3cTarget) {
      unifiedGuidance.step_window = [
        params.uni3c_start_percent ?? 0,
        params.uni3c_end_percent ?? 0.1,
      ];
      unifiedGuidance.frame_policy = 'fit';
      unifiedGuidance.zero_empty_frames = true;
    } else {
      const preprocessingMap: Record<string, string> = {
        'flow': 'flow', 'canny': 'canny', 'depth': 'depth', 'raw': 'none',
      };
      unifiedGuidance.preprocessing = preprocessingMap[params.structure_video_type ?? 'flow'] ?? 'flow';
    }
    
    orchestratorPayload.structure_guidance = unifiedGuidance;
    
    console.log("[createTravelBetweenImagesTask] Converted LEGACY single video to UNIFIED format:", {
      target: unifiedGuidance.target,
    });
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

  // CLEANUP: Remove legacy structure video params that are now replaced by unified structure_guidance
  // These may have been passed in params and are no longer needed in the output
  const legacyStructureParams = [
    'structure_type',
    'structure_videos',
    'structure_video_path',
    'structure_video_treatment',
    'structure_video_motion_strength',
    'structure_video_type',
    'structure_canny_intensity',
    'structure_depth_contrast',
    'structure_guidance_video_url',
    'structure_guidance_frame_offset',
    'use_uni3c',
    'uni3c_guide_video',
    'uni3c_strength',
    'uni3c_start_percent',
    'uni3c_end_percent',
    'uni3c_guidance_frame_offset',
  ];
  for (const param of legacyStructureParams) {
    delete (orchestratorPayload as Record<string, unknown>)[param];
  }

  return orchestratorPayload;
}

/**
 * Result of creating a travel between images task
 */
export interface TravelBetweenImagesTaskResult {
  /** The created task data */
  task: any;
  /** The parent generation ID (either provided or newly created) */
  parentGenerationId: string | undefined;
}

/**
 * Creates a travel between images task using the unified approach
 * This replaces the direct call to the steerable-motion edge function
 *
 * @param params - Travel between images task parameters
 * @returns Promise resolving to the created task and parent generation ID
 */
export async function createTravelBetweenImagesTask(params: TravelBetweenImagesTaskParams): Promise<TravelBetweenImagesTaskResult> {
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

    // 4. Ensure we have a parent_generation_id (create placeholder if needed)
    // This ensures the parent generation exists BEFORE segments start completing
    let effectiveParentGenerationId = params.parent_generation_id;

    // [ParentReuseDebug] Log parent ID handling
    console.log('[ParentReuseDebug] === createTravelBetweenImagesTask ===');
    console.log('[ParentReuseDebug] params.parent_generation_id:', params.parent_generation_id?.substring(0, 8) || 'undefined');
    console.log('[ParentReuseDebug] params.shot_id:', params.shot_id?.substring(0, 8) || 'undefined');

    if (!effectiveParentGenerationId && params.shot_id) {
      console.log("[ParentReuseDebug] ⚠️ No parent_generation_id provided, WILL CREATE NEW placeholder parent");
      
      // Create a placeholder parent generation
      const newParentId = crypto.randomUUID();
      const placeholderParams = {
        tool_type: 'travel-between-images',
        created_from: 'travel_orchestrator_upfront',
        // Include basic orchestrator_details structure so it shows in segment outputs
        orchestrator_details: {
          num_new_segments_to_generate: Math.max(1, params.image_urls.length - 1),
          input_image_paths_resolved: params.image_urls,
          shot_id: params.shot_id,
        },
        // Include generation name if provided
        ...(params.generation_name ? { generation_name: params.generation_name } : {}),
      };
      
      const { data: newParent, error: parentError } = await supabase
        .from('generations')
        .insert({
          id: newParentId,
          project_id: params.project_id,
          type: 'video',
          is_child: false,
          location: null, // Placeholder - no video yet
          params: placeholderParams,
          name: params.generation_name || null,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (parentError) {
        console.error("[createTravelBetweenImagesTask] Error creating placeholder parent:", parentError);
        throw new Error(`Failed to create placeholder parent generation: ${parentError.message}`);
      }
      
      console.log("[ParentReuseDebug] ✅ Created NEW placeholder parent:", newParentId.substring(0, 8));
      effectiveParentGenerationId = newParentId;
      
      // Link the parent to the shot using the RPC
      try {
        const { error: linkError } = await supabase.rpc('add_generation_to_shot', {
          p_shot_id: params.shot_id,
          p_generation_id: newParentId,
          p_with_position: false // Parent videos don't get timeline positions
        });
        
        if (linkError) {
          console.error("[createTravelBetweenImagesTask] Error linking parent to shot:", linkError);
          // Don't throw - the generation was created, just not linked
        } else {
          console.log("[createTravelBetweenImagesTask] Linked parent to shot:", params.shot_id);
        }
      } catch (linkErr) {
        console.error("[createTravelBetweenImagesTask] Exception linking parent to shot:", linkErr);
        // Don't throw - the generation was created, just not linked
      }
    } else if (effectiveParentGenerationId) {
      console.log("[ParentReuseDebug] ✅ REUSING existing parent_generation_id:", effectiveParentGenerationId.substring(0, 8));
    } else {
      console.log("[ParentReuseDebug] ⚠️ No parent_generation_id and no shot_id - segments will not have parent");
    }

    // [ParentReuseDebug] Summary
    console.log('[ParentReuseDebug] FINAL effectiveParentGenerationId:', effectiveParentGenerationId?.substring(0, 8) || 'undefined');

    // 5. Build orchestrator payload (now includes parent_generation_id)
    const orchestratorPayload = buildTravelBetweenImagesPayload(
      params, 
      finalResolution, 
      orchestratorTaskId, 
      runId,
      effectiveParentGenerationId
    );

    // 6. Determine task type based on turbo mode
    const isTurboMode = params.turbo_mode === true;
    const taskType = isTurboMode ? 'wan_2_2_i2v' : 'travel_orchestrator';
    
    console.log("[createTravelBetweenImagesTask] Task type determination:", {
      modelName: params.model_name,
      turboMode: isTurboMode,
      taskType,
      parentGenerationId: effectiveParentGenerationId?.substring(0, 8)
    });

    // Create task using unified create-task function (no task_id - let DB auto-generate)
    const result = await createTask({
      project_id: params.project_id,
      task_type: taskType,
      params: {
        tool_type: 'travel-between-images', // Override tool_type for proper generation tagging
        orchestrator_details: orchestratorPayload,
        // Also store parent_generation_id at top level for easy access
        ...(effectiveParentGenerationId ? { parent_generation_id: effectiveParentGenerationId } : {}),
        // Also store at top level for direct access by worker (not just in orchestrator_details)
        ...(params.generation_name ? { generation_name: params.generation_name } : {}),
      }
    });

    console.log("[createTravelBetweenImagesTask] Task created successfully:", result);
    console.log('[ParentReuseDebug] === createTravelBetweenImagesTask RETURN ===');
    console.log('[ParentReuseDebug] Returning parentGenerationId:', effectiveParentGenerationId?.substring(0, 8) || 'undefined');
    return {
      task: result,
      parentGenerationId: effectiveParentGenerationId,
    };

  } catch (error) {
    console.error("[createTravelBetweenImagesTask] Error creating task:", error);
    throw error;
  }
}

/**
 * Re-export the interface and error class for convenience
 */
export { TaskValidationError } from "../taskCreation";
