import {
  createTask,
  generateTaskId,
  resolveProjectResolution,
  validateRequiredFields,
  TaskValidationError,
  BaseTaskParams,
} from '../taskCreation';

/**
 * Parameters for creating an image generation task
 * Maps to the parameters expected by the single-image-generate edge function
 */
export interface ImageGenerationTaskParams {
  project_id: string;
  prompt: string;
  negative_prompt?: string;
  resolution?: string; // e.g., "512x512" - will be resolved from project if not provided
  model_name?: string;
  seed?: number;
  loras?: Array<{ path: string; strength: number }>;
  shot_id?: string; // Optional: associate generated image with a shot
}

/**
 * Parameters for creating multiple image generation tasks (batch generation)
 */
export interface BatchImageGenerationTaskParams {
  project_id: string;
  prompts: Array<{
    id: string;
    fullPrompt: string;
    shortPrompt?: string;
  }>;
  imagesPerPrompt: number;
  loras?: Array<{ path: string; strength: number }>;
  shot_id?: string;
  resolution?: string;
  model_name?: string;
}

/**
 * Validates image generation task parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateImageGenerationParams(params: ImageGenerationTaskParams): void {
  validateRequiredFields(params, ['project_id', 'prompt']);

  // Additional validation specific to image generation
  if (params.prompt.trim() === '') {
    throw new TaskValidationError('Prompt cannot be empty', 'prompt');
  }

  if (params.seed !== undefined && (params.seed < 0 || params.seed > 0x7fffffff)) {
    throw new TaskValidationError('Seed must be a 32-bit positive integer', 'seed');
  }

  if (params.loras && params.loras.length > 0) {
    params.loras.forEach((lora, index) => {
      if (!lora.path || lora.path.trim() === '') {
        throw new TaskValidationError(`LoRA ${index + 1}: path is required`, `loras[${index}].path`);
      }
      if (typeof lora.strength !== 'number' || lora.strength < 0 || lora.strength > 2) {
        throw new TaskValidationError(`LoRA ${index + 1}: strength must be a number between 0 and 2`, `loras[${index}].strength`);
      }
    });
  }
}

/**
 * Validates batch image generation parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateBatchImageGenerationParams(params: BatchImageGenerationTaskParams): void {
  validateRequiredFields(params, ['project_id', 'prompts', 'imagesPerPrompt']);

  if (params.prompts.length === 0) {
    throw new TaskValidationError('At least one prompt is required', 'prompts');
  }

  if (params.imagesPerPrompt < 1 || params.imagesPerPrompt > 16) {
    throw new TaskValidationError('Images per prompt must be between 1 and 16', 'imagesPerPrompt');
  }

  params.prompts.forEach((prompt, index) => {
    if (!prompt.fullPrompt || prompt.fullPrompt.trim() === '') {
      throw new TaskValidationError(`Prompt ${index + 1}: fullPrompt cannot be empty`, `prompts[${index}].fullPrompt`);
    }
  });

  // Validate loras if provided (same as single image)
  if (params.loras && params.loras.length > 0) {
    params.loras.forEach((lora, index) => {
      if (!lora.path || lora.path.trim() === '') {
        throw new TaskValidationError(`LoRA ${index + 1}: path is required`, `loras[${index}].path`);
      }
      if (typeof lora.strength !== 'number' || lora.strength < 0 || lora.strength > 2) {
        throw new TaskValidationError(`LoRA ${index + 1}: strength must be a number between 0 and 2`, `loras[${index}].strength`);
      }
    });
  }
}

/**
 * Builds the orchestrator payload for a single image generation task
 * This replicates the logic from the single-image-generate edge function
 */
function buildImageGenerationPayload(
  params: ImageGenerationTaskParams,
  finalResolution: string,
  taskId: string
): Record<string, unknown> {
  // Convert loras array to mapping expected by orchestrator (same as original edge function)
  const additionalLoras: Record<string, number> | undefined = params.loras?.length
    ? params.loras.reduce<Record<string, number>>((acc, lora) => {
        acc[lora.path] = lora.strength;
        return acc;
      }, {})
    : undefined;

  // Build orchestrator payload (replicating original edge function logic)
  const orchestratorPayload: Record<string, unknown> = {
    task_id: taskId,
    prompt: params.prompt,
    model: params.model_name ?? "optimised-t2i",
    resolution: finalResolution,
    seed: params.seed ?? 11111,
    negative_prompt: params.negative_prompt,
  };

  if (additionalLoras) {
    orchestratorPayload.additional_loras = additionalLoras;
  }

  return orchestratorPayload;
}

