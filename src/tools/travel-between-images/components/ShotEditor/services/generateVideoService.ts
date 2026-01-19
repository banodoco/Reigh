import { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getDisplayUrl } from '@/shared/lib/utils';
// NOTE: resolveImageUrl is no longer needed - location already contains the best version
import {
  createTravelBetweenImagesTask,
  type TravelBetweenImagesTaskParams,
  type VideoStructureApiParams,
  type VideoMotionApiParams,
  type VideoModelApiParams,
  type VideoPromptApiParams,
  type PromptConfig,
  type MotionConfig,
  type ModelConfig,
  type StructureVideoConfig as ApiStructureVideoConfig,
  type StructureVideoConfigWithMetadata,
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
  DEFAULT_VIDEO_MOTION_PARAMS,
  DEFAULT_PROMPT_CONFIG,
  DEFAULT_MOTION_CONFIG,
  DEFAULT_MODEL_CONFIG,
} from '@/shared/lib/tasks/travelBetweenImages';
import {
  type LegacyStructureVideoConfig as StructureVideoConfig,
  DEFAULT_STRUCTURE_VIDEO_CONFIG,
} from '../hooks/useStructureVideo';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { DEFAULT_RESOLUTION } from '../utils/dimension-utils';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../state/types';
import { PhaseConfig, PhaseLoraConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '../../../settings';
import { isVideoShotGenerations, type ShotGenerationsLike } from '@/shared/lib/typeGuards';

// Re-export API types for UI code to use
export type {
  TravelBetweenImagesTaskParams,
  VideoStructureApiParams,
  VideoMotionApiParams,
  VideoModelApiParams,
  VideoPromptApiParams,
  PromptConfig,
  MotionConfig,
  ModelConfig,
  StructureVideoConfig,
};
export {
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
  DEFAULT_VIDEO_MOTION_PARAMS,
  DEFAULT_PROMPT_CONFIG,
  DEFAULT_MOTION_CONFIG,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_STRUCTURE_VIDEO_CONFIG,
};

// ============================================================================
// MASTER TIMELINE STATE LOG - For debugging FE vs BE discrepancies
// ============================================================================

/**
 * Logs a comprehensive summary of the timeline state at generation time.
 * This allows direct comparison between what's shown in the UI and what's submitted to the backend.
 * 
 * Call this right before task submission to see the exact data being sent.
 */
export function logTimelineMasterState(params: {
  shotId: string;
  shotName?: string;
  generationMode: 'batch' | 'timeline';
  // Timeline images
  images: Array<{
    shotGenId: string;
    generationId: string;
    timelineFrame: number | null;
    location: string;
  }>;
  // Calculated pairs/segments
  segments: Array<{
    pairIndex: number;
    startImageId: string;
    endImageId: string;
    startFrame: number;
    endFrame: number;
    frameCount: number;
    basePrompt: string;
    negativePrompt: string;
    enhancedPrompt: string;
    hasCustomPrompt: boolean;
    hasEnhancedPrompt: boolean;
  }>;
  // Structure videos
  structureVideos: Array<{
    index: number;
    path: string;
    startFrame: number;
    endFrame: number;
    treatment: string;
    motionStrength: number;
    structureType: string;
    affectedSegments: number[]; // Which pair indexes this video affects
  }>;
  // Settings
  settings: {
    basePrompt: string;
    defaultNegativePrompt: string;
    amountOfMotion: number;
    motionMode: string;
    advancedMode: boolean;
    turboMode: boolean;
    enhancePrompt: boolean;
    modelName: string;
    modelType: string;
    resolution?: string;
    loras: Array<{ name: string; path: string; strength: number }>;
  };
  // Total frame info
  totalFrames: number;
  totalDurationSeconds: number;
}) {
  const TAG = '[TIMELINE_MASTER_STATE]';
  const divider = '═'.repeat(80);
  const sectionDivider = '─'.repeat(60);
  
  console.log(`\n${divider}`);
  console.log(`${TAG} 📊 TIMELINE MASTER STATE SUMMARY`);
  console.log(`${TAG} Shot: ${params.shotName || 'Unknown'} (${params.shotId.substring(0, 8)})`);
  console.log(`${TAG} Mode: ${params.generationMode.toUpperCase()}`);
  console.log(`${TAG} Timestamp: ${new Date().toISOString()}`);
  console.log(divider);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: TIMELINE IMAGES
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} 🖼️  TIMELINE IMAGES (${params.images.length} images)`);
  console.log(sectionDivider);
  console.log(`${TAG} ${'#'.padStart(3)} | ${'Frame'.padStart(6)} | ${'ShotGen ID'.padEnd(10)} | ${'Gen ID'.padEnd(10)} | Location`);
  console.log(sectionDivider);
  
  params.images.forEach((img, i) => {
    const frameStr = img.timelineFrame !== null ? String(img.timelineFrame).padStart(6) : '  NULL';
    const locationShort = img.location.length > 40 ? '...' + img.location.slice(-37) : img.location;
    console.log(`${TAG} ${String(i).padStart(3)} | ${frameStr} | ${img.shotGenId.substring(0, 10)} | ${img.generationId.substring(0, 10)} | ${locationShort}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: SEGMENTS (PAIRS)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} 🎬 SEGMENTS / PAIRS (${params.segments.length} segments)`);
  console.log(sectionDivider);
  
  params.segments.forEach((seg) => {
    const promptPreview = seg.basePrompt 
      ? (seg.basePrompt.length > 50 ? seg.basePrompt.substring(0, 47) + '...' : seg.basePrompt)
      : '(using default)';
    const enhancedPreview = seg.enhancedPrompt
      ? (seg.enhancedPrompt.length > 50 ? seg.enhancedPrompt.substring(0, 47) + '...' : seg.enhancedPrompt)
      : '';
    
    console.log(`${TAG} ┌─ Segment ${seg.pairIndex}: Frame ${seg.startFrame} → ${seg.endFrame} (${seg.frameCount} frames, ~${(seg.frameCount / 24).toFixed(1)}s)`);
    console.log(`${TAG} │  Images: ${seg.startImageId.substring(0, 8)} → ${seg.endImageId.substring(0, 8)}`);
    console.log(`${TAG} │  Prompt: ${seg.hasCustomPrompt ? '✏️ CUSTOM: ' : '📝 DEFAULT: '}${promptPreview}`);
    if (seg.hasEnhancedPrompt) {
      console.log(`${TAG} │  Enhanced: ✨ ${enhancedPreview}`);
    }
    if (seg.negativePrompt && seg.negativePrompt !== params.settings.defaultNegativePrompt) {
      const negPreview = seg.negativePrompt.length > 40 ? seg.negativePrompt.substring(0, 37) + '...' : seg.negativePrompt;
      console.log(`${TAG} │  Negative: 🚫 CUSTOM: ${negPreview}`);
    }
    console.log(`${TAG} └${sectionDivider.substring(0, 20)}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: STRUCTURE VIDEOS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} 🎥 STRUCTURE VIDEOS (${params.structureVideos.length} videos)`);
  console.log(sectionDivider);
  
  if (params.structureVideos.length === 0) {
    console.log(`${TAG}   (No structure videos configured - using I2V mode)`);
  } else {
    params.structureVideos.forEach((sv) => {
      const pathShort = sv.path.length > 50 ? '...' + sv.path.slice(-47) : sv.path;
      console.log(`${TAG} ┌─ Structure Video ${sv.index}:`);
      console.log(`${TAG} │  Path: ${pathShort}`);
      console.log(`${TAG} │  Output Range: Frame ${sv.startFrame} → ${sv.endFrame} (${sv.endFrame - sv.startFrame} frames)`);
      console.log(`${TAG} │  Type: ${sv.structureType} | Treatment: ${sv.treatment} | Motion: ${sv.motionStrength}`);
      console.log(`${TAG} │  Affects Segments: ${sv.affectedSegments.length > 0 ? sv.affectedSegments.join(', ') : '(all)'}`);
      console.log(`${TAG} └${sectionDivider.substring(0, 20)}`);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} ⚙️  SETTINGS`);
  console.log(sectionDivider);
  console.log(`${TAG}   Model: ${params.settings.modelName} (${params.settings.modelType})`);
  console.log(`${TAG}   Resolution: ${params.settings.resolution || '(auto)'}`);
  console.log(`${TAG}   Motion: ${params.settings.amountOfMotion}% | Mode: ${params.settings.motionMode} | Advanced: ${params.settings.advancedMode}`);
  console.log(`${TAG}   Turbo: ${params.settings.turboMode} | Enhance Prompt: ${params.settings.enhancePrompt}`);
  console.log(`${TAG}   Base Prompt: "${params.settings.basePrompt.length > 60 ? params.settings.basePrompt.substring(0, 57) + '...' : params.settings.basePrompt}"`);
  
  if (params.settings.loras.length > 0) {
    console.log(`${TAG}   LoRAs (${params.settings.loras.length}):`);
    params.settings.loras.forEach((lora) => {
      console.log(`${TAG}     - ${lora.name}: ${lora.strength} (${lora.path.substring(0, 40)}...)`);
    });
  } else {
    console.log(`${TAG}   LoRAs: (none)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} 📈 SUMMARY`);
  console.log(sectionDivider);
  console.log(`${TAG}   Total Images: ${params.images.length}`);
  console.log(`${TAG}   Total Segments: ${params.segments.length}`);
  console.log(`${TAG}   Total Frames: ${params.totalFrames} (~${params.totalDurationSeconds.toFixed(1)}s at 24fps)`);
  console.log(`${TAG}   Structure Videos: ${params.structureVideos.length}`);
  
  // Calculate custom vs default prompts
  const customPromptCount = params.segments.filter(s => s.hasCustomPrompt).length;
  const enhancedPromptCount = params.segments.filter(s => s.hasEnhancedPrompt).length;
  console.log(`${TAG}   Custom Prompts: ${customPromptCount}/${params.segments.length}`);
  console.log(`${TAG}   Enhanced Prompts: ${enhancedPromptCount}/${params.segments.length}`);
  
  console.log(`\n${divider}\n`);
}

