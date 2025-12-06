import { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getDisplayUrl } from '@/shared/lib/utils';
// NOTE: resolveImageUrl is no longer needed - location already contains the best version
import { createTravelBetweenImagesTask, type TravelBetweenImagesTaskParams } from '@/shared/lib/tasks/travelBetweenImages';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { DEFAULT_RESOLUTION } from '../utils/dimension-utils';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../state/types';
import { PhaseConfig, PhaseLoraConfig } from '../../../settings';
import { isVideoShotGenerations, type ShotGenerationsLike } from '@/shared/lib/typeGuards';

// ============================================================================
// PHASE CONFIG HELPERS FOR BASIC MODE
// ============================================================================

/**
 * Motion LoRA URL - applied based on Amount of Motion slider
 */
const MOTION_LORA_URL = 'https://huggingface.co/peteromallet/random_junk/resolve/main/14b-i2v.safetensors';

/**
 * Build phase config for basic mode based on structure video presence, motion amount, and user LoRAs.
 * This allows the backend to use a unified phase-based system for all generation modes.
 * 
 * @param useVaceMode - Whether to use VACE mode (true) or I2V mode (false)
 * @param amountOfMotion - 0-100 motion slider value
 * @param userLoras - User-selected LoRAs to add to every phase
 * @returns Object with model name and phase config
 */
