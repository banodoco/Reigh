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

// Provide a loose Deno type for local tooling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

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
serve(async (req) => {
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
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  
  // Create logger
  const logger = new SystemLogger(supabaseAdmin, 'complete-task', taskIdString);
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
  const auth = await authenticateRequest(req, supabaseAdmin, "[COMPLETE-TASK]");
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
      const ownershipResult = await verifyTaskOwnership(supabaseAdmin, taskIdString, callerId, "[COMPLETE-TASK]");
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
      const taskUserResult = await getTaskUserId(supabaseAdmin, taskIdString, "[COMPLETE-TASK]");
      if (taskUserResult.error) {
        return new Response(taskUserResult.error, { status: taskUserResult.statusCode || 404 });
      }
      userId = taskUserResult.userId!;
    } else {
      userId = callerId!;
    }

    // 8) Handle storage operations
    const storageResult = await handleStorageOperations(supabaseAdmin, parsedRequest, userId, isServiceRole);
    const { publicUrl, objectPath, thumbnailUrl } = storageResult;

    // 9) Validate shot and update params if needed
    let updatedParams: any = null;
    try {
      const { data: currentTask, error: taskFetchError } = await supabaseAdmin
        .from("tasks")
        .select(`params, task_type, task_types!inner(tool_type, category)`)
        .eq("id", taskIdString)
        .single();

      if (!taskFetchError && currentTask && currentTask.params) {
        updatedParams = { ...currentTask.params };
        let needsParamsUpdate = false;

        // Add thumbnail URL if available
        if (thumbnailUrl) {
          needsParamsUpdate = true;
          updatedParams = setThumbnailInParams(updatedParams, currentTask.task_type, thumbnailUrl);
        }

        if (needsParamsUpdate) {
          await supabaseAdmin.from("tasks").update({ params: updatedParams }).eq("id", taskIdString);
        }
      }
    } catch (validationError) {
      console.error(`[COMPLETE-TASK] Error during validation:`, validationError);
    }

    // 10) Create generation (if applicable)
    const CREATE_GENERATION_IN_EDGE = Deno.env.get("CREATE_GENERATION_IN_EDGE") !== "false";
    if (CREATE_GENERATION_IN_EDGE) {
      try {
        await handleGenerationCreation(supabaseAdmin, taskIdString, publicUrl, thumbnailUrl);
      } catch (genErr: any) {
        const msg = genErr?.message || String(genErr);
        logger.error("Generation creation failed", { error: msg });
        await logger.flush();
        // Preserve atomic semantics: do NOT mark the task Complete if generation creation failed.
        return new Response(`Generation creation failed: ${msg}`, { status: 500 });
      }
    }

    // 11) Update task to Complete
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

    // 12) Check orchestrator completion (for segment tasks)
    try {
      const { data: completedTask } = await supabaseAdmin
        .from("tasks")
        .select("task_type, params, project_id")
        .eq("id", taskIdString)
        .single();

      if (completedTask) {
        await checkOrchestratorCompletion(
          supabaseAdmin,
          taskIdString,
          completedTask,
          publicUrl,
          thumbnailUrl,
          supabaseUrl,
          serviceKey
        );
      }
    } catch (orchErr) {
      console.error("[COMPLETE-TASK] Error checking orchestrator completion:", orchErr);
    }

    // 13) Calculate cost (service role only)
    if (isServiceRole) {
      await triggerCostCalculation(supabaseAdmin, supabaseUrl, serviceKey, taskIdString);
    }

    // 14) Return success
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
});

/**
 * Handle generation creation based on task type
 */
async function handleGenerationCreation(
  supabase: any,
  taskId: string,
  publicUrl: string,
  thumbnailUrl: string | null
): Promise<void> {
  console.log(`[GenMigration] Checking if task ${taskId} should create generation...`);

  const { data: taskData, error: taskError } = await supabase
    .from("tasks")
    .select("id, task_type, project_id, params")
    .eq("id", taskId)
    .single();

  if (taskError || !taskData) {
    console.error(`[GenMigration] Failed to fetch task:`, taskError);
    return;
  }

  // Resolve tool_type
  const toolTypeInfo = await resolveToolType(supabase, taskData.task_type, taskData.params);
  if (!toolTypeInfo) {
    console.error(`[GenMigration] Failed to resolve tool_type for task ${taskId}`);
    return;
  }

  const { toolType, category: taskCategory, contentType } = toolTypeInfo;
  console.log(`[GenMigration] Task ${taskId}: category=${taskCategory}, tool_type=${toolType}, content_type=${contentType}`);

  const combinedTaskData = {
    ...taskData,
    tool_type: toolType,
    content_type: contentType
  };

  // Check for based_on (edit/inpaint tasks)
  const basedOnGenerationId = extractBasedOn(taskData.params);
  const createAsGeneration = taskData.params?.create_as_generation === true;
  const isSubTask = extractOrchestratorTaskId(taskData.params, 'GenMigration');

  if (basedOnGenerationId && !isSubTask && !createAsGeneration) {
    // Create variant on source generation
    const success = await handleVariantCreation(
      supabase, taskId, combinedTaskData, basedOnGenerationId, publicUrl, thumbnailUrl
    );
    if (success) return;
  }

  // Handle different categories
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

/**
 * Trigger cost calculation for a task
 */
async function triggerCostCalculation(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  taskId: string
): Promise<void> {
  try {
    const { data: taskForCostCheck } = await supabase
      .from("tasks")
      .select("params")
      .eq("id", taskId)
      .single();

    const subTaskOrchestratorRef = extractOrchestratorTaskId(taskForCostCheck?.params, 'CostCalc');
    if (subTaskOrchestratorRef) {
      console.log(`[COMPLETE-TASK] Task ${taskId} is a sub-task, skipping cost calculation`);
      return;
    }

    console.log(`[COMPLETE-TASK] Triggering cost calculation for task ${taskId}...`);
    const costCalcResp = await fetch(`${supabaseUrl}/functions/v1/calculate-task-cost`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ task_id: taskId })
    });

    if (costCalcResp.ok) {
      const costData = await costCalcResp.json();
      if (costData && typeof costData.cost === 'number') {
        console.log(`[COMPLETE-TASK] Cost calculation successful: $${costData.cost.toFixed(3)}`);
      }
    } else {
      const errTxt = await costCalcResp.text();
      console.error(`[COMPLETE-TASK] Cost calculation failed: ${errTxt}`);
    }
  } catch (costErr) {
    console.error("[COMPLETE-TASK] Error triggering cost calculation:", costErr);
  }
}
