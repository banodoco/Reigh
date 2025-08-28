import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

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
 * Body: { task_id, params, task_type, project_id?, dependant_on? }
 * 
 * Returns:
 * - 200 OK with success message
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not authorized
 * - 500 Internal Server Error
 */ serve(async (req)=>{
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
    return createCorsResponse("Method not allowed", 405);
  }
  // ─── 1. Parse body ──────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch  {
    return createCorsResponse("Invalid JSON body", 400);
  }
  const { params, task_type, project_id, dependant_on } = body;
  if (!params || !task_type) {
    return createCorsResponse("params, task_type required", 400);
  }
  // ─── 2. Extract authorization header ────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return createCorsResponse("Missing or invalid Authorization header", 401);
  }
  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) {
    console.error("Missing required environment variables");
    return createCorsResponse("Server configuration error", 500);
  }
  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  let callerId = null;
  let isServiceRole = false;
  // ─── 3. Check if token matches service-role key directly ────────
  if (token === serviceKey) {
    isServiceRole = true;
    console.log("Direct service-role key match");
  }
  // ─── 4. If not service key, try to decode as JWT and check role ──
  let isJwtToken = false;
  if (!isServiceRole) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        // It's a JWT - decode and check role
        const payloadB64 = parts[1];
        const padded = payloadB64 + "=".repeat((4 - payloadB64.length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        
        isJwtToken = true; // Mark as JWT for later handling
        
        // Check for service role in various claim locations
        const role = payload.role || payload.app_metadata?.role;
        if ([
          "service_role",
          "supabase_admin"
        ].includes(role)) {
          isServiceRole = true;
          console.log("JWT has service-role/admin role");
        } else {
          // Regular user JWT - extract user ID
          callerId = payload.sub; // 'sub' is the user ID in JWT
          console.log("JWT authenticated user ID:", callerId);
        }
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      console.log("Token is not a valid JWT, treating as PAT");
      isJwtToken = false;
    }
  }
  
  // ─── 5. PAT PATH - resolve callerId via user_api_token table (UNCHANGED) ──
  if (!isServiceRole && !isJwtToken) {
    console.log("Looking up PAT in user_api_token table...");
    try {
      // Query user_api_tokens table to find user (EXACTLY as before)
      const { data, error } = await supabaseAdmin.from("user_api_tokens").select("user_id").eq("token", token).single();
      if (error || !data) {
        console.error("PAT lookup failed:", error);
        return createCorsResponse("Invalid or expired token", 403);
      }
      callerId = data.user_id;
      console.log(`PAT resolved to user ID: ${callerId}`);
    } catch (e) {
      console.error("Error querying user_api_token:", e);
      return createCorsResponse("Token validation failed", 403);
    }
  }
  // ─── 6. Determine final project_id and validate permissions ─────
  let finalProjectId;
  if (isServiceRole) {
    // Service role can create tasks for any project_id
    if (!project_id) {
      return createCorsResponse("project_id required for service role", 400);
    }
    finalProjectId = project_id;
    console.log(`Service role creating task for project: ${finalProjectId}`);
  } else {
    // User token validation
    if (!callerId) {
      return createCorsResponse("Could not determine user ID", 401);
    }
    if (!project_id) {
      return createCorsResponse("project_id required", 400);
    }
    // Verify user owns the specified project
    const { data: projectData, error: projectError } = await supabaseAdmin.from("projects").select("user_id").eq("id", project_id).single();
    if (projectError) {
      console.error("Project lookup error:", projectError);
      return createCorsResponse("Project not found", 404);
    }
    if (projectData.user_id !== callerId) {
      console.error(`User ${callerId} attempted to create task in project ${project_id} owned by ${projectData.user_id}`);
      return createCorsResponse("Forbidden: You don't own this project", 403);
    }
    finalProjectId = project_id;
    console.log(`User ${callerId} creating task in their owned project ${finalProjectId}`);
  }
  // ─── 7. Insert row using admin client ───────────────────────────
  try {
    const { data: insertedTask, error } = await supabaseAdmin.from("tasks").insert({
      // Don't specify id - let database auto-generate UUID
      params,
      task_type,
      project_id: finalProjectId,
      dependant_on: dependant_on ?? null,
      status: "Queued",
      created_at: new Date().toISOString()
    }).select().single();
    if (error) {
      console.error("create_task error:", error);
      return createCorsResponse(error.message, 500);
    }
    console.log(`Successfully created task ${insertedTask.id} for project ${finalProjectId} by ${isServiceRole ? 'service-role' : `user ${callerId}`}`);
    return createCorsResponse(JSON.stringify({ task_id: insertedTask.id, status: "Task queued" }), 200);
  } catch (error) {
    console.error("Unexpected error:", error);
    return createCorsResponse(`Internal server error: ${error.message}`, 500);
  }
});
