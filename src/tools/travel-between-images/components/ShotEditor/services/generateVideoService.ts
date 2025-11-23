import { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getDisplayUrl } from '@/shared/lib/utils';
import { resolveImageUrl } from '@/shared/lib/imageUrlResolver';
import { createTravelBetweenImagesTask, type TravelBetweenImagesTaskParams } from '@/shared/lib/tasks/travelBetweenImages';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { DEFAULT_RESOLUTION } from '../utils/dimension-utils';
import { DEFAULT_STEERABLE_MOTION_SETTINGS, PhaseConfig } from '../state/types';

export interface GenerateVideoParams {
  // Core IDs
  projectId: string;
  selectedShotId: string;
  selectedShot: any; // Shot type
  
  // Query management
  queryClient: QueryClient;
  onShotImagesUpdate?: () => void;
  
  // Resolution/dimensions
  effectiveAspectRatio: string | null;
  
  // Generation mode
  generationMode: 'timeline' | 'batch';
  
  // Prompts
  batchVideoPrompt: string;
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  
  // Video settings
  batchVideoFrames: number;
  batchVideoSteps: number;
  
  // Model settings
  steerableMotionSettings: {
    seed: number;
    debug?: boolean;
    negative_prompt: string;
    model_name: string;
  };
  getModelName: () => string;
  
  // UI state
  randomSeed: boolean;
  turboMode: boolean;
  enhancePrompt: boolean;
  autoCreateIndividualPrompts?: boolean;
  
  // Motion settings
  amountOfMotion: number;
  motionMode?: 'basic' | 'presets' | 'advanced';
  
  // Advanced mode
  advancedMode: boolean;
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string;
  regenerateAnchors?: boolean;
  
  // LoRAs
  selectedLoras: Array<{ id: string; path: string; strength: number; name: string }>;
  
  // Structure video
  structureVideoPath: string | null;
  structureVideoType: 'flow' | 'canny' | 'depth';
  structureVideoTreatment: 'adjust' | 'clip';
  structureVideoMotionStrength: number;
  
  // Generation name
  variantNameParam: string;
  
  // Cleanup function
  clearAllEnhancedPrompts: () => Promise<void>;
}

export interface GenerateVideoResult {
  success: boolean;
  error?: string;
}

/**
 * Generate video task - extracted from ShotEditor's handleGenerateBatch
 * This function handles all the complexity of preparing and submitting a video generation task
 */
