/**
 * Shared filtering utilities for shot generations
 * 
 * IMPORTANT: These filters MUST be kept in sync across:
 * - UI display (Timeline, ShotImagesEditor)
 * - Save operations (useEnhancedShotPositions)
 * - Generation operations (ShotEditor)
 * 
 * The bug fixed on 2025-10-04 was caused by inconsistent filtering between
 * UI (which includes items with timeline_frame: null) and generation code
 * (which was excluding them), causing pair prompt indexes to mismatch.
 */

export interface ShotGenerationLike {
  generation?: {
    type?: string;
    location?: string;
  } | null;
  timeline_frame?: number | null;
}

/**
 * Filter to exclude videos from shot generations
 * 
 * This is the CANONICAL filter for determining which shot_generations
 * should be included when working with pairs and prompts.
 * 
 * Rules:
 * - MUST have a generation object
 * - MUST NOT be a video (type includes 'video' or location ends with .mp4)
 * - timeline_frame can be null (items without positions are still valid)
 * 
 * @param sg Shot generation entry
 * @returns true if this is a non-video generation that should be included
 */
export function isNonVideoGeneration(sg: ShotGenerationLike): boolean {
  // Must have a generation
  if (!sg.generation) return false;
  
  // Filter out videos
  const isVideo = 
    sg.generation.type === 'video' ||
    sg.generation.type === 'video_travel_output' ||
    (sg.generation.location && sg.generation.location.endsWith('.mp4'));
  
  return !isVideo;
}

/**
 * Filter to get only generations with valid timeline positions
 * 
 * Use this when you need to calculate frame gaps or work with positioned items.
 * 
 * @param sg Shot generation entry
 * @returns true if has a valid timeline_frame
 */
export function hasValidTimelineFrame(sg: ShotGenerationLike): boolean {
  return sg.timeline_frame !== null && sg.timeline_frame !== undefined;
}

/**
 * Get non-video generations for pair operations
 * 
 * This should be used whenever working with pair prompts to ensure
 * consistent indexing between UI, save, and generation operations.
 * 
 * @param shotGenerations Array of shot generations
 * @returns Filtered array of non-video generations
 */
export function getNonVideoGenerations<T extends ShotGenerationLike>(
  shotGenerations: T[]
): T[] {
  return shotGenerations.filter(isNonVideoGeneration);
}

/**
 * Get positioned non-video generations for frame gap calculations
 * 
 * Use this when you need to calculate frame gaps between positioned items.
 * 
 * @param shotGenerations Array of shot generations
 * @returns Filtered array of positioned non-video generations
 */
export function getPositionedNonVideoGenerations<T extends ShotGenerationLike>(
  shotGenerations: T[]
): T[] {
  return shotGenerations
    .filter(isNonVideoGeneration)
    .filter(hasValidTimelineFrame);
}
