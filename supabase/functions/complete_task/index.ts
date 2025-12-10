// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
// @ts-ignore
import { Image as ImageScript } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { authenticateRequest, verifyTaskOwnership, getTaskUserId } from "../_shared/auth.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";
// Provide a loose Deno type for local tooling; real type comes at runtime in Edge Functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

// ===== REQUEST PARSING TYPES & FUNCTIONS =====

/**
 * Upload mode for complete-task requests
 */
type UploadMode = 'base64' | 'presigned' | 'reference';

/**
 * Parsed request data from complete-task endpoint
 */
interface ParsedRequest {
  taskId: string;
  mode: UploadMode;
  filename: string;
  // MODE 1 (base64) specific
  fileData?: Uint8Array;
  fileContentType?: string;
  thumbnailData?: Uint8Array;
  thumbnailFilename?: string;
  thumbnailContentType?: string;
  // MODE 3/4 (storage path) specific
  storagePath?: string;
  thumbnailStoragePath?: string;
  // For MODE 3 validation (set during parsing)
  storagePathTaskId?: string; // The task_id extracted from storage_path
  requiresOrchestratorCheck?: boolean; // True if path task_id != request task_id
}

/**
 * Result of request parsing - either success with data or error with response
 */
type ParseResult = 
  | { success: true; data: ParsedRequest }
  | { success: false; response: Response };

/**
 * Parse and validate the incoming request
 * Does structural validation only - security checks (orchestrator validation) happen later
 */
async function parseCompleteTaskRequest(req: Request): Promise<ParseResult> {
  const contentType = req.headers.get("content-type") || "";
  
  // Multipart not supported
  if (contentType.includes("multipart/form-data")) {
    return {
      success: false,
      response: new Response(
        "Multipart upload (MODE 2) is not supported. Use MODE 1 (base64 JSON) or MODE 3 (pre-signed URL).",
        { status: 400 }
      )
    };
  }

  // Parse JSON body
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return {
      success: false,
      response: new Response("Invalid JSON body", { status: 400 })
    };
  }

  const {
    task_id,
    file_data,
    filename,
    first_frame_data,
    first_frame_filename,
    storage_path,
    thumbnail_storage_path
  } = body;

  console.log(`[RequestParser] Received request with task_id: ${task_id}`);
  console.log(`[RequestParser] Body keys: ${Object.keys(body).join(', ')}`);

  // Determine mode and validate accordingly
  if (storage_path) {
    // MODE 3 or MODE 4: Pre-uploaded or referenced file
    if (!task_id) {
      return {
        success: false,
        response: new Response("task_id required", { status: 400 })
      };
    }

    const pathParts = storage_path.split('/');
    const isMode3Format = pathParts.length >= 4 && pathParts[1] === 'tasks';
    const mode: UploadMode = isMode3Format ? 'presigned' : 'reference';

    console.log(`[RequestParser] ${mode === 'presigned' ? 'MODE 3' : 'MODE 4'}: storage_path=${storage_path}`);

    // Basic path validation for MODE 4
    if (mode === 'reference' && pathParts.length < 2) {
      return {
        success: false,
        response: new Response("Invalid storage_path format. Must be at least userId/filename", { status: 400 })
      };
    }

    // For MODE 3, check if path task_id matches request task_id
    let requiresOrchestratorCheck = false;
    let storagePathTaskId: string | undefined;
    
    if (mode === 'presigned') {
      storagePathTaskId = pathParts[2];
      if (storagePathTaskId !== task_id) {
        console.log(`[RequestParser] Path task_id (${storagePathTaskId}) != request task_id (${task_id}) - will require orchestrator check`);
        requiresOrchestratorCheck = true;
      }

      // Validate thumbnail path format if provided
      if (thumbnail_storage_path) {
        const thumbParts = thumbnail_storage_path.split('/');
        if (thumbParts.length < 4 || thumbParts[1] !== 'tasks') {
          return {
            success: false,
            response: new Response("Invalid thumbnail_storage_path format.", { status: 400 })
          };
        }
        const thumbTaskId = thumbParts[2];
        if (thumbTaskId !== task_id) {
          // Will also need orchestrator check for thumbnail
          requiresOrchestratorCheck = true;
        }
      }
    }

    return {
      success: true,
      data: {
        taskId: String(task_id),
        mode,
        filename: pathParts[pathParts.length - 1],
        storagePath: storage_path,
        thumbnailStoragePath: thumbnail_storage_path,
        storagePathTaskId,
        requiresOrchestratorCheck
      }
    };

  } else {
    // MODE 1: Legacy base64 upload
    console.log(`[RequestParser] MODE 1: base64 upload`);

    if (!task_id || !file_data || !filename) {
      return {
        success: false,
        response: new Response(
          "task_id, file_data (base64), and filename required (or use storage_path for pre-uploaded files)",
          { status: 400 }
        )
      };
    }

    // Validate thumbnail parameters consistency
    if (first_frame_data && !first_frame_filename) {
      return {
        success: false,
        response: new Response("first_frame_filename required when first_frame_data is provided", { status: 400 })
      };
    }
    if (first_frame_filename && !first_frame_data) {
      return {
        success: false,
        response: new Response("first_frame_data required when first_frame_filename is provided", { status: 400 })
      };
    }

    // Decode base64 file data
    let fileBuffer: Uint8Array;
    try {
      console.log(`[RequestParser] Decoding base64 file data (length: ${file_data.length} chars)`);
      fileBuffer = Uint8Array.from(atob(file_data), (c) => c.charCodeAt(0));
      console.log(`[RequestParser] Decoded file buffer size: ${fileBuffer.length} bytes`);
    } catch (e) {
      console.error("[RequestParser] Base64 decode error:", e);
      return {
        success: false,
        response: new Response("Invalid base64 file_data", { status: 400 })
      };
    }

    // Decode thumbnail if provided
    let thumbnailBuffer: Uint8Array | undefined;
    let thumbnailFilename: string | undefined;
    if (first_frame_data && first_frame_filename) {
      try {
        console.log(`[RequestParser] Decoding base64 thumbnail data`);
        thumbnailBuffer = Uint8Array.from(atob(first_frame_data), (c) => c.charCodeAt(0));
        thumbnailFilename = first_frame_filename;
        console.log(`[RequestParser] Decoded thumbnail buffer size: ${thumbnailBuffer.length} bytes`);
      } catch (e) {
        console.error("[RequestParser] Thumbnail base64 decode error:", e);
        // Continue without thumbnail - non-fatal
      }
    }

    return {
      success: true,
      data: {
        taskId: String(task_id),
        mode: 'base64',
        filename,
        fileData: fileBuffer,
        fileContentType: getContentType(filename),
        thumbnailData: thumbnailBuffer,
        thumbnailFilename,
        thumbnailContentType: thumbnailFilename ? getContentType(thumbnailFilename) : undefined
      }
    };
  }
}

/**
 * Validate that a storage path is allowed for the given task
 * Called after Supabase client is available for orchestrator check
 */
