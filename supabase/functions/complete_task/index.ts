/* eslint-disable */
// @ts-nocheck
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
 */
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { task_id, file_data, filename } = body;
  
  if (!task_id || !file_data || !filename) {
    return new Response("task_id, file_data (base64), and filename required", { status: 400 });
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

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  let callerId: string | null = null;
  let isServiceRole = false;

  // 1) Check if token matches service-role key directly
  if (token === serviceKey) {
    isServiceRole = true;
    console.log("Service role authenticated");
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
          console.log("JWT service role authenticated");
        }
        // Don't extract user ID from JWT - always look it up in user_api_token table
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      console.log("Token format invalid, treating as PAT");
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
        console.error("Token lookup failed");
        return new Response("Invalid or expired token", { status: 403 });
      }

      callerId = data.user_id;
      console.log("Token resolved to user");
    } catch (e) {
      console.error("Error querying user_api_token table");
      return new Response("Token validation failed", { status: 403 });
    }
  }

  try {
    // 4) If user token, verify task ownership
    if (!isServiceRole && callerId) {
      console.log(`Verifying task ${task_id} belongs to user ${callerId}...`);
      
      const { data: taskData, error: taskError } = await supabaseAdmin
        .from("tasks")
        .select("project_id")
        .eq("id", task_id)
        .single();

      if (taskError) {
        console.error("Task lookup error:", taskError);
        return new Response("Task not found", { status: 404 });
      }

      if (taskData.project_id !== callerId) {
        console.error(`Task ${task_id} belongs to ${taskData.project_id}, not ${callerId}`);
        return new Response("Forbidden: Task does not belong to user", { status: 403 });
      }
    }

    // 5) Decode the base64 file data
    const fileBuffer = Uint8Array.from(atob(file_data), c => c.charCodeAt(0));
    
    // 6) Determine the storage path (with user ID prefix for RLS compliance)
    const userId = callerId || 'system'; // Use callerId or 'system' for service role
    const objectPath = `${userId}/${filename}`;
    
    // 7) Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('image_uploads')
      .upload(objectPath, fileBuffer, {
        contentType: getContentType(filename),
        upsert: true
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(`Storage upload failed: ${uploadError.message}`, { status: 500 });
    }

    // 8) Get the public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('image_uploads')
      .getPublicUrl(objectPath);
    
    const publicUrl = urlData.publicUrl;

    // 9) Update the database with the public URL using protected function
    const { data: updateResult, error: dbError } = await supabaseAdmin
      .rpc('complete_task_with_timing', {
        p_task_id: task_id,
        p_output_location: publicUrl
      });

    if (dbError || !updateResult) {
      console.error("Database update error:", dbError);
      // If DB update fails, we should clean up the uploaded file
      await supabaseAdmin.storage.from('image_uploads').remove([objectPath]);
      return new Response(`Database update failed: ${dbError?.message || 'Task not found or not in progress'}`, { status: 500 });
    }

    // 10) Calculate and record task cost after task completion
    try {
      console.log(`Triggering cost calculation for task ${task_id}...`);
      
      const costCalculationResponse = await fetch(`${supabaseUrl}/functions/v1/calculate-task-cost`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task_id })
      });

      if (costCalculationResponse.ok) {
        const costData = await costCalculationResponse.json();
        console.log(`Cost calculation successful: $${(costData.cost / 100).toFixed(2)} for ${costData.duration_seconds}s`);
      } else {
        const errorText = await costCalculationResponse.text();
        console.error(`Cost calculation failed: ${errorText}`);
        // Don't fail the main request, just log the error
      }
    } catch (costError) {
      console.error("Error triggering cost calculation:", costError);
      // Don't fail the main request, just log the error
    }

    // 11) Check if this task completes an orchestrator workflow
    try {
      // Get the task details to check if it's a final task in an orchestrator workflow
      const { data: taskData, error: taskError } = await supabaseAdmin
        .from("tasks")
        .select("task_type, params")
        .eq("id", task_id)
        .single();

      if (!taskError && taskData) {
        const { task_type, params } = taskData;
        
        // Check if this is a final task that should complete an orchestrator
        const isFinalTask = (
          task_type === "travel_stitch" || 
          task_type === "dp_final_gen"
        );

        if (isFinalTask && params?.orchestrator_task_id_ref) {
          console.log(`Task ${task_id} is a final ${task_type} task. Marking orchestrator ${params.orchestrator_task_id_ref} as complete.`);
          
          // Update the orchestrator task to Complete status with the same output location
          const { error: orchError } = await supabaseAdmin
            .from("tasks")
            .update({
              status: "Complete",
              output_location: publicUrl,
              generation_processed_at: new Date().toISOString()
            })
            .eq("id", params.orchestrator_task_id_ref)
            .eq("status", "In Progress"); // Only update if still in progress

          if (orchError) {
            console.error(`Failed to update orchestrator ${params.orchestrator_task_id_ref}:`, orchError);
            // Don't fail the whole request, just log the error
          } else {
            console.log(`Successfully marked orchestrator ${params.orchestrator_task_id_ref} as complete.`);
            
            // Also calculate cost for the orchestrator task in all cases
            try {
              console.log(`Triggering cost calculation for orchestrator task ${params.orchestrator_task_id_ref}...`);
              
              const orchCostResponse = await fetch(`${supabaseUrl}/functions/v1/calculate-task-cost`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${serviceKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ task_id: params.orchestrator_task_id_ref })
              });

              if (orchCostResponse.ok) {
                const orchCostData = await orchCostResponse.json();
                console.log(`Orchestrator cost calculation successful: $${(orchCostData.cost / 100).toFixed(2)} for ${orchCostData.duration_seconds}s`);
              } else {
                const errorText = await orchCostResponse.text();
                console.error(`Orchestrator cost calculation failed: ${errorText}`);
              }
            } catch (orchCostError) {
              console.error("Error triggering orchestrator cost calculation:", orchCostError);
            }
          }
        }
      }
    } catch (orchCheckError) {
      // Don't fail the main request if orchestrator check fails
      console.error("Error checking for orchestrator completion:", orchCheckError);
    }

    console.log(`Successfully completed task ${task_id} by ${isServiceRole ? 'service-role' : `user ${callerId}`}`);

    return new Response(JSON.stringify({ 
      success: true, 
      public_url: publicUrl,
      message: "Task completed and file uploaded successfully" 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(`Internal error: ${error.message}`, { status: 500 });
  }
});

function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    default: return 'application/octet-stream';
  }
} 