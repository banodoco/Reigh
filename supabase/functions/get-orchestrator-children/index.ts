// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { SystemLogger } from "../_shared/systemLogger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: get-orchestrator-children
 *
 * Fetches all child tasks for a given orchestrator task ID.
 * Used by workers to get segment, stitch, and join tasks for an orchestrator.
 *
 * - Service-role key: can fetch any orchestrator's children
 * - User token: can only fetch tasks from their own projects
 *
 * POST /functions/v1/get-orchestrator-children
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: { "orchestrator_task_id": "uuid" }
 *
 * Returns:
 * - 200 OK with { tasks: [...] }
 * - 400 Bad Request if orchestrator_task_id missing
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if user doesn't own the tasks' project
 * - 500 Internal Server Error
 */
serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("[GET-ORCHESTRATOR-CHILDREN] Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Create logger
  const logger = new SystemLogger(supabaseAdmin, 'get-orchestrator-children');

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

  const orchestratorTaskId = requestBody.orchestrator_task_id;
  if (!orchestratorTaskId) {
    logger.error("Missing orchestrator_task_id");
    await logger.flush();
    return new Response("orchestrator_task_id is required", { status: 400 });
  }

  // Set orchestrator task_id for logs
  logger.setDefaultTaskId(orchestratorTaskId);

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
    // Query child tasks - those with orchestrator_task_id_ref in params matching the given ID
    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("tasks")
      .select("id, task_type, status, params, output_location, project_id")
      .contains("params", { orchestrator_task_id_ref: orchestratorTaskId })
      .order("created_at", { ascending: true });

    if (tasksError) {
      logger.error("Error fetching child tasks", { error: tasksError.message });
      await logger.flush();
      return new Response(`Error fetching tasks: ${tasksError.message}`, { status: 500 });
    }

    // If no tasks found, return empty array
    if (!tasks || tasks.length === 0) {
      logger.info("No child tasks found", { orchestrator_task_id: orchestratorTaskId });
      await logger.flush();
      return new Response(JSON.stringify({ tasks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // If user token (not service role), verify ownership of all tasks
    if (!isServiceRole && callerId) {
      // Get unique project IDs from the tasks
      const projectIds = [...new Set(tasks.map(t => t.project_id))];

      // Check if user owns all the projects
      const { data: projects, error: projectError } = await supabaseAdmin
        .from("projects")
        .select("id, user_id")
        .in("id", projectIds);

      if (projectError) {
        logger.error("Error checking project ownership", { error: projectError.message });
        await logger.flush();
        return new Response("Error verifying access", { status: 500 });
      }

      // Verify user owns all projects
      for (const project of projects || []) {
        if (project.user_id !== callerId) {
          logger.error("Access denied - user doesn't own project", {
            user_id: callerId,
            project_id: project.id
          });
          await logger.flush();
          return new Response("Access denied - you don't own these tasks' project", { status: 403 });
        }
      }
    }

    // Remove project_id from response (not needed by caller)
    const tasksWithoutProjectId = tasks.map(({ project_id, ...rest }) => rest);

    logger.info("Returning child tasks", { count: tasks.length });
    await logger.flush();
    return new Response(JSON.stringify({
      tasks: tasksWithoutProjectId
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
