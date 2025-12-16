// deno-lint-ignore-file
// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest, verifyTaskOwnership, getTaskUserId } from "../_shared/auth.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";

// Import from refactored modules
import { parseCompleteTaskRequest, validateStoragePathSecurity } from './request.ts';
import { handleStorageOperations, verifyFileExists, cleanupFile } from './storage.ts';
import { 
  extractOrchestratorTaskId, 
  extractBasedOn, 
  setThumbnailInParams,
  getContentType 
} from './params.ts';
import { 
  resolveToolType, 
  createGenerationFromTask, 
  handleVariantCreation,
  handleUpscaleVariant 
} from './generation.ts';
import { checkOrchestratorCompletion } from './orchestrator.ts';
import { validateAndCleanupShotId } from './shotValidation.ts';
import { triggerCostCalculationIfNotSubTask } from './billing.ts';

// Provide a loose Deno type for local tooling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Task context containing all task data needed throughout the completion flow.
 * Fetched once and passed to all functions that need it.
 * Exported for use by orchestrator.ts and other modules.
 */
export interface TaskContext {
  id: string;
  task_type: string;
  project_id: string;
  params: Record<string, any>;
  tool_type: string;
  category: string;
  content_type: 'image' | 'video';
}

/**
 * Fetch task context with all required fields for the completion flow.
 * Returns null if task not found or on error.
 */
async function fetchTaskContext(
  supabase: any,
  taskId: string
): Promise<TaskContext | null> {
  // Fetch task first
  const { data: task, error } = await supabase
    .from("tasks")
    .select(`id, task_type, project_id, params`)
    .eq("id", taskId)
    .single();

  if (error || !task) {
    console.error(`[TaskContext] Failed to fetch task ${taskId}:`, error);
    return null;
  }

  // Fetch task_types metadata separately (no FK relationship exists)
  let taskTypeInfo: { tool_type?: string; category?: string; content_type?: string } = {};
  if (task.task_type) {
    const { data: typeData } = await supabase
      .from("task_types")
      .select("tool_type, category, content_type")
      .eq("name", task.task_type)
      .single();
    if (typeData) {
      taskTypeInfo = typeData;
    }
  }

  return {
    id: task.id,
    task_type: task.task_type,
    project_id: task.project_id,
    params: task.params || {},
    tool_type: taskTypeInfo?.tool_type || 'unknown',
    category: taskTypeInfo?.category || 'unknown',
    content_type: taskTypeInfo?.content_type || 'image',
  };
}

/**
 * Edge function: complete-task
 * 
 * Completes a task by uploading file data and updating task status.
 * - Service-role key: can complete any task
 * - User token: can only complete tasks they own
 * 
 * POST /functions/v1/complete-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * 
 * SUPPORTS THREE UPLOAD MODES:
 * 
 * MODE 1 (LEGACY - JSON with base64): 
 *   Body: { task_id, file_data: "base64...", filename: "image.png", ... }
 * 
 * MODE 3 (PRE-SIGNED URL - Zero Memory):
 *   Body: { task_id, storage_path: "user_id/tasks/{task_id}/filename", ... }
 * 
 * MODE 4 (REFERENCE EXISTING PATH):
 *   Body: { task_id, storage_path: "user_id/filename", ... }
 */
export interface CompleteTaskDeps {
  /**
   * Override Supabase client factory for tests.
   */
  createClient?: (supabaseUrl: string, serviceKey: string) => any;
  /**
   * Provide a pre-constructed Supabase client (bypasses createClient).
   */
  supabaseAdmin?: any;
  /**
   * Override auth + ownership utilities for tests.
   */
  authenticateRequest?: typeof authenticateRequest;
  verifyTaskOwnership?: typeof verifyTaskOwnership;
  getTaskUserId?: typeof getTaskUserId;
  /**
   * Override logger implementation for tests.
   */
  LoggerClass?: typeof SystemLogger;
  /**
   * Override env var access for tests.
   */
  env?: { get: (key: string) => string | undefined };
}

