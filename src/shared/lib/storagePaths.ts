/**
 * Centralized storage path utilities
 * 
 * All file uploads should use these utilities to construct storage paths.
 * This ensures consistent path structure across the app and makes it easy
 * to change the structure in one place if needed.
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
 * @param filename - Original filename
 * @param mimeType - Optional MIME type for fallback (e.g., 'image/png')
 * @param defaultExt - Default extension if all else fails
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
   * @example storagePaths.upload('user-123', 'image.png') → 'user-123/uploads/image.png'
   */
  upload: (userId: string, filename: string): string => 
    `${userId}/uploads/${filename}`,

  /**
   * Path for thumbnail files
   * @example storagePaths.thumbnail('user-123', 'thumb_123_abc.jpg') → 'user-123/thumbnails/thumb_123_abc.jpg'
   */
  thumbnail: (userId: string, filename: string): string => 
    `${userId}/thumbnails/${filename}`,

  /**
   * Path for task/worker output files (used with pre-signed URLs)
   * @example storagePaths.taskOutput('user-123', 'task-456', 'output.mp4') → 'user-123/tasks/task-456/output.mp4'
   */
  taskOutput: (userId: string, taskId: string, filename: string): string => 
    `${userId}/tasks/${taskId}/${filename}`,

  /**
   * Path for task/worker thumbnail files
   * @example storagePaths.taskThumbnail('user-123', 'task-456', 'thumb.jpg') → 'user-123/tasks/task-456/thumbnails/thumb.jpg'
   */
  taskThumbnail: (userId: string, taskId: string, filename: string): string => 
    `${userId}/tasks/${taskId}/thumbnails/${filename}`,
};

/**
 * The bucket name for all media uploads
 */
export const MEDIA_BUCKET = 'image_uploads';





