/**
 * Task Completion Handlers
 *
 * Each handler implements a specific completion behavior:
 * - handleVariantOnParent: For final steps (stitch tasks) that update the parent generation
 * - handleVariantOnChild: For regenerating existing child generations
 * - handleChildGeneration: For segment tasks that create children under a parent
 * - handleStandaloneGeneration: For regular tasks that create independent generations
 */

import {
  TaskCompletionConfig,
  TASK_TYPES,
  TOOL_TYPES,
  VARIANT_TYPES,
} from './constants.ts';

import {
  extractOrchestratorTaskId,
  extractBasedOn,
  extractShotAndPosition,
  buildGenerationParams,
} from './params.ts';

import {
  findSourceGenerationByImageUrl,
  insertGeneration,
  createVariant,
  linkGenerationToShot,
} from './generation-core.ts';

import {
  getOrCreateParentGeneration,
  createVariantOnParent,
  getChildVariantViewedAt,
} from './generation-parent.ts';

import {
  logSegmentMasterState,
  extractSegmentSpecificParams,
} from './generation-segments.ts';

// ===== TYPES =====

export interface HandlerContext {
  supabase: any;
  taskId: string;
  taskData: any;
  publicUrl: string;
  thumbnailUrl: string | null;
  config: TaskCompletionConfig;
  logger?: any;
}

// ===== HANDLER: VARIANT ON PARENT =====

/**
 * Creates a variant on the parent generation (for stitch tasks)
 * Used by: travel_stitch, join_final_stitch
 */
export async function handleVariantOnParent(ctx: HandlerContext): Promise<any | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, config, logger } = ctx;

  const orchTaskId = taskData.params?.orchestrator_task_id_ref ||
                     taskData.params?.orchestrator_task_id ||
                     taskData.params?.full_orchestrator_payload?.orchestrator_task_id;

  if (!orchTaskId) {
    console.log(`[GenHandler] ${taskData.task_type} task ${taskId} - no orchestrator_task_id found`);
    return null;
  }

  console.log(`[GenHandler] ${taskData.task_type} - getting parent generation for orchestrator ${orchTaskId}`);
  const parentGen = await getOrCreateParentGeneration(supabase, orchTaskId, taskData.project_id, taskData.params);

  if (!parentGen?.id) {
    console.log(`[GenHandler] ${taskData.task_type} task ${taskId} - could not find/create parent generation`);
    return null;
  }

  console.log(`[GenHandler] ${taskData.task_type} task ${taskId} - creating variant on parent generation ${parentGen.id}`);
  logger?.info(`${taskData.task_type}: creating variant on parent`, {
    task_id: taskId,
    parent_generation_id: parentGen.id,
    orchestrator_task_id: orchTaskId,
    action: "create_variant_on_parent"
  });

  const result = await createVariantOnParent(
    supabase,
    parentGen.id,
    publicUrl,
    thumbnailUrl,
    taskData,
    taskId,
    config.variantType,
    {
      tool_type: config.toolType,
      created_from: `${taskData.task_type}_completion`,
    }
  );

  return result;
}

// ===== HANDLER: VARIANT ON CHILD =====

/**
 * Creates a variant on an existing child generation (for individual segment regeneration)
 * Used by: individual_travel_segment (when child_generation_id is present)
 */
