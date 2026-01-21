/**
 * Parent generation handling
 * Manages parent/child relationships and variant creation on parents
 */

import { extractShotAndPosition } from './params.ts';
import { TOOL_TYPES } from './constants.ts';
import {
  findExistingGeneration,
  createVariant,
  linkGenerationToShot,
} from './generation-core.ts';

// ===== PARENT GENERATION =====

/**
 * Get existing parent generation or create a placeholder
 * Implements the "Lazy Parent Creation" pattern
 */
export async function getOrCreateParentGeneration(
  supabase: any,
  orchestratorTaskId: string,
  projectId: string,
  segmentParams?: any
): Promise<any> {
  try {
    // Check if orchestrator already specifies a parent_generation_id
    let orchTask: { task_type?: string; params?: any } | null = null;
    try {
      const { data } = await supabase
        .from('tasks')
        .select('task_type, params')
        .eq('id', orchestratorTaskId)
        .single();
      orchTask = data;
    } catch {
      console.log(`[GenMigration] Could not fetch orchestrator task ${orchestratorTaskId}`);
    }

    // Check for parent_generation_id in orchestrator params
    const parentGenId = orchTask?.params?.parent_generation_id ||
                        orchTask?.params?.orchestrator_details?.parent_generation_id ||
                        segmentParams?.full_orchestrator_payload?.parent_generation_id;

    if (parentGenId) {
      console.log(`[GenMigration] Orchestrator has parent_generation_id: ${parentGenId}`);
      const { data: existingParent, error: parentError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', parentGenId)
        .single();

      if (existingParent && !parentError) {
        console.log(`[GenMigration] Using existing parent generation ${parentGenId}`);
        return existingParent;
      }
    }

    // Try to find existing generation for this orchestrator task
    const existing = await findExistingGeneration(supabase, orchestratorTaskId);
    if (existing) {
      return existing;
    }

    console.log(`[GenMigration] Creating placeholder parent generation for orchestrator ${orchestratorTaskId}`);

    const newId = crypto.randomUUID();
    const baseParams = orchTask?.params || segmentParams || {};
    const placeholderParams = {
      ...baseParams,
      tool_type: baseParams.tool_type || TOOL_TYPES.TRAVEL_BETWEEN_IMAGES
    };

    const placeholderRecord = {
      id: newId,
      tasks: [orchestratorTaskId],
      project_id: projectId,
      type: 'video',
      is_child: false,
      location: null,
      created_at: new Date().toISOString(),
      params: placeholderParams
    };

    const { data: newParent, error } = await supabase
      .from('generations')
      .insert(placeholderRecord)
      .select()
      .single();

    if (error) {
      console.error(`[GenMigration] Error creating placeholder parent:`, error);
      return await findExistingGeneration(supabase, orchestratorTaskId);
    }

    console.log(`[GenMigration] Created placeholder parent ${newId}`);

    // Link parent to shot if orchestrator has shot_id
    const paramsForShotExtraction = orchTask?.params || segmentParams;
    if (paramsForShotExtraction) {
      const { shotId, addInPosition } = extractShotAndPosition(paramsForShotExtraction);
      if (shotId) {
        console.log(`[GenMigration] Linking parent generation ${newId} to shot ${shotId}`);
        await linkGenerationToShot(supabase, shotId, newId, addInPosition);
      }
    }

    return newParent;

  } catch (error) {
    console.error(`[GenMigration] Exception in getOrCreateParentGeneration:`, error);
    return null;
  }
}

/**
 * Helper function to create variant and update parent generation
 * @param viewedAt - Optional: if provided, marks the variant as already viewed (for single-segment cases)
 */
export async function createVariantOnParent(
  supabase: any,
  parentGenId: string,
  publicUrl: string,
  thumbnailUrl: string | null,
  taskData: any,
  taskId: string,
  variantType: string,
  extraParams: Record<string, any> = {},
  variantName?: string | null,
  makePrimary: boolean = true,
  viewedAt?: string | null
): Promise<any | null> {
  console.log(`[GenMigration] ${taskData.task_type} task ${taskId} - creating variant for parent generation ${parentGenId}`);

  const { data: parentGen, error: fetchError } = await supabase
    .from('generations')
    .select('*')
    .eq('id', parentGenId)
    .single();

  if (fetchError || !parentGen) {
    console.error(`[GenMigration] Error fetching parent generation ${parentGenId}:`, fetchError);
    return null;
  }

  try {
    const variantParams = {
      ...taskData.params,
      source_task_id: taskId,
      ...extraParams,
    };

    await createVariant(
      supabase,
      parentGen.id,
      publicUrl,
      thumbnailUrl,
      variantParams,
      makePrimary,     // is_primary
      variantType,
      variantName || null,
      viewedAt || null
    );

    console.log(`[GenMigration] Successfully created ${variantType} variant for parent generation ${parentGen.id}${viewedAt ? ' (auto-viewed)' : ''}`);

    // Mark task as generation_created
    await supabase
      .from('tasks')
      .update({ generation_created: true })
      .eq('id', taskId);

    return parentGen;

  } catch (variantErr) {
    console.error(`[GenMigration] Exception creating variant for ${taskData.task_type}:`, variantErr);
    return null;
  }
}

/**
 * Determines the viewedAt timestamp for a child generation variant.
 * For single-segment cases (only one child under parent), returns current timestamp.
 * For multi-segment cases, returns null.
 *
 * This centralizes the single-segment detection logic that was previously scattered
 * across three different code paths:
 * 1. individual_travel_segment with child_generation_id (SPECIAL CASE 1a)
 * 2. Travel segment matching existing generation at position
 * 3. Standard child generation creation
 *
 * @param supabase - Supabase client
 * @param options - Detection options (check in order of preference)
 * @returns ISO timestamp string if single-segment, null otherwise
 */
export async function getChildVariantViewedAt(
  supabase: any,
  options: {
    // Check 1: Explicit flag from orchestrator detection (fastest)
    taskParams?: { _isSingleSegmentCase?: boolean };
    // Check 2: Count siblings under parent (slower but works for individual segments)
    childGeneration?: { parent_generation_id: string | null; is_child: boolean };
    parentGenerationId?: string;
  }
): Promise<string | null> {
  // Fast path: Check explicit flag first (set during orchestrator detection)
  if (options.taskParams?._isSingleSegmentCase === true) {
    console.log('[getChildVariantViewedAt] Single-segment detected via _isSingleSegmentCase flag');
    return new Date().toISOString();
  }

  // Slow path: Count siblings to determine if single-segment
  // Used by individual_travel_segment which doesn't go through orchestrator detection
  const parentId = options.childGeneration?.parent_generation_id || options.parentGenerationId;
  // Only count if: (a) we have a parentId from childGeneration with is_child=true, or (b) we have explicit parentGenerationId
  const shouldCountSiblings = parentId && (
    options.childGeneration?.is_child === true ||  // childGeneration explicitly marked as child
    (!options.childGeneration && options.parentGenerationId)  // or explicit parentGenerationId without childGeneration
  );
  if (shouldCountSiblings) {
    try {
      const { count } = await supabase
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('parent_generation_id', parentId)
        .eq('is_child', true);

      if (count === 1) {
        console.log(`[getChildVariantViewedAt] Single-segment detected via sibling count (parent: ${parentId})`);
        return new Date().toISOString();
      }
      console.log(`[getChildVariantViewedAt] Multi-segment case: ${count} siblings under parent ${parentId}`);
    } catch (err) {
      console.warn('[getChildVariantViewedAt] Error counting siblings:', err);
    }
  }

  return null;
}
