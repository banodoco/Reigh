import { supabase } from '@/integrations/supabase/client';

export interface CreateImageInpaintTaskParams {
  project_id: string;
  image_url: string;
  mask_url: string;
  prompt: string;
  num_generations: number;
  generation_id?: string;
}

/**
 * Creates an image inpainting task
 * 
 * @param params - Task parameters
 * @returns Task ID
 */
export async function createImageInpaintTask(params: CreateImageInpaintTaskParams): Promise<string> {
  const {
    project_id,
    image_url,
    mask_url,
    prompt,
    num_generations,
    generation_id,
  } = params;

  console.log('[ImageInpaint] Creating inpaint task:', {
    project_id: project_id.substring(0, 8),
    image_url: image_url.substring(0, 60),
    mask_url: mask_url.substring(0, 60),
    prompt: prompt.substring(0, 50),
    num_generations,
    generation_id: generation_id?.substring(0, 8),
  });

  // Create task in database
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      project_id,
      type: 'image_inpaint',
      status: 'pending',
      parameters: {
        image_url,
        mask_url,
        prompt,
        num_generations,
        generation_id,
      },
    })
    .select('id')
    .single();

  if (taskError) {
    console.error('[ImageInpaint] Error creating task:', taskError);
    throw new Error(`Failed to create inpaint task: ${taskError.message}`);
  }

  if (!task) {
    throw new Error('Failed to create inpaint task: No task returned');
  }

  console.log('[ImageInpaint] ✅ Inpaint task created successfully:', {
    taskId: task.id.substring(0, 8),
  });

  return task.id;
}

