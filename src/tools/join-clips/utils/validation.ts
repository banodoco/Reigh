/**
 * Join Clips Validation Utilities
 * 
 * Calculates frame requirements and provides info for constraining
 * UI sliders to prevent invalid settings.
 */

export interface ClipFrameInfo {
  index: number;
  name: string;
  frameCount: number;
  durationSeconds?: number;
  source: 'metadata' | 'estimated' | 'unknown';
}

export interface ValidationResult {
  valid: boolean;
  shortestClipFrames: number;
  maxSafeGap: number;
  maxSafeContext: number;
}

/**
 * Get the minimum frames required from a clip based on its position
 * 
 * In REPLACE mode:
 * - First clip: needs contextFrames + ceil(gapFrames/2) from the END
 * - Last clip: needs contextFrames + floor(gapFrames/2) from the START
 * - Middle clips: need frames from BOTH ends for two transitions
 * 
 * In INSERT mode:
 * - Only need contextFrames (no frames are removed from source clips)
 */
export function getMinFramesRequired(
  contextFrames: number,
  gapFrames: number,
  replaceMode: boolean,
  position: 'first' | 'middle' | 'last'
): { fromStart: number; fromEnd: number; total: number } {
  if (!replaceMode) {
    // INSERT mode - only need context frames, clips aren't shortened
    const needed = contextFrames;
    switch (position) {
      case 'first':
        return { fromStart: 0, fromEnd: needed, total: needed };
      case 'last':
        return { fromStart: needed, fromEnd: 0, total: needed };
      case 'middle':
        return { fromStart: needed, fromEnd: needed, total: needed * 2 };
    }
  }

  // REPLACE mode - need context + portion of gap
  const gapFromFirst = Math.ceil(gapFrames / 2);
  const gapFromSecond = Math.floor(gapFrames / 2);

  switch (position) {
    case 'first':
      const firstEnd = contextFrames + gapFromFirst;
      return { fromStart: 0, fromEnd: firstEnd, total: firstEnd };
    case 'last':
      const lastStart = contextFrames + gapFromSecond;
      return { fromStart: lastStart, fromEnd: 0, total: lastStart };
    case 'middle':
      const midStart = contextFrames + gapFromSecond;
      const midEnd = contextFrames + gapFromFirst;
      return { fromStart: midStart, fromEnd: midEnd, total: midStart + midEnd };
  }
}

/**
 * Get clip position based on index and total count
 */
export function getClipPosition(index: number, totalClips: number): 'first' | 'middle' | 'last' {
  if (index === 0) return 'first';
  if (index === totalClips - 1) return 'last';
  return 'middle';
}

/**
 * Calculate effective frame count based on duration and target FPS
 */
export function calculateEffectiveFrameCount(
  durationSeconds: number,
  useInputVideoFps: boolean,
  inputVideoFps?: number
): number {
  // If using input video FPS, use that (or estimate 24fps for typical videos)
  // Otherwise, default to 16fps which is what the backend uses
  const targetFps = useInputVideoFps ? (inputVideoFps || 24) : 16;
  return Math.floor(durationSeconds * targetFps);
}

/**
 * Validate clips and calculate constraints for UI sliders.
 * Returns shortestClipFrames which is used to limit slider max values.
 */
export function validateClipsForJoin(
  clipFrameInfos: ClipFrameInfo[],
  contextFrameCount: number,
  gapFrameCount: number,
  replaceMode: boolean
): ValidationResult {
  const totalClips = clipFrameInfos.length;

  if (totalClips < 2) {
    return {
      valid: false,
      shortestClipFrames: 0,
      maxSafeGap: 0,
      maxSafeContext: 0,
    };
  }

  // Find shortest clip
  const shortestClipFrames = Math.min(...clipFrameInfos.map(c => c.frameCount));

  // Calculate max safe settings based on shortest clip
  let maxSafeGap = 0;
  let maxSafeContext = 0;

  if (shortestClipFrames > 0) {
    if (replaceMode) {
      // Max gap: 2 * (shortestClipFrames - contextFrameCount) - 1
      maxSafeGap = Math.max(1, 2 * (shortestClipFrames - contextFrameCount) - 1);
      // Quantize to valid 4N+1 value
      maxSafeGap = Math.max(1, Math.floor((maxSafeGap - 1) / 4) * 4 + 1);
      
      // Max context for current gap
      const gapPortion = Math.ceil(gapFrameCount / 2);
      maxSafeContext = Math.max(4, shortestClipFrames - gapPortion);
    } else {
      // INSERT mode - gap doesn't affect clip length requirements
      maxSafeGap = 81;
      maxSafeContext = shortestClipFrames;
    }
  }

  // Check if current settings are valid
  const valid = clipFrameInfos.every((clip) => {
    const position = getClipPosition(clip.index, totalClips);
    const required = getMinFramesRequired(contextFrameCount, gapFrameCount, replaceMode, position);
    return clip.frameCount >= required.total;
  });

  return {
    valid,
    shortestClipFrames,
    maxSafeGap,
    maxSafeContext,
  };
}








