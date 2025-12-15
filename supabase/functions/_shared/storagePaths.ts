/**
 * Centralized storage path utilities for Edge Functions
 * 
 * This is a copy of src/shared/lib/storagePaths.ts for use in Deno edge functions.
 * Keep these in sync when making changes!
 * 
 * Path Structure:
 *   {userId}/uploads/         - All media files (images + videos)
 *   {userId}/thumbnails/      - All generated thumbnails
 *   {userId}/tasks/{taskId}/  - Task/worker outputs via pre-signed URLs
 */

/**
 * Generate a unique filename with timestamp and random string
 */
export function generateUniqueFilename(extension: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}.${extension}`;
}

/**
 * Generate a unique thumbnail filename
 */
export function generateThumbnailFilename(): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `thumb_${timestamp}_${randomStr}.jpg`;
}

/**
 * Get file extension from filename, with MIME type fallback
 */
export function getFileExtension(
  filename: string,
  mimeType?: string,
  defaultExt: string = 'bin'
): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return parts.pop()!;
  }
  
  // Fallback to MIME type
  if (mimeType) {
    const mimeExt = mimeType.split('/')[1]?.replace('jpeg', 'jpg');
    if (mimeExt) return mimeExt;
  }
  
  return defaultExt;
}

/**
 * Storage path builders - all paths are user-namespaced for security
 */
export const storagePaths = {
  /**
   * Path for uploaded media files (images and videos)
   */
  upload: (userId: string, filename: string): string => 
    `${userId}/uploads/${filename}`,

  /**
   * Path for thumbnail files
   */
  thumbnail: (userId: string, filename: string): string => 
    `${userId}/thumbnails/${filename}`,

  /**
   * Path for task/worker output files (used with pre-signed URLs)
   */
  taskOutput: (userId: string, taskId: string, filename: string): string => 
    `${userId}/tasks/${taskId}/${filename}`,

  /**
   * Path for task/worker thumbnail files
   */
  taskThumbnail: (userId: string, taskId: string, filename: string): string => 
    `${userId}/tasks/${taskId}/thumbnails/${filename}`,
};

/**
 * The bucket name for all media uploads
 */
export const MEDIA_BUCKET = 'image_uploads';