export async function handleVariantOnChild(ctx: HandlerContext): Promise<any | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, config, logger } = ctx;

  const childGenId = taskData.params?.child_generation_id;
  if (!childGenId) {
    console.log(`[GenHandler] individual_travel_segment - no child_generation_id, falling back to child_generation behavior`);
    return null; // Fall back to child_generation behavior
  }

  console.log(`[GenHandler] individual_travel_segment - creating variant for child generation ${childGenId}`);
  logger?.info("individual_travel_segment with child_generation_id", {
    task_id: taskId,
    child_generation_id: childGenId,
    action: "create_variant_on_existing_child"
  });

  const { data: childGen, error: fetchError } = await supabase
    .from('generations')
    .select('*')
    .eq('id', childGenId)
    .single();

  if (fetchError || !childGen) {
    console.error(`[GenHandler] Error fetching child generation ${childGenId}:`, fetchError);
    return null;
  }

  // Extract pair_shot_generation_id from nested locations if not at top level
  const segmentIndex = taskData.params?.segment_index ?? 0;
  const orchPairIds = taskData.params?.orchestrator_details?.pair_shot_generation_ids;
  const pairShotGenerationId = taskData.params?.pair_shot_generation_id ||
                                taskData.params?.individual_segment_params?.pair_shot_generation_id ||
                                (Array.isArray(orchPairIds) && orchPairIds[segmentIndex]);

  const variantParams = {
    ...taskData.params,
    tool_type: config.toolType,
    source_task_id: taskId,
    created_from: 'individual_segment_regeneration',
    ...(pairShotGenerationId && { pair_shot_generation_id: pairShotGenerationId }),
  };

  // Respect make_primary_variant flag from UI (defaults to true for backward compatibility)
  const makePrimary = taskData.params?.make_primary_variant ?? true;
  console.log(`[GenHandler] Creating variant with isPrimary=${makePrimary}`);

  // Use centralized helper for single-segment detection
  const childViewedAt = makePrimary ? await getChildVariantViewedAt(supabase, {
    taskParams: taskData.params,
    childGeneration: childGen,
  }) : null;
  const isSingleSegmentChild = childViewedAt !== null;

  await createVariant(
    supabase,
    childGen.id,
    publicUrl,
    thumbnailUrl,
    variantParams,
    makePrimary,
    config.variantType,
    null,
    childViewedAt
  );

  console.log(`[GenHandler] Successfully created variant for child generation ${childGenId}${isSingleSegmentChild ? ' (auto-viewed)' : ''}`);

  // SINGLE-SEGMENT PROPAGATION: If this child is the only child of its parent,
  // also create a variant on the parent so the main generation updates automatically
  if (isSingleSegmentChild && childGen.parent_generation_id) {
    console.log(`[GenHandler] Single-segment child - also creating variant on parent ${childGen.parent_generation_id}`);
    logger?.info("Single-segment propagation to parent", {
      task_id: taskId,
      child_generation_id: childGenId,
      parent_generation_id: childGen.parent_generation_id,
      action: "propagate_to_parent"
    });

    await createVariant(
      supabase,
      childGen.parent_generation_id,
      publicUrl,
      thumbnailUrl,
      {
        ...variantParams,
        propagated_from_child: childGenId,
        created_from: 'single_segment_propagation',
      },
      true, // is_primary
      VARIANT_TYPES.TRAVEL_SEGMENT,
      null
    );
    console.log(`[GenHandler] Successfully propagated to parent generation`);
  }

  await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);
  return childGen;
}

// ===== HANDLER: CHILD GENERATION =====

/**
 * Creates a child generation under a parent (for segment tasks)
 * Single-item detection and behavior is config-driven via singleItemDetection
 * Used by: travel_segment, join_clips_segment, individual_travel_segment (fallback)
 */
