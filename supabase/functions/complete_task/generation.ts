/**
 * Generation and variant creation for complete_task
 * Handles creating generations, variants, and parent/child relationships
 */

import {
  extractOrchestratorTaskId,
  extractBasedOn,
  extractShotAndPosition,
  buildGenerationParams,
} from './params.ts';
import {
  TASK_TYPES,
  TOOL_TYPES,
  VARIANT_TYPES,
  getEditVariantType,
} from './constants.ts';

// ===== SEGMENT PARAM EXPANSION =====

/**
 * Helper to safely extract value from array by index
 */
function extractFromArray(arr: any[], index: number): any | undefined {
  if (Array.isArray(arr) && index >= 0 && index < arr.length) {
    return arr[index];
  }
  return undefined;
}

// ============================================================================
// MASTER SEGMENT LOG - For debugging FE vs BE discrepancies
// ============================================================================

/**
 * Logs a comprehensive summary of a segment after creation.
 * This allows comparison between what was submitted and what the backend processed.
 */
function logSegmentMasterState(params: {
  taskId: string;
  generationId: string;
  segmentIndex: number;
  parentGenerationId: string | null;
  orchDetails: any;
  segmentParams: any;
  shotId?: string;
}) {
  const TAG = '[SEGMENT_MASTER_STATE]';
  const divider = '═'.repeat(80);
  const sectionDivider = '─'.repeat(60);
  
  const { taskId, generationId, segmentIndex, parentGenerationId, orchDetails, segmentParams, shotId } = params;
  
  console.log(`\n${divider}`);
  console.log(`${TAG} 📊 SEGMENT CREATION SUMMARY`);
  console.log(`${TAG} Task ID: ${taskId}`);
  console.log(`${TAG} Generation ID: ${generationId}`);
  console.log(`${TAG} Segment Index: ${segmentIndex}`);
  console.log(`${TAG} Parent Gen ID: ${parentGenerationId || '(none)'}`);
  console.log(`${TAG} Shot ID: ${shotId || '(none)'}`);
  console.log(`${TAG} Timestamp: ${new Date().toISOString()}`);
  console.log(divider);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: SEGMENT-SPECIFIC DATA
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} 🎬 SEGMENT DATA (Index ${segmentIndex})`);
  console.log(sectionDivider);
  
  // Frames
  const numFrames = segmentParams?.num_frames || extractFromArray(orchDetails?.segment_frames_expanded, segmentIndex);
  const frameOverlap = segmentParams?.frame_overlap || extractFromArray(orchDetails?.frame_overlap_expanded, segmentIndex);
  console.log(`${TAG}   Frames: ${numFrames || '(unknown)'} | Overlap: ${frameOverlap || '(unknown)'}`);
  
  // Prompts
  const basePrompt = segmentParams?.prompt || extractFromArray(orchDetails?.base_prompts_expanded, segmentIndex) || orchDetails?.base_prompt || '';
  const negativePrompt = segmentParams?.negative_prompt || extractFromArray(orchDetails?.negative_prompts_expanded, segmentIndex) || '';
  const enhancedPrompt = extractFromArray(orchDetails?.enhanced_prompts_expanded, segmentIndex) || '';
  
  const promptPreview = basePrompt ? (basePrompt.length > 60 ? basePrompt.substring(0, 57) + '...' : basePrompt) : '(empty)';
  const hasCustomPrompt = basePrompt && basePrompt.trim().length > 0;
  const negPreview = negativePrompt ? (negativePrompt.length > 40 ? negativePrompt.substring(0, 37) + '...' : negativePrompt) : '(default)';
  const enhancedPreview = enhancedPrompt ? (enhancedPrompt.length > 50 ? enhancedPrompt.substring(0, 47) + '...' : enhancedPrompt) : '';
  
  console.log(`${TAG}   Prompt: ${hasCustomPrompt ? '✏️ CUSTOM:' : '📝 DEFAULT:'} ${promptPreview}`);
  if (enhancedPrompt) {
    console.log(`${TAG}   Enhanced: ✨ ${enhancedPreview}`);
  }
  console.log(`${TAG}   Negative: ${negPreview}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: INPUT IMAGES FOR THIS SEGMENT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} 🖼️  INPUT IMAGES`);
  console.log(sectionDivider);
  
  const inputImages = orchDetails?.input_image_paths_resolved || [];
  const inputGenIds = orchDetails?.input_image_generation_ids || [];
  const pairShotGenIds = orchDetails?.pair_shot_generation_ids || [];
  
  const startIdx = segmentIndex;
  const endIdx = segmentIndex + 1;
  
  const startImageUrl = inputImages[startIdx] || '(unknown)';
  const endImageUrl = inputImages[endIdx] || '(unknown)';
  const startGenId = inputGenIds[startIdx] || '(unknown)';
  const endGenId = inputGenIds[endIdx] || '(unknown)';
  const pairShotGenId = pairShotGenIds[segmentIndex] || '(none)';
  
  const startUrlShort = startImageUrl.length > 50 ? '...' + startImageUrl.slice(-47) : startImageUrl;
  const endUrlShort = endImageUrl.length > 50 ? '...' + endImageUrl.slice(-47) : endImageUrl;
  
  console.log(`${TAG}   Start Image [${startIdx}]: ${startUrlShort}`);
  console.log(`${TAG}     Gen ID: ${typeof startGenId === 'string' ? startGenId.substring(0, 8) : startGenId}`);
  console.log(`${TAG}   End Image [${endIdx}]: ${endUrlShort}`);
  console.log(`${TAG}     Gen ID: ${typeof endGenId === 'string' ? endGenId.substring(0, 8) : endGenId}`);
  console.log(`${TAG}   Pair Shot Gen ID: ${typeof pairShotGenId === 'string' ? pairShotGenId.substring(0, 8) : pairShotGenId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: STRUCTURE VIDEOS AFFECTING THIS SEGMENT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} 🎥 STRUCTURE VIDEOS`);
  console.log(sectionDivider);
  
  const structureVideos = orchDetails?.structure_videos || [];
  const legacyStructurePath = orchDetails?.structure_video_path;
  
  // Calculate cumulative frame range for this segment
  const segmentFramesExpanded = orchDetails?.segment_frames_expanded || [];
  let segStartFrame = 0;
  for (let i = 0; i < segmentIndex && i < segmentFramesExpanded.length; i++) {
    segStartFrame += segmentFramesExpanded[i];
  }
  const segEndFrame = segStartFrame + (segmentFramesExpanded[segmentIndex] || 0);
  
  console.log(`${TAG}   Segment Frame Range: ${segStartFrame} → ${segEndFrame}`);
  
  if (structureVideos.length > 0) {
    // Multi-video format
    let foundAffecting = false;
    structureVideos.forEach((sv: any, idx: number) => {
      const svStart = sv.start_frame || 0;
      const svEnd = sv.end_frame || 0;
      // Check if this structure video overlaps with this segment
      if (svStart < segEndFrame && svEnd > segStartFrame) {
        foundAffecting = true;
        const pathShort = sv.path?.length > 40 ? '...' + sv.path.slice(-37) : (sv.path || '(unknown)');
        console.log(`${TAG}   ┌─ Video ${idx}: AFFECTS THIS SEGMENT`);
        console.log(`${TAG}   │  Path: ${pathShort}`);
        console.log(`${TAG}   │  Video Range: ${svStart} → ${svEnd}`);
        console.log(`${TAG}   │  Type: ${sv.structure_type || 'flow'} | Treatment: ${sv.treatment || 'adjust'} | Motion: ${sv.motion_strength || 1.0}`);
        console.log(`${TAG}   └${sectionDivider.substring(0, 20)}`);
      }
    });
    if (!foundAffecting) {
      console.log(`${TAG}   (No structure videos affect this segment's frame range)`);
    }
  } else if (legacyStructurePath) {
    // Legacy single video format - affects all segments
    const pathShort = legacyStructurePath.length > 40 ? '...' + legacyStructurePath.slice(-37) : legacyStructurePath;
    console.log(`${TAG}   Legacy Video: ${pathShort}`);
    console.log(`${TAG}   Type: ${orchDetails?.structure_video_type || 'flow'} | Treatment: ${orchDetails?.structure_video_treatment || 'adjust'}`);
  } else {
    console.log(`${TAG}   (No structure videos - I2V mode)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: MODEL & SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} ⚙️  MODEL & SETTINGS`);
  console.log(sectionDivider);
  console.log(`${TAG}   Model: ${orchDetails?.model_name || segmentParams?.model_name || '(unknown)'}`);
  console.log(`${TAG}   Model Type: ${orchDetails?.model_type || segmentParams?.model_type || 'i2v'}`);
  console.log(`${TAG}   Seed: ${orchDetails?.seed_base || segmentParams?.seed || '(random)'}`);
  console.log(`${TAG}   Amount of Motion: ${orchDetails?.amount_of_motion !== undefined ? Math.round(orchDetails.amount_of_motion * 100) + '%' : '(default)'}`);
  console.log(`${TAG}   Advanced Mode: ${orchDetails?.advanced_mode || false}`);
  console.log(`${TAG}   Turbo Mode: ${orchDetails?.turbo_mode || false}`);
  console.log(`${TAG}   Enhance Prompt: ${orchDetails?.enhance_prompt || false}`);
  
  // LoRAs
  const additionalLoras = orchDetails?.additional_loras;
  const phaseConfig = orchDetails?.phase_config;
  if (additionalLoras && Object.keys(additionalLoras).length > 0) {
    console.log(`${TAG}   LoRAs: ${Object.keys(additionalLoras).length} configured`);
    Object.entries(additionalLoras).forEach(([path, strength]) => {
      const pathShort = path.split('/').pop() || path;
      console.log(`${TAG}     - ${pathShort}: ${strength}`);
    });
  } else if (phaseConfig?.phases) {
    // Count unique LoRAs across phases
    const uniqueLoras = new Set<string>();
    phaseConfig.phases.forEach((phase: any) => {
      phase.loras?.forEach((lora: any) => uniqueLoras.add(lora.url?.split('/').pop() || 'unknown'));
    });
    if (uniqueLoras.size > 0) {
      console.log(`${TAG}   LoRAs (in phase_config): ${uniqueLoras.size} unique`);
    }
  } else {
    console.log(`${TAG}   LoRAs: (none)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: ORCHESTRATOR CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} 📋 ORCHESTRATOR CONTEXT`);
  console.log(sectionDivider);
  console.log(`${TAG}   Total Segments: ${orchDetails?.num_new_segments_to_generate || '(unknown)'}`);
  console.log(`${TAG}   Total Images: ${inputImages.length}`);
  console.log(`${TAG}   Generation Mode: ${orchDetails?.generation_mode || 'batch'}`);
  console.log(`${TAG}   Generation Name: ${orchDetails?.generation_name || '(unnamed)'}`);
  console.log(`${TAG}   Resolution: ${orchDetails?.parsed_resolution_wh || '(auto)'}`);
  
  // Show all segment frames for context
  if (segmentFramesExpanded.length > 0) {
    console.log(`${TAG}   All Segment Frames: [${segmentFramesExpanded.join(', ')}]`);
    const totalFrames = segmentFramesExpanded.reduce((a: number, b: number) => a + b, 0);
    console.log(`${TAG}   Total Duration: ${totalFrames} frames (~${(totalFrames / 24).toFixed(1)}s)`);
  }
  
  console.log(`\n${divider}\n`);
}

/**
 * Extract segment-specific params from expanded arrays in orchestrator_details
 * For travel segments, each segment can have different prompts, frame counts, etc.
 * 
 * @param params - Original task params
 * @param orchDetails - orchestrator_details containing expanded arrays
 * @param segmentIndex - The index of this segment
 * @returns Modified params with segment-specific values
 */
function extractSegmentSpecificParams(
  params: any,
  orchDetails: any,
  segmentIndex: number
): any {
  const specificParams = { ...params };

  // Extract specific prompt from base_prompts_expanded
  const specificPrompt = extractFromArray(orchDetails.base_prompts_expanded, segmentIndex);
  if (specificPrompt !== undefined) {
    specificParams.prompt = specificPrompt;
    console.log(`[GenMigration] Set child prompt: "${String(specificPrompt).substring(0, 20)}..."`);
  }

  // Extract specific negative prompt from negative_prompts_expanded
  const specificNegativePrompt = extractFromArray(orchDetails.negative_prompts_expanded, segmentIndex);
  if (specificNegativePrompt !== undefined) {
    specificParams.negative_prompt = specificNegativePrompt;
  }

  // Extract specific frames count from segment_frames_expanded
  const specificFrames = extractFromArray(orchDetails.segment_frames_expanded, segmentIndex);
  if (specificFrames !== undefined) {
    specificParams.num_frames = specificFrames;
  }

  // Extract specific overlap from frame_overlap_expanded
  const specificOverlap = extractFromArray(orchDetails.frame_overlap_expanded, segmentIndex);
  if (specificOverlap !== undefined) {
    specificParams.frame_overlap = specificOverlap;
  }

  // Extract pair_shot_generation_id for video-to-timeline tethering
  // This is the shot_generations.id of the START image for this segment's pair
  const pairShotGenId = extractFromArray(orchDetails.pair_shot_generation_ids, segmentIndex);
  if (pairShotGenId !== undefined) {
    specificParams.pair_shot_generation_id = pairShotGenId;
    console.log(`[GenMigration] Set pair_shot_generation_id: ${pairShotGenId}`);
  }

  // Also extract start_image_generation_id from input_image_generation_ids if available
  const startImageGenId = extractFromArray(orchDetails.input_image_generation_ids, segmentIndex);
  if (startImageGenId !== undefined) {
    specificParams.start_image_generation_id = startImageGenId;
  }
  const endImageGenId = extractFromArray(orchDetails.input_image_generation_ids, segmentIndex + 1);
  if (endImageGenId !== undefined) {
    specificParams.end_image_generation_id = endImageGenId;
  }

  return specificParams;
}

// ===== TOOL TYPE RESOLUTION =====

/**
 * Resolve the final tool_type for a task, considering both default mapping and potential overrides
 */
export async function resolveToolType(
  supabase: any, 
  taskType: string, 
  taskParams: any
): Promise<{
  toolType: string;
  category: string;
  contentType: 'image' | 'video';
} | null> {
  // Get default tool_type from task_types table
  const { data: taskTypeData, error: taskTypeError } = await supabase
    .from("task_types")
    .select("category, tool_type, content_type")
    .eq("name", taskType)
    .single();

  if (taskTypeError || !taskTypeData) {
    console.error(`[ToolTypeResolver] Failed to fetch task_types metadata for '${taskType}':`, taskTypeError);
    return null;
  }

  let finalToolType = taskTypeData.tool_type;
  const finalContentType = taskTypeData.content_type || 'image';
  const category = taskTypeData.category;

  console.log(`[ToolTypeResolver] Base task_type '${taskType}' has content_type: ${finalContentType}`);

  // Check for tool_type override in params
  const paramsToolType = taskParams?.tool_type;
  if (paramsToolType) {
    console.log(`[ToolTypeResolver] Found tool_type override in params: ${paramsToolType}`);

    // Validate that the override tool_type is a known valid tool type
    const { data: validToolTypes } = await supabase
      .from("task_types")
      .select("tool_type")
      .not("tool_type", "is", null)
      .eq("is_active", true);

    const validToolTypeSet = new Set(validToolTypes?.map((t: any) => t.tool_type) || []);

    if (validToolTypeSet.has(paramsToolType)) {
      console.log(`[ToolTypeResolver] Using tool_type override: ${paramsToolType} (was: ${finalToolType})`);
      finalToolType = paramsToolType;
    } else {
      console.log(`[ToolTypeResolver] Invalid tool_type override '${paramsToolType}', using default: ${finalToolType}`);
    }
  }

  return {
    toolType: finalToolType,
    category,
    contentType: finalContentType
  };
}

// ===== GENERATION LOOKUP =====

/**
 * Check for existing generation referencing this task_id
 */
export async function findExistingGeneration(supabase: any, taskId: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .contains('tasks', JSON.stringify([taskId]))
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error(`[GenMigration] Error finding existing generation:`, error);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`[GenMigration] Exception finding existing generation:`, error);
    return null;
  }
}

