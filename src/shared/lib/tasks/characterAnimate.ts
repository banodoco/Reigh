import { 
  generateTaskId, 
  generateRunId, 
  createTask, 
  validateRequiredFields, 
  TaskValidationError 
} from "../taskCreation";

/**
 * Interface for character animate (Wan2.2-Animate) task parameters
 */
export interface CharacterAnimateTaskParams {
  project_id: string;
  character_image_url: string;
  motion_video_url: string;
  prompt?: string;
  mode: 'replace' | 'animate';
  resolution: '480p' | '720p';
  seed?: number;
  random_seed?: boolean;
}

/**
 * Default values for character animate task settings
 */
const DEFAULT_CHARACTER_ANIMATE_VALUES = {
  mode: 'animate' as const,
  resolution: '720p' as const,
  prompt: 'natural expression; preserve outfit details',
  seed: Math.floor(Math.random() * 1000000),
  random_seed: true,
};

/**
 * Validates character animate task parameters
 * 
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateCharacterAnimateParams(params: CharacterAnimateTaskParams): void {
  validateRequiredFields(params, [
    'project_id',
    'character_image_url',
    'motion_video_url',
    'mode',
    'resolution'
  ]);

  // Additional validations
  if (!params.character_image_url) {
    throw new TaskValidationError("character_image_url is required", 'character_image_url');
  }

  if (!params.motion_video_url) {
    throw new TaskValidationError("motion_video_url is required", 'motion_video_url');
  }

  if (!['replace', 'animate'].includes(params.mode)) {
    throw new TaskValidationError("mode must be 'replace' or 'animate'", 'mode');
  }

  if (!['480p', '720p'].includes(params.resolution)) {
    throw new TaskValidationError("resolution must be '480p' or '720p'", 'resolution');
  }
}

/**
 * Builds the orchestrator payload for character animation
 * 
 * @param params - Raw character animate parameters
 * @param taskId - Generated task ID
 * @param runId - Generated run ID
 * @returns Processed orchestrator payload
 */
function buildCharacterAnimatePayload(
  params: CharacterAnimateTaskParams, 
  taskId: string,
  runId: string
): Record<string, unknown> {
  // Handle random seed generation
  const finalSeed = params.random_seed 
    ? Math.floor(Math.random() * 1000000) 
    : (params.seed ?? DEFAULT_CHARACTER_ANIMATE_VALUES.seed);
  
  if (params.random_seed) {
    console.log(`[CharacterAnimate] Generated random seed: ${finalSeed}`);
  }

  // Build orchestrator payload
  const orchestratorPayload: Record<string, unknown> = {
    orchestrator_task_id: taskId,
    run_id: runId,
    character_image_url: params.character_image_url,
    motion_video_url: params.motion_video_url,
    prompt: params.prompt ?? DEFAULT_CHARACTER_ANIMATE_VALUES.prompt,
    mode: params.mode ?? DEFAULT_CHARACTER_ANIMATE_VALUES.mode,
    resolution: params.resolution ?? DEFAULT_CHARACTER_ANIMATE_VALUES.resolution,
    seed: finalSeed,
  };

  return orchestratorPayload;
}

/**
 * Creates a character animate task using the unified approach
 * 
 * @param params - Character animate task parameters
 * @returns Promise resolving to the created task
 */
export async function createCharacterAnimateTask(params: CharacterAnimateTaskParams): Promise<any> {
  console.log("[createCharacterAnimateTask] Creating task with params:", params);

  try {
    // 1. Validate parameters
    validateCharacterAnimateParams(params);

    // 2. Generate IDs for orchestrator payload
    const orchestratorTaskId = generateTaskId("character_animate");
    const runId = generateRunId();

    // 3. Build orchestrator payload
    const orchestratorPayload = buildCharacterAnimatePayload(
      params, 
      orchestratorTaskId, 
      runId
    );

    // 4. Create task using unified create-task function
    // For API-based tasks, put params at top level for direct processing
    const result = await createTask({
      project_id: params.project_id,
      task_type: 'animate_character',
      params: orchestratorPayload
    });

    console.log("[createCharacterAnimateTask] Task created successfully:", result);
    return result;

  } catch (error) {
    console.error("[createCharacterAnimateTask] Error creating task:", error);
    throw error;
  }
}

/**
 * Re-export the error class for convenience
 */
export { TaskValidationError } from "../taskCreation";