/**
 * Creates a single image generation task using the unified approach
 * This replaces the direct call to the single-image-generate edge function
 * 
 * @param params - Image generation task parameters
 * @returns Promise resolving to the created task
 */
export async function createImageGenerationTask(params: ImageGenerationTaskParams): Promise<any> {
  console.log("[createImageGenerationTask] Creating task with params:", params);

  try {
    // 1. Validate parameters
    validateImageGenerationParams(params);

    // 2. Resolve project resolution (client-side, matching original edge function logic)
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id,
      params.resolution
    );

    // 3. Generate task ID for orchestrator payload (stored in params, not as DB ID)
    const taskId = generateTaskId("wan_2_2_t2i");

    // 4. Build orchestrator payload (preserve original logic exactly)
    const orchestratorPayload = buildImageGenerationPayload(
      params,
      finalResolution,
      taskId
    );

    // 5. Create task using unified create-task function (let DB auto-generate UUID)
    const result = await createTask({
      project_id: params.project_id,
      task_type: "wan_2_2_t2i",
      params: {
        orchestrator_details: orchestratorPayload,
        task_id: taskId, // Store the orchestrator ID in params, not as DB ID
        model: params.model_name ?? "optimised-t2i",
        prompt: params.prompt,
        resolution: finalResolution,
        ...(params.shot_id ? { shot_id: params.shot_id } : {}),
      }
    });

    console.log("[createImageGenerationTask] Task created successfully:", result);
    return result;

  } catch (error) {
    console.error("[createImageGenerationTask] Error creating task:", error);
    throw error;
  }
}

/**
 * Creates multiple image generation tasks in parallel (batch generation)
 * This replaces the enqueueTasks pattern used in ImageGenerationForm
 * 
 * @param params - Batch image generation parameters
 * @returns Promise resolving to array of created tasks
 */
export async function createBatchImageGenerationTasks(params: BatchImageGenerationTaskParams): Promise<any[]> {
  console.log("[createBatchImageGenerationTasks] Creating batch tasks with params:", params);

  try {
    // 1. Validate parameters
    validateBatchImageGenerationParams(params);

    // 2. Resolve project resolution once for all tasks
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id,
      params.resolution
    );

    // 3. Generate individual task parameters for each image
    const taskParams = params.prompts.flatMap((promptEntry, promptIdx) => {
      return Array.from({ length: params.imagesPerPrompt }, (_, imgIdx) => {
        // Generate a random seed for each task to ensure diverse outputs (32-bit signed integer range)
        const seed = Math.floor(Math.random() * 0x7fffffff);

        return {
          project_id: params.project_id,
          prompt: promptEntry.fullPrompt,
          resolution: finalResolution,
          seed,
          loras: params.loras,
          shot_id: params.shot_id,
          model_name: params.model_name,
        } as ImageGenerationTaskParams;
      });
    });

    console.log(`[createBatchImageGenerationTasks] Creating ${taskParams.length} individual tasks`);

    // 4. Create all tasks in parallel (matching original behavior)
    const results = await Promise.allSettled(
      taskParams.map(taskParam => createImageGenerationTask(taskParam))
    );

    // 5. Process results and collect successes/failures
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[createBatchImageGenerationTasks] Batch results: ${successful} successful, ${failed} failed`);

    // 6. If all failed, throw the first error
    if (successful === 0) {
      const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      throw new Error(`All batch tasks failed: ${firstError.reason}`);
    }

    // 7. If some failed, log warnings but return successful results
    if (failed > 0) {
      console.warn(`[createBatchImageGenerationTasks] ${failed} out of ${taskParams.length} tasks failed`);
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`[createBatchImageGenerationTasks] Task ${index + 1} failed:`, result.reason);
        }
      });
    }

    // 8. Return successful results
    const successfulResults = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    console.log(`[createBatchImageGenerationTasks] Batch completed: ${successfulResults.length} tasks created`);
    return successfulResults;

  } catch (error) {
    console.error("[createBatchImageGenerationTasks] Error creating batch tasks:", error);
    throw error;
  }
}

/**
 * Re-export the interface and error class for convenience
 */
export { TaskValidationError } from "../taskCreation";
