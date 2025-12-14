/**
 * Storage operations for complete_task
 * Handles file uploads, thumbnail generation, and URL retrieval
 */

// @ts-ignore
import { Image as ImageScript } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { getContentType } from './params.ts';
import type { ParsedRequest } from './request.ts';

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
    const { data: urlData } = supabase.storage.from('image_uploads').getPublicUrl(objectPath);
    publicUrl = urlData.publicUrl;
    console.log(`[Storage] MODE 3/4: Retrieved public URL: ${publicUrl}`);

    // Get thumbnail URL if path provided
    if (parsedRequest.thumbnailStoragePath) {
      const { data: thumbnailUrlData } = supabase.storage.from('image_uploads').getPublicUrl(parsedRequest.thumbnailStoragePath);
      thumbnailUrl = thumbnailUrlData.publicUrl;
      console.log(`[Storage] MODE 3/4: Retrieved thumbnail URL: ${thumbnailUrl}`);
    }
  } else {
    // MODE 1: Upload file from base64
    const effectiveContentType = parsedRequest.fileContentType || getContentType(parsedRequest.filename);
    objectPath = `${userId}/${parsedRequest.filename}`;

    console.log(`[Storage] MODE 1: Uploading to ${objectPath}`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('image_uploads')
      .upload(objectPath, parsedRequest.fileData as any, {
        contentType: effectiveContentType,
        upsert: true
      });

    if (uploadError) {
      console.error("[Storage] Upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('image_uploads').getPublicUrl(objectPath);
    publicUrl = urlData.publicUrl;
    console.log(`[Storage] MODE 1: Upload successful: ${publicUrl}`);

    // Handle thumbnail
    thumbnailUrl = await handleThumbnail(
      supabase,
      parsedRequest,
      userId,
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
  mainFileUrl: string
): Promise<string | null> {
  // If thumbnail was provided, upload it
  if (parsedRequest.thumbnailData && parsedRequest.thumbnailFilename) {
    console.log(`[Storage] Uploading provided thumbnail`);
    try {
      const thumbnailPath = `${userId}/thumbnails/${parsedRequest.thumbnailFilename}`;
      const { error: thumbnailUploadError } = await supabase.storage
        .from('image_uploads')
        .upload(thumbnailPath, parsedRequest.thumbnailData as any, {
          contentType: parsedRequest.thumbnailContentType || getContentType(parsedRequest.thumbnailFilename),
          upsert: true
        });

      if (thumbnailUploadError) {
        console.error("[Storage] Thumbnail upload error:", thumbnailUploadError);
        return null;
      }

      const { data: thumbnailUrlData } = supabase.storage.from('image_uploads').getPublicUrl(thumbnailPath);
      console.log(`[Storage] Thumbnail uploaded: ${thumbnailUrlData.publicUrl}`);
      return thumbnailUrlData.publicUrl;
    } catch (thumbnailError) {
      console.error("[Storage] Error processing thumbnail:", thumbnailError);
      return null;
    }
  }

  // Auto-generate thumbnail for images
  const contentType = getContentType(parsedRequest.filename);
  if (contentType.startsWith("image/") && parsedRequest.fileData) {
    return await generateThumbnail(supabase, parsedRequest.fileData, userId);
  }

  return null;
}

/**
 * Auto-generate a thumbnail from image data (1/3 size)
 */
async function generateThumbnail(
  supabase: any,
  sourceBytes: Uint8Array,
  userId: string
): Promise<string | null> {
  console.log(`[ThumbnailGen] Starting auto-thumbnail generation`);
  
  try {
    const image = await ImageScript.decode(sourceBytes);
    const originalWidth = image.width;
    const originalHeight = image.height;
    console.log(`[ThumbnailGen] Original dimensions: ${originalWidth}x${originalHeight}`);

    const thumbWidth = Math.max(1, Math.round(originalWidth / 3));
    const thumbHeight = Math.max(1, Math.round(originalHeight / 3));
    console.log(`[ThumbnailGen] Thumbnail dimensions: ${thumbWidth}x${thumbHeight}`);

    image.resize(thumbWidth, thumbHeight);
    const jpegQuality = 80;
    const thumbBytes = await image.encodeJPEG(jpegQuality);
    console.log(`[ThumbnailGen] Encoded JPEG: ${thumbBytes.length} bytes`);

    // Upload thumbnail
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    const thumbFilename = `thumb_${ts}_${rand}.jpg`;
    const thumbPath = `${userId}/thumbnails/${thumbFilename}`;

    const { error: uploadErr } = await supabase.storage
      .from('image_uploads')
      .upload(thumbPath, thumbBytes, { contentType: 'image/jpeg', upsert: true });

    if (uploadErr) {
      console.error('[ThumbnailGen] Upload error:', uploadErr);
      return null;
    }

    const { data: thumbUrlData } = supabase.storage.from('image_uploads').getPublicUrl(thumbPath);
    console.log(`[ThumbnailGen] ✅ Auto-generated thumbnail: ${thumbUrlData.publicUrl}`);
    return thumbUrlData.publicUrl;

  } catch (err: any) {
    console.error('[ThumbnailGen] Generation failed:', err);
    return null;
  }
}

/**
 * Verify that a file exists in storage (for MODE 4)
 */
export async function verifyFileExists(
  supabase: any,
  storagePath: string
): Promise<{ exists: boolean; publicUrl?: string }> {
  try {
    const { data: urlData } = supabase.storage.from('image_uploads').getPublicUrl(storagePath);
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
    await supabase.storage.from('image_uploads').remove([objectPath]);
    console.log(`[Storage] Cleaned up file: ${objectPath}`);
  } catch (error) {
    console.error(`[Storage] Failed to cleanup file:`, error);
  }
}

