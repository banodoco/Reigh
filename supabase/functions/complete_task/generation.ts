/**
 * Generation and variant creation for complete_task
 * Handles creating generations, variants, and parent/child relationships
 */

import {
  extractOrchestratorTaskId,
  extractBasedOn,
  extractShotAndPosition,
  buildGenerationParams,
} from './params.ts';

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

// ===== GENERATION LOOKUP =====

/**
 * Check for existing generation referencing this task_id
 */
export async function findExistingGeneration(supabase: any, taskId: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .contains('tasks', JSON.stringify([taskId]))
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error(`[GenMigration] Error finding existing generation:`, error);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`[GenMigration] Exception finding existing generation:`, error);
    return null;
  }
}

/**
 * Find source generation by image URL (for magic edit tracking)
 */
export async function findSourceGenerationByImageUrl(supabase: any, imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null;

  try {
    console.log(`[BasedOn] Looking for source generation with image URL: ${imageUrl}`);
    const { data, error } = await supabase
      .from('generations')
      .select('id')
      .eq('location', imageUrl)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[BasedOn] Error finding source generation:`, error);
      return null;
    }

    if (data) {
      console.log(`[BasedOn] Found source generation: ${data.id}`);
      return data.id;
    }

    console.log(`[BasedOn] No source generation found for image URL`);
    return null;
  } catch (error) {
    console.error(`[BasedOn] Exception finding source generation:`, error);
    return null;
  }
}

// ===== GENERATION/VARIANT CREATION =====

/**
 * Insert generation record
 */
export async function insertGeneration(supabase: any, record: any): Promise<any> {
  const { data, error } = await supabase
    .from('generations')
    .insert(record)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert generation: ${error.message}`);
  }

  return data;
}

/**
 * Create a generation variant
 */
