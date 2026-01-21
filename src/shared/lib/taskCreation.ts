import { supabase } from "@/integrations/supabase/client";
import { ASPECT_RATIO_TO_RESOLUTION } from "./aspectRatios";
import { nanoid } from "nanoid";

/**
 * Default aspect ratio to use when project aspect ratio is not found
 */
const DEFAULT_ASPECT_RATIO = "1:1";

/**
 * Interface for project resolution lookup result
 */
export interface ProjectResolutionResult {
  resolution: string;
  aspectRatio: string;
}

/**
 * Resolves the resolution for a project, either using provided custom resolution
 * or looking up the project's aspect ratio and mapping it to a standard resolution.
 * 
 * @param projectId - The project ID to look up
 * @param customResolution - Optional custom resolution (e.g., "1024x768")
 * @returns Promise resolving to the final resolution string
 */
export async function resolveProjectResolution(
  projectId: string, 
  customResolution?: string
): Promise<ProjectResolutionResult> {
  // If custom resolution is provided and valid, use it
  if (customResolution?.trim()) {
    return {
      resolution: customResolution.trim(),
      aspectRatio: "custom"
    };
  }

  try {
    // Fetch project aspect ratio from database
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("aspect_ratio")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.warn("[resolveProjectResolution] Project fetch error:", projectError.message);
    }

    const aspectRatioKey = project?.aspect_ratio ?? DEFAULT_ASPECT_RATIO;
    const resolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatioKey] ?? ASPECT_RATIO_TO_RESOLUTION[DEFAULT_ASPECT_RATIO];

    return {
      resolution,
      aspectRatio: aspectRatioKey
    };
  } catch (error) {
    console.error("[resolveProjectResolution] Error fetching project:", error);
    // Fallback to default resolution
    return {
      resolution: ASPECT_RATIO_TO_RESOLUTION[DEFAULT_ASPECT_RATIO],
      aspectRatio: DEFAULT_ASPECT_RATIO
    };
  }
}

/**
 * Generates a UUID with fallback for mobile browsers
 * Uses crypto.randomUUID() when available, falls back to nanoid
 * 
 * @returns UUID string
 */
export function generateUUID(): string {
  // Check if crypto.randomUUID is available (requires secure context and modern browser)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (error) {
      console.warn('[generateUUID] crypto.randomUUID failed, falling back to nanoid:', error);
    }
  }
  
  // Fallback to nanoid for mobile browsers or when crypto.randomUUID is not available
  return nanoid();
}

/**
 * Generates a unique task ID with a prefix and timestamp
 * 
 * @param taskTypePrefix - Prefix for the task ID (e.g., "sm_travel_orchestrator")
 * @returns Unique task ID string
 */
export function generateTaskId(taskTypePrefix: string): string {
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const shortUuid = generateUUID().slice(0, 6);
  return `${taskTypePrefix}_${runId.substring(2, 10)}_${shortUuid}`;
}

/**
 * Generates a run ID for tasks that need it
 * 
 * @returns Run ID string based on current timestamp
 */
export function generateRunId(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "");
}

/**
 * Validation error type for task parameter validation
 */
export class TaskValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

/**
 * Common task creation parameters that all tasks should have
 */
export interface BaseTaskParams {
  project_id: string;
  task_type: string;
  params: Record<string, unknown>;
}

/**
 * Creates a task using the unified create-task edge function
 * 
 * @param taskParams - The task parameters to create
 * @returns Promise resolving to the created task data
 */
