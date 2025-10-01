import { supabase } from "@/integrations/supabase/client";

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
 * Uploads a video file to Supabase storage.
 * Follows same pattern as uploadImageToStorage from imageUploader.ts
 */
export const uploadVideoToStorage = async (
  file: File,
  projectId: string,
  maxRetries: number = 3
): Promise<string> => {
  const fileExt = file.name.split('.').pop() || 'mp4';
  const fileName = `guidance-videos/${projectId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[videoUploader] Upload attempt ${attempt + 1}/${maxRetries}:`, fileName);
      
      const { data, error } = await supabase.storage
        .from('image_uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) {
        throw error;
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('image_uploads')
        .getPublicUrl(fileName);
      
      console.log('[videoUploader] Upload successful:', publicUrl);
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

