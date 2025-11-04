/**
 * Type guards for generation data
 * These functions help TypeScript narrow types and provide runtime validation
 */

import { GenerationRow, TimelineGenerationRow } from '@/types/shots';

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

/**
 * Type guard to check if a generation is a video
 * Useful for filtering out videos from image-only displays
 */
export function isVideoGeneration(gen: GenerationRow): boolean {
  return (
    gen.type === 'video' ||
    gen.type === 'video_travel_output' ||
    (gen.location != null && gen.location.endsWith('.mp4')) ||
    (gen.imageUrl != null && gen.imageUrl.endsWith('.mp4'))
  );
}

/**
 * Type guard to check if a generation is an image (not a video)
 */
export function isImageGeneration(gen: GenerationRow): boolean {
  return !isVideoGeneration(gen);
}