// ============================================================================
// PHASE CONFIG HELPERS FOR BASIC MODE
// ============================================================================

/**
 * Motion LoRA URL - applied based on Amount of Motion slider
 */
const MOTION_LORA_URL = 'https://huggingface.co/peteromallet/random_junk/resolve/main/14b-i2v.safetensors';

/**
 * Build phase config for basic mode based on structure video presence, motion amount, and user LoRAs.
 * Uses DEFAULT_PHASE_CONFIG and DEFAULT_VACE_PHASE_CONFIG from settings.ts as the base configs.
 *
 * For multi-stage LoRAs (Wan 2.2 I2V):
 * - High-noise LoRA (path) is applied to early phases (phase 0, 1 for 3-phase; phase 0 for 2-phase)
 * - Low-noise LoRA (lowNoisePath) is applied to the final phase
 *
 * @param hasStructureVideo - Whether a structure video is set
 * @param amountOfMotion - 0-100 motion slider value
 * @param userLoras - User-selected LoRAs to add to phases (with optional multi-stage support)
 * @param structureType - Structure type determines mode: 'uni3c' uses I2V model, others use VACE model
 * @returns Object with model name and phase config
 */
export function buildBasicModePhaseConfig(
  hasStructureVideo: boolean,
  amountOfMotion: number,
  userLoras: Array<{ path: string; strength: number; lowNoisePath?: string; isMultiStage?: boolean }>,
  structureType?: 'uni3c' | 'flow' | 'canny' | 'depth'
): { model: string; phaseConfig: PhaseConfig } {

  // Check if using uni3c mode (I2V with guidance video)
  const isUni3c = structureType === 'uni3c' && hasStructureVideo;

  // Get base config from settings.ts (single source of truth)
  // Uni3C mode: uses I2V config (same as standard I2V)
  // VACE mode: use DEFAULT_VACE_PHASE_CONFIG
  // Standard I2V mode: use DEFAULT_PHASE_CONFIG
  const baseConfig = (hasStructureVideo && !isUni3c)
    ? DEFAULT_VACE_PHASE_CONFIG 
    : DEFAULT_PHASE_CONFIG;
  
  // Model selection:
  // Uni3C mode: use I2V model (wan_2_2_i2v_lightning_baseline_2_2_2)
  // VACE mode: use VACE model
  // Standard I2V mode: use I2V model
  const model = isUni3c
    ? 'wan_2_2_i2v_lightning_baseline_2_2_2'
    : (hasStructureVideo
      ? 'wan_2_2_vace_lightning_baseline_2_2_2'
      : 'wan_2_2_i2v_lightning_baseline_2_2_2');

  const totalPhases = baseConfig.phases.length;

  // DEEP CLONE: Create completely new phase config with new LoRA objects
  // This prevents shared references that cause strength changes to affect multiple phases
  const phaseConfig: PhaseConfig = {
    ...baseConfig,
    steps_per_phase: [...baseConfig.steps_per_phase], // Clone array
    phases: baseConfig.phases.map((phase, phaseIndex) => {
      const isLastPhase = phaseIndex === totalPhases - 1;

      // Build additional LoRAs for THIS phase (new objects for each phase!)
      const additionalLoras: PhaseLoraConfig[] = [];

      // Add motion LoRA if motion > 0 (strength scales with amount of motion)
      if (amountOfMotion > 0) {
        additionalLoras.push({
          url: MOTION_LORA_URL,
          multiplier: (amountOfMotion / 100).toFixed(2)
        });
      }

      // Add user-selected LoRAs with multi-stage support
      userLoras.forEach(lora => {
        const multiplier = lora.strength.toFixed(2);

        if (lora.isMultiStage) {
          // Multi-stage LoRA: route to correct phase based on available URLs
          const hasHighNoise = !!lora.path; // High noise stored in path
          const hasLowNoise = !!lora.lowNoisePath;

          if (isLastPhase) {
            // Final phase: use low_noise LoRA if available
            if (hasLowNoise) {
              additionalLoras.push({
                url: lora.lowNoisePath!,
                multiplier
              });
            }
            // If only high_noise exists, don't apply anything to final phase
          } else {
            // Early phases: use high_noise LoRA if available
            if (hasHighNoise) {
              additionalLoras.push({
                url: lora.path,
                multiplier
              });
            }
            // If only low_noise exists, don't apply anything to early phases
          }
        } else {
          // Single-stage LoRA: apply to all phases (existing behavior)
          if (lora.path) {
            additionalLoras.push({
              url: lora.path,
              multiplier
            });
          }
        }
      });

      return {
        ...phase,
        // Deep clone each base LoRA object, then add new additional LoRAs
        loras: [
          ...phase.loras.map(l => ({ ...l })), // Deep clone base LoRAs
          ...additionalLoras // These are already new objects per phase
        ]
      };
    })
  };

  return { model, phaseConfig };
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

  // Grouped configs (snake_case matching API)
  promptConfig: PromptConfig;
  motionConfig: MotionConfig;
  modelConfig: ModelConfig;
  /** Legacy single-video config (deprecated - use structureVideos instead) */
  structureVideoConfig: StructureVideoConfig;
  /** NEW: Array of structure videos for multi-video support */
  structureVideos?: StructureVideoConfigWithMetadata[];

  // Video settings (used for fallback computation, not direct API params)
  batchVideoFrames: number;

  // LoRAs
  selectedLoras: Array<{ id: string; path: string; strength: number; name: string }>;

  // Generation name
  variantNameParam: string;

  // Cleanup function
  clearAllEnhancedPrompts: () => Promise<void>;

  // Uni3C settings (only used when structure_video_type is 'uni3c')
  uni3cEndPercent?: number;
  
  // Parent generation ID - if provided, new segments will be children of this generation
  // instead of creating a new parent. Used when regenerating under a selected output.
  parentGenerationId?: string;
}

