// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { SystemLogger } from "../_shared/systemLogger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

// Helper function to create responses with CORS headers
function createCorsResponse(body: string, status: number = 200) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}

/**
 * Edge function: create-task
 * 
 * Creates a new task in the queue.
 * - Service-role key: can create tasks for any project_id
 * - User token: can only create tasks for their own project_id
 * 
 * POST /functions/v1/create-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: { task_id?, params, task_type, project_id?, dependant_on? } - task_id is optional, auto-generated if not provided
 * 
 * Returns:
 * - 200 OK with success message
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not authorized
 * - 500 Internal Server Error
 */
serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  
  if (!serviceKey || !supabaseUrl) {
    console.error("[CREATE-TASK] Missing required environment variables");
    return createCorsResponse("Server configuration error", 500);
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  
  // Create logger (task_id will be set after we know it)
  const logger = new SystemLogger(supabaseAdmin, 'create-task');

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    await logger.flush();
    return createCorsResponse("Method not allowed", 405);
  }

  // ─── 1. Parse body ──────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    logger.error("Invalid JSON body");
    await logger.flush();
    return createCorsResponse("Invalid JSON body", 400);
  }

  const { task_id, params, task_type, project_id, dependant_on } = body;
  
  // Set task_id for logs if provided by client
  if (task_id) {
    logger.setDefaultTaskId(task_id);
  }

  if (!params || !task_type) {
    logger.error("Missing required fields", { has_params: !!params, has_task_type: !!task_type });
    await logger.flush();
    return createCorsResponse("params, task_type required", 400);
  }

  logger.info("Creating task", { 
    task_type, 
    project_id,
    has_dependant_on: !!dependant_on,
    client_provided_id: !!task_id
  });

  // ─── 2. Extract authorization header ────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logger.error("Missing or invalid Authorization header");
    await logger.flush();
    return createCorsResponse("Missing or invalid Authorization header", 401);
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  let callerId: string | null = null;
  let isServiceRole = false;

  // ─── 3. Check if token matches service-role key directly ────────
  if (token === serviceKey) {
    isServiceRole = true;
    logger.debug("Authenticated via service-role key");
  }

  // ─── 4. If not service key, try to decode as JWT and check role ──
  let isJwtToken = false;
  if (!isServiceRole) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payloadB64 = parts[1];
        const padded = payloadB64 + "=".repeat((4 - payloadB64.length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        
        isJwtToken = true;
        
        const role = payload.role || payload.app_metadata?.role;
        if (["service_role", "supabase_admin"].includes(role)) {
          isServiceRole = true;
          logger.debug("Authenticated via JWT service-role");
        } else {
          callerId = payload.sub;
          logger.debug("Authenticated via JWT", { user_id: callerId });
        }
      }
    } catch (e) {
      isJwtToken = false;
    }
  }
  
  // ─── 5. PAT PATH - resolve callerId via user_api_token table ──
  if (!isServiceRole && !isJwtToken) {
    try {
      const { data, error } = await supabaseAdmin
        .from("user_api_tokens")
        .select("user_id")
        .eq("token", token)
        .single();

      if (error || !data) {
        logger.error("PAT lookup failed", { error: error?.message });
        await logger.flush();
        return createCorsResponse("Invalid or expired token", 403);
      }

      callerId = data.user_id;
      logger.debug("Authenticated via PAT", { user_id: callerId });
    } catch (e: any) {
      logger.error("Error querying user_api_token", { error: e?.message });
      await logger.flush();
      return createCorsResponse("Token validation failed", 403);
    }
  }

  // ─── 6. Determine final project_id and validate permissions ─────
  let finalProjectId;
  if (isServiceRole) {
    if (!project_id) {
      logger.error("project_id required for service role");
      await logger.flush();
      return createCorsResponse("project_id required for service role", 400);
    }
    finalProjectId = project_id;
  } else {
    if (!callerId) {
      logger.error("Could not determine user ID");
      await logger.flush();
      return createCorsResponse("Could not determine user ID", 401);
    }
    if (!project_id) {
      logger.error("project_id required", { user_id: callerId });
      await logger.flush();
      return createCorsResponse("project_id required", 400);
    }

    // Verify user owns the specified project
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("user_id")
      .eq("id", project_id)
      .single();

    if (projectError) {
      logger.error("Project lookup error", { project_id, error: projectError.message });
      await logger.flush();
      return createCorsResponse("Project not found", 404);
    }

    if (projectData.user_id !== callerId) {
      logger.error("User doesn't own project", { 
        user_id: callerId, 
        project_id, 
        owner_id: projectData.user_id 
      });
      await logger.flush();
      return createCorsResponse("Forbidden: You don't own this project", 403);
    }

    finalProjectId = project_id;
  }

  // ─── 7. Insert row using admin client ───────────────────────────
  try {
    const insertObject: any = {
      params,
      task_type,
      project_id: finalProjectId,
      dependant_on: dependant_on ?? null,
      status: "Queued",
      created_at: new Date().toISOString()
    };
    
    if (task_id) {
      insertObject.id = task_id;
    }
    
    const { data: insertedTask, error } = await supabaseAdmin
      .from("tasks")
      .insert(insertObject)
      .select()
      .single();

    if (error) {
      logger.error("Task creation failed", { error: error.message });
      await logger.flush();
      return createCorsResponse(error.message, 500);
    }

    // Set task_id for final log entry
    logger.setDefaultTaskId(insertedTask.id);
    logger.info("Task created successfully", { 
      task_id: insertedTask.id,
      task_type,
      project_id: finalProjectId,
      created_by: isServiceRole ? 'service-role' : callerId,
      has_dependency: !!dependant_on
    });

    await logger.flush();
    return createCorsResponse(JSON.stringify({ 
      task_id: insertedTask.id, 
      status: "Task queued" 
    }), 200);

  } catch (error: any) {
    logger.critical("Unexpected error", { error: error?.message });
    await logger.flush();
    return createCorsResponse(`Internal server error: ${error?.message}`, 500);
  }
});
