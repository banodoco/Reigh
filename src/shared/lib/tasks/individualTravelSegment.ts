import {
  createTask,
  TaskValidationError,
  resolveProjectResolution
} from "../taskCreation";
import { supabase } from '@/integrations/supabase/client';
import { PhaseConfig } from '@/tools/travel-between-images/settings';

/**
 * Interface for individual travel segment regeneration task parameters
 * This accepts the original segment params and rebuilds them for a standalone task
 */
export interface IndividualTravelSegmentParams {
  project_id: string;
  
  // Parent generation to create variant for
  parent_generation_id: string;
  
  // Child generation being regenerated (for tracking)
  child_generation_id?: string;
  
  // The original segment params from the SegmentCard
  // This contains all the orchestrator_details, phase_config, etc.
  originalParams: Record<string, any>;
  
  // Segment identification
  segment_index: number;
  
  // Input images for this segment (extracted from originalParams or provided)
  start_image_url: string;
  end_image_url: string;
  
  // Generation IDs for the input images (for clickable images in SegmentCard)
  start_image_generation_id?: string;
  end_image_generation_id?: string;
  
  // Overrides - these can override values from originalParams
  base_prompt?: string;
  negative_prompt?: string;
  num_frames?: number;
  seed?: number;
  random_seed?: boolean;
  amount_of_motion?: number;
  advanced_mode?: boolean;
  phase_config?: PhaseConfig;
  motion_mode?: 'basic' | 'presets' | 'advanced';
  selected_phase_preset_id?: string | null;
  loras?: Array<{ path: string; strength: number }>;

  // Optional generation name for the variant
  generation_name?: string;

  // Whether the new variant should be set as primary (default: true for backward compatibility)
  make_primary_variant?: boolean;

  // Smooth continuations (SVI) - for smoother transitions between segments
  use_svi?: boolean;
  svi_predecessor_video_url?: string;
}

// Maximum frames allowed per segment (81-frame limit)
const MAX_SEGMENT_FRAMES = 81;

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
  
  // Enforce 81-frame limit per segment
  const numFrames = params.num_frames ?? params.originalParams?.num_frames ?? 49;
  if (numFrames > MAX_SEGMENT_FRAMES) {
    errors.push(`num_frames (${numFrames}) exceeds maximum of ${MAX_SEGMENT_FRAMES} frames per segment`);
  }
  
  if (errors.length > 0) {
    throw new TaskValidationError(errors.join(", "));
  }
}

/**
 * Builds the task params for an individual travel segment
 * Matches the exact structure of travel_segment tasks
 */
