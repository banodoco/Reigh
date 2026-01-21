/**
 * Join Clips Validation Utilities
 *
 * Calculates frame requirements and provides info for constraining
 * UI sliders to prevent invalid settings.
 *
 * CONSTRAINT (to avoid double-blending artifacts in REPLACE mode):
 *   min_clip_frames ≥ gap_frame_count + 2 × context_frame_count
 *
 * Examples:
 * | gap_frame_count | context_frame_count | min_clip_frames |
 * |-----------------|---------------------|-----------------|
 * | 23              | 15                  | 53              |
 * | 23              | 11                  | 45              |
 * | 15              | 15                  | 45              |
 * | 53              | 8                   | 69              |
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
  /** Minimum frames required per clip based on current settings */
  minClipFramesRequired: number;
}

/**
 * Calculate minimum clip frames required based on the constraint:
 *   min_clip_frames ≥ gap_frame_count + 2 × context_frame_count
 *
 * This applies to REPLACE mode to avoid double-blending artifacts.
 * In INSERT mode, the constraint is simpler (just context frames).
 */
export function calculateMinClipFramesRequired(
  contextFrames: number,
  gapFrames: number,
  replaceMode: boolean
): number {
  if (!replaceMode) {
    // INSERT mode - only need context frames from each clip
    return contextFrames;
  }
  // REPLACE mode - need gap + 2*context to avoid double-blending
  return gapFrames + 2 * contextFrames;
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

  // REPLACE mode - use the new constraint formula
  // Each clip needs at least: gap + 2*context total frames
  const minRequired = calculateMinClipFramesRequired(contextFrames, gapFrames, replaceMode);

  // For position-specific breakdown (used for visualization):
  const gapFromFirst = Math.ceil(gapFrames / 2);
  const gapFromSecond = Math.floor(gapFrames / 2);

  switch (position) {
    case 'first':
      const firstEnd = contextFrames + gapFromFirst;
      return { fromStart: 0, fromEnd: firstEnd, total: minRequired };
    case 'last':
      const lastStart = contextFrames + gapFromSecond;
      return { fromStart: lastStart, fromEnd: 0, total: minRequired };
    case 'middle':
      const midStart = contextFrames + gapFromSecond;
      const midEnd = contextFrames + gapFromFirst;
      // Middle clips need frames for TWO transitions
      return { fromStart: midStart, fromEnd: midEnd, total: minRequired * 2 };
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
 *
 * CONSTRAINT (REPLACE mode): min_clip_frames ≥ gap + 2 × context
 * - max_gap = shortest_clip - 2 × context
 * - max_context = (shortest_clip - gap) / 2
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
      minClipFramesRequired: 0,
    };
  }

  // Find shortest clip
  const shortestClipFrames = Math.min(...clipFrameInfos.map(c => c.frameCount));

  // Calculate minimum frames required based on current settings
  const minClipFramesRequired = calculateMinClipFramesRequired(
    contextFrameCount,
    gapFrameCount,
    replaceMode
  );

  // Calculate max safe settings based on shortest clip
  let maxSafeGap = 0;
  let maxSafeContext = 0;

  if (shortestClipFrames > 0) {
    if (replaceMode) {
      // CONSTRAINT: shortest_clip ≥ gap + 2*context
      // Rearranged: max_gap = shortest_clip - 2*context
      maxSafeGap = Math.max(1, shortestClipFrames - 2 * contextFrameCount);
      // Quantize to valid 4N+1 value
      maxSafeGap = Math.max(1, Math.floor((maxSafeGap - 1) / 4) * 4 + 1);

      // max_context = (shortest_clip - gap) / 2
      maxSafeContext = Math.max(4, Math.floor((shortestClipFrames - gapFrameCount) / 2));
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
    minClipFramesRequired,
  };
}








