import { useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail } from '@/shared/lib/clientThumbnailGenerator';
import { storagePaths, generateThumbnailFilename, MEDIA_BUCKET } from '@/shared/lib/storagePaths';
import { processStyleReferenceForAspectRatioString } from '@/shared/lib/styleReferenceProcessor';
import { resolveProjectResolution } from '@/shared/lib/taskCreation';
import { dataURLtoFile } from '@/shared/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { useCreateResource, StyleReferenceMetadata } from '@/shared/hooks/useResources';
import { ReferenceImage } from '@/tools/image-generation/components/ImageGenerationForm/types';

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
  const createResource = useCreateResource();

  // Get project image settings
  const {
    settings: projectImageSettings,
    update: updateProjectImageSettings,
  } = useToolSettings<any>('project-image-settings', {
    projectId: selectedProjectId,
    enabled: !!selectedProjectId
  });

  const handleAddToReferences = async () => {
    console.log('[AddToRefDebug] 🚀 Starting Add to References flow', {
      selectedProjectId,
      selectedShotId,
      isVideo,
      timestamp: new Date().toISOString()
    });

    if (!selectedProjectId || isVideo) {
      console.log('[AddToRefDebug] ❌ Early exit - no project or is video');
      toast.error('Cannot add videos to references');
      return;
    }

    setIsAddingToReferences(true);
    try {
      // FIX: Use 'url' field which is what the media object actually has
      const imageUrl = (media as any).url || media.location || media.imageUrl;
      if (!imageUrl) {
        throw new Error('No image URL available');
      }

      console.log('[AddToReferences] Starting to add image to references:', imageUrl);

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
      console.log('[AddToReferences] Generating thumbnail for reference image...');
      let thumbnailUrl: string | null = null;
      try {
        const thumbnailResult = await generateClientThumbnail(originalFile, 300, 0.8);
        console.log('[AddToReferences] Thumbnail generated:', {
          width: thumbnailResult.thumbnailWidth,
          height: thumbnailResult.thumbnailHeight,
          size: thumbnailResult.thumbnailBlob.size
        });
        
        // Upload thumbnail to storage using centralized path utilities
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          throw new Error('User not authenticated');
        }
        const thumbnailFilename = generateThumbnailFilename();
        const thumbnailPath = storagePaths.thumbnail(session.user.id, thumbnailFilename);
        
        const { data: thumbnailUploadData, error: thumbnailUploadError } = await supabase.storage
          .from(MEDIA_BUCKET)
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
            .from(MEDIA_BUCKET)
            .getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbnailUrlData.publicUrl;
          console.log('[AddToReferences] Thumbnail uploaded successfully:', thumbnailUrl);
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
      console.log('[AddToReferences] Processing for aspect ratio:', aspectRatio);
      
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
      
      console.log('[AddToRefDebug] 📊 Current project state', {
        existingReferencesCount: references.length,
        existingReferenceIds: references.map((r: any) => r.id || r.resourceId),
        selectedReferenceIdByShot,
        projectImageSettings: projectImageSettings ? 'exists' : 'null',
      });
      
      // Create new resource metadata
      const metadata: StyleReferenceMetadata = {
        name: `Reference ${references.length + 1}`,
        styleReferenceImage: processedUploadedUrl,
        styleReferenceImageOriginal: originalUploadedUrl,
        thumbnailUrl: thumbnailUrl,
        styleReferenceStrength: 1.1,
        subjectStrength: 0.0,
        subjectDescription: '',
        inThisScene: false,
        inThisSceneStrength: 0,
        referenceMode: 'style',
        styleBoostTerms: '',
        created_by: { is_you: true },
        is_public: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log('[AddToRefDebug] 🎨 Creating new resource with metadata:', {
        name: metadata.name,
        referenceMode: metadata.referenceMode,
        hasProcessedUrl: !!metadata.styleReferenceImage,
        hasOriginalUrl: !!metadata.styleReferenceImageOriginal,
        hasThumbnail: !!metadata.thumbnailUrl
      });
      
      // Create resource in DB
      const resource = await createResource.mutateAsync({
        type: 'style-reference',
        metadata
      });
      
      console.log('[AddToRefDebug] ✅ Resource created in DB', {
        resourceId: resource.id,
        userId: resource.userId
      });
      
      // Create pointer
      const newPointer: ReferenceImage = {
        id: nanoid(),
        resourceId: resource.id
      };
      
      console.log('[AddToRefDebug] 🔗 Created new pointer', {
        pointerId: newPointer.id,
        resourceId: newPointer.resourceId
      });
      
      // Determine the effective shot ID
      // If selectedShotId is provided, use it.
      // If not, heuristic: try to match an existing shot ID or default to 'shot-1'
      // This handles cases where Lightbox is opened without explicit shot context
      let effectiveShotId = selectedShotId;
      if (!effectiveShotId) {
        const existingShots = Object.keys(selectedReferenceIdByShot);
        console.log('[AddToRefDebug] ⚠️ No selectedShotId provided - attempting to infer', {
          selectedShotId,
          existingShots,
          existingShotsCount: existingShots.length
        });
        if (existingShots.length > 0) {
           // Pick the first one (often 'shot-1' or the only active shot)
           effectiveShotId = existingShots[0];
           console.log('[AddToRefDebug] 🎯 Inferred from existing shots:', effectiveShotId);
        } else {
           effectiveShotId = 'shot-1';
           console.log('[AddToRefDebug] 🎯 Defaulting to shot-1 (no existing shots)');
        }
      } else {
        console.log('[AddToRefDebug] ✅ Using provided selectedShotId:', effectiveShotId);
      }
      
      // Update selections for BOTH the specific shot AND 'none' (global/default)
      // This ensures the reference is selected regardless of which context you're viewing from
      const updatedSelections = {
        ...selectedReferenceIdByShot,
        [effectiveShotId]: newPointer.id,
        // Also update 'none' if we're on a specific shot, OR update the specific shot if we're on 'none'
        // This keeps both contexts in sync
        'none': newPointer.id
      };
      
      const updatePayload = {
        references: [...references, newPointer],
        selectedReferenceIdByShot: updatedSelections
      };
      
      console.log('[AddToRefDebug] 💾 Updating project settings', {
        effectiveShotId,
        newPointerId: newPointer.id,
        previousSelectionForShot: selectedReferenceIdByShot[effectiveShotId],
        previousSelectionForNone: selectedReferenceIdByShot['none'],
        newSelectionForShot: updatePayload.selectedReferenceIdByShot[effectiveShotId],
        newSelectionForNone: updatePayload.selectedReferenceIdByShot['none'],
        allSelectionsAfterUpdate: updatePayload.selectedReferenceIdByShot,
        totalReferencesAfterUpdate: updatePayload.references.length
      });
      
      // Add to references array AND set as selected for current shot
      await updateProjectImageSettings('project', updatePayload);
      
      console.log('[AddToRefDebug] ✅ Successfully updated project settings', {
        effectiveShotId,
        newReferenceSelectedForShot: newPointer.id
      });
      
      // Show success state
      setAddToReferencesSuccess(true);
      
      // Reset success state after 2 seconds
      setTimeout(() => {
        setAddToReferencesSuccess(false);
      }, 2000);
      
      console.log('[AddToRefDebug] 🎉 Add to reference flow completed successfully');
      
    } catch (error) {
      console.error('[AddToRefDebug] ❌ Error adding to references:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      toast.error('Failed to add to references');
    } finally {
      setIsAddingToReferences(false);
      console.log('[AddToRefDebug] 🏁 Add to reference flow ended (finally block)');
    }
  };

  return {
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
  };
};