export async function createVariant(
  supabase: any,
  generationId: string,
  location: string,
  thumbnailUrl: string | null,
  params: any,
  isPrimary: boolean,
  variantType: string | null,
  name?: string | null
): Promise<any> {
  const variantRecord = {
    generation_id: generationId,
    location,
    thumbnail_url: thumbnailUrl,
    params,
    is_primary: isPrimary,
    variant_type: variantType,
    name: name || null,
    created_at: new Date().toISOString()
  };

  console.log(`[Variant] Creating variant for generation ${generationId}: type=${variantType}, isPrimary=${isPrimary}`);

  const { data, error } = await supabase
    .from('generation_variants')
    .insert(variantRecord)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create variant: ${error.message}`);
  }

  console.log(`[Variant] Created variant ${data.id} for generation ${generationId}`);
  return data;
}

/**
 * Link generation to shot using the existing RPC
 */
export async function linkGenerationToShot(
  supabase: any, 
  shotId: string, 
  generationId: string, 
  addInPosition: boolean
): Promise<void> {
  try {
    const { error } = await supabase.rpc('add_generation_to_shot', {
      p_shot_id: shotId,
      p_generation_id: generationId,
      p_with_position: addInPosition
    });

    if (error) {
      console.error(`[ShotLink] Failed to link generation ${generationId} to shot ${shotId}:`, error);
    } else {
      console.log(`[ShotLink] Successfully linked generation ${generationId} to shot ${shotId}`);
    }
  } catch (error) {
    console.error(`[ShotLink] Exception linking generation to shot:`, error);
  }
}

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
      tool_type: baseParams.tool_type || 'travel-between-images'
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

// ===== MAIN GENERATION CREATION =====

/**
 * Helper function to create variant and update parent generation
 */
async function createVariantOnParent(
  supabase: any,
  parentGenId: string,
  publicUrl: string,
  thumbnailUrl: string | null,
  taskData: any,
  taskId: string,
  variantType: string,
  extraParams: Record<string, any> = {},
  variantName?: string | null
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
      true,           // is_primary
      variantType,
      variantName || null
    );

    // Update the parent generation with the new location
    const updatedParams = {
      ...(parentGen.params || {}),
      ...extraParams,
    };
    
    const { error: updateError } = await supabase
      .from('generations')
      .update({
        location: publicUrl,
        thumbnail_url: thumbnailUrl,
        type: 'video',
        params: updatedParams
      })
      .eq('id', parentGen.id);

    if (updateError) {
      console.error(`[GenMigration] Error updating parent generation:`, updateError);
    } else {
      console.log(`[GenMigration] Successfully created ${variantType} variant and updated parent generation ${parentGen.id}`);
    }

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
 * Main function to create generation from completed task
 */
export async function createGenerationFromTask(
  supabase: any,
  taskId: string,
  taskData: any,
  publicUrl: string,
  thumbnailUrl: string | null | undefined
): Promise<any> {
  console.log(`[GenMigration] Starting generation creation for task ${taskId}`);

  try {
    // Check if generation already exists
    const existingGeneration = await findExistingGeneration(supabase, taskId);
    if (existingGeneration) {
      console.log(`[GenMigration] Generation already exists for task ${taskId}: ${existingGeneration.id}`);
      console.log(`[GenMigration] Creating new variant and making it primary`);

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

      const { error: updateError } = await supabase
        .from('generations')
        .update({
          location: publicUrl,
          thumbnail_url: thumbnailUrl,
        })
        .eq('id', existingGeneration.id);

      if (updateError) {
        console.error(`[GenMigration] Failed to update generation with new variant:`, updateError);
      }

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
    
    // SPECIAL CASE 1: individual_travel_segment with child_generation_id
    if (taskData.task_type === 'individual_travel_segment' && taskData.params?.child_generation_id) {
      const childGenId = taskData.params.child_generation_id;
      console.log(`[GenMigration] individual_travel_segment - creating variant for child generation ${childGenId}`);

      const { data: childGen, error: fetchError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', childGenId)
        .single();

      if (!fetchError && childGen) {
        const variantParams = {
          ...taskData.params,
          tool_type: 'travel-between-images',
          source_task_id: taskId,
          created_from: 'individual_segment_regeneration',
        };

        await createVariant(supabase, childGen.id, publicUrl, thumbnailUrl || null, variantParams, true, 'individual_segment', null);

        await supabase
          .from('generations')
          .update({ location: publicUrl, thumbnail_url: thumbnailUrl, type: 'video', params: { ...childGen.params, tool_type: 'travel-between-images' } })
          .eq('id', childGen.id);

        await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);
        return childGen;
      }
    }

    // SPECIAL CASE 2: travel_stitch with parent_generation_id
    const travelStitchParentId = taskData.task_type === 'travel_stitch' 
      ? (taskData.params?.orchestrator_details?.parent_generation_id || taskData.params?.parent_generation_id)
      : null;
    
    if (travelStitchParentId) {
      const result = await createVariantOnParent(
        supabase, travelStitchParentId, publicUrl, thumbnailUrl || null, taskData, taskId,
        'travel_stitch', { tool_type: 'travel-between-images', created_from: 'travel_stitch_completion' }
      );
      if (result) return result;
    }

    // ===== SUB-TASK (SEGMENT) HANDLING =====
    const orchestratorTaskId = extractOrchestratorTaskId(taskData.params, 'GenMigration');
    let parentGenerationId: string | null = null;
    let isChild = false;
    let childOrder: number | null = null;

    if (orchestratorTaskId) {
      console.log(`[GenMigration] Task ${taskId} is a sub-task of orchestrator ${orchestratorTaskId}`);

      const parentGen = await getOrCreateParentGeneration(supabase, orchestratorTaskId, taskData.project_id, taskData.params);
      if (parentGen) {
        parentGenerationId = parentGen.id;
        isChild = true;
        console.log(`[GenMigration] Linked to parent generation ${parentGenerationId}`);

        const segmentIndex = taskData.params?.segment_index ?? taskData.params?.index ?? taskData.params?.sequence_index;
        if (segmentIndex !== undefined && segmentIndex !== null) {
          childOrder = parseInt(String(segmentIndex), 10);
          console.log(`[GenMigration] Extracted child_order: ${childOrder}`);

          // Handle single-segment case
          const orchDetails = taskData.params?.orchestrator_details;
          if (orchDetails && childOrder === 0) {
            const numSegments = orchDetails.num_new_segments_to_generate;
            if (numSegments === 1 && parentGenerationId) {
              console.log(`[TravelSingleSegment] Single-segment orchestrator - creating variant for parent`);
              const result = await createVariantOnParent(
                supabase, parentGenerationId, publicUrl, thumbnailUrl || null, taskData, taskId,
                'travel_segment', { tool_type: 'travel-between-images', created_from: 'single_segment_travel', segment_index: 0, is_single_segment: true }
              );
              if (result) {
                await supabase.from('tasks').update({ generation_created: true }).eq('id', orchestratorTaskId);
                return result;
              }
            }
          }
        }
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
    const generationParams = buildGenerationParams(taskData.params, taskData.tool_type, generationType, shotId, thumbnailUrl || undefined);
    const newGenerationId = crypto.randomUUID();

    // Extract generation_name
    const generationName = taskData.params?.generation_name ||
      taskData.params?.orchestrator_details?.generation_name ||
      taskData.params?.full_orchestrator_payload?.generation_name;

    // Find based_on
    let basedOnGenerationId: string | null = extractBasedOn(taskData.params);
    if (!basedOnGenerationId) {
      const sourceImageUrl = taskData.params?.image;
      if (sourceImageUrl) {
        basedOnGenerationId = await findSourceGenerationByImageUrl(supabase, sourceImageUrl);
      }
    }

    const generationRecord = {
      id: newGenerationId,
      tasks: [taskId],
      params: generationParams,
      location: publicUrl,
      type: generationType,
      project_id: taskData.project_id,
      thumbnail_url: thumbnailUrl,
      name: generationName,
      based_on: basedOnGenerationId,
      parent_generation_id: parentGenerationId,
      is_child: isChild,
      child_order: childOrder,
      created_at: new Date().toISOString()
    };

    const newGeneration = await insertGeneration(supabase, generationRecord);
    console.log(`[GenMigration] Created generation ${newGeneration.id} for task ${taskId}`);

    // For child generations, also create a variant on parent
    if (isChild && parentGenerationId) {
      console.log(`[GenMigration] Creating variant on parent ${parentGenerationId} for child segment ${childOrder}`);
      try {
        await createVariant(
          supabase,
          parentGenerationId,
          publicUrl,
          thumbnailUrl || null,
          { ...taskData.params, tool_type: 'travel-between-images', source_task_id: taskId, created_from: 'travel_segment', segment_index: childOrder, child_generation_id: newGeneration.id },
          false,
          'travel_segment',
          `Segment ${(childOrder ?? 0) + 1}`
        );
      } catch (variantErr) {
        console.error(`[GenMigration] Error creating variant for child segment:`, variantErr);
      }
    }

    // Link to shot if applicable (not for child generations)
    if (shotId && !isChild) {
      await linkGenerationToShot(supabase, shotId, newGeneration.id, addInPosition);
    }

    // Mark task as having created a generation
    await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);

    console.log(`[GenMigration] Successfully completed generation creation for task ${taskId}`);
    return newGeneration;

  } catch (error) {
    console.error(`[GenMigration] Error creating generation for task ${taskId}:`, error);
    throw error;
  }
}

// ===== VARIANT HANDLERS FOR SPECIFIC TASK TYPES =====

/**
 * Handle inpaint/edit tasks - create variant on source generation
 */
export async function handleVariantCreation(
  supabase: any,
  taskId: string,
  taskData: any,
  basedOnGenerationId: string,
  publicUrl: string,
  thumbnailUrl: string | null
): Promise<boolean> {
  console.log(`[ImageEdit] Task ${taskId} has based_on=${basedOnGenerationId} - creating variant`);
  
  try {
    const { data: sourceGen, error: fetchError } = await supabase
      .from('generations')
      .select('id, params, thumbnail_url, project_id')
      .eq('id', basedOnGenerationId)
      .single();

    if (fetchError || !sourceGen) {
      console.error(`[ImageEdit] Source generation ${basedOnGenerationId} not found:`, fetchError);
      return false;
    }

    const variantParams = {
      ...taskData.params,
      source_task_id: taskId,
      source_variant_id: taskData.params?.source_variant_id || null,
      created_from: taskData.task_type,
      tool_type: taskData.tool_type,
      content_type: taskData.content_type,
    };

    let variantType = 'edit';
    if (taskData.task_type === 'image_inpaint') variantType = 'inpaint';
    else if (taskData.task_type === 'annotated_image_edit') variantType = 'annotated_edit';
    else if (['qwen_image_edit', 'image_edit', 'magic_edit'].includes(taskData.task_type)) variantType = 'magic_edit';

    await createVariant(
      supabase,
      basedOnGenerationId,
      publicUrl,
      thumbnailUrl,
      variantParams,
      false,
      variantType,
      taskData.params?.prompt ? `Edit: ${taskData.params.prompt.substring(0, 40)}...` : 'Edit'
    );

    console.log(`[ImageEdit] Successfully created ${variantType} variant on generation ${basedOnGenerationId}`);

    await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);
    return true;

  } catch (variantErr) {
    console.error(`[ImageEdit] Error creating variant for task ${taskId}:`, variantErr);
    return false;
  }
}

/**
 * Handle upscale tasks - create primary variant
 */
export async function handleUpscaleVariant(
  supabase: any,
  taskId: string,
  taskData: any,
  publicUrl: string,
  thumbnailUrl: string | null
): Promise<void> {
  console.log(`[ImageUpscale] Processing upscale task ${taskId}`);

  const generationId = taskData.params?.generation_id;
  if (!generationId) {
    console.log(`[ImageUpscale] No generation_id in task params, skipping`);
    return;
  }

  try {
    const { data: sourceGen, error: fetchError } = await supabase
      .from('generations')
      .select('params, thumbnail_url')
      .eq('id', generationId)
      .single();

    if (fetchError) {
      console.error(`[ImageUpscale] Error fetching source generation:`, fetchError);
    }
    
    const upscaleParams = {
      ...(sourceGen?.params || {}),
      upscale_task_id: taskId,
      upscaled_from: taskData.params?.image || null,
      upscale_model: taskData.params?.model || 'unknown',
      tool_type: sourceGen?.params?.tool_type || 'image-generation'
    };
    
    await createVariant(
      supabase,
      generationId,
      publicUrl,
      thumbnailUrl || sourceGen?.thumbnail_url || null,
      upscaleParams,
      true,
      'upscaled',
      'Upscaled'
    );
    
    console.log(`[ImageUpscale] Successfully created upscaled variant for generation ${generationId}`);
  } catch (updateErr) {
    console.error(`[ImageUpscale] Exception creating upscaled variant:`, updateErr);
  }
}

