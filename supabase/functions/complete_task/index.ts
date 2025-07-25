// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
/**
 * Edge function: complete-task
 * 
 * Completes a task by uploading file data and updating task status.
 * - Service-role key: can complete any task
 * - User token: can only complete tasks they own
 * 
 * POST /functions/v1/complete-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: { task_id, file_data: "base64...", filename: "image.png" }
 * 
 * Returns:
 * - 200 OK with success data
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not authorized
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
  const { task_id, file_data, filename } = body;
  console.log(`[COMPLETE-TASK-DEBUG] Received request with task_id type: ${typeof task_id}, value: ${JSON.stringify(task_id)}`);
  console.log(`[COMPLETE-TASK-DEBUG] Body keys: ${Object.keys(body)}`);
  if (!task_id || !file_data || !filename) {
    return new Response("task_id, file_data (base64), and filename required", {
      status: 400
    });
  }
  // Convert task_id to string early to avoid UUID casting issues
  const taskIdString = String(task_id);
  console.log(`[COMPLETE-TASK-DEBUG] Converted task_id to string: ${taskIdString}`);
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
    // 4) If user token, verify task ownership
    if (!isServiceRole && callerId) {
      console.log(`[COMPLETE-TASK-DEBUG] Verifying task ${taskIdString} belongs to user ${callerId}...`);
      console.log(`[COMPLETE-TASK-DEBUG] taskIdString type: ${typeof taskIdString}, value: ${taskIdString}`);
      const { data: taskData, error: taskError } = await supabaseAdmin.from("tasks").select("project_id").eq("id", taskIdString).single();
      if (taskError) {
        console.error("Task lookup error:", taskError);
        return new Response("Task not found", {
          status: 404
        });
      }
      // Check if user owns the project that this task belongs to
      const { data: projectData, error: projectError } = await supabaseAdmin.from("projects").select("user_id").eq("id", taskData.project_id).single();
      if (projectError) {
        console.error("Project lookup error:", projectError);
        return new Response("Project not found", {
          status: 404
        });
      }
      if (projectData.user_id !== callerId) {
        console.error(`Task ${taskIdString} belongs to project ${taskData.project_id} owned by ${projectData.user_id}, not user ${callerId}`);
        return new Response("Forbidden: Task does not belong to user", {
          status: 403
        });
      }
      console.log(`Task ${taskIdString} ownership verified: user ${callerId} owns project ${taskData.project_id}`);
    }
    // 5) Decode the base64 file data
    const fileBuffer = Uint8Array.from(atob(file_data), (c)=>c.charCodeAt(0));
    // 6) Determine the storage path
    let userId;
    if (isServiceRole) {
      // For service role, we need to determine the appropriate user folder
      // Get the task to find which project (and user) it belongs to
      console.log(`[COMPLETE-TASK-DEBUG] Service role - looking up task ${taskIdString} for storage path determination`);
      console.log(`[COMPLETE-TASK-DEBUG] taskIdString type: ${typeof taskIdString}, value: ${taskIdString}`);
      const { data: taskData, error: taskError } = await supabaseAdmin.from("tasks").select("project_id").eq("id", taskIdString).single();
      if (taskError) {
        console.error("Task lookup error for storage path:", taskError);
        return new Response("Task not found", {
          status: 404
        });
      }
      // Get the project owner
      const { data: projectData, error: projectError } = await supabaseAdmin.from("projects").select("user_id").eq("id", taskData.project_id).single();
      if (projectError) {
        console.error("Project lookup error for storage path:", projectError);
        // Fallback to system folder if we can't determine owner
        userId = 'system';
      } else {
        userId = projectData.user_id;
      }
      console.log(`Service role storing file for task ${taskIdString} in user ${userId}'s folder`);
    } else {
      // For user tokens, use the authenticated user's ID
      userId = callerId;
    }
    const objectPath = `${userId}/${filename}`;
    // 7) Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage.from('image_uploads').upload(objectPath, fileBuffer, {
      contentType: getContentType(filename),
      upsert: true
    });
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(`Storage upload failed: ${uploadError.message}`, {
        status: 500
      });
    }
    // 8) Get the public URL
    const { data: urlData } = supabaseAdmin.storage.from('image_uploads').getPublicUrl(objectPath);
    const publicUrl = urlData.publicUrl;
    // 9) Update the database with the public URL
    console.log(`[COMPLETE-TASK-DEBUG] Updating task ${taskIdString} to Complete status`);
    const { error: dbError } = await supabaseAdmin.from("tasks").update({
      status: "Complete",
      output_location: publicUrl,
      generation_processed_at: new Date().toISOString()
    }).eq("id", taskIdString).eq("status", "In Progress");
    if (dbError) {
      console.error("[COMPLETE-TASK-DEBUG] Database update error:", dbError);
      // If DB update fails, we should clean up the uploaded file
      await supabaseAdmin.storage.from('image_uploads').remove([
        objectPath
      ]);
      return new Response(`Database update failed: ${dbError.message}`, {
        status: 500
      });
    }
    console.log(`[COMPLETE-TASK-DEBUG] Database update successful for task ${taskIdString}`);

    // 10) Calculate and record task cost (only for service role)
    if (isServiceRole) {
      try {
        console.log(`[COMPLETE-TASK-DEBUG] Triggering cost calculation for task ${taskIdString}...`);

        const costCalcResp = await fetch(`${supabaseUrl}/functions/v1/calculate-task-cost`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ task_id: taskIdString })
        });

        if (costCalcResp.ok) {
          const costData = await costCalcResp.json();
          console.log(`[COMPLETE-TASK-DEBUG] Cost calculation successful: $${(costData.cost / 100).toFixed(2)} for ${costData.duration_seconds}s (task_type: ${costData.task_type})`);
        } else {
          const errTxt = await costCalcResp.text();
          console.error(`[COMPLETE-TASK-DEBUG] Cost calculation failed: ${errTxt}`);
        }
      } catch (costErr) {
        console.error("[COMPLETE-TASK-DEBUG] Error triggering cost calculation:", costErr);
        // Do not fail the main request because of cost calc issues
      }
    }

    // 11) Check if this task completes an orchestrator workflow
    try {
      // Get the task details to check if it's a final task in an orchestrator workflow
      console.log(`[COMPLETE-TASK-DEBUG] Checking orchestrator workflow for task ${taskIdString}`);
      console.log(`[COMPLETE-TASK-DEBUG] taskIdString type: ${typeof taskIdString}, value: ${taskIdString}`);
      const { data: taskData, error: taskError } = await supabaseAdmin.from("tasks").select("task_type, params").eq("id", taskIdString).single();
      if (!taskError && taskData) {
        const { task_type, params } = taskData;
        // Check if this is a final task that should complete an orchestrator
        const isFinalTask = task_type === "travel_stitch" || task_type === "dp_final_gen";
        if (isFinalTask && params?.orchestrator_task_id_ref) {
          console.log(`[COMPLETE-TASK-DEBUG] Task ${taskIdString} is a final ${task_type} task. Marking orchestrator ${params.orchestrator_task_id_ref} as complete.`);
          // Update the orchestrator task to Complete status with the same output location
          const orchestratorIdString = String(params.orchestrator_task_id_ref);
          console.log(`[COMPLETE-TASK-DEBUG] Orchestrator ID string: ${orchestratorIdString}, type: ${typeof orchestratorIdString}`);
          const { error: orchError } = await supabaseAdmin.from("tasks").update({
            status: "Complete",
            output_location: publicUrl,
            generation_processed_at: new Date().toISOString()
          }).eq("id", orchestratorIdString).eq("status", "In Progress"); // Only update if still in progress
          if (orchError) {
            console.error(`[COMPLETE-TASK-DEBUG] Failed to update orchestrator ${params.orchestrator_task_id_ref}:`, orchError);
            console.error(`[COMPLETE-TASK-DEBUG] Orchestrator error details:`, JSON.stringify(orchError, null, 2));
          // Don't fail the whole request, just log the error
          } else {
            console.log(`[COMPLETE-TASK-DEBUG] Successfully marked orchestrator ${params.orchestrator_task_id_ref} as complete.`);
          }
        }
      }
    } catch (orchCheckError) {
      // Don't fail the main request if orchestrator check fails
      console.error("Error checking for orchestrator completion:", orchCheckError);
    }
    console.log(`[COMPLETE-TASK-DEBUG] Successfully completed task ${taskIdString} by ${isServiceRole ? 'service-role' : `user ${callerId}`}`);
    const responseData = {
      success: true,
      public_url: publicUrl,
      message: "Task completed and file uploaded successfully"
    };
    console.log(`[COMPLETE-TASK-DEBUG] Returning success response: ${JSON.stringify(responseData)}`);
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("[COMPLETE-TASK-DEBUG] Edge function error:", error);
    console.error("[COMPLETE-TASK-DEBUG] Error stack:", error.stack);
    console.error("[COMPLETE-TASK-DEBUG] Error details:", JSON.stringify(error, null, 2));
    return new Response(`Internal error: ${error.message}`, {
      status: 500
    });
  }
});
function getContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  switch(ext){
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}