export async function handleChildGeneration(
  ctx: HandlerContext,
  overrideParentId?: string | null,
  overrideChildOrder?: number | null
): Promise<any | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, config, logger } = ctx;

  // Extract orchestrator info
  const orchestratorTaskId = extractOrchestratorTaskId(taskData.params, 'GenHandler');
  let parentGenerationId = overrideParentId ?? null;
  let childOrder = overrideChildOrder ?? null;

  // Get parent generation from orchestrator if not overridden
  if (!parentGenerationId && orchestratorTaskId) {
    console.log(`[GenHandler] Task ${taskId} is a sub-task of orchestrator ${orchestratorTaskId}`);
    const parentGen = await getOrCreateParentGeneration(supabase, orchestratorTaskId, taskData.project_id, taskData.params);
    if (parentGen) {
      parentGenerationId = parentGen.id;
    }
  }

  if (!parentGenerationId) {
    console.log(`[GenHandler] No parent generation found for child_generation task ${taskId}`);
    return null;
  }

  // Extract child order from config field
  const childOrderField = config.childOrderField || 'segment_index';
  if (childOrder === null) {
    const extractedOrder = taskData.params?.[childOrderField] ??
                           taskData.params?.index ??
                           taskData.params?.sequence_index;
    if (extractedOrder !== undefined && extractedOrder !== null) {
      childOrder = parseInt(String(extractedOrder), 10);
    }
  }

  console.log(`[GenHandler] Child generation: parent=${parentGenerationId}, childOrder=${childOrder}`);
  logger?.info("Creating child generation", {
    task_id: taskId,
    parent_generation_id: parentGenerationId,
    child_order: childOrder,
    task_type: taskData.task_type,
  });

  // Detect single-item case using config-driven detection
  const singleItemResult = detectSingleItem(taskData.params, config, childOrder);

  if (singleItemResult.isSingleItem) {
    taskData.params._isSingleSegmentCase = true;
    console.log(`[GenHandler] Single-item detected: ${singleItemResult.reason}`);

    // Handle based on configured behavior
    if (singleItemResult.behavior === 'variant_only') {
      // Create variant on parent and return (no child generation)
      logger?.info("Single-item: variant on parent only", {
        task_id: taskId,
        parent_generation_id: parentGenerationId,
        reason: singleItemResult.reason,
      });

      const result = await createSingleItemVariant(
        ctx, parentGenerationId, orchestratorTaskId, singleItemResult.extraParams
      );
      if (result) return result;
      // Fall through if variant creation failed
    } else {
      // Create variant on parent AND continue to create child
      logger?.info("Single-item: variant on parent and child", {
        task_id: taskId,
        parent_generation_id: parentGenerationId,
        reason: singleItemResult.reason,
      });

      await createSingleItemVariant(ctx, parentGenerationId, orchestratorTaskId);
      console.log(`[GenHandler] Single-item parent variant created, continuing to create child`);
    }
  }

  // Extract segment-specific params from orchestrator details
  const orchDetails = taskData.params?.orchestrator_details ||
                      taskData.params?.full_orchestrator_payload || {};
  if (Object.keys(orchDetails).length > 0 && childOrder !== null && !isNaN(childOrder)) {
    taskData.params = extractSegmentSpecificParams(taskData.params, orchDetails, childOrder);
    if (singleItemResult.isSingleItem) {
      taskData.params._isSingleSegmentCase = true;
    }
  }

  // Extract pair_shot_generation_id from multiple nested locations
  // (individual_travel_segment stores it in individual_segment_params)
  const segmentIndex = taskData.params?.segment_index ?? childOrder ?? 0;
  const orchPairIds = taskData.params?.orchestrator_details?.pair_shot_generation_ids;
  const pairShotGenId = taskData.params?.pair_shot_generation_id ||
                        taskData.params?.individual_segment_params?.pair_shot_generation_id ||
                        (Array.isArray(orchPairIds) && orchPairIds[segmentIndex]);

  // Check for existing generation at same position (config-driven)
  if (config.checkExistingAtPosition && childOrder !== null && !isNaN(childOrder)) {
    const existingGenId = await findExistingGenerationAtPosition(
      supabase, parentGenerationId, childOrder, pairShotGenId
    );

    if (existingGenId) {
      const variantViewedAt = await getChildVariantViewedAt(supabase, {
        taskParams: taskData.params,
        parentGenerationId,
      });

      console.log(`[GenHandler] Found existing generation ${existingGenId} - adding as variant${variantViewedAt ? ' (auto-viewed)' : ''}`);
      logger?.info("Adding segment as variant to existing generation", {
        task_id: taskId,
        existing_generation_id: existingGenId,
        child_order: childOrder,
      });

      const variantResult = await createVariantOnParent(
        supabase, existingGenId, publicUrl, thumbnailUrl, taskData, taskId,
        config.variantType,
        {
          tool_type: config.toolType,
          created_from: 'segment_variant_at_position',
          segment_index: childOrder,
          pair_shot_generation_id: pairShotGenId
        },
        null,
        false,
        variantViewedAt
      );

      if (variantResult) return variantResult;
      console.error(`[GenHandler] Failed to create variant, falling through to new generation`);
    }
  }

  // Create the child generation
  return createChildGenerationRecord(ctx, parentGenerationId, childOrder, singleItemResult.isSingleItem, pairShotGenId);
}

// ===== SINGLE-ITEM DETECTION (CONFIG-DRIVEN) =====

interface SingleItemResult {
  isSingleItem: boolean;
  behavior: 'variant_only' | 'variant_and_child';
  reason?: string;
  extraParams?: Record<string, any>;
}

/**
 * Config-driven single-item detection
 * Checks both count-based and flag-based detection from config
 */
