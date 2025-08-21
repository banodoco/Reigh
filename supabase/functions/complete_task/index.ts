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
 * Body: { 
 *   task_id, 
 *   file_data: "base64...", 
 *   filename: "image.png",
 *   first_frame_data?: "base64...",      // Optional thumbnail data
 *   first_frame_filename?: "thumb.png"   // Optional thumbnail filename
 * }
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
  const { task_id, file_data, filename, first_frame_data, first_frame_filename } = body;
  console.log(`[COMPLETE-TASK-DEBUG] Received request with task_id type: ${typeof task_id}, value: ${JSON.stringify(task_id)}`);
  console.log(`[COMPLETE-TASK-DEBUG] Body keys: ${Object.keys(body)}`);
  if (!task_id || !file_data || !filename) {
    return new Response("task_id, file_data (base64), and filename required", {
      status: 400
    });
  }
  
  // Validate thumbnail parameters if provided
  if (first_frame_data && !first_frame_filename) {
    return new Response("first_frame_filename required when first_frame_data is provided", {
      status: 400
    });
  }
  if (first_frame_filename && !first_frame_data) {
    return new Response("first_frame_data required when first_frame_filename is provided", {
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
    
    // 8.1) Upload thumbnail if provided
    let thumbnailUrl = null;
    if (first_frame_data && first_frame_filename) {
      console.log(`[COMPLETE-TASK-DEBUG] Uploading thumbnail for task ${taskIdString}`);
      try {
        // Decode the base64 thumbnail data
        const thumbnailBuffer = Uint8Array.from(atob(first_frame_data), (c) => c.charCodeAt(0));
        
        // Create thumbnail path
        const thumbnailPath = `${userId}/thumbnails/${first_frame_filename}`;
        
        // Upload thumbnail to storage
        const { data: thumbnailUploadData, error: thumbnailUploadError } = await supabaseAdmin.storage
          .from('image_uploads')
          .upload(thumbnailPath, thumbnailBuffer, {
            contentType: getContentType(first_frame_filename),
            upsert: true
          });
        
        if (thumbnailUploadError) {
          console.error("Thumbnail upload error:", thumbnailUploadError);
          // Don't fail the main upload, just log the error
        } else {
          // Get the public URL for the thumbnail
          const { data: thumbnailUrlData } = supabaseAdmin.storage
            .from('image_uploads')
            .getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbnailUrlData.publicUrl;
          console.log(`[COMPLETE-TASK-DEBUG] Thumbnail uploaded successfully: ${thumbnailUrl}`);
        }
      } catch (thumbnailError) {
        console.error("Error processing thumbnail:", thumbnailError);
        // Don't fail the main upload, just log the error
      }
    }
    
    // 8.5) Validate shot existence and clean up parameters if necessary
    console.log(`[COMPLETE-TASK-DEBUG] Validating shot references for task ${taskIdString}`);
    try {
      // Get the current task to check its parameters
      const { data: currentTask, error: taskFetchError } = await supabaseAdmin
        .from("tasks")
        .select("params, task_type")
        .eq("id", taskIdString)
        .single();
      
      if (!taskFetchError && currentTask && currentTask.params) {
        let shotId = null;
        let needsParamsUpdate = false;
        let updatedParams = { ...currentTask.params };
        
        // Extract shot_id based on task type
        if (currentTask.task_type === 'travel_stitch') {
          shotId = currentTask.params?.full_orchestrator_payload?.shot_id;
        } else if (currentTask.task_type === 'single_image') {
          shotId = currentTask.params?.shot_id;
        }
        
        // If there's a shot_id, validate it exists
        if (shotId) {
          console.log(`[COMPLETE-TASK-DEBUG] Checking if shot ${shotId} exists...`);
          const { data: shotData, error: shotError } = await supabaseAdmin
            .from("shots")
            .select("id")
            .eq("id", shotId)
            .single();
          
          if (shotError || !shotData) {
            console.log(`[COMPLETE-TASK-DEBUG] Shot ${shotId} does not exist, removing from task parameters`);
            needsParamsUpdate = true;
            
            // Remove shot_id from parameters
            if (currentTask.task_type === 'travel_stitch' && updatedParams.full_orchestrator_payload) {
              delete updatedParams.full_orchestrator_payload.shot_id;
            } else if (currentTask.task_type === 'single_image') {
              delete updatedParams.shot_id;
            }
          } else {
            console.log(`[COMPLETE-TASK-DEBUG] Shot ${shotId} exists and is valid`);
          }
        }
        
        // Add thumbnail URL to task parameters if available
        if (thumbnailUrl) {
          console.log(`[COMPLETE-TASK-DEBUG] Adding thumbnail_url to task parameters: ${thumbnailUrl}`);
          needsParamsUpdate = true;
          
          if (currentTask.task_type === 'travel_stitch') {
            // For travel_stitch tasks, add to full_orchestrator_payload.thumbnail_url
            if (!updatedParams.full_orchestrator_payload) {
              updatedParams.full_orchestrator_payload = {};
            }
            updatedParams.full_orchestrator_payload.thumbnail_url = thumbnailUrl;
          } else if (currentTask.task_type === 'single_image') {
            // For single_image tasks, add to thumbnail_url
            updatedParams.thumbnail_url = thumbnailUrl;
          }
        }
        
        // Update task parameters if needed (before marking as complete)
        if (needsParamsUpdate) {
          console.log(`[COMPLETE-TASK-DEBUG] Updating task parameters${thumbnailUrl ? ' with thumbnail_url' : ' to remove invalid shot reference'}`);
          const { error: paramsUpdateError } = await supabaseAdmin
            .from("tasks")
            .update({ params: updatedParams })
            .eq("id", taskIdString);
          
          if (paramsUpdateError) {
            console.error(`[COMPLETE-TASK-DEBUG] Failed to update task parameters:`, paramsUpdateError);
            // Continue anyway - better to complete the task than fail entirely
          } else if (thumbnailUrl) {
            console.log(`[COMPLETE-TASK-DEBUG] Successfully added thumbnail_url to task parameters`);
          }
        }
      }
    } catch (shotValidationError) {
      console.error(`[COMPLETE-TASK-DEBUG] Error during shot validation:`, shotValidationError);
      // Continue anyway - don't fail task completion due to validation errors
    }
    
    // 8.6) Handle thumbnail URL if we couldn't update through the main parameter update flow
    if (thumbnailUrl) {
      try {
        // Try a separate update to ensure thumbnail gets added even if shot validation failed
        console.log(`[COMPLETE-TASK-DEBUG] Ensuring thumbnail_url is added to task parameters`);
        const { data: currentTask, error: taskFetchError } = await supabaseAdmin
          .from("tasks")
          .select("params, task_type")
          .eq("id", taskIdString)
          .single();
        
        if (!taskFetchError && currentTask) {
          let updatedParams = { ...(currentTask.params || {}) };
          let shouldUpdate = false;
          
          if (currentTask.task_type === 'travel_stitch') {
            if (!updatedParams.full_orchestrator_payload) {
              updatedParams.full_orchestrator_payload = {};
            }
            if (!updatedParams.full_orchestrator_payload.thumbnail_url) {
              updatedParams.full_orchestrator_payload.thumbnail_url = thumbnailUrl;
              shouldUpdate = true;
            }
          } else if (currentTask.task_type === 'single_image') {
            if (!updatedParams.thumbnail_url) {
              updatedParams.thumbnail_url = thumbnailUrl;
              shouldUpdate = true;
            }
          }
          
          if (shouldUpdate) {
            const { error: thumbnailUpdateError } = await supabaseAdmin
              .from("tasks")
              .update({ params: updatedParams })
              .eq("id", taskIdString);
            
            if (thumbnailUpdateError) {
              console.error(`[COMPLETE-TASK-DEBUG] Failed to update thumbnail in parameters:`, thumbnailUpdateError);
            } else {
              console.log(`[COMPLETE-TASK-DEBUG] Successfully ensured thumbnail_url is in task parameters`);
            }
          }
        }
      } catch (thumbnailParamError) {
        console.error(`[COMPLETE-TASK-DEBUG] Error adding thumbnail to parameters:`, thumbnailParamError);
        // Continue anyway - don't fail task completion
      }
    }
    
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
      thumbnail_url: thumbnailUrl,
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
