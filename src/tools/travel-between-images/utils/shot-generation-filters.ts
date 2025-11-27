/**
 * DEPRECATED: This file is kept for backwards compatibility.
 * 
 * All canonical filter utilities have been moved to:
 * @/shared/lib/typeGuards
 * 
 * New code should import directly from typeGuards:
 * import { isVideoShotGeneration, isPositioned, filterShotGenerationsForDisplay } from '@/shared/lib/typeGuards';
 */

// Re-export canonical types and functions from typeGuards
export type { ShotGenerationLike } from '@/shared/lib/typeGuards';
export { 
  isVideoShotGeneration,
  hasValidTimelineFrame,
  isPositioned,
  filterShotGenerationsForDisplay,
  sortByTimelineFrame
} from '@/shared/lib/typeGuards';

// Legacy function names for backwards compatibility
import { isVideoShotGeneration, isPositioned } from '@/shared/lib/typeGuards';
import type { ShotGenerationLike } from '@/shared/lib/typeGuards';

/**
 * @deprecated Use !isVideoShotGeneration(sg) instead
 */
export function isNonVideoGeneration(sg: ShotGenerationLike): boolean {
  if (!sg.generation) return false;
  return !isVideoShotGeneration(sg);
}

/**
 * @deprecated Use items.filter(sg => !isVideoShotGeneration(sg)) instead
 */
export function getNonVideoGenerations<T extends ShotGenerationLike>(
  shotGenerations: T[]
): T[] {
  return shotGenerations.filter(sg => sg.generation && !isVideoShotGeneration(sg));
}

/**
 * @deprecated Use filterShotGenerationsForDisplay() instead
 */
export function getPositionedNonVideoGenerations<T extends ShotGenerationLike>(
  shotGenerations: T[]
): T[] {
  return shotGenerations
    .filter(sg => sg.generation && !isVideoShotGeneration(sg))
    .filter(isPositioned);
}