export async function generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult> {
  const {
    projectId,
    selectedShotId,
    selectedShot,
    queryClient,
    onShotImagesUpdate,
    effectiveAspectRatio,
    generationMode,
    batchVideoPrompt,
    textBeforePrompts,
    textAfterPrompts,
    batchVideoFrames,
    batchVideoSteps,
    steerableMotionSettings,
    getModelName,
    randomSeed,
    turboMode,
    enhancePrompt,
    autoCreateIndividualPrompts,
    amountOfMotion,
    motionMode,
    advancedMode,
    phaseConfig,
    selectedPhasePresetId,
    regenerateAnchors,
    selectedLoras,
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    variantNameParam,
    clearAllEnhancedPrompts,
  } = params;

  if (!projectId) {
    toast.error('No project selected. Please select a project first.');
    return { success: false, error: 'No project selected' };
  }

  // CRITICAL: Refresh shot data from database before task submission to ensure we have the latest images
  console.log('[TaskSubmission] Refreshing shot data before video generation...');
  try {
    // Invalidate and wait for fresh data
    queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    await queryClient.refetchQueries({ queryKey: ['shots', projectId] });
    
    // Also refresh the shot-specific data if we have the hook available
    if (onShotImagesUpdate) {
      onShotImagesUpdate();
    }
    
    console.log('[TaskSubmission] Shot data refreshed successfully');
    
    // Small delay to ensure state propagation completes
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    console.error('[TaskSubmission] Failed to refresh shot data:', error);
    toast.error('Failed to refresh image data. Please try again.');
    return { success: false, error: 'Failed to refresh shot data' };
  }

  let resolution: string | undefined = undefined;

  // SIMPLIFIED RESOLUTION LOGIC - Only use aspect ratios (no more custom dimensions)
  // Priority 1: Check if shot has an aspect ratio set
  if (selectedShot?.aspect_ratio) {
    resolution = ASPECT_RATIO_TO_RESOLUTION[selectedShot.aspect_ratio];
    console.log('[Resolution] Using shot aspect ratio:', {
      aspectRatio: selectedShot.aspect_ratio,
      resolution
    });
  }

  // Priority 2: If no shot aspect ratio, fall back to project aspect ratio
  if (!resolution && effectiveAspectRatio) {
    resolution = ASPECT_RATIO_TO_RESOLUTION[effectiveAspectRatio];
    console.log('[Resolution] Using project aspect ratio:', {
      aspectRatio: effectiveAspectRatio,
      resolution
    });
  }

  // Priority 3: Use default resolution if nothing else is set
  if (!resolution) {
    resolution = DEFAULT_RESOLUTION;
    console.log('[Resolution] Using default resolution:', resolution);
  }

  // Use getDisplayUrl to convert relative paths to absolute URLs
  // IMPORTANT: Query fresh data directly from database to avoid using stale cached data
  // This prevents deleted items from appearing in the task
  let absoluteImageUrls: string[];
  try {
    console.log('[TaskSubmission] Fetching fresh image data from database for task...');
    const { data: freshShotGenerations, error } = await supabase
      .from('shot_generations')
      .select(`
        id,
        generation_id,
        timeline_frame,
        metadata,
        generations:generation_id (
          id,
          location,
          upscaled_url,
          type
        )
      `)
      .eq('shot_id', selectedShotId)
      .order('timeline_frame', { ascending: true });

    if (error) {
      console.error('[TaskSubmission] Error fetching fresh shot data:', error);
      toast.error('Failed to fetch current images. Please try again.');
      return { success: false, error: 'Failed to fetch shot data' };
    }

    // Filter and process exactly like simpleFilteredImages does
    // IMPORTANT: Now prioritizes upscaled_url when available
    const freshImages = (freshShotGenerations || [])
      .filter(sg => {
        // Has valid timeline frame
        const hasTimelineFrame = sg.timeline_frame !== null && sg.timeline_frame !== undefined;
        if (!hasTimelineFrame) return false;
        
        // Not a video
        const gen = sg.generations as any;
        const isVideo = gen?.type === 'video' ||
                       gen?.type === 'video_travel_output' ||
                       (gen?.location && gen.location.endsWith('.mp4'));
        return !isVideo;
      })
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0))
      .map(sg => {
        const gen = sg.generations as any;
        // Prioritize upscaled URL if available
        return resolveImageUrl(gen?.location, gen?.upscaled_url);
      })
      .filter((location): location is string => Boolean(location));

    absoluteImageUrls = freshImages
      .map((location) => getDisplayUrl(location))
      .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg');

    const upscaledCount = (freshShotGenerations || []).filter(sg => {
      const gen = sg.generations as any;
      return gen?.upscaled_url && gen.upscaled_url.trim();
    }).length;

    console.log('[TaskSubmission] Using fresh image URLs (with upscale priority):', {
      count: absoluteImageUrls.length,
      upscaledCount,
      urls: absoluteImageUrls.map(url => url.substring(0, 50) + '...')
    });
  } catch (err) {
    console.error('[TaskSubmission] Error fetching fresh image data:', err);
    toast.error('Failed to prepare task data. Please try again.');
    return { success: false, error: 'Failed to prepare task data' };
  }

  let basePrompts: string[];
  let segmentFrames: number[];
  let frameOverlap: number[];
  let negativePrompts: string[];
  let enhancedPromptsArray: string[] = [];

  if (generationMode === 'timeline') {
    // Timeline positions are now managed by useEnhancedShotPositions
    // Frame gaps will be extracted from the database-driven positions
    
    // Fetch shot generations with timeline positions from database for timeline generation
    let pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
    let enhancedPrompts: Record<number, string> = {};
    let sortedPositions: Array<{id: string, pos: number}> = [];
    
    try {
      const { data: shotGenerationsData, error } = await supabase
        .from('shot_generations')
        .select(`
          id,
          generation_id,
          timeline_frame,
          metadata,
          generations:generation_id (
            id,
            location,
            upscaled_url,
            type
          )
        `)
        .eq('shot_id', selectedShotId)
        .order('timeline_frame', { ascending: true });

      if (error) {
        console.error('[Generation] Error fetching shot generations:', error);
      } else if (shotGenerationsData) {
        // Build sorted positions from timeline_frame data
        // CRITICAL: Filter out videos to match absoluteImageUrls filtering
        // MUST match the UI filtering logic exactly (only filter videos, NOT timeline_frame)
        const filteredShotGenerations = shotGenerationsData.filter(sg => {
          // Must have a generation
          if (!sg.generations) return false;
          
          // Not a video - must match the filtering logic used for absoluteImageUrls above AND the UI
          const gen = sg.generations as any;
          const isVideo = gen?.type === 'video' ||
                         gen?.type === 'video_travel_output' ||
                         (gen?.location && gen.location.endsWith('.mp4'));
          return !isVideo;
        });

        // Build sorted positions ONLY from items with valid timeline_frame
        // (needed for calculating frame gaps)
        sortedPositions = filteredShotGenerations
          .filter(sg => sg.timeline_frame !== null && sg.timeline_frame !== undefined)
          .map(sg => ({
            id: sg.generation_id || sg.id,
            pos: sg.timeline_frame!
          }))
          .sort((a, b) => a.pos - b.pos);
        
        console.log('[Generation] Timeline mode - Sorted positions from database:', sortedPositions);
        console.log('[Generation] Timeline mode - First image position:', sortedPositions[0]?.pos);
        console.log('[Generation] Timeline mode - All positions:', sortedPositions.map(sp => sp.pos));
        
        // CRITICAL FIX: Extract pair prompts from FILTERED data (not raw data)
        // This ensures pair prompt indexes match the actual image pairs being generated
        console.log('[PairPrompts-LOAD] 📚 Starting to extract pair prompts from database:', {
          totalFilteredGenerations: filteredShotGenerations.length,
          expectedPairs: filteredShotGenerations.length - 1
        });
        
        for (let i = 0; i < filteredShotGenerations.length - 1; i++) {
          const firstItem = filteredShotGenerations[i];
          const metadata = firstItem.metadata as any;
          console.log(`[PairPrompts-LOAD] 🔍 Checking pair ${i}:`, {
            shotGenId: firstItem.id.substring(0, 8),
            timeline_frame: firstItem.timeline_frame,
            has_pair_prompt: !!metadata?.pair_prompt,
            has_pair_negative_prompt: !!metadata?.pair_negative_prompt,
            has_enhanced_prompt: !!metadata?.enhanced_prompt
          });
          
          if (metadata?.pair_prompt || metadata?.pair_negative_prompt) {
            pairPrompts[i] = {
              prompt: metadata.pair_prompt || '',
              negativePrompt: metadata.pair_negative_prompt || '',
            };
            console.log(`[PairPrompts-LOAD] ✅ Loaded pair prompt ${i} from metadata:`, {
              prompt: metadata.pair_prompt || '(none)',
              negativePrompt: metadata.pair_negative_prompt || '(none)',
              shotGenId: firstItem.id.substring(0, 8),
              timeline_frame: firstItem.timeline_frame
            });
          }
          
          // Extract enhanced prompt if present
          if (metadata?.enhanced_prompt) {
            enhancedPrompts[i] = metadata.enhanced_prompt;
            console.log(`[PairPrompts-LOAD] ✅ Loaded enhanced prompt ${i} from metadata:`, {
              enhancedPrompt: metadata.enhanced_prompt,
              shotGenId: firstItem.id.substring(0, 8),
              timeline_frame: firstItem.timeline_frame
            });
          }
        }
        
        console.log('[PairPrompts-LOAD] 📊 Pair prompts loaded from database:', {
          totalPairs: filteredShotGenerations.length - 1,
          customPairs: Object.keys(pairPrompts).length,
          pairPromptIndexes: Object.keys(pairPrompts).map(Number),
          allPairPrompts: pairPrompts,
          enhancedPromptsCount: Object.keys(enhancedPrompts).length,
          enhancedPromptIndexes: Object.keys(enhancedPrompts).map(Number),
          allEnhancedPrompts: enhancedPrompts
        });
      }
    } catch (err) {
      console.error('[Generation] Error fetching shot generations:', err);
    }
    
    // Calculate frame gaps from sorted positions
    const frameGaps = [];
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      const gap = sortedPositions[i + 1].pos - sortedPositions[i].pos;
      frameGaps.push(gap);
      console.log(`[Generation] Gap ${i}: position ${sortedPositions[i].pos} -> ${sortedPositions[i + 1].pos} = ${gap} frames`);
    }
    
    console.log('[Generation] Timeline mode - Calculated frame gaps:', frameGaps);
    console.log('[Generation] Timeline mode - Gap calculation summary:', {
      totalImages: sortedPositions.length,
      totalGaps: frameGaps.length,
      expectedGaps: sortedPositions.length - 1,
      gapsMatch: frameGaps.length === sortedPositions.length - 1
    });

    console.log('[PairPrompts-GENERATION] 🎯 Building prompts array:', {
      totalGaps: frameGaps.length,
      availablePairPrompts: Object.keys(pairPrompts).length,
      pairPromptsIndexes: Object.keys(pairPrompts).map(Number),
      batchVideoPromptDefault: batchVideoPrompt,
      fullPairPromptsObject: pairPrompts
    });

    basePrompts = frameGaps.length > 0 ? frameGaps.map((_, index) => {
      // CRITICAL: Only use pair-specific prompt if it exists
      // Send EMPTY STRING if no custom prompt - backend will use base_prompt (singular)
      const pairPrompt = pairPrompts[index]?.prompt;
      const finalPrompt = (pairPrompt && pairPrompt.trim()) ? pairPrompt.trim() : '';
      console.log(`[PairPrompts-GENERATION] 📝 Pair ${index}:`, {
        hasPairPrompt: !!pairPrompt,
        pairPromptRaw: pairPrompt || '(none)',
        finalPromptUsed: finalPrompt || '(empty - will use base_prompt)',
        isCustom: pairPrompt && pairPrompt.trim() ? true : false
      });
      return finalPrompt;
    }) : [''];
    
    segmentFrames = frameGaps.length > 0 ? frameGaps : [batchVideoFrames];
    frameOverlap = frameGaps.length > 0 ? frameGaps.map(() => 10) : [10]; // Fixed context of 10 frames
    
    negativePrompts = frameGaps.length > 0 ? frameGaps.map((_, index) => {
      // Use pair-specific negative prompt if available, otherwise fall back to default
      const pairNegativePrompt = pairPrompts[index]?.negativePrompt;
      const finalNegativePrompt = (pairNegativePrompt && pairNegativePrompt.trim()) ? pairNegativePrompt.trim() : steerableMotionSettings.negative_prompt;
      console.log(`[PairPrompts-GENERATION] 🚫 Pair ${index} negative:`, {
        hasPairNegativePrompt: !!pairNegativePrompt,
        pairNegativePromptRaw: pairNegativePrompt || '(none)',
        finalNegativePromptUsed: finalNegativePrompt,
        isCustom: pairNegativePrompt && pairNegativePrompt.trim() ? true : false
      });
      return finalNegativePrompt;
    }) : [steerableMotionSettings.negative_prompt];

    // Build enhanced prompts array (empty strings for pairs without enhanced prompts)
    enhancedPromptsArray = frameGaps.length > 0 ? frameGaps.map((_, index) => {
      const enhancedPrompt = enhancedPrompts[index] || '';
      console.log(`[PairPrompts-GENERATION] 🌟 Pair ${index} enhanced:`, {
        hasEnhancedPrompt: !!enhancedPrompt,
        enhancedPromptRaw: enhancedPrompt || '(none)',
        promptPreview: enhancedPrompt ? enhancedPrompt.substring(0, 50) + (enhancedPrompt.length > 50 ? '...' : '') : '(none)'
      });
      return enhancedPrompt;
    }) : [];

    console.log(`[PairPrompts-GENERATION] ✅ Final prompts array:`, {
      basePrompts,
      negativePrompts,
      enhancedPrompts: enhancedPromptsArray,
      pairPromptsObject: pairPrompts,
      summary: basePrompts.map((prompt, idx) => ({
        pairIndex: idx,
        promptPreview: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
        isCustom: prompt !== batchVideoPrompt,
        hasEnhancedPrompt: !!enhancedPromptsArray[idx]
      }))
    });

    console.log(`[Generation] Timeline mode - Final prompts:`, { basePrompts, negativePrompts, pairPrompts, enhancedPrompts, enhancedPromptsArray });
  } else {
    // batch mode - send empty string, backend will use base_prompt
    basePrompts = [''];
    segmentFrames = [batchVideoFrames];
    frameOverlap = [10]; // Fixed context of 10 frames
    negativePrompts = [steerableMotionSettings.negative_prompt];
  }

  // Determine model name based on structure video presence
  let actualModelName = getModelName();
  let modelType = 'i2v';
  
  // If there is a structure video, use VACE model
  if (structureVideoPath) {
    if (actualModelName.includes('baseline_3_3')) {
      actualModelName = 'wan_2_2_vace_lightning_baseline_3_3';
    } else {
      actualModelName = 'wan_2_2_vace_lightning_baseline_2_2_2';
    }
    modelType = 'vace';
    console.log('[Generation] Structure video present - using VACE model:', actualModelName);
  } else {
    // No structure video - use I2V model
    if (actualModelName.includes('baseline_3_3')) {
      actualModelName = 'wan_2_2_i2v_lightning_baseline_3_3';
    } else {
      actualModelName = 'wan_2_2_i2v_lightning_baseline_2_2_2';
    }
    modelType = 'i2v';
    console.log('[Generation] No structure video - using I2V model:', actualModelName);
  }
  
  // Validate and debug log phase config before sending
  if (advancedMode && phaseConfig) {
    const phasesLength = phaseConfig.phases?.length || 0;
    const stepsLength = phaseConfig.steps_per_phase?.length || 0;
    const numPhases = phaseConfig.num_phases;
    
    // Final validation check before sending to backend
    if (numPhases !== phasesLength || numPhases !== stepsLength) {
      console.error('[PhaseConfigDebug] CRITICAL: Inconsistent phase config about to be sent!', {
        num_phases: numPhases,
        phases_array_length: phasesLength,
        steps_array_length: stepsLength,
        ERROR: 'This WILL cause backend validation errors!',
        phases_data: phaseConfig.phases?.map(p => ({ phase: p.phase, guidance_scale: p.guidance_scale, loras_count: p.loras?.length })),
        steps_per_phase: phaseConfig.steps_per_phase
      });
      toast.error(`Invalid phase configuration: num_phases (${numPhases}) doesn't match arrays (phases: ${phasesLength}, steps: ${stepsLength}). Please reset to defaults.`);
      return { success: false, error: 'Invalid phase configuration' };
    }
    
    console.log('[PhaseConfigDebug] Preparing to send phase_config:', {
      num_phases: phaseConfig.num_phases,
      model_switch_phase: phaseConfig.model_switch_phase,
      phases_array_length: phasesLength,
      steps_array_length: stepsLength,
      phases_data: phaseConfig.phases?.map(p => ({ phase: p.phase, guidance_scale: p.guidance_scale, loras_count: p.loras?.length })),
      steps_per_phase: phaseConfig.steps_per_phase,
      VALIDATION: 'PASSED'
    });
  }
  
  // CRITICAL: Filter out empty enhanced prompts to prevent backend from duplicating base_prompt
  // Only send enhanced_prompts if we have actual non-empty enhanced prompts from metadata
  const hasValidEnhancedPrompts = enhancedPromptsArray.some(prompt => prompt && prompt.trim().length > 0);
  
  console.log('[EnhancedPrompts-Safety] Checking enhanced prompts:', {
    enhancedPromptsArrayLength: enhancedPromptsArray.length,
    hasValidEnhancedPrompts,
    enhancedPromptsPreview: enhancedPromptsArray.map((p, i) => ({ 
      index: i, 
      hasContent: !!p && p.trim().length > 0,
      preview: p ? p.substring(0, 30) + '...' : '(empty)'
    })),
    enhancePromptFlag: enhancePrompt,
    autoCreateIndividualPromptsFlag: autoCreateIndividualPrompts,
    // Show what we're sending for prompt appending
    base_prompt_singular: batchVideoPrompt,
    base_prompts_array: basePrompts,
    willAppendBasePrompt: enhancePrompt
  });
  
  const requestBody: any = {
    project_id: projectId,
    shot_id: selectedShot.id,
    image_urls: absoluteImageUrls,
    base_prompts: basePrompts,
    base_prompt: batchVideoPrompt, // Singular - the default/base prompt that gets appended when autoCreateIndividualPrompts is enabled
    segment_frames: segmentFrames,
    frame_overlap: frameOverlap,
    negative_prompts: negativePrompts,
    // CRITICAL: Only include enhanced_prompts if we have actual enhanced prompts to send
    // This prevents the backend from duplicating base_prompt into enhanced_prompts_expanded
    ...(hasValidEnhancedPrompts ? { enhanced_prompts: enhancedPromptsArray } : {}),
    model_name: actualModelName,
    model_type: modelType,
    seed: steerableMotionSettings.seed,
    // Only include steps if NOT in Advanced Mode (Advanced Mode uses steps_per_phase in phase_config)
    ...(advancedMode ? {} : { steps: batchVideoSteps }),
    debug: steerableMotionSettings.debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
    show_input_images: DEFAULT_STEERABLE_MOTION_SETTINGS.show_input_images,
    enhance_prompt: enhancePrompt,
    // Save UI state settings (dimension_source removed - now using aspect ratios only)
    generation_mode: generationMode,
    random_seed: randomSeed,
    turbo_mode: turboMode,
    // Only include amount_of_motion if NOT in Advanced Mode
    ...(advancedMode ? {} : { amount_of_motion: amountOfMotion / 100.0 }),
    // Advanced mode flag and phase config
    advanced_mode: advancedMode,
    motion_mode: motionMode, // Motion control mode (basic/presets/advanced)
    phase_config: advancedMode && phaseConfig ? phaseConfig : undefined,
    // Include regenerate_anchors if in Advanced Mode
    ...(advancedMode && regenerateAnchors !== undefined ? { regenerate_anchors: regenerateAnchors } : {}),
    // Include selected phase preset ID for UI state restoration
    selected_phase_preset_id: advancedMode && selectedPhasePresetId ? selectedPhasePresetId : undefined,
    // Add generation name if provided
    generation_name: variantNameParam.trim() || undefined,
    // Text before/after prompts
    ...(textBeforePrompts ? { text_before_prompts: textBeforePrompts } : {}),
    ...(textAfterPrompts ? { text_after_prompts: textAfterPrompts } : {}),
    // Always set independent segments to true
    independent_segments: true,
  };

  // Only add regular LoRAs if Advanced Mode is OFF
  // In Advanced Mode, LoRAs are defined per-phase in phase_config
  if (!advancedMode) {
    const loras = [];
    
    // Add user-selected LoRAs
    if (selectedLoras && selectedLoras.length > 0) {
      loras.push(...selectedLoras.map(l => ({ 
        path: l.path, 
        strength: parseFloat(l.strength?.toString() ?? '0') || 0.0 
      })));
    }
    
    // In basic mode, add the motion control LoRA based on the Amount of Motion slider
    if (motionMode === 'basic' && amountOfMotion > 0) {
      loras.push({
        path: 'https://huggingface.co/peteromallet/random_junk/resolve/main/motion_scale_000006500_high_noise.safetensors',
        strength: amountOfMotion / 100.0
      });
    }
    
    if (loras.length > 0) {
      requestBody.loras = loras;
    }
  }

  if (resolution) {
    requestBody.resolution = resolution;
  }

  // Add structure video params if available
  console.log('[Generation] [DEBUG] Structure video state at generation time:', {
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    willAddToRequest: !!structureVideoPath
  });
  
  if (structureVideoPath) {
    console.log('[Generation] Adding structure video to task:', {
      videoPath: structureVideoPath,
      treatment: structureVideoTreatment,
      motionStrength: structureVideoMotionStrength,
      structureType: structureVideoType
    });
    requestBody.structure_video_path = structureVideoPath;
    requestBody.structure_video_treatment = structureVideoTreatment;
    requestBody.structure_video_motion_strength = structureVideoMotionStrength;
    requestBody.structure_video_type = structureVideoType;
  }
  
  // Debug logging for enhance_prompt parameter and enhanced_prompts array
  console.log("[EnhancePromptDebug] ⚠️ ShotEditor - Value being sent to task creation:", {
    enhancePrompt_from_props: enhancePrompt,
    requestBody_enhance_prompt: requestBody.enhance_prompt,
    VALUES_MATCH: enhancePrompt === requestBody.enhance_prompt,
    autoCreateIndividualPrompts,
    NOTE: 'autoCreateIndividualPrompts is DIFFERENT from enhancePrompt!',
    // CRITICAL: Verify enhanced_prompts is NOT being sent when empty
    enhanced_prompts_included_in_request: 'enhanced_prompts' in requestBody,
    enhanced_prompts_array_length: requestBody.enhanced_prompts?.length || 0,
    enhanced_prompts_preview: requestBody.enhanced_prompts?.map((p: string, i: number) => ({
      index: i,
      preview: p ? p.substring(0, 30) + '...' : '(empty)',
      length: p?.length || 0
    })) || 'NOT_INCLUDED',
    WARNING: enhancePrompt === false && requestBody.enhance_prompt === true ? '❌ MISMATCH DETECTED! requestBody has true but prop is false' : '✅ Values match'
  });
  
  try {
    // IMPORTANT: If enhance_prompt is false, clear all existing enhanced prompts
    // This ensures we don't use stale enhanced prompts from previous generations
    if (!enhancePrompt) {
      console.log("[generateVideoService] enhance_prompt is false - clearing all enhanced prompts before task submission");
      try {
        await clearAllEnhancedPrompts();
        console.log("[generateVideoService] ✅ Successfully cleared all enhanced prompts");
      } catch (clearError) {
        console.error("[generateVideoService] ⚠️ Failed to clear enhanced prompts:", clearError);
        // Continue with task submission even if clearing fails (non-critical)
      }
    }
    // Use the new client-side travel between images task creation instead of calling the edge function
    await createTravelBetweenImagesTask(requestBody as TravelBetweenImagesTaskParams);
    
    return { success: true };
  } catch (error) {
    console.error('Error creating video generation task:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    toast.error(`Failed to create video generation task: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

