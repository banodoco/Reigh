import { processStyleReferenceForAspectRatioString } from './styleReferenceProcessor';
import { uploadImageToStorage } from './imageUploader';
import { dataURLtoFile } from './utils';
import { generateClientThumbnail, uploadImageWithThumbnail } from './clientThumbnailGenerator';
import { supabase } from '@/integrations/supabase/client';

// Import the ReferenceImage type from the image generation form
export interface ReferenceImage {
  id: string;
  name: string;
  styleReferenceImage: string | null;
  styleReferenceImageOriginal: string | null;
  thumbnailUrl?: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  referenceMode?: 'style' | 'subject' | 'style-character' | 'scene-imprecise' | 'custom';
  styleBoostTerms?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Reprocesses all reference images for a project when dimensions change.
 * Uses the original images as source and regenerates cropped versions.
 * 
 * @param references - Array of reference images to reprocess
 * @param newAspectRatio - New aspect ratio string (e.g., "16:9", "1:1")
 * @param onProgress - Optional callback for progress updates (current, total)
 * @returns Promise with array of updated references
 */
export async function recropAllReferences(
  references: ReferenceImage[],
  newAspectRatio: string,
  onProgress?: (current: number, total: number) => void
): Promise<ReferenceImage[]> {
  console.log('[RecropReferences] 🎬 Starting batch recrop for', references.length, 'references to aspect ratio:', newAspectRatio);
  
  const reprocessed: ReferenceImage[] = [];
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    
    console.log(`[RecropReferences] 📐 Processing reference ${i + 1}/${references.length}:`, {
      id: ref.id,
      name: ref.name,
      hasOriginal: !!ref.styleReferenceImageOriginal
    });
    
    // Skip if no original image
    if (!ref.styleReferenceImageOriginal) {
      console.warn(`[RecropReferences] ⚠️ No original image for reference ${ref.id} (${ref.name}), skipping`);
      reprocessed.push(ref);
      skipCount++;
      onProgress?.(i + 1, references.length);
      continue;
    }
    
    try {
      // Fetch the original image
      console.log(`[RecropReferences] 📥 Fetching original image for ${ref.name}...`);
      const response = await fetch(ref.styleReferenceImageOriginal);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      console.log(`[RecropReferences] ✅ Fetched blob, size: ${blob.size} bytes, type: ${blob.type}`);
      
      // Convert to data URL for processing
      const dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
        reader.readAsDataURL(blob);
      });
      console.log(`[RecropReferences] 🔄 Converted to data URL, length: ${dataURL.length} chars`);
      
      // Reprocess for new aspect ratio
      console.log(`[RecropReferences] ✂️ Processing image for aspect ratio: ${newAspectRatio}...`);
      const processedDataURL = await processStyleReferenceForAspectRatioString(
        dataURL,
        newAspectRatio
      );
      
      if (!processedDataURL) {
        throw new Error('processStyleReferenceForAspectRatioString returned null');
      }
      console.log(`[RecropReferences] ✅ Image processed, new length: ${processedDataURL.length} chars`);
      
      // Upload new processed version with thumbnail
      console.log(`[RecropReferences] 📤 Converting processed image to file...`);
      const processedFile = dataURLtoFile(
        processedDataURL,
        `reference-${ref.id}-${Date.now()}.png`
      );
      
      if (!processedFile) {
        throw new Error('dataURLtoFile returned null');
      }
      
      let newProcessedUrl = '';
      let newThumbnailUrl = '';
      
      try {
        // Get current user ID for storage path
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          throw new Error('User not authenticated');
        }
        const userId = session.user.id;

        // Generate thumbnail for reprocessed image
        console.log(`[RecropReferences] 🖼️ Generating thumbnail for processed image...`);
        const thumbnailResult = await generateClientThumbnail(processedFile, 300, 0.8);
        console.log(`[RecropReferences] ✅ Thumbnail generated: ${thumbnailResult.thumbnailWidth}x${thumbnailResult.thumbnailHeight}`);
        
        // Upload both main image and thumbnail
        console.log(`[RecropReferences] 📤 Uploading processed file and thumbnail to storage...`);
        const uploadResult = await uploadImageWithThumbnail(processedFile, thumbnailResult.thumbnailBlob, userId);
        newProcessedUrl = uploadResult.imageUrl;
        newThumbnailUrl = uploadResult.thumbnailUrl;
        
        console.log(`[RecropReferences] ✅ Upload complete - Image:`, newProcessedUrl, 'Thumbnail:', newThumbnailUrl);
      } catch (thumbnailError) {
        console.warn(`[RecropReferences] ⚠️ Thumbnail generation failed, uploading without thumbnail:`, thumbnailError);
        // Fallback to original upload flow without thumbnail
        newProcessedUrl = await uploadImageToStorage(processedFile);
        newThumbnailUrl = newProcessedUrl; // Use main image as fallback
      }
      
      // Update reference with new processed URL and thumbnail (keep original)
      const updatedRef = {
        ...ref,
        styleReferenceImage: newProcessedUrl,
        thumbnailUrl: newThumbnailUrl,
        updatedAt: new Date().toISOString()
      };
      reprocessed.push(updatedRef);
      successCount++;
      
      console.log(`[RecropReferences] ✅ Successfully reprocessed reference ${ref.name}`);
      
      // Report progress
      onProgress?.(i + 1, references.length);
      
    } catch (error) {
      console.error(`[RecropReferences] ❌ Failed to reprocess reference ${ref.id} (${ref.name}):`, error);
      errorCount++;
      // Keep the old reference unchanged on error
      reprocessed.push(ref);
      // Still report progress
      onProgress?.(i + 1, references.length);
    }
  }
  
  console.log('[RecropReferences] 🏁 Batch recrop complete:', {
    total: references.length,
    success: successCount,
    skipped: skipCount,
    errors: errorCount
  });
  
  return reprocessed;
}

/**
 * Checks if a reference needs reprocessing for a given aspect ratio.
 * Can be used to determine if the recrop button should be shown.
 * 
 * @param references - Array of references to check
 * @returns Boolean indicating if any references need reprocessing
 */
export function hasReferencesNeedingRecrop(references: ReferenceImage[]): boolean {
  return references.some(ref => 
    ref.styleReferenceImageOriginal && 
    !ref.styleReferenceImage
  );
}

