import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

/**
 * Edge function: create-task
 * 
 * Creates a new task in the queue.
 * - Service-role key: can create tasks for any project_id
 * - User token: can only create tasks for their own project_id
 * 
 * POST /functions/v1/create-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: { task_id, params, task_type, project_id?, dependant_on? }
 * 
 * Returns:
 * - 200 OK with success message
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not authorized
 * - 500 Internal Server Error
 */
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ─── 1. Parse body ──────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const { task_id, params, task_type, project_id, dependant_on } = body;
  if (!task_id || !params || !task_type) {
    return new Response("task_id, params, task_type required", { status: 400 });
  }

  // ─── 2. Extract authorization header ────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Missing or invalid Authorization header", { status: 401 });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  let callerId: string | null = null;
  let isServiceRole = false;

  // ─── 3. Check if token matches service-role key directly ────────
  if (token === serviceKey) {
    isServiceRole = true;
    console.log("Direct service-role key match");
  }

  // ─── 4. If not service key, try to decode as JWT and check role ──
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
          console.log("JWT has service-role/admin role");
        }
        // Don't extract user ID from JWT - always look it up in user_api_token table
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      console.log("Token is not a valid JWT, treating as PAT");
    }
  }

  // ─── 5. USER TOKEN PATH - resolve callerId via user_api_token table ──
  if (!isServiceRole) {
    console.log("Looking up token in user_api_token table...");
    
    try {
      // Query user_api_tokens table to find user
      const { data, error } = await supabaseAdmin
        .from("user_api_tokens")
        .select("user_id")
        .eq("token", token)
        .single();

      if (error || !data) {
        console.error("Token lookup failed:", error);
        return new Response("Invalid or expired token", { status: 403 });
      }

      callerId = data.user_id;
      console.log(`Token resolved to user ID: ${callerId}`);
    } catch (e) {
      console.error("Error querying user_api_token:", e);
      return new Response("Token validation failed", { status: 403 });
    }
  }

  // ─── 6. Determine final project_id and validate permissions ─────
  let finalProjectId: string;

  if (isServiceRole) {
    // Service role can create tasks for any project_id
    finalProjectId = project_id || 'system';
    console.log(`Service role creating task for project: ${finalProjectId}`);
  } else {
    // User token validation
    if (!callerId) {
      return new Response("Could not determine user ID", { status: 401 });
    }

    // If project_id provided, it must match the caller's ID
    if (project_id && project_id !== callerId) {
      return new Response("project_id does not match authenticated user", { status: 403 });
    }

    // Use caller's ID as the project_id
    finalProjectId = callerId;
    console.log(`User ${callerId} creating task for their own project`);
  }

  // ─── 7. Insert row using admin client ───────────────────────────
  try {
    const { error } = await supabaseAdmin.from("tasks").insert({
      id: task_id,
      params,
      task_type,
      project_id: finalProjectId,
      dependant_on: dependant_on ?? null,
      status: "Queued",
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("create_task error:", error);
      return new Response(error.message, { status: 500 });
    }

    console.log(`Successfully created task ${task_id} for project ${finalProjectId} by ${isServiceRole ? 'service-role' : `user ${callerId}`}`);
    return new Response("Task queued", { status: 200 });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
}); 