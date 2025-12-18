import { useCallback, useRef, useMemo } from 'react';
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { GenerationRow, Shot } from "@/types/shots";
import { useProject } from "@/shared/contexts/ProjectContext";
import { uploadImageToStorage } from "@/shared/lib/imageUploader";
import { generateClientThumbnail, uploadImageWithThumbnail } from "@/shared/lib/clientThumbnailGenerator";
import { 
  useAddImageToShot, 
  useRemoveImageFromShot, 
  useUpdateShotImageOrder, 
  useHandleExternalImageDrop, 
  useDuplicateImageInShot 
} from "@/shared/hooks/useShots";
import { useDeleteGeneration, useCreateGeneration, useUpdateGenerationLocation } from "@/shared/hooks/useGenerations";
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { cropImageToProjectAspectRatio } from '@/shared/lib/imageCropper';
import { parseRatio } from '@/shared/lib/aspectRatios';
import { getDisplayUrl } from '@/shared/lib/utils';
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from '@tanstack/react-query';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { ShotEditorState } from '../state/types';
import { isGenerationVideo, getNonVideoImages } from '../utils/generation-utils';
import { 
  cropImagesToShotAspectRatio,
  calculateNextAvailableFrame,
  createPositionMap,
  persistTimelinePositions
} from './timelineDropHelpers';
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';

interface UseGenerationActionsProps {
  state: ShotEditorState;
  actions: {
    setUploadingImage: (value: boolean) => void;
    setFileInputKey: (value: number) => void;
    setDeletingVideoId: (value: string | null) => void;
    setDuplicatingImageId: (value: string | null) => void;
    setDuplicateSuccessImageId: (value: string | null) => void;
    setPendingFramePositions: (value: Map<string, number>) => void;
    // REMOVED: setLocalOrderedShotImages - no longer needed with two-phase loading
  };
  selectedShot: Shot;
  projectId: string;
  batchVideoFrames: number;
  onShotImagesUpdate: () => void;
  orderedShotImages: GenerationRow[];
  skipNextSyncRef: React.MutableRefObject<boolean>;
}

