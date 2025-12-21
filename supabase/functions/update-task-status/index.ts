// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { SystemLogger } from "../_shared/systemLogger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: update-task-status
 * 
 * Updates a task's status and optionally sets output_location.
 * - Service-role key: can update any task across all users
 * - User token: can only update tasks for that specific user's projects
 * 
 * POST /functions/v1/update-task-status
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: {
 *   "task_id": "uuid-string",
 *   "status": "In Progress" | "Failed" | "Complete",
 *   "output_location": "optional-string"
 * }
 * 
 * Returns:
 * - 200 OK with success message
 * - 400 Bad Request if missing required fields
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not found
 * - 404 Not Found if task doesn't exist or user can't access it
 * - 500 Internal Server Error
 */

/**
 * Handles cascading task failures/cancellations for orchestrated tasks.
 * When a task fails or is cancelled, this function:
 * 1. Finds the orchestrator task (if the failed task references one)
 * 2. Finds all sibling tasks that reference the same orchestrator
 * 3. Marks them all as Failed/Cancelled appropriately
 */
async function handleCascadingTaskFailure(
  supabaseAdmin: any,
  logger: SystemLogger,
  failedTaskId: string,
  failureStatus: string,
  failedTaskData: any
) {
  try {
    logger.info("Processing cascading failure", { 
      task_id: failedTaskId, 
      status: failureStatus 
    });
    
    // Extract orchestrator reference from the failed task's params
    // Must check all possible paths where orchestrator_task_id might be stored
    let orchestratorTaskId: string | null = null;
    let isOrchestratorTask = false;
    
    if (failedTaskData.params) {
      const params = typeof failedTaskData.params === 'string' 
        ? JSON.parse(failedTaskData.params) 
        : failedTaskData.params;
      
      // Check all paths (matching extractOrchestratorTaskId in complete_task)
      orchestratorTaskId = params.orchestrator_task_id_ref || 
                           params.orchestrator_details?.orchestrator_task_id ||
                           params.originalParams?.orchestrator_details?.orchestrator_task_id ||
                           params.orchestrator_task_id;
      
      // Check if this task IS the orchestrator (has orchestrator_details but no orchestrator reference)
      if (!orchestratorTaskId && params.orchestrator_details) {
        orchestratorTaskId = failedTaskId;
        isOrchestratorTask = true;
        logger.debug("Task is the orchestrator itself", { task_id: failedTaskId });
      }
    }
    
    if (!orchestratorTaskId) {
      logger.debug("No orchestrator reference found, skipping cascade", { task_id: failedTaskId });
      return;
    }
    
    logger.info("Found orchestrator task", { 
      orchestrator_task_id: orchestratorTaskId,
      is_orchestrator_task: isOrchestratorTask
    });
    
    // Find all tasks that reference this orchestrator (including the orchestrator itself)
    // Must check all paths where orchestrator reference might be stored
    let query;
    
    if (isOrchestratorTask) {
      // If the failed task IS the orchestrator, find all children that reference it
      query = supabaseAdmin
        .from("tasks")
        .select("id, task_type, status, params")
        .or(`params->>orchestrator_task_id_ref.eq.${orchestratorTaskId},params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId},params->originalParams->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId},params->>orchestrator_task_id.eq.${orchestratorTaskId}`)
        .neq("id", failedTaskId)
        .neq("status", "Failed")
        .neq("status", "Cancelled")
        .neq("status", "Complete");
    } else {
      // If a child task failed, find orchestrator + all siblings
      query = supabaseAdmin
        .from("tasks")
        .select("id, task_type, status, params")
        .or(`id.eq.${orchestratorTaskId},params->>orchestrator_task_id_ref.eq.${orchestratorTaskId},params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId},params->originalParams->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId},params->>orchestrator_task_id.eq.${orchestratorTaskId}`)
        .neq("status", "Failed")
        .neq("status", "Cancelled")
        .neq("status", "Complete");
    }
    
    const { data: relatedTasks, error: fetchError } = await query;
    
    if (fetchError) {
      logger.error("Error fetching related tasks for cascade", { error: fetchError.message });
      return;
    }
    
    if (!relatedTasks || relatedTasks.length === 0) {
      logger.debug("No related tasks found for cascade");
      return;
    }
    
    // Update all related tasks to Failed/Cancelled
    const tasksToUpdate = relatedTasks.filter((task: any) => task.id !== failedTaskId);
    
    if (tasksToUpdate.length === 0) {
      logger.debug("No additional tasks to cascade to after filtering");
      return;
    }
    
    logger.info("Cascading failure to related tasks", {
      task_id: failedTaskId,
      related_task_count: tasksToUpdate.length,
      related_task_ids: tasksToUpdate.map((t: any) => t.id.substring(0, 8))
    });
    
    const updatePromises = tasksToUpdate.map(async (task: any) => {
      const updatePayload = {
        status: failureStatus,
        updated_at: new Date().toISOString(),
        error_message: `Cascaded ${failureStatus.toLowerCase()} from related task ${failedTaskId}`
      };
      
      const { error } = await supabaseAdmin
        .from("tasks")
        .update(updatePayload)
        .eq("id", task.id);
      
      if (error) {
        logger.error("Failed to cascade to task", { 
          cascaded_task_id: task.id, 
          error: error.message 
        });
      }
      
      return { taskId: task.id, error };
    });
    
    const results = await Promise.all(updatePromises);
    const failedUpdates = results.filter(r => r.error);
    
    if (failedUpdates.length > 0) {
      logger.warn("Some cascade updates failed", { 
        failed_count: failedUpdates.length,
        total_count: tasksToUpdate.length
      });
    } else {
      logger.info("Cascade complete", { 
        cascaded_count: tasksToUpdate.length,
        status: failureStatus
      });
    }
    
  } catch (error: any) {
    logger.error("Unexpected error in cascade handler", { error: error?.message });
  }
}

serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("[UPDATE-TASK-STATUS] Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  
  // Create logger (task_id will be set after parsing body)
  const logger = new SystemLogger(supabaseAdmin, 'update-task-status');

  // Only accept POST requests
  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    await logger.flush();
    return new Response("Method not allowed", { status: 405 });
  }

  // Extract authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logger.error("Missing or invalid Authorization header");
    await logger.flush();
    return new Response("Missing or invalid Authorization header", { status: 401 });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  // Parse request body
  let requestBody: any = {};
  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch (e) {
    logger.error("Invalid JSON body");
    await logger.flush();
    return new Response("Invalid JSON body", { status: 400 });
  }

  // Validate required fields
  const { task_id, status } = requestBody;
  
  // Set task_id for all subsequent logs
  if (task_id) {
    logger.setDefaultTaskId(task_id);
  }
  
  if (!task_id || !status) {
    logger.error("Missing required fields", { has_task_id: !!task_id, has_status: !!status });
    await logger.flush();
    return new Response("Missing required fields: task_id and status", { status: 400 });
  }

  // Validate status values
  const validStatuses = ["Queued", "In Progress", "Complete", "Failed"];
  if (!validStatuses.includes(status)) {
    logger.error("Invalid status value", { status, valid_statuses: validStatuses });
    await logger.flush();
    return new Response(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, { status: 400 });
  }

  logger.info("Processing status update", { task_id, status });

  let callerId: string | null = null;
  let isServiceRole = false;

  // 1) Check if token matches service-role key directly
  if (token === serviceKey) {
    isServiceRole = true;
    logger.debug("Authenticated via service-role key");
  }

  // 2) If not service key, try to decode as JWT and check role
  if (!isServiceRole) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payloadB64 = parts[1];
        const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));

        const role = payload.role || payload.app_metadata?.role;
        if (["service_role", "supabase_admin"].includes(role)) {
          isServiceRole = true;
          logger.debug("Authenticated via JWT service-role");
        }
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
    }
  }

  // 3) USER TOKEN PATH - resolve callerId via user_api_token table
  if (!isServiceRole) {
    try {
      const { data, error } = await supabaseAdmin
        .from("user_api_tokens")
        .select("user_id")
        .eq("token", token)
        .single();

      if (error || !data) {
        logger.error("Token lookup failed", { error: error?.message });
        await logger.flush();
        return new Response("Invalid or expired token", { status: 403 });
      }

      callerId = data.user_id;
      logger.debug("Authenticated via PAT", { user_id: callerId });
    } catch (e: any) {
      logger.error("Error querying user_api_token", { error: e?.message });
      await logger.flush();
      return new Response("Token validation failed", { status: 403 });
    }
  }

  try {
    // SAFETY CHECK: Prevent overwriting Complete tasks with Failed status
    const { data: currentTask, error: currentTaskError } = await supabaseAdmin
      .from("tasks")
      .select("status")
      .eq("id", task_id)
      .single();

    if (currentTaskError) {
      logger.error("Error checking current task status", { error: currentTaskError.message });
      await logger.flush();
      return new Response(`Failed to check current task status: ${currentTaskError.message}`, { status: 500 });
    }

    // Don't overwrite Complete tasks with Failed status
    if (currentTask?.status === "Complete" && status === "Failed") {
      logger.warn("Refusing to mark completed task as Failed", { 
        task_id, 
        current_status: currentTask.status 
      });
      await logger.flush();
      return new Response(JSON.stringify({
        success: false,
        task_id: task_id,
        current_status: currentTask.status,
        requested_status: status,
        message: "Cannot mark completed task as failed"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Don't overwrite Cancelled tasks - once cancelled, status should not change
    // This prevents workers from "uncancelling" tasks by continuing to update status
    if (currentTask?.status === "Cancelled") {
      logger.warn("Refusing to update cancelled task", { 
        task_id, 
        current_status: currentTask.status,
        requested_status: status
      });
      await logger.flush();
      return new Response(JSON.stringify({
        success: false,
        task_id: task_id,
        current_status: currentTask.status,
        requested_status: status,
        message: "Cannot update cancelled task"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Build update payload
    const updatePayload: any = {
      status: status,
      updated_at: new Date().toISOString()
    };

    if (status === "In Progress") {
      updatePayload.generation_started_at = new Date().toISOString();
    }
    
    if (status === "Complete") {
      updatePayload.generation_processed_at = new Date().toISOString();
    }

    if (requestBody.output_location) {
      updatePayload.output_location = requestBody.output_location;
    }

    let updateResult;

    if (isServiceRole) {
      // Service role: can update any task
      updateResult = await supabaseAdmin
        .from("tasks")
        .update(updatePayload)
        .eq("id", task_id)
        .select()
        .single();

    } else {
      // User token: can only update tasks in their projects
      const { data: userProjects } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("user_id", callerId);

      if (!userProjects || userProjects.length === 0) {
        logger.error("User has no projects", { user_id: callerId });
        await logger.flush();
        return new Response("User has no projects", { status: 403 });
      }

      const projectIds = userProjects.map((p: any) => p.id);
      
      updateResult = await supabaseAdmin
        .from("tasks")
        .update(updatePayload)
        .eq("id", task_id)
        .in("project_id", projectIds)
        .select()
        .single();
    }

    if (updateResult.error) {
      if (updateResult.error.code === "PGRST116") {
        logger.warn("Task not found or not accessible", { task_id });
        await logger.flush();
        return new Response("Task not found or not accessible", { status: 404 });
      }
      logger.error("Database update error", { 
        task_id,
        error: updateResult.error.message,
        code: updateResult.error.code
      });
      await logger.flush();
      return new Response(`Database error: ${updateResult.error.message}`, { status: 500 });
    }

    if (!updateResult.data) {
      logger.warn("Task not found or not accessible (no data)", { task_id });
      await logger.flush();
      return new Response("Task not found or not accessible", { status: 404 });
    }

    logger.info("Task status updated successfully", { 
      task_id, 
      old_status: currentTask?.status,
      new_status: status 
    });

    // Handle cascading failures/cancellations for orchestrated tasks
    if (status === "Failed" || status === "Cancelled") {
      await handleCascadingTaskFailure(supabaseAdmin, logger, task_id, status, updateResult.data);
    }
    
    await logger.flush();
    return new Response(JSON.stringify({
      success: true,
      task_id: task_id,
      status: status,
      message: `Task status updated to '${status}'`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    logger.critical("Unexpected error", { task_id, error: error?.message });
    await logger.flush();
    return new Response(`Internal server error: ${error?.message}`, { status: 500 });
  }
});
