import { 
  generateTaskId, 
  generateRunId, 
  createTask, 
  validateRequiredFields, 
  TaskValidationError 
} from "../taskCreation";

/**
 * Interface for join clips task parameters
 */
export interface JoinClipsTaskParams {
  project_id: string;
  starting_video_path: string;
  ending_video_path: string;
  prompt: string;
  
  // Optional parameters with defaults
  context_frame_count?: number;
  gap_frame_count?: number;
  model?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  resolution?: [number, number];
  fps?: number;
  negative_prompt?: string;
  priority?: number;
}

/**
 * Default values for join clips task settings
 */
const DEFAULT_JOIN_CLIPS_VALUES = {
  context_frame_count: 8,
  gap_frame_count: 53,
  model: 'lightning_baseline_2_2_2',
  num_inference_steps: 6,
  guidance_scale: 3.0,
  seed: -1,
  negative_prompt: '',
  priority: 0,
};

/**
 * Validates join clips task parameters
 * 
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateJoinClipsParams(params: JoinClipsTaskParams): void {
  validateRequiredFields(params, [
    'project_id',
    'starting_video_path',
    'ending_video_path',
    'prompt'
  ]);

  // Additional validations
  if (!params.starting_video_path) {
    throw new TaskValidationError("starting_video_path is required", 'starting_video_path');
  }

  if (!params.ending_video_path) {
    throw new TaskValidationError("ending_video_path is required", 'ending_video_path');
  }

  if (!params.prompt) {
    throw new TaskValidationError("prompt is required", 'prompt');
  }
}

/**
 * Builds the orchestrator payload for join clips
 * 
 * @param params - Raw join clips parameters
 * @param taskId - Generated task ID
 * @param runId - Generated run ID
 * @returns Processed orchestrator payload
 */
function buildJoinClipsPayload(
  params: JoinClipsTaskParams, 
  taskId: string,
  runId: string
): Record<string, unknown> {
  // Build orchestrator payload
  const orchestratorPayload: Record<string, unknown> = {
    orchestrator_task_id: taskId,
    run_id: runId,
    starting_video_path: params.starting_video_path,
    ending_video_path: params.ending_video_path,
    prompt: params.prompt,
    context_frame_count: params.context_frame_count ?? DEFAULT_JOIN_CLIPS_VALUES.context_frame_count,
    gap_frame_count: params.gap_frame_count ?? DEFAULT_JOIN_CLIPS_VALUES.gap_frame_count,
    model: params.model ?? DEFAULT_JOIN_CLIPS_VALUES.model,
    num_inference_steps: params.num_inference_steps ?? DEFAULT_JOIN_CLIPS_VALUES.num_inference_steps,
    guidance_scale: params.guidance_scale ?? DEFAULT_JOIN_CLIPS_VALUES.guidance_scale,
    seed: params.seed ?? DEFAULT_JOIN_CLIPS_VALUES.seed,
    negative_prompt: params.negative_prompt ?? DEFAULT_JOIN_CLIPS_VALUES.negative_prompt,
    priority: params.priority ?? DEFAULT_JOIN_CLIPS_VALUES.priority,
  };

  // Add optional parameters if provided
  if (params.resolution) {
    orchestratorPayload.resolution = params.resolution;
  }
  if (params.fps) {
    orchestratorPayload.fps = params.fps;
  }

  return orchestratorPayload;
}

/**
 * Creates a join clips task using the unified approach
 * 
 * @param params - Join clips task parameters
 * @returns Promise resolving to the created task
 */
export async function createJoinClipsTask(params: JoinClipsTaskParams): Promise<any> {
  console.log("[createJoinClipsTask] Creating task with params:", params);

  try {
    // 1. Validate parameters
    validateJoinClipsParams(params);

    // 2. Generate IDs for orchestrator payload
    const orchestratorTaskId = generateTaskId("join_clips");
    const runId = generateRunId();

    // 3. Build orchestrator payload
    const orchestratorPayload = buildJoinClipsPayload(
      params, 
      orchestratorTaskId, 
      runId
    );

    // 4. Create task using unified create-task function
    const result = await createTask({
      project_id: params.project_id,
      task_type: 'join_clips',
      params: orchestratorPayload
    });

    console.log("[createJoinClipsTask] Task created successfully:", result);
    return result;

  } catch (error) {
    console.error("[createJoinClipsTask] Error creating task:", error);
    throw error;
  }
}

/**
 * Re-export the error class for convenience
 */
export { TaskValidationError } from "../taskCreation";