export const useGenerationActions = ({
  state,
  actions,
  selectedShot,
  projectId,
  batchVideoFrames,
  onShotImagesUpdate,
  orderedShotImages,
  skipNextSyncRef,
}: UseGenerationActionsProps) => {
  const { projects } = useProject();
  const { getApiKey } = useApiKeys();
  const queryClient = useQueryClient();
  
  // Mutations
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  const deleteGenerationMutation = useDeleteGeneration();
  const createGenerationMutation = useCreateGeneration();
  const updateGenerationLocationMutation = useUpdateGenerationLocation();
  const duplicateImageInShotMutation = useDuplicateImageInShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();

  // REMOVED: useTaskQueueNotifier was interfering with RealtimeProvider
  const enqueueTasks = async () => {};
  const isEnqueuing = false;
  const justQueued = false;

  // Upload settings
  const { settings: uploadSettings } = useToolSettings<{ cropToProjectSize?: boolean }>('upload', { projectId });

  // 🎯 STABILITY FIX: Use refs for data that changes reference frequently but callbacks 
  // only need the latest value. This prevents callback recreation when data refetches.
  const orderedShotImagesRef = useRef(orderedShotImages);
  orderedShotImagesRef.current = orderedShotImages;
  
  const onShotImagesUpdateRef = useRef(onShotImagesUpdate);
  onShotImagesUpdateRef.current = onShotImagesUpdate;
  
  // These are used in handleTimelineImageDrop - stabilize to prevent recreation
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  
  const uploadSettingsRef = useRef(uploadSettings);
  uploadSettingsRef.current = uploadSettings;
  
  // 🎯 STABILITY FIX: selectedShot object changes reference when React Query cache updates
  // even if the shot ID hasn't changed. Use ref to prevent callback recreation.
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;
  
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  
  const batchVideoFramesRef = useRef(batchVideoFrames);
  batchVideoFramesRef.current = batchVideoFrames;
  
  // 🎯 STABILITY FIX: React Query mutation objects change reference when mutation state changes
  // (pending → success → idle). Use refs to access stable mutateAsync functions.
  const addImageToShotMutationRef = useRef(addImageToShotMutation);
  addImageToShotMutationRef.current = addImageToShotMutation;
  
  const removeImageFromShotMutationRef = useRef(removeImageFromShotMutation);
  removeImageFromShotMutationRef.current = removeImageFromShotMutation;
  
  const deleteGenerationMutationRef = useRef(deleteGenerationMutation);
  deleteGenerationMutationRef.current = deleteGenerationMutation;
  
  const createGenerationMutationRef = useRef(createGenerationMutation);
  createGenerationMutationRef.current = createGenerationMutation;
  
  const duplicateImageInShotMutationRef = useRef(duplicateImageInShotMutation);
  duplicateImageInShotMutationRef.current = duplicateImageInShotMutation;
  
  const handleExternalImageDropMutationRef = useRef(handleExternalImageDropMutation);
  handleExternalImageDropMutationRef.current = handleExternalImageDropMutation;
  
  const updateGenerationLocationMutationRef = useRef(updateGenerationLocationMutation);
  updateGenerationLocationMutationRef.current = updateGenerationLocationMutation;
  
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  
  // 🎯 STABILITY FIX: Even though actions from useShotEditorState should be stable,
  // use a ref to be absolutely certain callbacks won't recreate
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const handleImageUploadToShot = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentProjectId = projectIdRef.current;
    const currentShot = selectedShotRef.current;
    
    if (!currentProjectId || !currentShot?.id) {
      toast.error("Cannot upload image: Project or Shot ID is missing.");
      return;
    }

    actionsRef.current.setUploadingImage(true);

    // Determine if cropping is enabled via project settings (toolSettings)
    // 🎯 STABILITY FIX: Use refs to access latest data without causing callback recreation
    const currentUploadSettings = uploadSettingsRef.current;
    const currentProjects = projectsRef.current;
    const cropToProjectSize = (currentUploadSettings?.cropToProjectSize ?? true);
    let projectAspectRatio: number | null = null;
    if (cropToProjectSize) {
      // Prioritize shot aspect ratio over project aspect ratio
      const currentProject = currentProjects.find(p => p.id === currentProjectId);
      const aspectRatioStr = currentShot?.aspect_ratio || currentProject?.aspectRatio || (currentProject as any)?.settings?.aspectRatio;
      if (aspectRatioStr) {
        projectAspectRatio = parseRatio(aspectRatioStr);
        if (isNaN(projectAspectRatio)) {
          toast.error(`Invalid aspect ratio: ${aspectRatioStr}`);
          actionsRef.current.setUploadingImage(false);
          return;
        }
      } else {
        toast.error("Cannot crop: No aspect ratio found for shot or project.");
        actionsRef.current.setUploadingImage(false);
        return;
      }
    }

    const optimisticImages: GenerationRow[] = [];
    for (const file of files) {
      const tempId = nanoid();
      const optimisticImage: GenerationRow = {
        shotImageEntryId: tempId,
        id: tempId,
        imageUrl: URL.createObjectURL(file),
        thumbUrl: URL.createObjectURL(file),
        type: 'image',
        isOptimistic: true,
      };
      optimisticImages.push(optimisticImage);
    }

    // REMOVED: Optimistic local state update - two-phase loading handles updates fast enough

    const uploadPromises = files.map(async (file, i) => {
      const optimisticImage = optimisticImages[i];
      try {
        let fileToUpload = file;
        let croppedImageUrl: string | undefined;

        if (cropToProjectSize && projectAspectRatio) {
          const cropResult = await cropImageToProjectAspectRatio(file, projectAspectRatio);
          if (cropResult) {
            fileToUpload = cropResult.croppedFile;
            croppedImageUrl = cropResult.croppedImageUrl;
          } else {
            toast.warning(`Failed to crop image: ${file.name}. Using original image.`);
          }
        }

        // Generate client-side thumbnail
        console.log(`[ThumbnailGenDebug] Starting client-side thumbnail generation for ${file.name}`);
        let thumbnailUrl = '';
        let finalImageUrl = '';
        
        try {
          // Get current user ID for storage path
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user?.id) {
            throw new Error('User not authenticated');
          }
          const userId = session.user.id;

          // Generate thumbnail client-side
          const thumbnailResult = await generateClientThumbnail(fileToUpload, 300, 0.8);
          console.log(`[ThumbnailGenDebug] Generated thumbnail: ${thumbnailResult.thumbnailWidth}x${thumbnailResult.thumbnailHeight} (original: ${thumbnailResult.originalWidth}x${thumbnailResult.originalHeight})`);
          
          // Upload both main image and thumbnail
          const uploadResult = await uploadImageWithThumbnail(fileToUpload, thumbnailResult.thumbnailBlob, userId);
          finalImageUrl = croppedImageUrl ? getDisplayUrl(uploadResult.imageUrl) : uploadResult.imageUrl;
          thumbnailUrl = uploadResult.thumbnailUrl;
          
          console.log(`[ThumbnailGenDebug] Upload complete - Image: ${finalImageUrl}, Thumbnail: ${thumbnailUrl}`);
        } catch (thumbnailError) {
          console.warn(`[ThumbnailGenDebug] Client-side thumbnail generation failed for ${file.name}:`, thumbnailError);
          // Fallback to original upload flow without thumbnail
          const imageUrl = await uploadImageToStorage(fileToUpload);
          finalImageUrl = croppedImageUrl ? getDisplayUrl(imageUrl) : imageUrl;
          thumbnailUrl = finalImageUrl; // Use main image as fallback
        }

        const promptForGeneration = `External image: ${file.name || 'untitled'}`;

        // Support environments without API server (e.g., static web build)
        const currentEnv = import.meta.env.VITE_APP_ENV?.toLowerCase() || 'web';
        let newGeneration: any;

        if (currentEnv === 'web') {
          // Directly insert into Supabase instead of hitting the API server
          const { data: inserted, error } = await supabase
            .from('generations')
            .insert({
              location: finalImageUrl,
              thumbnail_url: thumbnailUrl, // Add thumbnail URL
              type: file.type || 'image',
              project_id: projectId,
              params: {
                prompt: promptForGeneration,
                source: 'external_upload',
                original_filename: file.name,
                file_type: file.type,
                file_size: file.size,
              },
            })
            .select()
            .single();

          if (error || !inserted) throw error || new Error('Failed to create generation');
          newGeneration = inserted;
        } else {
          // Use the new Supabase-based hook for all environments
          newGeneration = await createGenerationMutation.mutateAsync({
            imageUrl: finalImageUrl,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            projectId: projectId,
            prompt: promptForGeneration,
          });
        }

        // Save link in DB (ignore returned shotImageEntryId for UI key stability)
        await addImageToShotMutationRef.current.mutateAsync({
          shot_id: currentShot.id,
          generation_id: newGeneration.id,
          project_id: currentProjectId,
          imageUrl: finalImageUrl,
          thumbUrl: thumbnailUrl, // Use the generated thumbnail URL
        });

        const finalImage: GenerationRow = {
          ...(newGeneration as Omit<GenerationRow, 'id' | 'generation_id'>),
          // Preserve the optimistic id (shot_generations.id) so React key stays stable
          id: optimisticImage.id,
          generation_id: newGeneration.id, // actual generation ID
          // Deprecated (backwards compat)
          shotImageEntryId: optimisticImage.id,
          isOptimistic: false,
          imageUrl: finalImageUrl, // Ensure final URL is used
          thumbUrl: thumbnailUrl, // Use the generated thumbnail URL
        };
        
        return { optimisticId: optimisticImage.id, finalImage, success: true };
      } catch (error: any) {
        console.error(`[ShotEditor] Error uploading one image: ${file.name}`, error);
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
        return { optimisticId: optimisticImage.id, success: false };
      }
    });

    const results = await Promise.all(uploadPromises);

    // REMOVED: Local state updates - two-phase loading will refetch automatically
    
    actionsRef.current.setFileInputKey(Date.now());
    actionsRef.current.setUploadingImage(false);
  }, [
    // actions, mutations, projectId, selectedShot, projects, uploadSettings accessed via refs
  ]);

  const handleDeleteVideoOutput = useCallback(async (generationId: string) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    if (!currentShot || !currentProjectId) {
      toast.error("No shot or project selected.");
      return;
    }
    actionsRef.current.setDeletingVideoId(generationId);
    
    try {
      // REMOVED: Optimistic local state - two-phase loading handles updates
      
      // Delete the generation (this will show success/error toasts automatically)
      await deleteGenerationMutationRef.current.mutateAsync(generationId);
      
      // Refresh the shot data
      // 🎯 STABILITY FIX: Use ref to access latest callback without causing callback recreation
      onShotImagesUpdateRef.current(); 
    } catch (error) {
      // Error handled by mutation
    } finally {
      actionsRef.current.setDeletingVideoId(null);
    }
  }, []); // actions, mutations, selectedShot, projectId, onShotImagesUpdate accessed via refs

  const handleDeleteImageFromShot = useCallback(async (shotImageEntryId: string) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    console.log('[DeleteDebug] 🗑️ STEP 1: handleDeleteImageFromShot called', {
      shotImageEntryId: shotImageEntryId?.substring(0, 8),
      shotId: currentShot?.id?.substring(0, 8),
      projectId: currentProjectId?.substring(0, 8),
      hasSelectedShot: !!currentShot,
      hasProjectId: !!currentProjectId,
      timestamp: Date.now()
    });

    if (!currentShot || !currentProjectId) {
      console.error('[DeleteDebug] ❌ Missing shot or project', {
        hasSelectedShot: !!currentShot,
        hasProjectId: !!currentProjectId
      });
      toast.error("Cannot remove image: No shot or project selected.");
      return;
    }

    // Guard: Prevent deleting optimistic items (mutations in progress)
    if (shotImageEntryId.startsWith('temp-')) {
      console.warn('[DeleteDebug] ⚠️ Attempted to delete optimistic item, ignoring', {
        shotImageEntryId
      });
      toast.warning("Please wait for the previous operation to complete.");
      return;
    }

    // Find the image by its id (shot_generations.id)
    // shotImageEntryId param IS the id (same value now)
    // 🎯 STABILITY FIX: Use ref to access latest data without causing callback recreation
    const currentOrderedImages = orderedShotImagesRef.current;
    const imageToDelete = currentOrderedImages.find(img => img.id === shotImageEntryId);
    
    // The actual generation ID is now stored in generation_id
    const actualGenerationId = imageToDelete?.generation_id;
    
    console.log('[DeleteDebug] 🔍 STEP 2: Looking up generation ID', {
      shotImageEntryId: shotImageEntryId.substring(0, 8),
      foundImage: !!imageToDelete,
      actualGenerationId: actualGenerationId?.substring(0, 8),
      imageId: imageToDelete?.id?.substring(0, 8), // shot_generations.id
      generation_id: imageToDelete?.generation_id?.substring(0, 8),
      totalImages: currentOrderedImages.length
    });

    if (!actualGenerationId) {
      console.error('[DeleteDebug] ❌ Could not find generation ID for shotImageEntryId', {
        shotImageEntryId: shotImageEntryId.substring(0, 8),
        availableIds: currentOrderedImages.map(img => ({
          id: img.id?.substring(0, 8), // shot_generations.id
          generation_id: img.generation_id?.substring(0, 8)
        }))
      });
      toast.error("Cannot remove image: Image not found.");
      return;
    }

    // Check if we're deleting the first positioned item on the timeline
    // If so, we need to shift all remaining items back proportionally
    const positionedImages = currentOrderedImages
      .filter(img => img.timeline_frame != null && img.timeline_frame >= 0 && !isGenerationVideo(img))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    
    const deletedItemFrame = imageToDelete?.timeline_frame;
    const isDeletingFirstItem = positionedImages.length > 1 && 
      deletedItemFrame != null && 
      deletedItemFrame >= 0 &&
      positionedImages[0]?.id === shotImageEntryId;
    
    // Calculate the offset to shift remaining items (gap between first and second item)
    let frameOffset = 0;
    let itemsToShift: Array<{ id: string; currentFrame: number }> = [];
    
    if (isDeletingFirstItem && positionedImages.length >= 2) {
      const firstFrame = positionedImages[0].timeline_frame ?? 0;
      const secondFrame = positionedImages[1].timeline_frame ?? 0;
      frameOffset = secondFrame - firstFrame;
      
      // Collect all remaining items (excluding the one being deleted)
      itemsToShift = positionedImages
        .slice(1) // Skip first item (being deleted)
        .map(img => ({
          id: img.id,
          currentFrame: img.timeline_frame ?? 0
        }));
      
      console.log('[DeleteDebug] 📐 Deleting first item - will shift remaining items', {
        firstFrame,
        secondFrame,
        frameOffset,
        itemsToShiftCount: itemsToShift.length,
        itemsToShift: itemsToShift.map(i => ({ id: i.id.substring(0, 8), frame: i.currentFrame }))
      });
    }

    console.log('[DeleteDebug] 📤 STEP 3: Calling removeImageFromShotMutation', {
      shotId: currentShot.id.substring(0, 8),
      shotGenerationId: shotImageEntryId.substring(0, 8), // This is the shot_generations.id
      projectId: currentProjectId.substring(0, 8),
      isDeletingFirstItem,
      frameOffset
    });

    // Emit event to lock timeline positions during mutation + refetch
    window.dispatchEvent(new CustomEvent('shot-mutation-start', {
      detail: {
        shotId: currentShot.id,
        type: 'delete',
        shotGenerationId: shotImageEntryId, // shot_generations.id
      }
    }));
    
    try {
      // CRITICAL: Pass shotGenerationId (shot_generations.id), NOT generationId (generations.id)
      // This ensures only this specific entry is deleted, not all duplicates of the same generation
      await removeImageFromShotMutationRef.current.mutateAsync({
        shotId: currentShot.id,
        shotGenerationId: shotImageEntryId, // The unique shot_generations.id
        projectId: currentProjectId,
      });
      
      // If we deleted the first item, shift all remaining items back
      if (isDeletingFirstItem && frameOffset > 0 && itemsToShift.length > 0) {
        console.log('[DeleteDebug] 📐 STEP 4: Shifting remaining items back by', frameOffset);
        
        // Build batch updates for all remaining items
        const updates = itemsToShift.map(item => ({
          id: item.id,
          newFrame: item.currentFrame - frameOffset
        }));
        
        console.log('[DeleteDebug] 📐 Batch updating timeline_frames', {
          updateCount: updates.length,
          updates: updates.map(u => ({ id: u.id.substring(0, 8), newFrame: u.newFrame }))
        });
        
        // Update all items in parallel using Supabase directly
        await Promise.all(updates.map(update =>
          supabase
            .from('shot_generations')
            .update({ timeline_frame: update.newFrame })
            .eq('id', update.id)
        ));
        
        console.log('[DeleteDebug] ✅ STEP 5: Timeline frames shifted successfully');

        // Invalidate queries to refresh the UI
        invalidateGenerationsSync(queryClientRef.current, currentShot.id, {
          reason: 'delete-image-frame-shift',
          scope: 'all',
          includeShots: true,
          projectId: currentProjectId
        });
      }
    } catch (error) {
      console.error('[DeleteDebug] ❌ Error during deletion or frame shift:', error);
      // Error handling is done by the mutation itself
    } finally {
      // CRITICAL: Wait for query to refetch before clearing pending delete tracking.
      // Otherwise cached data can briefly resurrect the deleted item during the refetch window.
      // The mutation's onSuccess invalidates queries, so we wait for that to settle.
      await queryClientRef.current.refetchQueries({ 
        queryKey: ['all-shot-generations', currentShot.id],
        exact: true 
      }).catch(() => {
        // Ignore refetch errors - the item is still deleted
      });
      
      // Now it's safe to clear the pending delete - fresh data is loaded
      window.dispatchEvent(new CustomEvent('shot-mutation-end', {
        detail: {
          shotId: currentShot.id,
          type: 'delete',
          shotGenerationId: shotImageEntryId, // shot_generations.id
        }
      }));
    }
  }, []); // mutations, queryClient, selectedShot, projectId, orderedShotImages accessed via refs

  const handleBatchDeleteImages = useCallback(async (shotImageEntryIds: string[]) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    if (!currentShot || !currentProjectId || shotImageEntryIds.length === 0) {
      return;
    }

    console.log('[BATCH_DELETE] Removing multiple images from timeline', {
      idsToRemove: shotImageEntryIds.map(id => id.substring(0, 8)),
      totalCount: shotImageEntryIds.length,
    });

    // Emit event so ShotEditor can prevent deleted items from "resurrecting" via cache fallbacks.
    window.dispatchEvent(new CustomEvent('shot-mutation-start', {
      detail: {
        shotId: currentShot.id,
        type: 'batch-delete',
        shotGenerationIds: shotImageEntryIds, // shot_generations.id[]
      }
    }));

    // REMOVED: Optimistic local state - two-phase loading handles updates
    
    // Execute all timeline removals
    const removePromises = shotImageEntryIds.map(id => 
      removeImageFromShotMutationRef.current.mutateAsync({
        shotId: currentShot.id,
        shotGenerationId: id,
        projectId: currentProjectId,
      })
    );

    try {
      await Promise.all(removePromises);
      console.log('[BATCH_DELETE] Batch removal completed successfully');
    } catch (error) {
      toast.error('Failed to remove some images from timeline');
    } finally {
      // CRITICAL: Wait for query to refetch before clearing pending delete tracking.
      // Otherwise cached data can briefly resurrect deleted items during the refetch window.
      await queryClientRef.current.refetchQueries({ 
        queryKey: ['all-shot-generations', currentShot.id],
        exact: true 
      }).catch(() => {
        // Ignore refetch errors - items are still deleted
      });
      
      // Now it's safe to clear the pending deletes - fresh data is loaded
      window.dispatchEvent(new CustomEvent('shot-mutation-end', {
        detail: {
          shotId: currentShot.id,
          type: 'batch-delete',
          shotGenerationIds: shotImageEntryIds, // shot_generations.id[]
        }
      }));
    }
  }, []); // mutations, selectedShot, projectId accessed via refs

  const handleDuplicateImage = useCallback(async (shotImageEntryId: string, timeline_frame: number) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    console.log('[DUPLICATE_DEBUG] 🚀 DUPLICATE BUTTON CLICKED:', {
      shotImageEntryId: shotImageEntryId.substring(0, 8),
      timeline_frame,
      timestamp: Date.now(),
      source: 'timeline_duplicate_button'
    });

    if (!currentShot || !currentProjectId) {
      toast.error("Cannot duplicate image: No shot or project selected.");
      return;
    }

    // Guard: Prevent duplicating optimistic items (mutations in progress)
    if (shotImageEntryId.startsWith('temp-')) {
      console.warn('[DUPLICATE:useGenerationActions] ⚠️ Attempted to duplicate optimistic item, ignoring', {
        shotImageEntryId
      });
      toast.warning("Please wait for the previous operation to complete.");
      return;
    }

    // shotImageEntryId param is the shot_generations.id which matches img.id
    // 🎯 STABILITY FIX: Use ref to access latest data without causing callback recreation
    const currentOrderedImages = orderedShotImagesRef.current;
    const originalImage = currentOrderedImages.find(img => img.id === shotImageEntryId);
    if (!originalImage) {
      toast.error("Original image not found for duplication.");
      return;
    }
    
    // Get the actual generation_id (generations.id, not shot_generations.id)
    // originalImage.id is now shot_generations.id, we need generation_id
    const generationId = (originalImage as any).generation_id || originalImage.id;
    
    // Additional guard: Check if the generation ID is also temporary
    if (generationId.startsWith('temp-')) {
      console.warn('[DUPLICATE:useGenerationActions] ⚠️ Generation ID is temporary, ignoring', {
        generationId
      });
      toast.warning("Please wait for the image to finish uploading.");
      return;
    }
    
    console.log('[DUPLICATE_DEBUG] 📍 FOUND ORIGINAL IMAGE:', {
      shotImageEntryId: shotImageEntryId.substring(0, 8),
      shotGenerationsId: originalImage.id?.substring(0, 8),
      generationId: generationId?.substring(0, 8),
      timeline_frame_from_button: timeline_frame,
      timeline_frame_from_image: (originalImage as any).timeline_frame,
      imageUrl: originalImage.imageUrl?.substring(0, 50) + '...',
      totalImagesInShot: currentOrderedImages.length
    });

    // Emit event to lock timeline positions during mutation + refetch
    window.dispatchEvent(new CustomEvent('shot-mutation-start', {
      detail: { shotId: currentShot.id, type: 'duplicate' }
    }));

    // Start loading state targeting the specific shotImageEntryId
    actionsRef.current.setDuplicatingImageId(shotImageEntryId);

    // OPTIMISTIC UPDATE: Create a temporary duplicate for immediate feedback
    const tempDuplicateId = nanoid();
    const optimisticDuplicate: GenerationRow = {
      ...originalImage,
      shotImageEntryId: tempDuplicateId,
      id: tempDuplicateId,
      isOptimistic: true,
      // Place duplicate right after the original for mobile batch view
    };

    // REMOVED: Optimistic duplicate insertion - two-phase loading is fast enough

    // Calculate the next image's frame from UI data (more reliable than database query)
    // Sort images by their timeline_frame and find the one after the current
    const sortedImages = [...currentOrderedImages]
      .filter(img => (img as any).timeline_frame !== undefined && (img as any).timeline_frame !== null)
      .sort((a, b) => ((a as any).timeline_frame ?? 0) - ((b as any).timeline_frame ?? 0));
    
    // Find by id (shot_generations.id)
    const currentIndex = sortedImages.findIndex(img => img.id === shotImageEntryId);
    
    const nextImage = currentIndex >= 0 && currentIndex < sortedImages.length - 1 
      ? sortedImages[currentIndex + 1] 
      : null;
    const nextTimelineFrame = nextImage ? (nextImage as any).timeline_frame : undefined;
    
    console.log('[DUPLICATE] Calling duplicateImageInShotMutation', {
      originalTimelineFrame: timeline_frame,
      nextTimelineFrame,
      currentIndex,
      totalSortedImages: sortedImages.length
    });

    duplicateImageInShotMutationRef.current.mutate({
      shot_id: currentShot.id,
      generation_id: generationId,
      project_id: currentProjectId,
      shot_generation_id: shotImageEntryId, // Use the unique shot_generation ID for precise lookup
      timeline_frame: timeline_frame, // Pass the timeline_frame directly to avoid query
      next_timeline_frame: nextTimelineFrame, // Pass the next frame from UI for accurate midpoint
    }, {
      onSuccess: (result) => {
        console.log('[DUPLICATE] Duplicate mutation successful', result);
        
        // Add the new item to pending positions immediately to prevent flicker
        // The new item will be in the positions map before the refetch completes
        if (result.new_shot_generation_id && result.timeline_frame !== undefined) {
          const newPendingPositions = new Map(state.pendingFramePositions);
          newPendingPositions.set(result.new_shot_generation_id, result.timeline_frame);
          actionsRef.current.setPendingFramePositions(newPendingPositions);
          
          console.log('[DUPLICATE] Added to pending positions:', {
            id: result.new_shot_generation_id.substring(0, 8),
            frame: result.timeline_frame
          });
        }
        
        // Show success state
        actionsRef.current.setDuplicateSuccessImageId(shotImageEntryId);
        // Clear success state after 2 seconds
        setTimeout(() => actionsRef.current.setDuplicateSuccessImageId(null), 2000);
      },
      onError: (error) => {
        console.error('[DUPLICATE] Duplicate mutation failed:', error);
        toast.error(`Failed to duplicate image: ${error.message}`);
        
        // REMOVED: Rollback logic - no optimistic state to revert
      },
      onSettled: () => {
        // Clear loading state
        actionsRef.current.setDuplicatingImageId(null);
      }
    });
  }, []); // actions, mutations, selectedShot, projectId, orderedShotImages accessed via refs

  /**
   * Handle dropping external image files onto the timeline
   * 
   * REFACTORED: Uses a simplified approach:
   * 1. Calculate positions upfront
   * 2. Upload with pre-calculated positions (single database round-trip)
   * 3. Refresh data (positions already set correctly)
   * 
   * This eliminates the race conditions that caused shaky behavior.
   */
  const handleTimelineImageDrop = useCallback(async (files: File[], targetFrame?: number) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    const currentBatchVideoFrames = batchVideoFramesRef.current;
    
    console.log('[TimelineDrop] 🎯 Starting drop:', {
      filesCount: files.length,
      targetFrame,
      shotId: currentShot?.id?.substring(0, 8)
    });

    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    try {
      actionsRef.current.setUploadingImage(true);
      
      // 1. Calculate target positions BEFORE upload
      const calculatedTargetFrame = await calculateNextAvailableFrame(
        currentShot.id,
        targetFrame
      );
      
      // 2. Crop images to shot aspect ratio
      // 🎯 STABILITY FIX: Use refs to access latest data without causing callback recreation
      const processedFiles = await cropImagesToShotAspectRatio(
        files,
        currentShot,
        currentProjectId,
        projectsRef.current,
        uploadSettingsRef.current
      );
      
      // 3. Calculate positions for each file
      const positions = processedFiles.map((_, index) => 
        calculatedTargetFrame + (index * currentBatchVideoFrames)
      );
      
      console.log('[TimelineDrop] 📍 Pre-calculated positions:', {
        startFrame: calculatedTargetFrame,
        spacing: currentBatchVideoFrames,
        positions
      });
      
      // 4. Upload with positions (single round trip to database)
      const result = await handleExternalImageDropMutationRef.current.mutateAsync({
        imageFiles: processedFiles,
        targetShotId: currentShot.id,
        currentProjectQueryKey: currentProjectId,
        currentShotCount: 0,
        skipAutoPosition: false, // Let server use our calculated positions
        positions: positions, // Pass pre-calculated positions
        onProgress: (fileIndex, fileProgress, overallProgress) => {
          console.log(`[TimelineDrop] Upload: ${fileIndex + 1}/${processedFiles.length} - ${overallProgress}%`);
        }
      });

      if (!result?.generationIds?.length) {
        console.warn('[TimelineDrop] ⚠️ No generation IDs returned');
        return;
      }
      
      console.log('[TimelineDrop] ✅ Upload complete:', {
        generationIds: result.generationIds.map(id => id.substring(0, 8)),
        positionsUsed: positions
      });
      
      // 5. If positions weren't set by the upload mutation, set them now
      // This is a fallback for backwards compatibility
      if (result.generationIds.length > 0) {
        // Check if positions were already set by the upload
        const needsPositionUpdate = await (async () => {
          const { data } = await supabase
            .from('shot_generations')
            .select('id, timeline_frame')
            .eq('shot_id', currentShot.id)
            .in('generation_id', result.generationIds)
            .limit(1);
          
          return data?.[0]?.timeline_frame === null;
        })();
        
        if (needsPositionUpdate) {
          console.log('[TimelineDrop] 🔄 Setting positions (fallback path)...');
          await persistTimelinePositions(
            currentShot.id,
            result.generationIds,
            calculatedTargetFrame,
            currentBatchVideoFrames
          );
        }
      }

      // 6. Refresh the shot data
      // REMOVED: Don't force refetch here. useAddImageToShot now handles cache updates correctly.
      // Calling refetch here causes a race condition where stale data from the server
      // overwrites the correct optimistic data in the cache, causing the image to disappear.
      // await onShotImagesUpdate();
      
      console.log('[TimelineDrop] ✅ Drop complete');
      
    } catch (error) {
      console.error('[TimelineDrop] ❌ Error:', error);
      toast.error(`Failed to add images: ${(error as Error).message}`);
      throw error;
    } finally {
      actionsRef.current.setUploadingImage(false);
    }
  }, [
    // actions, mutations, selectedShot, projectId, batchVideoFrames, projects, uploadSettings, onShotImagesUpdate accessed via refs
  ]);

  /**
   * Handle dropping a generation from GenerationsPane onto the timeline
   * This adds an existing generation to the shot at the specified frame position
   */
  const handleTimelineGenerationDrop = useCallback(async (
    generationId: string, 
    imageUrl: string, 
    thumbUrl: string | undefined, 
    targetFrame?: number
  ) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    console.log('[PATH_COMPARE] 🟢 DRAG PATH START - handleTimelineGenerationDrop:', {
      generationId: generationId?.substring(0, 8),
      imageUrl: imageUrl?.substring(0, 60),
      thumbUrl: thumbUrl?.substring(0, 60),
      targetFrame,
      targetFrameProvided: targetFrame !== undefined,
      shotId: currentShot?.id?.substring(0, 8),
      projectId: currentProjectId?.substring(0, 8),
      timestamp: Date.now()
    });

    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add generation: No shot or project selected.");
      return;
    }

    if (!generationId) {
      toast.error("Invalid generation: Missing generation ID.");
      return;
    }

    try {
      console.log('[PATH_COMPARE] 🟢 DRAG PATH - calling addImageToShotMutationRef.current.mutateAsync');
      
      // Add the generation to the shot using the existing mutation
      // The addImageToShot API will handle creating the shot_image_entry
      await addImageToShotMutationRef.current.mutateAsync({
        generation_id: generationId,
        shot_id: currentShot.id,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        timelineFrame: targetFrame, // Position on timeline if provided
        project_id: currentProjectId
      });
      
      // Note: Don't call onShotImagesUpdate() here - the mutation's onSuccess 
      // already invalidates the cache, and calling refresh causes double-refresh flicker
      console.log('[GenerationDrop] ✅ handleTimelineGenerationDrop complete');
    } catch (error) {
      console.error('[GenerationDrop] ❌ Error adding generation to timeline:', error);
      toast.error(`Failed to add generation: ${(error as Error).message}`);
      throw error;
    }
  }, []); // mutations, selectedShot, projectId accessed via refs

  /**
   * Handle dropping external images onto batch mode grid
   * 
   * Shows optimistic skeleton immediately using local file preview URLs,
   * then uploads and replaces with real data.
   */
  const handleBatchImageDrop = useCallback(async (
    files: File[],
    targetPosition?: number,
    framePosition?: number
  ) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    console.log('[BatchDrop] 🎯 Starting drop:', {
      filesCount: files.length,
      framePosition,
      shotId: currentShot?.id?.substring(0, 8)
    });

    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    // Track optimistic items for cleanup
    const optimisticIds: string[] = [];
    const localUrls: string[] = [];

    try {
      actionsRef.current.setUploadingImage(true);
      
      // 1. Calculate target frame positions with collision detection
      // First get the start frame (already collision-checked by calculateNextAvailableFrame)
      const startFrame = framePosition ?? await calculateNextAvailableFrame(currentShot.id, undefined);
      
      // For multiple files, we need to ensure each position is unique
      // Get existing frames from cache for quick collision detection
      const existingGens = queryClientRef.current.getQueryData<GenerationRow[]>(['all-shot-generations', currentShot.id]) || [];
      const existingFrames = existingGens
        .filter(g => g.timeline_frame != null && g.timeline_frame !== -1)
        .map(g => g.timeline_frame as number);
      
      // Calculate unique positions for each file
      const positions: number[] = [];
      const allUsedFrames = [...existingFrames];
      for (let i = 0; i < files.length; i++) {
        let targetFrame = startFrame + i;
        // Ensure this frame is unique (not in existing or already assigned)
        while (allUsedFrames.includes(targetFrame)) {
          targetFrame += 1;
        }
        positions.push(targetFrame);
        allUsedFrames.push(targetFrame);
      }
      
      console.log('[BatchDrop] 📍 Calculated unique positions:', {
        startFrame,
        filesCount: files.length,
        positions,
        existingCount: existingFrames.length
      });
      
      // 2. Create optimistic entries immediately using local file URLs
      const previousFastGens = queryClientRef.current.getQueryData<GenerationRow[]>(['all-shot-generations', currentShot.id]) || [];
      
      const optimisticItems = files.map((file, index) => {
        const localUrl = URL.createObjectURL(file);
        localUrls.push(localUrl);
        const tempId = `temp-upload-${Date.now()}-${index}-${Math.random()}`;
        optimisticIds.push(tempId);
        
        return {
          id: tempId,
          generation_id: tempId,
          shotImageEntryId: tempId,
          shot_generation_id: tempId,
          location: localUrl,
          thumbnail_url: localUrl,
          imageUrl: localUrl,
          thumbUrl: localUrl,
          timeline_frame: positions[index],
          type: 'image' as const,
          created_at: new Date().toISOString(),
          starred: false,
          name: file.name,
          based_on: null,
          params: {},
          shot_data: { [currentShot.id]: positions[index] },
          _optimistic: true,
          _uploading: true // Extra flag to show upload indicator
        };
      });
      
      // Add optimistic items to cache
      queryClientRef.current.setQueryData(
        ['all-shot-generations', currentShot.id], 
        [...previousFastGens, ...optimisticItems]
      );
      
      // 3. Crop images
      // 🎯 STABILITY FIX: Use refs to access latest data without causing callback recreation
      const processedFiles = await cropImagesToShotAspectRatio(
        files,
        currentShot,
        currentProjectId,
        projectsRef.current,
        uploadSettingsRef.current
      );
      
      // 4. Upload with positions
      // Pass skipOptimistic: true so we don't create DUPLICATE optimistic items
      // Our manual ones will persist until the real items come back from the server (after cache invalidation)
      const result = await handleExternalImageDropMutationRef.current.mutateAsync({
        imageFiles: processedFiles,
        targetShotId: currentShot.id,
        currentProjectQueryKey: currentProjectId,
        currentShotCount: 0,
        skipAutoPosition: false,
        positions: positions,
        skipOptimistic: true
      });
      
      if (!result?.generationIds?.length) {
        console.warn('[BatchDrop] ⚠️ No generation IDs returned');
        return;
      }
      
      // 5. If positions weren't set by the upload, set them now (fallback)
      const { data: checkData } = await supabase
        .from('shot_generations')
        .select('id, timeline_frame')
        .eq('shot_id', currentShot.id)
        .in('generation_id', result.generationIds)
        .limit(1);
      
      if (checkData?.[0]?.timeline_frame === null) {
        console.log('[BatchDrop] 🔄 Setting positions (fallback)...');
        await persistTimelinePositions(
          currentShot.id,
          result.generationIds,
          startFrame,
          1 // Use 1 frame spacing for batch mode
        );
      }
      
      console.log('[BatchDrop] ✅ Drop complete');
      
    } catch (error) {
      console.error('[BatchDrop] ❌ Error:', error);
      toast.error(`Failed to add images: ${(error as Error).message}`);
      
      // Remove optimistic items on error
      const currentCache = queryClientRef.current.getQueryData<GenerationRow[]>(['all-shot-generations', currentShot.id]) || [];
      queryClientRef.current.setQueryData(
        ['all-shot-generations', currentShot.id],
        currentCache.filter(item => !optimisticIds.includes(item.id))
      );
      
      throw error;
    } finally {
      actionsRef.current.setUploadingImage(false);
      
      // Clean up local URLs to prevent memory leaks
      localUrls.forEach(url => URL.revokeObjectURL(url));
    }
  }, []); // actions, mutations, queryClient, selectedShot, projectId, projects, uploadSettings accessed via refs

  /**
   * Handle dropping a generation from GenerationsPane onto batch mode grid
   * Adds an existing generation to the shot at the specified position
   */
  const handleBatchGenerationDrop = useCallback(async (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetPosition?: number,
    framePosition?: number
  ) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add generation: No shot or project selected.");
      return;
    }

    if (!generationId) {
      toast.error("Invalid generation: Missing generation ID.");
      return;
    }

    try {
      // Use framePosition (calculated timeline_frame) or fall back to targetPosition
      const timelineFrame = framePosition ?? targetPosition;
      
      await addImageToShotMutationRef.current.mutateAsync({
        generation_id: generationId,
        shot_id: currentShot.id,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: currentProjectId,
        timelineFrame: timelineFrame,
      });
    } catch (error) {
      console.error('[BatchDrop] Error adding generation:', error);
      toast.error(`Failed to add generation: ${(error as Error).message}`);
      throw error;
    }
  }, []); // mutations, selectedShot, projectId accessed via refs

  // 🎯 FIX #3: Memoize the return object to prevent callback instability in parent components
  // Without this, every render creates a new object, causing ShotImagesEditor to rerender
  // even when the individual callbacks haven't changed
  // 
  // CRITICAL: All callbacks have empty dependency arrays and use refs internally.
  // The mutation is accessed via ref to prevent the useMemo from recreating on mutation state changes.
  return useMemo(() => ({
    handleImageUploadToShot,
    handleDeleteVideoOutput,
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
    handleDuplicateImage,
    handleTimelineImageDrop,
    handleTimelineGenerationDrop,
    handleBatchImageDrop,
    handleBatchGenerationDrop,
    isEnqueuing,
    justQueued,
    enqueueTasks,
    // Expose mutation via ref getter - prevents useMemo recreation on mutation state changes
    get updateGenerationLocationMutation() {
      return updateGenerationLocationMutationRef.current;
    },
  }), [
    // All callbacks use refs internally and have empty deps, so they're stable
    handleImageUploadToShot,
    handleDeleteVideoOutput,
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
    handleDuplicateImage,
    handleTimelineImageDrop,
    handleTimelineGenerationDrop,
    handleBatchImageDrop,
    handleBatchGenerationDrop,
    // Static values that never change
    isEnqueuing,
    justQueued,
    enqueueTasks,
    // updateGenerationLocationMutation removed - accessed via getter from ref
  ]);
}; 