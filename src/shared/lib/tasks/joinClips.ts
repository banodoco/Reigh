import {
  generateTaskId,
  generateRunId,
  createTask,
  validateRequiredFields,
  TaskValidationError
} from "../taskCreation";

/**
 * Describes an individual clip that will participate in the join workflow
 */
export interface JoinClipDescriptor {
  url: string;
  name?: string;
}

/**
 * Describes per-join override settings between two adjacent clips
 */
export interface JoinClipsPerJoinSettings {
  prompt?: string;
  gap_frame_count?: number;
  context_frame_count?: number;
  replace_mode?: boolean;
  model?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  negative_prompt?: string;
  priority?: number;
  resolution?: [number, number];
  fps?: number;
  loras?: Array<{ path: string; strength: number }>;
}

/**
 * Interface for join clips task parameters
 * Supports both the legacy two-video API and the new multi-clip orchestration flow
 */
export interface JoinClipsTaskParams {
  project_id: string;

  // New multi-clip structure
  clips?: JoinClipDescriptor[];
  per_join_settings?: JoinClipsPerJoinSettings[];
  run_id?: string;

  // Legacy structure (starting/ending video) for backwards compatibility
  starting_video_path?: string;
  ending_video_path?: string;
  intermediate_video_paths?: string[];

  // Global settings applied to the entire orchestration
  prompt?: string;
  context_frame_count?: number;
  gap_frame_count?: number;
  replace_mode?: boolean; // Replace frames (true) or generate new frames (false)
  model?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  resolution?: [number, number];
  fps?: number;
  negative_prompt?: string;
  priority?: number;
  loras?: Array<{ path: string; strength: number }>; // LoRA models to apply
}

/**
 * Default values for join clips task settings
 */
const DEFAULT_JOIN_CLIPS_VALUES = {
  context_frame_count: 8,
  gap_frame_count: 53,
  prompt: '',
  replace_mode: true,
  model: 'wan_2_2_vace_lightning_baseline_2_2_2',
  num_inference_steps: 6,
  guidance_scale: 3.0,
  seed: -1,
  negative_prompt: '',
  priority: 0,
};

/**
 * Builds the ordered clip sequence from the provided parameters.
 */
function buildClipSequence(params: JoinClipsTaskParams): JoinClipDescriptor[] {
  if (params.clips && params.clips.length > 0) {
    return params.clips.map(clip => ({
      url: clip.url,
      ...(clip.name ? { name: clip.name } : {}),
    }));
  }

  const legacySequence: JoinClipDescriptor[] = [];

  if (params.starting_video_path) {
    legacySequence.push({ url: params.starting_video_path });
  }

  if (params.intermediate_video_paths?.length) {
    legacySequence.push(
      ...params.intermediate_video_paths.map(path => ({ url: path }))
    );
  }

  if (params.ending_video_path) {
    legacySequence.push({ url: params.ending_video_path });
  }

  return legacySequence;
}

/**
 * Validates join clips task parameters and returns the normalized clip sequence
 * 
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateJoinClipsParams(params: JoinClipsTaskParams): JoinClipDescriptor[] {
  validateRequiredFields(params, [
    'project_id'
  ]);

  const clipSequence = buildClipSequence(params);

  if (clipSequence.length < 2) {
    throw new TaskValidationError("At least two clips are required to create a join", 'clips');
  }

  clipSequence.forEach((clip, index) => {
    if (!clip.url || clip.url.trim() === '') {
      throw new TaskValidationError(`Clip at position ${index} is missing a URL`, 'clips');
    }
  });

  const joinsCount = clipSequence.length - 1;

  if (params.per_join_settings && params.per_join_settings.length > joinsCount) {
    throw new TaskValidationError(
      "per_join_settings length cannot exceed the number of joins",
      'per_join_settings'
    );
  }

  return clipSequence;
}

/**
 * Converts an array of LoRA descriptors into the additional_loras map format.
 */
function mapLorasToRecord(loras: Array<{ path: string; strength: number }>): Record<string, number> {
  return loras.reduce<Record<string, number>>((acc, lora) => {
    if (lora.path) {
      acc[lora.path] = lora.strength;
    }
    return acc;
  }, {});
}

/**
 * Builds the orchestrator payload for join clips
 * 
 * @param params - Raw join clips parameters
 * @param clipSequence - Normalized list of clips in order
 * @param runId - Generated run ID
 * @param orchestratorTaskId - Generated orchestrator task ID
 * @returns Processed orchestrator payload
 */
