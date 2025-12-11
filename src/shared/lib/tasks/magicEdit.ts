import {
  createTask,
  generateTaskId,
  resolveProjectResolution,
  validateRequiredFields,
  TaskValidationError,
  BaseTaskParams,
} from '../taskCreation';

/**
 * Parameters for creating a magic edit task
 * Maps to the parameters expected by the image_edit task type
 */
export interface LoraConfig {
  url: string;
  strength: number;
}

export interface MagicEditTaskParams {
  project_id: string;
  prompt: string;
  image_url: string; // The source image to edit
  negative_prompt?: string;
  resolution?: string; // e.g., "512x512" - will be resolved from project if not provided
  seed?: number;
  in_scene?: boolean; // In-scene boost option
  shot_id?: string; // Optional: associate generated image with a shot
  output_format?: string; // Default to "jpeg"
  enable_sync_mode?: boolean; // Default to false
  max_wait_seconds?: number; // Default to 300
  enable_base64_output?: boolean; // Default to false
  tool_type?: string; // Optional: override tool type for generation association
  loras?: LoraConfig[]; // Optional: array of lora configurations for model enhancement
  based_on?: string; // Optional: source generation ID for lineage tracking
  source_variant_id?: string; // Optional: source variant ID when editing from a non-primary variant
  create_as_generation?: boolean; // Optional: if true, create a new generation instead of a variant
}

/**
 * Parameters for creating multiple magic edit tasks (batch generation)
 */
export interface BatchMagicEditTaskParams {
  project_id: string;
  prompt: string;
  image_url: string;
  numImages: number; // How many variations to generate
  negative_prompt?: string;
  resolution?: string;
  seed?: number;
  in_scene?: boolean;
  shot_id?: string;
  output_format?: string;
  enable_sync_mode?: boolean;
  max_wait_seconds?: number;
  enable_base64_output?: boolean;
  tool_type?: string; // Optional: override tool type for generation association
  loras?: LoraConfig[]; // Optional: array of lora configurations for model enhancement
  based_on?: string; // Optional: source generation ID for lineage tracking
  source_variant_id?: string; // Optional: source variant ID when editing from a non-primary variant
  create_as_generation?: boolean; // Optional: if true, create a new generation instead of a variant
}

/**
 * Validates magic edit task parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateMagicEditParams(params: MagicEditTaskParams): void {
  validateRequiredFields(params, ['project_id', 'prompt', 'image_url']);

  // Additional validation specific to magic edit
  if (params.prompt.trim() === '') {
    throw new TaskValidationError('Prompt cannot be empty', 'prompt');
  }

  if (params.image_url.trim() === '') {
    throw new TaskValidationError('Image URL cannot be empty', 'image_url');
  }

  // Validate URL format
  try {
    new URL(params.image_url);
  } catch {
    throw new TaskValidationError('Image URL must be a valid URL', 'image_url');
  }

  if (params.seed !== undefined && (params.seed < 0 || params.seed > 0x7fffffff)) {
    throw new TaskValidationError('Seed must be a 32-bit positive integer', 'seed');
  }

  if (params.max_wait_seconds !== undefined && params.max_wait_seconds < 1) {
    throw new TaskValidationError('Max wait seconds must be positive', 'max_wait_seconds');
  }
}

/**
 * Validates batch magic edit parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateBatchMagicEditParams(params: BatchMagicEditTaskParams): void {
  validateRequiredFields(params, ['project_id', 'prompt', 'image_url', 'numImages']);

  // Validate numImages
  if (params.numImages < 1 || params.numImages > 16) {
    throw new TaskValidationError('Number of images must be between 1 and 16', 'numImages');
  }

  // Use single task validation for the rest
  validateMagicEditParams({
    project_id: params.project_id,
    prompt: params.prompt,
    image_url: params.image_url,
    negative_prompt: params.negative_prompt,
    resolution: params.resolution,
    seed: params.seed,
    in_scene: params.in_scene,
    shot_id: params.shot_id,
    output_format: params.output_format,
    enable_sync_mode: params.enable_sync_mode,
    max_wait_seconds: params.max_wait_seconds,
    enable_base64_output: params.enable_base64_output,
  });
}

/**
 * Builds the task params for an image_edit task
 * This follows the format from the example task you provided
 */
