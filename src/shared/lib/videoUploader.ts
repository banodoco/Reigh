import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/integrations/supabase/config/env";
import { storagePaths, getFileExtension, generateUniqueFilename, MEDIA_BUCKET } from "./storagePaths";

// Default timeouts for video (longer than images)
const DEFAULT_VIDEO_TIMEOUT_MS = 300000; // 5 minutes for videos
const STALL_TIMEOUT_MS = 30000; // 30 seconds without progress = stalled (longer for videos)

export interface VideoUploadOptions {
  onProgress?: (progress: number) => void;
  maxRetries?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface VideoMetadata {
  duration_seconds: number;
  frame_rate: number;
  total_frames: number;
  width: number;
  height: number;
  file_size: number;
}

/**
 * Extracts video metadata using HTML5 Video API
 */
export const extractVideoMetadata = async (file: File): Promise<VideoMetadata> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      
      // Estimate frame rate (assume 30fps as standard, could be improved)
      const frameRate = 30;
      const totalFrames = Math.floor(duration * frameRate);
      
      URL.revokeObjectURL(video.src);
      
      resolve({
        duration_seconds: duration,
        frame_rate: frameRate,
        total_frames: totalFrames,
        width,
        height,
        file_size: file.size
      });
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = URL.createObjectURL(file);
  });
};

/**
 * Extracts video metadata from a URL (for videos already uploaded)
 */
export const extractVideoMetadataFromUrl = async (videoUrl: string): Promise<VideoMetadata> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous'; // Handle CORS for external URLs
    
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      
      // Estimate frame rate (assume 30fps as standard, could be improved)
      const frameRate = 30;
      const totalFrames = Math.floor(duration * frameRate);
      
      resolve({
        duration_seconds: duration,
        frame_rate: frameRate,
        total_frames: totalFrames,
        width,
        height,
        file_size: 0 // Unknown from URL
      });
    };
    
    video.onerror = (e) => {
      console.error('[extractVideoMetadataFromUrl] Error loading video:', e);
      reject(new Error('Failed to load video metadata from URL'));
    };
    
    video.src = videoUrl;
  });
};

/**
 * Uploads a video file to Supabase storage with real progress tracking,
 * timeout, abort support, and stall detection.
 *
 * Note: projectId and shotId params are kept for backwards compatibility but
 * are no longer used in the storage path (tracked in DB instead).
 */
export const uploadVideoToStorage = async (
  file: File,
  projectId: string,
  shotId: string,
  onProgressOrOptions?: ((progress: number) => void) | VideoUploadOptions,
  maxRetriesParam: number = 3
): Promise<string> => {
  // Handle both old signature and new options object
  let options: VideoUploadOptions;
  if (typeof onProgressOrOptions === 'function') {
    options = { onProgress: onProgressOrOptions, maxRetries: maxRetriesParam };
  } else {
    options = onProgressOrOptions || {};
  }

  const {
    onProgress,
    maxRetries = 3,
    signal,
    timeoutMs = DEFAULT_VIDEO_TIMEOUT_MS
  } = options;

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error('Upload cancelled');
  }

  // Get session for auth and user ID
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token || !session?.session?.user?.id) {
    throw new Error('No active session');
  }
  const userId = session.session.user.id;

  // Generate storage path using centralized utilities
  const fileExt = getFileExtension(file.name, file.type, 'mp4');
  const filename = generateUniqueFilename(fileExt);
  const fileName = storagePaths.upload(userId, filename);

  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
  console.log(`[VideoUpload] Starting upload for ${file.name} (${fileSizeMB}MB) to path: ${fileName} (max retries: ${maxRetries}, timeout: ${timeoutMs}ms)`);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Check abort before each attempt
    if (signal?.aborted) {
      throw new Error('Upload cancelled');
    }

    try {
      console.log(`[VideoUpload] Upload attempt ${attempt + 1}/${maxRetries}:`, fileName);

      const bucketUrl = `${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${fileName}`;

      // Upload with XMLHttpRequest to track progress, with timeout and stall detection
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let lastProgressTime = Date.now();
        let stallCheckInterval: ReturnType<typeof setInterval> | null = null;
        let overallTimeout: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
          if (stallCheckInterval) clearInterval(stallCheckInterval);
          if (overallTimeout) clearTimeout(overallTimeout);
        };

        // Overall timeout
        overallTimeout = setTimeout(() => {
          cleanup();
          xhr.abort();
          reject(new Error(`Upload timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        // Stall detection - check every 10 seconds if we've had progress
        stallCheckInterval = setInterval(() => {
          const timeSinceLastProgress = Date.now() - lastProgressTime;
          if (timeSinceLastProgress > STALL_TIMEOUT_MS) {
            console.warn(`[VideoUpload] Upload stalled for ${file.name} - no progress for ${timeSinceLastProgress}ms`);
            cleanup();
            xhr.abort();
            reject(new Error(`Upload stalled - no progress for ${STALL_TIMEOUT_MS}ms`));
          }
        }, 10000);

        // Handle abort signal
        const abortHandler = () => {
          cleanup();
          xhr.abort();
          reject(new Error('Upload cancelled'));
        };
        signal?.addEventListener('abort', abortHandler);

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          lastProgressTime = Date.now();
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            onProgress?.(percentComplete);
          }
        });

        xhr.addEventListener('load', () => {
          cleanup();
          signal?.removeEventListener('abort', abortHandler);
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100);
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          cleanup();
          signal?.removeEventListener('abort', abortHandler);
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
          cleanup();
          signal?.removeEventListener('abort', abortHandler);
          // Don't reject here - we reject in specific handlers with message
        });

        xhr.open('POST', bucketUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${session.session!.access_token}`);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.setRequestHeader('Cache-Control', '3600');

        xhr.send(file);
      });

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(fileName);

      console.log(`[VideoUpload] Upload successful: ${publicUrl.substring(0, 60)}...`);
      return publicUrl;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown upload error');
      console.error(`[VideoUpload] Upload attempt ${attempt + 1} failed:`, lastError.message);

      // Don't retry for user cancellation
      if (lastError.message.includes('cancelled')) {
        throw lastError;
      }

      if (attempt < maxRetries - 1) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[VideoUpload] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Provide more specific error messages
  if (lastError?.message.includes('cancelled')) {
    throw new Error('Upload cancelled');
  } else if (lastError?.message.includes('timed out') || lastError?.message.includes('stalled')) {
    throw new Error(`Video upload failed: ${file.name} (${fileSizeMB}MB) - connection too slow or unstable. Please check your connection and try again.`);
  } else {
    throw lastError || new Error('Failed to upload video after multiple attempts');
  }
};

