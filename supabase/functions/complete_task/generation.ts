/**
 * Generation and variant creation for complete_task
 * Handles creating generations, variants, and parent/child relationships
 *
 * This is the main entry point - sub-modules handle specific concerns:
 * - generation-core.ts: Basic CRUD operations
 * - generation-parent.ts: Parent/child relationships
 * - generation-segments.ts: Travel segment logic
 * - generation-variants.ts: Edit/upscale variant handlers
 */

import {
  extractOrchestratorTaskId,
  extractBasedOn,
  extractShotAndPosition,
  buildGenerationParams,
} from './params.ts';
import {
  TASK_TYPES,
  TOOL_TYPES,
  VARIANT_TYPES,
} from './constants.ts';

// Import from sub-modules
import {
  findExistingGeneration,
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

import {
  handleVariantCreation,
  handleUpscaleVariant,
} from './generation-variants.ts';

// Re-export everything for backward compatibility
export {
  // From generation-core.ts
  findExistingGeneration,
  findSourceGenerationByImageUrl,
  insertGeneration,
  createVariant,
  linkGenerationToShot,
  // From generation-parent.ts
  getOrCreateParentGeneration,
  createVariantOnParent,
  getChildVariantViewedAt,
  // From generation-segments.ts
  logSegmentMasterState,
  extractSegmentSpecificParams,
  // From generation-variants.ts
  handleVariantCreation,
  handleUpscaleVariant,
};

// ===== TOOL TYPE RESOLUTION =====

/**
 * Resolve the final tool_type for a task, considering both default mapping and potential overrides
 */
export async function resolveToolType(
  supabase: any,
  taskType: string,
  taskParams: any
): Promise<{
  toolType: string;
  category: string;
  contentType: 'image' | 'video';
} | null> {
  // Get default tool_type from task_types table
  const { data: taskTypeData, error: taskTypeError } = await supabase
    .from("task_types")
    .select("category, tool_type, content_type")
    .eq("name", taskType)
    .single();

  if (taskTypeError || !taskTypeData) {
    console.error(`[ToolTypeResolver] Failed to fetch task_types metadata for '${taskType}':`, taskTypeError);
    return null;
  }

  let finalToolType = taskTypeData.tool_type;
  const finalContentType = taskTypeData.content_type || 'image';
  const category = taskTypeData.category;

  console.log(`[ToolTypeResolver] Base task_type '${taskType}' has content_type: ${finalContentType}`);

  // Check for tool_type override in params
  const paramsToolType = taskParams?.tool_type;
  if (paramsToolType) {
    console.log(`[ToolTypeResolver] Found tool_type override in params: ${paramsToolType}`);

    // Validate that the override tool_type is a known valid tool type
    const { data: validToolTypes } = await supabase
      .from("task_types")
      .select("tool_type")
      .not("tool_type", "is", null)
      .eq("is_active", true);

    const validToolTypeSet = new Set(validToolTypes?.map((t: any) => t.tool_type) || []);

    if (validToolTypeSet.has(paramsToolType)) {
      console.log(`[ToolTypeResolver] Using tool_type override: ${paramsToolType} (was: ${finalToolType})`);
      finalToolType = paramsToolType;
    } else {
      console.log(`[ToolTypeResolver] Invalid tool_type override '${paramsToolType}', using default: ${finalToolType}`);
    }
  }

  return {
    toolType: finalToolType,
    category,
    contentType: finalContentType
  };
}

// ===== MAIN GENERATION CREATION =====

/**
 * Main function to create generation from completed task
 */
export async function createGenerationFromTask(
  supabase: any,
  taskId: string,
  taskData: any,
  publicUrl: string,
  thumbnailUrl: string | null | undefined,
  logger?: any
): Promise<any> {
  console.log(`[GenMigration] Starting generation creation for task ${taskId}`);
  logger?.debug("Starting generation creation", {
    task_id: taskId,
    task_type: taskData.task_type,
    tool_type: taskData.tool_type,
    content_type: taskData.content_type,
    has_orchestrator_task_id: !!taskData.params?.orchestrator_task_id,
    has_parent_generation_id: !!taskData.params?.parent_generation_id,
    has_child_generation_id: !!taskData.params?.child_generation_id,
    has_based_on: !!extractBasedOn(taskData.params),
  });

  try {
    // Check if generation already exists
    const existingGeneration = await findExistingGeneration(supabase, taskId);
    if (existingGeneration) {
      console.log(`[GenMigration] Generation already exists for task ${taskId}: ${existingGeneration.id}`);
      console.log(`[GenMigration] Creating new variant and making it primary`);
      logger?.info("Existing generation found - creating regenerated variant", {
        task_id: taskId,
        existing_generation_id: existingGeneration.id,
        action: "create_regenerated_variant"
      });

      const variantParams = {
        ...taskData.params,
        source_task_id: taskId,
        created_from: 'task_completion',
        tool_type: taskData.tool_type,
      };

      await createVariant(
        supabase,
        existingGeneration.id,
        publicUrl,
        thumbnailUrl || null,
        variantParams,
        true,
        'regenerated',
        null
      );

      console.log(`[GenMigration] Successfully created regenerated variant for generation ${existingGeneration.id}`);

      const { shotId, addInPosition } = extractShotAndPosition(taskData.params);
      if (shotId) {
        await linkGenerationToShot(supabase, shotId, existingGeneration.id, addInPosition);
      }

      await supabase
        .from('tasks')
        .update({ generation_created: true })
        .eq('id', taskId);

      return existingGeneration;
    }

    // ===== SPECIAL CASE HANDLERS =====

    // SPECIAL CASE 1a: individual_travel_segment with child_generation_id - create variant on existing child
    if (taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT && taskData.params?.child_generation_id) {
      const childGenId = taskData.params.child_generation_id;
      console.log(`[GenMigration] individual_travel_segment - creating variant for child generation ${childGenId}`);
      logger?.info("SPECIAL CASE 1a: individual_travel_segment with child_generation_id", {
        task_id: taskId,
        child_generation_id: childGenId,
        action: "create_variant_on_existing_child"
      });

      const { data: childGen, error: fetchError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', childGenId)
        .single();

      if (!fetchError && childGen) {
        // Extract pair_shot_generation_id from nested locations if not at top level
        const segmentIndex = taskData.params?.segment_index ?? 0;
        const orchPairIds = taskData.params?.orchestrator_details?.pair_shot_generation_ids;
        const pairShotGenerationId = taskData.params?.pair_shot_generation_id ||
                                      taskData.params?.individual_segment_params?.pair_shot_generation_id ||
                                      (Array.isArray(orchPairIds) && orchPairIds[segmentIndex]);

        const variantParams = {
          ...taskData.params,
          tool_type: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES,
          source_task_id: taskId,
          created_from: 'individual_segment_regeneration',
          ...(pairShotGenerationId && { pair_shot_generation_id: pairShotGenerationId }),
        };

        // Respect make_primary_variant flag from UI (defaults to true for backward compatibility)
        const makePrimary = taskData.params?.make_primary_variant ?? true;
        console.log(`[GenMigration] Creating variant with isPrimary=${makePrimary}`);

        // Use centralized helper for single-segment detection
        const childViewedAt = makePrimary ? await getChildVariantViewedAt(supabase, {
          taskParams: taskData.params,
          childGeneration: childGen,
        }) : null;
        const isSingleSegmentChild = childViewedAt !== null;

        await createVariant(supabase, childGen.id, publicUrl, thumbnailUrl || null, variantParams, makePrimary, VARIANT_TYPES.INDIVIDUAL_SEGMENT, null, childViewedAt);

        console.log(`[GenMigration] Successfully created variant for child generation ${childGenId}${isSingleSegmentChild ? ' (auto-viewed)' : ''}`);

        // SINGLE-SEGMENT PROPAGATION: If this child is the only child of its parent,
        // also create a variant on the parent so the main generation updates automatically
        if (isSingleSegmentChild && childGen.parent_generation_id) {
          console.log(`[GenMigration] Single-segment child - also creating variant on parent ${childGen.parent_generation_id}`);
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
            thumbnailUrl || null,
            {
              ...variantParams,
              propagated_from_child: childGenId,
              created_from: 'single_segment_propagation',
            },
            true, // is_primary
            VARIANT_TYPES.TRAVEL_SEGMENT,
            null
          );
          console.log(`[GenMigration] Successfully propagated to parent generation`);
        }

        await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);
        return childGen;
      }
    }

    // SPECIAL CASE 1b: individual_travel_segment with parent_generation_id but NO child_generation_id
    let individualSegmentParentId: string | null = null;
    let individualSegmentChildOrder: number | null = null;

    if (taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT && !taskData.params?.child_generation_id) {
      const parentGenId = taskData.params?.parent_generation_id ||
                          taskData.params?.orchestrator_details?.parent_generation_id ||
                          taskData.params?.full_orchestrator_payload?.parent_generation_id;

      if (parentGenId) {
        console.log(`[GenMigration] individual_travel_segment (new child) - will create child generation under parent ${parentGenId}`);
        logger?.info("SPECIAL CASE 1b: individual_travel_segment creating new child", {
          task_id: taskId,
          parent_generation_id: parentGenId,
          action: "create_new_child_generation"
        });

        const segmentIndex = taskData.params?.segment_index;
        individualSegmentChildOrder = segmentIndex !== undefined && segmentIndex !== null
          ? parseInt(String(segmentIndex), 10)
          : null;
        individualSegmentParentId = parentGenId;

        console.log(`[GenMigration] individual_travel_segment will use parent_generation_id=${parentGenId}, child_order=${individualSegmentChildOrder}`);
      }
    }

    // SPECIAL CASE 2: travel_stitch - create variant on parent generation
    if (taskData.task_type === TASK_TYPES.TRAVEL_STITCH) {
      const orchTaskId = taskData.params?.orchestrator_task_id_ref ||
                         taskData.params?.orchestrator_task_id ||
                         taskData.params?.full_orchestrator_payload?.orchestrator_task_id;

      if (orchTaskId) {
        console.log(`[GenMigration] travel_stitch - getting parent generation for orchestrator ${orchTaskId}`);
        const parentGen = await getOrCreateParentGeneration(supabase, orchTaskId, taskData.project_id, taskData.params);

        if (parentGen?.id) {
          console.log(`[GenMigration] travel_stitch task ${taskId} - creating variant on parent generation ${parentGen.id}`);
          logger?.info("SPECIAL CASE 2: travel_stitch creating variant on parent", {
            task_id: taskId,
            parent_generation_id: parentGen.id,
            orchestrator_task_id: orchTaskId,
            action: "create_variant_on_parent"
          });
          const result = await createVariantOnParent(
            supabase, parentGen.id, publicUrl, thumbnailUrl || null, taskData, taskId,
            VARIANT_TYPES.TRAVEL_STITCH, { tool_type: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES, created_from: 'travel_stitch_completion' }
          );
          if (result) return result;
        } else {
          console.log(`[GenMigration] travel_stitch task ${taskId} - could not find/create parent generation`);
        }
      } else {
        console.log(`[GenMigration] travel_stitch task ${taskId} - no orchestrator_task_id found`);
      }
    }

    // ===== SUB-TASK (SEGMENT) HANDLING =====
    const orchestratorTaskId = extractOrchestratorTaskId(taskData.params, 'GenMigration');
    let parentGenerationId: string | null = null;
    let isChild = false;
    let childOrder: number | null = null;

    if (orchestratorTaskId) {
      console.log(`[GenMigration] Task ${taskId} is a sub-task of orchestrator ${orchestratorTaskId}`);
      logger?.info("Sub-task detected - orchestrator handling", {
        task_id: taskId,
        orchestrator_task_id: orchestratorTaskId,
        segment_index: taskData.params?.segment_index
      });

      const parentGen = await getOrCreateParentGeneration(supabase, orchestratorTaskId, taskData.project_id, taskData.params);
      if (parentGen) {
        parentGenerationId = parentGen.id;
        isChild = true;
        console.log(`[GenMigration] Linked to parent generation ${parentGenerationId}`);

        const segmentIndex = taskData.params?.segment_index ?? taskData.params?.index ?? taskData.params?.sequence_index;
        if (segmentIndex !== undefined && segmentIndex !== null) {
          childOrder = parseInt(String(segmentIndex), 10);
          console.log(`[GenMigration] Extracted child_order: ${childOrder}`);

          // SPECIAL CASE: join_clips_segment with single join (2 clips)
          if (taskData.task_type === TASK_TYPES.JOIN_CLIPS_SEGMENT) {
            const isSingleJoin = taskData.params?.is_first_join === true && taskData.params?.is_last_join === true;

            if (isSingleJoin && parentGenerationId) {
              console.log(`[JoinClipsSingleJoin] Detected single-join scenario (join_index: ${taskData.params?.join_index}) - creating variant for parent generation ${parentGenerationId}`);
              logger?.info("Single-join scenario - creating variant on parent", {
                task_id: taskId,
                parent_generation_id: parentGenerationId,
                join_index: taskData.params?.join_index,
                action: "create_variant_on_parent_single_join"
              });

              const toolType = taskData.params?.full_orchestrator_payload?.tool_type ||
                               taskData.params?.tool_type ||
                               TOOL_TYPES.JOIN_CLIPS;

              const singleJoinResult = await createVariantOnParent(
                supabase, parentGenerationId, publicUrl, thumbnailUrl || null, taskData, taskId,
                VARIANT_TYPES.JOIN_CLIPS_SEGMENT,
                {
                  tool_type: toolType,
                  created_from: 'single_join_completion',
                  join_index: taskData.params?.join_index ?? 0,
                  is_single_join: true,
                }
              );

              if (singleJoinResult) {
                console.log(`[JoinClipsSingleJoin] Successfully created variant and updated parent generation`);

                await supabase
                  .from('tasks')
                  .update({ generation_created: true })
                  .eq('id', orchestratorTaskId);

                return singleJoinResult;
              } else {
                console.error(`[JoinClipsSingleJoin] Failed to create variant, falling through to child generation creation`);
              }
            }
          }

          // Extract child-specific params from orchestrator_details if available
          const orchDetails = taskData.params?.orchestrator_details;
          let isSingleSegmentCase = false;

          if (orchDetails && !isNaN(childOrder)) {
            console.log(`[GenMigration] Extracting specific params for child segment ${childOrder}`);

            // SPECIAL CASE: For travel orchestrators with only 1 segment
            if (childOrder === 0) {
              const numSegments = orchDetails.num_new_segments_to_generate;
              if (numSegments === 1 && parentGenerationId) {
                isSingleSegmentCase = true;
                console.log(`[TravelSingleSegment] Single-segment orchestrator - creating variant for parent AND child generation`);
                logger?.info("Single-segment orchestrator - creating variant on parent and child", {
                  task_id: taskId,
                  parent_generation_id: parentGenerationId,
                  num_segments: numSegments,
                  action: "create_variant_on_parent_and_child_single_segment"
                });

                const { count: existingVariantCount } = await supabase
                  .from('generation_variants')
                  .select('id', { count: 'exact', head: true })
                  .eq('generation_id', parentGenerationId);
                const isFirstParentVariant = (existingVariantCount || 0) === 0;

                await createVariantOnParent(
                  supabase, parentGenerationId, publicUrl, thumbnailUrl || null, taskData, taskId,
                  VARIANT_TYPES.TRAVEL_SEGMENT,
                  { tool_type: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES, created_from: 'single_segment_travel', segment_index: 0, is_single_segment: true },
                  null,
                  isFirstParentVariant
                );

                await supabase.from('tasks').update({ generation_created: true }).eq('id', orchestratorTaskId);
                console.log(`[TravelSingleSegment] Variant created, continuing to create child generation`);
              }
            }

            // Extract segment-specific params from expanded arrays
            taskData.params = extractSegmentSpecificParams(taskData.params, orchDetails, childOrder);

            if (isSingleSegmentCase) {
              taskData.params._isSingleSegmentCase = true;
            }
          }
        }
      }
    }

    // ===== CHECK FOR EXISTING GENERATION AT SAME POSITION (VARIANT CASE) =====
    const pairShotGenId = taskData.params?.pair_shot_generation_id;
    const isTravelSegment = taskData.task_type === TASK_TYPES.TRAVEL_SEGMENT ||
                            taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT;
    if (parentGenerationId && isTravelSegment && childOrder !== null && !isNaN(childOrder)) {
      console.log(`[TravelSegmentVariant] Checking for existing generation at segment_index=${childOrder}, pair_shot_gen_id=${pairShotGenId || 'none'}`);

      let existingGenId: string | null = null;

      // Strategy 1: Try to find by pair_shot_generation_id in params
      if (pairShotGenId) {
        const { data: matchByPairId, error: matchByPairIdError } = await supabase
          .from('generations')
          .select('id')
          .eq('parent_generation_id', parentGenerationId)
          .eq('is_child', true)
          .eq('params->>pair_shot_generation_id', pairShotGenId)
          .maybeSingle();

        if (!matchByPairIdError && matchByPairId?.id) {
          console.log(`[TravelSegmentVariant] Found match by pair_shot_generation_id: ${matchByPairId.id}`);
          existingGenId = matchByPairId.id;
        }
      }

      // Strategy 2: Fallback to child_order match
      if (!existingGenId) {
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
          console.log(`[TravelSegmentVariant] Found match by child_order=${childOrder}: ${matchByChildOrder.id}`);
          existingGenId = matchByChildOrder.id;
        }
      }

      if (existingGenId) {
        const variantViewedAt = await getChildVariantViewedAt(supabase, {
          taskParams: taskData.params,
          parentGenerationId: parentGenerationId || undefined,
        });
        const isSingleSegment = variantViewedAt !== null;

        console.log(`[TravelSegmentVariant] Found existing generation ${existingGenId} - adding as non-primary variant${isSingleSegment ? ' (auto-viewed)' : ''}`);
        logger?.info("Adding travel segment as variant to existing generation", {
          task_id: taskId,
          existing_generation_id: existingGenId,
          pair_shot_generation_id: pairShotGenId,
          child_order: childOrder,
          parent_generation_id: parentGenerationId,
          is_single_segment: isSingleSegment,
          action: "add_variant_to_existing_segment"
        });

        const variantResult = await createVariantOnParent(
          supabase,
          existingGenId,
          publicUrl,
          thumbnailUrl || null,
          taskData,
          taskId,
          VARIANT_TYPES.TRAVEL_SEGMENT,
          {
            tool_type: TOOL_TYPES.TRAVEL_BETWEEN_IMAGES,
            created_from: 'segment_variant_at_position',
            segment_index: childOrder,
            pair_shot_generation_id: pairShotGenId
          },
          null,
          false,
          variantViewedAt
        );

        if (variantResult) {
          console.log(`[TravelSegmentVariant] Successfully added variant to existing generation ${existingGenId}`);
          return variantResult;
        }

        console.error(`[TravelSegmentVariant] Failed to create variant, falling through to new generation creation`);
      } else {
        console.log(`[TravelSegmentVariant] No existing generation found at position - will create new`);
      }
    }

    // ===== STANDARD GENERATION CREATION =====
    const { shotId, addInPosition } = extractShotAndPosition(taskData.params);

    // Validate shot exists
    if (shotId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(shotId)) {
        const { data: shotData, error: shotError } = await supabase.from('shots').select('id').eq('id', shotId).single();
        if (shotError || !shotData) {
          console.log(`[GenMigration] Shot ${shotId} does not exist, proceeding without shot link`);
        }
      }
    }

    const generationType = taskData.content_type || 'image';
    const generationParams = buildGenerationParams(taskData.params, taskData.tool_type, generationType, shotId, thumbnailUrl || undefined, taskId);
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
        console.warn(`[GenMigration] based_on generation ${basedOnGenerationId} not found, clearing reference`);
        basedOnGenerationId = null;
      }
    }
    if (!basedOnGenerationId) {
      const sourceImageUrl = taskData.params?.image;
      if (sourceImageUrl) {
        basedOnGenerationId = await findSourceGenerationByImageUrl(supabase, sourceImageUrl);
      }
    }

    // Use individualSegmentParentId/childOrder from SPECIAL CASE 1b if set
    const finalParentGenerationId = individualSegmentParentId || parentGenerationId;
    const finalIsChild = !!individualSegmentParentId || isChild;
    const finalChildOrder = individualSegmentChildOrder ?? childOrder;

    logger?.info("Creating standard generation record", {
      task_id: taskId,
      is_child: finalIsChild,
      parent_generation_id: finalParentGenerationId,
      child_order: finalChildOrder,
      based_on: basedOnGenerationId,
      shot_id: shotId,
      generation_type: generationType,
      action: finalIsChild ? "create_child_generation" : "create_standalone_generation"
    });

    const generationRecord: Record<string, any> = {
      id: newGenerationId,
      tasks: [taskId],
      params: generationParams,
      type: generationType,
      project_id: taskData.project_id,
      name: generationName,
      based_on: basedOnGenerationId,
      parent_generation_id: finalParentGenerationId,
      is_child: finalIsChild,
      child_order: finalChildOrder,
      created_at: new Date().toISOString()
    };

    const newGeneration = await insertGeneration(supabase, generationRecord);
    console.log(`[GenMigration] Created generation ${newGeneration.id} for task ${taskId}`);
    logger?.info("Generation record created successfully", {
      task_id: taskId,
      generation_id: newGeneration.id,
      is_child: finalIsChild,
      parent_generation_id: finalParentGenerationId,
      child_order: finalChildOrder
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // MASTER SEGMENT LOG - Log comprehensive segment state for debugging
    // ═══════════════════════════════════════════════════════════════════════════
    const isTravelSegmentTask = taskData.task_type === TASK_TYPES.TRAVEL_SEGMENT ||
                                 taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT;
    const orchDetails = taskData.params?.orchestrator_details ||
                        taskData.params?.full_orchestrator_payload || {};

    if (isTravelSegmentTask && finalIsChild && finalChildOrder !== null) {
      try {
        logSegmentMasterState({
          taskId,
          generationId: newGeneration.id,
          segmentIndex: finalChildOrder,
          parentGenerationId: finalParentGenerationId,
          orchDetails,
          segmentParams: taskData.params,
          shotId: shotId || undefined,
        });
      } catch (logError) {
        console.warn('[SEGMENT_MASTER_STATE] Error logging segment state:', logError);
      }
    }

    // Create "original" variant for ALL generations
    let autoViewedAt: string | null = null;
    let createdFrom = 'generation_original';

    if (finalIsChild) {
      autoViewedAt = await getChildVariantViewedAt(supabase, {
        taskParams: taskData.params,
      });
      createdFrom = autoViewedAt ? 'single_segment_child_original' : 'child_generation_original';
    }

    console.log(`[GenMigration] Creating original variant for generation ${newGeneration.id}${finalIsChild ? ' (child)' : ''}${autoViewedAt ? ' (auto-viewed)' : ''}`);
    await createVariant(
      supabase,
      newGeneration.id,
      publicUrl,
      thumbnailUrl || null,
      {
        ...generationParams,
        source_task_id: taskId,
        created_from: createdFrom,
      },
      true, // is_primary
      'original',
      null, // name
      autoViewedAt
    );
    console.log(`[GenMigration] Created original variant for generation`);

    // Link to shot if applicable (not for child generations)
    if (shotId && !finalIsChild) {
      await linkGenerationToShot(supabase, shotId, newGeneration.id, addInPosition);
    }

    // Mark task as having created a generation
    await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);

    console.log(`[GenMigration] Successfully completed generation creation for task ${taskId}`);
    return newGeneration;

  } catch (error) {
    console.error(`[GenMigration] Error creating generation for task ${taskId}:`, error);
    logger?.error("Error creating generation", {
      task_id: taskId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
