import { GenerationRow } from '@/types/shots';
import { 
  calculateFrameForIndex, 
  extractExistingFrames 
} from '@/shared/utils/timelinePositionCalculator';

/**
 * Calculate frame position for inserting at a given index
 * The frame position should be the midpoint between surrounding images,
 * with collision detection to ensure uniqueness.
 * 
 * NOTE: This calculates timeline_frame (the frame number for video export),
 * NOT the grid index position. The grid index comes from BatchDropZone.
 * 
 * IMPORTANT: currentImages are GenerationRow objects where:
 * - .id = shot_generations.id (unique per shot entry)
 * - .generation_id = generations.id (the actual generation)
 * - .timeline_frame = frame number for video positioning
 */
export const getFramePositionForIndex = (
  index: number,
  currentImages: GenerationRow[],
  batchVideoFrames: number
): number | undefined => {
  // Extract existing frames from current images (filters out videos and null frames)
  const existingFrames = extractExistingFrames(currentImages);
  
  // Use unified calculator with collision detection
  return calculateFrameForIndex(index, existingFrames, batchVideoFrames);
};

/**
 * Get range of image IDs between two indices (inclusive)
 */
export const getImageRange = (
  startIndex: number,
  endIndex: number,
  currentImages: GenerationRow[]
): string[] => {
  const minIndex = Math.min(startIndex, endIndex);
  const maxIndex = Math.max(startIndex, endIndex);
  const rangeIds: string[] = [];
  
  for (let i = minIndex; i <= maxIndex; i++) {
    if (currentImages[i]) {
      // img.id is shot_generations.id - unique per entry
      rangeIds.push(currentImages[i].id);
    }
  }
  
  return rangeIds;
};

/**
 * Calculate aspect ratio style for images
 */
export const getAspectRatioStyle = (projectAspectRatio?: string) => {
  if (projectAspectRatio) {
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (!isNaN(w) && !isNaN(h)) {
      const aspectRatio = w / h;
      return { aspectRatio: `${aspectRatio}` };
    }
  }
  
  // Default to square aspect ratio
  return { aspectRatio: '1' };
};

