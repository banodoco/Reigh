import {
  createTask,
  TaskValidationError,
  resolveProjectResolution
} from "../taskCreation";
import type { TaskCreationResult } from "../taskCreation";
import { supabase } from '@/integrations/supabase/client';
import { PhaseConfig, buildBasicModePhaseConfig } from '@/tools/travel-between-images/settings';

/**
 * Interface for individual travel segment regeneration task parameters
 * This accepts the original segment params and rebuilds them for a standalone task
 */
export interface IndividualTravelSegmentParams {
  project_id: string;
  
  // Parent generation to create variant for (optional - will be created if not provided)
  parent_generation_id?: string;
  
  // Shot ID to link the parent generation to (required if parent_generation_id is not provided)
  shot_id?: string;
  
  // Child generation being regenerated (for tracking)
  child_generation_id?: string;
  
  // The original segment params from the SegmentCard
  // This contains all the orchestrator_details, phase_config, etc.
  originalParams?: Record<string, any>;
  
  // Segment identification
  segment_index: number;
  
  // Input images for this segment (extracted from originalParams or provided)
  start_image_url: string;
  end_image_url: string;
  
  // Generation IDs for the input images (for clickable images in SegmentCard)
  start_image_generation_id?: string;
  end_image_generation_id?: string;
  
  // Shot generation ID for the start image (for video-to-timeline tethering)
  // This allows videos to move with their source image when timeline is reordered
  pair_shot_generation_id?: string;
  
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
  svi_strength_1?: number;
  svi_strength_2?: number;
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
  