function detectSingleItem(
  params: any,
  config: TaskCompletionConfig,
  childOrder: number | null
): SingleItemResult {
  const orchDetails = params?.orchestrator_details || params?.full_orchestrator_payload || {};

  // Check count-based detection (e.g., num_new_segments_to_generate === 1)
  if (config.singleItemDetection && childOrder === 0) {
    const countValue = orchDetails[config.singleItemDetection.countField] ??
                       params?.[config.singleItemDetection.countField];
    if (countValue === config.singleItemDetection.expectedCount) {
      return {
        isSingleItem: true,
        behavior: config.singleItemDetection.behavior,
        reason: `${config.singleItemDetection.countField}=${countValue}`,
        extraParams: config.singleItemDetection.extraParams,
      };
    }
  }

  // Check flag-based detection (e.g., is_first_join && is_last_join)
  if (config.singleItemFlags) {
    const firstFlag = params?.[config.singleItemFlags.firstFlag] === true;
    const lastFlag = params?.[config.singleItemFlags.lastFlag] === true;
    if (firstFlag && lastFlag) {
      return {
        isSingleItem: true,
        behavior: config.singleItemFlags.behavior,
        reason: `${config.singleItemFlags.firstFlag} && ${config.singleItemFlags.lastFlag}`,
        extraParams: config.singleItemFlags.extraParams,
      };
    }
  }

  return { isSingleItem: false, behavior: 'variant_and_child' };
}

/**
 * Create variant on parent for single-item cases
 */
async function createSingleItemVariant(
  ctx: HandlerContext,
  parentGenerationId: string,
  orchestratorTaskId: string | null,
  extraParams?: Record<string, any>
): Promise<any | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, config } = ctx;

  // Check if this is first variant on parent
  const { count: existingVariantCount } = await supabase
    .from('generation_variants')
    .select('id', { count: 'exact', head: true })
    .eq('generation_id', parentGenerationId);
  const isFirstVariant = (existingVariantCount || 0) === 0;

  const toolType = taskData.params?.full_orchestrator_payload?.tool_type ||
                   taskData.params?.tool_type ||
                   config.toolType;

  // Extract runtime values based on childOrderField (e.g., join_index, segment_index)
  const childOrderField = config.childOrderField || 'segment_index';
  const childOrderValue = taskData.params?.[childOrderField] ?? 0;

  const result = await createVariantOnParent(
    supabase, parentGenerationId, publicUrl, thumbnailUrl, taskData, taskId,
    config.variantType,
    {
      tool_type: toolType,
      created_from: 'single_item_completion',
      is_single_item: true,
      [childOrderField]: childOrderValue,  // e.g., join_index: 0 or segment_index: 0
      ...extraParams,
    },
    null,
    isFirstVariant
  );

  if (result && orchestratorTaskId) {
    await supabase.from('tasks').update({ generation_created: true }).eq('id', orchestratorTaskId);
  }

  return result;
}

/**
 * Find existing generation at a position (for variant creation)
 */
async function findExistingGenerationAtPosition(
  supabase: any,
  parentGenerationId: string,
  childOrder: number,
  pairShotGenId?: string
): Promise<string | null> {
  console.log(`[GenHandler] Checking for existing generation at segment_index=${childOrder}, pair_shot_gen_id=${pairShotGenId || 'none'}`);

  // Strategy 1: Try to find by pair_shot_generation_id column
  if (pairShotGenId) {
    // Match by the FK column (source of truth with referential integrity)
    const { data: matchByColumn, error: matchByColumnError } = await supabase
      .from('generations')
      .select('id')
      .eq('parent_generation_id', parentGenerationId)
      .eq('is_child', true)
      .eq('pair_shot_generation_id', pairShotGenId)
      .maybeSingle();

    if (!matchByColumnError && matchByColumn?.id) {
      console.log(`[GenHandler] Found match by pair_shot_generation_id column: ${matchByColumn.id}`);
      return matchByColumn.id;
    }

    // NOTE: We intentionally DON'T fall back to params JSONB here.
    // Pre-migration generations have already been migrated to the column.
    // Any generation with NULL column but non-NULL params is orphaned
    // (FK cascade set column to NULL when shot_generation was deleted).
    console.log(`[GenHandler] No match by pair_shot_generation_id column`);
  }

  // Strategy 2: Fallback to child_order match
  // IMPORTANT: Only use this fallback when NO pair_shot_generation_id was provided
  // If pairShotGenId was provided but no match found, DON'T fall back to child_order
  // because the existing child at that index may be for a different timeline layout
  if (!pairShotGenId) {
    const { data: matchByChildOrder, error: matchByChildOrderError } = await supabase
      .from('generations')
      .select('id')
      .eq('parent_generation_id', parentGenerationId)
      .eq('is_child', true)
      .eq('child_order', childOrder)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!matchByChildOrderError && matchByChildOrder?.id) {
      console.log(`[GenHandler] Found match by child_order=${childOrder}: ${matchByChildOrder.id}`);
      return matchByChildOrder.id;
    }
  } else {
    console.log(`[GenHandler] No match by pair_shot_generation_id, skipping child_order fallback (would match wrong slot after timeline rearrangement)`);
  }

  console.log(`[GenHandler] No existing generation found at position`);
  return null;
}

