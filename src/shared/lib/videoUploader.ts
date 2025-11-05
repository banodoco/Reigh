import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/integrations/supabase/config/env";

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
 * Uploads a video file to Supabase storage with real progress tracking.
 * Uses XMLHttpRequest to track actual upload progress.
 */
export const uploadVideoToStorage = async (
  file: File,
  projectId: string,
  shotId: string,
  onProgress?: (progress: number) => void,
  maxRetries: number = 3
): Promise<string> => {
  const fileExt = file.name.split('.').pop() || 'mp4';
  const fileName = `guidance-videos/${projectId}/${shotId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Get upload URL from Supabase
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('No active session');
      }
      
      const bucketUrl = `${SUPABASE_URL}/storage/v1/object/image_uploads/${fileName}`;
      
      // Upload with XMLHttpRequest to track progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            onProgress?.(percentComplete);
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100);
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });
        
        xhr.addEventListener('abort', () => {
          reject(new Error('Upload aborted'));
        });
        
        xhr.open('POST', bucketUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${session.session.access_token}`);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.setRequestHeader('Cache-Control', '3600');
        
        xhr.send(file);
      });
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('image_uploads')
        .getPublicUrl(fileName);
      
      return publicUrl;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown upload error');
      console.error(`[videoUploader] Upload attempt ${attempt + 1} failed:`, error);
      
      if (attempt < maxRetries - 1) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to upload video after multiple attempts');
};

