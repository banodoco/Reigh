import { useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail } from '@/shared/lib/clientThumbnailGenerator';
import { processStyleReferenceForAspectRatioString } from '@/shared/lib/styleReferenceProcessor';
import { resolveProjectResolution } from '@/shared/lib/taskCreation';
import { dataURLtoFile } from '@/shared/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToolSettings } from '@/shared/hooks/useToolSettings';

export interface UseReferencesProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  selectedShotId?: string;
  isVideo: boolean;
}

export interface UseReferencesReturn {
  isAddingToReferences: boolean;
  addToReferencesSuccess: boolean;
  handleAddToReferences: () => Promise<void>;
}

/**
 * Hook for managing adding images to project references
 * Handles image processing, uploading, and adding to project settings
 */
export const useReferences = ({
  media,
  selectedProjectId,
  selectedShotId,
  isVideo,
}: UseReferencesProps): UseReferencesReturn => {
  const [isAddingToReferences, setIsAddingToReferences] = useState(false);
  const [addToReferencesSuccess, setAddToReferencesSuccess] = useState(false);

  // Get project image settings
  const {
    settings: projectImageSettings,
    update: updateProjectImageSettings,
  } = useToolSettings<any>('project-image-settings', {
    projectId: selectedProjectId,
    enabled: !!selectedProjectId
  });

  const handleAddToReferences = async () => {
    if (!selectedProjectId || isVideo) {
      toast.error('Cannot add videos to references');
      return;
    }

    setIsAddingToReferences(true);
    try {
      const imageUrl = media.location || media.imageUrl;
      if (!imageUrl) {
        throw new Error('No image URL available');
      }

      // Fetch the image as blob
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const blob = await response.blob();
      
      // Convert to File for processing
      const originalFile = new File([blob], `reference-${Date.now()}.png`, { type: 'image/png' });
      
      // Upload original image
      const originalUploadedUrl = await uploadImageToStorage(originalFile);
      
      // Generate and upload thumbnail for grid display
      let thumbnailUrl: string | null = null;
      try {
        const thumbnailResult = await generateClientThumbnail(originalFile, 300, 0.8);
        // Upload thumbnail to storage
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 10);
        const thumbnailFilename = `thumb_${timestamp}_${randomString}.jpg`;
        const thumbnailPath = `files/thumbnails/${thumbnailFilename}`;
        
        const { data: thumbnailUploadData, error: thumbnailUploadError } = await supabase.storage
          .from('image_uploads')
          .upload(thumbnailPath, thumbnailResult.thumbnailBlob, {
            contentType: 'image/jpeg',
            upsert: true
          });
        
        if (thumbnailUploadError) {
          console.error('[AddToReferences] Thumbnail upload error:', thumbnailUploadError);
          // Use original as fallback
          thumbnailUrl = originalUploadedUrl;
        } else {
          const { data: thumbnailUrlData } = supabase.storage
            .from('image_uploads')
            .getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbnailUrlData.publicUrl;
          }
      } catch (thumbnailError) {
        console.error('[AddToReferences] Error generating thumbnail:', thumbnailError);
        // Use original as fallback
        thumbnailUrl = originalUploadedUrl;
      }
      
      // Convert blob to data URL for processing
      const reader = new FileReader();
      const dataURL = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      // Process the image to match project aspect ratio
      let processedDataURL = dataURL;
      const { aspectRatio } = await resolveProjectResolution(selectedProjectId);
      const processed = await processStyleReferenceForAspectRatioString(dataURL, aspectRatio);
      if (processed) {
        processedDataURL = processed;
      }
      
      // Convert processed data URL back to File for upload
      const processedFile = dataURLtoFile(processedDataURL, `reference-processed-${Date.now()}.png`);
      if (!processedFile) {
        throw new Error('Failed to convert processed image to file');
      }
      
      // Upload processed version
      const processedUploadedUrl = await uploadImageToStorage(processedFile);
      
      // Get existing references
      const references = projectImageSettings?.references || [];
      const selectedReferenceIdByShot = projectImageSettings?.selectedReferenceIdByShot || {};
      
      // Create new reference with 'style' mode by default
      const newReference = {
        id: nanoid(),
        name: `Reference ${references.length + 1}`,
        styleReferenceImage: processedUploadedUrl,
        styleReferenceImageOriginal: originalUploadedUrl,
        thumbnailUrl: thumbnailUrl,
        styleReferenceStrength: 1.1,
        subjectStrength: 0.0,
        subjectDescription: '',
        inThisScene: false,
        referenceMode: 'style',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Determine the effective shot ID (use 'none' for null shot)
      const effectiveShotId = selectedShotId || 'none';
      
      // Add to references array AND set as selected for current shot
      await updateProjectImageSettings('project', {
        references: [...references, newReference],
        selectedReferenceIdByShot: {
          ...selectedReferenceIdByShot,
          [effectiveShotId]: newReference.id
        }
      });
      
      // Show success state
      setAddToReferencesSuccess(true);
      
      // Reset success state after 2 seconds
      setTimeout(() => {
        setAddToReferencesSuccess(false);
      }, 2000);
      
    } catch (error) {
      console.error('[AddToReferences] Error adding to references:', error);
      toast.error('Failed to add to references');
    } finally {
      setIsAddingToReferences(false);
    }
  };

  return {
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
  };
};

