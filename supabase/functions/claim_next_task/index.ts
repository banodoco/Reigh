import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { createHash } from "https://deno.land/std@0.224.0/crypto/mod.ts";

/**
 * Edge function: claim-next-task
 * 
 * Claims the next queued task atomically.
 * - Service-role key: claims any task across all users
 * - User token: claims only tasks for that specific user
 * 
 * POST /functions/v1/claim-next-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: {} (empty JSON)
 * 
 * Returns:
 * - 200 OK with task data
 * - 204 No Content if no tasks available
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not found
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

  // Parse request body to get worker_id if provided
  let requestBody: any = {};
  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch (e) {
    console.log("No valid JSON body provided, using default worker_id");
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
      
      // Debug: Check user's projects and tasks
      const { data: userProjects } = await supabaseAdmin
        .from("projects")
        .select("id, name")
        .eq("user_id", callerId);
      
      console.log(`DEBUG: User ${callerId} owns ${userProjects?.length || 0} projects`);
      
      if (userProjects && userProjects.length > 0) {
        const projectIds = userProjects.map(p => p.id);
        const { data: userTasks } = await supabaseAdmin
          .from("tasks")
          .select("id, status, project_id, task_type, created_at")
          .in("project_id", projectIds);
        
        console.log(`DEBUG: Found ${userTasks?.length || 0} tasks across user's projects`);
        if (userTasks && userTasks.length > 0) {
          const queuedTasks = userTasks.filter(t => t.status === "Queued");
          console.log(`DEBUG: ${queuedTasks.length} tasks are in 'Queued' status`);
          console.log("DEBUG: Sample tasks:", JSON.stringify(userTasks.slice(0, 3), null, 2));
          
          // Show unique status values to debug enum
          const uniqueStatuses = [...new Set(userTasks.map(t => t.status))];
          console.log(`DEBUG: Unique status values: ${JSON.stringify(uniqueStatuses)}`);
        }
      } else {
        console.log(`DEBUG: User ${callerId} has no projects - cannot claim any tasks`);
      }
    } catch (e) {
      console.error("Error querying user_api_token:", e);
      return new Response("Token validation failed", { status: 403 });
    }
  }

  // Handle worker_id based on token type
  let workerId: string | null = null;
  if (isServiceRole) {
    // Service role: use provided worker_id or generate one
    workerId = requestBody.worker_id || `edge_${crypto.randomUUID()}`;
    console.log(`Service role using worker_id: ${workerId}`);
  } else {
    // User/PAT: no worker_id needed (individual users don't have worker IDs)
    console.log(`User token: not using worker_id`);
  }

  try {
    // Call the appropriate RPC function based on token type
    let rpcResponse;
    
    if (isServiceRole) {
      // Service role: claim any available task from any project atomically
      console.log("Service role: Executing atomic find-and-claim for all tasks");
      
      const serviceUpdatePayload = {
        status: "In Progress" as const,
        worker_id: workerId,  // Service role gets worker_id for tracking
        updated_at: new Date().toISOString()
      };

      // Get all queued tasks and manually check dependencies
      const { data: queuedTasks, error: findError } = await supabaseAdmin
        .from("tasks")
        .select("id, params, task_type, project_id, created_at, dependant_on")
        .eq("status", "Queued")
        .order("created_at", { ascending: true });

      if (findError) {
        throw findError;
      }

      // Manual dependency checking for service role
      const readyTasks: any[] = [];
      for (const task of (queuedTasks || [])) {
        if (!task.dependant_on) {
          // No dependency - task is ready
          readyTasks.push(task);
        } else {
          // Check if dependency is complete
          const { data: depData } = await supabaseAdmin
            .from("tasks")
            .select("status")
            .eq("id", task.dependant_on)
            .single();
          
          if (depData?.status === "Complete") {
            readyTasks.push(task);
          }
        }
      }
      
      console.log(`Service role dependency check: ${queuedTasks?.length || 0} queued, ${readyTasks.length} ready`);

      let updateData: any = null;
      let updateError: any = null;

      if (readyTasks.length > 0) {
        const taskToTake = readyTasks[0];
        
        // Atomically claim the first eligible task
        const result = await supabaseAdmin
          .from("tasks")
          .update(serviceUpdatePayload)
          .eq("id", taskToTake.id)
          .eq("status", "Queued") // Double-check it's still queued
          .select()
          .single();
          
        updateData = result.data;
        updateError = result.error;
      } else {
        // No eligible tasks found - set error to indicate no rows
        updateError = { code: "PGRST116", message: "No eligible tasks found" };
      }

      console.log(`Service role atomic claim result - error: ${updateError?.message || updateError?.code || 'none'}, data: ${updateData ? 'claimed task ' + updateData.id : 'no data'}`);

      if (updateError && updateError.code !== "PGRST116") { // PGRST116 = no rows
        console.error("Service role atomic claim failed:", updateError);
        throw updateError;
      }

      if (updateData) {
        console.log(`Service role successfully claimed task ${updateData.id} atomically`);
        rpcResponse = {
          data: [{
            task_id_out: updateData.id,
            params_out: updateData.params,
            task_type_out: updateData.task_type,
            project_id_out: updateData.project_id
          }],
          error: null
        };
      } else {
        console.log("Service role: No queued tasks available for atomic claiming");
        rpcResponse = { data: [], error: null };
      }
    } else {
      // User token: use the user-specific claim function
      console.log(`Claiming task for user ${callerId}...`);
      
      try {
        // Try the user-specific function first
        // First get user's project IDs, then query tasks
        const { data: userProjects } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("user_id", callerId);

        if (!userProjects || userProjects.length === 0) {
          console.log("User has no projects");
          rpcResponse = { data: [], error: null };
        } else {
                    const projectIds = userProjects.map(p => p.id);
          console.log(`DEBUG: Claiming from ${projectIds.length} project IDs: [${projectIds.slice(0, 3).join(', ')}...]`);
          
          if (projectIds.length === 0) {
            console.log("No project IDs to search - user has projects but they have no IDs?");
            rpcResponse = { data: [], error: null };
          } else {
            // Get queued tasks for user projects and manually check dependencies
            console.log(`DEBUG: Finding eligible tasks with dependency checking for ${projectIds.length} projects`);
            
            const { data: userQueuedTasks, error: userFindError } = await supabaseAdmin
              .from("tasks")
              .select("id, params, task_type, project_id, created_at, dependant_on")
              .eq("status", "Queued")
              .in("project_id", projectIds)
              .order("created_at", { ascending: true });

            if (userFindError) {
              throw userFindError;
            }

            // Manual dependency checking for user tasks
            const userReadyTasks: any[] = [];
            for (const task of (userQueuedTasks || [])) {
              if (!task.dependant_on) {
                // No dependency - task is ready
                userReadyTasks.push(task);
              } else {
                // Check if dependency is complete
                const { data: depData } = await supabaseAdmin
                  .from("tasks")
                  .select("status")
                  .eq("id", task.dependant_on)
                  .single();
                
                if (depData?.status === "Complete") {
                  userReadyTasks.push(task);
                }
              }
            }

            console.log(`DEBUG: User dependency check: ${userQueuedTasks?.length || 0} queued, ${userReadyTasks.length} ready`);

            const updatePayload: any = {
              status: "In Progress",
              updated_at: new Date().toISOString()
              // Note: No worker_id for user claims - individual users don't have worker IDs
            };
            
            let updateData: any = null;
            let updateError: any = null;

            if (userReadyTasks.length > 0) {
              const taskToTake = userReadyTasks[0];
              
              // Atomically claim the first eligible task
              const result = await supabaseAdmin
                .from("tasks")
                .update(updatePayload)
                .eq("id", taskToTake.id)
                .eq("status", "Queued") // Double-check it's still queued
                .select()
                .single();
                
              updateData = result.data;
              updateError = result.error;
            } else {
              // No eligible tasks found
              updateError = { code: "PGRST116", message: "No eligible tasks found for user" };
            }

            console.log(`DEBUG: User atomic claim result - error: ${updateError?.message || updateError?.code || 'none'}, data: ${updateData ? 'claimed task ' + updateData.id : 'no data'}`);
            
            if (updateError && updateError.code !== "PGRST116") { // PGRST116 = no rows
              console.error("User atomic claim failed:", updateError);
              throw updateError;
            }

            if (updateData) {
              // Successfully claimed atomically
              console.log(`Successfully claimed task ${updateData.id} atomically for user`);
              rpcResponse = {
                data: [{
                  task_id_out: updateData.id,
                  params_out: updateData.params,
                  task_type_out: updateData.task_type,
                  project_id_out: updateData.project_id
                }],
                error: null
              };
            } else {
              // No tasks available or all were claimed by others
              console.log("No queued tasks available for user atomic claiming");
              rpcResponse = { data: [], error: null };
            }
         }
        }
      } catch (e) {
        console.error("Error claiming user task:", e);
        rpcResponse = { data: [], error: null };
      }
    }

    // Check RPC response
    if (rpcResponse.error) {
      console.error("RPC error:", rpcResponse.error);
      return new Response(`Database error: ${rpcResponse.error.message}`, { status: 500 });
    }

    // Check if we got a task
    if (!rpcResponse.data || rpcResponse.data.length === 0) {
      console.log("No queued tasks available");
      return new Response(null, { status: 204 });
    }

    const task = rpcResponse.data[0];
    console.log(`Successfully claimed task ${task.task_id_out}`);

    // Return the task data
    return new Response(JSON.stringify({
      task_id: task.task_id_out,
      params: task.params_out,
      task_type: task.task_type_out,
      project_id: task.project_id_out
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
}); 