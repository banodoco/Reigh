/**
 * Client-side thumbnail generation utility
 * Generates thumbnails from image files using Canvas API
 */

interface ThumbnailResult {
  thumbnailBlob: Blob;
  thumbnailWidth: number;
  thumbnailHeight: number;
  originalWidth: number;
  originalHeight: number;
}

/**
 * Generate a thumbnail from an image file on the client side
 * @param file - The image file to generate thumbnail from
 * @param maxSize - Maximum dimension for the thumbnail (default: 300px)
 * @param quality - JPEG quality (0-1, default: 0.8)
 * @returns Promise<ThumbnailResult>
 */
export async function generateClientThumbnail(
  file: File,
  maxSize: number = 300,
  quality: number = 0.8
): Promise<ThumbnailResult> {
  return new Promise((resolve, reject) => {
    // Create an image element to load the file
    const img = new Image();
    
    img.onload = () => {
      try {
        const originalWidth = img.width;
        const originalHeight = img.height;
        
        // Calculate thumbnail dimensions (maintain aspect ratio)
        let thumbnailWidth = originalWidth;
        let thumbnailHeight = originalHeight;
        
        if (originalWidth > originalHeight) {
          if (originalWidth > maxSize) {
            thumbnailWidth = maxSize;
            thumbnailHeight = (originalHeight * maxSize) / originalWidth;
          }
        } else {
          if (originalHeight > maxSize) {
            thumbnailHeight = maxSize;
            thumbnailWidth = (originalWidth * maxSize) / originalHeight;
          }
        }
        
        // Ensure minimum size of 1px
        thumbnailWidth = Math.max(1, Math.round(thumbnailWidth));
        thumbnailHeight = Math.max(1, Math.round(thumbnailHeight));
        
        // Create canvas and resize image
        const canvas = document.createElement('canvas');
        canvas.width = thumbnailWidth;
        canvas.height = thumbnailHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        
        // Draw and resize the image
        ctx.drawImage(img, 0, 0, thumbnailWidth, thumbnailHeight);
        
        // Convert canvas to blob (JPEG with specified quality)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to generate thumbnail blob'));
              return;
            }
            
            resolve({
              thumbnailBlob: blob,
              thumbnailWidth,
              thumbnailHeight,
              originalWidth,
              originalHeight
            });
          },
          'image/jpeg',
          quality
        );
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for thumbnail generation'));
    };
    
    // Load the image file
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error('Failed to read image file'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Upload both original image and thumbnail to storage
 * @param originalFile - The original image file
 * @param thumbnailBlob - The generated thumbnail blob
 * @param userId - User ID for storage path organization
 * @param onProgress - Optional callback for upload progress (0-100)
 * @returns Promise<{imageUrl: string, thumbnailUrl: string}>
 */
export async function uploadImageWithThumbnail(
  originalFile: File,
  thumbnailBlob: Blob,
  userId: string,
  onProgress?: (progress: number) => void
): Promise<{imageUrl: string, thumbnailUrl: string}> {
  const { uploadImageToStorage } = await import('./imageUploader');
  const { supabase } = await import('@/integrations/supabase/client');
  const { storagePaths, generateThumbnailFilename, MEDIA_BUCKET } = await import('./storagePaths');
  
  // Upload original image using existing utility (with progress tracking)
  // Original image is ~90% of the work, thumbnail is ~10%
  const imageUrl = await uploadImageToStorage(
    originalFile,
    3, // maxRetries
    onProgress ? (progress) => {
      // Map 0-100 to 0-90 for main image
      onProgress(Math.round(progress * 0.9));
    } : undefined
  );
  
  // Upload thumbnail using centralized path utilities
  const thumbnailFilename = generateThumbnailFilename();
  const thumbnailPath = storagePaths.thumbnail(userId, thumbnailFilename);
  
  // Report 90% progress before thumbnail upload
  onProgress?.(90);
  
  const { data: thumbnailUploadData, error: thumbnailUploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(thumbnailPath, thumbnailBlob, {
      contentType: 'image/jpeg',
      upsert: true
    });
  
  // Report 100% progress after thumbnail upload
  onProgress?.(100);
  
  if (thumbnailUploadError) {
    console.error('Thumbnail upload error:', thumbnailUploadError);
    // Don't fail the main upload, use main image as thumbnail fallback
    return { imageUrl, thumbnailUrl: imageUrl };
  }
  
  // Get public URL for thumbnail
  const { data: thumbnailUrlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(thumbnailPath);
  
  const thumbnailUrl = thumbnailUrlData.publicUrl;
  
  return { imageUrl, thumbnailUrl };
}
