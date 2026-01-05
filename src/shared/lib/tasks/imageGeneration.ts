import {
  createTask,
  generateTaskId,
  resolveProjectResolution,
  validateRequiredFields,
  TaskValidationError,
  BaseTaskParams,
} from '../taskCreation';

// ============================================================================
// API Parameter Types (single source of truth)
// ============================================================================

/** Reference mode for image generation */
export type ReferenceMode = 'style' | 'subject' | 'style-character' | 'scene' | 'custom';

/**
 * Reference-related API parameters for image generation tasks.
 * Uses snake_case to match API directly.
 */
export interface ReferenceApiParams {
  style_reference_image?: string;
  style_reference_strength: number;
  subject_strength: number;
  subject_description: string;
  in_this_scene: boolean;
  in_this_scene_strength: number;
  reference_mode: ReferenceMode;
}

/** Default reference params */
export const DEFAULT_REFERENCE_PARAMS: ReferenceApiParams = {
  style_reference_strength: 1.0,
  subject_strength: 0.0,
  subject_description: '',
  in_this_scene: false,
  in_this_scene_strength: 0.0,
  reference_mode: 'style',
};

/**
 * Hires fix API parameters for image generation tasks.
 * Uses snake_case to match API directly.
 */
export interface HiresFixApiParams {
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  /** Lightning LoRA strength for phase 1 (initial generation) */
  lightning_lora_strength_phase_1?: number;
  /** Lightning LoRA strength for phase 2 (hires/refinement pass) */
  lightning_lora_strength_phase_2?: number;
  additional_loras?: Record<string, string>;
}

/**
 * Filter reference settings based on the selected reference mode.
 * This ensures only relevant settings are passed to the backend based on what mode is active.
 */
function filterReferenceSettingsByMode(
  referenceMode: 'style' | 'subject' | 'style-character' | 'scene' | 'custom' | undefined,
  settings: {
    style_reference_strength?: number;
    subject_strength?: number;
    subject_description?: string;
    in_this_scene?: boolean;
    in_this_scene_strength?: number;
  }
): Partial<typeof settings> {
  // If no mode specified or custom mode, pass all settings as-is
  if (!referenceMode || referenceMode === 'custom') {
    return settings;
  }

  const filtered: Partial<typeof settings> = {};
  
  console.log(`[ReferenceFilter] Filtering settings for mode: ${referenceMode}`, { input: settings });

  switch (referenceMode) {
    case 'style':
      // Style mode: only pass style strength, exclude subject and scene
      if (settings.style_reference_strength !== undefined) {
        filtered.style_reference_strength = settings.style_reference_strength;
      }
      break;

    case 'subject':
      // Subject mode: style at 1.1, subject at 0.5, plus description
      filtered.style_reference_strength = 1.1;
      filtered.subject_strength = 0.5;
      if (settings.subject_description !== undefined && settings.subject_description.trim()) {
        filtered.subject_description = settings.subject_description;
      }
      break;

    case 'style-character':
      // Style + Subject mode: pass both style and subject, exclude scene
      if (settings.style_reference_strength !== undefined) {
        filtered.style_reference_strength = settings.style_reference_strength;
      }
      if (settings.subject_strength !== undefined) {
        filtered.subject_strength = settings.subject_strength;
      }
      if (settings.subject_description !== undefined && settings.subject_description.trim()) {
        filtered.subject_description = settings.subject_description;
      }
      break;

    case 'scene':
      // Scene mode: style at 1.1, scene strength at 0.5
      filtered.style_reference_strength = 1.1;
      filtered.in_this_scene = true;
      filtered.in_this_scene_strength = 0.5;
      break;
  }
  
  console.log(`[ReferenceFilter] Filtered result for mode ${referenceMode}:`, { output: filtered });

  return filtered;
}

/**
 * Parameters for creating an image generation task.
 * Extends ReferenceApiParams and HiresFixApiParams for single source of truth.
 */
export interface ImageGenerationTaskParams extends Partial<ReferenceApiParams>, Partial<HiresFixApiParams> {
  project_id: string;
  prompt: string;
  negative_prompt?: string;
  resolution?: string;
  model_name?: string;
  seed?: number;
  loras?: Array<{ path: string; strength: number }>;
  shot_id?: string;
  subject_reference_image?: string; // Can differ from style_reference_image
  steps?: number;
}

/**
 * Parameters for creating multiple image generation tasks (batch generation).
 * Extends ReferenceApiParams and HiresFixApiParams for single source of truth.
 */
