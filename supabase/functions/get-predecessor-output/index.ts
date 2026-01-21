import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
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
 */ serve(async (req)=>{
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405
    });
  }
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response("Invalid JSON body", {
      status: 400
    });
  }
  const { task_id } = body;
  if (!task_id) {
    return new Response("task_id is required", {
      status: 400
    });
  }
  // Extract authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Missing or invalid Authorization header", {
      status: 401
    });
  }
  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", {
      status: 500
    });
  }
  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  let callerId = null;
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
        const padded = payloadB64 + "=".repeat((4 - payloadB64.length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        // Check for service role in various claim locations
        const role = payload.role || payload.app_metadata?.role;
        if ([
          "service_role",
          "supabase_admin"
        ].includes(role)) {
          isServiceRole = true;
          console.log("JWT has service-role/admin role");
        }
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      console.log("Token is not a valid JWT, treating as PAT");
    }
  }
  // 3) USER TOKEN PATH - resolve callerId via user_api_token table
  if (!isServiceRole) {
    console.log("Looking up token in user_api_token table...");
    try {
      const { data, error } = await supabaseAdmin.from("user_api_tokens").select("user_id").eq("token", token).single();
      if (error || !data) {
        console.error("Token lookup failed:", error);
        return new Response("Invalid or expired token", {
          status: 403
        });
      }
      callerId = data.user_id;
      console.log(`Token resolved to user ID: ${callerId}`);
    } catch (e) {
      console.error("Error querying user_api_token:", e);
      return new Response("Token validation failed", {
        status: 403
      });
    }
  }
  try {
    // Get the task info first
    const { data: taskData, error: taskError } = await supabaseAdmin.from("tasks").select("id, dependant_on, project_id").eq("id", task_id).single();
    if (taskError) {
      console.error("Task lookup error:", taskError);
      return new Response("Task not found", {
        status: 404
      });
    }
    // Check authorization if not service role
    if (!isServiceRole && callerId) {
      console.log(`Verifying task ${task_id} belongs to user ${callerId}...`);
      // Check if user owns the project that this task belongs to
      const { data: projectData, error: projectError } = await supabaseAdmin.from("projects").select("user_id").eq("id", taskData.project_id).single();
      if (projectError) {
        console.error("Project lookup error:", projectError);
        return new Response("Project not found", {
          status: 404
        });
      }
      if (projectData.user_id !== callerId) {
        console.error(`Task ${task_id} belongs to project ${taskData.project_id} owned by ${projectData.user_id}, not user ${callerId}`);
        return new Response("Forbidden: Task does not belong to user", {
          status: 403
        });
      }
      console.log(`Task ${task_id} authorization verified for user ${callerId}`);
    }
    // Return the dependency info
    // dependant_on is now an array (or null)
    const dependantOnArray: string[] = taskData.dependant_on || [];

    if (dependantOnArray.length === 0) {
      // No dependencies
      return new Response(JSON.stringify({
        predecessor_id: null,
        output_location: null,
        predecessors: []
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    // Fetch all predecessor tasks
    const { data: predecessorsData, error: predecessorError } = await supabaseAdmin
      .from("tasks")
      .select("id, status, output_location")
      .in("id", dependantOnArray);

    if (predecessorError) {
      console.error("Predecessors lookup error:", predecessorError);
      return new Response(JSON.stringify({
        predecessor_id: dependantOnArray[0], // backward compat
        output_location: null,
        status: "error",
        predecessors: dependantOnArray.map(id => ({
          predecessor_id: id,
          output_location: null,
          status: "error"
        }))
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
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

    // Check if all predecessors are complete with output
    const allComplete = predecessors.every(p => p.status === "Complete" && p.output_location);

    // For backward compatibility, also include single predecessor fields if there's only one
    const firstPred = predecessors[0];
    console.log(`Found ${predecessors.length} predecessor(s), all complete: ${allComplete}`);

    return new Response(JSON.stringify({
      // Backward compatibility fields (for single dependency)
      predecessor_id: firstPred?.predecessor_id || null,
      output_location: allComplete ? firstPred?.output_location : null,
      status: allComplete ? "Complete" : (firstPred?.status || null),
      // New array format for multiple dependencies
      predecessors,
      all_complete: allComplete
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(`Internal error: ${error.message}`, {
      status: 500
    });
  }
});