export function buildBasicModePhaseConfig(
  hasStructureVideo: boolean,
  amountOfMotion: number,
  userLoras: Array<{ path: string; strength: number }>
): { model: string; phaseConfig: PhaseConfig } {
  
  // Build additional LoRAs array (motion + user-selected)
  const additionalLoras: PhaseLoraConfig[] = [];
  
  // Add motion LoRA if motion > 0 (strength scales with amount of motion)
  if (amountOfMotion > 0) {
    additionalLoras.push({
      url: MOTION_LORA_URL,
      multiplier: (amountOfMotion / 100).toFixed(2)
    });
  }
  
  // Add all user-selected LoRAs
  userLoras.forEach(lora => {
    if (lora.path) {
      additionalLoras.push({
        url: lora.path,
        multiplier: lora.strength.toFixed(2)
      });
    }
  });

  if (hasStructureVideo) {
    // WITH structure video - 3 phases, VACE model
    return {
      model: 'wan_2_2_vace_lightning_baseline_2_2_2',
      phaseConfig: {
        num_phases: 3,
        steps_per_phase: [2, 2, 2],
        flow_shift: 5.0,
        sample_solver: "euler",
        model_switch_phase: 2,
        phases: [
          {
            phase: 1,
            guidance_scale: 3.0,
            loras: [
              { url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors", multiplier: "0.75" },
              ...additionalLoras
            ]
          },
          {
            phase: 2,
            guidance_scale: 1.0,
            loras: [
              { url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors", multiplier: "1.0" },
              ...additionalLoras
            ]
          },
          {
            phase: 3,
            guidance_scale: 1.0,
            loras: [
              { url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors", multiplier: "1.0" },
              ...additionalLoras
            ]
          }
        ]
      }
    };
  } else {
    // WITHOUT structure video - 2 phases, I2V model
    return {
      model: 'wan_2_2_i2v_lightning_baseline_2_2_2',
      phaseConfig: {
        num_phases: 2,
        steps_per_phase: [3, 3],
        flow_shift: 5.0,
        sample_solver: "euler",
        model_switch_phase: 1,
        phases: [
          {
            phase: 1,
            guidance_scale: 1.0,
            loras: [
              { url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors", multiplier: "1.2" },
              ...additionalLoras
            ]
          },
          {
            phase: 2,
            guidance_scale: 1.0,
            loras: [
              { url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors", multiplier: "1.0" },
              ...additionalLoras
            ]
          }
        ]
      }
    };
  }
}

// ============================================================================

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
  
  // Motion settings
  amountOfMotion: number;
  motionMode?: 'basic' | 'presets' | 'advanced';
  
  // Generation type mode (I2V vs VACE)
  generationTypeMode?: 'i2v' | 'vace';
  
  // Advanced mode
  advancedMode: boolean;
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string;
  
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
  console.log('[BasePromptsDebug] ========================================');
  console.log('[BasePromptsDebug] 🚀 GENERATION STARTED');
  console.log('[BasePromptsDebug] Generation mode:', params.generationMode);
  console.log('[BasePromptsDebug] Shot ID:', params.selectedShotId?.substring(0, 8));
  console.log('[BasePromptsDebug] Batch video frames:', params.batchVideoFrames);
  console.log('[BasePromptsDebug] Batch video prompt:', params.batchVideoPrompt);
  console.log('[BasePromptsDebug] ========================================');
  
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
    amountOfMotion: rawAmountOfMotion,
    motionMode,
    generationTypeMode = 'i2v', // Default to I2V if not set
    advancedMode,
    phaseConfig,
    selectedPhasePresetId,
    selectedLoras,
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    variantNameParam,
    clearAllEnhancedPrompts,
  } = params;
  
  // CRITICAL: Ensure amountOfMotion has a valid default value
  // JavaScript destructuring default only applies when property is absent, not when it's undefined
  const amountOfMotion = rawAmountOfMotion ?? 50;

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
  let imageGenerationIds: string[] = []; // Track generation IDs for clickable images in SegmentCard
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

    // Filter and process - location already contains the best version (upscaled if available)
    // Uses canonical isVideoShotGenerations from typeGuards
    const filteredShotGenerations = (freshShotGenerations || [])
      .filter(sg => sg.timeline_frame != null && !isVideoShotGenerations(sg as ShotGenerationsLike))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    // Extract both URLs and generation IDs
    const freshImagesWithIds = filteredShotGenerations.map(sg => {
      const gen = sg.generations as any;
      return {
        location: gen?.location,
        generationId: gen?.id || sg.generation_id // Prefer joined id, fallback to FK
      };
    }).filter(item => Boolean(item.location));

    absoluteImageUrls = freshImagesWithIds
      .map(item => getDisplayUrl(item.location))
      .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg');

    // Extract generation IDs in the same order as URLs
    imageGenerationIds = freshImagesWithIds
      .filter(item => {
        const url = getDisplayUrl(item.location);
        return Boolean(url) && url !== '/placeholder.svg';
      })
      .map(item => item.generationId)
      .filter((id): id is string => Boolean(id));

    console.log('[TaskSubmission] Using fresh image URLs and generation IDs:', {
      count: absoluteImageUrls.length,
      urls: absoluteImageUrls.map(url => url.substring(0, 50) + '...'),
      generationIds: imageGenerationIds.map(id => id.substring(0, 8) + '...'),
      idsMatchUrls: absoluteImageUrls.length === imageGenerationIds.length
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
    console.log('[BasePromptsDebug] ✅ Entered TIMELINE mode branch');
    console.log('[BasePromptsDebug] Will fetch shot_generations from database with metadata');
    
    // Timeline positions are now managed by useEnhancedShotPositions
    // Frame gaps will be extracted from the database-driven positions
    
    // Fetch shot generations with timeline positions from database for timeline generation
    let pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
    let enhancedPrompts: Record<number, string> = {};
    let sortedPositions: Array<{id: string, pos: number}> = [];
    
    try {
      console.log('[BasePromptsDebug] 🔍 Querying shot_generations table for shot:', selectedShotId.substring(0, 8));
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
            type
          )
        `)
        .eq('shot_id', selectedShotId)
        .order('timeline_frame', { ascending: true });

      if (error) {
        console.error('[Generation] Error fetching shot generations:', error);
        console.error('[BasePromptsDebug] ❌ Query failed:', error);
      } else if (shotGenerationsData) {
        console.log('[BasePromptsDebug] ✅ Query returned data');
        console.log('[BasePromptsDebug] Total records from DB:', shotGenerationsData.length);
        console.log('[BasePromptsDebug] Records summary:', shotGenerationsData.map((sg, i) => ({
          index: i,
          id: sg.id?.substring(0, 8),
          generation_id: sg.generation_id?.substring(0, 8),
          timeline_frame: sg.timeline_frame,
          has_metadata: !!sg.metadata,
          has_generations: !!sg.generations
        })));
        
        // Build sorted positions from timeline_frame data
        // CRITICAL: Filter out videos to match absoluteImageUrls filtering
        // MUST match the UI filtering logic exactly (only filter videos, NOT timeline_frame)
        // Uses canonical isVideoShotGenerations from typeGuards
        const filteredShotGenerations = shotGenerationsData.filter(sg => 
          sg.generations && !isVideoShotGenerations(sg as ShotGenerationsLike)
        );

        console.log('[BasePromptsDebug] After filtering out videos:', filteredShotGenerations.length);
        console.log('[BasePromptsDebug] Filtered records:', filteredShotGenerations.map((sg, i) => ({
          index: i,
          id: sg.id?.substring(0, 8),
          timeline_frame: sg.timeline_frame,
          has_metadata: !!sg.metadata
        })));

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
        console.log('[BasePromptsDebug] 📚 Starting to extract pair prompts from database');
        console.log('[BasePromptsDebug] Total filtered generations:', filteredShotGenerations.length);
        console.log('[BasePromptsDebug] Expected pairs:', filteredShotGenerations.length - 1);
        console.log('[BasePromptsDebug] All generation IDs:', filteredShotGenerations.map(g => g.id.substring(0, 8)));
        console.log('[BasePromptsDebug] All timeline frames:', filteredShotGenerations.map(g => g.timeline_frame));
        
        // Log FULL metadata for all items to diagnose the issue
        console.log('[BasePromptsDebug] FULL METADATA DUMP:');
        filteredShotGenerations.forEach((gen, idx) => {
          console.log(`[BasePromptsDebug] Generation ${idx}:`, {
            id: gen.id.substring(0, 8),
            generation_id: gen.generation_id?.substring(0, 8),
            timeline_frame: gen.timeline_frame,
            metadata: gen.metadata,
            has_metadata: !!gen.metadata,
            metadata_type: typeof gen.metadata,
            metadata_keys: gen.metadata ? Object.keys(gen.metadata) : []
          });
        });
        
        for (let i = 0; i < filteredShotGenerations.length - 1; i++) {
          const firstItem = filteredShotGenerations[i];
          const metadata = firstItem.metadata as any;
          
          console.log(`[BasePromptsDebug] 🔍 Pair ${i} (Image ${i} -> Image ${i+1})`);
          console.log(`[BasePromptsDebug]   shotGenId: ${firstItem.id.substring(0, 8)}`);
          console.log(`[BasePromptsDebug]   timeline_frame: ${firstItem.timeline_frame}`);
          console.log(`[BasePromptsDebug]   has_pair_prompt: ${!!metadata?.pair_prompt}`);
          console.log(`[BasePromptsDebug]   pair_prompt value: "${metadata?.pair_prompt || '(none)'}"`);
          console.log(`[BasePromptsDebug]   has_pair_negative_prompt: ${!!metadata?.pair_negative_prompt}`);
          console.log(`[BasePromptsDebug]   pair_negative_prompt value: "${metadata?.pair_negative_prompt || '(none)'}"`);
          console.log(`[BasePromptsDebug]   has_enhanced_prompt: ${!!metadata?.enhanced_prompt}`);
          
          if (metadata?.pair_prompt || metadata?.pair_negative_prompt) {
            pairPrompts[i] = {
              prompt: metadata.pair_prompt || '',
              negativePrompt: metadata.pair_negative_prompt || '',
            };
            console.log(`[BasePromptsDebug] ✅ Loaded pair prompt ${i} from metadata`);
          } else {
            console.log(`[BasePromptsDebug] ⚠️ No custom prompt for pair ${i} - will use default`);
          }
          
          // Extract enhanced prompt if present
          if (metadata?.enhanced_prompt) {
            enhancedPrompts[i] = metadata.enhanced_prompt;
            console.log(`[BasePromptsDebug] ✅ Loaded enhanced prompt ${i} from metadata`);
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

    console.log('[BasePromptsDebug] 🎯 Building prompts array');
    console.log('[BasePromptsDebug] Total gaps:', frameGaps.length);
    console.log('[BasePromptsDebug] Available pair prompts:', Object.keys(pairPrompts).length);
    console.log('[BasePromptsDebug] Pair prompts indexes:', Object.keys(pairPrompts).map(Number));
    console.log('[BasePromptsDebug] Batch video prompt (default):', batchVideoPrompt);
    console.log('[BasePromptsDebug] Full pairPrompts object:', pairPrompts);

    basePrompts = frameGaps.length > 0 ? frameGaps.map((_, index) => {
      // CRITICAL: Only use pair-specific prompt if it exists
      // Send EMPTY STRING if no custom prompt - backend will use base_prompt (singular)
      const pairPrompt = pairPrompts[index]?.prompt;
      const finalPrompt = (pairPrompt && pairPrompt.trim()) ? pairPrompt.trim() : '';
      
      console.log(`[BasePromptsDebug] 📝 Pair ${index}:`);
      console.log(`[BasePromptsDebug]   hasPairPrompt: ${!!pairPrompt}`);
      console.log(`[BasePromptsDebug]   pairPromptRaw: "${pairPrompt || '(none)'}"`);
      console.log(`[BasePromptsDebug]   finalPromptUsed: "${finalPrompt || '(empty - will use base_prompt)'}"`);
      console.log(`[BasePromptsDebug]   isCustom: ${pairPrompt && pairPrompt.trim() ? true : false}`);
      
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
    console.log('[BasePromptsDebug] ⚠️ Entered BATCH mode branch');
    console.log('[BasePromptsDebug] Will query database for pair prompts (just like timeline mode)');
    
    // BATCH MODE: Query database for pair prompts
    // Individual prompts work in BOTH batch and timeline modes!
    let pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
    let enhancedPrompts: Record<number, string> = {};
    
    try {
      console.log('[BasePromptsDebug] 🔍 Querying shot_generations table for shot:', selectedShotId.substring(0, 8));
      const { data: shotGenerationsData, error } = await supabase
        .from('shot_generations')
        .select(`
          id,
          generation_id,
          metadata,
          generations:generation_id (
            id,
            type,
            location
          )
        `)
        .eq('shot_id', selectedShotId)
        .order('timeline_frame', { ascending: true });

      if (error) {
        console.error('[BasePromptsDebug] ❌ Query failed:', error);
      } else if (shotGenerationsData) {
        console.log('[BasePromptsDebug] ✅ Query returned data');
        console.log('[BasePromptsDebug] Total records from DB:', shotGenerationsData.length);
        
        // Filter to get only images (same logic as timeline mode)
        // Uses canonical isVideoShotGenerations from typeGuards
        const filteredShotGenerations = shotGenerationsData.filter(sg => 
          sg.generations && !isVideoShotGenerations(sg as ShotGenerationsLike)
        );
        
        console.log('[BasePromptsDebug] After filtering out videos:', filteredShotGenerations.length);
        console.log('[BasePromptsDebug] Filtered records:', filteredShotGenerations.map((sg, i) => ({
          index: i,
          id: sg.id?.substring(0, 8),
          has_metadata: !!sg.metadata
        })));
        
        // BATCH MODE: Extract pair prompts for ALL pairs (not just first)
        console.log('[BasePromptsDebug] 📚 Extracting pair prompts from metadata');
        console.log('[BasePromptsDebug] Total filtered generations:', filteredShotGenerations.length);
        console.log('[BasePromptsDebug] Expected pairs:', filteredShotGenerations.length - 1);
        
        // Log FULL metadata for all items
        console.log('[BasePromptsDebug] FULL METADATA DUMP:');
        filteredShotGenerations.forEach((gen, idx) => {
          console.log(`[BasePromptsDebug] Generation ${idx}:`, {
            id: gen.id.substring(0, 8),
            generation_id: gen.generation_id?.substring(0, 8),
            metadata: gen.metadata,
            has_metadata: !!gen.metadata,
            metadata_type: typeof gen.metadata,
            metadata_keys: gen.metadata ? Object.keys(gen.metadata) : []
          });
        });
        
        for (let i = 0; i < filteredShotGenerations.length - 1; i++) {
          const firstItem = filteredShotGenerations[i];
          const metadata = firstItem.metadata as any;
          
          console.log(`[BasePromptsDebug] 🔍 Pair ${i} (Image ${i} -> Image ${i+1})`);
          console.log(`[BasePromptsDebug]   shotGenId: ${firstItem.id.substring(0, 8)}`);
          console.log(`[BasePromptsDebug]   has_pair_prompt: ${!!metadata?.pair_prompt}`);
          console.log(`[BasePromptsDebug]   pair_prompt value: "${metadata?.pair_prompt || '(none)'}"`);
          console.log(`[BasePromptsDebug]   has_pair_negative_prompt: ${!!metadata?.pair_negative_prompt}`);
          console.log(`[BasePromptsDebug]   pair_negative_prompt value: "${metadata?.pair_negative_prompt || '(none)'}"`);
          console.log(`[BasePromptsDebug]   has_enhanced_prompt: ${!!metadata?.enhanced_prompt}`);
          
          if (metadata?.pair_prompt || metadata?.pair_negative_prompt) {
            pairPrompts[i] = {
              prompt: metadata.pair_prompt || '',
              negativePrompt: metadata.pair_negative_prompt || '',
            };
            console.log(`[BasePromptsDebug] ✅ Loaded pair prompt ${i} from metadata`);
          } else {
            console.log(`[BasePromptsDebug] ⚠️ No custom prompt for pair ${i} - will use default`);
          }
          
          // Extract enhanced prompt if present
          if (metadata?.enhanced_prompt) {
            enhancedPrompts[i] = metadata.enhanced_prompt;
            console.log(`[BasePromptsDebug] ✅ Loaded enhanced prompt ${i} from metadata`);
          }
        }
        
        // Build arrays with one entry per pair
        const numPairs = filteredShotGenerations.length - 1;
        
        console.log('[BasePromptsDebug] 🎯 Building prompts arrays for batch mode');
        console.log('[BasePromptsDebug] Number of pairs:', numPairs);
        console.log('[BasePromptsDebug] Available custom prompts:', Object.keys(pairPrompts).length);
        
        basePrompts = numPairs > 0 ? Array.from({ length: numPairs }, (_, index) => {
          const pairPrompt = pairPrompts[index]?.prompt;
          const finalPrompt = (pairPrompt && pairPrompt.trim()) ? pairPrompt.trim() : '';
          
          console.log(`[BasePromptsDebug] 📝 Pair ${index}:`);
          console.log(`[BasePromptsDebug]   hasPairPrompt: ${!!pairPrompt}`);
          console.log(`[BasePromptsDebug]   pairPromptRaw: "${pairPrompt || '(none)'}"`);
          console.log(`[BasePromptsDebug]   finalPromptUsed: "${finalPrompt || '(empty - will use base_prompt)'}"`);
          console.log(`[BasePromptsDebug]   isCustom: ${pairPrompt && pairPrompt.trim() ? true : false}`);
          
          return finalPrompt;
        }) : [''];
        
        negativePrompts = numPairs > 0 ? Array.from({ length: numPairs }, (_, index) => {
          const pairNegativePrompt = pairPrompts[index]?.negativePrompt;
          const finalNegativePrompt = (pairNegativePrompt && pairNegativePrompt.trim()) ? pairNegativePrompt.trim() : steerableMotionSettings.negative_prompt;
          
          console.log(`[BasePromptsDebug] 🚫 Pair ${index} negative:`);
          console.log(`[BasePromptsDebug]   hasPairNegativePrompt: ${!!pairNegativePrompt}`);
          console.log(`[BasePromptsDebug]   finalNegativePromptUsed: "${finalNegativePrompt?.substring(0, 30) || '(none)'}"`);
          
          return finalNegativePrompt;
        }) : [steerableMotionSettings.negative_prompt];
        
        enhancedPromptsArray = numPairs > 0 ? Array.from({ length: numPairs }, (_, index) => {
          const enhancedPrompt = enhancedPrompts[index] || '';
          console.log(`[BasePromptsDebug] 🌟 Pair ${index} enhanced:`);
          console.log(`[BasePromptsDebug]   hasEnhancedPrompt: ${!!enhancedPrompt}`);
          console.log(`[BasePromptsDebug]   promptPreview: "${enhancedPrompt ? enhancedPrompt.substring(0, 50) : '(none)'}"`);
          return enhancedPrompt;
        }) : [];
        
        segmentFrames = numPairs > 0 ? Array.from({ length: numPairs }, () => batchVideoFrames) : [batchVideoFrames];
        frameOverlap = numPairs > 0 ? Array.from({ length: numPairs }, () => 10) : [10];
        
        console.log('[BasePromptsDebug] ✅ Final arrays for batch mode:', {
          basePrompts,
          negativePrompts,
          enhancedPrompts: enhancedPromptsArray,
          segmentFrames,
          frameOverlap,
          pairPromptsObject: pairPrompts
        });
      }
    } catch (err) {
      console.error('[BasePromptsDebug] ❌ Error fetching pair prompts:', err);
      // Fallback to old behavior
      basePrompts = [''];
      segmentFrames = [batchVideoFrames];
      frameOverlap = [10];
      negativePrompts = [steerableMotionSettings.negative_prompt];
    }
  }

  // ============================================================================
  // MODEL AND PHASE CONFIG DETERMINATION
  // ============================================================================
  // 
  // We now use phase configs for BOTH basic and advanced mode, unifying the backend.
  // - Basic mode: Phase config is computed based on generationTypeMode (I2V/VACE) + motion + user LoRAs
  // - Advanced mode: User's phase config is used (with LoRA swapping for VACE if needed)
  // 
  // Note: generationTypeMode determines whether to use I2V or VACE mode.
  // If set to 'i2v' but structure video exists, the structure video will NOT be processed.
  // The UI should show a warning in this case, but we respect the user's choice.
  
  let actualModelName: string;
  let effectivePhaseConfig: PhaseConfig;
  let modelType: 'i2v' | 'vace';
  
  // Determine if we're using VACE mode based on generationTypeMode setting
  // Even if structure video exists, if user explicitly chose I2V mode, we use I2V
  const useVaceMode = generationTypeMode === 'vace';
  
  // Log warning if I2V mode is selected but structure video exists
  if (generationTypeMode === 'i2v' && structureVideoPath) {
    console.warn('[Generation] ⚠️ I2V mode selected but structure video exists. Structure video will NOT be used.');
  }
  
  // Convert user LoRAs to the format needed for phase config
  const userLorasForPhaseConfig = (selectedLoras || []).map(l => ({
    path: l.path,
    strength: parseFloat(l.strength?.toString() ?? '0') || 0.0
  }));
  
  // Use advanced mode ONLY if:
  // 1. advancedMode is explicitly true
  // 2. phaseConfig exists
  // 3. motionMode is NOT 'basic' (explicit check to ensure Basic mode UI selection is respected)
  const useAdvancedMode = advancedMode && phaseConfig && motionMode !== 'basic';
  
  console.log('[Generation] Mode decision:', {
    advancedMode,
    hasPhaseConfig: !!phaseConfig,
    motionMode,
    generationTypeMode,
    useVaceMode,
    useAdvancedMode,
    hasStructureVideo: !!structureVideoPath,
    structureVideoWillBeUsed: useVaceMode && !!structureVideoPath,
    amountOfMotion,
    rawAmountOfMotion,
    amountOfMotionDefaultApplied: rawAmountOfMotion == null
  });
  
  if (useAdvancedMode) {
    // ADVANCED MODE: Use user's phase config
    let adjustedPhaseConfig = phaseConfig;
    
    // Determine model based on generationTypeMode (not just structure video presence)
    if (useVaceMode) {
      actualModelName = phaseConfig.num_phases === 2 
        ? 'wan_2_2_vace_lightning_baseline_3_3' 
        : 'wan_2_2_vace_lightning_baseline_2_2_2';
      modelType = 'vace';
      
      // Swap I2V LoRAs to VACE LoRAs if needed
      console.log('[Generation] Advanced mode + VACE - swapping I2V LoRAs to VACE LoRAs');
      adjustedPhaseConfig = {
        ...phaseConfig,
        phases: phaseConfig.phases.map(phase => ({
          ...phase,
          loras: phase.loras.map(lora => {
            // Swap I2V Seko V1 to VACE Seko V2.0
            if (lora.url.includes('Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/high_noise_model.safetensors')) {
              return { ...lora, url: 'https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-rank64-Seko-V2.0/high_noise_model.safetensors' };
            }
            if (lora.url.includes('Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/low_noise_model.safetensors')) {
              return { ...lora, url: 'https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-rank64-Seko-V2.0/low_noise_model.safetensors' };
            }
            return lora;
          })
        }))
      };
    } else {
      actualModelName = phaseConfig.num_phases === 2 
        ? 'wan_2_2_i2v_lightning_baseline_3_3' 
        : 'wan_2_2_i2v_lightning_baseline_2_2_2';
      modelType = 'i2v';
    }
    
    effectivePhaseConfig = adjustedPhaseConfig;
    console.log('[Generation] Advanced Mode - using user phase config:', {
      model: actualModelName,
      modelType,
      numPhases: effectivePhaseConfig.num_phases,
      stepsPerPhase: effectivePhaseConfig.steps_per_phase
    });
    
  } else {
    // BASIC MODE: Build phase config automatically based on generationTypeMode + Amount of Motion
    console.log('[Generation] Using BASIC MODE - building phase config from Amount of Motion');
    
    const basicConfig = buildBasicModePhaseConfig(
      useVaceMode, // Use generationTypeMode instead of structureVideoPath presence
      amountOfMotion,
      userLorasForPhaseConfig
    );
    
    actualModelName = basicConfig.model;
    effectivePhaseConfig = basicConfig.phaseConfig;
    modelType = useVaceMode ? 'vace' : 'i2v';
    
    console.log('[Generation] Basic Mode - built phase config:', {
      model: actualModelName,
      modelType,
      generationTypeMode,
      useVaceMode,
      hasStructureVideo: !!structureVideoPath,
      structureVideoWillBeUsed: useVaceMode && !!structureVideoPath,
      amountOfMotion,
      motionLoraApplied: amountOfMotion > 0,
      motionLoraStrength: amountOfMotion > 0 ? (amountOfMotion / 100).toFixed(2) : 'N/A',
      userLorasCount: userLorasForPhaseConfig.length,
      numPhases: effectivePhaseConfig.num_phases,
      stepsPerPhase: effectivePhaseConfig.steps_per_phase,
      totalLorasPerPhase: effectivePhaseConfig.phases.map(p => p.loras.length)
    });
  }
  
  // Validate phase config before sending (always validate now since we always send it)
  {
    const phasesLength = effectivePhaseConfig.phases?.length || 0;
    const stepsLength = effectivePhaseConfig.steps_per_phase?.length || 0;
    const numPhases = effectivePhaseConfig.num_phases;
    
    // Final validation check before sending to backend
    if (numPhases !== phasesLength || numPhases !== stepsLength) {
      console.error('[PhaseConfigDebug] CRITICAL: Inconsistent phase config about to be sent!', {
        num_phases: numPhases,
        phases_array_length: phasesLength,
        steps_array_length: stepsLength,
        advancedMode,
        ERROR: 'This WILL cause backend validation errors!',
        phases_data: effectivePhaseConfig.phases?.map(p => ({ phase: p.phase, guidance_scale: p.guidance_scale, loras_count: p.loras?.length })),
        steps_per_phase: effectivePhaseConfig.steps_per_phase
      });
      toast.error(`Invalid phase configuration: num_phases (${numPhases}) doesn't match arrays (phases: ${phasesLength}, steps: ${stepsLength}). Please reset to defaults.`);
      return { success: false, error: 'Invalid phase configuration' };
    }
    
    console.log('[PhaseConfigDebug] ✅ Preparing to send phase_config:', {
      mode: advancedMode ? 'advanced' : 'basic',
      num_phases: effectivePhaseConfig.num_phases,
      model_switch_phase: effectivePhaseConfig.model_switch_phase,
      phases_array_length: phasesLength,
      steps_array_length: stepsLength,
      phases_data: effectivePhaseConfig.phases?.map(p => ({ 
        phase: p.phase, 
        guidance_scale: p.guidance_scale, 
        loras_count: p.loras?.length,
        lora_urls: p.loras?.map(l => l.url.split('/').pop())
      })),
      steps_per_phase: effectivePhaseConfig.steps_per_phase,
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
    // Show what we're sending for prompt appending
    base_prompt_singular: batchVideoPrompt,
    base_prompts_array: basePrompts,
    willAppendBasePrompt: enhancePrompt
  });
  
  const requestBody: any = {
    project_id: projectId,
    shot_id: selectedShot.id,
    image_urls: absoluteImageUrls,
    // Include generation IDs for clickable images in SegmentCard
    ...(imageGenerationIds.length > 0 && imageGenerationIds.length === absoluteImageUrls.length 
      ? { image_generation_ids: imageGenerationIds } 
      : {}),
    base_prompts: basePrompts,
    base_prompt: batchVideoPrompt, // Singular - the default/base prompt used for all segments
    segment_frames: segmentFrames,
    frame_overlap: frameOverlap,
    negative_prompts: negativePrompts,
    // CRITICAL: Only include enhanced_prompts if we have actual enhanced prompts to send
    // This prevents the backend from duplicating base_prompt into enhanced_prompts_expanded
    ...(hasValidEnhancedPrompts ? { enhanced_prompts: enhancedPromptsArray } : {}),
    model_name: actualModelName,
    model_type: modelType,
    seed: steerableMotionSettings.seed,
    // Steps are now always in phase_config.steps_per_phase - don't send separately
    debug: steerableMotionSettings.debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
    show_input_images: DEFAULT_STEERABLE_MOTION_SETTINGS.show_input_images,
    enhance_prompt: enhancePrompt,
    // Save UI state settings (dimension_source removed - now using aspect ratios only)
    generation_mode: generationMode,
    random_seed: randomSeed,
    turbo_mode: turboMode,
    // Amount of motion is now embedded in phase_config LoRAs - store for UI restoration only
    amount_of_motion: amountOfMotion / 100.0,
    // UNIFIED: Always send phase_config for consistent backend processing
    // advanced_mode reflects whether user's custom phase config is being used vs computed basic mode
    advanced_mode: useAdvancedMode,
    motion_mode: motionMode, // Motion control mode (basic/presets/advanced) - for UI state
    phase_config: effectivePhaseConfig, // Always send phase config (computed or user-defined)
    regenerate_anchors: false, // Always false
    // Include selected phase preset ID for UI state restoration (only if in advanced mode)
    selected_phase_preset_id: advancedMode && selectedPhasePresetId ? selectedPhasePresetId : undefined,
    // Add generation name if provided
    generation_name: variantNameParam.trim() || undefined,
    // Text before/after prompts
    ...(textBeforePrompts ? { text_before_prompts: textBeforePrompts } : {}),
    ...(textAfterPrompts ? { text_after_prompts: textAfterPrompts } : {}),
    // Always set independent segments to true
    independent_segments: true,
  };

  // Debug log the exact request body being sent
  console.log('[BasePromptsDebug] 📤 REQUEST BODY BEING SENT TO BACKEND:');
  console.log('[BasePromptsDebug]   base_prompts:', requestBody.base_prompts);
  console.log('[BasePromptsDebug]   base_prompts length:', requestBody.base_prompts?.length);
  console.log('[BasePromptsDebug]   base_prompts values:', requestBody.base_prompts?.map((p: string, i: number) => 
    `[${i}]: "${p || '(empty)'}"`
  ));
  console.log('[BasePromptsDebug]   base_prompt (singular):', requestBody.base_prompt);
  console.log('[BasePromptsDebug]   negative_prompts:', requestBody.negative_prompts?.map((p: string, i: number) => 
    `[${i}]: "${p?.substring(0, 30) || '(empty)'}"`
  ));
  console.log('[BasePromptsDebug]   image_urls count:', requestBody.image_urls?.length);
  console.log('[BasePromptsDebug]   segment_frames:', requestBody.segment_frames);
  console.log('[BasePromptsDebug]   phase_config phases:', requestBody.phase_config?.num_phases);

  // NOTE: LoRAs are now ALWAYS in phase_config (for both basic and advanced mode)
  // No separate loras array needed - unified backend processing

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

