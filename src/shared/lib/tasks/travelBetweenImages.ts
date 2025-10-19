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

/**
 * Interface for travel between images (steerable motion) task parameters
 * This matches the original steerable-motion edge function request body
 */
export interface TravelBetweenImagesTaskParams {
  project_id: string;
  shot_id?: string;
  image_urls: string[];
  base_prompts: string[];
  base_prompt?: string; // Singular - the default/base prompt used when autoCreateIndividualPrompts is enabled
  negative_prompts?: string[];
  enhanced_prompts?: string[];
  segment_frames: number[];
  frame_overlap: number[];
  resolution?: string;
  model_name?: string;
  seed?: number;
  debug?: boolean;
  params_json_str?: string;
  steps?: number;
  main_output_dir_for_run?: string;
  enhance_prompt?: boolean;
  openai_api_key?: string;
  loras?: Array<{ path: string; strength: number }>;
  show_input_images?: boolean;
  generation_mode?: 'batch' | 'timeline';
  dimension_source?: 'project' | 'firstImage' | 'custom';
  // Additional parameters sent by ShotEditor
  random_seed?: boolean;
  turbo_mode?: boolean;
  amount_of_motion?: number;
  advanced_mode?: boolean;                           // Whether Advanced Mode is enabled
  // Structure video parameters (matches backend naming)
  structure_video_path?: string | null;              // Path to structure video (S3/Storage URL)
  structure_video_treatment?: 'adjust' | 'clip';     // How to handle frame mismatches
  structure_video_motion_strength?: number;          // 0.0 = no motion, 1.0 = full motion, >1.0 = amplified
  structure_video_type?: 'flow' | 'canny' | 'depth'; // Type of structure extraction: optical flow, canny edges, or depth map
  // Variant naming
  generation_name?: string;                          // Optional variant name for the generation
  // Advanced phase configuration
  phase_config?: {
    num_phases: number;
    steps_per_phase: number[];
    flow_shift: number;
    sample_solver: string;
    model_switch_phase: number;
    phases: Array<{
      phase: number;
      guidance_scale: number;
      loras: Array<{
        url: string;
        multiplier: string;
      }>;
    }>;
  };
  // Selected phase config preset ID (for UI state restoration)
  selected_phase_preset_id?: string | null;
}

/**
 * Default values for travel between images task settings
 */
const DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES = {
  colour_match_videos: false,
  model_name: "base_tester_model",
  seed: 789,
  steps: 20,
  apply_reward_lora: false,
  apply_causvid: false,
  use_lighti2x_lora: false,
  use_styleboost_loras: true,
  fade_in_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
  fade_out_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
  after_first_post_generation_saturation: 1,
  after_first_post_generation_brightness: 0,
  debug: true,
  main_output_dir_for_run: "./outputs/default_travel_output",
  enhance_prompt: false,
  openai_api_key: "",
  show_input_images: false,
  accelerated_mode: false,
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
  // CRITICAL FIX: Only expand enhanced_prompts if they were actually provided
  // Don't fill with empty strings - let the backend orchestrator handle missing enhanced prompts
  const enhancedPromptsExpanded = params.enhanced_prompts ? expandArrayToCount(params.enhanced_prompts, numSegments) : undefined;
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

  // Handle fade duration parameters (matching original logic)
  const processFadeDuration = (fadeDuration: any, defaultValue: string): string => {
    if (typeof fadeDuration === "object" && fadeDuration !== null) {
      return JSON.stringify(fadeDuration);
    }
    return fadeDuration ?? defaultValue;
  };

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
    seed_base: finalSeed,
    // Only include steps if NOT in Advanced Mode (Advanced Mode uses steps_per_phase)
    ...(params.advanced_mode ? {} : { steps: stepsValue }),
    apply_reward_lora: params.apply_reward_lora ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.apply_reward_lora,
    colour_match_videos: params.colour_match_videos ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.colour_match_videos,
    apply_causvid: params.apply_causvid ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.apply_causvid,
    use_lighti2x_lora: params.use_lighti2x_lora ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.use_lighti2x_lora,
    use_styleboost_loras: params.use_styleboost_loras ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.use_styleboost_loras,
    fade_in_params_json_str: processFadeDuration(params.fade_in_duration, DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.fade_in_duration),
    fade_out_params_json_str: processFadeDuration(params.fade_out_duration, DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.fade_out_duration),
    after_first_post_generation_saturation: params.after_first_post_generation_saturation ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.after_first_post_generation_saturation,
    after_first_post_generation_brightness: params.after_first_post_generation_brightness ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.after_first_post_generation_brightness,
    debug_mode_enabled: params.debug ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.debug,
    shot_id: params.shot_id ?? undefined,
    main_output_dir_for_run: params.main_output_dir_for_run ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.main_output_dir_for_run,
    enhance_prompt: params.enhance_prompt ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.enhance_prompt,
    openai_api_key: params.openai_api_key ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.openai_api_key,
    show_input_images: params.show_input_images ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.show_input_images,
    accelerated_mode: params.accelerated_mode ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.accelerated_mode,
    generation_mode: params.generation_mode ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.generation_mode,
    dimension_source: params.dimension_source ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.dimension_source,
    // Only include amount_of_motion if NOT in Advanced Mode
    ...(params.advanced_mode ? {} : { amount_of_motion: params.amount_of_motion ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.amount_of_motion }),
    advanced_mode: params.advanced_mode ?? false,
    // Include generation_name in orchestrator payload so it flows to child tasks
    generation_name: params.generation_name ?? undefined,
  };

  // Log the enhance_prompt value that will be sent to orchestrator
  console.log("[EnhancePromptDebug] ⚠️ Task Creation - Value being sent to orchestrator:", {
    enhance_prompt_in_orchestratorPayload: orchestratorPayload.enhance_prompt,
    enhance_prompt_in_params: params.enhance_prompt,
    enhance_prompt_default: DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.enhance_prompt,
    was_params_value_undefined: params.enhance_prompt === undefined,
    was_params_value_null: params.enhance_prompt === null,
    openai_api_key_provided: !!(params.openai_api_key ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.openai_api_key),
    WARNING: orchestratorPayload.enhance_prompt === true ? '⚠️ enhance_prompt is TRUE - check if this is intentional' : '✅ enhance_prompt is false'
  });

  // Add structure video parameters if provided
  if (params.structure_video_path) {
    orchestratorPayload.structure_video_path = params.structure_video_path;
    orchestratorPayload.structure_video_treatment = params.structure_video_treatment ?? 'adjust';
    orchestratorPayload.structure_video_motion_strength = params.structure_video_motion_strength ?? 1.0;
    orchestratorPayload.structure_video_type = params.structure_video_type ?? 'flow';
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
        orchestrator_details: orchestratorPayload,
        // Also store at top level for direct access (redundant but useful for consistency)
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
