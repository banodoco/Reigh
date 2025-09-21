// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Image as ImageScript } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
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
        const thumbnailBuffer = Uint8Array.from(atob(first_frame_data), (c)=>c.charCodeAt(0));
        // Create thumbnail path
        const thumbnailPath = `${userId}/thumbnails/${first_frame_filename}`;
        // Upload thumbnail to storage
        const { data: thumbnailUploadData, error: thumbnailUploadError } = await supabaseAdmin.storage.from('image_uploads').upload(thumbnailPath, thumbnailBuffer, {
          contentType: getContentType(first_frame_filename),
          upsert: true
        });
        if (thumbnailUploadError) {
          console.error("Thumbnail upload error:", thumbnailUploadError);
        // Don't fail the main upload, just log the error
        } else {
          // Get the public URL for the thumbnail
          const { data: thumbnailUrlData } = supabaseAdmin.storage.from('image_uploads').getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbnailUrlData.publicUrl;
          console.log(`[COMPLETE-TASK-DEBUG] Thumbnail uploaded successfully: ${thumbnailUrl}`);
        }
      } catch (thumbnailError) {
        console.error("Error processing thumbnail:", thumbnailError);
      // Don't fail the main upload, just log the error
      }
    }
    // 8.2) If no thumbnail provided and this is an image, auto-generate a thumbnail (1/3 size)
    if (!thumbnailUrl) {
      try {
        const contentType = getContentType(filename);
        console.log(`[ThumbnailGenDebug] Starting thumbnail generation for task ${taskIdString}, filename: ${filename}, contentType: ${contentType}`);

        if (contentType.startsWith("image/")) {
          console.log(`[ThumbnailGenDebug] Processing image for thumbnail generation with ImageScript`);

          // Decode with ImageScript (Deno-native, no DOM/canvas APIs)
          console.log(`[ThumbnailGenDebug] Original file buffer size: ${fileBuffer.length} bytes`);
          const image = await ImageScript.decode(fileBuffer);
          const originalWidth = image.width;
          const originalHeight = image.height;
          console.log(`[ThumbnailGenDebug] Original image dimensions: ${originalWidth}x${originalHeight}`);

          const thumbWidth = Math.max(1, Math.round(originalWidth / 3));
          const thumbHeight = Math.max(1, Math.round(originalHeight / 3));
          console.log(`[ThumbnailGenDebug] Calculated thumbnail dimensions: ${thumbWidth}x${thumbHeight} (1/3 of original)`);

          image.resize(thumbWidth, thumbHeight);
          const jpegQuality = 80;
          const thumbBytes = await image.encodeJPEG(jpegQuality);
          console.log(`[ThumbnailGenDebug] Encoded JPEG thumbnail bytes: ${thumbBytes.length} (quality ${jpegQuality})`);
          console.log(`[ThumbnailGenDebug] Size reduction: ${fileBuffer.length} → ${thumbBytes.length} bytes (${((thumbBytes.length / fileBuffer.length) * 100).toFixed(1)}% of original)`);

          // Upload thumbnail to storage
          const ts = Date.now();
          const rand = Math.random().toString(36).substring(2, 8);
          const thumbFilename = `thumb_${ts}_${rand}.jpg`;
          const thumbPath = `${userId}/thumbnails/${thumbFilename}`;
          console.log(`[ThumbnailGenDebug] Uploading thumbnail to: ${thumbPath}`);

          const { error: autoThumbUploadErr } = await supabaseAdmin.storage
            .from('image_uploads')
            .upload(thumbPath, thumbBytes, { contentType: 'image/jpeg', upsert: true });

          if (autoThumbUploadErr) {
            console.error('[ThumbnailGenDebug] Auto-thumbnail upload error:', autoThumbUploadErr);
          } else {
            const { data: autoThumbUrlData } = supabaseAdmin.storage.from('image_uploads').getPublicUrl(thumbPath);
            thumbnailUrl = autoThumbUrlData.publicUrl;
            console.log(`[ThumbnailGenDebug] ✅ Auto-generated thumbnail uploaded successfully!`);
            console.log(`[ThumbnailGenDebug] Thumbnail URL: ${thumbnailUrl}`);
            console.log(`[ThumbnailGenDebug] Final summary - Original: ${originalWidth}x${originalHeight} (${fileBuffer.length} bytes) → Thumbnail: ${thumbWidth}x${thumbHeight} (${thumbBytes.length} bytes)`);
          }
        } else {
          console.log(`[ThumbnailGenDebug] Skipping auto-thumbnail, content type is not image: ${contentType}`);
        }
      } catch (autoThumbErr) {
        console.error('[ThumbnailGenDebug] Auto-thumbnail generation failed:', autoThumbErr);
        console.error('[ThumbnailGenDebug] Error stack:', autoThumbErr.stack);
        // Fallback: use main image as thumbnail to keep UI consistent
        thumbnailUrl = publicUrl;
        console.log(`[ThumbnailGenDebug] Using fallback - main image URL as thumbnail: ${thumbnailUrl}`);
      }
    }
    // 8.5) Validate shot existence and clean up parameters if necessary
    console.log(`[COMPLETE-TASK-DEBUG] Validating shot references for task ${taskIdString}`);
    try {
      // Get the current task and its task type metadata
      const { data: currentTask, error: taskFetchError } = await supabaseAdmin
        .from("tasks")
        .select(`
          params, 
          task_type,
          task_types!inner(tool_type, category)
        `)
        .eq("id", taskIdString)
        .single();

      if (!taskFetchError && currentTask && currentTask.params) {
        let extractedShotId = null;
        let needsParamsUpdate = false;
        let updatedParams = {
          ...currentTask.params
        };

        const taskTypeInfo = currentTask.task_types;
        const toolType = taskTypeInfo?.tool_type;
        
        console.log(`[COMPLETE-TASK-DEBUG] Task type: ${currentTask.task_type}, tool_type: ${toolType}`);

        // Extract shot_id based on tool_type from task_types table
        if (toolType === 'travel-between-images') {
          // For travel-between-images tasks, try multiple possible locations
          extractedShotId = currentTask.params?.originalParams?.orchestrator_details?.shot_id ||
                            currentTask.params?.orchestrator_details?.shot_id ||
                            currentTask.params?.full_orchestrator_payload?.shot_id;
        } else if (toolType === 'image-generation') {
          // For image generation tasks, shot_id is typically at top level
          extractedShotId = currentTask.params?.shot_id;
        } else {
          // Fallback for other task types - try common locations
          extractedShotId = currentTask.params?.shot_id ||
                            currentTask.params?.orchestrator_details?.shot_id;
        }
        // If there's a shot_id, validate it exists
        if (extractedShotId) {
          console.log(`[COMPLETE-TASK-DEBUG] Checking if shot ${extractedShotId} exists...`);
          // Ensure shotId is properly converted from JSONB to string
          let shotIdString;
          if (typeof extractedShotId === 'string') {
            shotIdString = extractedShotId;
          } else if (typeof extractedShotId === 'object' && extractedShotId !== null) {
            // If it's wrapped in an object, try to extract the actual UUID
            shotIdString = String((extractedShotId as any).id || (extractedShotId as any).uuid || extractedShotId);
          } else {
            shotIdString = String(extractedShotId);
          }
          // Validate UUID format before using in query
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(shotIdString)) {
            console.log(`[COMPLETE-TASK-DEBUG] Invalid UUID format for shot: ${shotIdString}, removing from parameters`);
            needsParamsUpdate = true;
            // Remove invalid shot_id from parameters based on tool_type
            if (toolType === 'travel-between-images') {
              // Clean up all possible locations for travel-between-images tasks
              if (updatedParams.originalParams?.orchestrator_details) {
                delete updatedParams.originalParams.orchestrator_details.shot_id;
              }
              if (updatedParams.orchestrator_details) {
                delete updatedParams.orchestrator_details.shot_id;
              }
              if (updatedParams.full_orchestrator_payload) {
                delete updatedParams.full_orchestrator_payload.shot_id;
              }
            } else if (toolType === 'image-generation') {
              delete updatedParams.shot_id;
            } else {
              // Fallback cleanup for other task types
              delete updatedParams.shot_id;
              if (updatedParams.orchestrator_details) {
                delete updatedParams.orchestrator_details.shot_id;
              }
            }
          } else {
            const { data: shotData, error: shotError } = await supabaseAdmin.from("shots").select("id").eq("id", shotIdString).single();
            if (shotError || !shotData) {
              console.log(`[COMPLETE-TASK-DEBUG] Shot ${shotIdString} does not exist (error: ${shotError?.message || 'not found'}), removing from task parameters`);
              needsParamsUpdate = true;
              // Remove shot_id from parameters based on tool_type
              if (toolType === 'travel-between-images') {
                // Clean up all possible locations for travel-between-images tasks
                if (updatedParams.originalParams?.orchestrator_details) {
                  delete updatedParams.originalParams.orchestrator_details.shot_id;
                }
                if (updatedParams.orchestrator_details) {
                  delete updatedParams.orchestrator_details.shot_id;
                }
                if (updatedParams.full_orchestrator_payload) {
                  delete updatedParams.full_orchestrator_payload.shot_id;
                }
              } else if (toolType === 'image-generation') {
                delete updatedParams.shot_id;
              } else {
                // Fallback cleanup for other task types
                delete updatedParams.shot_id;
                if (updatedParams.orchestrator_details) {
                  delete updatedParams.orchestrator_details.shot_id;
                }
              }
            } else {
              console.log(`[COMPLETE-TASK-DEBUG] Shot ${shotIdString} exists and is valid`);
            }
          }
        }
        // Add thumbnail URL to task parameters if available
        if (thumbnailUrl) {
          console.log(`[COMPLETE-TASK-DEBUG] Adding thumbnail_url to task parameters: ${thumbnailUrl}`);
          needsParamsUpdate = true;
          
          // Handle thumbnail URL based on task type and existing parameter structure
          if (currentTask.task_type === 'travel_stitch') {
            // For travel_stitch tasks, add to full_orchestrator_payload.thumbnail_url
            if (!updatedParams.full_orchestrator_payload) {
              updatedParams.full_orchestrator_payload = {};
            }
            updatedParams.full_orchestrator_payload.thumbnail_url = thumbnailUrl;
            // Hardcode accelerated to false for all travel_stitch tasks
            updatedParams.full_orchestrator_payload.accelerated = false;
          } else if (currentTask.task_type === 'wan_2_2_i2v') {
            // For wan_2_2_i2v tasks, add to orchestrator_details.thumbnail_url
            if (!updatedParams.orchestrator_details) {
              updatedParams.orchestrator_details = {};
            }
            updatedParams.orchestrator_details.thumbnail_url = thumbnailUrl;
          } else if (currentTask.task_type === 'single_image') {
            // For single_image tasks, add to thumbnail_url
            updatedParams.thumbnail_url = thumbnailUrl;
          } else {
            // For any other task type, add thumbnail_url at the top level
            // This ensures we don't miss any task types that might need thumbnails
            updatedParams.thumbnail_url = thumbnailUrl;
            console.log(`[COMPLETE-TASK-DEBUG] Added thumbnail_url for task type '${currentTask.task_type}' at top level`);
          }
        }
        // Update task parameters if needed (before marking as complete)
        if (needsParamsUpdate) {
          console.log(`[COMPLETE-TASK-DEBUG] Updating task parameters${thumbnailUrl ? ' with thumbnail_url' : ' to remove invalid shot reference'}`);
          const { error: paramsUpdateError } = await supabaseAdmin.from("tasks").update({
            params: updatedParams
          }).eq("id", taskIdString);
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
        const { data: currentTask, error: taskFetchError } = await supabaseAdmin.from("tasks").select("params, task_type").eq("id", taskIdString).single();
        if (!taskFetchError && currentTask) {
          let updatedParams = {
            ...currentTask.params || {}
          };
          let shouldUpdate = false;
          if (currentTask.task_type === 'travel_stitch') {
            if (!updatedParams.full_orchestrator_payload) {
              updatedParams.full_orchestrator_payload = {};
            }
            if (!updatedParams.full_orchestrator_payload.thumbnail_url) {
              updatedParams.full_orchestrator_payload.thumbnail_url = thumbnailUrl;
              shouldUpdate = true;
            }
            // Always hardcode accelerated to false for travel_stitch tasks
            if (updatedParams.full_orchestrator_payload.accelerated !== false) {
              updatedParams.full_orchestrator_payload.accelerated = false;
              shouldUpdate = true;
            }
          } else if (currentTask.task_type === 'wan_2_2_i2v') {
            if (!updatedParams.orchestrator_details) {
              updatedParams.orchestrator_details = {};
            }
            if (!updatedParams.orchestrator_details.thumbnail_url) {
              updatedParams.orchestrator_details.thumbnail_url = thumbnailUrl;
              shouldUpdate = true;
            }
          } else if (currentTask.task_type === 'single_image') {
            if (!updatedParams.thumbnail_url) {
              updatedParams.thumbnail_url = thumbnailUrl;
              shouldUpdate = true;
            }
          } else {
            // For any other task type, add thumbnail_url at the top level if not already present
            if (!updatedParams.thumbnail_url) {
              updatedParams.thumbnail_url = thumbnailUrl;
              shouldUpdate = true;
              console.log(`[COMPLETE-TASK-DEBUG] Fallback: Added thumbnail_url for task type '${currentTask.task_type}' at top level`);
            }
          }
          if (shouldUpdate) {
            const { error: thumbnailUpdateError } = await supabaseAdmin.from("tasks").update({
              params: updatedParams
            }).eq("id", taskIdString);
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
    // 9) Create generation FIRST (so realtime fires when generation is ready)
    const CREATE_GENERATION_IN_EDGE = Deno.env.get("CREATE_GENERATION_IN_EDGE") !== "false"; // Default ON
    if (CREATE_GENERATION_IN_EDGE) {
      console.log(`[GenMigration] Checking if task ${taskIdString} should create generation before completion...`);
      // Fetch task metadata first, then lookup task_types separately (no FK relationship exists)
      const { data: taskData, error: taskError } = await supabaseAdmin
        .from("tasks")
        .select("id, task_type, project_id, params")
        .eq("id", taskIdString)
        .single();
      
      if (taskError || !taskData) {
        console.error(`[GenMigration] Failed to fetch task:`, taskError);
        return;
      }
      
      // Lookup task_types separately
      const { data: taskTypeData, error: taskTypeError } = await supabaseAdmin
        .from("task_types")
        .select("category, tool_type")
        .eq("name", taskData.task_type)
        .single();

      if (taskTypeError || !taskTypeData) {
        console.error(`[GenMigration] Failed to fetch task_types metadata:`, taskTypeError);
      } else {
        const taskCategory = taskTypeData.category;
        const toolType = taskTypeData.tool_type;
        console.log(`[GenMigration] Task ${taskIdString} has category: ${taskCategory}, tool_type: ${toolType}`);

        if (taskCategory === 'generation') {
          console.log(`[GenMigration] Creating generation for task ${taskIdString} before marking Complete...`);
          const combinedTaskData = {
            ...taskData,
            tool_type: toolType
          };
          try {
            await createGenerationFromTask(
              supabaseAdmin,
              taskIdString,
              combinedTaskData,
              publicUrl,
              thumbnailUrl || undefined
            );
          } catch (genError) {
            console.error(`[GenMigration] Error creating generation for task ${taskIdString}:`, genError);
            // Fail the request to keep atomic semantics
            return new Response(`Generation creation failed: ${genError.message}`, { status: 500 });
          }
        } else {
          console.log(`[GenMigration] Skipping generation creation for task ${taskIdString} - category is '${taskCategory}', not 'generation'`);
        }
      }
    } else {
      console.log(`[GenMigration] Generation creation disabled via CREATE_GENERATION_IN_EDGE=false`);
    }

    // 10) Update the database with the public URL and mark Complete
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

    // 11) Calculate and record task cost (only for service role)
    if (isServiceRole) {
      try {
        console.log(`[COMPLETE-TASK-DEBUG] Triggering cost calculation for task ${taskIdString}...`);
        const costCalcResp = await fetch(`${supabaseUrl}/functions/v1/calculate-task-cost`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            task_id: taskIdString
          })
        });
        if (costCalcResp.ok) {
          const costData = await costCalcResp.json();
          console.log(`[COMPLETE-TASK-DEBUG] Cost calculation successful: $${costData.cost.toFixed(3)} for ${costData.duration_seconds}s (task_type: ${costData.task_type}, billing_type: ${costData.billing_type})`);
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
          // Ensure orchestrator_task_id_ref is properly extracted as a string from JSONB
          let orchestratorIdString;
          if (typeof params.orchestrator_task_id_ref === 'string') {
            orchestratorIdString = params.orchestrator_task_id_ref;
          } else if (typeof params.orchestrator_task_id_ref === 'object' && params.orchestrator_task_id_ref !== null) {
            // If it's wrapped in an object, try to extract the actual UUID
            orchestratorIdString = String(params.orchestrator_task_id_ref.id || params.orchestrator_task_id_ref.uuid || params.orchestrator_task_id_ref);
          } else {
            orchestratorIdString = String(params.orchestrator_task_id_ref);
          }
          console.log(`[COMPLETE-TASK-DEBUG] Orchestrator ID string: ${orchestratorIdString}, type: ${typeof orchestratorIdString}, original type: ${typeof params.orchestrator_task_id_ref}`);
          // Validate UUID format before using in query
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(orchestratorIdString)) {
            console.error(`[COMPLETE-TASK-DEBUG] Invalid UUID format for orchestrator: ${orchestratorIdString}`);
          // Don't attempt the update with invalid UUID
          } else {
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
// ===== GENERATION HELPER FUNCTIONS =====

/**
 * Extract shot_id and add_in_position from task params
 * Supports multiple param shapes as per current DB trigger logic
 */
function extractShotAndPosition(params: any): { shotId?: string, addInPosition: boolean } {
  let shotId: string | undefined;
  let addInPosition = false; // Default: unpositioned

  try {
    // PRIORITY 1: Check originalParams.orchestrator_details.shot_id (MOST COMMON for wan_2_2_i2v)
    if (params?.originalParams?.orchestrator_details?.shot_id) {
      shotId = String(params.originalParams.orchestrator_details.shot_id);
      console.log(`[GenMigration] Found shot_id in originalParams.orchestrator_details: ${shotId}`);
    }
    // PRIORITY 2: Check direct orchestrator_details.shot_id
    else if (params?.orchestrator_details?.shot_id) {
      shotId = String(params.orchestrator_details.shot_id);
      console.log(`[GenMigration] Found shot_id in orchestrator_details: ${shotId}`);
    }
    // PRIORITY 3: Check direct shot_id field
    else if (params?.shot_id) {
      shotId = String(params.shot_id);
      console.log(`[GenMigration] Found shot_id in params: ${shotId}`);
    }
    // PRIORITY 4: Check full_orchestrator_payload.shot_id (for travel_stitch)
    else if (params?.full_orchestrator_payload?.shot_id) {
      shotId = String(params.full_orchestrator_payload.shot_id);
      console.log(`[GenMigration] Found shot_id in full_orchestrator_payload: ${shotId}`);
    }
    // PRIORITY 5: Check shotId field (camelCase variant)
    else if (params?.shotId) {
      shotId = String(params.shotId);
      console.log(`[GenMigration] Found shotId in params: ${shotId}`);
    }
    else {
      console.log(`[GenMigration] No shot_id found in task params - generation will not be linked to shot`);
    }

    // Extract add_in_position flag from multiple locations
    if (params?.add_in_position !== undefined) {
      addInPosition = Boolean(params.add_in_position);
    } else if (params?.originalParams?.add_in_position !== undefined) {
      addInPosition = Boolean(params.originalParams.add_in_position);
    } else if (params?.orchestrator_details?.add_in_position !== undefined) {
      addInPosition = Boolean(params.orchestrator_details.add_in_position);
    } else if (params?.originalParams?.orchestrator_details?.add_in_position !== undefined) {
      addInPosition = Boolean(params.originalParams.orchestrator_details.add_in_position);
    }

    console.log(`[GenMigration] Extracted add_in_position: ${addInPosition}`);
  } catch (error) {
    console.error(`[GenMigration] Error extracting shot/position:`, error);
  }

  return { shotId, addInPosition };
}

/**
 * Determine generation type from tool_type
 */
function determineGenerationType(toolType: string): 'image' | 'video' {
  if (toolType === 'image-generation' || toolType === 'magic-edit') {
    return 'image';
  } else if (toolType === 'travel-between-images' || toolType === 'edit-travel') {
    return 'video';
  } else {
    return 'image'; // Default to image for unknown tool types
  }
}

/**
 * Build generation params starting from normalized task params
 */
function buildGenerationParams(baseParams: any, toolType: string, shotId?: string, thumbnailUrl?: string): any {
  let generationParams = { ...baseParams };
  
  // Add tool_type to the params JSONB
  generationParams.tool_type = toolType;
  
  // Add shot_id if present and valid
  if (shotId) {
    generationParams.shotId = shotId;
  }
  
  // Add thumbnail_url to params if available
  if (thumbnailUrl) {
    generationParams.thumbnailUrl = thumbnailUrl;
  }
  
  return generationParams;
}

/**
 * Check for existing generation referencing this task_id
 */
async function findExistingGeneration(supabase: any, taskId: string): Promise<any | null> {
  try {
    // Use JSONB contains operator with proper JSON array syntax
    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .contains('tasks', JSON.stringify([taskId]))
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error(`[GenMigration] Error finding existing generation:`, error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`[GenMigration] Exception finding existing generation:`, error);
    return null;
  }
}

/**
 * Insert generation record
 */
async function insertGeneration(supabase: any, record: any): Promise<any> {
  const { data, error } = await supabase
    .from('generations')
    .insert(record)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to insert generation: ${error.message}`);
  }
  
  return data;
}

/**
 * Link generation to shot using the existing RPC
 */
async function linkGenerationToShot(supabase: any, shotId: string, generationId: string, addInPosition: boolean): Promise<void> {
  try {
    const { error } = await supabase.rpc('add_generation_to_shot', {
      p_shot_id: shotId,
      p_generation_id: generationId,
      p_with_position: addInPosition
    });
    
    if (error) {
      console.error(`[ShotLink] Failed to link generation ${generationId} to shot ${shotId}:`, error);
      // Don't throw - match current DB behavior (log and continue)
    } else {
      console.log(`[ShotLink] Successfully linked generation ${generationId} to shot ${shotId} with add_in_position=${addInPosition}`);
    }
  } catch (error) {
    console.error(`[ShotLink] Exception linking generation to shot:`, error);
    // Don't throw - match current DB behavior
  }
}

/**
 * Main function to create generation from completed task
 * This replicates the logic from create_generation_on_task_complete() trigger
 */
async function createGenerationFromTask(
  supabase: any, 
  taskId: string, 
  taskData: any, 
  publicUrl: string, 
  thumbnailUrl: string | null | undefined
): Promise<any> {
  console.log(`[GenMigration] Starting generation creation for task ${taskId}`);
  
  try {
    // Check if generation already exists (idempotency)
    const existingGeneration = await findExistingGeneration(supabase, taskId);
    if (existingGeneration) {
      console.log(`[GenMigration] Generation already exists for task ${taskId}: ${existingGeneration.id}`);
      
      // Ensure shot link if needed
      const { shotId, addInPosition } = extractShotAndPosition(taskData.params);
      if (shotId) {
        await linkGenerationToShot(supabase, shotId, existingGeneration.id, addInPosition);
      }
      
      // Ensure generation_created flag is set
      await supabase
        .from('tasks')
        .update({ generation_created: true })
        .eq('id', taskId);
      
      return existingGeneration;
    }
    
    // Extract shot information
    const { shotId, addInPosition } = extractShotAndPosition(taskData.params);
    
    // Validate shot exists if shotId is provided
    if (shotId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(shotId)) {
        console.log(`[GenMigration] Invalid UUID format for shot: ${shotId}, proceeding without shot link`);
        // Continue without shot linking
      } else {
        const { data: shotData, error: shotError } = await supabase
          .from('shots')
          .select('id')
          .eq('id', shotId)
          .single();
        
        if (shotError || !shotData) {
          console.log(`[GenMigration] Shot ${shotId} does not exist, proceeding without shot link`);
          // Continue without shot linking - don't fail the generation
        }
      }
    }
    
    // Determine generation type
    const generationType = determineGenerationType(taskData.tool_type);
    
    // Build generation params
    const generationParams = buildGenerationParams(
      taskData.params, 
      taskData.tool_type, 
      shotId, 
      thumbnailUrl
    );
    
    // Generate new UUID for generation
    const newGenerationId = crypto.randomUUID();
    
    // Insert generation record
    const generationRecord = {
      id: newGenerationId,
      tasks: [taskId], // Store as array
      params: generationParams,
      location: publicUrl,
      type: generationType,
      project_id: taskData.project_id,
      thumbnail_url: thumbnailUrl,
      created_at: new Date().toISOString()
    };
    
    const newGeneration = await insertGeneration(supabase, generationRecord);
    console.log(`[GenMigration] Created generation ${newGeneration.id} for task ${taskId}`);
    
    // Link to shot if applicable
    if (shotId) {
      await linkGenerationToShot(supabase, shotId, newGeneration.id, addInPosition);
    }
    
    // Mark task as having created a generation
    await supabase
      .from('tasks')
      .update({ generation_created: true })
      .eq('id', taskId);
    
    console.log(`[GenMigration] Successfully completed generation creation for task ${taskId}`);
    return newGeneration;
    
  } catch (error) {
    console.error(`[GenMigration] Error creating generation for task ${taskId}:`, error);
    throw error;
  }
}

// ===== UTILITY FUNCTIONS =====

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