export async function completeTaskHandler(req: Request, deps: CompleteTaskDeps = {}): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // 1) Parse and validate request
  const parseResult = await parseCompleteTaskRequest(req);
  if (!parseResult.success) {
    return parseResult.response;
  }
  const parsedRequest = parseResult.data;
  const taskIdString = parsedRequest.taskId;

  console.log(`[COMPLETE-TASK] Processing task ${taskIdString} (mode: ${parsedRequest.mode})`);

  // 2) Get environment variables and create Supabase client
  const env = deps.env ?? Deno.env;
  const serviceKey = env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }
  const createClientFn = deps.createClient ?? createClient;
  const supabaseAdmin = deps.supabaseAdmin ?? createClientFn(supabaseUrl, serviceKey);
  
  // Create logger
  const LoggerClass = deps.LoggerClass ?? SystemLogger;
  const logger = new LoggerClass(supabaseAdmin, 'complete-task', taskIdString);
  logger.info("Processing task", { 
    task_id: taskIdString, 
    mode: parsedRequest.mode,
    filename: parsedRequest.filename
  });

  // 3) Security check: Validate storage path for orchestrator references
  if (parsedRequest.requiresOrchestratorCheck && parsedRequest.storagePath) {
    const securityResult = await validateStoragePathSecurity(
      supabaseAdmin,
      taskIdString,
      parsedRequest.storagePath,
      parsedRequest.storagePathTaskId
    );
    if (!securityResult.allowed) {
      logger.error("Storage path security check failed", { error: securityResult.error });
      await logger.flush();
      return new Response(securityResult.error || "Access denied", { status: 403 });
    }
  }

  // 4) Authenticate request
  const authenticateFn = deps.authenticateRequest ?? authenticateRequest;
  const auth = await authenticateFn(req, supabaseAdmin, "[COMPLETE-TASK]");
  if (!auth.success) {
    logger.error("Authentication failed", { error: auth.error });
    await logger.flush();
    return new Response(auth.error || "Authentication failed", { status: auth.statusCode || 403 });
  }

  const isServiceRole = auth.isServiceRole;
  const callerId = auth.userId;

  try {
    // 5) Verify task ownership if user token
    if (!isServiceRole && callerId) {
      const verifyOwnershipFn = deps.verifyTaskOwnership ?? verifyTaskOwnership;
      const ownershipResult = await verifyOwnershipFn(supabaseAdmin, taskIdString, callerId, "[COMPLETE-TASK]");
      if (!ownershipResult.success) {
        return new Response(ownershipResult.error || "Forbidden", { status: ownershipResult.statusCode || 403 });
      }
    }

    // 6) MODE 4: Verify referenced file exists
    if (parsedRequest.storagePath) {
      const pathParts = parsedRequest.storagePath.split('/');
      const isMode3Format = pathParts.length >= 4 && pathParts[1] === 'tasks';

      if (!isMode3Format) {
        const fileCheck = await verifyFileExists(supabaseAdmin, parsedRequest.storagePath);
        if (!fileCheck.exists) {
          return new Response("Referenced file does not exist or is not accessible in storage", { status: 404 });
        }
      }
    }

    // 7) Determine user ID for storage path
    let userId: string;
    if (isServiceRole) {
      const getTaskUserIdFn = deps.getTaskUserId ?? getTaskUserId;
      const taskUserResult = await getTaskUserIdFn(supabaseAdmin, taskIdString, "[COMPLETE-TASK]");
      if (taskUserResult.error) {
        return new Response(taskUserResult.error, { status: taskUserResult.statusCode || 404 });
      }
      userId = taskUserResult.userId!;
    } else {
      userId = callerId!;
    }

    // 8) Fetch task context once (used by validation, generation creation, orchestrator check)
    const taskContext = await fetchTaskContext(supabaseAdmin, taskIdString);
    if (!taskContext) {
      logger.error("Failed to fetch task context", { task_id: taskIdString });
      await logger.flush();
      return new Response("Task not found", { status: 404 });
    }
    console.log(`[COMPLETE-TASK] Task type: ${taskContext.task_type}, tool_type: ${taskContext.tool_type}`);

    // 9) Handle storage operations
    const storageResult = await handleStorageOperations(supabaseAdmin, parsedRequest, userId, isServiceRole);
    const { publicUrl, objectPath, thumbnailUrl } = storageResult;

    // 10) Validate shot references and update params if needed
    console.log(`[COMPLETE-TASK] Validating shot references for task ${taskIdString}`);
    try {
      let updatedParams = { ...taskContext.params };
      let needsParamsUpdate = false;

      // Validate and cleanup invalid shot_id references
      const shotValidation = await validateAndCleanupShotId(supabaseAdmin, updatedParams, taskContext.tool_type);
      if (shotValidation.needsUpdate) {
        needsParamsUpdate = true;
        updatedParams = shotValidation.updatedParams;
      }

      // Add thumbnail URL if available
      if (thumbnailUrl) {
        needsParamsUpdate = true;
        updatedParams = setThumbnailInParams(updatedParams, taskContext.task_type, thumbnailUrl);
      }

      if (needsParamsUpdate) {
        console.log(`[COMPLETE-TASK] Updating task parameters${thumbnailUrl ? ' with thumbnail_url' : ''}${shotValidation.needsUpdate ? ' with cleaned shot references' : ''}`);
        await supabaseAdmin.from("tasks").update({ params: updatedParams }).eq("id", taskIdString);
        
        // Keep in-memory context in sync so downstream steps (generation creation) use updated params
        taskContext.params = updatedParams;
      }
    } catch (validationError) {
      console.error(`[COMPLETE-TASK] Error during validation:`, validationError);
      // Continue anyway - don't fail task completion due to validation errors
    }

    // 11) Create generation (if applicable)
    const CREATE_GENERATION_IN_EDGE = Deno.env.get("CREATE_GENERATION_IN_EDGE") !== "false";
    if (CREATE_GENERATION_IN_EDGE) {
      try {
        await handleGenerationCreation(supabaseAdmin, taskContext, publicUrl, thumbnailUrl);
      } catch (genErr: any) {
        const msg = genErr?.message || String(genErr);
        logger.error("Generation creation failed", { error: msg });
        await logger.flush();
        // Preserve atomic semantics: do NOT mark the task Complete if generation creation failed.
        return new Response(`Generation creation failed: ${msg}`, { status: 500 });
      }
    }

    // 12) Update task to Complete
    console.log(`[COMPLETE-TASK] Updating task ${taskIdString} to Complete status`);
    const { error: dbError } = await supabaseAdmin.from("tasks").update({
      status: "Complete",
      output_location: publicUrl,
      generation_processed_at: new Date().toISOString()
    }).eq("id", taskIdString).eq("status", "In Progress");

    if (dbError) {
      console.error("[COMPLETE-TASK] Database update error:", dbError);
      await cleanupFile(supabaseAdmin, objectPath);
      return new Response(`Database update failed: ${dbError.message}`, { status: 500 });
    }

    // 13) Check orchestrator completion (for segment tasks) - uses task context
    try {
      await checkOrchestratorCompletion(
        supabaseAdmin,
        taskIdString,
        taskContext, // Pass context instead of fetching again
        publicUrl,
        thumbnailUrl,
        supabaseUrl,
        serviceKey
      );
    } catch (orchErr) {
      console.error("[COMPLETE-TASK] Error checking orchestrator completion:", orchErr);
    }

    // 14) Calculate cost (service role only)
    if (isServiceRole) {
      await triggerCostCalculationIfNotSubTask(supabaseAdmin, supabaseUrl, serviceKey, taskIdString);
    }

    // 15) Return success
    console.log(`[COMPLETE-TASK] Successfully completed task ${taskIdString}`);
    const responseData = {
      success: true,
      public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      message: "Task completed and file uploaded successfully"
    };

    logger.info("Task completed successfully", { 
      task_id: taskIdString,
      output_location: publicUrl,
      has_thumbnail: !!thumbnailUrl
    });
    await logger.flush();

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    logger.critical("Unexpected error", { 
      task_id: taskIdString, 
      error: error?.message,
      stack: error?.stack?.substring(0, 500)
    });
    console.error("[COMPLETE-TASK] Edge function error:", error);
    await logger.flush();
    return new Response(`Internal error: ${error?.message}`, { status: 500 });
  }
}