export interface GenerateVideoResult {
  success: boolean;
  error?: string;
  /** The parent generation ID (either provided or newly created) */
  parentGenerationId?: string;
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
  console.log('[BasePromptsDebug] Batch video prompt:', params.promptConfig.base_prompt);
  console.log('[BasePromptsDebug] ========================================');

  // [ParentReuseDebug] Log the parentGenerationId received by generateVideo
  console.log('[ParentReuseDebug] === generateVideo SERVICE ===');
  console.log('[ParentReuseDebug] params.parentGenerationId:', params.parentGenerationId?.substring(0, 8) || 'undefined');

  const {
    projectId,
    selectedShotId,
    selectedShot,
    queryClient,
    onShotImagesUpdate,
    effectiveAspectRatio,
    generationMode,
    promptConfig,
    motionConfig,
    modelConfig,
    structureVideoConfig,
    batchVideoFrames,
    selectedLoras,
    variantNameParam,
    clearAllEnhancedPrompts,
    parentGenerationId,
  } = params;

  // Destructure prompt config for convenience (snake_case matches API)
  const {
    base_prompt: batchVideoPrompt,
    enhance_prompt: enhancePrompt,
    text_before_prompts: textBeforePrompts,
    text_after_prompts: textAfterPrompts,
    default_negative_prompt: defaultNegativePrompt,
  } = promptConfig;

