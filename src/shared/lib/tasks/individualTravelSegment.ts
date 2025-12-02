import { 
  createTask, 
  TaskValidationError,
  resolveProjectResolution 
} from "../taskCreation";

/**
 * Phase configuration for advanced motion control
 */
export interface PhaseConfig {
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
}

/**
 * Interface for individual travel segment regeneration task parameters
 * This is used when regenerating a single segment from ChildGenerationsView
 */
export interface IndividualTravelSegmentParams {
  project_id: string;
  
  // Parent generation to create variant for
  parent_generation_id: string;
  
  // Child generation being regenerated (for tracking)
  child_generation_id?: string;
  
  // Segment identification
  segment_index: number;
  
  // Input images for this segment
  start_image_url: string;
  end_image_url: string;
  
  // Prompt settings
  base_prompt: string;
  negative_prompt?: string;
  
  // Frame settings
  num_frames: number;
  frame_overlap?: number;
  
  // Resolution (from parent or project)
  resolution?: string;
  
  // Model settings
  model_name?: string;
  
  // Seed settings
  seed?: number;
  random_seed?: boolean;
  
  // Motion control
  amount_of_motion?: number;
  advanced_mode?: boolean;
  phase_config?: PhaseConfig;
  motion_mode?: 'basic' | 'presets' | 'advanced';
  selected_phase_preset_id?: string | null;
  
  // LoRA settings
  loras?: Array<{ path: string; strength: number }>;
  
  // Post-processing
  after_first_post_generation_saturation?: number;
  after_first_post_generation_brightness?: number;
  
  // Optional generation name for the variant
  generation_name?: string;
}

/**
 * Default values for individual travel segment task
 */
const DEFAULT_INDIVIDUAL_SEGMENT_VALUES = {
  model_name: "wan_2_2_i2v_480p",
  seed: 789,
  frame_overlap: 4,
  amount_of_motion: 0.5,
  after_first_post_generation_saturation: 1,
  after_first_post_generation_brightness: 0,
};

/**
 * Validates individual travel segment parameters
 */
function validateIndividualTravelSegmentParams(params: IndividualTravelSegmentParams): void {
  const errors: string[] = [];
  
  if (!params.project_id) {
    errors.push("project_id is required");
  }
  
  if (!params.parent_generation_id) {
    errors.push("parent_generation_id is required");
  }
  
  if (typeof params.segment_index !== 'number' || params.segment_index < 0) {
    errors.push("segment_index must be a non-negative number");
  }
  
  if (!params.start_image_url) {
    errors.push("start_image_url is required");
  }
  
  if (!params.end_image_url) {
    errors.push("end_image_url is required");
  }
  
  if (!params.base_prompt) {
    errors.push("base_prompt is required");
  }
  
  if (typeof params.num_frames !== 'number' || params.num_frames < 1) {
    errors.push("num_frames must be a positive number");
  }
  
  if (errors.length > 0) {
    throw new TaskValidationError(errors.join(", "));
  }
}

/**
 * Builds the task params for an individual travel segment
 */
