/**
 * Storage operations for complete_task
 * Handles file uploads, thumbnail generation, and URL retrieval
 */

import { getContentType } from './params.ts';
import type { ParsedRequest } from './request.ts';
import { storagePaths, MEDIA_BUCKET } from '../_shared/storagePaths.ts';

// ===== TYPES =====

export interface StorageResult {
  publicUrl: string;
  objectPath: string;
  thumbnailUrl: string | null;
}

// ===== STORAGE OPERATIONS =====

/**
 * Handle all storage operations based on upload mode
 * Returns the public URLs for the main file and thumbnail
 */
export async function handleStorageOperations(
  supabase: any,
  parsedRequest: ParsedRequest,
  userId: string,
  isServiceRole: boolean
): Promise<StorageResult> {
  let publicUrl: string;
  let objectPath: string;
  let thumbnailUrl: string | null = null;

  if (parsedRequest.storagePath) {
    // MODE 3/4: File already in storage
    objectPath = parsedRequest.storagePath;
    const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(objectPath);
    publicUrl = urlData.publicUrl;
    console.log(`[Storage] MODE 3/4: Retrieved public URL: ${publicUrl}`);

    // Get thumbnail URL if path provided
    if (parsedRequest.thumbnailStoragePath) {
      const { data: thumbnailUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(parsedRequest.thumbnailStoragePath);
      thumbnailUrl = thumbnailUrlData.publicUrl;
      console.log(`[Storage] MODE 3/4: Retrieved thumbnail URL: ${thumbnailUrl}`);
    }
  } else {
    // MODE 1: Upload file from base64
    const effectiveContentType = parsedRequest.fileContentType || getContentType(parsedRequest.filename);
    // Use standardized task output path: {userId}/tasks/{taskId}/{filename}
    objectPath = storagePaths.taskOutput(userId, parsedRequest.taskId, parsedRequest.filename);

    console.log(`[Storage] MODE 1: Uploading to ${objectPath}`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(objectPath, parsedRequest.fileData as any, {
        contentType: effectiveContentType,
        upsert: true
      });

    if (uploadError) {
      console.error("[Storage] Upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(objectPath);
    publicUrl = urlData.publicUrl;
    console.log(`[Storage] MODE 1: Upload successful: ${publicUrl}`);

    // Handle thumbnail
    thumbnailUrl = await handleThumbnail(
      supabase,
      parsedRequest,
      userId,
      parsedRequest.taskId,
      publicUrl
    );
  }

  return { publicUrl, objectPath, thumbnailUrl };
}

/**
 * Handle thumbnail upload or generation
 */
async function handleThumbnail(
  supabase: any,
  parsedRequest: ParsedRequest,
  userId: string,
  taskId: string,
  mainFileUrl: string
): Promise<string | null> {
  // If thumbnail was provided, upload it
  if (parsedRequest.thumbnailData && parsedRequest.thumbnailFilename) {
    console.log(`[Storage] Uploading provided thumbnail`);
    try {
      // Use standardized task thumbnail path: {userId}/tasks/{taskId}/thumbnails/{filename}
      const thumbnailPath = storagePaths.taskThumbnail(userId, taskId, parsedRequest.thumbnailFilename);
      const { error: thumbnailUploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(thumbnailPath, parsedRequest.thumbnailData as any, {
          contentType: parsedRequest.thumbnailContentType || getContentType(parsedRequest.thumbnailFilename),
          upsert: true
        });

      if (thumbnailUploadError) {
        console.error("[Storage] Thumbnail upload error:", thumbnailUploadError);
        return null;
      }

      const { data: thumbnailUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(thumbnailPath);
      console.log(`[Storage] Thumbnail uploaded: ${thumbnailUrlData.publicUrl}`);
      return thumbnailUrlData.publicUrl;
    } catch (thumbnailError) {
      console.error("[Storage] Error processing thumbnail:", thumbnailError);
      return null;
    }
  }

  // Auto-generate thumbnail for images using Supabase transforms
  const contentType = getContentType(parsedRequest.filename);
  if (contentType.startsWith("image/")) {
    // Pass objectPath for SDK-based transforms (objectPath is available from the caller context)
    const objectPath = storagePaths.taskOutput(userId, taskId, parsedRequest.filename);
    return generateThumbnail(supabase, parsedRequest.fileData!, userId, taskId, mainFileUrl, objectPath);
  }

  return null;
}

/**
 * Auto-generate a thumbnail URL using Supabase Image Transformations
 * Uses the SDK's transform option for proper URL generation
 * Falls back to main image URL if transforms aren't available (requires Pro plan)
 *
 * @see https://supabase.com/docs/guides/storage/serving/image-transformations
 */
function generateThumbnail(
  supabase: any,
  _sourceBytes: Uint8Array,
  _userId: string,
  _taskId: string,
  mainImageUrl: string,
  objectPath?: string
): string {
  console.log(`[ThumbnailGen] Using Supabase image transforms for thumbnail`);

  // If we have the object path, use the SDK's transform option (recommended)
  if (objectPath) {
    try {
      const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(objectPath, {
        transform: {
          width: 400,
          height: 400,
          resize: 'contain',
          quality: 80,
        },
      });
      if (data?.publicUrl) {
        console.log(`[ThumbnailGen] ✅ Generated thumbnail URL via SDK transform`);
        return data.publicUrl;
      }
    } catch (err) {
      console.warn(`[ThumbnailGen] SDK transform failed, using main URL:`, err);
    }
  }

  // Fallback: Use main image URL (works on all plans, just no resizing)
  // This is fine for most use cases - browser will handle display sizing
  console.log(`[ThumbnailGen] Using main image URL as thumbnail (no transform)`);
  return mainImageUrl;
}

/**
 * Verify that a file exists in storage (for MODE 4)
 */
export async function verifyFileExists(
  supabase: any,
  storagePath: string
): Promise<{ exists: boolean; publicUrl?: string }> {
  try {
    const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
    if (!urlData?.publicUrl) {
      return { exists: false };
    }
    return { exists: true, publicUrl: urlData.publicUrl };
  } catch (error) {
    console.error(`[Storage] Error verifying file:`, error);
    return { exists: false };
  }
}

/**
 * Clean up uploaded file (e.g., on DB error)
 */
export async function cleanupFile(
  supabase: any,
  objectPath: string
): Promise<void> {
  try {
    await supabase.storage.from(MEDIA_BUCKET).remove([objectPath]);
    console.log(`[Storage] Cleaned up file: ${objectPath}`);
  } catch (error) {
    console.error(`[Storage] Failed to cleanup file:`, error);
  }
}

