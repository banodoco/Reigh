import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

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

serve(async (req) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Extract authorization header
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

  // Parse request body
  let requestBody: any = {};
  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch (e) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  // Validate required fields
  const { task_id, status } = requestBody;
  if (!task_id || !status) {
    return new Response("Missing required fields: task_id and status", { status: 400 });
  }

  // Validate status values
  const validStatuses = ["Queued", "In Progress", "Complete", "Failed"];
  if (!validStatuses.includes(status)) {
    return new Response(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, { status: 400 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  let callerId: string | null = null;
  let isServiceRole = false;

  // 1) Check if token matches service-role key directly
  if (token === serviceKey) {
    isServiceRole = true;
    console.log("Direct service-role key match");
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
          console.log("JWT has service-role/admin role");
        }
        // Don't extract user ID from JWT - always look it up in user_api_token table
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      console.log("Token is not a valid JWT, treating as PAT");
    }
  }

  // 3) USER TOKEN PATH - ALWAYS resolve callerId via user_api_token table
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

  try {
    // Build update payload
    const updatePayload: any = {
      status: status,
      updated_at: new Date().toISOString()
    };

    // Add optional fields based on status
    if (status === "In Progress") {
      updatePayload.generation_started_at = new Date().toISOString();
    }

    if (requestBody.output_location) {
      updatePayload.output_location = requestBody.output_location;
    }

    let updateResult;

    if (isServiceRole) {
      // Service role: can update any task
      console.log(`Service role: Updating task ${task_id} to status '${status}'`);
      
      updateResult = await supabaseAdmin
        .from("tasks")
        .update(updatePayload)
        .eq("id", task_id)
        .select()
        .single();

    } else {
      // User token: can only update tasks in their projects
      console.log(`User ${callerId}: Updating task ${task_id} to status '${status}'`);
      
      // First get user's project IDs
      const { data: userProjects } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("user_id", callerId);

      if (!userProjects || userProjects.length === 0) {
        return new Response("User has no projects", { status: 403 });
      }

      const projectIds = userProjects.map(p => p.id);
      
      // Update task only if it belongs to user's projects
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
        console.log(`Task ${task_id} not found or not accessible`);
        return new Response("Task not found or not accessible", { status: 404 });
      }
      console.error("Update error:", updateResult.error);
      return new Response(`Database error: ${updateResult.error.message}`, { status: 500 });
    }

    if (!updateResult.data) {
      console.log(`Task ${task_id} not found or not accessible`);
      return new Response("Task not found or not accessible", { status: 404 });
    }

    console.log(`Successfully updated task ${task_id} to status '${status}'`);
    
    return new Response(JSON.stringify({
      success: true,
      task_id: task_id,
      status: status,
      message: `Task status updated to '${status}'`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
}); 