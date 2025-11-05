import { processStyleReferenceForAspectRatioString } from './styleReferenceProcessor';
import { uploadImageToStorage } from './imageUploader';
import { dataURLtoFile } from './utils';

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
  const reprocessed: ReferenceImage[] = [];
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    
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
      const response = await fetch(ref.styleReferenceImageOriginal);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      // Convert to data URL for processing
      const dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
        reader.readAsDataURL(blob);
      });
      // Reprocess for new aspect ratio
      const processedDataURL = await processStyleReferenceForAspectRatioString(
        dataURL,
        newAspectRatio
      );
      
      if (!processedDataURL) {
        throw new Error('processStyleReferenceForAspectRatioString returned null');
      }
      // Upload new processed version
      const processedFile = dataURLtoFile(
        processedDataURL,
        `reference-${ref.id}-${Date.now()}.png`
      );
      
      if (!processedFile) {
        throw new Error('dataURLtoFile returned null');
      }
      const newProcessedUrl = await uploadImageToStorage(processedFile);
      // Update reference with new processed URL (keep original)
      const updatedRef = {
        ...ref,
        styleReferenceImage: newProcessedUrl,
        updatedAt: new Date().toISOString()
      };
      reprocessed.push(updatedRef);
      successCount++;
      
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

