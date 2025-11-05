import {
  createTask,
  validateRequiredFields,
  TaskValidationError,
  BaseTaskParams,
} from '../taskCreation';

/**
 * Parameters for creating an image upscale task
 */
export interface ImageUpscaleTaskParams {
  project_id: string;
  image_url: string; // The source image to upscale
  generation_id?: string; // Optional: the generation ID to update with upscaled URL
  scale_factor?: number; // Default to 2x upscaling
  output_format?: string; // Default to "jpeg"
}

/**
 * Validates image upscale task parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateImageUpscaleParams(params: ImageUpscaleTaskParams): void {
  validateRequiredFields(params, ['project_id', 'image_url']);

  if (params.image_url.trim() === '') {
    throw new TaskValidationError('Image URL cannot be empty', 'image_url');
  }

  // Validate URL format
  try {
    new URL(params.image_url);
  } catch {
    throw new TaskValidationError('Image URL must be a valid URL', 'image_url');
  }

  if (params.scale_factor !== undefined && (params.scale_factor < 1 || params.scale_factor > 8)) {
    throw new TaskValidationError('Scale factor must be between 1 and 8', 'scale_factor');
  }
}

/**
 * Builds the task params for an image-upscale task
 */
function buildImageUpscaleTaskParams(
  params: ImageUpscaleTaskParams
): Record<string, unknown> {
  const taskParams: Record<string, unknown> = {
    image: params.image_url,
    scale_factor: params.scale_factor ?? 2,
    output_format: params.output_format ?? "jpeg",
  };

  // Add generation_id to task params so the worker knows which generation to update
  if (params.generation_id) {
    taskParams.generation_id = params.generation_id;
  }

  return taskParams;
}

/**
 * Creates an image upscale task
 * 
 * @param params - Image upscale task parameters
 * @returns Promise resolving to the created task
 */
export async function createImageUpscaleTask(params: ImageUpscaleTaskParams): Promise<any> {
  try {
    // 1. Validate parameters
    validateImageUpscaleParams(params);

    // 2. Build task params in the image-upscale format
    const taskParams = buildImageUpscaleTaskParams(params);

    // 3. Create task using unified create-task function
    const result = await createTask({
      project_id: params.project_id,
      task_type: "image-upscale",
      params: taskParams,
    });

    return result;

  } catch (error) {
    console.error("[createImageUpscaleTask] Error creating task:", error);
    throw error;
  }
}

