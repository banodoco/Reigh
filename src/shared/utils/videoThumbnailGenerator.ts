/**
 * Video Thumbnail Generator
 * 
 * Extracts thumbnails from videos on the client side and uploads them to storage.
 * This is used to generate missing thumbnails for videos that don't have them.
 */

import { supabase } from '@/integrations/supabase/client';
import { getDisplayUrl } from '@/shared/lib/utils';
import { storagePaths, MEDIA_BUCKET } from '@/shared/lib/storagePaths';

export interface ThumbnailGenerationResult {
  success: boolean;
  thumbnailUrl?: string;
  error?: string;
}

export interface ThumbnailExtractResult {
  success: boolean;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * Extracts a thumbnail from a video at a specific time
 */
async function extractThumbnailFromVideo(
  videoUrl: string,
  timeInSeconds: number = 0.001
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    // Handle video loaded
    video.addEventListener('loadedmetadata', () => {
      // Set canvas size to video dimensions (or max 1280px width)
      const maxWidth = 1280;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      // Seek to the desired time (or start if video is shorter)
      video.currentTime = Math.min(timeInSeconds, video.duration - 0.1);
    });

    // Handle seeked event
    video.addEventListener('seeked', () => {
      try {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to blob (JPEG, 85% quality)
        canvas.toBlob(
          (blob) => {
            video.remove();
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob from canvas'));
            }
          },
          'image/jpeg',
          0.85
        );
      } catch (error) {
        video.remove();
        reject(error);
      }
    });

    // Handle errors
    video.addEventListener('error', (e) => {
      video.remove();
      reject(new Error(`Video loading failed: ${video.error?.message || 'Unknown error'}`));
    });

    // Start loading
    video.src = getDisplayUrl(videoUrl);
  });
}

/**
 * Uploads a thumbnail blob to Supabase storage
 * Note: projectId param kept for backwards compatibility but no longer used in path
 */
async function uploadThumbnailToStorage(
  blob: Blob,
  generationId: string,
  projectId: string
): Promise<string> {
  // Get userId for storage path
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    throw new Error('User not authenticated');
  }
  const userId = session.user.id;

  const fileName = `${generationId}-thumb.jpg`;
  const filePath = storagePaths.thumbnail(userId, fileName);

  console.log('[ThumbnailGenerator] Uploading thumbnail:', {
    generationId: generationId.substring(0, 8),
    filePath,
    blobSize: blob.size,
    timestamp: Date.now()
  });

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(filePath, blob, {
      contentType: 'image/jpeg',
      upsert: true, // Overwrite if exists
    });

  if (error) {
    console.error('[ThumbnailGenerator] Upload failed:', error);
    throw error;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Updates the generation record with the new thumbnail URL
 */
async function updateGenerationThumbnail(
  generationId: string,
  thumbnailUrl: string
): Promise<void> {
  console.log('[ThumbnailGenerator] Updating database:', {
    generationId: generationId.substring(0, 8),
    thumbnailUrl: thumbnailUrl.substring(0, 50) + '...',
    timestamp: Date.now()
  });

  const { error } = await supabase
    .from('generations')
    .update({ thumbnail_url: thumbnailUrl })
    .eq('id', generationId);

  if (error) {
    console.error('[ThumbnailGenerator] Database update failed:', error);
    throw error;
  }
}

/**
 * Main function: Generates and uploads a thumbnail for a video
 */
export async function generateAndUploadThumbnail(
  videoUrl: string,
  generationId: string,
  projectId: string
): Promise<ThumbnailGenerationResult> {
  try {
    console.log('[ThumbnailGenerator] Starting generation:', {
      generationId: generationId.substring(0, 8),
      videoUrl: videoUrl.substring(0, 50) + '...',
      timestamp: Date.now()
    });

    // Step 1: Extract thumbnail from video (first frame)
    const thumbnailBlob = await extractThumbnailFromVideo(videoUrl, 0.001);
    console.log('[ThumbnailGenerator] Thumbnail extracted:', {
      generationId: generationId.substring(0, 8),
      blobSize: thumbnailBlob.size,
      blobType: thumbnailBlob.type,
      timestamp: Date.now()
    });

    // Step 2: Upload to storage
    const thumbnailUrl = await uploadThumbnailToStorage(thumbnailBlob, generationId, projectId);
    console.log('[ThumbnailGenerator] Thumbnail uploaded:', {
      generationId: generationId.substring(0, 8),
      thumbnailUrl: thumbnailUrl.substring(0, 50) + '...',
      timestamp: Date.now()
    });

    // Step 3: Update database
    await updateGenerationThumbnail(generationId, thumbnailUrl);
    console.log('[ThumbnailGenerator] Database updated successfully:', {
      generationId: generationId.substring(0, 8),
      timestamp: Date.now()
    });

    return {
      success: true,
      thumbnailUrl,
    };
  } catch (error) {
    console.error('[ThumbnailGenerator] Generation failed:', {
      generationId: generationId.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Extract and upload thumbnail only (no database update)
 * Use this for variants where you'll update the record yourself
 */
export async function extractAndUploadThumbnailOnly(
  videoUrl: string,
  uniqueId: string,
  projectId: string
): Promise<ThumbnailExtractResult> {
  try {
    console.log('[ThumbnailGenerator] Extracting thumbnail (no DB update):', {
      uniqueId: uniqueId.substring(0, 8),
      videoUrl: videoUrl.substring(0, 50) + '...',
    });

    // Step 1: Extract thumbnail from video (first frame)
    const thumbnailBlob = await extractThumbnailFromVideo(videoUrl, 0.001);
    
    // Step 2: Upload to storage
    const thumbnailUrl = await uploadThumbnailToStorage(thumbnailBlob, uniqueId, projectId);
    
    console.log('[ThumbnailGenerator] Thumbnail uploaded:', {
      uniqueId: uniqueId.substring(0, 8),
      thumbnailUrl: thumbnailUrl.substring(0, 50) + '...',
    });

    return {
      success: true,
      thumbnailUrl,
    };
  } catch (error) {
    console.error('[ThumbnailGenerator] Extraction failed:', {
      uniqueId: uniqueId.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
