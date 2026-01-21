/**
 * Variant handlers for specific task types
 * Handles edit/inpaint variants and upscale variants
 */

import { getEditVariantType } from './constants.ts';
import { createVariant } from './generation-core.ts';

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

    const variantType = getEditVariantType(taskData.task_type);

    await createVariant(
      supabase,
      basedOnGenerationId,
      publicUrl,
      thumbnailUrl,
      variantParams,
      false,
      variantType,
      null // Don't auto-generate variant name - let user name it if desired
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
      null // Don't auto-generate variant name
    );

    console.log(`[ImageUpscale] Successfully created upscaled variant for generation ${generationId}`);
  } catch (updateErr) {
    console.error(`[ImageUpscale] Exception creating upscaled variant:`, updateErr);
  }
}
