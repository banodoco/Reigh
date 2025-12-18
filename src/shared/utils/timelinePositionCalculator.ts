/**
 * Unified Timeline Position Calculator
 * 
 * This utility ensures that new items added to a timeline always get unique
 * timeline_frame positions, preventing collisions that can cause display issues.
 * 
 * Used by:
 * - BatchDropZone (batch mode file/generation drops)
 * - Timeline (timeline mode file/generation drops)
 * - useAddImageToShot (add to shot button)
 * - handleTimelineImageDrop / handleTimelineGenerationDrop
 * - handleBatchImageDrop / handleBatchGenerationDrop
 */

/** Default/max spacing when no existing items to calculate average from */
export const DEFAULT_FRAME_SPACING = 81;

/** Minimum spacing to use even if average is lower (prevents overly tight timelines) */
export const MIN_FRAME_SPACING = 10;

/**
 * Calculate the average spacing between existing frames in a timeline.
 * Returns the default spacing if there aren't enough items to calculate an average.
 * 
 * @param existingFrames - Array of existing frame positions
 * @param defaultSpacing - Fallback spacing if average can't be calculated
 * @returns The average spacing, clamped between MIN_FRAME_SPACING and DEFAULT_FRAME_SPACING
 */
export const calculateAverageSpacing = (
  existingFrames: number[],
  defaultSpacing: number = DEFAULT_FRAME_SPACING
): number => {
  // Need at least 2 items to calculate spacing
  if (existingFrames.length < 2) {
    return defaultSpacing;
  }
  
  const sortedFrames = [...existingFrames].sort((a, b) => a - b);
  const minFrame = sortedFrames[0];
  const maxFrame = sortedFrames[sortedFrames.length - 1];
  
  // Calculate average: total span divided by number of gaps
  const totalSpan = maxFrame - minFrame;
  const numGaps = sortedFrames.length - 1;
  const averageSpacing = Math.round(totalSpan / numGaps);
  
  // Clamp between min (10) and max (81) to prevent outliers from causing huge gaps
  return Math.min(DEFAULT_FRAME_SPACING, Math.max(MIN_FRAME_SPACING, averageSpacing));
};

/**
 * Calculate a unique timeline frame that doesn't collide with existing frames.
 * 
 * @param targetFrame - The desired frame position
 * @param existingFrames - Array of existing frame positions in the shot
 * @param minGap - Minimum gap between frames (default: 1)
 * @returns A unique frame position that doesn't collide with existing frames
 */
export const ensureUniqueFrame = (
  targetFrame: number,
  existingFrames: number[],
  minGap: number = 1
): number => {
  // Normalize to integer
  let frame = Math.max(0, Math.round(targetFrame));
  
  // If no collision, return as-is
  if (!existingFrames.includes(frame)) {
    return frame;
  }
  
  // Find nearest available position using expanding search
  // Try +1, -1, +2, -2, etc. until we find an available slot
  let offset = 1;
  const maxOffset = 1000; // Safety limit
  
  while (offset < maxOffset) {
    // Try higher first (more natural for timeline)
    const higher = frame + offset;
    if (!existingFrames.includes(higher)) {
      console.log('[UniqueFrame] 🔄 Collision resolved:', {
        original: targetFrame,
        collision: frame,
        resolved: higher,
        direction: 'higher',
        offset
      });
      return higher;
    }
    
    // Then try lower (but not below 0)
    const lower = frame - offset;
    if (lower >= 0 && !existingFrames.includes(lower)) {
      console.log('[UniqueFrame] 🔄 Collision resolved:', {
        original: targetFrame,
        collision: frame,
        resolved: lower,
        direction: 'lower',
        offset
      });
      return lower;
    }
    
    offset += minGap;
  }
  
  // Fallback: append at end (should never reach here)
  const maxFrame = existingFrames.length > 0 ? Math.max(...existingFrames) : 0;
  const fallback = maxFrame + DEFAULT_FRAME_SPACING;
  console.warn('[UniqueFrame] ⚠️ Fallback used:', {
    original: targetFrame,
    fallback,
    existingCount: existingFrames.length
  });
  return fallback;
};

