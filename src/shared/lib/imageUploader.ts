import { supabase } from "@/integrations/supabase/client";

/**
 * Helper function to wait for a specified amount of time
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Uploads an image file with retry mechanism.
 * In local development, it sends the file to a local server endpoint.
 * Otherwise, it uploads to Supabase storage.
 * Returns the public URL of the uploaded image.
 */
export const uploadImageToStorage = async (file: File, maxRetries: number = 3): Promise<string> => {
  if (!file) {
    throw new Error("No file provided");
  }

  const BUCKET_NAME = 'image_uploads';

  // Generate a unique filename to avoid collisions
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 10);
  const fileExtension = file.name.split('.').pop();
  const filePath = `files/${timestamp}-${randomString}.${fileExtension}`;

  // Add debug logging for large file uploads
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
  console.log(`[ImageUploadDebug] Starting upload for ${file.name} (${fileSizeMB}MB) to path: ${filePath} (max retries: ${maxRetries})`);
  
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const uploadStartTime = Date.now();
    
    try {
      console.log(`[ImageUploadDebug] Upload attempt ${attempt}/${maxRetries} for ${file.name}`);
      
      // Upload directly to Supabase Storage
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false,
        });

      const uploadDuration = Date.now() - uploadStartTime;
      
      if (error) {
        lastError = error;
        console.warn(`[ImageUploadDebug] Upload attempt ${attempt} failed for ${file.name} after ${uploadDuration}ms:`, {
          error,
          fileName: file.name,
          fileSize: file.size,
          fileSizeMB,
          fileType: file.type,
          filePath,
          uploadDuration,
          attempt
        });
        
        // Don't retry for certain permanent errors
        if (error.message?.includes('413') || error.message?.includes('too large')) {
          throw new Error(`File too large: ${file.name} (${fileSizeMB}MB) exceeds the maximum allowed size.`);
        }
        
        // If this was the last attempt, we'll throw after the loop
        if (attempt === maxRetries) {
          break;
        }
        
        // Wait before retrying (exponential backoff: 1s, 2s, 4s...)
        const waitTime = 1000 * Math.pow(2, attempt - 1);
        console.log(`[ImageUploadDebug] Waiting ${waitTime}ms before retry ${attempt + 1} for ${file.name}`);
        await wait(waitTime);
        continue;
      }

      console.log(`[ImageUploadDebug] Upload successful for ${file.name} in ${uploadDuration}ms on attempt ${attempt}`);

      if (!data || !data.path) {
        console.error(`[ImageUploadDebug] No data or path returned for ${file.name}`);
        throw new Error("Supabase upload did not return a path.");
      }

      // Retrieve the public URL for the newly-uploaded object
      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);

      if (!publicUrl) {
        console.error(`[ImageUploadDebug] Failed to get public URL for ${file.name}, path: ${data.path}`);
        throw new Error('Failed to obtain a public URL for the uploaded image.');
      }

      console.log(`[ImageUploadDebug] Upload complete for ${file.name}: ${publicUrl}`);
      return publicUrl;
      
    } catch (uploadError: any) {
      lastError = uploadError;
      const uploadDuration = Date.now() - uploadStartTime;
      
      console.warn(`[ImageUploadDebug] Upload attempt ${attempt} failed for ${file.name} after ${uploadDuration}ms:`, {
        error: uploadError,
        fileName: file.name,
        attempt
      });
      
      // Don't retry for certain permanent errors
      if (uploadError.message?.includes('413') || uploadError.message?.includes('too large')) {
        throw uploadError;
      }
      
      // If this was the last attempt, we'll throw after the loop
      if (attempt === maxRetries) {
        break;
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = 1000 * Math.pow(2, attempt - 1);
      console.log(`[ImageUploadDebug] Waiting ${waitTime}ms before retry ${attempt + 1} for ${file.name}`);
      await wait(waitTime);
    }
  }
  
  // If we get here, all retries failed
  console.error(`[ImageUploadDebug] All ${maxRetries} upload attempts failed for ${file.name}`);
  
  // Provide more specific error messages based on the error type
  if (lastError?.message?.includes('aborted')) {
    throw new Error(`Upload timeout: ${file.name} (${fileSizeMB}MB) took too long to upload after ${maxRetries} attempts. Please try again with a smaller file or check your connection.`);
  } else {
    throw new Error(`Failed to upload image to Supabase after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }
};
