// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { SystemLogger } from "../_shared/systemLogger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: update-worker-model
 * 
 * Updates a worker's current_model field to track which model is loaded.
 * This enables model-aware task claiming to minimize expensive model reloads.
 * 
 * Only accepts service-role authentication (workers use service key).
 * 
 * POST /functions/v1/update-worker-model
 * Headers: Authorization: Bearer <service-role-key>
 * Body: {
 *   worker_id: string,       // Required: the worker's ID
 *   current_model: string    // Required: the model currently loaded (e.g., "wan_2_2_i2v_480p")
 * }
 * 
 * Returns:
 * - 200 OK with worker data on success
 * - 400 Bad Request if missing required fields
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if not service role
 * - 500 Internal Server Error
 */
serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("[UPDATE-WORKER-MODEL] Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  
  // Create logger
  const logger = new SystemLogger(supabaseAdmin, 'update-worker-model');

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

  // Only allow service role access
  let isServiceRole = false;

  // 1) Check if token matches service-role key directly
  if (token === serviceKey) {
    isServiceRole = true;
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
        }
      }
    } catch (e) {
      // Not a valid JWT
    }
  }

  if (!isServiceRole) {
    logger.error("Service role required");
    await logger.flush();
    return new Response("Service role authentication required", { status: 403 });
  }

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
  const workerIdRaw = requestBody?.worker_id;
  const currentModelRaw = requestBody?.current_model;
  const instanceTypeRaw = requestBody?.instance_type;
  
  const worker_id = typeof workerIdRaw === "string" ? workerIdRaw.trim() : "";
  const current_model = typeof currentModelRaw === "string" ? currentModelRaw.trim() : "";
  const instance_type =
    typeof instanceTypeRaw === "string" && instanceTypeRaw.trim()
      ? instanceTypeRaw.trim()
      : "external";

  if (!worker_id) {
    logger.error("Missing required field: worker_id");
    await logger.flush();
    return new Response("Missing required field: worker_id", { status: 400 });
  }

  if (!current_model) {
    logger.error("Missing required field: current_model", { worker_id });
    await logger.flush();
    return new Response("Missing required field: current_model", { status: 400 });
  }

  logger.info("Updating worker model", { worker_id, current_model });

  try {
    const nowIso = new Date().toISOString();

    // IMPORTANT:
    // - `workers.instance_type` is NOT NULL, but we do NOT want to overwrite it on updates.
    // - So we do an update-first; if worker doesn't exist, we insert with instance_type.
    let action: "updated" | "inserted" = "updated";

    const updateAttempt = await supabaseAdmin
      .from("workers")
      .update({
        current_model,
        last_heartbeat: nowIso,
        status: "active",
      })
      .eq("id", worker_id)
      .select()
      .single();

    let data = updateAttempt.data;
    let error = updateAttempt.error;

    // No row matched -> insert
    if (error?.code === "PGRST116") {
      action = "inserted";
      const insertAttempt = await supabaseAdmin
        .from("workers")
        .insert({
          id: worker_id,
          instance_type,
          status: "active",
          last_heartbeat: nowIso,
          current_model,
        })
        .select()
        .single();

      data = insertAttempt.data;
      error = insertAttempt.error;
    }

    if (error) {
      logger.error("Database error updating worker", {
        worker_id,
        error: error.message,
        code: error.code,
      });
      await logger.flush();
      return new Response(`Database error: ${error.message}`, { status: 500 });
    }

    logger.info("Worker model updated successfully", { 
      worker_id, 
      current_model,
      last_heartbeat: data?.last_heartbeat 
    });
    
    await logger.flush();
    return new Response(JSON.stringify({
      success: true,
      worker_id: worker_id,
      current_model: current_model,
      last_heartbeat: data?.last_heartbeat,
      action,
      message: `Worker model updated to '${current_model}'`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    logger.critical("Unexpected error", { worker_id, error: error?.message });
    await logger.flush();
    return new Response(`Internal server error: ${error?.message}`, { status: 500 });
  }
});
