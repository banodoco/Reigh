/**
 * Segment-specific logic for travel between images
 * Handles param extraction and logging for multi-segment video generations
 */

import { extractFromArray } from './generation-core.ts';

// ============================================================================
// MASTER SEGMENT LOG - For debugging FE vs BE discrepancies
// ============================================================================

/**
 * Logs a comprehensive summary of a segment after creation.
 * This allows comparison between what was submitted and what the backend processed.
 */
export function logSegmentMasterState(params: {
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
  console.log(`${TAG} SEGMENT CREATION SUMMARY`);
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
  console.log(`\n${TAG} SEGMENT DATA (Index ${segmentIndex})`);
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

  console.log(`${TAG}   Prompt: ${hasCustomPrompt ? 'CUSTOM:' : 'DEFAULT:'} ${promptPreview}`);
  if (enhancedPrompt) {
    console.log(`${TAG}   Enhanced: ${enhancedPreview}`);
  }
  console.log(`${TAG}   Negative: ${negPreview}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: INPUT IMAGES FOR THIS SEGMENT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n${TAG} INPUT IMAGES`);
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
  console.log(`\n${TAG} STRUCTURE VIDEOS`);
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

  console.log(`${TAG}   Segment Frame Range: ${segStartFrame} -> ${segEndFrame}`);

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
        console.log(`${TAG}   Video ${idx}: AFFECTS THIS SEGMENT`);
        console.log(`${TAG}     Path: ${pathShort}`);
        console.log(`${TAG}     Video Range: ${svStart} -> ${svEnd}`);
        console.log(`${TAG}     Type: ${sv.structure_type || 'flow'} | Treatment: ${sv.treatment || 'adjust'} | Motion: ${sv.motion_strength || 1.0}`);
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
  console.log(`\n${TAG} MODEL & SETTINGS`);
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
  console.log(`\n${TAG} ORCHESTRATOR CONTEXT`);
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
export function extractSegmentSpecificParams(
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
