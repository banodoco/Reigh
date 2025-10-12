// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
// @ts-ignore
import { Image as ImageScript } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { authenticateRequest, verifyTaskOwnership, getTaskUserId } from "../_shared/auth.ts";
// Provide a loose Deno type for local tooling; real type comes at runtime in Edge Functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: complete-task
 * 
 * Completes a task by uploading file data and updating task status.
 * - Service-role key: can complete any task
 * - User token: can only complete tasks they own
 * 
 * POST /functions/v1/complete-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * 
 * SUPPORTS THREE MODES:
 * 
 * MODE 1 (LEGACY - JSON with base64): 
 *   Content-Type: application/json
 *   Body: { 
 *     task_id, 
 *     file_data: "base64...", 
 *     filename: "image.png",
 *     first_frame_data?: "base64...",
 *     first_frame_filename?: "thumb.png"
 *   }
 *   Memory: High (base64 + decoded buffer)
 * 
 * MODE 2 (STREAMING - multipart/form-data):
 *   Content-Type: multipart/form-data
 *   Fields:
 *     - task_id: string
 *     - file: File (the main file to upload)
 *     - first_frame?: File (optional thumbnail)
 *   Memory: Medium (single file buffer)
 * 
 * MODE 3 (PRE-SIGNED URL - Zero Memory):
 *   Content-Type: application/json
 *   Body: {
 *     task_id,
 *     storage_path: "user_id/filename.mp4",  // From generate-upload-url
 *     thumbnail_storage_path?: "user_id/thumbnails/thumb.jpg"  // Optional
 *   }
 *   Memory: Minimal (file already uploaded to storage)
 *   Use this for large files (>100MB) - call generate-upload-url first
 * 
 * TOOL TYPE ASSIGNMENT:
 * 1. Default: Uses tool_type from task_types table based on task_type
 * 2. Override: If task.params.tool_type is set and matches a valid tool_type, uses that instead
 * 3. Valid tool types: image-generation, travel-between-images, magic-edit, edit-travel, etc.
 * 
 * Returns:
 * - 200 OK with success data
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not authorized
 * - 500 Internal Server Error
 */ 
