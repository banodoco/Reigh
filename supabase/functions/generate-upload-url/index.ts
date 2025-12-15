// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest, verifyTaskOwnership, getTaskUserId } from "../_shared/auth.ts";
import { storagePaths, MEDIA_BUCKET } from "../_shared/storagePaths.ts";
// Provide a loose Deno type for local tooling; real type comes at runtime in Edge Functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: generate-upload-url
 * 
 * Generates pre-signed upload URLs for task completion files.
 * This allows workers to upload large files directly to storage without
 * going through Edge Function memory limits.
 * 
 * - Service-role key: can generate URLs for any task
 * - User token: can only generate URLs for tasks they own
 * 
 * POST /functions/v1/generate-upload-url
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: {
 *   task_id: string,
 *   filename: string,
 *   content_type: string,
 *   generate_thumbnail_url?: boolean  // Optional: also generate thumbnail upload URL
 * }
 * 
 * Returns:
 * - 200 OK with { upload_url, storage_path, thumbnail_upload_url?, thumbnail_storage_path? }
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not authorized
 * - 404 Task not found
 * - 500 Internal Server Error
 */
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Parse request body
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { task_id, filename, content_type, generate_thumbnail_url } = body;
  
  console.log(`[GENERATE-UPLOAD-URL] Request for task_id: ${task_id}, filename: ${filename}`);

  if (!task_id || !filename || !content_type) {
    return new Response("task_id, filename, and content_type required", { status: 400 });
  }

  // Convert task_id to string early
  const taskIdString = String(task_id);

  // Get environment variables
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Authenticate request using shared utility
  const auth = await authenticateRequest(req, supabaseAdmin, "[GENERATE-UPLOAD-URL]");
  
  if (!auth.success) {
    return new Response(auth.error || "Authentication failed", { 
      status: auth.statusCode || 403 
    });
  }

  const isServiceRole = auth.isServiceRole;
  const callerId = auth.userId;

  try {
    // Determine user ID for storage path and verify access
    let userId;
    
    if (isServiceRole) {
      // Service role: look up task owner using shared utility
      const taskUserResult = await getTaskUserId(supabaseAdmin, taskIdString, "[GENERATE-UPLOAD-URL]");
      
      if (taskUserResult.error) {
        return new Response(taskUserResult.error, { 
          status: taskUserResult.statusCode || 404 
        });
      }
      
      userId = taskUserResult.userId;
      console.log(`[GENERATE-UPLOAD-URL] Service role storing for user: ${userId}`);
    } else {
      // User token: verify ownership using shared utility
      const ownershipResult = await verifyTaskOwnership(
        supabaseAdmin, 
        taskIdString, 
        callerId!, 
        "[GENERATE-UPLOAD-URL]"
      );
      
      if (!ownershipResult.success) {
        return new Response(ownershipResult.error || "Forbidden", { 
          status: ownershipResult.statusCode || 403 
        });
      }

      userId = callerId;
      console.log(`[GENERATE-UPLOAD-URL] Task ownership verified for user: ${userId}`);
    }

    // Generate storage paths with task_id for organization and security using centralized utilities
    const taskStoragePath = storagePaths.taskOutput(userId, taskIdString, filename);
    
    console.log(`[GENERATE-UPLOAD-URL] Generating signed upload URL for: ${taskStoragePath}`);

    // Generate signed upload URL (expires in 1 hour)
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .createSignedUploadUrl(taskStoragePath);

    if (signedError || !signedData) {
      console.error("[GENERATE-UPLOAD-URL] Failed to create signed URL:", signedError);
      return new Response(`Failed to create signed upload URL: ${signedError?.message}`, { status: 500 });
    }

    const response: any = {
      upload_url: signedData.signedUrl,
      storage_path: taskStoragePath,
      token: signedData.token,
      expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour
    };

    // Generate thumbnail upload URL if requested using centralized path utilities
    if (generate_thumbnail_url) {
      const thumbnailFilename = `thumb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
      const thumbnailPath = storagePaths.taskThumbnail(userId, taskIdString, thumbnailFilename);

      console.log(`[GENERATE-UPLOAD-URL] Generating signed upload URL for thumbnail: ${thumbnailPath}`);

      const { data: thumbSignedData, error: thumbSignedError } = await supabaseAdmin.storage
        .from(MEDIA_BUCKET)
        .createSignedUploadUrl(thumbnailPath);

      if (thumbSignedError || !thumbSignedData) {
        console.warn("[GENERATE-UPLOAD-URL] Failed to create thumbnail signed URL:", thumbSignedError);
        // Don't fail the main request
      } else {
        response.thumbnail_upload_url = thumbSignedData.signedUrl;
        response.thumbnail_storage_path = thumbnailPath;
        response.thumbnail_token = thumbSignedData.token;
      }
    }

    console.log(`[GENERATE-UPLOAD-URL] Successfully generated signed URLs for task ${taskIdString}`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[GENERATE-UPLOAD-URL] Error:", error);
    return new Response(`Internal error: ${error.message}`, { status: 500 });
  }
});