  // Either parent_generation_id OR shot_id must be provided
  // (shot_id is used to create a new parent if none exists)
  if (!params.parent_generation_id && !params.shot_id) {
    errors.push("Either parent_generation_id or shot_id is required");
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
  // If params.loras is explicitly provided (even as empty array), use it - user may have removed all LoRAs
  // Only fall back to original if params.loras is undefined
  const additionalLoras: Record<string, number> = {};
  if (params.loras !== undefined) {
    // User explicitly provided loras (could be empty array to clear them)
    params.loras.forEach(lora => {
      additionalLoras[lora.path] = lora.strength;
    });
    console.log('[IndividualTravelSegment] Using provided loras:', params.loras.length > 0 ? params.loras : '(none - cleared by user)');
  } else if (orig.additional_loras) {
    Object.assign(additionalLoras, orig.additional_loras);
    console.log('[IndividualTravelSegment] Using original additional_loras');
  } else if (orchDetails.additional_loras) {
    Object.assign(additionalLoras, orchDetails.additional_loras);
    console.log('[IndividualTravelSegment] Using orchestrator_details additional_loras');
  }

  // Determine model settings FIRST (needed for basic mode phase config)
  // Get structure_guidance from new unified format (preferred)
  const structureGuidance = orig.structure_guidance || orchDetails.structure_guidance;

  // Check for structure videos
  const hasStructureVideos = !!(
    (structureGuidance?.videos as unknown[] | undefined)?.length > 0 ||
    orchDetails.structure_videos?.length > 0 ||
    orig.structure_videos?.length > 0 ||
    orchDetails.structure_video_path ||
    orig.structure_video_path
  );

  // Determine if using uni3c mode
  let isUni3c = false;
  if (structureGuidance?.target === 'uni3c') {
    isUni3c = hasStructureVideos;
  } else if (hasStructureVideos && !structureGuidance) {
    const structureType = orig.structure_type || orchDetails.structure_type ||
      orchDetails.structure_videos?.[0]?.structure_type || orig.structure_videos?.[0]?.structure_type ||
      orchDetails.structure_video_type || orig.structure_video_type;
    isUni3c = structureType === 'uni3c';
  }

  const useVaceModel = hasStructureVideos && !isUni3c;

  // Determine motion settings
  const motionMode = params.motion_mode ?? orig.motion_mode ?? orchDetails.motion_mode ?? 'basic';
  const isBasicMode = motionMode === 'basic';
  const amountOfMotion = params.amount_of_motion ?? orig.amount_of_motion ?? orchDetails.amount_of_motion ?? 0.5;
  const userLoras = params.loras ?? [];

  // Phase config is ALWAYS built and sent (matches batch mode behavior)
  // - Basic mode: build from defaults with user LoRAs
  // - Advanced mode: use explicit if provided, otherwise build from defaults
  const explicitPhaseConfig = params.phase_config || orig.phase_config || orchDetails.phase_config;
  const phaseConfig: PhaseConfig = explicitPhaseConfig || buildBasicModePhaseConfig(useVaceModel, amountOfMotion, userLoras);

  // advanced_mode indicates whether user provided explicit config (true) or we computed it (false)
  const advancedMode = isBasicMode ? false : (params.advanced_mode ?? orig.advanced_mode ?? orchDetails.advanced_mode ?? !!explicitPhaseConfig);

  // Build lora_multipliers from phase_config (always available now)
  const loraMultipliers = phaseConfig.phases.flatMap((phase) =>
    (phase.loras || []).map((lora) => ({ url: lora.url, multiplier: lora.multiplier }))
  );
  const defaultModelName = useVaceModel
    ? "wan_2_2_vace_lightning_baseline_2_2_2"
    : "wan_2_2_i2v_lightning_baseline_2_2_2";
  const modelName = orig.model_name || orchDetails.model_name || defaultModelName;
  
  // Log model selection for debugging
  console.log('[IndividualTravelSegment] Model selection:', {
    origModelName: orig.model_name,
    orchModelName: orchDetails.model_name,
    hasStructureVideos,
    hasStructureGuidance: !!structureGuidance,
    structureGuidanceTarget: structureGuidance?.target,
    isUni3c,
    useVaceModel,
    defaultModelName,
    finalModelName: modelName,
  });
  // Extract flat fields from phaseConfig (when available) or fallback to orig/orchDetails
  const flowShift = phaseConfig?.flow_shift ?? orig.flow_shift ?? orchDetails.flow_shift ?? 5;
  const sampleSolver = phaseConfig?.sample_solver ?? orig.sample_solver ?? orchDetails.sample_solver ?? "euler";
  const guidanceScale = phaseConfig?.phases?.[0]?.guidance_scale ?? orig.guidance_scale ?? orchDetails.guidance_scale ?? 1;
  const guidance2Scale = phaseConfig?.phases?.[1]?.guidance_scale ?? orig.guidance2_scale ?? orchDetails.guidance2_scale ?? 1;
  const guidancePhases = phaseConfig?.num_phases ?? orig.guidance_phases ?? orchDetails.guidance_phases ?? 2;
  const numInferenceSteps = phaseConfig?.steps_per_phase
    ? phaseConfig.steps_per_phase.reduce((sum: number, steps: number) => sum + steps, 0)
    : (orig.num_inference_steps ?? orchDetails.num_inference_steps ?? 6);
  const modelSwitchPhase = phaseConfig?.model_switch_phase ?? orig.model_switch_phase ?? orchDetails.model_switch_phase ?? 1;
  const switchThreshold = orig.switch_threshold ?? orchDetails.switch_threshold;
  
  // Segment-specific settings (UI overrides take precedence)
  // Clamp to MAX_SEGMENT_FRAMES (81) as a safety measure even if validation passed
  const rawNumFrames = params.num_frames ?? orig.num_frames ?? 49;
  const numFrames = Math.min(rawNumFrames, MAX_SEGMENT_FRAMES);
  
  // CRITICAL: User-input prompts from UI MUST take precedence
  // params.base_prompt is the explicit override from the SegmentCard UI
  const basePrompt = params.base_prompt ?? orig.base_prompt ?? orig.prompt ?? "";
  const negativePrompt = params.negative_prompt ?? orig.negative_prompt ?? "";
  
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
  
  // Explicitly preserve critical orchestrator fields
  // These are REQUIRED for the GPU worker to handle individual segment generation correctly
  const fpsHelpers = orig.fps_helpers ?? orchDetails.fps_helpers ?? 16;
  const segmentFramesExpanded = orchDetails.segment_frames_expanded;
  const frameOverlapExpanded = orchDetails.frame_overlap_expanded;
  
  // UNIFIED STRUCTURE GUIDANCE FORMAT: Ensure we use the new format
  // If we have structure_guidance (new unified format), use it
  // If we have separate structure_videos (legacy), build unified format
  let finalStructureGuidance = structureGuidance;
  
  if (!finalStructureGuidance) {
    // Check for legacy separate structure_videos array
    const legacyStructureVideos = orchDetails.structure_videos ?? orig.structure_videos;
    if (legacyStructureVideos?.length > 0) {
      // Build unified format from legacy structure_videos
      const firstVideo = legacyStructureVideos[0];
      const isUni3cLegacy = firstVideo.structure_type === 'uni3c';
      
      const cleanedVideos = legacyStructureVideos.map((v: Record<string, unknown>) => ({
        path: v.path,
        start_frame: v.start_frame ?? 0,
        end_frame: v.end_frame ?? null,
        treatment: v.treatment ?? 'adjust',
      }));
      
      finalStructureGuidance = {
        target: isUni3cLegacy ? 'uni3c' : 'vace',
        videos: cleanedVideos,
        strength: firstVideo.motion_strength ?? 1.0,
      } as Record<string, unknown>;
      
      if (isUni3cLegacy) {
        finalStructureGuidance.step_window = [
          firstVideo.uni3c_start_percent ?? 0,
          firstVideo.uni3c_end_percent ?? 1.0,
        ];
        finalStructureGuidance.frame_policy = 'fit';
        finalStructureGuidance.zero_empty_frames = true;
      } else {
        const preprocessingMap: Record<string, string> = {
          'flow': 'flow', 'canny': 'canny', 'depth': 'depth', 'raw': 'none',
        };
        finalStructureGuidance.preprocessing = preprocessingMap[firstVideo.structure_type ?? 'flow'] ?? 'flow';
      }
      
      console.log('[IndividualTravelSegment] Converted legacy structure_videos to unified format:', {
        target: finalStructureGuidance.target,
        videosCount: cleanedVideos.length,
      });
    }
  }
  
  // Log the structure guidance data being preserved
  console.log('[IndividualTravelSegment] Preserving orchestrator data:', {
    hasStructureGuidance: !!finalStructureGuidance,
    structureGuidanceTarget: finalStructureGuidance?.target,
    structureGuidanceVideosCount: (finalStructureGuidance?.videos as unknown[] | undefined)?.length ?? 0,
    hasSegmentFramesExpanded: !!segmentFramesExpanded,
    segmentFramesExpandedLength: segmentFramesExpanded?.length ?? 0,
    hasFrameOverlapExpanded: !!frameOverlapExpanded,
    frameOverlapExpandedLength: frameOverlapExpanded?.length ?? 0,
    fpsHelpers,
    segmentIndex: params.segment_index,
  });

  const orchestratorDetails: Record<string, any> = {
    ...orchDetailsWithoutOrchestratorRefs,
    // Common identifier for comparing batch vs individual segment generation
    generation_source: 'individual_segment',
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
    
    // Explicitly preserve critical fields for position calculation
    fps_helpers: fpsHelpers,
    // Preserve segment frame counts and overlaps for position calculation
    ...(segmentFramesExpanded ? { segment_frames_expanded: segmentFramesExpanded } : {}),
    ...(frameOverlapExpanded ? { frame_overlap_expanded: frameOverlapExpanded } : {}),
    // UNIFIED FORMAT: Only inject structure_guidance (contains videos inside)
    // NO separate structure_videos array - everything is in structure_guidance.videos
    ...(finalStructureGuidance ? { structure_guidance: finalStructureGuidance } : {}),
  };

  // HARDCODED: SVI (smooth continuations) feature has been removed from UX
  // Always disable SVI - override any inherited value from original orchestrator_details
  orchestratorDetails.use_svi = false;
  delete orchestratorDetails.svi_predecessor_video_url;
  delete orchestratorDetails.svi_strength_1;
  delete orchestratorDetails.svi_strength_2;
  
  // CLEANUP: Remove legacy structure video params that are now replaced by unified structure_guidance
  // These may be inherited from parent orchestrator_details and are no longer needed
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
    delete orchestratorDetails[param];
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
    // UNIFIED FORMAT: Include structure_guidance at top level (contains videos inside)
    // NO separate structure_type - worker reads from structure_guidance.target + preprocessing
    ...(finalStructureGuidance ? { structure_guidance: finalStructureGuidance } : {}),
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
    
    // Image tethering IDs - stored at top level so they're on the generation params
    ...(params.start_image_generation_id && { start_image_generation_id: params.start_image_generation_id }),
    ...(params.end_image_generation_id && { end_image_generation_id: params.end_image_generation_id }),
    ...(params.pair_shot_generation_id && { pair_shot_generation_id: params.pair_shot_generation_id }),
    
    // Post-processing
    after_first_post_generation_saturation: orig.after_first_post_generation_saturation ?? 
      orchDetails.after_first_post_generation_saturation ?? 1,
    after_first_post_generation_brightness: orig.after_first_post_generation_brightness ?? 
      orchDetails.after_first_post_generation_brightness ?? 0,
  };