/**
 * Calculate unique positions for multiple items being added at once.
 * Ensures all new items get unique positions relative to existing items AND each other.
 * 
 * @param startFrame - The starting frame for the first item
 * @param count - Number of items to position
 * @param existingFrames - Array of existing frame positions
 * @param spacing - Spacing between consecutive items (default: 1)
 * @returns Array of unique frame positions for each item
 */
export const calculateUniqueFramesForBatch = (
  startFrame: number,
  count: number,
  existingFrames: number[],
  spacing: number = 1
): number[] => {
  const result: number[] = [];
  const allUsedFrames = [...existingFrames];
  
  for (let i = 0; i < count; i++) {
    const targetFrame = startFrame + (i * spacing);
    const uniqueFrame = ensureUniqueFrame(targetFrame, allUsedFrames);
    result.push(uniqueFrame);
    // Add to used frames so subsequent items don't collide with this one
    allUsedFrames.push(uniqueFrame);
  }
  
  console.log('[UniqueFrame] 📦 Batch positions calculated:', {
    startFrame,
    count,
    spacing,
    existingCount: existingFrames.length,
    results: result
  });
  
  return result;
};

/**
 * Calculate frame position for inserting at a given index, with collision detection.
 * This is an enhanced version of getFramePositionForIndex that ensures uniqueness.
 * Uses average spacing of existing items when appending at end.
 * 
 * @param index - The grid index where the item is being inserted
 * @param existingFrames - Array of existing frame positions (sorted by timeline_frame)
 * @param explicitSpacing - Optional explicit spacing (overrides average calculation for end insertion)
 * @returns A unique frame position
 */
export const calculateFrameForIndex = (
  index: number,
  existingFrames: number[],
  explicitSpacing?: number
): number => {
  // Sort frames to ensure correct neighbor calculation
  const sortedFrames = [...existingFrames].sort((a, b) => a - b);
  
  let targetFrame: number;
  
  if (sortedFrames.length === 0) {
    // Empty timeline - start at 0
    targetFrame = 0;
  } else if (index === 0) {
    // Inserting at beginning - use half of first frame
    const firstFrame = sortedFrames[0];
    targetFrame = Math.max(0, Math.floor(firstFrame / 2));
  } else if (index >= sortedFrames.length) {
    // Inserting at end - use average spacing or explicit
    const spacing = explicitSpacing ?? calculateAverageSpacing(sortedFrames);
    const lastFrame = sortedFrames[sortedFrames.length - 1];
    targetFrame = lastFrame + spacing;
  } else {
    // Inserting in middle - use midpoint between neighbors
    const prevFrame = sortedFrames[index - 1];
    const nextFrame = sortedFrames[index];
    targetFrame = Math.floor((prevFrame + nextFrame) / 2);
  }
  
  // Ensure the calculated frame is unique
  return ensureUniqueFrame(targetFrame, sortedFrames);
};

/**
 * Calculate the next available frame for appending to a timeline.
 * Uses the average spacing of existing items to maintain consistent spacing.
 * 
 * @param existingFrames - Array of existing frame positions
 * @param explicitSpacing - Optional explicit spacing (overrides average calculation)
 * @returns A unique frame position at the end of the timeline
 */
export const calculateNextAvailableFrame = (
  existingFrames: number[],
  explicitSpacing?: number
): number => {
  if (existingFrames.length === 0) {
    return 0;
  }
  
  // Use explicit spacing if provided, otherwise calculate average
  const spacing = explicitSpacing ?? calculateAverageSpacing(existingFrames);
  
  const maxFrame = Math.max(...existingFrames);
  const targetFrame = maxFrame + spacing;
  
  // Should always be unique since we're adding after max, but check anyway
  return ensureUniqueFrame(targetFrame, existingFrames);
};

/**
 * Extract timeline_frame values from an array of shot generations or images.
 * Filters out null/undefined values and videos.
 * 
 * @param items - Array of items with timeline_frame property
 * @returns Array of valid frame numbers
 */
export const extractExistingFrames = (
  items: Array<{ timeline_frame?: number | null; type?: string }>
): number[] => {
  return items
    .filter(item => {
      // Filter out videos
      if (item.type === 'video') return false;
      // Filter out null/undefined frames
      if (item.timeline_frame == null) return false;
      // Filter out unpositioned items (timeline_frame === -1)
      if (item.timeline_frame === -1) return false;
      return true;
    })
    .map(item => item.timeline_frame as number);
};