export async function createTask(taskParams: BaseTaskParams): Promise<any> {
  // Get current session for authentication
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session) {
    throw new Error('Authentication required to create task');
  }

  const startTime = Date.now();
  const requestId = `${startTime}-${Math.random().toString(36).slice(2, 8)}`;
  const timeoutMs = 20000; // 20s safety timeout to avoid indefinite UI stall
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.warn('[PollingBreakageIssue] [createTask] Aborting invoke due to timeout', {
      requestId,
      timeoutMs,
      taskType: taskParams.task_type,
      projectId: taskParams.project_id,
      timestamp: Date.now(),
    });
    controller.abort();
  }, timeoutMs);

  console.log('[TabResumeDebug] [createTask] Invoking edge function', {
    requestId,
    taskType: taskParams.task_type,
    projectId: taskParams.project_id,
    hasParams: !!taskParams.params,
    timestamp: startTime,
    visibilityState: document.visibilityState,
    hasSession: !!session,
    sessionValid: session ? (session.expires_at * 1000 > Date.now()) : false,
    tokenPreview: session?.access_token?.slice(0, 20),
    userAgent: navigator.userAgent.slice(0, 50)
  });

  try {
    const { data, error } = await supabase.functions.invoke('create-task', {
      body: {
        params: taskParams.params,
        task_type: taskParams.task_type,
        project_id: taskParams.project_id,
        dependant_on: null
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      signal: controller.signal,
    });

    const durationMs = Date.now() - startTime;
    console.log('[TabResumeDebug] [createTask] Invoke completed', {
      requestId,
      durationMs,
      slow: durationMs > 5000,
      taskType: taskParams.task_type,
      projectId: taskParams.project_id,
      hasError: !!error,
      errorMessage: error?.message,
      dataReceived: !!data,
      dataPreview: data ? JSON.stringify(data).slice(0, 100) : null,
      timestamp: Date.now(),
      visibilityState: document.visibilityState
    });

    if (error) {
      throw new Error(error.message || 'Failed to create task');
    }

    // Task creation events are now handled by DataFreshnessManager via realtime events
    // No manual invalidation needed - the smart polling system handles cache updates automatically
    console.log('[PollingBreakageIssue] [createTask] Task created - DataFreshnessManager will handle cache updates via realtime events');

    return data;
  } catch (err: any) {
    // Normalize abort errors for better UX
    if (err?.name === 'AbortError') {
      throw new Error('Task creation timed out. Please try again.');
    }
    console.error('[TabResumeDebug] [createTask] Invoke failed', {
      requestId,
      taskType: taskParams.task_type,
      projectId: taskParams.project_id,
      errorMessage: err?.message,
      errorName: err?.name,
      errorStack: err?.stack?.split('\n').slice(0, 3),
      timestamp: Date.now(),
      visibilityState: document.visibilityState,
      durationMs: Date.now() - startTime
    });
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Utility function to expand single-element arrays to match a target count
 * This is commonly needed for steerable motion tasks where user provides
 * one value that should be applied to all segments.
 * 
 * @param arr - Array to potentially expand
 * @param targetCount - Target count for the array
 * @returns Expanded array or original array if no expansion needed
 */
export function expandArrayToCount<T>(arr: T[] | undefined, targetCount: number): T[] {
  if (!arr || arr.length === 0) {
    return [];
  }

  if (arr.length === 1 && targetCount > 1) {
    return Array(targetCount).fill(arr[0]);
  }

  // Truncate arrays that are longer than the target count
  // This handles the case where images were deleted and arrays are stale
  if (arr.length > targetCount) {
    return arr.slice(0, targetCount);
  }

  return arr;
}

/**
 * Validates that required fields are present and non-empty
 * 
 * @param params - Object to validate
 * @param requiredFields - Array of required field names
 * @throws TaskValidationError if validation fails
 */
export function validateRequiredFields(params: Record<string, any>, requiredFields: string[]): void {
  for (const field of requiredFields) {
    const value = params[field];
    
    if (value === undefined || value === null) {
      throw new TaskValidationError(`${field} is required`, field);
    }
    
    // Check for empty arrays
    if (Array.isArray(value) && value.length === 0) {
      throw new TaskValidationError(`${field} cannot be empty`, field);
    }
    
    // Check for empty strings
    if (typeof value === 'string' && value.trim() === '') {
      throw new TaskValidationError(`${field} cannot be empty`, field);
    }
  }
}

/**
 * Safely parses JSON string with fallback
 * 
 * @param jsonStr - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed object or fallback
 */
export function safeParseJson<T>(jsonStr: string | undefined, fallback: T): T {
  if (!jsonStr) return fallback;
  
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}