  // Don't add phase_config at top level - it goes in individual_segment_params (per-segment override)
  // The worker checks individual_segment_params first, then falls back to orchestrator_details

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
    
    // Shot generation IDs for image tethering (video follows its source image on timeline)
    ...(params.start_image_generation_id && { start_image_generation_id: params.start_image_generation_id }),
    ...(params.end_image_generation_id && { end_image_generation_id: params.end_image_generation_id }),
    ...(params.pair_shot_generation_id && { pair_shot_generation_id: params.pair_shot_generation_id }),
    
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

  // Always add phase_config
  individualSegmentParams.phase_config = phaseConfig;

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
 * If no parent_generation_id is provided but shot_id is, a placeholder parent
 * generation will be created and linked to the shot.
 * 
 * @param params - Individual travel segment parameters
 * @returns Promise resolving to the created task
 */
export async function createIndividualTravelSegmentTask(params: IndividualTravelSegmentParams): Promise<TaskCreationResult> {
  console.log("[IndividualTravelSegment] Creating task with params:", {
    project_id: params.project_id,
    parent_generation_id: params.parent_generation_id,
    shot_id: params.shot_id,
    segment_index: params.segment_index,
    hasOriginalParams: !!params.originalParams,
    originalParamsKeys: params.originalParams ? Object.keys(params.originalParams).slice(0, 10) : [],
  });

  try {
    // 1. Validate parameters
    validateIndividualTravelSegmentParams(params);

    // 2. Ensure we have a parent_generation_id (create placeholder if needed)
    let effectiveParentGenerationId = params.parent_generation_id;
    
    if (!effectiveParentGenerationId && params.shot_id) {
      console.log("[IndividualTravelSegment] No parent_generation_id provided, creating placeholder parent");
      
      // Create a placeholder parent generation
      const newParentId = crypto.randomUUID();
      const placeholderParams = {
        tool_type: 'travel-between-images',
        created_from: 'individual_segment_first_generation',
        // Include basic orchestrator_details structure so it shows in segment outputs
        orchestrator_details: {
          num_new_segments_to_generate: 1, // Will be updated as more segments are generated
          input_image_paths_resolved: [params.start_image_url, params.end_image_url],
        },
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
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (parentError) {
        console.error("[IndividualTravelSegment] Error creating placeholder parent:", parentError);
        throw new Error(`Failed to create placeholder parent generation: ${parentError.message}`);
      }
      
      console.log("[IndividualTravelSegment] Created placeholder parent:", newParentId);
      effectiveParentGenerationId = newParentId;
      
      // Link the parent to the shot using the RPC
      const { error: linkError } = await supabase.rpc('add_generation_to_shot', {
        p_shot_id: params.shot_id,
        p_generation_id: newParentId,
        p_with_position: false, // Don't add to timeline position
      });
      
      if (linkError) {
        console.error("[IndividualTravelSegment] Error linking parent to shot:", linkError);
        // Don't fail - the generation was created, just not linked
      } else {
        console.log("[IndividualTravelSegment] Linked parent to shot:", params.shot_id);
      }
    }
    
    if (!effectiveParentGenerationId) {
      throw new Error("Could not determine or create parent_generation_id");
    }

    // 3. Look up existing child to create variant on
    // Priority: pair_shot_generation_id match > child_order match
    // This ensures we regenerate the correct video even if timeline was reordered
    let effectiveChildGenerationId = params.child_generation_id;
    
    console.log("[IndividualTravelSegment] 🔍 CHILD LOOKUP START:", {
      providedChildGenId: params.child_generation_id?.substring(0, 8) || null,
      parentGenId: effectiveParentGenerationId?.substring(0, 8) || null,
      pairShotGenId: params.pair_shot_generation_id?.substring(0, 8) || null,
      segmentIndex: params.segment_index,
      willSkipLookup: !!effectiveChildGenerationId,
    });
    
    if (!effectiveChildGenerationId && effectiveParentGenerationId) {
      // Strategy 1: Look for child with matching pair_shot_generation_id (most accurate)
      // Query the FK column (source of truth with referential integrity)
      if (params.pair_shot_generation_id) {
        console.log("[IndividualTravelSegment] 🔍 Strategy 1: Looking for child by pair_shot_generation_id column...");
        const { data: childByPairId, error: pairIdError } = await supabase
          .from('generations')
          .select('id')
          .eq('parent_generation_id', effectiveParentGenerationId)
          .eq('pair_shot_generation_id', params.pair_shot_generation_id)
          .limit(1)
          .maybeSingle();

        if (pairIdError) {
          console.log("[IndividualTravelSegment] ⚠️ Strategy 1 query error:", pairIdError.message);
        } else if (childByPairId) {
          effectiveChildGenerationId = childByPairId.id;
          console.log("[IndividualTravelSegment] ✅ Strategy 1 SUCCESS - Found child by pair_shot_generation_id column:", {
            parent_generation_id: effectiveParentGenerationId?.substring(0, 8),
            pair_shot_generation_id: params.pair_shot_generation_id?.substring(0, 8),
            existing_child_id: effectiveChildGenerationId?.substring(0, 8),
          });
        } else {
          console.log("[IndividualTravelSegment] ❌ Strategy 1 MISS - No child found with pair_shot_generation_id:", params.pair_shot_generation_id?.substring(0, 8));
        }
      } else {
        console.log("[IndividualTravelSegment] ⏭️ Strategy 1 SKIPPED - No pair_shot_generation_id provided");
      }

      // Strategy 2: Fallback to child_order match (legacy ONLY - skip if pair_shot_generation_id was provided)
      // If pair_shot_generation_id was provided but no match found, we want a NEW child for that pair,
      // not a variant on some unrelated video that happens to have the same child_order
      if (!effectiveChildGenerationId && params.segment_index !== undefined && !params.pair_shot_generation_id) {
        console.log("[IndividualTravelSegment] 🔍 Strategy 2: Looking for child by child_order (legacy fallback)...");
        const { data: childByOrder, error: orderError } = await supabase
          .from('generations')
          .select('id')
          .eq('parent_generation_id', effectiveParentGenerationId)
          .eq('child_order', params.segment_index)
          .limit(1)
          .maybeSingle();

        if (orderError) {
          console.log("[IndividualTravelSegment] ⚠️ Strategy 2 query error:", orderError.message);
        } else if (childByOrder) {
          effectiveChildGenerationId = childByOrder.id;
          console.log("[IndividualTravelSegment] ✅ Strategy 2 SUCCESS - Found child by child_order:", {
            parent_generation_id: effectiveParentGenerationId?.substring(0, 8),
            segment_index: params.segment_index,
            existing_child_id: effectiveChildGenerationId?.substring(0, 8),
          });
        } else {
          console.log("[IndividualTravelSegment] ❌ Strategy 2 MISS - No child found with child_order:", params.segment_index);
        }
      } else if (!effectiveChildGenerationId && params.pair_shot_generation_id) {
        console.log("[IndividualTravelSegment] ⏭️ Strategy 2 SKIPPED - pair_shot_generation_id was provided but no match found, will create NEW child for this pair");
      }
    }
    
    console.log("[IndividualTravelSegment] 🔍 CHILD LOOKUP RESULT:", {
      finalChildGenId: effectiveChildGenerationId?.substring(0, 8) || null,
      willCreateVariant: !!effectiveChildGenerationId,
      willCreateNewChild: !effectiveChildGenerationId,
    });

    // Update params with the effective IDs
    const paramsWithIds = {
      ...params,
      parent_generation_id: effectiveParentGenerationId,
      child_generation_id: effectiveChildGenerationId,
    };

    // 4. Resolve project resolution (use original if available)
    const origResolution = params.originalParams?.parsed_resolution_wh ||
                          params.originalParams?.orchestrator_details?.parsed_resolution_wh;
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id,
      origResolution
    );

    // 5. Build task params matching travel_segment structure
    const taskParams = buildIndividualTravelSegmentParams(paramsWithIds, finalResolution);

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

    // 6. Create task using unified create-task function
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
 * Re-export types and error class for convenience
 */
export { TaskValidationError } from "../taskCreation";
export type { TaskCreationResult } from "../taskCreation";
