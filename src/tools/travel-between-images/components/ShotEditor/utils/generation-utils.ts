import { GenerationRow } from "@/types/shots";

/**
 * Check if a generation is a video type
 */
export const isGenerationVideo = (gen: GenerationRow): boolean => {
  const result = gen.type === 'video' ||
         gen.type === 'video_travel_output' ||
         (gen.location && gen.location.endsWith('.mp4')) ||
         (gen.imageUrl && gen.imageUrl.endsWith('.mp4'));
  
  return result;
};

/**
 * Filter and sort shot images, excluding videos without positions
 */
export const filterAndSortShotImages = (images: GenerationRow[]): GenerationRow[] => {
  const filtered = images.filter(img => {
    const hasPosition = (img as any).position !== null && (img as any).position !== undefined;
    const isVideo = isGenerationVideo(img);
    
    // Include if it has a position OR if it's a video (videos can have null positions)
    return hasPosition || isVideo;
  });
  
  // Sort by position (ascending) to maintain user-intended order
  filtered.sort((a, b) => {
    // Sort by position (ascending), then by created date for stable ordering
    const posA = (a as any).position;
    const posB = (b as any).position;
    if (posA != null && posB != null) return posA - posB;   // ascending
    if (posA != null) return -1;
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