async function validateStoragePathSecurity(
  supabase: any,
  taskId: string,
  storagePath: string,
  storagePathTaskId: string | undefined
): Promise<{ allowed: boolean; error?: string }> {
  // If path task_id matches request task_id, it's allowed
  if (!storagePathTaskId || storagePathTaskId === taskId) {
    return { allowed: true };
  }

  // Check if this is an orchestrator task (allowed to reference other task outputs)
  const { data: task, error } = await supabase
    .from('tasks')
    .select('task_type')
    .eq('id', taskId)
    .single();

  if (error) {
    console.error(`[SecurityCheck] Error fetching task for validation: ${error.message}`);
    return { allowed: false, error: "storage_path does not match task_id. Files must be uploaded for the correct task." };
  }

  const isOrchestrator = task?.task_type?.includes('orchestrator');
  if (isOrchestrator) {
    console.log(`[SecurityCheck] ✅ Orchestrator task ${taskId} referencing task ${storagePathTaskId} output - allowed`);
    return { allowed: true };
  }

  console.error(`[SecurityCheck] ❌ Non-orchestrator task attempting to reference different task's output`);
  return { allowed: false, error: "storage_path does not match task_id. Files must be uploaded for the correct task." };
}

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
 * SUPPORTS TWO UPLOAD MODES:
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
 * MODE 3 (PRE-SIGNED URL - Zero Memory):
 *   Content-Type: application/json
 *   Body: {
 *     task_id,
 *     storage_path: "user_id/tasks/{task_id}/filename",  // From generate-upload-url
 *     thumbnail_storage_path?: "user_id/tasks/{task_id}/thumbnails/thumb.jpg"
 *   }
 *   Memory: Minimal (file already uploaded to storage)
 *   Use this for large files (>100MB) - call generate-upload-url first
 *   Security: Validates storage_path matches task_id (prevents path traversal)
 * 
 * MODE 4 (REFERENCE EXISTING PATH - Zero Memory):
 *   Content-Type: application/json
 *   Body: {
 *     task_id,
 *     storage_path: "user_id/filename",  // Reference file uploaded by another task
 *     thumbnail_storage_path?: "user_id/thumbnails/thumb.jpg"  // Optional
 *   }
 *   Memory: Minimal (file already in storage)
 *   Use case: Orchestrator task referencing file uploaded by child task (e.g., stitch)
 *   Security: Validates file exists in storage, task ownership via auth
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
 * - 404 Not found if file referenced in MODE 4 doesn't exist
 * - 500 Internal Server Error
 */
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // 1) Parse and validate request
  const parseResult = await parseCompleteTaskRequest(req);
  if (!parseResult.success) {
    return parseResult.response;
  }
  const parsedRequest = parseResult.data;
  const taskIdString = parsedRequest.taskId;

  // Extract values for backward compatibility with existing code
  const filename = parsedRequest.filename;
  const fileUploadBody = parsedRequest.fileData;
  const fileContentType = parsedRequest.fileContentType;
  const first_frame_filename = parsedRequest.thumbnailFilename;
  const firstFrameUploadBody = parsedRequest.thumbnailData;
  const firstFrameContentType = parsedRequest.thumbnailContentType;
  const storagePathProvided = parsedRequest.storagePath;
  const thumbnailPathProvided = parsedRequest.thumbnailStoragePath;

  console.log(`[COMPLETE-TASK] Processing task ${taskIdString} (mode: ${parsedRequest.mode})`);

  // 2) Get environment variables and create Supabase client
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  
  // Create logger with task_id
  const logger = new SystemLogger(supabaseAdmin, 'complete-task', taskIdString);
  logger.info("Processing task", { 
    task_id: taskIdString, 
    mode: parsedRequest.mode,
    filename: parsedRequest.filename
  });

  // 3) Security check: Validate storage path for orchestrator references (MODE 3 with mismatched task_id)
  if (parsedRequest.requiresOrchestratorCheck && parsedRequest.storagePath) {
    const securityResult = await validateStoragePathSecurity(
      supabaseAdmin,
      taskIdString,
      parsedRequest.storagePath,
      parsedRequest.storagePathTaskId
    );
    if (!securityResult.allowed) {
      logger.error("Storage path security check failed", { error: securityResult.error });
      await logger.flush();
      return new Response(securityResult.error || "Access denied", { status: 403 });
    }
  }

  // Authenticate request using shared utility
  const auth = await authenticateRequest(req, supabaseAdmin, "[COMPLETE-TASK-DEBUG]");

  if (!auth.success) {
    logger.error("Authentication failed", { error: auth.error });
    await logger.flush();
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

    // 4.5) MODE 4: Verify referenced file exists (if MODE 4 storage path provided)
    if (storagePathProvided) {
      const pathParts = storagePathProvided.split('/');
      const isMode3Format = pathParts.length >= 4 && pathParts[1] === 'tasks';

      if (!isMode3Format) {
        // MODE 4: Verify file exists in storage
        console.log(`[COMPLETE-TASK-DEBUG] MODE 4: Verifying referenced file exists: ${storagePathProvided}`);

        try {
          const { data: urlData } = supabaseAdmin.storage.from('image_uploads').getPublicUrl(storagePathProvided);
          if (!urlData?.publicUrl) {
            console.error(`[COMPLETE-TASK-DEBUG] MODE 4: File not accessible: ${storagePathProvided}`);
            return new Response("Referenced file does not exist or is not accessible in storage", { status: 404 });
          }
          console.log(`[COMPLETE-TASK-DEBUG] MODE 4: Verified file exists and is accessible`);
        } catch (verifyError) {
          console.error(`[COMPLETE-TASK-DEBUG] MODE 4: Exception verifying file:`, verifyError);
          return new Response("Error verifying file in storage", { status: 500 });
        }
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
          if (!fileUploadBody) {
            throw new Error('No file data available for thumbnail generation');
          }
          const sourceBytes = fileUploadBody;
          console.log(`[ThumbnailGenDebug] Using file data, size: ${sourceBytes.length} bytes`);

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
          // Use helper to set thumbnail at correct path based on task_type
          updatedParams = setThumbnailInParams(updatedParams, currentTask.task_type, thumbnailUrl);
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

      // CRITICAL: Sub-tasks (segments) now create child generations, so we DO NOT skip them anymore.
      // The createGenerationFromTask function handles the parent/child logic.
      const isSubTask = extractOrchestratorTaskId(taskData.params, 'GenMigration');
      if (isSubTask) {
        console.log(`[GenMigration] Task ${taskIdString} is a sub-task of orchestrator ${isSubTask} - proceeding to create child generation`);
      }

      // Proceed with generation creation logic for all tasks (including sub-tasks)
      {
        // Not a sub-task - proceed with generation creation logic
        // Resolve tool_type with potential override from params
        const toolTypeInfo = await resolveToolType(supabaseAdmin, taskData.task_type, taskData.params);

        if (!toolTypeInfo) {
          console.error(`[GenMigration] Failed to resolve tool_type for task ${taskIdString}`);
        } else {
          const { toolType, category: taskCategory, contentType } = toolTypeInfo;
          console.log(`[GenMigration] Task ${taskIdString} resolved to category: ${taskCategory}, tool_type: ${toolType}, content_type: ${contentType}`);

          // Create combined task data with resolved tool_type and content_type (used by multiple branches)
          const combinedTaskData = {
            ...taskData,
            tool_type: toolType,
            content_type: contentType
          };

          // ===== PRIORITY CHECK: Tasks with based_on create variants instead of new generations =====
          // This handles: image_inpaint, annotated_image_edit, qwen_image_edit, and any task with based_on
          const basedOnGenerationId = extractBasedOn(taskData.params);
          
          if (basedOnGenerationId && !isSubTask) {
            console.log(`[ImageEdit] Task ${taskIdString} has based_on=${basedOnGenerationId} - creating variant instead of new generation`);
            
            try {
              // Fetch the source generation to verify it exists
              const { data: sourceGen, error: fetchError } = await supabaseAdmin
                .from('generations')
                .select('id, params, thumbnail_url, project_id')
                .eq('id', basedOnGenerationId)
                .single();

              if (fetchError || !sourceGen) {
                console.error(`[ImageEdit] Source generation ${basedOnGenerationId} not found:`, fetchError);
                // Fall through to regular generation creation with based_on link
              } else {
                // Build variant params - include source_variant_id if editing from a variant
                const variantParams = {
                  ...taskData.params,
                  source_task_id: taskIdString,
                  source_variant_id: taskData.params?.source_variant_id || null, // Track which variant this was edited from
                  created_from: taskData.task_type,
                  tool_type: toolType,
                };

                // Determine variant type based on task type
                let variantType = 'edit';
                if (taskData.task_type === 'image_inpaint') {
                  variantType = 'inpaint';
                } else if (taskData.task_type === 'annotated_image_edit') {
                  variantType = 'annotated_edit';
                } else if (taskData.task_type === 'qwen_image_edit' || taskData.task_type === 'image_edit' || taskData.task_type === 'magic_edit') {
                  variantType = 'magic_edit';
                }

                // Create variant on source generation (non-primary - doesn't replace original)
                await createVariant(
                  supabaseAdmin,
                  basedOnGenerationId,
                  publicUrl,
                  thumbnailUrl || null,
                  variantParams,
                  false,        // is_primary: false - edits don't replace the original
                  variantType,
                  taskData.params?.prompt ? `Edit: ${taskData.params.prompt.substring(0, 40)}...` : 'Edit'
                );

                console.log(`[ImageEdit] Successfully created ${variantType} variant on generation ${basedOnGenerationId}`);

                // Mark task as generation_created (variant counts)
                await supabaseAdmin
                  .from('tasks')
                  .update({ generation_created: true })
                  .eq('id', taskIdString);

                // Skip the rest of generation creation - we're done
                // (Don't create a separate generation record)
              }
            } catch (variantErr) {
              console.error(`[ImageEdit] Error creating variant for task ${taskIdString}:`, variantErr);
              // Don't fail - continue with task completion
            }
          } else if (
            taskCategory === 'generation' || 
            (taskCategory === 'processing' && isSubTask) ||
            // Processing tasks that produce images (inpaint, annotated_edit) should create generations
            // when they don't have based_on (standalone generation, not an edit of existing)
            (taskCategory === 'processing' && contentType === 'image')
          ) {
            console.log(`[GenMigration] Creating generation for task ${taskIdString} before marking Complete (category=${taskCategory}, isSubTask=${!!isSubTask}, contentType=${contentType})...`);
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
          } else if (taskCategory === 'upscale') {
            // Special handling for upscale tasks: create an upscaled variant as the new primary
            console.log(`[ImageUpscale] Processing upscale task ${taskIdString} (task_type: ${taskData.task_type})`);

            const generationId = taskData.params?.generation_id;
            if (generationId) {
              try {
                console.log(`[ImageUpscale] Creating upscaled variant for generation ${generationId}`);
                
                // Fetch the source generation to get its params
                const { data: sourceGen, error: fetchError } = await supabaseAdmin
                  .from('generations')
                  .select('params, thumbnail_url')
                  .eq('id', generationId)
                  .single();

                if (fetchError) {
                  console.error(`[ImageUpscale] Error fetching source generation:`, fetchError);
                }
                
                // Build params for the upscaled variant
                // CRITICAL: Preserve tool_type from source generation for proper filtering in the gallery
                const upscaleParams = {
                  ...(sourceGen?.params || {}),
                  upscale_task_id: taskIdString,
                  upscaled_from: taskData.params?.image || null,
                  upscale_model: taskData.params?.model || 'unknown',
                  // Preserve original tool_type if present, otherwise use 'image-generation' as fallback
                  tool_type: sourceGen?.params?.tool_type || 'image-generation'
                };
                
                // Create the upscaled variant as the NEW primary
                // The trigger will:
                // 1. Unset the old primary variant
                // 2. Sync the upscaled location to generations.location
                await createVariant(
                  supabaseAdmin,
                  generationId,
                  publicUrl,                          // The upscaled image URL
                  thumbnailUrl || sourceGen?.thumbnail_url || null,  // Keep existing thumbnail or use new one
                  upscaleParams,
                  true,                               // is_primary: upscaled becomes the new primary!
                  'upscaled',                         // variant_type
                  'Upscaled'                          // name
                );
                
                console.log(`[ImageUpscale] Successfully created upscaled variant for generation ${generationId}`);
              } catch (updateErr) {
                console.error(`[ImageUpscale] Exception creating upscaled variant:`, updateErr);
                // Don't fail the task - the upscaled image is still in output_location
              }
            } else {
              console.log(`[ImageUpscale] No generation_id in task params, skipping upscaled variant creation`);
            }
          } else {
            // Note: The old 'inpaint' category handler was removed because:
            // 1. image_inpaint and annotated_image_edit have category='processing' in DB, not 'inpaint'
            // 2. Tasks with based_on are now handled above (creating variants on source generation)
            console.log(`[GenMigration] Skipping generation creation for task ${taskIdString} - category is '${taskCategory}', not 'generation'`);
          }
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

    // 10.5) Check if this is a segment task and if all siblings are complete - then mark orchestrator Complete
    // Supports both travel_segment and join_clips_segment task types
    try {
      // Fetch the just-completed task to check if it's a segment
      const { data: completedTask, error: completedTaskError } = await supabaseAdmin
        .from("tasks")
        .select("task_type, params, project_id")
        .eq("id", taskIdString)
        .single();

      // Define segment type mappings
      const segmentTypeConfig: Record<string, { segmentType: string; runIdField: string; expectedCountField: string }> = {
        'travel_segment': {
          segmentType: 'travel_segment',
          runIdField: 'orchestrator_run_id',
          expectedCountField: 'num_new_segments_to_generate'
        },
        'join_clips_segment': {
          segmentType: 'join_clips_segment',
          runIdField: 'run_id', // join_clips uses run_id in orchestrator_details
          expectedCountField: 'num_joins' // join_clips counts joins (clips - 1)
        }
      };

      const taskType = completedTask?.task_type;
      const config = taskType ? segmentTypeConfig[taskType] : null;

      if (!completedTaskError && config) {
        // Extract orchestrator references using helpers
        const orchestratorTaskId = extractOrchestratorTaskId(completedTask.params, 'OrchestratorComplete');
        const orchestratorRunId = extractOrchestratorRunId(completedTask.params, 'OrchestratorComplete');

        if (orchestratorTaskId) {
          console.log(`[OrchestratorComplete] ${taskType} ${taskIdString} completed. Checking siblings for orchestrator ${orchestratorTaskId} (run_id: ${orchestratorRunId || 'N/A'})`);

          // First, fetch the orchestrator task to get expected segment count and current status
          const { data: orchestratorTask, error: orchError } = await supabaseAdmin
            .from("tasks")
            .select("id, status, params")
            .eq("id", orchestratorTaskId)
            .single();

          if (orchError) {
            console.error(`[OrchestratorComplete] Error fetching orchestrator task ${orchestratorTaskId}:`, orchError);
          } else if (!orchestratorTask) {
            console.log(`[OrchestratorComplete] Orchestrator task ${orchestratorTaskId} not found`);
          } else if (orchestratorTask.status === 'Complete') {
            console.log(`[OrchestratorComplete] Orchestrator ${orchestratorTaskId} is already Complete`);
          } else {
            // Get expected segment count from orchestrator params
            // For travel: num_new_segments_to_generate
            // For join_clips: num_joins or (clip_list.length - 1)
            let expectedSegmentCount: number | null = null;
            
            if (taskType === 'travel_segment') {
              expectedSegmentCount = orchestratorTask.params?.orchestrator_details?.num_new_segments_to_generate ||
                orchestratorTask.params?.num_new_segments_to_generate ||
                null;
            } else if (taskType === 'join_clips_segment') {
              // For join_clips, expected joins = number of clips - 1
              const clipList = orchestratorTask.params?.orchestrator_details?.clip_list;
              if (Array.isArray(clipList) && clipList.length > 1) {
                expectedSegmentCount = clipList.length - 1;
              } else {
                expectedSegmentCount = orchestratorTask.params?.orchestrator_details?.num_joins || null;
              }
            }

            console.log(`[OrchestratorComplete] Orchestrator expects ${expectedSegmentCount ?? 'unknown'} segments`);

            // Query all segment tasks that reference this orchestrator
            // Try multiple strategies to find siblings
            let allSegments: any[] | null = null;
            let segmentsError: any = null;

            // Strategy 1: Query by run_id (most reliable if available)
            if (orchestratorRunId) {
              console.log(`[OrchestratorComplete] Querying ${config.segmentType} by run_id: ${orchestratorRunId}`);
              
              // Build query with multiple JSONB path checks for run_id
              const runIdQuery = supabaseAdmin
                .from("tasks")
                .select("id, status, params, generation_started_at")
                .eq("task_type", config.segmentType)
                .eq("project_id", completedTask.project_id)
                .or(`params->>orchestrator_run_id.eq.${orchestratorRunId},params->>run_id.eq.${orchestratorRunId},params->orchestrator_details->>run_id.eq.${orchestratorRunId}`);

              const runIdResult = await runIdQuery;
              allSegments = runIdResult.data;
              segmentsError = runIdResult.error;
              
              if (allSegments && allSegments.length > 0) {
                console.log(`[OrchestratorComplete] Found ${allSegments.length} segments via run_id query`);
              }
            }

            // Strategy 2: Fallback to query by orchestrator_task_id if run_id query failed or found nothing
            if ((!allSegments || allSegments.length === 0) && !segmentsError) {
              console.log(`[OrchestratorComplete] run_id query returned no results, trying orchestrator_task_id: ${orchestratorTaskId}`);
              
              const orchIdQuery = supabaseAdmin
                .from("tasks")
                .select("id, status, params, generation_started_at")
                .eq("task_type", config.segmentType)
                .eq("project_id", completedTask.project_id)
                .or(`params->>orchestrator_task_id.eq.${orchestratorTaskId},params->>orchestrator_task_id_ref.eq.${orchestratorTaskId},params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId}`);

              const orchIdResult = await orchIdQuery;
              allSegments = orchIdResult.data;
              segmentsError = orchIdResult.error;
              
              if (allSegments && allSegments.length > 0) {
                console.log(`[OrchestratorComplete] Found ${allSegments.length} segments via orchestrator_task_id query`);
              }
            }

            // Log first segment's params structure for debugging (if found)
            if (allSegments && allSegments.length > 0) {
              const sampleParams = allSegments[0].params;
              console.log(`[OrchestratorComplete] Sample segment params keys: ${Object.keys(sampleParams || {}).join(', ')}`);
              if (sampleParams?.orchestrator_details) {
                console.log(`[OrchestratorComplete] Sample segment orchestrator_details keys: ${Object.keys(sampleParams.orchestrator_details).join(', ')}`);
              }
            }

            if (segmentsError) {
              console.error(`[OrchestratorComplete] Error querying segments:`, segmentsError);
            } else if (!allSegments || allSegments.length === 0) {
              console.log(`[OrchestratorComplete] No segments found for orchestrator`);
            } else {
              const foundSegments = allSegments.length;
              const completedSegments = allSegments.filter(s => s.status === 'Complete').length;
              const failedSegments = allSegments.filter(s => s.status === 'Failed' || s.status === 'Cancelled').length;
              const pendingSegments = foundSegments - completedSegments - failedSegments;

              console.log(`[OrchestratorComplete] ${taskType} status: ${completedSegments} complete, ${failedSegments} failed, ${pendingSegments} pending (found ${foundSegments}, expected ${expectedSegmentCount ?? 'unknown'})`);

              // Validate we have the expected number of segments (if known)
              if (expectedSegmentCount !== null && foundSegments !== expectedSegmentCount) {
                console.log(`[OrchestratorComplete] Warning: Found ${foundSegments} segments but expected ${expectedSegmentCount}. Waiting for all segments to be created.`);
              } else if (pendingSegments > 0) {
                console.log(`[OrchestratorComplete] Still waiting for ${pendingSegments} segments to complete`);
              } else if (failedSegments > 0) {
                // All segments finished but some failed - mark orchestrator as Failed
                console.log(`[OrchestratorComplete] All segments finished but ${failedSegments} failed. Marking orchestrator ${orchestratorTaskId} as Failed`);

                const { error: updateOrchError } = await supabaseAdmin
                  .from("tasks")
                  .update({
                    status: "Failed",
                    error_message: `${failedSegments} of ${foundSegments} segments failed`,
                    generation_processed_at: new Date().toISOString()
                  })
                  .eq("id", orchestratorTaskId)
                  .in("status", ["Queued", "In Progress"]); // Only update if not already terminal

                if (updateOrchError) {
                  console.error(`[OrchestratorComplete] Failed to mark orchestrator as Failed:`, updateOrchError);
                } else {
                  console.log(`[OrchestratorComplete] Marked orchestrator ${orchestratorTaskId} as Failed`);
                }
              } else if (completedSegments === foundSegments && (expectedSegmentCount === null || foundSegments === expectedSegmentCount)) {
                // All segments complete! Mark orchestrator as Complete
                console.log(`[OrchestratorComplete] All ${foundSegments} segments complete! Marking orchestrator ${orchestratorTaskId} as Complete`);

                // Find the earliest sub-task start time for orchestrator billing
                // This is needed because calculate-task-cost requires both timestamps
                let earliestStartTime: string | null = null;
                for (const segment of allSegments!) {
                  if (segment.generation_started_at) {
                    if (!earliestStartTime || segment.generation_started_at < earliestStartTime) {
                      earliestStartTime = segment.generation_started_at;
                    }
                  }
                }

                const { error: updateOrchError } = await supabaseAdmin
                  .from("tasks")
                  .update({
                    status: "Complete",
                    output_location: publicUrl, // Use the final segment's video URL as the orchestrator's output
                    generation_started_at: earliestStartTime || new Date().toISOString(), // Use earliest sub-task start or now
                    generation_processed_at: new Date().toISOString()
                  })
                  .eq("id", orchestratorTaskId)
                  .in("status", ["Queued", "In Progress"]); // Only update if not already terminal

                if (updateOrchError) {
                  console.error(`[OrchestratorComplete] Failed to mark orchestrator ${orchestratorTaskId} as Complete:`, updateOrchError);
                } else {
                  console.log(`[OrchestratorComplete] Successfully marked orchestrator ${orchestratorTaskId} as Complete`);
                  
                  // Trigger billing for the orchestrator task (sub-tasks skip billing expecting the orchestrator to be billed)
                  try {
                    console.log(`[OrchestratorComplete] Triggering cost calculation for orchestrator ${orchestratorTaskId}...`);
                    const orchestratorCostResp = await fetch(`${supabaseUrl}/functions/v1/calculate-task-cost`, {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${serviceKey}`,
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({
                        task_id: orchestratorTaskId
                      })
                    });
                    if (orchestratorCostResp.ok) {
                      const costData = await orchestratorCostResp.json();
                      if (costData && typeof costData.cost === 'number') {
                        console.log(`[OrchestratorComplete] Cost calculation successful: $${costData.cost.toFixed(3)} for ${costData.duration_seconds}s`);
                      } else {
                        console.log(`[OrchestratorComplete] Cost calculation returned unexpected data:`, costData);
                      }
                    } else {
                      const errTxt = await orchestratorCostResp.text();
                      console.error(`[OrchestratorComplete] Cost calculation failed: ${errTxt}`);
                    }
                  } catch (costErr) {
                    console.error(`[OrchestratorComplete] Error triggering cost calculation for orchestrator:`, costErr);
                    // Don't fail the main request because of cost calc issues
                  }
                  
                  // Update parent_generation_id if present
                  // ONLY for join_clips_segment - the final segment IS the combined video
                  // For travel_segment, the travel_stitch task produces the final video and handles this update
                  // Note: edit_video_orchestrator also uses join_clips_segment tasks, and the tool_type
                  // is determined from orchestratorTask.params.tool_type (e.g., 'edit-video')
                  if (taskType === 'join_clips_segment') {
                    const parentGenId = orchestratorTask.params?.orchestrator_details?.parent_generation_id || 
                                        orchestratorTask.params?.parent_generation_id;
                    
                    if (parentGenId) {
                      console.log(`[OrchestratorComplete] Creating variant for parent generation ${parentGenId}`);
                      
                      try {
                        // Fetch parent generation to get existing params
                        const { data: parentGen } = await supabaseAdmin
                          .from('generations')
                          .select('params')
                          .eq('id', parentGenId)
                          .single();
                        
                        // Build variant params
                        // CRITICAL: Include tool_type for proper filtering in the gallery
                        // The tool_type should come from the orchestrator's params (e.g., 'edit-video' or 'join-clips')
                        const variantParams = {
                          ...orchestratorTask.params,
                          tool_type: orchestratorTask.params?.tool_type || orchestratorTask.params?.orchestrator_details?.tool_type || 'join-clips',
                          source_task_id: taskIdString,
                          orchestrator_task_id: orchestratorTaskId,
                          created_from: 'join_clips_complete',
                        };

                        // Create variant (DB trigger will unset old primary if exists)
                        await createVariant(
                          supabaseAdmin,
                          parentGenId,
                          publicUrl,
                          thumbnailUrl || null,
                          variantParams,
                          true,           // is_primary
                          'clip_join',    // variant_type
                          null            // name
                        );

                        // Update generation record with new location
                        // CRITICAL: Also update params to include tool_type for proper filtering
                        const updatedParams = {
                          ...(parentGen?.params || {}),
                          tool_type: orchestratorTask.params?.tool_type || 'join-clips',
                        };
                        
                        const { error: updateGenError } = await supabaseAdmin
                          .from('generations')
                          .update({
                            location: publicUrl,
                            thumbnail_url: thumbnailUrl,
                            type: 'video',
                            params: updatedParams
                          })
                          .eq('id', parentGenId);
                        
                        if (updateGenError) {
                          console.error(`[OrchestratorComplete] Failed to update parent generation ${parentGenId}:`, updateGenError);
                        } else {
                          console.log(`[OrchestratorComplete] Successfully created variant and updated parent generation ${parentGenId}`);
                        }
                      } catch (genUpdateErr) {
                        console.error(`[OrchestratorComplete] Exception updating parent generation:`, genUpdateErr);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (orchCompleteErr) {
      console.error("[OrchestratorComplete] Error checking orchestrator completion:", orchCompleteErr);
      // Don't fail the main request - orchestrator completion is best-effort
    }

    // 11) Calculate and record task cost (only for service role)
    if (isServiceRole) {
      try {
        // Fetch task to check if it's a sub-task of an orchestrator
        const { data: taskForCostCheck, error: taskForCostCheckError } = await supabaseAdmin
          .from("tasks")
          .select("params")
          .eq("id", taskIdString)
          .single();

        // Skip cost calculation for sub-tasks - parent orchestrator will be billed instead
        const subTaskOrchestratorRef = extractOrchestratorTaskId(taskForCostCheck?.params, 'CostCalc');
        if (subTaskOrchestratorRef) {
          console.log(`[COMPLETE-TASK-DEBUG] Task ${taskIdString} is a sub-task of orchestrator ${subTaskOrchestratorRef}, skipping cost calculation`);
        } else {
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
        }
      } catch (costErr) {
        console.error("[COMPLETE-TASK-DEBUG] Error triggering cost calculation:", costErr);
        // Do not fail the main request because of cost calc issues
      }
    }
    console.log(`[COMPLETE-TASK-DEBUG] Successfully completed task ${taskIdString} by ${isServiceRole ? 'service-role' : `user ${callerId}`}`);
    const responseData = {
      success: true,
      public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      message: "Task completed and file uploaded successfully"
    };
    logger.info("Task completed successfully", { 
      task_id: taskIdString,
      output_location: publicUrl,
      has_thumbnail: !!thumbnailUrl
    });
    console.log(`[COMPLETE-TASK-DEBUG] Returning success response: ${JSON.stringify(responseData)}`);
    await logger.flush();
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error: any) {
    logger.critical("Unexpected error", { 
      task_id: taskIdString, 
      error: error?.message,
      stack: error?.stack?.substring(0, 500)
    });
    console.error("[COMPLETE-TASK-DEBUG] Edge function error:", error);
    console.error("[COMPLETE-TASK-DEBUG] Error stack:", error.stack);
    console.error("[COMPLETE-TASK-DEBUG] Error details:", JSON.stringify(error, null, 2));
    await logger.flush();
    return new Response(`Internal error: ${error?.message}`, {
      status: 500
    });
  }
});
// ===== PARAM EXTRACTION HELPERS =====

/**
 * Configuration for where thumbnail_url should be stored based on task_type
 */
const THUMBNAIL_PATH_CONFIG: Record<string, { path: string[]; extras?: Record<string, any> }> = {
  'travel_stitch': {
    path: ['full_orchestrator_payload', 'thumbnail_url'],
    extras: { accelerated: false } // Always hardcode accelerated=false for travel_stitch
  },
  'wan_2_2_i2v': {
    path: ['orchestrator_details', 'thumbnail_url']
  },
  'single_image': {
    path: ['thumbnail_url']
  },
  'default': {
    path: ['thumbnail_url']
  }
};

/**
 * Set thumbnail URL in params at the correct location based on task_type
 * @returns Updated params object (does not mutate original)
 */
function setThumbnailInParams(
  params: Record<string, any>,
  taskType: string,
  thumbnailUrl: string
): Record<string, any> {
  const config = THUMBNAIL_PATH_CONFIG[taskType] || THUMBNAIL_PATH_CONFIG.default;
  const updatedParams = JSON.parse(JSON.stringify(params || {})); // Deep clone

  // Navigate to parent path and ensure it exists
  let target = updatedParams;
  for (let i = 0; i < config.path.length - 1; i++) {
    const key = config.path[i];
    if (!target[key]) {
      target[key] = {};
    }
    target = target[key];
  }

  // Set the thumbnail URL
  const finalKey = config.path[config.path.length - 1];
  target[finalKey] = thumbnailUrl;

  // Set any extras (e.g., accelerated=false for travel_stitch)
  if (config.extras) {
    for (const [key, value] of Object.entries(config.extras)) {
      target[key] = value;
    }
  }

  return updatedParams;
}

/**
 * Extract orchestrator_task_id from task params
 * Checks multiple possible locations where this field might be stored
 */
function extractOrchestratorTaskId(params: any, logTag: string = 'OrchestratorExtract'): string | null {
  return extractFromParams(
    params,
    'orchestrator_task_id',
    [
      ['orchestrator_details', 'orchestrator_task_id'],
      ['originalParams', 'orchestrator_details', 'orchestrator_task_id'],
      ['orchestrator_task_id_ref'],
      ['orchestrator_task_id'],
    ],
    logTag
  );
}

/**
 * Extract orchestrator run_id from task params
 * Used for finding sibling segment tasks
 */
function extractOrchestratorRunId(params: any, logTag: string = 'OrchestratorExtract'): string | null {
  return extractFromParams(
    params,
    'run_id',
    [
      ['orchestrator_run_id'],
      ['run_id'],
      ['orchestrator_details', 'run_id'],
      ['originalParams', 'orchestrator_details', 'run_id'],
      ['full_orchestrator_payload', 'run_id'],
    ],
    logTag
  );
}

// ===== GENERATION HELPER FUNCTIONS =====

/**
 * Generic function to extract a value from multiple nested paths in params
 * Checks paths in order and returns the first non-null/undefined value found
 * @param params - The params object to search
 * @param fieldName - The field name being extracted (for logging)
 * @param paths - Array of path arrays (e.g., [['based_on'], ['orchestrator_details', 'based_on']])
 * @param logTag - Optional log tag prefix
 * @returns The extracted value as string, or null if not found
 */
function extractFromParams(params: any, fieldName: string, paths: string[][], logTag: string = 'ParamExtractor'): string | null {
  try {
    for (const path of paths) {
      let value = params;
      let pathValid = true;

      // Traverse the path
      for (const key of path) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          pathValid = false;
          break;
        }
      }

      // If we successfully traversed the path and got a value
      if (pathValid && value !== null && value !== undefined) {
        const pathStr = path.join('.');
        console.log(`[${logTag}] Found ${fieldName} in ${pathStr}: ${value}`);
        return String(value);
      }
    }

    console.log(`[${logTag}] No ${fieldName} found in task params`);
    return null;
  } catch (error) {
    console.error(`[${logTag}] Error extracting ${fieldName}:`, error);
    return null;
  }
}

/**
 * Extract based_on from task params
 * Supports multiple param shapes for flexibility across different task types
 */
function extractBasedOn(params: any): string | null {
  return extractFromParams(
    params,
    'based_on',
    [
      ['based_on'],                                      // Direct field (most common)
      ['originalParams', 'orchestrator_details', 'based_on'],
      ['orchestrator_details', 'based_on'],
      ['full_orchestrator_payload', 'based_on'],
      ['originalParams', 'based_on']
    ],
    'BasedOn'
  );
}

/**
 * Extract shot_id and add_in_position from task params
 * Supports multiple param shapes as per current DB trigger logic
 */
function extractShotAndPosition(params: any): { shotId?: string, addInPosition: boolean } {
  // Extract shot_id using generic helper
  const shotId = extractFromParams(
    params,
    'shot_id',
    [
      ['originalParams', 'orchestrator_details', 'shot_id'],  // MOST COMMON for wan_2_2_i2v
      ['orchestrator_details', 'shot_id'],
      ['shot_id'],
      ['full_orchestrator_payload', 'shot_id'],              // For travel_stitch
      ['shotId']                                               // camelCase variant
    ],
    'GenMigration'
  ) || undefined;

  // Extract add_in_position flag from multiple locations
  let addInPosition = false; // Default: unpositioned

  const addInPositionValue = extractFromParams(
    params,
    'add_in_position',
    [
      ['add_in_position'],
      ['originalParams', 'add_in_position'],
      ['orchestrator_details', 'add_in_position'],
      ['originalParams', 'orchestrator_details', 'add_in_position']
    ],
    'GenMigration'
  );

  if (addInPositionValue !== null) {
    addInPosition = addInPositionValue === 'true' || addInPositionValue === '1';
    console.log(`[GenMigration] Extracted add_in_position: ${addInPosition}`);
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
  // ALWAYS use content_type from base task_type, never from override
  // The tool_type override is for tracking/UI purposes only
  const finalContentType = taskTypeData.content_type || 'image'; // Default to image if not set
  const category = taskTypeData.category;

  console.log(`[ToolTypeResolver] Base task_type '${taskType}' has content_type: ${finalContentType}`);

  // Check for tool_type override in params
  const paramsToolType = taskParams?.tool_type;
  if (paramsToolType) {
    console.log(`[ToolTypeResolver] Found tool_type override in params: ${paramsToolType}`);

    // Validate that the override tool_type is a known valid tool type
    const { data: validToolTypes } = await supabase
      .from("task_types")
      .select("tool_type")
      .not("tool_type", "is", null)
      .eq("is_active", true);

    const validToolTypeSet = new Set(validToolTypes?.map(t => t.tool_type) || []);

    if (validToolTypeSet.has(paramsToolType)) {
      console.log(`[ToolTypeResolver] Using tool_type override: ${paramsToolType} (was: ${finalToolType})`);
      console.log(`[ToolTypeResolver] Content type remains: ${finalContentType} (from base task_type, not override)`);
      finalToolType = paramsToolType;
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
 * Note: The database trigger will automatically create a primary variant
 * when a generation with a location is inserted.
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
 * Create a generation variant
 * Used for upscales, edits, and other alternate versions of a generation.
 * 
 * @param supabase - Supabase client
 * @param generationId - The parent generation ID
 * @param location - URL to the variant content
 * @param thumbnailUrl - Thumbnail URL (optional)
 * @param params - Generation parameters for this variant
 * @param isPrimary - Whether this should be the primary variant (triggers sync to generation)
 * @param variantType - Type of variant: 'original', 'upscaled', 'edit', etc.
 * @param name - Human-readable name (optional)
 */
async function createVariant(
  supabase: any,
  generationId: string,
  location: string,
  thumbnailUrl: string | null,
  params: any,
  isPrimary: boolean,
  variantType: string | null,
  name?: string | null
): Promise<any> {
  const variantRecord = {
    generation_id: generationId,
    location,
    thumbnail_url: thumbnailUrl,
    params,
    is_primary: isPrimary,
    variant_type: variantType,
    name: name || null,
    created_at: new Date().toISOString()
  };

  console.log(`[Variant] Creating variant for generation ${generationId}: type=${variantType}, isPrimary=${isPrimary}`);

  const { data, error } = await supabase
    .from('generation_variants')
    .insert(variantRecord)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create variant: ${error.message}`);
  }

  console.log(`[Variant] Created variant ${data.id} for generation ${generationId}`);
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
    // Check if generation already exists
    const existingGeneration = await findExistingGeneration(supabase, taskId);
    if (existingGeneration) {
      console.log(`[GenMigration] Generation already exists for task ${taskId}: ${existingGeneration.id}`);
      console.log(`[GenMigration] Creating new variant and making it primary (like trim save)`);

      // Build params for the new variant
      const variantParams = {
        ...taskData.params,
        source_task_id: taskId,
        created_from: 'task_completion',
        tool_type: taskData.tool_type,
      };

      // Create a new variant as the primary (DB trigger will unset the old primary)
      await createVariant(
        supabase,
        existingGeneration.id,
        publicUrl,                    // The new output URL
        thumbnailUrl || null,
        variantParams,
        true,                         // is_primary: new one becomes primary
        'regenerated',                // variant_type
        null                          // name
      );

      // Update the generation record with the new location (like useTrimSave does)
      const { error: updateError } = await supabase
        .from('generations')
        .update({
          location: publicUrl,
          thumbnail_url: thumbnailUrl,
        })
        .eq('id', existingGeneration.id);

      if (updateError) {
        console.error(`[GenMigration] Failed to update generation with new variant:`, updateError);
      } else {
        console.log(`[GenMigration] Updated generation ${existingGeneration.id} with new primary variant`);
      }

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

    // ===== SPECIAL CASE HANDLERS (checked BEFORE general sub-task logic) =====
    // These task types create variants on a parent generation rather than child generations.
    // They must be checked first because they may also have orchestrator_task_id which would
    // incorrectly route them to the sub-task handling path.

    // Helper function to create variant and update parent generation
    const createVariantOnParent = async (
      parentGenId: string,
      variantType: string,
      extraParams: Record<string, any> = {},
      variantName?: string | null
    ): Promise<any | null> => {
      console.log(`[GenMigration] ${taskData.task_type} task ${taskId} - creating variant for parent generation ${parentGenId}`);

      // Fetch the parent generation
      const { data: parentGen, error: fetchError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', parentGenId)
        .single();

      if (fetchError || !parentGen) {
        console.error(`[GenMigration] Error fetching parent generation ${parentGenId}:`, fetchError);
        return null; // Signal to fall through to regular handling
      }

      try {
        // Build variant params
        const variantParams = {
          ...taskData.params,
          source_task_id: taskId,
          ...extraParams,
        };

        // Create variant (DB trigger will unset old primary if exists)
        await createVariant(
          supabase,
          parentGen.id,
          publicUrl,
          thumbnailUrl || null,
          variantParams,
          true,           // is_primary - new becomes primary
          variantType,
          variantName || null
        );

        // Update the parent generation with the new location
        // CRITICAL: Also update params to include tool_type for proper filtering in the gallery
        // We merge in extraParams (which may contain tool_type) into the existing params
        const updatedParams = {
          ...(parentGen.params || {}),
          ...extraParams,
        };
        
        const { error: updateError } = await supabase
          .from('generations')
          .update({
            location: publicUrl,
            thumbnail_url: thumbnailUrl,
            type: 'video',
            params: updatedParams
          })
          .eq('id', parentGen.id);

        if (updateError) {
          console.error(`[GenMigration] Error updating parent generation:`, updateError);
        } else {
          console.log(`[GenMigration] Successfully created ${variantType} variant and updated parent generation ${parentGen.id}`);
        }

        // Mark task as generation_created
        await supabase
          .from('tasks')
          .update({ generation_created: true })
          .eq('id', taskId);

        return parentGen;

      } catch (variantErr) {
        console.error(`[GenMigration] Exception creating variant for ${taskData.task_type}:`, variantErr);
        return null; // Signal to fall through to regular handling
      }
    };

    // SPECIAL CASE 1: individual_travel_segment with child_generation_id
    // Triggered from ChildGenerationsView "Regenerate Segment" button
    // Variant is associated with the CHILD (segment) generation, not the parent
    if (taskData.task_type === 'individual_travel_segment' && taskData.params?.child_generation_id) {
      const childGenId = taskData.params.child_generation_id;
      console.log(`[GenMigration] individual_travel_segment task ${taskId} - creating variant for child generation ${childGenId}`);

      // Fetch the child generation
      const { data: childGen, error: fetchError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', childGenId)
        .single();

      if (!fetchError && childGen) {
        try {
          // Build variant params
          // CRITICAL: Include tool_type for proper filtering in the gallery
          const variantParams = {
            ...taskData.params,
            tool_type: 'travel-between-images',
            source_task_id: taskId,
            created_from: 'individual_segment_regeneration',
            segment_index: taskData.params.segment_index,
            parent_generation_id: taskData.params.parent_generation_id,
          };

          // Create variant on the CHILD generation (DB trigger will unset old primary if exists)
          await createVariant(
            supabase,
            childGen.id,  // <-- Use CHILD generation ID, not parent
            publicUrl,
            thumbnailUrl || null,
            variantParams,
            true,           // is_primary - new becomes primary
            'individual_segment',
            taskData.params.generation_name || null
          );

          // Update the CHILD generation with the new location
          // CRITICAL: Also update params to include tool_type for proper filtering in the gallery
          const updatedChildParams = {
            ...(childGen.params || {}),
            tool_type: 'travel-between-images',
          };
          
          const { error: updateError } = await supabase
            .from('generations')
            .update({
              location: publicUrl,
              thumbnail_url: thumbnailUrl,
              type: 'video',
              params: updatedChildParams
            })
            .eq('id', childGen.id);

          if (updateError) {
            console.error(`[GenMigration] Error updating child generation:`, updateError);
          } else {
            console.log(`[GenMigration] Successfully created variant and updated child generation ${childGen.id}`);
          }

          // Mark task as generation_created
          await supabase
            .from('tasks')
            .update({ generation_created: true })
            .eq('id', taskId);

          return childGen;

        } catch (variantErr) {
          console.error(`[GenMigration] Exception creating variant for individual_travel_segment:`, variantErr);
          // Fall through to regular generation creation
        }
      } else {
        console.error(`[GenMigration] Error fetching child generation ${childGenId}:`, fetchError);
        // Fall through to regular generation creation
      }
    }

    // SPECIAL CASE 2: travel_stitch with parent_generation_id
    // The final stitched video output of a travel orchestrator
    const travelStitchParentId = taskData.task_type === 'travel_stitch' 
      ? (taskData.params?.orchestrator_details?.parent_generation_id || taskData.params?.parent_generation_id)
      : null;
    
    if (travelStitchParentId) {
      const result = await createVariantOnParent(
        travelStitchParentId,
        'travel_stitch',
        { 
          tool_type: 'travel-between-images',
          created_from: 'travel_stitch_completion' 
        }
      );
      if (result) return result;
      // Fall through to regular generation creation if variant creation failed
    }

    // ===== END SPECIAL CASE HANDLERS =====

    // Check if this is a sub-task (segment)
    const orchestratorTaskId = extractOrchestratorTaskId(taskData.params, 'GenMigration');
    let parentGenerationId: string | null = null;
    let isChild = false;
    let childOrder: number | null = null;

    if (orchestratorTaskId) {
      console.log(`[GenMigration] Task ${taskId} is a sub-task of orchestrator ${orchestratorTaskId}`);

      // Get or create the parent generation (Lazy Parent Creation)
      // Pass segment task params as fallback for shot_id extraction (in case orchestrator task query fails)
      const parentGen = await getOrCreateParentGeneration(supabase, orchestratorTaskId, taskData.project_id, taskData.params);
      if (parentGen) {
        parentGenerationId = parentGen.id;
        isChild = true;
        console.log(`[GenMigration] Linked to parent generation ${parentGenerationId}`);

        // Extract child order (segment index)
        // Try multiple locations for index
        const segmentIndex = taskData.params?.segment_index ??
          taskData.params?.index ??
          taskData.params?.sequence_index;

        if (segmentIndex !== undefined && segmentIndex !== null) {
          childOrder = parseInt(String(segmentIndex), 10);
          console.log(`[GenMigration] Extracted child_order: ${childOrder}`);

          // SPECIAL CASE: For join_clips_segment with single join (2 clips), the segment IS the final output
          // Similar to travel single-segment handling - create a variant on the parent instead of a child
          if (taskData.task_type === 'join_clips_segment') {
            const isSingleJoin = taskData.params?.is_first_join === true && taskData.params?.is_last_join === true;
            
            if (isSingleJoin && parentGenerationId) {
              console.log(`[JoinClipsSingleJoin] Detected single-join scenario (join_index: ${taskData.params?.join_index}) - creating variant for parent generation ${parentGenerationId}`);
              
              // Determine tool_type from orchestrator params (could be 'join-clips' or 'edit-video')
              const toolType = taskData.params?.full_orchestrator_payload?.tool_type ||
                               taskData.params?.tool_type || 
                               'join-clips';
              
              const singleJoinResult = await createVariantOnParent(
                parentGenerationId,
                'join_clips_segment',
                {
                  tool_type: toolType,
                  created_from: 'single_join_completion',
                  join_index: taskData.params?.join_index ?? 0,
                  is_single_join: true,
                }
              );
              
              if (singleJoinResult) {
                console.log(`[JoinClipsSingleJoin] Successfully created variant and updated parent generation`);
                
                // Mark the orchestrator task as generation_created=true
                await supabase
                  .from('tasks')
                  .update({ generation_created: true })
                  .eq('id', orchestratorTaskId);
                
                // Return early - we've handled this as a variant, not a child generation
                return singleJoinResult;
              } else {
                console.error(`[JoinClipsSingleJoin] Failed to create variant, falling through to child generation creation`);
              }
            }
          }

          // Extract child-specific params from orchestrator_details if available
          const orchDetails = taskData.params?.orchestrator_details;
          if (orchDetails && !isNaN(childOrder)) {
            console.log(`[GenMigration] Extracting specific params for child segment ${childOrder}`);

            // SPECIAL CASE: For travel orchestrators with only 1 segment, the segment IS the final output
            // This covers both 1-image i2v and 2-image travel (no travel_stitch needed)
            // Create a variant on the parent generation with this segment's output
            if (childOrder === 0) {
              const numSegments = orchDetails.num_new_segments_to_generate;
              if (numSegments === 1 && parentGenerationId) {
                console.log(`[TravelSingleSegment] Detected segment 0 of single-segment orchestrator - creating variant for parent generation ${parentGenerationId}`);
                
                // Use createVariantOnParent to properly create a variant and update the parent
                // CRITICAL: Include tool_type for proper filtering in the gallery
                const singleSegmentResult = await createVariantOnParent(
                  parentGenerationId,
                  'travel_segment',
                  {
                    tool_type: 'travel-between-images',
                    created_from: 'single_segment_travel',
                    segment_index: 0,
                    is_single_segment: true,
                  }
                );
                
                if (singleSegmentResult) {
                  console.log(`[TravelSingleSegment] Successfully created variant and updated parent generation`);
                  
                  // Also mark the orchestrator task as generation_created=true to be safe
                  await supabase
                    .from('tasks')
                    .update({ generation_created: true })
                    .eq('id', orchestratorTaskId);
                  
                  // Return early - we've handled this as a variant, not a child generation
                  return singleSegmentResult;
                } else {
                  console.error(`[TravelSingleSegment] Failed to create variant, falling through to child generation creation`);
                }
              }
            }

            // Create a copy of params to modify for this child generation
            // We want to override generic arrays with specific values for this segment
            const specificParams = { ...taskData.params };

            // Helper to extract from array safely
            const extractFromArray = (arr: any[], index: number) => {
              if (Array.isArray(arr) && index >= 0 && index < arr.length) {
                return arr[index];
              }
              return undefined;
            };

            // Extract specific prompt
            const specificPrompt = extractFromArray(orchDetails.base_prompts_expanded, childOrder);
            if (specificPrompt !== undefined) {
              specificParams.prompt = specificPrompt;
              console.log(`[GenMigration] Set child prompt: "${specificPrompt.substring(0, 20)}..."`);
            }

            // Extract specific negative prompt
            const specificNegativePrompt = extractFromArray(orchDetails.negative_prompts_expanded, childOrder);
            if (specificNegativePrompt !== undefined) {
              specificParams.negative_prompt = specificNegativePrompt;
            }

            // Extract specific frames count
            const specificFrames = extractFromArray(orchDetails.segment_frames_expanded, childOrder);
            if (specificFrames !== undefined) {
              specificParams.num_frames = specificFrames;
            }

            // Extract specific overlap
            const specificOverlap = extractFromArray(orchDetails.frame_overlap_expanded, childOrder);
            if (specificOverlap !== undefined) {
              specificParams.frame_overlap = specificOverlap;
            }

            // Use these specific params for the generation
            taskData.params = specificParams;
          }
        }
      }
    } else if (taskData.task_types?.category === 'orchestration') {
      // This IS the orchestrator task completing
      // Check if a placeholder generation already exists (created by a child)
      console.log(`[GenMigration] Orchestrator task ${taskId} completing - checking for existing placeholder generation`);

      // We need to find a generation that lists this task as its creator (tasks array)
      // BUT for the "Lazy Parent" pattern, the placeholder was created with tasks=[orchestratorTaskId]
      // So findExistingGeneration should have already found it above IF we had already added this task ID to it.
      // However, the placeholder is created with the orchestrator ID in the tasks array.
      // So findExistingGeneration(taskId) SHOULD have found it if taskId == orchestratorTaskId.

      // If we are here, it means findExistingGeneration didn't find it, OR it found it but we want to update it.
      // Wait, if findExistingGeneration found it, we returned early above.
      // So if we are here, either it doesn't exist, OR findExistingGeneration logic needs to be robust.

      // Actually, if the orchestrator is completing, we want to UPDATE the placeholder if it exists,
      // or CREATE it if it doesn't (no children finished yet? unlikely for travel, but possible).

      // Let's try to find it again specifically by looking for the orchestrator ID in the tasks array
      // (which findExistingGeneration does).

      // If we are here, it means NO generation exists for this orchestrator task yet.
      // This implies no children have finished yet (or they failed to create parent).
      // So we proceed to create it as a new generation (which becomes the parent).
      console.log(`[GenMigration] No existing generation found for orchestrator, creating new one`);
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

    // Find source generation for based_on tracking
    let basedOnGenerationId: string | null = null;

    // PRIORITY 1: Check if based_on is provided in task params (searches multiple nested paths)
    basedOnGenerationId = extractBasedOn(taskData.params);

    // PRIORITY 2: Fall back to looking up by image URL (for magic edit tasks without explicit based_on)
    if (!basedOnGenerationId) {
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

      // Parent/Child fields
      parent_generation_id: parentGenerationId,
      is_child: isChild,
      child_order: childOrder,

      created_at: new Date().toISOString()
    };

    const newGeneration = await insertGeneration(supabase, generationRecord);
    console.log(`[GenMigration] Created generation ${newGeneration.id} for task ${taskId}`);

    // For child generations (segments), ALSO create a variant on the parent to track history
    // This allows the parent to show all segment outputs in its variant history
    // NOTE: We set is_primary=false for multi-segment travels - the travel_stitch output becomes primary
    if (isChild && parentGenerationId) {
      console.log(`[GenMigration] Creating variant on parent ${parentGenerationId} for child segment ${childOrder}`);
      try {
        await createVariant(
          supabase,
          parentGenerationId,
          publicUrl,
          thumbnailUrl || null,
          {
            ...taskData.params,
            tool_type: 'travel-between-images', // CRITICAL: Include tool_type for proper filtering in the gallery
            source_task_id: taskId,
            created_from: 'travel_segment',
            segment_index: childOrder,
            child_generation_id: newGeneration.id,
          },
          false,              // is_primary=false - travel_stitch will set the final primary
          'travel_segment',   // variant_type
          `Segment ${(childOrder ?? 0) + 1}` // name
        );
        console.log(`[GenMigration] Created segment variant on parent ${parentGenerationId}`);
      } catch (variantErr) {
        console.error(`[GenMigration] Error creating variant for child segment:`, variantErr);
        // Don't fail - the child generation was already created successfully
      }
    }

    // Link to shot if applicable
    // NOTE: For child generations, we typically DON'T link them to the shot directly if the parent is linked
    // But the user might want them to appear in the shot's generation list?
    // Usually, only the parent (final video) is the "shot generation".
    // The children are just details of that parent.
    // So if isChild is true, we might SKIP linking to shot, OR link it but maybe the UI handles it.
    // For now, we'll link it if shotId is present, but maybe we should check logic.
    // If the parent is linked, the children are accessible via the parent.
    // Linking children to the shot might clutter the shot's generation list.
    // Let's SKIP linking to shot if it is a child generation.
    if (shotId && !isChild) {
      await linkGenerationToShot(supabase, shotId, newGeneration.id, addInPosition);
    } else if (shotId && isChild) {
      console.log(`[GenMigration] Skipping direct shot link for child generation ${newGeneration.id} (parent will be linked)`);
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

/**
 * Get existing parent generation or create a placeholder
 * This implements the "Lazy Parent Creation" pattern
 * @param segmentParams - Optional params from segment task, used as fallback for shot_id if orchestrator query fails
 */
async function getOrCreateParentGeneration(supabase: any, orchestratorTaskId: string, projectId: string, segmentParams?: any): Promise<any> {
  try {
    // 0. FIRST: Check if the orchestrator already specifies a parent_generation_id
    // This is used by edit-video and similar tools where the user selects an existing video to edit
    // In this case, we should use that existing generation as the parent, NOT create a placeholder
    let orchTask: { task_type?: string; params?: any } | null = null;
    try {
      const { data } = await supabase
        .from('tasks')
        .select('task_type, params')
        .eq('id', orchestratorTaskId)
        .single();
      orchTask = data;
    } catch (orchQueryError) {
      console.log(`[GenMigration] Could not fetch orchestrator task ${orchestratorTaskId} (may not be a UUID), using segment params as fallback`);
    }

    // Check for parent_generation_id in orchestrator params (or orchestrator_details)
    const parentGenId = orchTask?.params?.parent_generation_id || 
                        orchTask?.params?.orchestrator_details?.parent_generation_id ||
                        segmentParams?.full_orchestrator_payload?.parent_generation_id;
    
    if (parentGenId) {
      console.log(`[GenMigration] Orchestrator has parent_generation_id: ${parentGenId}, using existing generation`);
      // Fetch and return the existing generation
      const { data: existingParent, error: parentError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', parentGenId)
        .single();
      
      if (existingParent && !parentError) {
        console.log(`[GenMigration] Using existing parent generation ${parentGenId}`);
        return existingParent;
      } else {
        console.warn(`[GenMigration] parent_generation_id ${parentGenId} not found in database, falling back to placeholder creation`);
      }
    }
    
    // 1. Try to find existing generation for this orchestrator task
    const existing = await findExistingGeneration(supabase, orchestratorTaskId);
    if (existing) {
      return existing;
    }

    console.log(`[GenMigration] Creating placeholder parent generation for orchestrator ${orchestratorTaskId}`);

    // 2. Create placeholder parent (orchTask was already fetched above)
    const generationType = 'video'; // Orchestrators usually produce video (travel, etc)
    // If we could look up task_type -> content_type that would be better, but 'video' is safe for now for travel.

    const newId = crypto.randomUUID();
    
    // Use orchestrator task params if available, otherwise fall back to segment params
    // This ensures we have useful params for the parent generation even if orchestrator query failed
    // CRITICAL: Ensure tool_type is set for proper filtering in the gallery
    const baseParams = orchTask?.params || segmentParams || {};
    const placeholderParams = {
      ...baseParams,
      // If orchestrator params are available, use their tool_type; otherwise default to travel-between-images
      // (since this function is only called for travel orchestrators)
      tool_type: baseParams.tool_type || 'travel-between-images'
    };
    
    const placeholderRecord = {
      id: newId,
      tasks: [orchestratorTaskId],
      project_id: projectId,
      type: generationType,
      is_child: false,
      // Mark as placeholder? We don't have a specific flag, but location is null.
      location: null,
      created_at: new Date().toISOString(),
      params: placeholderParams
    };

    const { data: newParent, error } = await supabase
      .from('generations')
      .insert(placeholderRecord)
      .select()
      .single();

    if (error) {
      // Handle race condition: if insert failed because unique constraint (unlikely on UUID) 
      // or if someone else created it in the meantime (if we had a unique constraint on tasks... which we don't really enforce strictly in DB but logic implies it)
      console.error(`[GenMigration] Error creating placeholder parent:`, error);
      // Try to find it again just in case of race condition
      return await findExistingGeneration(supabase, orchestratorTaskId);
    }

    console.log(`[GenMigration] Created placeholder parent ${newId}`);

    // Link parent to shot if orchestrator has shot_id
    // Try orchestrator task params first, fall back to segment params
    const paramsForShotExtraction = orchTask?.params || segmentParams;
    if (paramsForShotExtraction) {
      const { shotId, addInPosition } = extractShotAndPosition(paramsForShotExtraction);
      if (shotId) {
        console.log(`[GenMigration] Linking parent generation ${newId} to shot ${shotId}`);
        await linkGenerationToShot(supabase, shotId, newId, addInPosition);
      }
    }

    return newParent;

  } catch (error) {
    console.error(`[GenMigration] Exception in getOrCreateParentGeneration:`, error);
    return null;
  }
}

// ===== UTILITY FUNCTIONS =====

function getContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
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