/**
 * Create the child generation record and its initial variant
 */
async function createChildGenerationRecord(
  ctx: HandlerContext,
  parentGenerationId: string,
  childOrder: number | null,
  isSingleItemCase: boolean,
  pairShotGenerationId?: string | null | false
): Promise<any> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, config, logger } = ctx;

  const { shotId } = extractShotAndPosition(taskData.params);
  const generationType = taskData.content_type || 'video';
  // Use taskData.tool_type (resolved from DB) for consistency, fall back to config
  const toolType = taskData.tool_type || config.toolType;
  let generationParams = buildGenerationParams(
    taskData.params, toolType, generationType, shotId, thumbnailUrl || undefined, taskId
  );

  // Ensure pair_shot_generation_id is at top level of params (for slot matching)
  if (pairShotGenerationId && !generationParams.pair_shot_generation_id) {
    generationParams = { ...generationParams, pair_shot_generation_id: pairShotGenerationId };
    console.log(`[GenHandler] Added pair_shot_generation_id to child generation params: ${pairShotGenerationId}`);
  }

  const newGenerationId = crypto.randomUUID();

  const generationName = taskData.params?.generation_name ||
    taskData.params?.orchestrator_details?.generation_name ||
    taskData.params?.full_orchestrator_payload?.generation_name;

  // Find based_on
  let basedOnGenerationId: string | null = extractBasedOn(taskData.params);
  if (basedOnGenerationId) {
    const { data: basedOnGen, error: basedOnError } = await supabase
      .from('generations')
      .select('id')
      .eq('id', basedOnGenerationId)
      .maybeSingle();

    if (basedOnError || !basedOnGen) {
      console.warn(`[GenHandler] based_on generation ${basedOnGenerationId} not found, clearing reference`);
      basedOnGenerationId = null;
    }
  }
  if (!basedOnGenerationId) {
    const sourceImageUrl = taskData.params?.image;
    if (sourceImageUrl) {
      basedOnGenerationId = await findSourceGenerationByImageUrl(supabase, sourceImageUrl);
    }
  }

  logger?.info("Creating child generation record", {
    task_id: taskId,
    generation_id: newGenerationId,
    parent_generation_id: parentGenerationId,
    child_order: childOrder,
    is_single_item: isSingleItemCase,
    based_on: basedOnGenerationId,
    pair_shot_generation_id: pairShotGenerationId || null,
  });

  const generationRecord: Record<string, any> = {
    id: newGenerationId,
    tasks: [taskId],
    params: generationParams,
    type: generationType,
    project_id: taskData.project_id,
    name: generationName,
    based_on: basedOnGenerationId,
    parent_generation_id: parentGenerationId,
    is_child: true,
    child_order: childOrder,
    // Store pair_shot_generation_id as proper column (not just in params)
    // This enables FK constraint and ON DELETE SET NULL behavior
    pair_shot_generation_id: pairShotGenerationId || null,
    created_at: new Date().toISOString()
  };

  const newGeneration = await insertGeneration(supabase, generationRecord);
  console.log(`[GenHandler] Created child generation ${newGeneration.id}`);

  // Log segment state for debugging (travel segments only)
  const isTravelSegmentTask = taskData.task_type === TASK_TYPES.TRAVEL_SEGMENT ||
                               taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT;
  const orchDetails = taskData.params?.orchestrator_details ||
                      taskData.params?.full_orchestrator_payload || {};

  if (isTravelSegmentTask && childOrder !== null) {
    try {
      logSegmentMasterState({
        taskId,
        generationId: newGeneration.id,
        segmentIndex: childOrder,
        parentGenerationId,
        orchDetails,
        segmentParams: taskData.params,
        shotId,
      });
    } catch (logError) {
      console.warn('[GenHandler] Error logging segment state:', logError);
    }
  }

  // Create "original" variant
  let autoViewedAt: string | null = null;
  let createdFrom = 'child_generation_original';

  if (isSingleItemCase) {
    autoViewedAt = new Date().toISOString();
    createdFrom = 'single_segment_child_original';
  } else {
    autoViewedAt = await getChildVariantViewedAt(supabase, {
      taskParams: taskData.params,
    });
    if (autoViewedAt) {
      createdFrom = 'single_segment_child_original';
    }
  }

  console.log(`[GenHandler] Creating original variant${autoViewedAt ? ' (auto-viewed)' : ''}`);
  await createVariant(
    supabase, newGeneration.id, publicUrl, thumbnailUrl,
    { ...generationParams, source_task_id: taskId, created_from: createdFrom },
    true, 'original', null, autoViewedAt
  );

  await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);

  console.log(`[GenHandler] Child generation creation complete`);
  return newGeneration;
}

