// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { SystemLogger } from "../_shared/systemLogger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: get-task-output
 *
 * Fetches the output_location and status for a specific task.
 * Used by workers to get outputs from dependency tasks (e.g., final_stitch getting transition outputs).
 *
 * - Service-role key: can fetch any task
 * - User token: can only fetch tasks from their own projects
 *
 * POST /functions/v1/get-task-output
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: { "task_id": "uuid" }
 *
 * Returns:
 * - 200 OK with { status, output_location }
 * - 400 Bad Request if task_id missing
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if user doesn't own the task's project
 * - 404 Not Found if task doesn't exist
 * - 500 Internal Server Error
 */
serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("[GET-TASK-OUTPUT] Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Create logger
  const logger = new SystemLogger(supabaseAdmin, 'get-task-output');

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

  const taskId = requestBody.task_id;
  if (!taskId) {
    logger.error("Missing task_id");
    await logger.flush();
    return new Response("task_id is required", { status: 400 });
  }

  // Set task_id for all subsequent logs
  logger.setDefaultTaskId(taskId);

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
        // It's a JWT - decode and check role
        const payloadB64 = parts[1];
        const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));

        // Check for service role in various claim locations
        const role = payload.role || payload.app_metadata?.role;
        if (["service_role", "supabase_admin"].includes(role)) {
          isServiceRole = true;
          logger.debug("Authenticated via JWT service-role");
        }
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      logger.debug("Token is not a valid JWT, treating as PAT");
    }
  }

  // 3) USER TOKEN PATH - resolve callerId via user_api_token table
  if (!isServiceRole) {
    logger.debug("Looking up token in user_api_token table");

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
    // Fetch the task
    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("id, status, output_location, project_id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      logger.error("Task not found", { error: taskError?.message });
      await logger.flush();
      return new Response("Task not found", { status: 404 });
    }

    // If user token (not service role), verify ownership
    if (!isServiceRole && callerId) {
      // Check if user owns the project
      const { data: project, error: projectError } = await supabaseAdmin
        .from("projects")
        .select("user_id")
        .eq("id", task.project_id)
        .single();

      if (projectError || !project) {
        logger.error("Project not found", { error: projectError?.message });
        await logger.flush();
        return new Response("Project not found", { status: 404 });
      }

      if (project.user_id !== callerId) {
        logger.error("Access denied - user doesn't own project", {
          user_id: callerId,
          project_id: task.project_id
        });
        await logger.flush();
        return new Response("Access denied - you don't own this task's project", { status: 403 });
      }
    }

    // Return the task output info
    logger.info("Returning task output", { status: task.status, has_output: !!task.output_location });
    await logger.flush();
    return new Response(JSON.stringify({
      status: task.status,
      output_location: task.output_location
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    logger.critical("Unexpected error", { error: error?.message });
    await logger.flush();
    return new Response(`Internal server error: ${error?.message}`, { status: 500 });
  }
});