function buildIndividualTravelSegmentParams(
  params: IndividualTravelSegmentParams,
  finalResolution: string
): Record<string, unknown> {
  const orig = params.originalParams || {};
  const orchDetails = orig.orchestrator_details || {};
  
  // Handle random seed generation
  const baseSeed = orig.seed_to_use || orig.seed || orchDetails.seed_base || 789;
  const finalSeed = params.random_seed 
    ? Math.floor(Math.random() * 1000000) 
    : (params.seed ?? baseSeed);
  
  if (params.random_seed) {
    console.log(`[IndividualTravelSegment] Generated random seed: ${finalSeed}`);
  }

  // Build additional_loras from params.loras or original
  const additionalLoras: Record<string, number> = {};
  if (params.loras && params.loras.length > 0) {
    params.loras.forEach(lora => {
      additionalLoras[lora.path] = lora.strength;
    });
  } else if (orig.additional_loras) {
    Object.assign(additionalLoras, orig.additional_loras);
  } else if (orchDetails.additional_loras) {
    Object.assign(additionalLoras, orchDetails.additional_loras);
  }

  // Determine phase_config
  const phaseConfig = params.phase_config || orig.phase_config || orchDetails.phase_config;
  
  // Determine advanced_mode
  const advancedMode = params.advanced_mode ?? orig.advanced_mode ?? orchDetails.advanced_mode ?? false;
  
  // Build lora_multipliers from phase_config if available
  const loraMultipliers = orig.lora_multipliers || orchDetails.lora_multipliers || [];
  
  // Determine model settings
  const modelName = orig.model_name || orchDetails.model_name || "wan_2_2_i2v_480p";
  const flowShift = orig.flow_shift ?? orchDetails.flow_shift ?? 5;
  const sampleSolver = orig.sample_solver || orchDetails.sample_solver || "euler";
  const guidanceScale = orig.guidance_scale ?? orchDetails.guidance_scale ?? 3;
  const guidance2Scale = orig.guidance2_scale ?? orchDetails.guidance2_scale ?? 1;
  const guidancePhases = orig.guidance_phases ?? orchDetails.guidance_phases ?? 2;
  const numInferenceSteps = orig.num_inference_steps ?? orchDetails.num_inference_steps ?? 6;
  const modelSwitchPhase = orig.model_switch_phase ?? orchDetails.model_switch_phase ?? 1;
  const switchThreshold = orig.switch_threshold ?? orchDetails.switch_threshold;
  
  // Segment-specific settings (UI overrides take precedence)
  // Clamp to MAX_SEGMENT_FRAMES (81) as a safety measure even if validation passed
  const rawNumFrames = params.num_frames ?? orig.num_frames ?? 49;
  const numFrames = Math.min(rawNumFrames, MAX_SEGMENT_FRAMES);
  
  // CRITICAL: User-input prompts from UI MUST take precedence
  // params.base_prompt is the explicit override from the SegmentCard UI
  const basePrompt = params.base_prompt ?? orig.base_prompt ?? orig.prompt ?? "";
  const negativePrompt = params.negative_prompt ?? orig.negative_prompt ?? "";
  const amountOfMotion = params.amount_of_motion ?? orig.amount_of_motion ?? orchDetails.amount_of_motion ?? 0.5;
  
  // [SegmentPromptDebug] Log prompt resolution to verify UI values are being used
  console.log('[IndividualTravelSegment] [SegmentPromptDebug] Prompt resolution:', {
    hasParamsBasePrompt: params.base_prompt !== undefined && params.base_prompt !== null,
    paramsBasePrompt: params.base_prompt?.substring(0, 50),
    origBasePrompt: orig.base_prompt?.substring(0, 50),
    origPrompt: orig.prompt?.substring(0, 50),
    finalBasePrompt: basePrompt?.substring(0, 50),
    hasParamsNegativePrompt: params.negative_prompt !== undefined && params.negative_prompt !== null,
    finalNegativePrompt: negativePrompt?.substring(0, 50),
    source: params.base_prompt !== undefined ? 'UI override (user-input)' : 'original params',
  });
  
  // Build input_image_paths_resolved for orchestrator_details
  // Include all input images from the original orchestrator if available
  const allInputImages = orchDetails.input_image_paths_resolved || [params.start_image_url, params.end_image_url];
  
  // Build orchestrator_details to match travel_segment structure exactly
  // IMPORTANT: Remove orchestrator references so this task is billed as a standalone task
  // (otherwise complete_task thinks it's a sub-task and skips billing)
  const { 
    orchestrator_task_id: _removedOrchTaskId, 
    orchestrator_task_id_ref: _removedOrchTaskIdRef,
    run_id: _removedRunId,
    orchestrator_run_id: _removedOrchRunId,
    ...orchDetailsWithoutOrchestratorRefs 
  } = orchDetails;
  
  const orchestratorDetails: Record<string, any> = {
    ...orchDetailsWithoutOrchestratorRefs,
    // Ensure key fields are set
    parsed_resolution_wh: finalResolution,
    input_image_paths_resolved: allInputImages,
    seed_base: finalSeed,
    model_name: modelName,
    flow_shift: flowShift,
    sample_solver: sampleSolver,
    guidance_scale: guidanceScale,
    guidance2_scale: guidance2Scale,
    guidance_phases: guidancePhases,
    num_inference_steps: numInferenceSteps,
    model_switch_phase: modelSwitchPhase,
    additional_loras: additionalLoras,
    advanced_mode: advancedMode,
    motion_mode: params.motion_mode ?? orchDetails.motion_mode ?? 'basic',
    amount_of_motion: amountOfMotion,
    // Add parent_generation_id for variant creation
    parent_generation_id: params.parent_generation_id,
  };

  // Add SVI (smooth continuations) params if enabled
  if (params.use_svi && params.svi_predecessor_video_url) {
    orchestratorDetails.use_svi = true;
    orchestratorDetails.svi_predecessor_video_url = params.svi_predecessor_video_url;
    console.log('[IndividualTravelSegment] SVI enabled:', {
      use_svi: true,
      svi_predecessor_video_url: params.svi_predecessor_video_url?.substring(0, 50) + '...',
    });
  }

  if (phaseConfig) {
    orchestratorDetails.phase_config = phaseConfig;
  }
  if (switchThreshold !== undefined) {
    orchestratorDetails.switch_threshold = switchThreshold;
  }
  if (loraMultipliers.length > 0) {
    orchestratorDetails.lora_multipliers = loraMultipliers;
  }

  // Build task params matching travel_segment structure exactly
  const taskParams: Record<string, unknown> = {
    // Core settings matching travel_segment
    flow_shift: flowShift,
    lora_names: orig.lora_names || orchDetails.lora_names || [],
    model_name: modelName,
    project_id: params.project_id,
    base_prompt: basePrompt,
    fps_helpers: orig.fps_helpers ?? orchDetails.fps_helpers ?? 16,
    seed_to_use: finalSeed,
    
    // Solver and guidance settings
    cfg_zero_step: orig.cfg_zero_step ?? -1,
    sample_solver: sampleSolver,
    segment_index: params.segment_index,
    guidance_scale: guidanceScale,
    structure_type: orig.structure_type || orchDetails.structure_type || "flow",
    cfg_star_switch: orig.cfg_star_switch ?? 0,
    guidance2_scale: guidance2Scale,
    guidance_phases: guidancePhases,
    
    // Segment position flags
    is_last_segment: orig.is_last_segment ?? false,
    negative_prompt: negativePrompt,
    is_first_segment: orig.is_first_segment ?? (params.segment_index === 0),
    
    // LoRA settings
    additional_loras: additionalLoras,
    lora_multipliers: loraMultipliers,
    
    // Model settings
    switch_threshold: switchThreshold,
    debug_mode_enabled: orig.debug_mode_enabled ?? orchDetails.debug_mode_enabled ?? false,
    model_switch_phase: modelSwitchPhase,
    num_inference_steps: numInferenceSteps,
    
    // Resolution
    parsed_resolution_wh: finalResolution,
    
    // Frame settings
    num_frames: numFrames,
    
    // Motion settings (UI override)
    amount_of_motion: amountOfMotion,
    
    // The full orchestrator_details object
    orchestrator_details: orchestratorDetails,
    
    // For individual_travel_segment, include parent_generation_id at top level too
    parent_generation_id: params.parent_generation_id,
    child_generation_id: params.child_generation_id,
    
    // Input images at top level for TaskItem image display
    input_image_paths_resolved: [params.start_image_url, params.end_image_url],
    
    // Post-processing
    after_first_post_generation_saturation: orig.after_first_post_generation_saturation ?? 
      orchDetails.after_first_post_generation_saturation ?? 1,
    after_first_post_generation_brightness: orig.after_first_post_generation_brightness ?? 
      orchDetails.after_first_post_generation_brightness ?? 0,
  };

  // Add phase_config at top level if in advanced mode
  if (advancedMode && phaseConfig) {
    taskParams.phase_config = phaseConfig;
  }

  // Add generation name if provided
  if (params.generation_name) {
    taskParams.generation_name = params.generation_name;
  }

  // Add make_primary_variant flag (defaults to true for backward compatibility)
  taskParams.make_primary_variant = params.make_primary_variant ?? true;

  // Build individual_segment_params - all UI overrides in one place
  // GPU worker should check these first before falling back to top-level values
  const individualSegmentParams: Record<string, unknown> = {
    // Input images for this segment (just 2 images)
    input_image_paths_resolved: [params.start_image_url, params.end_image_url],
    start_image_url: params.start_image_url,
    end_image_url: params.end_image_url,
    
    // Prompts
    base_prompt: basePrompt,
    negative_prompt: negativePrompt,
    
    // Frame settings
    num_frames: numFrames,
    
    // Seed settings
    seed_to_use: finalSeed,
    random_seed: params.random_seed ?? false,
    
    // Motion settings
    amount_of_motion: amountOfMotion,
    motion_mode: params.motion_mode ?? orchDetails.motion_mode ?? 'basic',
    advanced_mode: advancedMode,
    
    // LoRA settings
    additional_loras: additionalLoras,
    
    // Post-processing
    after_first_post_generation_saturation: orig.after_first_post_generation_saturation ?? 
      orchDetails.after_first_post_generation_saturation ?? 1,
    after_first_post_generation_brightness: orig.after_first_post_generation_brightness ?? 
      orchDetails.after_first_post_generation_brightness ?? 0,
  };

  // Add phase_config to individual_segment_params if in advanced mode
  if (advancedMode && phaseConfig) {
    individualSegmentParams.phase_config = phaseConfig;
  }

  // Add the individual_segment_params to task params
  taskParams.individual_segment_params = individualSegmentParams;

  return taskParams;
}

