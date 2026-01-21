// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest } from "../_shared/auth.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge Function: get-completed-segments
 * Retrieves all completed travel_segment tasks for a given run_id.
 *
 * Auth rules:
 * - Service-role key: full access.
 * - Personal access token (PAT): must resolve via user_api_tokens and caller must own the project_id supplied.
 *
 * Request (POST):
 * {
 *   "run_id": "string",            // required
 *   "project_id": "uuid"           // required for PAT tokens
 * }
 *
 * Returns 200 with: [{ segment_index, output_location }]
 */
serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("[GET-COMPLETED-SEGMENTS] Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Create logger
  const logger = new SystemLogger(supabaseAdmin, 'get-completed-segments');

  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    await logger.flush();
    return new Response("Method not allowed", { status: 405 });
  }

  // Parse request body
  let requestBody: any = {};
  try {
    requestBody = await req.json();
  } catch (e) {
    logger.error("Invalid JSON body");
    await logger.flush();
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { run_id, project_id } = requestBody;

  if (!run_id) {
    logger.error("Missing run_id");
    await logger.flush();
    return new Response("run_id is required", { status: 400 });
  }

  logger.info("Processing request", { run_id, project_id: project_id || "(none)" });

  // Authenticate using shared auth module
  const auth = await authenticateRequest(req, supabaseAdmin, "[GET-COMPLETED-SEGMENTS]");

  if (!auth.success) {
    logger.error("Authentication failed", { error: auth.error });
    await logger.flush();
    return new Response(auth.error || "Authentication failed", { status: auth.statusCode || 403 });
  }

  const isServiceRole = auth.isServiceRole;
  const callerId = auth.userId;

  try {
    // Authorization for non-service callers
    let effectiveProjectId = project_id;

    if (!isServiceRole) {
      if (!effectiveProjectId) {
        logger.error("Missing project_id for user token");
        await logger.flush();
        return new Response("project_id required for user tokens", { status: 400 });
      }

      // Ensure caller owns the project
      const { data: proj, error: projErr } = await supabaseAdmin
        .from("projects")
        .select("user_id")
        .eq("id", effectiveProjectId)
        .single();

      if (projErr || !proj) {
        logger.error("Project not found", { project_id: effectiveProjectId, error: projErr?.message });
        await logger.flush();
        return new Response("Project not found", { status: 404 });
      }

      if (proj.user_id !== callerId) {
        logger.error("Access denied - user doesn't own project", {
          user_id: callerId,
          project_owner: proj.user_id
        });
        await logger.flush();
        return new Response("Forbidden: You don't own this project", { status: 403 });
      }

      logger.debug("Project ownership verified");
    }

    // Query completed segments
    let query = supabaseAdmin
      .from("tasks")
      .select("params, output_location")
      .eq("task_type", "travel_segment")
      .eq("status", "Complete")
      .eq("params->>orchestrator_run_id", run_id)
      .limit(1000);

    if (!isServiceRole) {
      query = query.eq("project_id", effectiveProjectId);
    }

    const { data: rows, error: qErr } = await query;

    if (qErr) {
      logger.error("Database query error", { error: qErr.message });
      await logger.flush();
      return new Response("Database query error", { status: 500 });
    }

    const results: { segment_index: number; output_location: string }[] = [];

    for (const row of rows ?? []) {
      const paramsObj = typeof row.params === "string" ? JSON.parse(row.params) : row.params;

      if (typeof paramsObj.segment_index === "number" && row.output_location) {
        results.push({
          segment_index: paramsObj.segment_index,
          output_location: row.output_location
        });
      }
    }

    results.sort((a, b) => a.segment_index - b.segment_index);

    logger.info("Returning completed segments", {
      run_id,
      total_found: rows?.length || 0,
      valid_results: results.length
    });
    await logger.flush();

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    logger.critical("Unexpected error", { error: e?.message });
    await logger.flush();
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