function buildIndividualTravelSegmentParams(
  params: IndividualTravelSegmentParams,
  finalResolution: string
): Record<string, unknown> {
  // Handle random seed generation
  const finalSeed = params.random_seed 
    ? Math.floor(Math.random() * 1000000) 
    : (params.seed ?? DEFAULT_INDIVIDUAL_SEGMENT_VALUES.seed);
  
  if (params.random_seed) {
    console.log(`[IndividualTravelSegment] Generated random seed: ${finalSeed}`);
  }

  // Convert LoRAs to the format expected by the GPU worker
  const additionalLoras: Record<string, number> = {};
  if (params.loras && params.loras.length > 0) {
    params.loras.forEach(lora => {
      additionalLoras[lora.path] = lora.strength;
    });
  }

  // Build task params - structure similar to travel_segment but standalone
  const taskParams: Record<string, unknown> = {
    // Identification
    parent_generation_id: params.parent_generation_id,
    child_generation_id: params.child_generation_id,
    segment_index: params.segment_index,
    
    // Input images (single segment = 2 images)
    input_image_paths_resolved: [params.start_image_url, params.end_image_url],
    start_image_url: params.start_image_url,
    end_image_url: params.end_image_url,
    
    // Prompts
    base_prompt: params.base_prompt,
    prompt: params.base_prompt, // Alias for compatibility
    negative_prompt: params.negative_prompt || "",
    
    // Frames
    num_frames: params.num_frames,
    frame_overlap: params.frame_overlap ?? DEFAULT_INDIVIDUAL_SEGMENT_VALUES.frame_overlap,
    
    // Resolution
    parsed_resolution_wh: finalResolution,
    resolution: finalResolution,
    
    // Model
    model_name: params.model_name ?? DEFAULT_INDIVIDUAL_SEGMENT_VALUES.model_name,
    
    // Seed
    seed: finalSeed,
    seed_to_use: finalSeed,
    random_seed: params.random_seed ?? false,
    
    // Motion control
    amount_of_motion: params.amount_of_motion ?? DEFAULT_INDIVIDUAL_SEGMENT_VALUES.amount_of_motion,
    motion_mode: params.motion_mode ?? 'basic',
    advanced_mode: params.advanced_mode ?? false,
    
    // Post-processing
    after_first_post_generation_saturation: 
      params.after_first_post_generation_saturation ?? DEFAULT_INDIVIDUAL_SEGMENT_VALUES.after_first_post_generation_saturation,
    after_first_post_generation_brightness: 
      params.after_first_post_generation_brightness ?? DEFAULT_INDIVIDUAL_SEGMENT_VALUES.after_first_post_generation_brightness,
    
    // LoRAs
    additional_loras: additionalLoras,
    
    // Tool type for generation tracking
    tool_type: 'travel-between-images',
    
    // Variant naming
    ...(params.generation_name ? { generation_name: params.generation_name } : {}),
  };

  // Add phase config if in advanced mode
  if (params.advanced_mode && params.phase_config) {
    taskParams.phase_config = params.phase_config;
  }

  // Add selected phase preset ID for UI state restoration
  if (params.selected_phase_preset_id) {
    taskParams.selected_phase_preset_id = params.selected_phase_preset_id;
  }

  return taskParams;
}

/**
 * Creates an individual travel segment regeneration task
 * 
 * This creates a standalone task (visible in TasksPane) that regenerates
 * a single segment and creates a variant on the parent generation when complete.
 * 
 * @param params - Individual travel segment parameters
 * @returns Promise resolving to the created task
 */
export async function createIndividualTravelSegmentTask(params: IndividualTravelSegmentParams): Promise<any> {
  console.log("[IndividualTravelSegment] Creating task with params:", {
    project_id: params.project_id,
    parent_generation_id: params.parent_generation_id,
    segment_index: params.segment_index,
    base_prompt: params.base_prompt?.substring(0, 50) + "...",
    num_frames: params.num_frames,
    amount_of_motion: params.amount_of_motion,
  });

  try {
    // 1. Validate parameters
    validateIndividualTravelSegmentParams(params);

    // 2. Resolve project resolution
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id, 
      params.resolution
    );

    // 3. Build task params
    const taskParams = buildIndividualTravelSegmentParams(params, finalResolution);

    // 4. Create task using unified create-task function
    const result = await createTask({
      project_id: params.project_id,
      task_type: 'individual_travel_segment',
      params: taskParams
    });

    console.log("[IndividualTravelSegment] Task created successfully:", result);
    return result;

  } catch (error) {
    console.error("[IndividualTravelSegment] Error creating task:", error);
    throw error;
  }
}

/**
 * Re-export the error class for convenience
 */
export { TaskValidationError } from "../taskCreation";