/**
 * Creates an individual travel segment regeneration task
 * 
 * This creates a standalone task (visible in TasksPane) that regenerates
 * a single segment and creates a variant on the parent generation when complete.
 * The task params match the exact structure of travel_segment for GPU worker compatibility.
 * 
 * @param params - Individual travel segment parameters
 * @returns Promise resolving to the created task
 */
export async function createIndividualTravelSegmentTask(params: IndividualTravelSegmentParams): Promise<any> {
  console.log("[IndividualTravelSegment] Creating task with params:", {
    project_id: params.project_id,
    parent_generation_id: params.parent_generation_id,
    segment_index: params.segment_index,
    hasOriginalParams: !!params.originalParams,
    originalParamsKeys: params.originalParams ? Object.keys(params.originalParams).slice(0, 10) : [],
  });

  try {
    // 1. Validate parameters
    validateIndividualTravelSegmentParams(params);

    // 2. Look up existing child at this segment_index (to create variant instead of new child)
    // If child_generation_id wasn't explicitly provided, check if one exists
    let effectiveChildGenerationId = params.child_generation_id;
    if (!effectiveChildGenerationId && params.parent_generation_id && params.segment_index !== undefined) {
      const { data: existingChild } = await supabase
        .from('generations')
        .select('id')
        .eq('parent_generation_id', params.parent_generation_id)
        .eq('child_order', params.segment_index)
        .limit(1)
        .single();

      if (existingChild) {
        effectiveChildGenerationId = existingChild.id;
        console.log("[IndividualTravelSegment] Found existing child at segment_index:", {
          parent_generation_id: params.parent_generation_id,
          segment_index: params.segment_index,
          existing_child_id: effectiveChildGenerationId,
        });
      }
    }

    // Update params with the effective child_generation_id
    const paramsWithChild = {
      ...params,
      child_generation_id: effectiveChildGenerationId,
    };

    // 3. Resolve project resolution (use original if available)
    const origResolution = params.originalParams?.parsed_resolution_wh ||
                          params.originalParams?.orchestrator_details?.parsed_resolution_wh;
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id,
      origResolution
    );

    // 4. Build task params matching travel_segment structure
    const taskParams = buildIndividualTravelSegmentParams(paramsWithChild, finalResolution);

    console.log("[IndividualTravelSegment] Built task params:", {
      model_name: taskParams.model_name,
      segment_index: taskParams.segment_index,
      num_frames: taskParams.num_frames,
      seed_to_use: taskParams.seed_to_use,
      parsed_resolution_wh: taskParams.parsed_resolution_wh,
      child_generation_id: taskParams.child_generation_id,
      origResolution,
      finalResolution,
      hasPhaseConfig: !!taskParams.phase_config,
      hasOrchestratorDetails: !!taskParams.orchestrator_details,
      additionalLorasCount: Object.keys(taskParams.additional_loras as Record<string, number> || {}).length,
    });

    // 5. Create task using unified create-task function
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
