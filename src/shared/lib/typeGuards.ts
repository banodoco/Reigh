/**
 * Type guards and filter utilities for generation data
 * 
 * CANONICAL source for video detection, position checking, and sorting.
 * All other files should import from here to avoid duplication.
 * 
 * Supports two data structures:
 * 1. GenerationRow (flattened) - type, location, imageUrl at top level
 * 2. ShotGeneration (nested) - type, location nested under .generation or .generations
 */

import { GenerationRow, TimelineGenerationRow } from '@/types/shots';

// ============================================================================
// TYPE DEFINITIONS for different data structures
// ============================================================================

/** Minimal interface for nested shot_generation records (singular .generation) */
export interface ShotGenerationLike {
  generation?: {
    type?: string;
    location?: string;
  } | null;
  timeline_frame?: number | null;
}

/** Minimal interface for nested shot_generation records (plural .generations) */
export interface ShotGenerationsLike {
  generations?: {
    type?: string;
    location?: string;
  } | null;
  timeline_frame?: number | null;
}

/** Union type for any item with potential timeline_frame */
export interface PositionedItem {
  timeline_frame?: number | null;
}

// ============================================================================
// VIDEO DETECTION - Multiple overloads for different data structures
// ============================================================================

/** Video file extensions to check */
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'] as const;

/** 
 * Check if a URL/path ends with a video extension
 * Exported for use in URL-only video detection scenarios
 */
export function hasVideoExtension(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Check if a flattened GenerationRow is a video
 * Checks: type, location, and imageUrl at top level
 */
export function isVideoGeneration(gen: GenerationRow): boolean {
  return (
    gen.type === 'video' ||
    gen.type === 'video_travel_output' ||
    hasVideoExtension(gen.location) ||
    hasVideoExtension(gen.imageUrl)
  );
}

/**
 * Check if a nested ShotGeneration (with .generation property) is a video
 * Used by: useEnhancedShotPositions, and other places with nested structure
 */
export function isVideoShotGeneration(sg: ShotGenerationLike): boolean {
  if (!sg.generation) return false;
  return (
    sg.generation.type === 'video' ||
    sg.generation.type === 'video_travel_output' ||
    hasVideoExtension(sg.generation.location)
  );
}

/**
 * Check if a nested ShotGeneration (with plural .generations property) is a video
 * Used by: generateVideoService and other places using Supabase's pluralized joins
 */
export function isVideoShotGenerations(sg: ShotGenerationsLike): boolean {
  if (!sg.generations) return false;
  return (
    sg.generations.type === 'video' ||
    sg.generations.type === 'video_travel_output' ||
    hasVideoExtension(sg.generations.location)
  );
}

/**
 * Universal video check that handles any structure
 * Checks both flattened and nested properties
 * Use when data structure is uncertain or mixed
 */
export function isVideoAny(item: {
  type?: string | null;
  location?: string | null;
  imageUrl?: string | null;
  url?: string | null; // Some components use .url instead of .imageUrl
  thumbUrl?: string | null;
  generation?: { type?: string; location?: string } | null;
  generations?: { type?: string; location?: string } | null;
}): boolean {
  // Check type field
  if (item.type === 'video' || item.type === 'video_travel_output') return true;
  
  // Check all URL fields for video extensions
  if (hasVideoExtension(item.location)) return true;
  if (hasVideoExtension(item.imageUrl)) return true;
  if (hasVideoExtension(item.url)) return true;
  if (hasVideoExtension(item.thumbUrl)) return true;
  
  // Check nested .generation
  if (item.generation?.type === 'video' || item.generation?.type === 'video_travel_output') return true;
  if (hasVideoExtension(item.generation?.location)) return true;
  
  // Check nested .generations (plural)
  if (item.generations?.type === 'video' || item.generations?.type === 'video_travel_output') return true;
  if (hasVideoExtension(item.generations?.location)) return true;
  
  return false;
}

// ============================================================================
// POSITION CHECKING
// ============================================================================

/**
 * Check if an item has a valid timeline position
 * Excludes null, undefined, and the -1 sentinel value used for unpositioned items
 */
export function isPositioned(item: PositionedItem): boolean {
  return item.timeline_frame != null && item.timeline_frame !== -1;
}

/**
 * Check if an item is positioned (alias for backward compat with existing code patterns)
 */
export function hasValidTimelineFrame(item: PositionedItem): boolean {
  return isPositioned(item);
}

// ============================================================================
// SORTING
// ============================================================================

/**
 * Sort items by timeline_frame ascending
 * Returns a NEW array (does not mutate)
 */
export function sortByTimelineFrame<T extends PositionedItem>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
}

// ============================================================================
// COMBINED FILTER + SORT for common use cases
// ============================================================================

/**
 * Filter and sort GenerationRow array for timeline/batch display
 * Removes videos, keeps only positioned items, sorts by timeline_frame
 * 
 * This is the CANONICAL filter for UI display of images.
 */
export function filterImagesForDisplay(images: GenerationRow[]): GenerationRow[] {
  return sortByTimelineFrame(
    images.filter(img => isPositioned(img) && !isVideoGeneration(img))
  );
}

/**
 * Filter ShotGeneration array (nested structure) for display
 * Removes videos, keeps only positioned items, sorts by timeline_frame
 */
export function filterShotGenerationsForDisplay<T extends ShotGenerationLike>(
  shotGenerations: T[]
): T[] {
  return sortByTimelineFrame(
    shotGenerations.filter(sg => 
      sg.generation && 
      isPositioned(sg) && 
      !isVideoShotGeneration(sg)
    )
  );
}

// ============================================================================
// INVERSE UTILITIES
// ============================================================================

/**
 * Type guard to check if a generation is an image (not a video)
 */
export function isImageGeneration(gen: GenerationRow): boolean {
  return !isVideoGeneration(gen);
}

/**
 * Type guard to check if a generation is suitable for timeline display
 * Ensures both timeline_frame and metadata are present
 * 
 * @example
 * ```typescript
 * const timelineImages = allImages.filter(isTimelineGeneration);
 * // TypeScript now knows timelineImages have metadata and timeline_frame
 * timelineImages.forEach(img => {
 *   console.log(img.metadata.pair_prompt); // No type error!
 * });
 * ```
 */
export function isTimelineGeneration(gen: GenerationRow): gen is TimelineGenerationRow {
  return (
    gen.timeline_frame != null && 
    gen.metadata != null
  );
}