function buildMagicEditTaskParams(
  params: MagicEditTaskParams,
  finalResolution: string
): Record<string, unknown> {
  // Build the task params in the format expected by image_edit
  const taskParams: Record<string, unknown> = {
    seed: params.seed ?? Math.floor(Math.random() * 0x7fffffff),
    image: params.image_url,
    prompt: params.prompt,
    output_format: params.output_format ?? "jpeg",
    qwen_endpoint: "qwen-image-edit",
    enable_sync_mode: params.enable_sync_mode ?? false,
    max_wait_seconds: params.max_wait_seconds ?? 300,
    enable_base64_output: params.enable_base64_output ?? false,
  };

  // Add optional parameters if provided
  if (params.negative_prompt) {
    taskParams.negative_prompt = params.negative_prompt;
  }

  if (params.in_scene !== undefined) {
    taskParams.in_scene = params.in_scene;
  }

  // Add resolution if needed (some edit models may use this)
  if (finalResolution && finalResolution !== "custom") {
    taskParams.resolution = finalResolution;
  }

  // Add shot_id as top-level parameter if provided
  if (params.shot_id) {
    taskParams.shot_id = params.shot_id;
  }

  // Always add add_in_position as false for magic edit tasks (unpositioned by default)
  taskParams.add_in_position = false;
  
  console.log('[MagicEditTaskDebug] Creating magic edit task with params:', {
    shot_id: params.shot_id,
    add_in_position: false,
    tool_type: params.tool_type,
    taskParams: taskParams
  });

  // Add tool_type override if provided (for generation association)
  if (params.tool_type) {
    taskParams.tool_type = params.tool_type;
  }

  // Add loras if provided
  if (params.loras && params.loras.length > 0) {
    taskParams.loras = params.loras;
  }

  // Add based_on if provided (for lineage tracking)
  if (params.based_on) {
    taskParams.based_on = params.based_on;
  }

  // Add source_variant_id if provided (for variant relationship tracking)
  if (params.source_variant_id) {
    taskParams.source_variant_id = params.source_variant_id;
    console.log('[VariantRelationship] Adding source_variant_id to task params:', params.source_variant_id);
  }

  // Add create_as_generation if true (create new generation instead of variant)
  if (params.create_as_generation) {
    taskParams.create_as_generation = true;
    console.log('[MagicEdit] Will create as new generation instead of variant');
  }

  return taskParams;
}

/**
 * Creates a single magic edit task using the unified approach
 * This replaces the direct call to the magic-edit edge function
 * 
 * @param params - Magic edit task parameters
 * @returns Promise resolving to the created task
 */
export async function createMagicEditTask(params: MagicEditTaskParams): Promise<any> {
  console.log("[createMagicEditTask] Creating task with params:", params);

  try {
    // 1. Validate parameters
    validateMagicEditParams(params);

    // 2. Resolve project resolution (client-side)
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id,
      params.resolution
    );

    // 3. Build task params in the image_edit format
    const taskParams = buildMagicEditTaskParams(params, finalResolution);

    // 4. Create task using unified create-task function
    const result = await createTask({
      project_id: params.project_id,
      task_type: "qwen_image_edit",
      params: taskParams,
    });

    console.log("[createMagicEditTask] Task created successfully:", result);
    return result;

  } catch (error) {
    console.error("[createMagicEditTask] Error creating task:", error);
    throw error;
  }
}

/**
 * Creates multiple magic edit tasks in parallel (batch generation)
 * Used by MediaLightbox unified edit mode for creating multiple variations
 * 
 * @param params - Batch magic edit parameters
 * @returns Promise resolving to array of created tasks
 */
export async function createBatchMagicEditTasks(params: BatchMagicEditTaskParams): Promise<any[]> {
  console.log("[createBatchMagicEditTasks] Creating batch tasks with params:", params);

  try {
    // 1. Validate parameters
    validateBatchMagicEditParams(params);

    // 2. Resolve project resolution once for all tasks
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id,
      params.resolution
    );

    // 3. Generate individual task parameters for each image
    const taskParams = Array.from({ length: params.numImages }, (_, index) => {
      // Generate a different seed for each task to ensure variety
      const seed = params.seed ?? Math.floor(Math.random() * 0x7fffffff);

      return {
        project_id: params.project_id,
        prompt: params.prompt,
        image_url: params.image_url,
        negative_prompt: params.negative_prompt,
        resolution: finalResolution,
        seed: seed + index, // Increment seed for variation
        in_scene: params.in_scene,
        shot_id: params.shot_id,
        output_format: params.output_format,
        enable_sync_mode: params.enable_sync_mode,
        max_wait_seconds: params.max_wait_seconds,
        enable_base64_output: params.enable_base64_output,
        tool_type: params.tool_type, // Pass through tool type override
        loras: params.loras, // Pass through lora configurations
        based_on: params.based_on, // Pass through source generation ID for lineage tracking
        source_variant_id: params.source_variant_id, // Pass through source variant ID for relationship tracking
        create_as_generation: params.create_as_generation, // Pass through create as generation flag
      } as MagicEditTaskParams;
    });

    console.log(`[createBatchMagicEditTasks] Creating ${taskParams.length} individual tasks`);

    // 4. Create all tasks in parallel
    const results = await Promise.allSettled(
      taskParams.map(taskParam => createMagicEditTask(taskParam))
    );

    // 5. Process results and collect successes/failures
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[createBatchMagicEditTasks] Batch results: ${successful} successful, ${failed} failed`);

    // 6. If all failed, throw the first error
    if (successful === 0) {
      const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      throw new Error(`All batch tasks failed: ${firstError.reason}`);
    }

    // 7. If some failed, log warnings but return successful results
    if (failed > 0) {
      console.warn(`[createBatchMagicEditTasks] ${failed} out of ${taskParams.length} tasks failed`);
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`[createBatchMagicEditTasks] Task ${index + 1} failed:`, result.reason);
        }
      });
    }

    // 8. Return successful results
    const successfulResults = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    console.log(`[createBatchMagicEditTasks] Batch completed: ${successfulResults.length} tasks created`);
    return successfulResults;

  } catch (error) {
    console.error("[createBatchMagicEditTasks] Error creating batch tasks:", error);
    throw error;
  }
}

/**
 * Re-export the interface and error class for convenience
 */
export { TaskValidationError } from "../taskCreation";
export type { LoraConfig };