serve(async (req)=>{
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405
    });
  }

  // Determine content type to choose processing mode
  const contentType = req.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");

  let task_id: string | undefined;
  let filename: string | undefined;
  let fileUploadBody: Blob | Uint8Array | undefined;
  let first_frame_filename: string | undefined;
  let firstFrameUploadBody: Blob | Uint8Array | undefined;
  let fileContentType: string | undefined;
  let firstFrameContentType: string | undefined;
  let storagePathProvided: string | undefined; // MODE 3: pre-uploaded file
  let thumbnailPathProvided: string | undefined;

  if (isMultipart) {
    // MODE 2: Multipart upload (better than base64, but still buffers file)
    console.log(`[COMPLETE-TASK-DEBUG] Processing multipart/form-data request`);
    
    try {
      const formData = await req.formData();
      
      // Extract task_id
      const taskIdField = formData.get('task_id');
      if (!taskIdField) {
        return new Response("task_id field required", { status: 400 });
      }
      task_id = String(taskIdField);
      console.log(`[COMPLETE-TASK-DEBUG] Extracted task_id: ${task_id}`);

      // Extract main file
      const mainFile = formData.get('file');
      if (!(mainFile instanceof File)) {
        return new Response("file field required and must be a File", { status: 400 });
      }

      filename = mainFile.name || "upload";
      fileContentType = mainFile.type || undefined;
      
      // Convert File to Uint8Array for upload
      const arrayBuffer = await mainFile.arrayBuffer();
      fileUploadBody = new Uint8Array(arrayBuffer);
      
      console.log(`[COMPLETE-TASK-DEBUG] Multipart upload - file: ${filename}, size: ${fileUploadBody.length} bytes, type: ${fileContentType}`);

      // Extract optional thumbnail
      const thumbnailField = formData.get('first_frame');
      if (thumbnailField instanceof File) {
        first_frame_filename = thumbnailField.name;
        firstFrameContentType = thumbnailField.type || undefined;
        const thumbArrayBuffer = await thumbnailField.arrayBuffer();
        firstFrameUploadBody = new Uint8Array(thumbArrayBuffer);
        console.log(`[COMPLETE-TASK-DEBUG] Multipart upload - thumbnail: ${first_frame_filename}, size: ${firstFrameUploadBody.length} bytes, type: ${firstFrameContentType}`);
      }

    } catch (e) {
      console.error("[COMPLETE-TASK-DEBUG] Multipart parsing error:", e);
      return new Response(`Failed to parse multipart data: ${e.message}`, { status: 400 });
    }

  } else {
    // JSON mode: could be MODE 1 (base64) or MODE 3 (pre-signed URL)
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response("Invalid JSON body", {
      status: 400
    });
  }

    const { 
      task_id: bodyTaskId, 
      file_data, 
      filename: bodyFilename, 
      first_frame_data, 
      first_frame_filename: bodyFirstFrameFilename,
      storage_path,  // MODE 3
      thumbnail_storage_path  // MODE 3
    } = body;
    
    console.log(`[COMPLETE-TASK-DEBUG] Received JSON request with task_id: ${bodyTaskId}`);
  console.log(`[COMPLETE-TASK-DEBUG] Body keys: ${Object.keys(body)}`);
    
    task_id = bodyTaskId;

    // Check if this is MODE 3 (pre-signed URL upload)
    if (storage_path) {
      console.log(`[COMPLETE-TASK-DEBUG] MODE 3: Pre-signed URL - file already uploaded to: ${storage_path}`);
      
      if (!task_id) {
        return new Response("task_id required", { status: 400 });
      }
      
      // SECURITY: Validate that storage_path contains the correct task_id
      // Expected format: userId/tasks/{task_id}/filename or userId/tasks/{task_id}/thumbnails/filename
      const pathParts = storage_path.split('/');
      if (pathParts.length < 4 || pathParts[1] !== 'tasks') {
        return new Response("Invalid storage_path format. Must be generated from generate-upload-url endpoint.", { status: 400 });
      }
      
      const pathTaskId = pathParts[2];
      if (pathTaskId !== task_id) {
        console.error(`[COMPLETE-TASK-DEBUG] Security violation: storage_path task_id (${pathTaskId}) doesn't match request task_id (${task_id})`);
        return new Response("storage_path does not match task_id. Files must be uploaded for the correct task.", { status: 403 });
      }
      
      console.log(`[COMPLETE-TASK-DEBUG] MODE 3: Validated storage_path contains correct task_id: ${pathTaskId}`);
      
      // Validate thumbnail path if provided
      if (thumbnail_storage_path) {
        const thumbParts = thumbnail_storage_path.split('/');
        if (thumbParts.length < 4 || thumbParts[1] !== 'tasks') {
          return new Response("Invalid thumbnail_storage_path format.", { status: 400 });
        }
        const thumbTaskId = thumbParts[2];
        if (thumbTaskId !== task_id) {
          console.error(`[COMPLETE-TASK-DEBUG] Security violation: thumbnail task_id (${thumbTaskId}) doesn't match request task_id (${task_id})`);
          return new Response("thumbnail_storage_path does not match task_id.", { status: 403 });
        }
      }
      
      storagePathProvided = storage_path;
      thumbnailPathProvided = thumbnail_storage_path;
      
      // Extract filename from storage path
      filename = pathParts[pathParts.length - 1];
      
      // Skip to authorization - no file upload needed
    } else {
      // MODE 1: Legacy base64 upload
      console.log(`[COMPLETE-TASK-DEBUG] MODE 1: Processing JSON request with base64 data`);
      
      if (!bodyTaskId || !file_data || !bodyFilename) {
        return new Response("task_id, file_data (base64), and filename required (or use storage_path for pre-uploaded files)", {
      status: 400
    });
  }

  // Validate thumbnail parameters if provided
      if (first_frame_data && !bodyFirstFrameFilename) {
    return new Response("first_frame_filename required when first_frame_data is provided", {
      status: 400
    });
  }
      if (bodyFirstFrameFilename && !first_frame_data) {
    return new Response("first_frame_data required when first_frame_filename is provided", {
      status: 400
    });
  }

      task_id = bodyTaskId;
      filename = bodyFilename;

      // Decode base64 file data
      try {
        console.log(`[COMPLETE-TASK-DEBUG] Decoding base64 file data (length: ${file_data.length} chars)`);
        const fileBuffer = Uint8Array.from(atob(file_data), (c)=>c.charCodeAt(0));
        fileUploadBody = fileBuffer;
        fileContentType = getContentType(filename);
        console.log(`[COMPLETE-TASK-DEBUG] Decoded file buffer size: ${fileBuffer.length} bytes`);
      } catch (e) {
        console.error("[COMPLETE-TASK-DEBUG] Base64 decode error:", e);
        return new Response("Invalid base64 file_data", { status: 400 });
      }

      // Decode thumbnail if provided
      if (first_frame_data && bodyFirstFrameFilename) {
        try {
          console.log(`[COMPLETE-TASK-DEBUG] Decoding base64 thumbnail data`);
          const thumbBuffer = Uint8Array.from(atob(first_frame_data), (c)=>c.charCodeAt(0));
          first_frame_filename = bodyFirstFrameFilename;
          firstFrameUploadBody = thumbBuffer;
          firstFrameContentType = getContentType(first_frame_filename);
          console.log(`[COMPLETE-TASK-DEBUG] Decoded thumbnail buffer size: ${thumbBuffer.length} bytes`);
        } catch (e) {
          console.error("[COMPLETE-TASK-DEBUG] Thumbnail base64 decode error:", e);
          // Continue without thumbnail
        }
      }
    }
  }

  // Convert task_id to string early to avoid UUID casting issues
  const taskIdString = String(task_id);
  console.log(`[COMPLETE-TASK-DEBUG] Converted task_id to string: ${taskIdString}`);
  
  // Get environment variables
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
  
  // Authenticate request using shared utility
  const auth = await authenticateRequest(req, supabaseAdmin, "[COMPLETE-TASK-DEBUG]");
  
  if (!auth.success) {
    return new Response(auth.error || "Authentication failed", { 
      status: auth.statusCode || 403 
    });
  }

  const isServiceRole = auth.isServiceRole;
  const callerId = auth.userId;

  try {
    // Verify task ownership if user token
    if (!isServiceRole && callerId) {
      const ownershipResult = await verifyTaskOwnership(
        supabaseAdmin, 
        taskIdString, 
        callerId, 
        "[COMPLETE-TASK-DEBUG]"
      );
      
      if (!ownershipResult.success) {
        return new Response(ownershipResult.error || "Forbidden", { 
          status: ownershipResult.statusCode || 403 
        });
      }
    }
    // 5) Prepare for storage operations
    let publicUrl: string;
    let objectPath: string;
    
    // MODE 3: File already uploaded via pre-signed URL
    if (storagePathProvided) {
      console.log(`[COMPLETE-TASK-DEBUG] MODE 3: Using pre-uploaded file at ${storagePathProvided}`);
      objectPath = storagePathProvided;
      
      // Just get the public URL - file is already in storage
      const { data: urlData } = supabaseAdmin.storage.from('image_uploads').getPublicUrl(objectPath);
      publicUrl = urlData.publicUrl;
      console.log(`[COMPLETE-TASK-DEBUG] MODE 3: Retrieved public URL: ${publicUrl}`);
    } else {
      // MODE 1 & 2: Need to upload file
      const effectiveContentType = fileContentType || getContentType(filename);
      console.log(`[COMPLETE-TASK-DEBUG] Upload body ready. filename=${filename}, contentType=${effectiveContentType}`);
      
    // 6) Determine the storage path
    let userId;
    if (isServiceRole) {
        // For service role, look up task owner using shared utility
        const taskUserResult = await getTaskUserId(supabaseAdmin, taskIdString, "[COMPLETE-TASK-DEBUG]");
        
        if (taskUserResult.error) {
          return new Response(taskUserResult.error, { 
            status: taskUserResult.statusCode || 404 
          });
        }
        
        userId = taskUserResult.userId;
        console.log(`[COMPLETE-TASK-DEBUG] Service role storing file for task ${taskIdString} in user ${userId}'s folder`);
    } else {
      // For user tokens, use the authenticated user's ID
      userId = callerId;
    }
      objectPath = `${userId}/${filename}`;
      
    // 7) Upload to Supabase Storage
      console.log(`[COMPLETE-TASK-DEBUG] Uploading to storage: ${objectPath}`);
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage.from('image_uploads').upload(objectPath, fileUploadBody as any, {
        contentType: effectiveContentType,
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
      publicUrl = urlData.publicUrl;
      console.log(`[COMPLETE-TASK-DEBUG] Upload successful: ${publicUrl}`);
    }
    // 8.1) Handle thumbnail
    let thumbnailUrl: string | null = null;
    
    // MODE 3: Thumbnail already uploaded
    if (thumbnailPathProvided) {
      console.log(`[COMPLETE-TASK-DEBUG] MODE 3: Using pre-uploaded thumbnail at ${thumbnailPathProvided}`);
      const { data: thumbnailUrlData } = supabaseAdmin.storage.from('image_uploads').getPublicUrl(thumbnailPathProvided);
      thumbnailUrl = thumbnailUrlData.publicUrl;
      console.log(`[COMPLETE-TASK-DEBUG] MODE 3: Retrieved thumbnail URL: ${thumbnailUrl}`);
    } else if (firstFrameUploadBody && first_frame_filename) {
      // MODE 1 & 2: Upload thumbnail
      console.log(`[COMPLETE-TASK-DEBUG] Uploading thumbnail for task ${taskIdString}`);
      try {
        // Need userId - get it from objectPath if MODE 3, otherwise it's already set
        let userId;
        if (storagePathProvided) {
          // Extract userId from the objectPath (format: userId/filename)
          userId = objectPath.split('/')[0];
        } else {
          // userId is already set from earlier
          const pathParts = objectPath.split('/');
          userId = pathParts[0];
        }
        
        // Create thumbnail path
        const thumbnailPath = `${userId}/thumbnails/${first_frame_filename}`;
        // Upload thumbnail to storage (buffer already prepared earlier)
        const { data: thumbnailUploadData, error: thumbnailUploadError } = await supabaseAdmin.storage.from('image_uploads').upload(thumbnailPath, firstFrameUploadBody as any, {
          contentType: firstFrameContentType || getContentType(first_frame_filename),
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
    // Skip for MODE 3 since we don't have the file in memory
    if (!thumbnailUrl && !storagePathProvided) {
      try {
        const contentType = getContentType(filename);
        console.log(`[ThumbnailGenDebug] Starting thumbnail generation for task ${taskIdString}, filename: ${filename}, contentType: ${contentType}`);

        if (contentType.startsWith("image/")) {
          console.log(`[ThumbnailGenDebug] Processing image for thumbnail generation with ImageScript`);

          // Decode with ImageScript (Deno-native, no DOM/canvas APIs)
          let sourceBytes: Uint8Array;
          if (fileUploadBody instanceof Uint8Array) {
            sourceBytes = fileUploadBody;
            console.log(`[ThumbnailGenDebug] Using Uint8Array source, size: ${sourceBytes.length} bytes`);
          } else if (typeof (fileUploadBody as any).arrayBuffer === 'function') {
            const ab = await (fileUploadBody as Blob).arrayBuffer();
            sourceBytes = new Uint8Array(ab);
            console.log(`[ThumbnailGenDebug] Converted Blob to Uint8Array, size: ${sourceBytes.length} bytes`);
          } else {
            throw new Error('Unsupported upload body type for thumbnail generation');
          }

          const image = await ImageScript.decode(sourceBytes);
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
          console.log(`[ThumbnailGenDebug] Size reduction: ${sourceBytes.length} → ${thumbBytes.length} bytes (${((thumbBytes.length / sourceBytes.length) * 100).toFixed(1)}% of original)`);

          // Upload thumbnail to storage
          // Extract userId from objectPath (format: userId/filename)
          const userId = objectPath.split('/')[0];
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
            console.log(`[ThumbnailGenDebug] Final summary - Original: ${originalWidth}x${originalHeight} (${sourceBytes.length} bytes) → Thumbnail: ${thumbWidth}x${thumbHeight} (${thumbBytes.length} bytes)`);
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
      
      // Resolve tool_type with potential override from params
      const toolTypeInfo = await resolveToolType(supabaseAdmin, taskData.task_type, taskData.params);
      
      if (!toolTypeInfo) {
        console.error(`[GenMigration] Failed to resolve tool_type for task ${taskIdString}`);
      } else {
        const { toolType, category: taskCategory, contentType } = toolTypeInfo;
        console.log(`[GenMigration] Task ${taskIdString} resolved to category: ${taskCategory}, tool_type: ${toolType}, content_type: ${contentType}`);

        if (taskCategory === 'generation') {
          console.log(`[GenMigration] Creating generation for task ${taskIdString} before marking Complete...`);
          const combinedTaskData = {
            ...taskData,
            tool_type: toolType,
            content_type: contentType
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
          if (costData && typeof costData.cost === 'number') {
            console.log(`[COMPLETE-TASK-DEBUG] Cost calculation successful: $${costData.cost.toFixed(3)} for ${costData.duration_seconds}s (task_type: ${costData.task_type}, billing_type: ${costData.billing_type})`);
          } else {
            console.log(`[COMPLETE-TASK-DEBUG] Cost calculation returned unexpected data:`, costData);
          }
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
 * Resolve the final tool_type for a task, considering both default mapping and potential overrides
 * @param supabase - Supabase client
 * @param taskType - The task type (e.g., 'single_image', 'wan_2_2_i2v')
 * @param taskParams - Task parameters that might contain tool_type override
 * @returns Object with resolved tool_type, category, and content_type, or null if task type not found
 */
async function resolveToolType(supabase: any, taskType: string, taskParams: any): Promise<{
  toolType: string;
  category: string;
  contentType: 'image' | 'video';
} | null> {
  // Get default tool_type from task_types table
  const { data: taskTypeData, error: taskTypeError } = await supabase
    .from("task_types")
    .select("category, tool_type, content_type")
    .eq("name", taskType)
    .single();

  if (taskTypeError || !taskTypeData) {
    console.error(`[ToolTypeResolver] Failed to fetch task_types metadata for '${taskType}':`, taskTypeError);
    return null;
  }

  let finalToolType = taskTypeData.tool_type;
  let finalContentType = taskTypeData.content_type || 'image'; // Default to image if not set
  const category = taskTypeData.category;

  // Check for tool_type override in params
  const paramsToolType = taskParams?.tool_type;
  if (paramsToolType) {
    console.log(`[ToolTypeResolver] Found tool_type override in params: ${paramsToolType}`);
    
    // Validate that the override tool_type is a known valid tool type
    const { data: validToolTypes } = await supabase
      .from("task_types")
      .select("tool_type, content_type")
      .not("tool_type", "is", null)
      .eq("is_active", true);
    
    const validToolTypeSet = new Set(validToolTypes?.map(t => t.tool_type) || []);
    
    if (validToolTypeSet.has(paramsToolType)) {
      console.log(`[ToolTypeResolver] Using tool_type override: ${paramsToolType} (was: ${finalToolType})`);
      finalToolType = paramsToolType;
      
      // Update content_type based on the override tool_type
      const overrideToolTypeData = validToolTypes?.find(t => t.tool_type === paramsToolType);
      if (overrideToolTypeData?.content_type) {
        finalContentType = overrideToolTypeData.content_type;
        console.log(`[ToolTypeResolver] Using content_type from override: ${finalContentType}`);
      }
    } else {
      console.log(`[ToolTypeResolver] Invalid tool_type override '${paramsToolType}', using default: ${finalToolType}`);
      console.log(`[ToolTypeResolver] Valid tool types: ${Array.from(validToolTypeSet).join(', ')}`);
    }
  }

  return {
    toolType: finalToolType,
    category,
    contentType: finalContentType
  };
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
 * Find source generation by image URL (for magic edit tracking)
 * Returns the generation ID if found, null otherwise
 */
async function findSourceGenerationByImageUrl(supabase: any, imageUrl: string): Promise<string | null> {
  if (!imageUrl) {
    return null;
  }
  
  try {
    console.log(`[BasedOn] Looking for source generation with image URL: ${imageUrl}`);
    
    // Query generations by location (main image URL)
    const { data, error } = await supabase
      .from('generations')
      .select('id')
      .eq('location', imageUrl)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error(`[BasedOn] Error finding source generation:`, error);
      return null;
    }
    
    if (data) {
      console.log(`[BasedOn] Found source generation: ${data.id}`);
      return data.id;
    }
    
    console.log(`[BasedOn] No source generation found for image URL`);
    return null;
  } catch (error) {
    console.error(`[BasedOn] Exception finding source generation:`, error);
    return null;
  }
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
    
    // Use content_type from taskData (already resolved from task_types table)
    const generationType = taskData.content_type || 'image'; // Default to image if not set
    console.log(`[GenMigration] Using content_type for generation: ${generationType}`);
    
    // Build generation params
    const generationParams = buildGenerationParams(
      taskData.params, 
      taskData.tool_type, 
      shotId, 
      thumbnailUrl || undefined
    );
    
    // Generate new UUID for generation
    const newGenerationId = crypto.randomUUID();
    
    // Extract generation_name from params
    // Check multiple locations: top-level, orchestrator_details, or full_orchestrator_payload
    let generationName = taskData.params?.generation_name || 
                        taskData.params?.orchestrator_details?.generation_name ||
                        taskData.params?.full_orchestrator_payload?.generation_name ||
                        undefined;
    
    console.log(`[GenMigration] Extracted generation_name: ${generationName}`);
    
    // Find source generation for magic edit tasks (based_on tracking)
    let basedOnGenerationId: string | null = null;
    const sourceImageUrl = taskData.params?.image; // Magic edit tasks have source image in params.image
    
    if (sourceImageUrl) {
      console.log(`[BasedOn] Task has source image, looking for source generation: ${sourceImageUrl}`);
      basedOnGenerationId = await findSourceGenerationByImageUrl(supabase, sourceImageUrl);
      
      if (basedOnGenerationId) {
        console.log(`[BasedOn] Will link new generation to source: ${basedOnGenerationId}`);
      } else {
        console.log(`[BasedOn] No source generation found, new generation will not have based_on`);
      }
    }
    
    // Insert generation record
    const generationRecord = {
      id: newGenerationId,
      tasks: [taskId], // Store as array
      params: generationParams,
      location: publicUrl,
      type: generationType,
      project_id: taskData.project_id,
      thumbnail_url: thumbnailUrl,
      name: generationName, // Add generation name to the record
      based_on: basedOnGenerationId, // Link to source generation if found
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
