/**
 * Shared utility for normalizing segment params from orchestrator_details
 *
 * Used by:
 * - ChildGenerationsView (segment cards)
 * - SegmentRegenerateForm (lightbox regenerate tab)
 *
 * Populates missing fields from orchestrator_details arrays based on segment_index
 */

export interface NormalizedSegmentParams {
  num_frames?: number;
  base_prompt?: string;
  negative_prompt?: string;
  [key: string]: any;
}

export interface NormalizeResult {
  params: NormalizedSegmentParams;
  updates: Partial<NormalizedSegmentParams>;
  hasUpdates: boolean;
}

/**
 * Normalizes segment params by populating missing fields from orchestrator_details
 *
 * @param rawParams - The raw params from task/generation
 * @param options - Optional overrides for segment index
 * @returns Normalized params with populated fields
 */
export function normalizeSegmentParams(
  rawParams: Record<string, any> | null | undefined,
  options?: { segmentIndex?: number }
): NormalizeResult {
  if (!rawParams) {
    return { params: {}, updates: {}, hasUpdates: false };
  }

  const orchestrator = rawParams.orchestrator_details || {};
  const segmentIndex = options?.segmentIndex ?? rawParams.segment_index ?? 0;
  const normalized = { ...rawParams };
  const updates: Partial<NormalizedSegmentParams> = {};
  let hasUpdates = false;

  // Populate num_frames if missing
  if (!normalized.num_frames) {
    if (orchestrator.segment_frames_expanded?.[segmentIndex]) {
      normalized.num_frames = orchestrator.segment_frames_expanded[segmentIndex];
      updates.num_frames = normalized.num_frames;
      hasUpdates = true;
    } else if (orchestrator.segment_frames_target) {
      normalized.num_frames = orchestrator.segment_frames_target;
      updates.num_frames = normalized.num_frames;
      hasUpdates = true;
    } else if (orchestrator.num_frames) {
      normalized.num_frames = orchestrator.num_frames;
      updates.num_frames = normalized.num_frames;
      hasUpdates = true;
    }
  }

  // Populate base_prompt if missing or empty
  // Priority: enhanced_prompts_expanded > base_prompts_expanded > orchestrator.base_prompt > rawParams.prompt
  if (!normalized.base_prompt || normalized.base_prompt === "") {
    if (orchestrator.enhanced_prompts_expanded?.[segmentIndex]) {
      normalized.base_prompt = orchestrator.enhanced_prompts_expanded[segmentIndex];
      updates.base_prompt = normalized.base_prompt;
      hasUpdates = true;
    } else if (orchestrator.base_prompts_expanded?.[segmentIndex]) {
      normalized.base_prompt = orchestrator.base_prompts_expanded[segmentIndex];
      updates.base_prompt = normalized.base_prompt;
      hasUpdates = true;
    } else if (orchestrator.base_prompt) {
      normalized.base_prompt = orchestrator.base_prompt;
      updates.base_prompt = normalized.base_prompt;
      hasUpdates = true;
    } else if (rawParams.prompt && !normalized.base_prompt) {
      normalized.base_prompt = rawParams.prompt;
      updates.base_prompt = normalized.base_prompt;
      hasUpdates = true;
    }
  }

  // Populate negative_prompt if missing
  if (!normalized.negative_prompt && orchestrator.negative_prompt) {
    normalized.negative_prompt = orchestrator.negative_prompt;
    updates.negative_prompt = normalized.negative_prompt;
    hasUpdates = true;
  }

  return { params: normalized, updates, hasUpdates };
}

/**
 * Hook-friendly version that just returns the normalized params
 */
export function getNormalizedParams(
  rawParams: Record<string, any> | null | undefined,
  options?: { segmentIndex?: number }
): NormalizedSegmentParams {
  return normalizeSegmentParams(rawParams, options).params;
}
