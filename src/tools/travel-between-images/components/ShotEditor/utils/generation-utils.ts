import { GenerationRow } from "@/types/shots";

/**
 * Check if a generation is a video type
 */
export const isGenerationVideo = (gen: GenerationRow): boolean => {
  const hasVideoType = gen.type === 'video' || gen.type === 'video_travel_output';
  const hasVideoLocation = gen.location && gen.location.endsWith('.mp4');
  const hasVideoUrl = gen.imageUrl && gen.imageUrl.endsWith('.mp4');
  const result = hasVideoType || hasVideoLocation || hasVideoUrl;
  
  // [VideoLoadSpeedIssue] Video classification working correctly - debug removed for performance
  
  return result;
};

/**
 * Filter and sort shot images, excluding videos without positions
 */
export const filterAndSortShotImages = (images: GenerationRow[]): GenerationRow[] => {
  const filtered = images.filter(img => {
    const hasTimelineFrame = (img as any).timeline_frame !== null && (img as any).timeline_frame !== undefined;
    const isVideo = isGenerationVideo(img);
    
    // Include if it has a timeline_frame OR if it's a video (videos can have null timeline_frames)
    return hasTimelineFrame || isVideo;
  });
  
  // Sort by position (ascending) to maintain user-intended order
  filtered.sort((a, b) => {
    // Sort by timeline_frame (ascending), then by created date for stable ordering
    const frameA = (a as any).timeline_frame;
    const frameB = (b as any).timeline_frame;
    if (frameA != null && frameB != null) return frameA - frameB;   // ascending
    if (frameA != null) return -1;
    if (posB != null) return 1;
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
  return images.filter(g => !isGenerationVideo(g));
};

/**
 * Extract video outputs from a list of generations
 */
export const getVideoOutputs = (images: GenerationRow[]): GenerationRow[] => {
  return images.filter(g => isGenerationVideo(g));
}; 