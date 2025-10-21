import { supabase } from '@/integrations/supabase/client';

export interface CreateImageInpaintTaskParams {
  project_id: string;
  image_url: string;
  mask_url: string;
  prompt: string;
  num_generations: number;
  generation_id?: string;
  shot_id?: string;
  tool_type?: string;
}

/**
 * Creates image inpainting tasks
 * Creates multiple tasks if num_generations > 1
 * 
 * @param params - Task parameters
 * @returns Array of task IDs
 */
export async function createImageInpaintTask(params: CreateImageInpaintTaskParams): Promise<string> {
  const {
    project_id,
    image_url,
    mask_url,
    prompt,
    num_generations,
    generation_id,
    shot_id,
    tool_type,
  } = params;

  console.log('[ImageInpaint] Creating inpaint tasks:', {
    project_id: project_id.substring(0, 8),
    image_url: image_url.substring(0, 60),
    mask_url: mask_url.substring(0, 60),
    prompt: prompt.substring(0, 50),
    num_generations,
    generation_id: generation_id?.substring(0, 8),
    shot_id: shot_id?.substring(0, 8),
    tool_type,
  });

  console.log('[InpaintDebug] 🔍 Detailed params check:', {
    has_shot_id: !!shot_id,
    shot_id_value: shot_id,
    has_tool_type: !!tool_type,
    tool_type_value: tool_type
  });

  // Create multiple tasks (one per generation)
  const tasksToCreate = Array(num_generations).fill(null).map(() => ({
    project_id,
    task_type: 'image_inpaint',
    status: 'Queued',
    params: {
      image_url,
      mask_url,
      prompt,
      num_generations: 1, // Each task creates one generation
      generation_id,
      based_on: generation_id, // Explicitly track source generation for lineage
      ...(shot_id ? { shot_id } : {}), // Include shot_id only if provided
      ...(tool_type ? { tool_type } : {}), // Override tool_type if provided (e.g., 'image-generation' when used in different contexts)
    },
  }));

  const { data: tasks, error: taskError } = await supabase
    .from('tasks')
    .insert(tasksToCreate)
    .select('id');

  if (taskError) {
    console.error('[ImageInpaint] Error creating tasks:', taskError);
    throw new Error(`Failed to create inpaint tasks: ${taskError.message}`);
  }

  if (!tasks || tasks.length === 0) {
    throw new Error('Failed to create inpaint tasks: No tasks returned');
  }

  console.log('[ImageInpaint] ✅ Inpaint tasks created successfully:', {
    count: tasks.length,
    taskIds: tasks.map(t => t.id.substring(0, 8)),
  });

  return tasks[0].id; // Return first task ID for compatibility
}

