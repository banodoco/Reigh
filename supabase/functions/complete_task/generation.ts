/**
 * Generation and variant creation for complete_task
 * Handles creating generations, variants, and parent/child relationships
 *
 * This is the main entry point - sub-modules handle specific concerns:
 * - generation-core.ts: Basic CRUD operations
 * - generation-parent.ts: Parent/child relationships
 * - generation-segments.ts: Travel segment logic
 * - generation-variants.ts: Edit/upscale variant handlers
 * - generation-handlers.ts: Config-driven completion handlers
 */

import {
  extractBasedOn,
  extractShotAndPosition,
} from './params.ts';
import {
  TASK_TYPES,
  getCompletionConfig,
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

import {
  handleVariantOnParent,
  handleVariantOnChild,
  handleChildGeneration,
  handleStandaloneGeneration,
  type HandlerContext,
} from './generation-handlers.ts';

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
  // From generation-handlers.ts
  handleVariantOnParent,
  handleVariantOnChild,
  handleChildGeneration,
  handleStandaloneGeneration,
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
 *
 * Uses configuration-driven dispatch to route tasks to appropriate handlers:
 * 1. Check for regeneration (existing generation for this task)
 * 2. Get completion config for the task type
 * 3. Route to handler based on completion behavior
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
    // 1. Check for regeneration case (generation already exists for this task)
    const existingGeneration = await findExistingGeneration(supabase, taskId);
    if (existingGeneration) {
      return handleRegeneration(supabase, taskId, taskData, existingGeneration, publicUrl, thumbnailUrl, logger);
    }

    // 2. Get completion config for this task type
    const config = getCompletionConfig(taskData.task_type);
    console.log(`[GenMigration] Task type '${taskData.task_type}' has completion behavior: ${config.completionBehavior}`);

    // 3. Build handler context
    const ctx: HandlerContext = {
      supabase,
      taskId,
      taskData,
      publicUrl,
      thumbnailUrl: thumbnailUrl || null,
      config,
      logger,
    };

    // 4. Route to appropriate handler based on completion behavior
    let result: any = null;

    switch (config.completionBehavior) {
      case 'variant_on_parent':
        result = await handleVariantOnParent(ctx);
        if (result) return result;
        // Fall through to standalone if variant creation failed
        console.log(`[GenMigration] variant_on_parent failed, falling back to standalone`);
        break;

      case 'variant_on_child':
        // individual_travel_segment: try variant_on_child first, then child_generation
        result = await handleVariantOnChild(ctx);
        if (result) return result;
        // Fall through to child_generation behavior
        console.log(`[GenMigration] variant_on_child not applicable, trying child_generation`);
        // Extract parent info for fallback
        const parentGenId = taskData.params?.parent_generation_id ||
                            taskData.params?.orchestrator_details?.parent_generation_id ||
                            taskData.params?.full_orchestrator_payload?.parent_generation_id;
        const segmentIndex = taskData.params?.segment_index;
        const childOrder = segmentIndex !== undefined && segmentIndex !== null
          ? parseInt(String(segmentIndex), 10)
          : null;
        result = await handleChildGeneration(ctx, parentGenId, childOrder);
        if (result) return result;
        break;

      case 'child_generation':
        result = await handleChildGeneration(ctx);
        if (result) return result;
        // Fall through to standalone if child creation failed
        console.log(`[GenMigration] child_generation failed, falling back to standalone`);
        break;

      case 'standalone_generation':
      default:
        // Standalone is the default, handled below
        break;
    }

    // 5. Default: create standalone generation
    return handleStandaloneGeneration(ctx);

  } catch (error) {
    console.error(`[GenMigration] Error creating generation for task ${taskId}:`, error);
    logger?.error("Error creating generation", {
      task_id: taskId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Handle regeneration case - task already has a generation, create new variant
 */
async function handleRegeneration(
  supabase: any,
  taskId: string,
  taskData: any,
  existingGeneration: any,
  publicUrl: string,
  thumbnailUrl: string | null | undefined,
  logger?: any
): Promise<any> {
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
