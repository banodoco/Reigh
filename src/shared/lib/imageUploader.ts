import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/integrations/supabase/config/env";
import { storagePaths, getFileExtension, generateUniqueFilename, MEDIA_BUCKET } from "./storagePaths";

/**
 * Helper function to wait for a specified amount of time
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Default timeouts
const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds for images
const STALL_TIMEOUT_MS = 15000; // 15 seconds without progress = stalled

export interface UploadOptions {
  maxRetries?: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Uploads an image file with retry mechanism, timeout, abort support, and optional progress tracking.
 * Returns the public URL of the uploaded image.
 */
export const uploadImageToStorage = async (
  file: File,
  maxRetriesOrOptions?: number | UploadOptions,
  onProgress?: (progress: number) => void
): Promise<string> => {
  // Handle both old signature (maxRetries, onProgress) and new signature (options)
  let options: UploadOptions;
  if (typeof maxRetriesOrOptions === 'object') {
    options = maxRetriesOrOptions;
  } else {
    options = {
      maxRetries: maxRetriesOrOptions ?? 3,
      onProgress,
    };
  }

  const {
    maxRetries = 3,
    onProgress: progressCallback,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = options;
  if (!file) {
    throw new Error("No file provided");
  }

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error('Upload cancelled');
  }

  // Get current user ID for storage path organization
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    throw new Error('User not authenticated');
  }
  const userId = session.user.id;

  // Generate storage path using centralized utilities
  const fileExtension = getFileExtension(file.name, file.type);
  const filename = generateUniqueFilename(fileExtension);
  const filePath = storagePaths.upload(userId, filename);

  // Add debug logging for large file uploads
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
  console.log(`[ImageUpload] Starting upload for ${file.name} (${fileSizeMB}MB) to path: ${filePath} (max retries: ${maxRetries}, timeout: ${timeoutMs}ms)`);

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const uploadStartTime = Date.now();

    // Check abort before each attempt
    if (signal?.aborted) {
      throw new Error('Upload cancelled');
    }

    try {
      console.log(`[ImageUpload] Upload attempt ${attempt}/${maxRetries} for ${file.name}`);

      let data: any, error: any;

      // Always use XHR for timeout/abort/stall support
      try {
        const bucketUrl = `${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${filePath}`;

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

          // Stall detection - check every 5 seconds if we've had progress
          stallCheckInterval = setInterval(() => {
            const timeSinceLastProgress = Date.now() - lastProgressTime;
            if (timeSinceLastProgress > STALL_TIMEOUT_MS) {
              console.warn(`[ImageUpload] Upload stalled for ${file.name} - no progress for ${timeSinceLastProgress}ms`);
              cleanup();
              xhr.abort();
              reject(new Error(`Upload stalled - no progress for ${STALL_TIMEOUT_MS}ms`));
            }
          }, 5000);

          // Handle abort signal
          const abortHandler = () => {
            cleanup();
            xhr.abort();
            reject(new Error('Upload cancelled'));
          };
          signal?.addEventListener('abort', abortHandler);

          xhr.upload.addEventListener('progress', (e) => {
            lastProgressTime = Date.now();
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              progressCallback?.(percentComplete);
            }
          });

          xhr.addEventListener('load', () => {
            cleanup();
            signal?.removeEventListener('abort', abortHandler);
            if (xhr.status >= 200 && xhr.status < 300) {
              progressCallback?.(100);
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
            }
          });

          xhr.addEventListener('error', () => {
            cleanup();
            signal?.removeEventListener('abort', abortHandler);
            reject(new Error('Network error'));
          });

          xhr.addEventListener('abort', () => {
            cleanup();
            signal?.removeEventListener('abort', abortHandler);
            // Don't reject here - we reject in the abort handler with specific message
          });

          xhr.open('POST', bucketUrl);
          xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.setRequestHeader('Cache-Control', '3600');

          xhr.send(file);
        });

        data = { path: filePath };
        error = null;
      } catch (xhrError) {
        error = xhrError;
        data = null;
      }

      const uploadDuration = Date.now() - uploadStartTime;

      if (error) {
        lastError = error;
        console.warn(`[ImageUpload] Upload attempt ${attempt} failed for ${file.name} after ${uploadDuration}ms:`, {
          error: error.message || error,
          fileName: file.name,
          fileSizeMB,
          attempt
        });

        // Don't retry for certain permanent errors or user cancellation
        if (error.message?.includes('413') || error.message?.includes('too large')) {
          throw new Error(`File too large: ${file.name} (${fileSizeMB}MB) exceeds the maximum allowed size.`);
        }
        if (error.message?.includes('cancelled')) {
          throw error; // Don't retry user cancellations
        }

        // If this was the last attempt, we'll throw after the loop
        if (attempt === maxRetries) {
          break;
        }

        // Wait before retrying (exponential backoff: 1s, 2s, 4s...)
        const waitTime = 1000 * Math.pow(2, attempt - 1);
        console.log(`[ImageUpload] Waiting ${waitTime}ms before retry ${attempt + 1} for ${file.name}`);
        await wait(waitTime);
        continue;
      }

      console.log(`[ImageUpload] Upload successful for ${file.name} in ${uploadDuration}ms on attempt ${attempt}`);

      if (!data || !data.path) {
        console.error(`[ImageUpload] No data or path returned for ${file.name}`);
        throw new Error("Upload did not return a path.");
      }

      // Retrieve the public URL for the newly-uploaded object
      const {
        data: { publicUrl },
      } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(data.path);

      if (!publicUrl) {
        console.error(`[ImageUpload] Failed to get public URL for ${file.name}, path: ${data.path}`);
        throw new Error('Failed to obtain a public URL for the uploaded image.');
      }

      console.log(`[ImageUpload] Upload complete for ${file.name}: ${publicUrl.substring(0, 60)}...`);
      return publicUrl;

    } catch (uploadError: any) {
      lastError = uploadError;
      const uploadDuration = Date.now() - uploadStartTime;

      console.warn(`[ImageUpload] Upload attempt ${attempt} exception for ${file.name} after ${uploadDuration}ms:`, uploadError.message);

      // Don't retry for certain permanent errors or user cancellation
      if (uploadError.message?.includes('413') || uploadError.message?.includes('too large')) {
        throw uploadError;
      }
      if (uploadError.message?.includes('cancelled')) {
        throw uploadError; // Don't retry user cancellations
      }

      // If this was the last attempt, we'll throw after the loop
      if (attempt === maxRetries) {
        break;
      }

      // Wait before retrying (exponential backoff)
      const waitTime = 1000 * Math.pow(2, attempt - 1);
      console.log(`[ImageUpload] Waiting ${waitTime}ms before retry ${attempt + 1} for ${file.name}`);
      await wait(waitTime);
    }
  }

  // If we get here, all retries failed
  console.error(`[ImageUpload] All ${maxRetries} upload attempts failed for ${file.name}`);

  // Provide more specific error messages based on the error type
  if (lastError?.message?.includes('cancelled')) {
    throw new Error('Upload cancelled');
  } else if (lastError?.message?.includes('timed out') || lastError?.message?.includes('stalled')) {
    throw new Error(`Upload failed: ${file.name} (${fileSizeMB}MB) - connection too slow or unstable. Please check your connection and try again.`);
  } else {
    throw new Error(`Failed to upload image after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }
};

/**
 * Upload a Blob (e.g., thumbnail) to storage with same timeout/retry support
 */
export const uploadBlobToStorage = async (
  blob: Blob,
  filename: string,
  contentType: string,
  options: UploadOptions = {}
): Promise<string> => {
  // Convert blob to file for consistent handling
  const file = new File([blob], filename, { type: contentType });
  return uploadImageToStorage(file, options);
};