  // Destructure motion config
  const {
    amount_of_motion: rawAmountOfMotion,
    motion_mode: motionMode,
    advanced_mode: advancedMode,
    phase_config: phaseConfig,
    selected_phase_preset_id: selectedPhasePresetId,
  } = motionConfig;

  // Destructure model config
  const {
    seed,
    random_seed: randomSeed,
    turbo_mode: turboMode,
    debug,
    generation_type_mode: generationTypeMode,
    // HARDCODED: SVI (smooth continuations) feature has been removed from UX
    // Ignore any persisted value and always use false
    use_svi: _ignoredUseSvi,
  } = modelConfig;
  
  // SVI is always disabled - feature removed from UX
  const useSvi = false;

  // CRITICAL: Ensure amountOfMotion has a valid default value
  // JavaScript destructuring default only applies when property is absent, not when it's undefined
  const amountOfMotion = rawAmountOfMotion ?? 50;

  if (!projectId) {
    toast.error('No project selected. Please select a project first.');
    return { success: false, error: 'No project selected' };
  }

  // Wait for any pending mutations (add/reorder/delete images) to complete before submitting task
  // This prevents race conditions where the user adds/reorders images and immediately clicks Generate,
  // causing the task to be submitted with stale data (before the mutation commits to the database)
  const mutationCache = queryClient.getMutationCache();
  const pendingMutations = mutationCache.getAll().filter(m => m.state.status === 'pending');