// ===== HANDLER: STANDALONE GENERATION =====

/**
 * Creates an independent generation (for regular tasks)
 * Used by: single_image, wan_2_2_i2v, image_inpaint, etc.
 */
export async function handleStandaloneGeneration(ctx: HandlerContext): Promise<any> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, config, logger } = ctx;

  const { shotId, addInPosition } = extractShotAndPosition(taskData.params);

  // Validate shot exists
  if (shotId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(shotId)) {
      const { data: shotData, error: shotError } = await supabase.from('shots').select('id').eq('id', shotId).single();
      if (shotError || !shotData) {
        console.log(`[GenHandler] Shot ${shotId} does not exist, proceeding without shot link`);
      }
    }
  }

  const generationType = taskData.content_type || 'image';
  const generationParams = buildGenerationParams(
    taskData.params, taskData.tool_type, generationType, shotId, thumbnailUrl || undefined, taskId
  );
  const newGenerationId = crypto.randomUUID();

  const generationName = taskData.params?.generation_name ||
    taskData.params?.orchestrator_details?.generation_name ||
    taskData.params?.full_orchestrator_payload?.generation_name;

  // Find based_on
  let basedOnGenerationId: string | null = extractBasedOn(taskData.params);
  if (basedOnGenerationId) {
    const { data: basedOnGen, error: basedOnError } = await supabase
      .from('generations')
      .select('id')
      .eq('id', basedOnGenerationId)
      .maybeSingle();

    if (basedOnError || !basedOnGen) {
      console.warn(`[GenHandler] based_on generation ${basedOnGenerationId} not found, clearing reference`);
      basedOnGenerationId = null;
    }
  }
  if (!basedOnGenerationId) {
    const sourceImageUrl = taskData.params?.image;
    if (sourceImageUrl) {
      basedOnGenerationId = await findSourceGenerationByImageUrl(supabase, sourceImageUrl);
    }
  }

  logger?.info("Creating standalone generation", {
    task_id: taskId,
    generation_id: newGenerationId,
    based_on: basedOnGenerationId,
    shot_id: shotId,
    generation_type: generationType,
  });

  const generationRecord: Record<string, any> = {
    id: newGenerationId,
    tasks: [taskId],
    params: generationParams,
    type: generationType,
    project_id: taskData.project_id,
    name: generationName,
    based_on: basedOnGenerationId,
    parent_generation_id: null,
    is_child: false,
    child_order: null,
    created_at: new Date().toISOString()
  };

  const newGeneration = await insertGeneration(supabase, generationRecord);
  console.log(`[GenHandler] Created standalone generation ${newGeneration.id}`);

  // Create "original" variant
  console.log(`[GenHandler] Creating original variant`);
  await createVariant(
    supabase, newGeneration.id, publicUrl, thumbnailUrl,
    { ...generationParams, source_task_id: taskId, created_from: 'generation_original' },
    true, 'original', null, null
  );

  // Link to shot if applicable
  if (shotId) {
    await linkGenerationToShot(supabase, shotId, newGeneration.id, addInPosition);
  }

  await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);

  console.log(`[GenHandler] Standalone generation creation complete`);
  return newGeneration;
}
