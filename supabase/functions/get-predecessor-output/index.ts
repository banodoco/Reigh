// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { SystemLogger } from "../_shared/systemLogger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: get-predecessor-output
 *
 * Gets the output locations of a task's dependencies in a single call.
 * Supports both single and multiple dependencies (dependant_on is now an array).
 *
 * POST /functions/v1/get-predecessor-output
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: { task_id: "uuid" }
 *
 * Returns:
 * - 200 OK with:
 *   - No dependencies: { predecessors: [] }
 *   - Single dependency (backward compat): { predecessor_id, output_location, predecessors: [...] }
 *   - Multiple dependencies: { predecessors: [{ predecessor_id, output_location, status }, ...] }
 * - 400 Bad Request if task_id missing
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not authorized
 * - 404 Not Found if task not found
 * - 500 Internal Server Error
 */
serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("[GET-PREDECESSOR-OUTPUT] Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Create logger
  const logger = new SystemLogger(supabaseAdmin, 'get-predecessor-output');

  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    await logger.flush();
    return new Response("Method not allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    logger.error("Invalid JSON body");
    await logger.flush();
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { task_id } = body;
  if (!task_id) {
    logger.error("Missing task_id");
    await logger.flush();
    return new Response("task_id is required", { status: 400 });
  }

  // Set task_id for all subsequent logs
  logger.setDefaultTaskId(task_id);

  // Extract authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logger.error("Missing or invalid Authorization header");
    await logger.flush();
    return new Response("Missing or invalid Authorization header", { status: 401 });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

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
        const padded = payloadB64 + "=".repeat((4 - payloadB64.length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        const role = payload.role || payload.app_metadata?.role;
        if (["service_role", "supabase_admin"].includes(role)) {
          isServiceRole = true;
          logger.debug("Authenticated via JWT service-role");
        }
      }
    } catch (e) {
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
    // Get the task info first
    const { data: taskData, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("id, dependant_on, project_id")
      .eq("id", task_id)
      .single();

    if (taskError) {
      logger.error("Task lookup error", { error: taskError.message });
      await logger.flush();
      return new Response("Task not found", { status: 404 });
    }

    // Check authorization if not service role
    if (!isServiceRole && callerId) {
      logger.debug("Verifying task ownership", { user_id: callerId });

      const { data: projectData, error: projectError } = await supabaseAdmin
        .from("projects")
        .select("user_id")
        .eq("id", taskData.project_id)
        .single();

      if (projectError) {
        logger.error("Project lookup error", { error: projectError.message });
        await logger.flush();
        return new Response("Project not found", { status: 404 });
      }

      if (projectData.user_id !== callerId) {
        logger.error("Access denied - user doesn't own project", {
          user_id: callerId,
          project_owner: projectData.user_id
        });
        await logger.flush();
        return new Response("Forbidden: Task does not belong to user", { status: 403 });
      }

      logger.debug("Task ownership verified");
    }

    // Return the dependency info
    const dependantOnArray: string[] = taskData.dependant_on || [];

    if (dependantOnArray.length === 0) {
      logger.info("No dependencies found");
      await logger.flush();
      return new Response(JSON.stringify({
        predecessor_id: null,
        output_location: null,
        predecessors: []
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Fetch all predecessor tasks
    const { data: predecessorsData, error: predecessorError } = await supabaseAdmin
      .from("tasks")
      .select("id, status, output_location")
      .in("id", dependantOnArray);

    if (predecessorError) {
      logger.error("Predecessors lookup error", { error: predecessorError.message });
      await logger.flush();
      return new Response(JSON.stringify({
        predecessor_id: dependantOnArray[0],
        output_location: null,
        status: "error",
        predecessors: dependantOnArray.map(id => ({
          predecessor_id: id,
          output_location: null,
          status: "error"
        }))
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Build predecessors array with status info
    const predecessors = dependantOnArray.map(depId => {
      const pred = predecessorsData?.find(p => p.id === depId);
      if (!pred) {
        return {
          predecessor_id: depId,
          output_location: null,
          status: "not_found"
        };
      }
      return {
        predecessor_id: pred.id,
        output_location: pred.status === "Complete" ? pred.output_location : null,
        status: pred.status
      };
    });

    const allComplete = predecessors.every(p => p.status === "Complete" && p.output_location);
    const firstPred = predecessors[0];

    logger.info("Returning predecessor info", {
      predecessor_count: predecessors.length,
      all_complete: allComplete
    });
    await logger.flush();

    return new Response(JSON.stringify({
      predecessor_id: firstPred?.predecessor_id || null,
      output_location: allComplete ? firstPred?.output_location : null,
      status: allComplete ? "Complete" : (firstPred?.status || null),
      predecessors,
      all_complete: allComplete
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    logger.critical("Unexpected error", { error: error?.message });
    await logger.flush();
    return new Response(`Internal error: ${error?.message}`, { status: 500 });
  }
});