  if (pendingMutations.length > 0) {
    console.log('[TaskSubmission] ⏳ Awaiting', pendingMutations.length, 'pending mutations...');

    const startTime = Date.now();
    // Await all pending mutations directly (with 1s safety cap)
    await Promise.race([
      Promise.all(pendingMutations.map(m => m.state.promise?.catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);

    const elapsed = Date.now() - startTime;
    const stillPending = mutationCache.getAll().filter(m => m.state.status === 'pending').length;

    if (stillPending > 0) {
      console.warn('[TaskSubmission] ⚠️', stillPending, 'mutations still pending after 1s, proceeding anyway');
    } else {
      console.log('[TaskSubmission] ✅ All mutations completed in', elapsed, 'ms');
    }
  }

  // Note: We query the database directly below (not from cache), so no need to refresh React Query cache here

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
  let pairShotGenerationIds: string[] = []; // Track shot_generations.id for video-to-timeline tethering
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

    // Extract URLs, generation IDs, and shot_generation IDs
    const freshImagesWithIds = filteredShotGenerations.map(sg => {
      const gen = sg.generations as any;
      return {
        location: gen?.location,
        generationId: gen?.id || sg.generation_id, // Prefer joined id, fallback to FK
        shotGenerationId: sg.id // The shot_generations.id for video-to-timeline tethering
      };
    }).filter(item => Boolean(item.location));

    absoluteImageUrls = freshImagesWithIds
      .map(item => getDisplayUrl(item.location))
      .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg');

    // Extract generation IDs and shot_generation IDs in the same order as URLs
    const filteredImages = freshImagesWithIds.filter(item => {
      const url = getDisplayUrl(item.location);
      return Boolean(url) && url !== '/placeholder.svg';
    });

    imageGenerationIds = filteredImages
      .map(item => item.generationId)
      .filter((id): id is string => Boolean(id));

    // Pair shot generation IDs: for N images, we have N-1 pairs
    // Each pair_shot_generation_id is the shot_generations.id of the START image of that pair
    pairShotGenerationIds = filteredImages
      .slice(0, -1) // Exclude the last image (it can only be an END image, not a pair start)
      .map(item => item.shotGenerationId)
      .filter((id): id is string => Boolean(id));

    console.log('[TaskSubmission] Using fresh image URLs and IDs:', {
      imageCount: absoluteImageUrls.length,
      urls: absoluteImageUrls.map(url => url.substring(0, 50) + '...'),
      generationIds: imageGenerationIds.map(id => id.substring(0, 8) + '...'),
      pairShotGenIds: pairShotGenerationIds.map(id => id.substring(0, 8) + '...'),
      pairCount: pairShotGenerationIds.length,
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
        // CRITICAL: Filter to match absoluteImageUrls filtering EXACTLY
        // Must filter by: has generations join, not video, valid timeline_frame, AND valid location
        // This ensures sortedPositions.length matches absoluteImageUrls.length
        // Uses canonical isVideoShotGenerations from typeGuards
        const filteredShotGenerations = shotGenerationsData.filter(sg => {
          const gen = sg.generations as any;
          const hasValidLocation = gen?.location && gen.location !== '/placeholder.svg';
          return sg.generations &&
                 !isVideoShotGenerations(sg as ShotGenerationsLike) &&
                 hasValidLocation;
        });

        console.log('[BasePromptsDebug] After filtering out videos and invalid locations:', filteredShotGenerations.length);
        console.log('[BasePromptsDebug] Filtered records:', filteredShotGenerations.map((sg, i) => ({
          index: i,
          id: sg.id?.substring(0, 8),
          timeline_frame: sg.timeline_frame,
          has_metadata: !!sg.metadata,
          location: (sg.generations as any)?.location?.substring(0, 30)
        })));

        // Build sorted positions ONLY from items with valid timeline_frame
        // (needed for calculating frame gaps)
        // NOTE: -1 is used as sentinel for unpositioned items in useTimelinePositionUtils
        sortedPositions = filteredShotGenerations
          .filter(sg => sg.timeline_frame !== null && sg.timeline_frame !== undefined && sg.timeline_frame >= 0)
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
      const finalNegativePrompt = (pairNegativePrompt && pairNegativePrompt.trim()) ? pairNegativePrompt.trim() : defaultNegativePrompt;
      console.log(`[PairPrompts-GENERATION] 🚫 Pair ${index} negative:`, {
        hasPairNegativePrompt: !!pairNegativePrompt,
        pairNegativePromptRaw: pairNegativePrompt || '(none)',
        finalNegativePromptUsed: finalNegativePrompt,
        isCustom: pairNegativePrompt && pairNegativePrompt.trim() ? true : false
      });
      return finalNegativePrompt;
    }) : [defaultNegativePrompt];

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

        // Filter to get only images with valid locations (same logic as timeline mode)
        // CRITICAL: Must match absoluteImageUrls filtering to ensure array lengths match
        // Uses canonical isVideoShotGenerations from typeGuards
        const filteredShotGenerations = shotGenerationsData.filter(sg => {
          const gen = sg.generations as any;
          const hasValidLocation = gen?.location && gen.location !== '/placeholder.svg';
          return sg.generations &&
                 !isVideoShotGenerations(sg as ShotGenerationsLike) &&
                 hasValidLocation;
        });

        console.log('[BasePromptsDebug] After filtering out videos and invalid locations:', filteredShotGenerations.length);
        console.log('[BasePromptsDebug] Filtered records:', filteredShotGenerations.map((sg, i) => ({
          index: i,
          id: sg.id?.substring(0, 8),
          has_metadata: !!sg.metadata,
          location: (sg.generations as any)?.location?.substring(0, 30)
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
          const finalNegativePrompt = (pairNegativePrompt && pairNegativePrompt.trim()) ? pairNegativePrompt.trim() : defaultNegativePrompt;
          
          console.log(`[BasePromptsDebug] 🚫 Pair ${index} negative:`);
          console.log(`[BasePromptsDebug]   hasPairNegativePrompt: ${!!pairNegativePrompt}`);
          console.log(`[BasePromptsDebug]   finalNegativePromptUsed: "${finalNegativePrompt?.substring(0, 30) || '(none)'}"`);
          
          return finalNegativePrompt;
        }) : [defaultNegativePrompt];
        
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
      negativePrompts = [defaultNegativePrompt];
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
  //
  // NEW: structure_video_type can now be 'uni3c' which uses I2V mode with a guidance video
  // - uni3c: Uses I2V model with raw structure video processing (uni3c_start_percent=0, uni3c_end_percent configurable)
  // - flow/canny/depth: Uses VACE model with respective structure video processing
  
  let actualModelName: string;
  let effectivePhaseConfig: PhaseConfig;
  let modelType: 'i2v' | 'vace';
  
  // Check if using uni3c mode (I2V with guidance video)
  const isUni3cMode = structureVideoConfig.structure_video_type === 'uni3c' && structureVideoConfig.structure_video_path;
  
  // Determine if we're using VACE mode based on generationTypeMode setting
  // Even if structure video exists, if user explicitly chose I2V mode, we use I2V
  // ALSO: If uni3c mode is selected, use I2V (not VACE)
  const useVaceMode = generationTypeMode === 'vace' && !isUni3cMode;
  
  // Log warning if I2V mode is selected but structure video exists (not applicable for uni3c)
  if (generationTypeMode === 'i2v' && structureVideoConfig.structure_video_path && !isUni3cMode) {
    console.warn('[Generation] ⚠️ I2V mode selected but structure video exists. Structure video will NOT be used.');
  }
  
  // Log uni3c mode
  if (isUni3cMode) {
    console.log('[Generation] 🔵 Using Uni3C mode - I2V model with guidance video');
  }
  
  // Convert user LoRAs to the format needed for phase config (including multi-stage fields)
  const userLorasForPhaseConfig = (selectedLoras || []).map(l => ({
    path: l.path,
    strength: parseFloat(l.strength?.toString() ?? '0') || 0.0,
    // Multi-stage LoRA fields
    lowNoisePath: (l as any).lowNoisePath,
    isMultiStage: (l as any).isMultiStage,
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
    isUni3cMode,
    useAdvancedMode,
    hasStructureVideo: !!structureVideoConfig.structure_video_path,
    structureVideoWillBeUsed: (useVaceMode || isUni3cMode) && !!structureVideoConfig.structure_video_path,
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
    
    // Pass structure type for uni3c mode detection
    const basicConfig = buildBasicModePhaseConfig(
      useVaceMode || isUni3cMode, // Has structure video for both VACE and Uni3C modes
      amountOfMotion,
      userLorasForPhaseConfig,
      structureVideoConfig.structure_video_type // Pass structure type for uni3c detection
    );
    
    actualModelName = basicConfig.model;
    effectivePhaseConfig = basicConfig.phaseConfig;
    // Uni3C mode uses I2V model type, VACE mode uses VACE
    modelType = isUni3cMode ? 'i2v' : (useVaceMode ? 'vace' : 'i2v');
    
    console.log('[Generation] Basic Mode - built phase config:', {
      model: actualModelName,
      modelType,
      generationTypeMode,
      useVaceMode,
      isUni3cMode,
      structureVideoType: structureVideoConfig.structure_video_type,
      hasStructureVideo: !!structureVideoConfig.structure_video_path,
      structureVideoWillBeUsed: (useVaceMode || isUni3cMode) && !!structureVideoConfig.structure_video_path,
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MASTER TIMELINE STATE LOG - Call before task submission for debugging
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    // Build the structure videos array with affected segments info
    const structureVideosForLog: Parameters<typeof logTimelineMasterState>[0]['structureVideos'] = [];
    const structureVideos = params.structureVideos;
    
    if (structureVideos && structureVideos.length > 0) {
      structureVideos.forEach((sv, index) => {
        // Determine which segments this video affects based on frame ranges
        const affectedSegments: number[] = [];
        let cumulativeFrame = 0;
        segmentFrames.forEach((frameCount, segIdx) => {
          const segStart = cumulativeFrame;
          const segEnd = cumulativeFrame + frameCount;
          // Check if this structure video overlaps with this segment
          if (sv.start_frame < segEnd && sv.end_frame > segStart) {
            affectedSegments.push(segIdx);
          }
          cumulativeFrame = segEnd;
        });
        
        structureVideosForLog.push({
          index,
          path: sv.path,
          startFrame: sv.start_frame,
          endFrame: sv.end_frame,
          treatment: sv.treatment ?? 'adjust',
          motionStrength: sv.motion_strength ?? 1.0,
          structureType: sv.structure_type ?? 'flow',
          affectedSegments,
        });
      });
    } else if (structureVideoConfig.structure_video_path) {
      // Legacy single video - affects all segments
      structureVideosForLog.push({
        index: 0,
        path: structureVideoConfig.structure_video_path,
        startFrame: 0,
        endFrame: segmentFrames.reduce((a, b) => a + b, 0),
        treatment: structureVideoConfig.structure_video_treatment ?? 'adjust',
        motionStrength: structureVideoConfig.structure_video_motion_strength ?? 1.0,
        structureType: structureVideoConfig.structure_video_type ?? 'flow',
        affectedSegments: [], // Empty = all segments
      });
    }

    // Build the segments array from the calculated data
    const segmentsForLog: Parameters<typeof logTimelineMasterState>[0]['segments'] = [];
    let cumulativeFrame = 0;
    for (let i = 0; i < segmentFrames.length; i++) {
      const frameCount = segmentFrames[i];
      const startFrame = cumulativeFrame;
      const endFrame = cumulativeFrame + frameCount;
      
      segmentsForLog.push({
        pairIndex: i,
        startImageId: imageGenerationIds[i] || `img-${i}`,
        endImageId: imageGenerationIds[i + 1] || `img-${i + 1}`,
        startFrame,
        endFrame,
        frameCount,
        basePrompt: basePrompts[i] || '',
        negativePrompt: negativePrompts[i] || defaultNegativePrompt,
        enhancedPrompt: enhancedPromptsArray[i] || '',
        hasCustomPrompt: !!(basePrompts[i] && basePrompts[i].trim()),
        hasEnhancedPrompt: !!(enhancedPromptsArray[i] && enhancedPromptsArray[i].trim()),
      });
      
      cumulativeFrame = endFrame;
    }

    // Build the images array
    // Note: We calculate frame positions based on segment frames for accurate logging
    // In timeline mode, positions are cumulative; in batch mode they're evenly spaced
    const imagesForLog: Parameters<typeof logTimelineMasterState>[0]['images'] = absoluteImageUrls.map((url, i) => {
      // Calculate cumulative frame position from segment frames
      let framePosition = 0;
      for (let j = 0; j < i && j < segmentFrames.length; j++) {
        framePosition += segmentFrames[j];
      }
      return {
        shotGenId: pairShotGenerationIds[i] || `shotgen-${i}`,
        generationId: imageGenerationIds[i] || `gen-${i}`,
        timelineFrame: framePosition,
        location: url,
      };
    });

    const totalFrames = segmentFrames.reduce((a, b) => a + b, 0);
    
    logTimelineMasterState({
      shotId: selectedShotId,
      shotName: selectedShot?.name,
      generationMode,
      images: imagesForLog,
      segments: segmentsForLog,
      structureVideos: structureVideosForLog,
      settings: {
        basePrompt: batchVideoPrompt,
        defaultNegativePrompt,
        amountOfMotion,
        motionMode: motionMode || 'basic',
        advancedMode: useAdvancedMode,
        turboMode,
        enhancePrompt,
        modelName: actualModelName,
        modelType,
        resolution,
        loras: selectedLoras.map(l => ({ name: l.name, path: l.path, strength: l.strength })),
      },
      totalFrames,
      totalDurationSeconds: totalFrames / 24,
    });
  } catch (logError) {
    // Don't let logging errors break generation
    console.warn('[TIMELINE_MASTER_STATE] Error logging master state:', logError);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  
  const requestBody: any = {
    project_id: projectId,
    shot_id: selectedShot.id,
    image_urls: absoluteImageUrls,
    // Include generation IDs for clickable images in SegmentCard
    ...(imageGenerationIds.length > 0 && imageGenerationIds.length === absoluteImageUrls.length 
      ? { image_generation_ids: imageGenerationIds } 
      : {}),
    // Include pair_shot_generation_ids for video-to-timeline tethering
    // These are the shot_generations.id of each pair's START image
    ...(pairShotGenerationIds.length > 0 
      ? { pair_shot_generation_ids: pairShotGenerationIds } 
      : {}),
    // Include parent_generation_id if provided - segments will become children of this parent
    // instead of creating a new parent generation
    ...(parentGenerationId ? { parent_generation_id: parentGenerationId } : {}),
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
    seed: seed,
    // Steps are now always in phase_config.steps_per_phase - don't send separately
    debug: debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
    show_input_images: DEFAULT_STEERABLE_MOTION_SETTINGS.show_input_images,
    enhance_prompt: enhancePrompt,
    // Save UI state settings (dimension_source removed - now using aspect ratios only)
    generation_mode: generationMode,
    // Note: model_type (i2v/vace) is already stored above via modelType variable
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
    // Include selected phase preset ID for UI state restoration (saved in all modes)
    selected_phase_preset_id: selectedPhasePresetId || undefined,
    // Add generation name if provided
    generation_name: variantNameParam.trim() || undefined,
    // Text before/after prompts
    ...(textBeforePrompts ? { text_before_prompts: textBeforePrompts } : {}),
    ...(textAfterPrompts ? { text_after_prompts: textAfterPrompts } : {}),
    // Smooth Continuations in VACE mode: disable independent segments, set frame overlap, and enable chain_segments
    // Otherwise: independent segments enabled (default behavior)
    independent_segments: !(useVaceMode && useSvi),
    chain_segments: useVaceMode && useSvi,
    ...(useVaceMode && useSvi ? { frame_overlap_expanded: 4 } : {}),
    // Smooth video interpolation (SVI) for smoother transitions - always send explicitly
    use_svi: useSvi ?? false,
  };

  // Log Smooth Continuations params
  if (useSvi) {
    console.log('[SmoothContinuationsDebug] Task params:', {
      useVaceMode,
      useSvi,
      independent_segments: requestBody.independent_segments,
      chain_segments: requestBody.chain_segments,
      frame_overlap_expanded: requestBody.frame_overlap_expanded,
    });
  }

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

  // LoRAs are in phase_config for GPU worker processing.
  // Also send as separate loras array so they become additional_loras in orchestrator_details.
  // This allows segment regeneration to preserve user-selected LoRAs.
  if (selectedLoras && selectedLoras.length > 0) {
    requestBody.loras = selectedLoras.map(l => ({
      path: l.path,
      strength: parseFloat(l.strength?.toString() ?? '1') || 1.0,
    }));
    console.log('[Generation] Adding user-selected LoRAs to additional_loras:', requestBody.loras);
  }

  if (resolution) {
    requestBody.resolution = resolution;
  }

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
  
  const structureVideos = params.structureVideos;
  
  console.log('[Generation] [DEBUG] Structure video config at generation time:', {
    hasStructureVideosArray: !!structureVideos && structureVideos.length > 0,
    structureVideosCount: structureVideos?.length ?? 0,
    legacyConfigPath: structureVideoConfig.structure_video_path,
    isUni3cMode
  });

  if (structureVideos && structureVideos.length > 0) {
    // Use NEW unified format with videos INSIDE structure_guidance
    const firstVideo = structureVideos[0];
    const isUni3cTarget = firstVideo.structure_type === 'uni3c';
    
    // Transform videos to clean format (strip structure_type, motion_strength, uni3c_* from each video)
    const cleanedVideos = structureVideos.map(video => ({
      path: video.path,
      start_frame: video.start_frame ?? 0,
      end_frame: video.end_frame ?? null,
      treatment: video.treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
      ...(video.metadata ? { metadata: video.metadata } : {}),
      ...(video.resource_id ? { resource_id: video.resource_id } : {}),
    }));
    
    // Build unified structure_guidance object with videos inside
    const structureGuidance: Record<string, unknown> = {
      target: isUni3cTarget ? 'uni3c' : 'vace',
      videos: cleanedVideos,
      strength: firstVideo.motion_strength ?? 1.0,
    };
    
    if (isUni3cTarget) {
      // Uni3C specific params
      structureGuidance.step_window = [
        firstVideo.uni3c_start_percent ?? 0,
        firstVideo.uni3c_end_percent ?? (params.uni3cEndPercent ?? 1.0),
      ];
      structureGuidance.frame_policy = 'fit';
      structureGuidance.zero_empty_frames = true;
    } else {
      // VACE specific params
      const preprocessingMap: Record<string, string> = {
        'flow': 'flow', 'canny': 'canny', 'depth': 'depth', 'raw': 'none',
      };
      structureGuidance.preprocessing = preprocessingMap[firstVideo.structure_type ?? 'flow'] ?? 'flow';
      // Include optional VACE params if present
      if (firstVideo.canny_intensity != null) structureGuidance.canny_intensity = firstVideo.canny_intensity;
      if (firstVideo.depth_contrast != null) structureGuidance.depth_contrast = firstVideo.depth_contrast;
    }
    
    requestBody.structure_guidance = structureGuidance;
    
    console.log('[Generation] 🎬 Using UNIFIED structure_guidance format (videos inside):', {
      target: structureGuidance.target,
      videosCount: cleanedVideos.length,
      strength: structureGuidance.strength,
      stepWindow: structureGuidance.step_window,
      preprocessing: structureGuidance.preprocessing,
      firstVideoPath: cleanedVideos[0]?.path?.substring(0, 50) + '...',
    });
  } else if (structureVideoConfig.structure_video_path) {
    // LEGACY single-video path - convert to new unified format
    const isUni3cTarget = structureVideoConfig.structure_video_type === 'uni3c';
    const legacyUni3cEndPercent =
      structureVideoConfig.uni3c_end_percent ??
      params.uni3cEndPercent ??
      1.0;
    
    // Compute end_frame from the total frames being generated
    const totalFrames = segmentFrames.reduce((a, b) => a + b, 0);
    
    // Build unified structure_guidance object with videos inside
    const structureGuidance: Record<string, unknown> = {
      target: isUni3cTarget ? 'uni3c' : 'vace',
      videos: [{
        path: structureVideoConfig.structure_video_path,
        start_frame: 0,
        end_frame: totalFrames,
        treatment: structureVideoConfig.structure_video_treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
      }],
      strength: structureVideoConfig.structure_video_motion_strength ?? 1.0,
    };
    
    if (isUni3cTarget) {
      // Uni3C specific params
      structureGuidance.step_window = [0, legacyUni3cEndPercent];
      structureGuidance.frame_policy = 'fit';
      structureGuidance.zero_empty_frames = true;
    } else {
      // VACE specific params
      const preprocessingMap: Record<string, string> = {
        'flow': 'flow', 'canny': 'canny', 'depth': 'depth', 'raw': 'none',
      };
      structureGuidance.preprocessing = preprocessingMap[structureVideoConfig.structure_video_type ?? 'flow'] ?? 'flow';
    }
    
    requestBody.structure_guidance = structureGuidance;
    
    console.log('[Generation] 🎬 Converted LEGACY single-video to UNIFIED format:', {
      target: structureGuidance.target,
      videosCount: (structureGuidance.videos as unknown[]).length,
      strength: structureGuidance.strength,
    });
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
    // [ParentReuseDebug] Log what we're passing to createTravelBetweenImagesTask
    console.log('[ParentReuseDebug] Calling createTravelBetweenImagesTask with parent_generation_id:', requestBody.parent_generation_id?.substring(0, 8) || 'undefined');

    const result = await createTravelBetweenImagesTask(requestBody as TravelBetweenImagesTaskParams);

    // [ParentReuseDebug] Log the result
    console.log('[ParentReuseDebug] createTravelBetweenImagesTask returned parentGenerationId:', result.parentGenerationId?.substring(0, 8) || 'undefined');

    return {
      success: true,
      parentGenerationId: result.parentGenerationId,
    };
  } catch (error) {
    console.error('Error creating video generation task:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    toast.error(`Failed to create video generation task: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