function buildJoinClipsPayload(
  params: JoinClipsTaskParams,
  clipSequence: JoinClipDescriptor[],
  runId: string,
  orchestratorTaskId: string
): Record<string, unknown> {
  const orchestratorDetails: Record<string, unknown> = {
    orchestrator_task_id: orchestratorTaskId,
    clip_list: clipSequence.map(clip => ({
      url: clip.url,
      ...(clip.name ? { name: clip.name } : {}),
    })),
    run_id: runId,
    prompt: params.prompt ?? DEFAULT_JOIN_CLIPS_VALUES.prompt,
    gap_frame_count: params.gap_frame_count ?? DEFAULT_JOIN_CLIPS_VALUES.gap_frame_count,
    context_frame_count: params.context_frame_count ?? DEFAULT_JOIN_CLIPS_VALUES.context_frame_count,
    replace_mode: params.replace_mode ?? DEFAULT_JOIN_CLIPS_VALUES.replace_mode,
    model: params.model ?? DEFAULT_JOIN_CLIPS_VALUES.model,
    num_inference_steps: params.num_inference_steps ?? DEFAULT_JOIN_CLIPS_VALUES.num_inference_steps,
    guidance_scale: params.guidance_scale ?? DEFAULT_JOIN_CLIPS_VALUES.guidance_scale,
    seed: params.seed ?? DEFAULT_JOIN_CLIPS_VALUES.seed,
    negative_prompt: params.negative_prompt ?? DEFAULT_JOIN_CLIPS_VALUES.negative_prompt,
    priority: params.priority ?? DEFAULT_JOIN_CLIPS_VALUES.priority,
  };

  if (params.resolution) {
    orchestratorDetails.resolution = params.resolution;
  }

  if (params.fps !== undefined) {
    orchestratorDetails.fps = params.fps;
  }

  if (params.loras && params.loras.length > 0) {
    orchestratorDetails.additional_loras = mapLorasToRecord(params.loras);
  }

  const totalJoins = Math.max(clipSequence.length - 1, 0);
  if (totalJoins > 0) {
    const perJoinOverrides: Record<string, unknown>[] = [];
    let hasOverrides = false;

    for (let index = 0; index < totalJoins; index++) {
      const override = params.per_join_settings?.[index];
      const joinSettings: Record<string, unknown> = {};

      if (override) {
        if (override.prompt !== undefined) joinSettings.prompt = override.prompt;
        if (override.gap_frame_count !== undefined) joinSettings.gap_frame_count = override.gap_frame_count;
        if (override.context_frame_count !== undefined) joinSettings.context_frame_count = override.context_frame_count;
        if (override.replace_mode !== undefined) joinSettings.replace_mode = override.replace_mode;
        if (override.model !== undefined) joinSettings.model = override.model;
        if (override.num_inference_steps !== undefined) joinSettings.num_inference_steps = override.num_inference_steps;
        if (override.guidance_scale !== undefined) joinSettings.guidance_scale = override.guidance_scale;
        if (override.seed !== undefined) joinSettings.seed = override.seed;
        if (override.negative_prompt !== undefined) joinSettings.negative_prompt = override.negative_prompt;
        if (override.priority !== undefined) joinSettings.priority = override.priority;
        if (override.resolution !== undefined) joinSettings.resolution = override.resolution;
        if (override.fps !== undefined) joinSettings.fps = override.fps;
        if (override.loras && override.loras.length > 0) {
          joinSettings.additional_loras = mapLorasToRecord(override.loras);
        }
      }

      if (Object.keys(joinSettings).length > 0) {
        hasOverrides = true;
        perJoinOverrides.push(joinSettings);
      } else {
        perJoinOverrides.push({});
      }
    }

    if (hasOverrides) {
      orchestratorDetails.per_join_settings = perJoinOverrides;
    }
  }

  return {
    orchestrator_details: orchestratorDetails
  };
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
    const clipSequence = validateJoinClipsParams(params);

    // 2. Generate IDs for orchestrator payload
    const orchestratorTaskId = generateTaskId("join_clips_orchestrator");
    const runId = params.run_id ?? generateRunId();

    // 3. Build orchestrator payload
    const orchestratorPayload = buildJoinClipsPayload(
      params, 
      clipSequence,
      runId,
      orchestratorTaskId
    );

    // 4. Create task using unified create-task function
    const result = await createTask({
      project_id: params.project_id,
      task_type: 'join_clips_orchestrator',
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

