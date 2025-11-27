import { GenerationRow } from '@/types/shots';

/**
 * Calculate frame position for inserting at a given index
 * The frame position should be the midpoint between surrounding images
 */
export const getFramePositionForIndex = (
  index: number,
  currentImages: GenerationRow[],
  batchVideoFrames: number
): number | undefined => {
  console.log('[BatchDropPositionIssue] 📊 getFramePositionForIndex called:', {
    index,
    currentImagesLength: currentImages.length,
    batchVideoFrames,
    timestamp: Date.now()
  });

  if (currentImages.length === 0) {
    console.log('[BatchDropPositionIssue] 🆕 NO IMAGES - RETURNING 0');
    return 0;
  }
  
  if (index === 0) {
    const firstImage = currentImages[0];
    const firstFrame = firstImage.timeline_frame ?? 0;
    const result = Math.max(0, Math.floor(firstFrame / 2));
    console.log('[BatchDropPositionIssue] 🔝 INSERTING AT START:', {
      firstFrame,
      result
    });
    return result;
  }
  
  if (index >= currentImages.length) {
    const lastImage = currentImages[currentImages.length - 1];
    const lastFrame = lastImage.timeline_frame ?? (currentImages.length - 1) * batchVideoFrames;
    const result = lastFrame + batchVideoFrames;
    console.log('[BatchDropPositionIssue] 🔚 INSERTING AT END:', {
      lastFrame,
      result
    });
    return result;
  }
  
  const prevImage = currentImages[index - 1];
  const nextImage = currentImages[index];
  const prevFrame = prevImage.timeline_frame ?? (index - 1) * batchVideoFrames;
  const nextFrame = nextImage.timeline_frame ?? index * batchVideoFrames;
  const result = Math.floor((prevFrame + nextFrame) / 2);
  
  console.log('[BatchDropPositionIssue] 🔄 INSERTING BETWEEN:', {
    index,
    prevFrame,
    nextFrame,
    midpoint: result
  });
  
  return result;
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

