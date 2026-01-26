/**
 * Centralized image upload helper with automatic thumbnail generation
 * Consolidates the pattern used across the app for uploading images
 */

import { supabase } from '@/integrations/supabase/client';
import { generateClientThumbnail, uploadImageWithThumbnail } from './clientThumbnailGenerator';
import { uploadImageToStorage } from './imageUploader';
import { Database } from '@/integrations/supabase/types';
import { findClosestAspectRatio } from './aspectRatios';

/**
 * Extract image dimensions from a File object
 * Used when thumbnail generation is skipped or fails
 */
async function extractImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      console.warn('[ImageUploadHelper] Failed to extract image dimensions');
      resolve(null);
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export interface UploadImageOptions {
  /** File to upload */
  file: File;
  /** Project ID (required for generation record) */
  projectId: string;
  /** Optional shot ID to associate with */
  shotId?: string;
  /** Custom metadata to store */
  metadata?: Record<string, any>;
  /** Progress callback (0-100) */
  onProgress?: (progress: number) => void;
  /** Skip thumbnail generation (for videos or special cases) */
  skipThumbnail?: boolean;
  /** Custom thumbnail max size (default: 300) */
  thumbnailMaxSize?: number;
  /** Custom thumbnail quality 0-1 (default: 0.8) */
  thumbnailQuality?: number;
}

export interface UploadImageResult {
  /** Main image URL */
  imageUrl: string;
  /** Thumbnail URL (same as imageUrl if thumbnail generation failed) */
  thumbnailUrl: string;
  /** Created generation record */
  generation: Database['public']['Tables']['generations']['Row'];
}

/**
 * Upload an image with automatic thumbnail generation and generation record creation
 * This is the recommended way to upload images in the app
 * 
 * @example
 * ```typescript
 * const result = await uploadImageWithGeneration({
 *   file: imageFile,
 *   projectId: currentProjectId,
 *   metadata: { source: 'user_upload' },
 *   onProgress: (progress) => console.log(`${progress}%`)
 * });
 * console.log('Image URL:', result.imageUrl);
 * console.log('Generation ID:', result.generation.id);
 * ```
 */
