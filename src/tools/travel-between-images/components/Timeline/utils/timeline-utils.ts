import { log } from "@/shared/lib/logger";

// Calculate max gap based on context frames
export const calculateMaxGap = (contextFrames: number): number => {
  const maxGap = 81 - contextFrames;
  return Math.max(maxGap, contextFrames + 10);
};

// Validate gap constraints
export const validateGaps = (
  testPositions: Map<string, number>, 
  contextFrames: number,
  excludeId?: string
): boolean => {
  const positions = [...testPositions.entries()]
    .filter(([id]) => id !== excludeId)
    .map(([_, pos]) => pos);
  positions.push(0); // Always include frame 0
  positions.sort((a, b) => a - b);

  const maxGap = calculateMaxGap(contextFrames);

  // Debug: log every validation attempt
  log('TimelineFrameLimitIssue', 'validateGaps check', { excludeId, maxGap, positions });

  for (let i = 1; i < positions.length; i++) {
    const diff = positions[i] - positions[i - 1];
    if (diff > maxGap) {
      log('TimelineFrameLimitIssue', 'Gap violation detected', {
        index: i,
        prevFrame: positions[i - 1],
        nextFrame: positions[i],
        diff,
        maxGap,
      });
      return false;
    }
  }
  return true;
};

// ---------------------------------------------------------------------------
// Utility: shrink oversized gaps by left-shifting subsequent frames so that
// every gap ≤ maxGap.  Returns a **new** Map (does not mutate input).
// ---------------------------------------------------------------------------
export const shrinkOversizedGaps = (
  positions: Map<string, number>,
  contextFrames: number,
  excludeId?: string,
): Map<string, number> => {
  const maxGap = calculateMaxGap(contextFrames);

  // Create sortable copy excluding optional id
  const entries = [...positions.entries()].filter(([id]) => id !== excludeId);
  // Always include frame 0 in the list
  if (!entries.some(([_, pos]) => pos === 0)) {
    // Find an id that currently sits at 0 (if any)
    const zeroId = [...positions.entries()].find(([_, pos]) => pos === 0)?.[0];
    if (zeroId) entries.push([zeroId, 0]);
  }

  entries.sort((a, b) => a[1] - b[1]);

  let prev = 0;
  const result = new Map<string, number>();

  for (const [id, originalPos] of entries) {
    const desiredPos = Math.max(originalPos, prev + 1); // keep minGap of 1
    const allowedPos = Math.min(desiredPos, prev + maxGap);
    result.set(id, allowedPos);
    prev = allowedPos;
  }

  // Re-add the excluded id unchanged (caller may overwrite afterwards)
  if (excludeId && positions.has(excludeId)) {
    result.set(excludeId, positions.get(excludeId)!);
  }

  return result;
};

// ---------------------------------------------------------------------------
// Utility: expand undersized gaps by right-shifting subsequent frames so that
// every gap ≥ minGap. Used for Option key "pull left" behavior.
// Returns a **new** Map (does not mutate input).
// ---------------------------------------------------------------------------
export const expandUndersizedGaps = (
  positions: Map<string, number>,
  contextFrames: number,
  minGap: number = 10,
  excludeId?: string,
): Map<string, number> => {
  // Create sortable copy excluding optional id
  const entries = [...positions.entries()].filter(([id]) => id !== excludeId);
  // Always include frame 0 in the list
  if (!entries.some(([_, pos]) => pos === 0)) {
    // Find an id that currently sits at 0 (if any)
    const zeroId = [...positions.entries()].find(([_, pos]) => pos === 0)?.[0];
    if (zeroId) entries.push([zeroId, 0]);
  }

  entries.sort((a, b) => a[1] - b[1]);

  const result = new Map<string, number>();
  let prev = 0;

  for (const [id, originalPos] of entries) {
    // Ensure minimum gap while preserving relative ordering
    const minRequiredPos = prev + minGap;
    const finalPos = Math.max(originalPos, minRequiredPos);
    result.set(id, finalPos);
    prev = finalPos;
  }

  // Re-add the excluded id unchanged (caller may overwrite afterwards)
  if (excludeId && positions.has(excludeId)) {
    result.set(excludeId, positions.get(excludeId)!);
  }

  return result;
};

// Convert pixel position to frame number
export const pixelToFrame = (pixelX: number, containerWidth: number, fullMin: number, fullRange: number): number => {
  const fraction = pixelX / containerWidth;
  return Math.round(fullMin + fraction * fullRange);
};

// Find closest valid position considering constraints
export const findClosestValidPosition = (
  targetFrame: number, 
  activeId: string,
  framePositions: Map<string, number>,
  contextFrames: number
): number => {
  const originalPos = framePositions.get(activeId) ?? 0;

  // Helper to validate position with frame 0 reassignment logic
  const validateWithFrame0Logic = (testFrame: number): boolean => {
    const testMap = new Map(framePositions);
    testMap.set(activeId, testFrame);

    // If we're moving frame 0, simulate the reassignment
    if (originalPos === 0 && testFrame !== 0) {
      // Find what would become the new frame 0
      const nearest = [...testMap.entries()]
        .filter(([id]) => id !== activeId)
        .sort((a, b) => a[1] - b[1])[0];
      if (nearest) {
        testMap.set(nearest[0], 0);
      }
    }

    return validateGaps(testMap, contextFrames);
  };

  // First check if target is valid
  if (validateWithFrame0Logic(targetFrame)) {
    return targetFrame;
  }

  // Binary search for closest valid position
  const direction = targetFrame > originalPos ? 1 : -1;
  let low = Math.min(originalPos, targetFrame);
  let high = Math.max(originalPos, targetFrame);
  let best = originalPos;

  while (low <= high) {
    const mid = Math.round((low + high) / 2);

    if (validateWithFrame0Logic(mid)) {
      best = mid;
      if (direction > 0) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } else {
      if (direction > 0) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
  }

  return best;
};

// Calculate timeline dimensions
export const getTimelineDimensions = (framePositions: Map<string, number>) => {
  const positions = Array.from(framePositions.values());
  const staticMax = Math.max(...positions, 0);
  const staticMin = Math.min(...positions, 0);
  const padding = 30;

  const fullMax = Math.max(60, staticMax + padding);
  const fullMin = Math.min(0, staticMin - padding);
  const fullRange = fullMax - fullMin;

  return { fullMin, fullMax, fullRange };
};

// Helper: clamp value between min and max
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

// Get pair information from positions
export const getPairInfo = (
  framePositions: Map<string, number>,
  contextFrames: number
) => {
  const sortedPositions = [...framePositions.entries()]
    .map(([id, pos]) => ({ id, pos }))
    .sort((a, b) => a.pos - b.pos);

  const pairs = [];
  for (let i = 0; i < sortedPositions.length - 1; i++) {
    const startFrame = sortedPositions[i].pos;
    const endFrame = sortedPositions[i + 1].pos;
    const pairFrames = endFrame - startFrame;

    const generationStart = (i === 0)
      ? startFrame
      : (sortedPositions[i].pos - contextFrames);

    pairs.push({
      index: i,
      startFrame,
      endFrame,
      frames: pairFrames,
      generationStart,
      contextStart: endFrame - contextFrames,
      contextEnd: endFrame,
    });
  }

  return pairs;
}; 