export interface BatchImageGenerationTaskParams extends Partial<ReferenceApiParams>, Partial<HiresFixApiParams> {
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
  subject_reference_image?: string; // Can differ from style_reference_image
  steps?: number;
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

// Removed buildImageGenerationPayload function - now storing all data at top level to avoid duplication

/**
 * Calculates the final resolution for image generation tasks
 * @param projectId - Project ID for resolution lookup
 * @param customResolution - Optional custom resolution override
 * @param modelName - Model name (affects scaling for Qwen)
 * @param hasStyleReference - Whether task has style reference (affects scaling for Qwen)
 * @returns Promise resolving to the final resolution string
 */
export async function calculateTaskResolution(
  projectId: string,
  customResolution?: string,
  modelName?: string,
  hasStyleReference?: boolean
): Promise<string> {
  // 1. If custom resolution is provided, use it as-is (assume it's already final)
  if (customResolution?.trim()) {
    console.log(`[calculateTaskResolution] Using provided custom resolution: ${customResolution}`);
    return customResolution.trim();
  }
  
  // 2. Get base resolution from project
  const { resolution: baseResolution } = await resolveProjectResolution(projectId);
  
  // 3. Apply Qwen scaling if needed
  const isQwenModel = modelName === 'qwen-image';
  if (isQwenModel && hasStyleReference) {
    const [width, height] = baseResolution.split('x').map(Number);
    const scaledWidth = Math.round(width * 1.5);
    const scaledHeight = Math.round(height * 1.5);
    const scaledResolution = `${scaledWidth}x${scaledHeight}`;
    console.log(`[calculateTaskResolution] Scaling Qwen resolution from ${baseResolution} to ${scaledResolution} for style reference`);
    return scaledResolution;
  }
  
  return baseResolution;
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
  console.log("[createImageGenerationTask] Hires fix params check:", {
    hires_scale: params.hires_scale,
    hires_steps: params.hires_steps,
    hires_denoise: params.hires_denoise,
    lightning_lora_strength_phase_1: params.lightning_lora_strength_phase_1,
    lightning_lora_strength_phase_2: params.lightning_lora_strength_phase_2,
    additional_loras: params.additional_loras,
    steps: params.steps,
  });

  try {
    // 1. Validate parameters
    validateImageGenerationParams(params);

    // 2. Calculate final resolution (handles Qwen scaling automatically)
    const finalResolution = await calculateTaskResolution(
      params.project_id,
      params.resolution,
      params.model_name,
      !!params.style_reference_image
    );

    // 3. Determine task type based on model and whether there's a style reference
    const taskType = (() => {
      const modelName = params.model_name;
      const hasStyleRef = !!params.style_reference_image;

      switch (modelName) {
        case 'qwen-image':
          // Use qwen_image_style for by-reference mode, qwen_image for just-text
          return hasStyleRef ? 'qwen_image_style' : 'qwen_image';
        case 'qwen-image-2512':
          return 'qwen_image_2512';
        case 'z-image':
          return 'z_image_turbo';
        default:
          // Fallback to wan_2_2_t2i for unknown models
          return 'wan_2_2_t2i';
      }
    })();
    const isQwenModel = params.model_name?.startsWith('qwen-image') || params.model_name === 'z-image';
    
    // 4. Generate task ID for orchestrator payload (stored in params, not as DB ID)
    const taskId = generateTaskId(taskType);

    // 5. Create task using unified create-task function (let DB auto-generate UUID)
    const taskParamsToSend = {
      // Store all task data at top level - no duplication
      task_id: taskId,
      model: params.model_name ?? "optimised-t2i",
      prompt: params.prompt,
      resolution: finalResolution,
      seed: params.seed ?? 11111,
      negative_prompt: params.negative_prompt,
      // Use provided steps value if available, otherwise use default of 12
      steps: params.steps ?? 12,
      // Include LoRAs if present, plus the "in this scene" LoRA if enabled
      ...(() => {
        const lorasMap: Record<string, number> = {};
        
        // Add user-selected LoRAs
        if (params.loras?.length) {
          params.loras.forEach(lora => {
            lorasMap[lora.path] = lora.strength;
          });
        }
        
        // Add "in this scene" LoRA if enabled for Qwen models
        if (isQwenModel && params.in_this_scene && params.in_this_scene_strength && params.in_this_scene_strength > 0) {
          lorasMap['https://huggingface.co/peteromallet/random_junk/resolve/main/in_scene_different_object_000010500.safetensors'] = params.in_this_scene_strength;
        }
        
        return Object.keys(lorasMap).length > 0 ? { additional_loras: lorasMap } : {};
      })(),
      // Include style reference for Qwen.Image - filtered by reference mode to only include relevant settings
      ...(isQwenModel && params.style_reference_image && (() => {
        const filteredSettings = filterReferenceSettingsByMode(params.reference_mode, {
          style_reference_strength: params.style_reference_strength ?? 1.0,
          subject_strength: params.subject_strength ?? 0.0,
          subject_description: params.subject_description,
          in_this_scene: params.in_this_scene,
          in_this_scene_strength: params.in_this_scene_strength
        });
        
        return {
          style_reference_image: params.style_reference_image,
          subject_reference_image: params.subject_reference_image || params.style_reference_image, // Fallback to style image
          ...filteredSettings,
          // Add scene_reference_strength if in_this_scene_strength was included in filtered settings
          ...(filteredSettings.in_this_scene_strength !== undefined && {
            scene_reference_strength: filteredSettings.in_this_scene_strength
          })
        };
      })()),
      // Include shot association
      ...(params.shot_id ? { shot_id: params.shot_id } : {}),
      // Make new image generations unpositioned by default
      add_in_position: false,
      // Two-pass hires fix settings
      ...(params.hires_scale !== undefined && { hires_scale: params.hires_scale }),
      ...(params.hires_steps !== undefined && { hires_steps: params.hires_steps }),
      ...(params.hires_denoise !== undefined && { hires_denoise: params.hires_denoise }),
      ...(params.lightning_lora_strength_phase_1 !== undefined && { lightning_lora_strength_phase_1: params.lightning_lora_strength_phase_1 }),
      ...(params.lightning_lora_strength_phase_2 !== undefined && { lightning_lora_strength_phase_2: params.lightning_lora_strength_phase_2 }),
      // Per-phase LoRA strengths for hires fix (overrides additional_loras if provided)
      ...(params.additional_loras && Object.keys(params.additional_loras).length > 0 && {
        additional_loras: params.additional_loras
      }),
    };
    
    console.log("[createImageGenerationTask] Sending clean params to backend:", JSON.stringify(taskParamsToSend, null, 2));
    
    const result = await createTask({
      project_id: params.project_id,
      task_type: taskType,
      params: taskParamsToSend
    });
    
    console.log("[createImageGenerationTask] Backend returned task with params:", JSON.stringify(result?.params, null, 2));

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
  console.log("[createBatchImageGenerationTasks] Hires fix params check:", {
    hires_scale: params.hires_scale,
    hires_steps: params.hires_steps,
    hires_denoise: params.hires_denoise,
    lightning_lora_strength_phase_1: params.lightning_lora_strength_phase_1,
    lightning_lora_strength_phase_2: params.lightning_lora_strength_phase_2,
    additional_loras: params.additional_loras,
    steps: params.steps,
  });

  try {
    // 1. Validate parameters
    validateBatchImageGenerationParams(params);

    // 2. Calculate final resolution once for all tasks (handles Qwen scaling automatically)
    const finalResolution = await calculateTaskResolution(
      params.project_id,
      params.resolution,
      params.model_name,
      !!params.style_reference_image
    );

    // 3. Generate individual task parameters for each image
    const taskParams = params.prompts.flatMap((promptEntry, promptIdx) => {
      return Array.from({ length: params.imagesPerPrompt }, (_, imgIdx) => {
        // Generate a random seed for each task to ensure diverse outputs (32-bit signed integer range)
        const seed = Math.floor(Math.random() * 0x7fffffff);

        return {
          project_id: params.project_id,
          prompt: promptEntry.fullPrompt,
          resolution: finalResolution, // Pass the pre-calculated resolution
          seed,
          loras: params.loras,
          shot_id: params.shot_id,
          model_name: params.model_name,
          steps: params.steps, // Pass through the steps parameter
          reference_mode: params.reference_mode, // Pass reference mode for filtering
          // Include style reference for Qwen.Image model - filtered by reference mode
          ...(params.style_reference_image && (() => {
            const filteredSettings = filterReferenceSettingsByMode(params.reference_mode, {
              style_reference_strength: params.style_reference_strength,
              subject_strength: params.subject_strength,
              subject_description: params.subject_description,
              in_this_scene: params.in_this_scene,
              in_this_scene_strength: params.in_this_scene_strength
            });
            
            return {
              style_reference_image: params.style_reference_image,
              subject_reference_image: params.subject_reference_image || params.style_reference_image,
              ...filteredSettings
            };
          })()),
          // Two-pass hires fix settings
          ...(params.hires_scale !== undefined && { hires_scale: params.hires_scale }),
          ...(params.hires_steps !== undefined && { hires_steps: params.hires_steps }),
          ...(params.hires_denoise !== undefined && { hires_denoise: params.hires_denoise }),
          ...(params.lightning_lora_strength_phase_1 !== undefined && { lightning_lora_strength_phase_1: params.lightning_lora_strength_phase_1 }),
          ...(params.lightning_lora_strength_phase_2 !== undefined && { lightning_lora_strength_phase_2: params.lightning_lora_strength_phase_2 }),
          ...(params.additional_loras && { additional_loras: params.additional_loras }),
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