export async function uploadImageWithGeneration(
  options: UploadImageOptions
): Promise<UploadImageResult> {
  const {
    file,
    projectId,
    shotId,
    metadata = {},
    onProgress,
    skipThumbnail = false,
    thumbnailMaxSize = 300,
    thumbnailQuality = 0.8
  } = options;

  if (!projectId) {
    throw new Error('Project ID is required to upload image');
  }

  let imageUrl = '';
  let thumbnailUrl = '';
  let imageDimensions: { width: number; height: number } | null = null;

  // Generate and upload thumbnail (unless skipped)
  if (!skipThumbnail) {
    try {
      // Get current user ID for storage path
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        throw new Error('User not authenticated');
      }
      const userId = session.user.id;

      // Generate thumbnail client-side
      const thumbnailResult = await generateClientThumbnail(
        file,
        thumbnailMaxSize,
        thumbnailQuality
      );

      // Capture original image dimensions from thumbnail generation
      imageDimensions = {
        width: thumbnailResult.originalWidth,
        height: thumbnailResult.originalHeight
      };

      console.log('[ImageUploadHelper] Thumbnail generated:', {
        width: thumbnailResult.thumbnailWidth,
        height: thumbnailResult.thumbnailHeight,
        size: thumbnailResult.thumbnailBlob.size,
        originalSize: file.size,
        originalDimensions: imageDimensions
      });

      // Upload both main image and thumbnail (with progress tracking)
      const uploadResult = await uploadImageWithThumbnail(
        file,
        thumbnailResult.thumbnailBlob,
        userId,
        onProgress
      );

      imageUrl = uploadResult.imageUrl;
      thumbnailUrl = uploadResult.thumbnailUrl;

      console.log('[ImageUploadHelper] Upload complete:', {
        imageUrl: imageUrl.substring(0, 50) + '...',
        thumbnailUrl: thumbnailUrl.substring(0, 50) + '...'
      });
    } catch (thumbnailError) {
      console.warn('[ImageUploadHelper] Thumbnail generation failed, falling back to direct upload:', thumbnailError);

      // Try to extract dimensions even if thumbnail failed
      imageDimensions = await extractImageDimensions(file);

      // Fallback: upload without thumbnail
      imageUrl = await uploadImageToStorage(file, 3, onProgress);
      thumbnailUrl = imageUrl; // Use main image as fallback
    }
  } else {
    // Skip thumbnail - extract dimensions separately (only for images, not videos)
    if (file.type.startsWith('image/')) {
      imageDimensions = await extractImageDimensions(file);
    }

    // Just upload the main image
    imageUrl = await uploadImageToStorage(file, 3, onProgress);
    thumbnailUrl = imageUrl;
  }

  if (!imageUrl) {
    throw new Error('Failed to upload image to storage');
  }

  // Build dimension params if we have them
  const dimensionParams: Record<string, any> = {};
  if (imageDimensions) {
    // Store resolution in the same format as task-generated images: "WIDTHxHEIGHT"
    dimensionParams.resolution = `${imageDimensions.width}x${imageDimensions.height}`;

    // Calculate and store the closest standard aspect ratio
    const aspectRatioValue = imageDimensions.width / imageDimensions.height;
    dimensionParams.aspect_ratio = findClosestAspectRatio(aspectRatioValue);

    console.log('[ImageUploadHelper] Storing image dimensions:', {
      resolution: dimensionParams.resolution,
      aspect_ratio: dimensionParams.aspect_ratio,
      calculatedRatio: aspectRatioValue.toFixed(3)
    });
  }

  // Create generation record
  const generationData: Database['public']['Tables']['generations']['Insert'] = {
    location: imageUrl,
    thumbnail_url: thumbnailUrl,
    type: file.type || 'image',
    project_id: projectId,
    ...(shotId && { shot_id: shotId }),
    params: {
      prompt: `Uploaded image: ${file.name}`,
      source: 'external_upload',
      original_filename: file.name,
      file_type: file.type,
      file_size: file.size,
      ...dimensionParams,
      ...metadata
    }
  };

  const { data: generation, error: dbError } = await supabase
    .from('generations')
    .insert(generationData)
    .select()
    .single();

  if (dbError || !generation) {
    throw new Error(`Failed to create generation record: ${dbError?.message || 'Unknown error'}`);
  }

  // Create the original variant for this generation
  const { error: variantError } = await supabase
    .from('generation_variants')
    .insert({
      generation_id: generation.id,
      location: imageUrl,
      thumbnail_url: thumbnailUrl,
      is_primary: true,
      variant_type: 'original',
      name: 'Original',
      params: generationData.params,
    });

  if (variantError) {
    console.error('[ImageUploadHelper] Failed to create variant:', variantError);
    // Don't throw - generation was created, variant is secondary
  }

  console.log('[ImageUploadHelper] Generation record created:', {
    generationId: generation.id,
    projectId,
    shotId: shotId || 'none'
  });

  return {
    imageUrl,
    thumbnailUrl,
    generation
  };
}

/**
 * Batch upload multiple images with thumbnails
 * Useful for bulk upload scenarios
 */
export async function uploadImagesWithGeneration(
  files: File[],
  projectId: string,
  options?: {
    shotId?: string;
    metadata?: Record<string, any>;
    onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void;
  }
): Promise<UploadImageResult[]> {
  const results: UploadImageResult[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      const result = await uploadImageWithGeneration({
        file,
        projectId,
        shotId: options?.shotId,
        metadata: options?.metadata,
        onProgress: options?.onProgress
          ? (progress) => {
              // Calculate overall progress
              const overallProgress = Math.round(((i + (progress / 100)) / files.length) * 100);
              options.onProgress!(i, progress, overallProgress);
            }
          : undefined
      });
      
      results.push(result);
    } catch (error) {
      console.error(`[ImageUploadHelper] Failed to upload file ${file.name}:`, error);
      throw error; // Let caller handle the error
    }
  }
  
  return results;
}



