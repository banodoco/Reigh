import { GenerationRow } from "@/types/shots";
import { isVideoGeneration } from "@/shared/lib/typeGuards";

/**
 * Check if a generation is a video type
 * @deprecated Use isVideoGeneration from @/shared/lib/typeGuards instead
 */
export const isGenerationVideo = isVideoGeneration;

/**
 * Filter and sort shot images, excluding videos without positions
 */
export const filterAndSortShotImages = (images: GenerationRow[]): GenerationRow[] => {
  const filtered = images.filter(img => {
    const hasTimelineFrame = img.timeline_frame != null;
    const isVideo = isVideoGeneration(img);
    
    // Include if it has a timeline_frame OR if it's a video (videos can have null timeline_frames)
    return hasTimelineFrame || isVideo;
  });
  
  // Sort by position (ascending) to maintain user-intended order
  filtered.sort((a, b) => {
    // Sort by timeline_frame (ascending), then by created date for stable ordering
    const frameA = a.timeline_frame;
    const frameB = b.timeline_frame;
    if (frameA != null && frameB != null) return frameA - frameB;   // ascending
    if (frameA != null) return -1;
    if (frameB != null) return 1;
    // fall back to createdAt (newest last so order is stable)
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });
  
  return filtered;
};

/**
 * Extract non-video images from a list of generations
 */
export const getNonVideoImages = (images: GenerationRow[]): GenerationRow[] => {
  return images.filter(g => !isVideoGeneration(g));
};

/**
 * Extract video outputs from a list of generations
 */
export const getVideoOutputs = (images: GenerationRow[]): GenerationRow[] => {
  return images.filter(g => isVideoGeneration(g));
}; 