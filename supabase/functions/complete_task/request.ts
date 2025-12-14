/**
 * Request parsing and validation for complete_task
 */

import { getContentType } from './params.ts';

// ===== TYPES =====

/**
 * Upload mode for complete-task requests
 */
export type UploadMode = 'base64' | 'presigned' | 'reference';

/**
 * Parsed request data from complete-task endpoint
 */
export interface ParsedRequest {
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
export type ParseResult = 
  | { success: true; data: ParsedRequest }
  | { success: false; response: Response };

// ===== REQUEST PARSING =====

/**
 * Parse and validate the incoming request
 * Does structural validation only - security checks (orchestrator validation) happen later
 */
export async function parseCompleteTaskRequest(req: Request): Promise<ParseResult> {
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

// ===== SECURITY VALIDATION =====

/**
 * Validate that a storage path is allowed for the given task
 * Called after Supabase client is available for orchestrator check
 */
export async function validateStoragePathSecurity(
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