/**
 * Find source generation by image URL (for magic edit tracking)
 */
export async function findSourceGenerationByImageUrl(supabase: any, imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null;

  try {
    console.log(`[BasedOn] Looking for source generation with image URL: ${imageUrl}`);
    const { data, error } = await supabase
      .from('generations')
      .select('id')
      .eq('location', imageUrl)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[BasedOn] Error finding source generation:`, error);
      return null;
    }

    if (data) {
      console.log(`[BasedOn] Found source generation: ${data.id}`);
      return data.id;
    }

    console.log(`[BasedOn] No source generation found for image URL`);
    return null;
  } catch (error) {
    console.error(`[BasedOn] Exception finding source generation:`, error);
    return null;
  }
}

// ===== GENERATION/VARIANT CREATION =====

/**
 * Insert generation record
 */
export async function insertGeneration(supabase: any, record: any): Promise<any> {
  const { data, error } = await supabase
    .from('generations')
    .insert(record)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert generation: ${error.message}`);
  }

  return data;
}

/**
 * Create a generation variant
 * @param viewedAt - Optional: if provided, marks the variant as already viewed (for single-segment cases)
 */
export async function createVariant(
  supabase: any,
  generationId: string,
  location: string,
  thumbnailUrl: string | null,
  params: any,
  isPrimary: boolean,
  variantType: string | null,
  name?: string | null,
  viewedAt?: string | null
): Promise<any> {
  const variantRecord: Record<string, any> = {
    generation_id: generationId,
    location,
    thumbnail_url: thumbnailUrl,
    params,
    is_primary: isPrimary,
    variant_type: variantType,
    name: name || null,
    created_at: new Date().toISOString()
  };

  // If viewedAt is provided, mark the variant as already viewed
  if (viewedAt) {
    variantRecord.viewed_at = viewedAt;
  }

  console.log(`[Variant] Creating variant for generation ${generationId}: type=${variantType}, isPrimary=${isPrimary}, viewed=${!!viewedAt}`);

  const { data, error } = await supabase
    .from('generation_variants')
    .insert(variantRecord)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create variant: ${error.message}`);
  }

  console.log(`[Variant] Created variant ${data.id} for generation ${generationId}`);
  return data;
}

/**
 * Link generation to shot using the existing RPC
 */
export async function linkGenerationToShot(
  supabase: any, 
  shotId: string, 
  generationId: string, 
  addInPosition: boolean
): Promise<void> {
  try {
    const { error } = await supabase.rpc('add_generation_to_shot', {
      p_shot_id: shotId,
      p_generation_id: generationId,
      p_with_position: addInPosition
    });

    if (error) {
      console.error(`[ShotLink] Failed to link generation ${generationId} to shot ${shotId}:`, error);
    } else {
      console.log(`[ShotLink] Successfully linked generation ${generationId} to shot ${shotId}`);
    }
  } catch (error) {
    console.error(`[ShotLink] Exception linking generation to shot:`, error);
  }
}

// ===== PARENT GENERATION =====

/**
 * Get existing parent generation or create a placeholder
 * Implements the "Lazy Parent Creation" pattern
 */
export async function getOrCreateParentGeneration(
  supabase: any, 
  orchestratorTaskId: string, 
  projectId: string, 
  segmentParams?: any
): Promise<any> {
  try {
    // Check if orchestrator already specifies a parent_generation_id
    let orchTask: { task_type?: string; params?: any } | null = null;
    try {
      const { data } = await supabase
        .from('tasks')
        .select('task_type, params')
        .eq('id', orchestratorTaskId)
        .single();
      orchTask = data;
    } catch {
      console.log(`[GenMigration] Could not fetch orchestrator task ${orchestratorTaskId}`);
    }

    // Check for parent_generation_id in orchestrator params
    const parentGenId = orchTask?.params?.parent_generation_id || 
                        orchTask?.params?.orchestrator_details?.parent_generation_id ||
                        segmentParams?.full_orchestrator_payload?.parent_generation_id;
    
    if (parentGenId) {
      console.log(`[GenMigration] Orchestrator has parent_generation_id: ${parentGenId}`);
      const { data: existingParent, error: parentError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', parentGenId)
        .single();
      
      if (existingParent && !parentError) {
        console.log(`[GenMigration] Using existing parent generation ${parentGenId}`);
        return existingParent;
      }
    }
    
    // Try to find existing generation for this orchestrator task
    const existing = await findExistingGeneration(supabase, orchestratorTaskId);
    if (existing) {
      return existing;
    }

    console.log(`[GenMigration] Creating placeholder parent generation for orchestrator ${orchestratorTaskId}`);

    const newId = crypto.randomUUID();
    const baseParams = orchTask?.params || segmentParams || {};
    const placeholderParams = {
      ...baseParams,
      tool_type: baseParams.tool_type || TOOL_TYPES.TRAVEL_BETWEEN_IMAGES
    };
    
    const placeholderRecord = {
      id: newId,
      tasks: [orchestratorTaskId],
      project_id: projectId,
      type: 'video',
      is_child: false,
      location: null,
      created_at: new Date().toISOString(),
      params: placeholderParams
    };

    const { data: newParent, error } = await supabase
      .from('generations')
      .insert(placeholderRecord)
      .select()
      .single();

    if (error) {
      console.error(`[GenMigration] Error creating placeholder parent:`, error);
      return await findExistingGeneration(supabase, orchestratorTaskId);
    }

    console.log(`[GenMigration] Created placeholder parent ${newId}`);

    // Link parent to shot if orchestrator has shot_id
    const paramsForShotExtraction = orchTask?.params || segmentParams;
    if (paramsForShotExtraction) {
      const { shotId, addInPosition } = extractShotAndPosition(paramsForShotExtraction);
      if (shotId) {
        console.log(`[GenMigration] Linking parent generation ${newId} to shot ${shotId}`);
        await linkGenerationToShot(supabase, shotId, newId, addInPosition);
      }
    }

    return newParent;

  } catch (error) {
    console.error(`[GenMigration] Exception in getOrCreateParentGeneration:`, error);
    return null;
  }
}

// ===== MAIN GENERATION CREATION =====

/**
 * Helper function to create variant and update parent generation
 * @param viewedAt - Optional: if provided, marks the variant as already viewed (for single-segment cases)
 */
async function createVariantOnParent(
  supabase: any,
  parentGenId: string,
  publicUrl: string,
  thumbnailUrl: string | null,
  taskData: any,
  taskId: string,
  variantType: string,
  extraParams: Record<string, any> = {},
  variantName?: string | null,
  makePrimary: boolean = true,
  viewedAt?: string | null
): Promise<any | null> {
  console.log(`[GenMigration] ${taskData.task_type} task ${taskId} - creating variant for parent generation ${parentGenId}`);

  const { data: parentGen, error: fetchError } = await supabase
    .from('generations')
    .select('*')
    .eq('id', parentGenId)
    .single();

  if (fetchError || !parentGen) {
    console.error(`[GenMigration] Error fetching parent generation ${parentGenId}:`, fetchError);
    return null;
  }

  try {
    const variantParams = {
      ...taskData.params,
      source_task_id: taskId,
      ...extraParams,
    };

    await createVariant(
      supabase,
      parentGen.id,
      publicUrl,
      thumbnailUrl,
      variantParams,
      makePrimary,     // is_primary
      variantType,
      variantName || null,
      viewedAt || null
    );

    console.log(`[GenMigration] Successfully created ${variantType} variant for parent generation ${parentGen.id}${viewedAt ? ' (auto-viewed)' : ''}`);

    // Mark task as generation_created
    await supabase
      .from('tasks')
      .update({ generation_created: true })
      .eq('id', taskId);

    return parentGen;

  } catch (variantErr) {
    console.error(`[GenMigration] Exception creating variant for ${taskData.task_type}:`, variantErr);
    return null;
  }
}

/**
 * Determines the viewedAt timestamp for a child generation variant.
 * For single-segment cases (only one child under parent), returns current timestamp.
 * For multi-segment cases, returns null.
 *
 * This centralizes the single-segment detection logic that was previously scattered
 * across three different code paths:
 * 1. individual_travel_segment with child_generation_id (SPECIAL CASE 1a)
 * 2. Travel segment matching existing generation at position
 * 3. Standard child generation creation
 *
 * @param supabase - Supabase client
 * @param options - Detection options (check in order of preference)
 * @returns ISO timestamp string if single-segment, null otherwise
 */
async function getChildVariantViewedAt(
  supabase: any,
  options: {
    // Check 1: Explicit flag from orchestrator detection (fastest)
    taskParams?: { _isSingleSegmentCase?: boolean };
    // Check 2: Count siblings under parent (slower but works for individual segments)
    childGeneration?: { parent_generation_id: string | null; is_child: boolean };
    parentGenerationId?: string;
  }
): Promise<string | null> {
  // Fast path: Check explicit flag first (set during orchestrator detection)
  if (options.taskParams?._isSingleSegmentCase === true) {
    console.log('[getChildVariantViewedAt] Single-segment detected via _isSingleSegmentCase flag');
    return new Date().toISOString();
  }

  // Slow path: Count siblings to determine if single-segment
  // Used by individual_travel_segment which doesn't go through orchestrator detection
  const parentId = options.childGeneration?.parent_generation_id || options.parentGenerationId;
  // Only count if: (a) we have a parentId from childGeneration with is_child=true, or (b) we have explicit parentGenerationId
  const shouldCountSiblings = parentId && (
    options.childGeneration?.is_child === true ||  // childGeneration explicitly marked as child
    (!options.childGeneration && options.parentGenerationId)  // or explicit parentGenerationId without childGeneration
  );
  if (shouldCountSiblings) {
    try {
      const { count } = await supabase
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('parent_generation_id', parentId)
        .eq('is_child', true);

      if (count === 1) {
        console.log(`[getChildVariantViewedAt] Single-segment detected via sibling count (parent: ${parentId})`);
        return new Date().toISOString();
      }
      console.log(`[getChildVariantViewedAt] Multi-segment case: ${count} siblings under parent ${parentId}`);
    } catch (err) {
      console.warn('[getChildVariantViewedAt] Error counting siblings:', err);
    }
  }

  return null;
}

/**
 * Main function to create generation from completed task
 */
export async function createGenerationFromTask(
  supabase: any,
  taskId: string,
  taskData: any,
  publicUrl: string,
  thumbnailUrl: string | null | undefined,
  logger?: any
): Promise<any> {
  console.log(`[GenMigration] Starting generation creation for task ${taskId}`);
  logger?.debug("Starting generation creation", {
    task_id: taskId,
    task_type: taskData.task_type,
    tool_type: taskData.tool_type,
    content_type: taskData.content_type,
    has_orchestrator_task_id: !!taskData.params?.orchestrator_task_id,
    has_parent_generation_id: !!taskData.params?.parent_generation_id,
    has_child_generation_id: !!taskData.params?.child_generation_id,
    has_based_on: !!extractBasedOn(taskData.params),
  });

  try {
    // Check if generation already exists
    const existingGeneration = await findExistingGeneration(supabase, taskId);
    if (existingGeneration) {
      console.log(`[GenMigration] Generation already exists for task ${taskId}: ${existingGeneration.id}`);
      console.log(`[GenMigration] Creating new variant and making it primary`);
      logger?.info("Existing generation found - creating regenerated variant", {
        task_id: taskId,
        existing_generation_id: existingGeneration.id,
        action: "create_regenerated_variant"
      });

      const variantParams = {
        ...taskData.params,
        source_task_id: taskId,
        created_from: 'task_completion',
        tool_type: taskData.tool_type,
      };

      await createVariant(
        supabase,
        existingGeneration.id,
        publicUrl,
        thumbnailUrl || null,
        variantParams,
        true,
        'regenerated',
        null
      );

      console.log(`[GenMigration] Successfully created regenerated variant for generation ${existingGeneration.id}`);

      const { shotId, addInPosition } = extractShotAndPosition(taskData.params);
      if (shotId) {
        await linkGenerationToShot(supabase, shotId, existingGeneration.id, addInPosition);
      }

      await supabase
        .from('tasks')
        .update({ generation_created: true })
        .eq('id', taskId);

      return existingGeneration;
    }

    // ===== SPECIAL CASE HANDLERS =====

    // SPECIAL CASE 1a: individual_travel_segment with child_generation_id - create variant on existing child
    if (taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT && taskData.params?.child_generation_id) {
      const childGenId = taskData.params.child_generation_id;
      console.log(`[GenMigration] individual_travel_segment - creating variant for child generation ${childGenId}`);
      logger?.info("SPECIAL CASE 1a: individual_travel_segment with child_generation_id", {
        task_id: taskId,
        child_generation_id: childGenId,
        action: "create_variant_on_existing_child"
      });

      const { data: childGen, error: fetchError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', childGenId)
        .single();

      if (!fetchError && childGen) {
        const variantParams = {
          ...taskData.params,
          tool_type: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES,
          source_task_id: taskId,
          created_from: 'individual_segment_regeneration',
        };

        // Respect make_primary_variant flag from UI (defaults to true for backward compatibility)
        const makePrimary = taskData.params?.make_primary_variant ?? true;
        console.log(`[GenMigration] Creating variant with isPrimary=${makePrimary}`);

        // Use centralized helper for single-segment detection (counts siblings under parent)
        const childViewedAt = makePrimary ? await getChildVariantViewedAt(supabase, {
          taskParams: taskData.params,
          childGeneration: childGen,
        }) : null;
        const isSingleSegmentChild = childViewedAt !== null;

        await createVariant(supabase, childGen.id, publicUrl, thumbnailUrl || null, variantParams, makePrimary, VARIANT_TYPES.INDIVIDUAL_SEGMENT, null, childViewedAt);

        console.log(`[GenMigration] Successfully created variant for child generation ${childGenId}${isSingleSegmentChild ? ' (auto-viewed)' : ''}`);

        // SINGLE-SEGMENT PROPAGATION: If this child is the only child of its parent,
        // also create a variant on the parent so the main generation updates automatically
        if (isSingleSegmentChild && childGen.parent_generation_id) {
          console.log(`[GenMigration] Single-segment child - also creating variant on parent ${childGen.parent_generation_id}`);
          logger?.info("Single-segment propagation to parent", {
            task_id: taskId,
            child_generation_id: childGenId,
            parent_generation_id: childGen.parent_generation_id,
            action: "propagate_to_parent"
          });

          await createVariant(
            supabase,
            childGen.parent_generation_id,
            publicUrl,
            thumbnailUrl || null,
            {
              ...variantParams,
              propagated_from_child: childGenId,
              created_from: 'single_segment_propagation',
            },
            true, // is_primary
            VARIANT_TYPES.TRAVEL_SEGMENT,
            null
          );
          console.log(`[GenMigration] Successfully propagated to parent generation`);
        }

        await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);
        return childGen;
      }
    }

    // SPECIAL CASE 1b: individual_travel_segment with parent_generation_id but NO child_generation_id
    // This creates a NEW child generation under the parent (from MediaLightbox Regenerate tab)
    // We set parentGenerationId/isChild/childOrder here and fall through to standard generation creation
    let individualSegmentParentId: string | null = null;
    let individualSegmentChildOrder: number | null = null;

    if (taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT && !taskData.params?.child_generation_id) {
      const parentGenId = taskData.params?.parent_generation_id ||
                          taskData.params?.orchestrator_details?.parent_generation_id ||
                          taskData.params?.full_orchestrator_payload?.parent_generation_id;

      if (parentGenId) {
        console.log(`[GenMigration] individual_travel_segment (new child) - will create child generation under parent ${parentGenId}`);
        logger?.info("SPECIAL CASE 1b: individual_travel_segment creating new child", {
          task_id: taskId,
          parent_generation_id: parentGenId,
          action: "create_new_child_generation"
        });

        // Get the segment_index for child_order
        const segmentIndex = taskData.params?.segment_index;
        individualSegmentChildOrder = segmentIndex !== undefined && segmentIndex !== null
          ? parseInt(String(segmentIndex), 10)
          : null;
        individualSegmentParentId = parentGenId;

        console.log(`[GenMigration] individual_travel_segment will use parent_generation_id=${parentGenId}, child_order=${individualSegmentChildOrder}`);
      }
    }

    // SPECIAL CASE 2: travel_stitch - create variant on parent generation
    if (taskData.task_type === TASK_TYPES.TRAVEL_STITCH) {
      // Get orchestrator task ID to find the parent generation
      const orchTaskId = taskData.params?.orchestrator_task_id_ref ||
                         taskData.params?.orchestrator_task_id ||
                         taskData.params?.full_orchestrator_payload?.orchestrator_task_id;

      if (orchTaskId) {
        console.log(`[GenMigration] travel_stitch - getting parent generation for orchestrator ${orchTaskId}`);
        // Use same function that segments use to get/create parent generation
        const parentGen = await getOrCreateParentGeneration(supabase, orchTaskId, taskData.project_id, taskData.params);

        if (parentGen?.id) {
          console.log(`[GenMigration] travel_stitch task ${taskId} - creating variant on parent generation ${parentGen.id}`);
          logger?.info("SPECIAL CASE 2: travel_stitch creating variant on parent", {
            task_id: taskId,
            parent_generation_id: parentGen.id,
            orchestrator_task_id: orchTaskId,
            action: "create_variant_on_parent"
          });
          const result = await createVariantOnParent(
            supabase, parentGen.id, publicUrl, thumbnailUrl || null, taskData, taskId,
            VARIANT_TYPES.TRAVEL_STITCH, { tool_type: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES, created_from: 'travel_stitch_completion' }
          );
          if (result) return result;
        } else {
          console.log(`[GenMigration] travel_stitch task ${taskId} - could not find/create parent generation`);
        }
      } else {
        console.log(`[GenMigration] travel_stitch task ${taskId} - no orchestrator_task_id found`);
      }
    }

    // ===== SUB-TASK (SEGMENT) HANDLING =====
    const orchestratorTaskId = extractOrchestratorTaskId(taskData.params, 'GenMigration');
    let parentGenerationId: string | null = null;
    let isChild = false;
    let childOrder: number | null = null;

    if (orchestratorTaskId) {
      console.log(`[GenMigration] Task ${taskId} is a sub-task of orchestrator ${orchestratorTaskId}`);
      logger?.info("Sub-task detected - orchestrator handling", {
        task_id: taskId,
        orchestrator_task_id: orchestratorTaskId,
        segment_index: taskData.params?.segment_index
      });

      const parentGen = await getOrCreateParentGeneration(supabase, orchestratorTaskId, taskData.project_id, taskData.params);
      if (parentGen) {
        parentGenerationId = parentGen.id;
        isChild = true;
        console.log(`[GenMigration] Linked to parent generation ${parentGenerationId}`);

        const segmentIndex = taskData.params?.segment_index ?? taskData.params?.index ?? taskData.params?.sequence_index;
        if (segmentIndex !== undefined && segmentIndex !== null) {
          childOrder = parseInt(String(segmentIndex), 10);
          console.log(`[GenMigration] Extracted child_order: ${childOrder}`);

          // SPECIAL CASE: join_clips_segment with single join (2 clips)
          // The segment output IS the final output - create variant on parent instead of child
          if (taskData.task_type === TASK_TYPES.JOIN_CLIPS_SEGMENT) {
            const isSingleJoin = taskData.params?.is_first_join === true && taskData.params?.is_last_join === true;

            if (isSingleJoin && parentGenerationId) {
              console.log(`[JoinClipsSingleJoin] Detected single-join scenario (join_index: ${taskData.params?.join_index}) - creating variant for parent generation ${parentGenerationId}`);
              logger?.info("Single-join scenario - creating variant on parent", {
                task_id: taskId,
                parent_generation_id: parentGenerationId,
                join_index: taskData.params?.join_index,
                action: "create_variant_on_parent_single_join"
              });
              
              // Determine tool_type from orchestrator params (could be 'join-clips' or 'edit-video')
              const toolType = taskData.params?.full_orchestrator_payload?.tool_type ||
                               taskData.params?.tool_type || 
                               TOOL_TYPES.JOIN_CLIPS;
              
              const singleJoinResult = await createVariantOnParent(
                supabase, parentGenerationId, publicUrl, thumbnailUrl || null, taskData, taskId,
                VARIANT_TYPES.JOIN_CLIPS_SEGMENT,
                {
                  tool_type: toolType,
                  created_from: 'single_join_completion',
                  join_index: taskData.params?.join_index ?? 0,
                  is_single_join: true,
                }
              );
              
              if (singleJoinResult) {
                console.log(`[JoinClipsSingleJoin] Successfully created variant and updated parent generation`);
                
                // Mark the orchestrator task as generation_created=true
                await supabase
                  .from('tasks')
                  .update({ generation_created: true })
                  .eq('id', orchestratorTaskId);
                
                // Return early - we've handled this as a variant, not a child generation
                return singleJoinResult;
              } else {
                console.error(`[JoinClipsSingleJoin] Failed to create variant, falling through to child generation creation`);
              }
            }
          }

          // Extract child-specific params from orchestrator_details if available
          const orchDetails = taskData.params?.orchestrator_details;
          // Track if this is a single-segment orchestrator - we'll create an auto-viewed variant on the child
          let isSingleSegmentCase = false;

          if (orchDetails && !isNaN(childOrder)) {
            console.log(`[GenMigration] Extracting specific params for child segment ${childOrder}`);

          // SPECIAL CASE: For travel orchestrators with only 1 segment, create variant on parent
          // AND also create a child generation for consistency with multi-segment behavior
          if (childOrder === 0) {
            const numSegments = orchDetails.num_new_segments_to_generate;
            if (numSegments === 1 && parentGenerationId) {
              isSingleSegmentCase = true;
              console.log(`[TravelSingleSegment] Single-segment orchestrator - creating variant for parent AND child generation`);
              logger?.info("Single-segment orchestrator - creating variant on parent and child", {
                task_id: taskId,
                parent_generation_id: parentGenerationId,
                num_segments: numSegments,
                action: "create_variant_on_parent_and_child_single_segment"
              });

              // Create variant on parent so the main generation shows the video
              // Only set as primary if the parent doesn't already have a primary variant
              const { count: existingVariantCount } = await supabase
                .from('generation_variants')
                .select('id', { count: 'exact', head: true })
                .eq('generation_id', parentGenerationId);
              const isFirstParentVariant = (existingVariantCount || 0) === 0;

              await createVariantOnParent(
                supabase, parentGenerationId, publicUrl, thumbnailUrl || null, taskData, taskId,
                VARIANT_TYPES.TRAVEL_SEGMENT,
                { tool_type: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES, created_from: 'single_segment_travel', segment_index: 0, is_single_segment: true },
                null,  // variantName
                isFirstParentVariant  // makePrimary - only if first variant
              );

              // Mark orchestrator task as having created a generation
              await supabase.from('tasks').update({ generation_created: true }).eq('id', orchestratorTaskId);

              // Continue to also create child generation below (don't return early)
              console.log(`[TravelSingleSegment] Variant created, continuing to create child generation`);
            }
          }

            // Extract segment-specific params from expanded arrays
            taskData.params = extractSegmentSpecificParams(taskData.params, orchDetails, childOrder);

            // Store flag in params so it's accessible after generation creation
            if (isSingleSegmentCase) {
              taskData.params._isSingleSegmentCase = true;
            }
          }
        }
      }
    }

    // ===== CHECK FOR EXISTING GENERATION AT SAME POSITION (VARIANT CASE) =====
    // For travel segments, check if a generation already exists at that position.
    // If so, add this as a variant instead of creating a new generation.
    const pairShotGenId = taskData.params?.pair_shot_generation_id;
    const isTravelSegment = taskData.task_type === TASK_TYPES.TRAVEL_SEGMENT || 
                            taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT;
    if (parentGenerationId && isTravelSegment && childOrder !== null && !isNaN(childOrder)) {
      console.log(`[TravelSegmentVariant] Checking for existing generation at segment_index=${childOrder}, pair_shot_gen_id=${pairShotGenId || 'none'}`);
      
      let existingGenId: string | null = null;

      // Strategy 1: Try to find by pair_shot_generation_id in params (new generations have this)
      if (pairShotGenId) {
        const { data: matchByPairId, error: matchByPairIdError } = await supabase
          .from('generations')
          .select('id')
          .eq('parent_generation_id', parentGenerationId)
          .eq('is_child', true)
          .eq('params->>pair_shot_generation_id', pairShotGenId)
          .maybeSingle();

        if (!matchByPairIdError && matchByPairId?.id) {
          console.log(`[TravelSegmentVariant] Found match by pair_shot_generation_id: ${matchByPairId.id}`);
          existingGenId = matchByPairId.id;
        }
      }

      // Strategy 2: Fallback to child_order match (for old generations without pair_shot_generation_id)
      if (!existingGenId) {
        const { data: matchByChildOrder, error: matchByChildOrderError } = await supabase
          .from('generations')
          .select('id')
          .eq('parent_generation_id', parentGenerationId)
          .eq('is_child', true)
          .eq('child_order', childOrder)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!matchByChildOrderError && matchByChildOrder?.id) {
          console.log(`[TravelSegmentVariant] Found match by child_order=${childOrder}: ${matchByChildOrder.id}`);
          existingGenId = matchByChildOrder.id;
        }
      }

      if (existingGenId) {
        // Use centralized helper for single-segment detection
        const variantViewedAt = await getChildVariantViewedAt(supabase, {
          taskParams: taskData.params,
          parentGenerationId: parentGenerationId || undefined,
        });
        const isSingleSegment = variantViewedAt !== null;

        console.log(`[TravelSegmentVariant] Found existing generation ${existingGenId} - adding as non-primary variant${isSingleSegment ? ' (auto-viewed)' : ''}`);
        logger?.info("Adding travel segment as variant to existing generation", {
          task_id: taskId,
          existing_generation_id: existingGenId,
          pair_shot_generation_id: pairShotGenId,
          child_order: childOrder,
          parent_generation_id: parentGenerationId,
          is_single_segment: isSingleSegment,
          action: "add_variant_to_existing_segment"
        });

        // IMPORTANT: makePrimary=false so we *don't* replace what the user is currently seeing for that segment.
        const variantResult = await createVariantOnParent(
          supabase,
          existingGenId,
          publicUrl,
          thumbnailUrl || null,
          taskData,
          taskId,
          VARIANT_TYPES.TRAVEL_SEGMENT,
          {
            tool_type: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES,
            created_from: 'segment_variant_at_position',
            segment_index: childOrder,
            pair_shot_generation_id: pairShotGenId
          },
          null,
          false,
          variantViewedAt // viewedAt - only set for single-segment cases
        );

        if (variantResult) {
          console.log(`[TravelSegmentVariant] Successfully added variant to existing generation ${existingGenId}`);
          return variantResult;
        }

        console.error(`[TravelSegmentVariant] Failed to create variant, falling through to new generation creation`);
      } else {
        console.log(`[TravelSegmentVariant] No existing generation found at position - will create new`);
      }
    }

    // ===== STANDARD GENERATION CREATION =====
    const { shotId, addInPosition } = extractShotAndPosition(taskData.params);

    // Validate shot exists
    if (shotId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(shotId)) {
        const { data: shotData, error: shotError } = await supabase.from('shots').select('id').eq('id', shotId).single();
        if (shotError || !shotData) {
          console.log(`[GenMigration] Shot ${shotId} does not exist, proceeding without shot link`);
        }
      }
    }

    const generationType = taskData.content_type || 'image';
    const generationParams = buildGenerationParams(taskData.params, taskData.tool_type, generationType, shotId, thumbnailUrl || undefined, taskId);
    const newGenerationId = crypto.randomUUID();

    // Extract generation_name
    const generationName = taskData.params?.generation_name ||
      taskData.params?.orchestrator_details?.generation_name ||
      taskData.params?.full_orchestrator_payload?.generation_name;

    // Find based_on
    let basedOnGenerationId: string | null = extractBasedOn(taskData.params);
    if (basedOnGenerationId) {
      // Verify the based_on generation actually exists (FK constraint requires this)
      const { data: basedOnGen, error: basedOnError } = await supabase
        .from('generations')
        .select('id')
        .eq('id', basedOnGenerationId)
        .maybeSingle();

      if (basedOnError || !basedOnGen) {
        console.warn(`[GenMigration] based_on generation ${basedOnGenerationId} not found, clearing reference`);
        basedOnGenerationId = null;
      }
    }
    if (!basedOnGenerationId) {
      const sourceImageUrl = taskData.params?.image;
      if (sourceImageUrl) {
        basedOnGenerationId = await findSourceGenerationByImageUrl(supabase, sourceImageUrl);
      }
    }

    // Use individualSegmentParentId/childOrder from SPECIAL CASE 1b if set, otherwise fall back to orchestrator values
    const finalParentGenerationId = individualSegmentParentId || parentGenerationId;
    const finalIsChild = !!individualSegmentParentId || isChild;
    const finalChildOrder = individualSegmentChildOrder ?? childOrder;

    logger?.info("Creating standard generation record", {
      task_id: taskId,
      is_child: finalIsChild,
      parent_generation_id: finalParentGenerationId,
      child_order: finalChildOrder,
      based_on: basedOnGenerationId,
      shot_id: shotId,
      generation_type: generationType,
      action: finalIsChild ? "create_child_generation" : "create_standalone_generation"
    });

    // Don't set location/thumbnail on the generation record - we create variants explicitly below.
    // The sync trigger (trg_sync_generation_from_variant) will populate the generation's location
    // when we insert the primary variant.
    const generationRecord: Record<string, any> = {
      id: newGenerationId,
      tasks: [taskId],
      params: generationParams,
      type: generationType,
      project_id: taskData.project_id,
      name: generationName,
      based_on: basedOnGenerationId,
      parent_generation_id: finalParentGenerationId,
      is_child: finalIsChild,
      child_order: finalChildOrder,
      created_at: new Date().toISOString()
    };

    const newGeneration = await insertGeneration(supabase, generationRecord);
    console.log(`[GenMigration] Created generation ${newGeneration.id} for task ${taskId}`);
    logger?.info("Generation record created successfully", {
      task_id: taskId,
      generation_id: newGeneration.id,
      is_child: finalIsChild,
      parent_generation_id: finalParentGenerationId,
      child_order: finalChildOrder
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // MASTER SEGMENT LOG - Log comprehensive segment state for debugging
    // ═══════════════════════════════════════════════════════════════════════════
    const isTravelSegmentTask = taskData.task_type === TASK_TYPES.TRAVEL_SEGMENT || 
                                 taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT;
    const orchDetails = taskData.params?.orchestrator_details || 
                        taskData.params?.full_orchestrator_payload || {};
    
    if (isTravelSegmentTask && finalIsChild && finalChildOrder !== null) {
      try {
        logSegmentMasterState({
          taskId,
          generationId: newGeneration.id,
          segmentIndex: finalChildOrder,
          parentGenerationId: finalParentGenerationId,
          orchDetails,
          segmentParams: taskData.params,
          shotId: shotId || undefined,
        });
      } catch (logError) {
        // Don't let logging errors break segment creation
        console.warn('[SEGMENT_MASTER_STATE] Error logging segment state:', logError);
      }
    }
    // ═══════════════════════════════════════════════════════════════════════════

    // NOTE: Child generations (travel segments) are tracked via parent_generation_id and is_child fields.
    // They should NOT also be created as variants on the parent - that causes them to appear
    // in the variant selector when viewing the parent, which is incorrect behavior.
    // The ChildGenerationsView component fetches children correctly using the parent_generation_id relationship.

    // Create "original" variant for ALL generations (edge function owns all variant creation).
    // For child single-segment cases, also mark it as viewed (since there's nothing to "drill down" into).
    let autoViewedAt: string | null = null;
    let createdFrom = 'generation_original';

    if (finalIsChild) {
      // Use centralized helper for single-segment detection
      autoViewedAt = await getChildVariantViewedAt(supabase, {
        taskParams: taskData.params,
      });
      createdFrom = autoViewedAt ? 'single_segment_child_original' : 'child_generation_original';
    }

    console.log(`[GenMigration] Creating original variant for generation ${newGeneration.id}${finalIsChild ? ' (child)' : ''}${autoViewedAt ? ' (auto-viewed)' : ''}`);
    await createVariant(
      supabase,
      newGeneration.id,
      publicUrl,
      thumbnailUrl || null,
      {
        ...generationParams,
        source_task_id: taskId,
        created_from: createdFrom,
      },
      true, // is_primary
      'original',
      null, // name
      autoViewedAt // viewedAt - only set for single-segment child cases
    );
    console.log(`[GenMigration] Created original variant for generation`);

    // Link to shot if applicable (not for child generations)
    if (shotId && !finalIsChild) {
      await linkGenerationToShot(supabase, shotId, newGeneration.id, addInPosition);
    }

    // Mark task as having created a generation
    await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);

    console.log(`[GenMigration] Successfully completed generation creation for task ${taskId}`);
    return newGeneration;

  } catch (error) {
    console.error(`[GenMigration] Error creating generation for task ${taskId}:`, error);
    logger?.error("Error creating generation", {
      task_id: taskId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// ===== VARIANT HANDLERS FOR SPECIFIC TASK TYPES =====

/**
 * Handle inpaint/edit tasks - create variant on source generation
 */
export async function handleVariantCreation(
  supabase: any,
  taskId: string,
  taskData: any,
  basedOnGenerationId: string,
  publicUrl: string,
  thumbnailUrl: string | null
): Promise<boolean> {
  console.log(`[ImageEdit] Task ${taskId} has based_on=${basedOnGenerationId} - creating variant`);
  
  try {
    const { data: sourceGen, error: fetchError } = await supabase
      .from('generations')
      .select('id, params, thumbnail_url, project_id')
      .eq('id', basedOnGenerationId)
      .single();

    if (fetchError || !sourceGen) {
      console.error(`[ImageEdit] Source generation ${basedOnGenerationId} not found:`, fetchError);
      return false;
    }

    const variantParams = {
      ...taskData.params,
      source_task_id: taskId,
      source_variant_id: taskData.params?.source_variant_id || null,
      created_from: taskData.task_type,
      tool_type: taskData.tool_type,
      content_type: taskData.content_type,
    };

    const variantType = getEditVariantType(taskData.task_type);

    await createVariant(
      supabase,
      basedOnGenerationId,
      publicUrl,
      thumbnailUrl,
      variantParams,
      false,
      variantType,
      taskData.params?.prompt ? `Edit: ${taskData.params.prompt.substring(0, 40)}...` : 'Edit'
    );

    console.log(`[ImageEdit] Successfully created ${variantType} variant on generation ${basedOnGenerationId}`);

    await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);
    return true;

  } catch (variantErr) {
    console.error(`[ImageEdit] Error creating variant for task ${taskId}:`, variantErr);
    return false;
  }
}

/**
 * Handle upscale tasks - create primary variant
 */
export async function handleUpscaleVariant(
  supabase: any,
  taskId: string,
  taskData: any,
  publicUrl: string,
  thumbnailUrl: string | null
): Promise<void> {
  console.log(`[ImageUpscale] Processing upscale task ${taskId}`);

  const generationId = taskData.params?.generation_id;
  if (!generationId) {
    console.log(`[ImageUpscale] No generation_id in task params, skipping`);
    return;
  }

  try {
    const { data: sourceGen, error: fetchError } = await supabase
      .from('generations')
      .select('params, thumbnail_url')
      .eq('id', generationId)
      .single();

    if (fetchError) {
      console.error(`[ImageUpscale] Error fetching source generation:`, fetchError);
    }
    
    const upscaleParams = {
      ...(sourceGen?.params || {}),
      upscale_task_id: taskId,
      upscaled_from: taskData.params?.image || null,
      upscale_model: taskData.params?.model || 'unknown',
      tool_type: sourceGen?.params?.tool_type || 'image-generation'
    };
    
    await createVariant(
      supabase,
      generationId,
      publicUrl,
      thumbnailUrl || sourceGen?.thumbnail_url || null,
      upscaleParams,
      true,
      'upscaled',
      'Upscaled'
    );
    
    console.log(`[ImageUpscale] Successfully created upscaled variant for generation ${generationId}`);
  } catch (updateErr) {
    console.error(`[ImageUpscale] Exception creating upscaled variant:`, updateErr);
  }
}