// Some TS envs don't know about import.meta.main; Deno does.
if ((import.meta as any).main) {
  serve((req) => completeTaskHandler(req));
}

/**
 * Handle generation creation based on task type
 * Uses pre-fetched TaskContext to avoid duplicate DB queries
 */
async function handleGenerationCreation(
  supabase: any,
  taskContext: TaskContext,
  publicUrl: string,
  thumbnailUrl: string | null
): Promise<void> {
  const taskId = taskContext.id;
  console.log(`[GenMigration] Checking if task ${taskId} should create generation...`);
  console.log(`[GenMigration] Task ${taskId}: category=${taskContext.category}, tool_type=${taskContext.tool_type}, content_type=${taskContext.content_type}`);

  // Build combined task data object expected by generation functions
  const combinedTaskData = {
    id: taskContext.id,
    task_type: taskContext.task_type,
    project_id: taskContext.project_id,
    params: taskContext.params,
    tool_type: taskContext.tool_type,
    content_type: taskContext.content_type
  };

  // Check for based_on (edit/inpaint tasks)
  const basedOnGenerationId = extractBasedOn(taskContext.params);
  const createAsGeneration = taskContext.params?.create_as_generation === true;
  const isSubTask = extractOrchestratorTaskId(taskContext.params, 'GenMigration');

  if (basedOnGenerationId && !isSubTask && !createAsGeneration) {
    // Create variant on source generation
    const success = await handleVariantCreation(
      supabase, taskId, combinedTaskData, basedOnGenerationId, publicUrl, thumbnailUrl
    );
    if (success) return;
  }

  // Handle different categories
  const taskCategory = taskContext.category;
  const contentType = taskContext.content_type;

  if (taskCategory === 'generation' || 
      (taskCategory === 'processing' && isSubTask) ||
      (taskCategory === 'processing' && contentType === 'image')) {
    
    if (createAsGeneration && basedOnGenerationId) {
      console.log(`[GenMigration] Task ${taskId} has create_as_generation=true`);
    }

    try {
      await createGenerationFromTask(supabase, taskId, combinedTaskData, publicUrl, thumbnailUrl);
    } catch (genError: any) {
      console.error(`[GenMigration] Error creating generation for task ${taskId}:`, genError);
      // Preserve atomic semantics: bubble up so the main handler can fail the request
      throw genError;
    }

  } else if (taskCategory === 'upscale') {
    await handleUpscaleVariant(supabase, taskId, combinedTaskData, publicUrl, thumbnailUrl);

  } else {
    console.log(`[GenMigration] Skipping generation creation for task ${taskId} - category is '${taskCategory}'`);
  }
}

