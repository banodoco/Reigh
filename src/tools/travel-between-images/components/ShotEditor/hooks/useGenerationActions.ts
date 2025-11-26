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

  const handleImageUploadToShot = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    if (!projectId || !selectedShot?.id) {
      toast.error("Cannot upload image: Project or Shot ID is missing.");
      return;
    }

    actions.setUploadingImage(true);

    // Determine if cropping is enabled via project settings (toolSettings)
    const cropToProjectSize = (uploadSettings?.cropToProjectSize ?? true);
    let projectAspectRatio: number | null = null;
    if (cropToProjectSize) {
      // Prioritize shot aspect ratio over project aspect ratio
      const currentProject = projects.find(p => p.id === projectId);
      const aspectRatioStr = selectedShot?.aspect_ratio || currentProject?.aspectRatio || (currentProject as any)?.settings?.aspectRatio;
      if (aspectRatioStr) {
        projectAspectRatio = parseRatio(aspectRatioStr);
        if (isNaN(projectAspectRatio)) {
          toast.error(`Invalid aspect ratio: ${aspectRatioStr}`);
          actions.setUploadingImage(false);
          return;
        }
      } else {
        toast.error("Cannot crop: No aspect ratio found for shot or project.");
        actions.setUploadingImage(false);
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
        await addImageToShotMutation.mutateAsync({
          shot_id: selectedShot.id,
          generation_id: newGeneration.id,
          project_id: projectId,
          imageUrl: finalImageUrl,
          thumbUrl: thumbnailUrl, // Use the generated thumbnail URL
        });

        const finalImage: GenerationRow = {
          ...(newGeneration as Omit<GenerationRow, 'id' | 'shotImageEntryId'>),
          // Preserve the optimistic shotImageEntryId so React key stays stable
          shotImageEntryId: optimisticImage.shotImageEntryId,
          id: newGeneration.id,
          isOptimistic: false,
          imageUrl: finalImageUrl, // Ensure final URL is used
          thumbUrl: thumbnailUrl, // Use the generated thumbnail URL
        };
        
        return { optimisticId: optimisticImage.shotImageEntryId, finalImage, success: true };
      } catch (error: any) {
        console.error(`[ShotEditor] Error uploading one image: ${file.name}`, error);
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
        return { optimisticId: optimisticImage.shotImageEntryId, success: false };
      }
    });

    const results = await Promise.all(uploadPromises);

    // REMOVED: Local state updates - two-phase loading will refetch automatically
    
    actions.setFileInputKey(Date.now());
    actions.setUploadingImage(false);
  }, [
    actions,
    projectId,
    selectedShot?.id,
    projects,
    uploadSettings?.cropToProjectSize,
    addImageToShotMutation,
    createGenerationMutation,
    queryClient,
    skipNextSyncRef
  ]);

  const handleDeleteVideoOutput = useCallback(async (generationId: string) => {
    if (!selectedShot || !projectId) {
      toast.error("No shot or project selected.");
      return;
    }
    actions.setDeletingVideoId(generationId);
    
    try {
      // REMOVED: Optimistic local state - two-phase loading handles updates
      
      // Delete the generation (this will show success/error toasts automatically)
      await deleteGenerationMutation.mutateAsync(generationId);
      
      // Refresh the shot data
      onShotImagesUpdate(); 
    } catch (error) {
      // Error handled by mutation
    } finally {
      actions.setDeletingVideoId(null);
    }
  }, [selectedShot?.id, projectId, actions, deleteGenerationMutation, onShotImagesUpdate]);

  const handleDeleteImageFromShot = useCallback(async (shotImageEntryId: string) => {
    console.log('[DELETE:useGenerationActions] 🗑️ STEP 2: handleDeleteImageFromShot called', {
      shotImageEntryId: shotImageEntryId?.substring(0, 8),
      shotId: selectedShot?.id?.substring(0, 8),
      projectId: projectId?.substring(0, 8),
      hasSelectedShot: !!selectedShot,
      hasProjectId: !!projectId,
      timestamp: Date.now()
    });

    if (!selectedShot || !projectId) {
      console.error('[DELETE:useGenerationActions] ❌ Missing shot or project', {
        hasSelectedShot: !!selectedShot,
        hasProjectId: !!projectId
      });
      toast.error("Cannot remove image: No shot or project selected.");
      return;
    }

    // Guard: Prevent deleting optimistic items (mutations in progress)
    if (shotImageEntryId.startsWith('temp-')) {
      console.warn('[DELETE:useGenerationActions] ⚠️ Attempted to delete optimistic item, ignoring', {
        shotImageEntryId
      });
      toast.warning("Please wait for the previous operation to complete.");
      return;
    }

    console.log('[DELETE:useGenerationActions] ✅ Calling removeImageFromShotMutation with:', {
      shot_id: selectedShot.id.substring(0, 8),
      shotImageEntryId: shotImageEntryId.substring(0, 8),
      project_id: projectId.substring(0, 8),
    });

    // Emit event to lock timeline positions during mutation + refetch
    window.dispatchEvent(new CustomEvent('shot-mutation-start', {
      detail: { shotId: selectedShot.id, type: 'delete' }
    }));
    
    removeImageFromShotMutation.mutate({
      shotId: selectedShot.id,
      generationId: shotImageEntryId, // Use the unique entry ID
      projectId: projectId,
    });
  }, [selectedShot?.id, projectId, removeImageFromShotMutation]);

  const handleBatchDeleteImages = useCallback(async (shotImageEntryIds: string[]) => {
    if (!selectedShot || !projectId || shotImageEntryIds.length === 0) {
      return;
    }

    console.log('[BATCH_DELETE] Removing multiple images from timeline', {
      idsToRemove: shotImageEntryIds.map(id => id.substring(0, 8)),
      totalCount: shotImageEntryIds.length,
    });

    // REMOVED: Optimistic local state - two-phase loading handles updates
    
    // Execute all timeline removals
    const removePromises = shotImageEntryIds.map(id => 
      removeImageFromShotMutation.mutateAsync({
        shotId: selectedShot.id,
        generationId: id,
        projectId: projectId,
      })
    );

    try {
      await Promise.all(removePromises);
      console.log('[BATCH_DELETE] Batch removal completed successfully');
    } catch (error) {
      toast.error('Failed to remove some images from timeline');
    }
  }, [selectedShot?.id, projectId, removeImageFromShotMutation]);

  const handleDuplicateImage = useCallback(async (shotImageEntryId: string, timeline_frame: number) => {
    console.log('[DUPLICATE_DEBUG] 🚀 DUPLICATE BUTTON CLICKED:', {
      shotImageEntryId: shotImageEntryId.substring(0, 8),
      timeline_frame,
      timestamp: Date.now(),
      source: 'timeline_duplicate_button'
    });

    if (!selectedShot || !projectId) {
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

    const originalImage = orderedShotImages.find(img => (img.shotImageEntryId ?? img.id) === shotImageEntryId);
    if (!originalImage) {
      toast.error("Original image not found for duplication.");
      return;
    }
    
    // Additional guard: Check if the generation ID is also temporary
    const generationId = originalImage.id;
    if (generationId.startsWith('temp-')) {
      console.warn('[DUPLICATE:useGenerationActions] ⚠️ Generation ID is temporary, ignoring', {
        generationId
      });
      toast.warning("Please wait for the image to finish uploading.");
      return;
    }
    
    console.log('[DUPLICATE_DEBUG] 📍 FOUND ORIGINAL IMAGE:', {
      shotImageEntryId: shotImageEntryId.substring(0, 8),
      generationId: generationId.substring(0, 8),
      timeline_frame_from_button: timeline_frame,
      timeline_frame_from_image: (originalImage as any).timeline_frame,
      imageUrl: originalImage.imageUrl?.substring(0, 50) + '...',
      totalImagesInShot: orderedShotImages.length
    });

    // Emit event to lock timeline positions during mutation + refetch
    window.dispatchEvent(new CustomEvent('shot-mutation-start', {
      detail: { shotId: selectedShot.id, type: 'duplicate' }
    }));

    // Start loading state targeting the specific shotImageEntryId
    actions.setDuplicatingImageId(shotImageEntryId);

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

    // Position is now computed from timeline_frame, so we don't need to calculate it
    // The useDuplicateImageInShot hook will calculate the timeline_frame midpoint
    
    console.log('[DUPLICATE] Calling duplicateImageInShotMutation', {
      originalTimelineFrame: (originalImage as any).timeline_frame
    });

    duplicateImageInShotMutation.mutate({
      shot_id: selectedShot.id,
      generation_id: generationId,
      // Position will be computed from timeline_frame - no parameter needed
      project_id: projectId,
    }, {
      onSuccess: (result) => {
        console.log('[DUPLICATE] Duplicate mutation successful', result);
        
        // REMOVED: Local state update - two-phase cache will refetch
        
        // Show success state
        actions.setDuplicateSuccessImageId(shotImageEntryId);
        // Clear success state after 2 seconds
        setTimeout(() => actions.setDuplicateSuccessImageId(null), 2000);
      },
      onError: (error) => {
        console.error('[DUPLICATE] Duplicate mutation failed:', error);
        toast.error(`Failed to duplicate image: ${error.message}`);
        
        // REMOVED: Rollback logic - no optimistic state to revert
      },
      onSettled: () => {
        // Clear loading state
        actions.setDuplicatingImageId(null);
      }
    });
  }, [orderedShotImages, selectedShot?.id, projectId, actions, duplicateImageInShotMutation, skipNextSyncRef]);

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
    console.log('[TimelineDrop] 🎯 Starting drop:', {
      filesCount: files.length,
      targetFrame,
      shotId: selectedShot?.id?.substring(0, 8)
    });

    if (!selectedShot?.id || !projectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    try {
      actions.setUploadingImage(true);
      
      // 1. Calculate target positions BEFORE upload
      const calculatedTargetFrame = await calculateNextAvailableFrame(
        selectedShot.id,
        targetFrame
      );
      
      // 2. Crop images to shot aspect ratio
      const processedFiles = await cropImagesToShotAspectRatio(
        files,
        selectedShot,
        projectId,
        projects,
        uploadSettings
      );
      
      // 3. Calculate positions for each file
      const positions = processedFiles.map((_, index) => 
        calculatedTargetFrame + (index * batchVideoFrames)
      );
      
      console.log('[TimelineDrop] 📍 Pre-calculated positions:', {
        startFrame: calculatedTargetFrame,
        spacing: batchVideoFrames,
        positions
      });
      
      // 4. Upload with positions (single round trip to database)
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: processedFiles,
        targetShotId: selectedShot.id,
        currentProjectQueryKey: projectId,
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
            .eq('shot_id', selectedShot.id)
            .in('generation_id', result.generationIds)
            .limit(1);
          
          return data?.[0]?.timeline_frame === null;
        })();
        
        if (needsPositionUpdate) {
          console.log('[TimelineDrop] 🔄 Setting positions (fallback path)...');
          await persistTimelinePositions(
            selectedShot.id,
            result.generationIds,
            calculatedTargetFrame,
            batchVideoFrames
          );
        }
      }

      // 6. Refresh the shot data
      // Positions are already correct, this just syncs the UI
      await onShotImagesUpdate();
      
      console.log('[TimelineDrop] ✅ Drop complete');
      
    } catch (error) {
      console.error('[TimelineDrop] ❌ Error:', error);
      toast.error(`Failed to add images: ${(error as Error).message}`);
      throw error;
    } finally {
      actions.setUploadingImage(false);
    }
  }, [
    selectedShot?.id, 
    selectedShot?.aspect_ratio, 
    projectId, 
    projects, 
    uploadSettings, 
    batchVideoFrames, 
    actions, 
    handleExternalImageDropMutation, 
    onShotImagesUpdate
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
    console.log('[GenerationDrop] 🎯 handleTimelineGenerationDrop called:', {
      generationId: generationId?.substring(0, 8),
      targetFrame,
      targetFrameProvided: targetFrame !== undefined,
      shotId: selectedShot?.id,
      projectId
    });

    if (!selectedShot?.id || !projectId) {
      toast.error("Cannot add generation: No shot or project selected.");
      return;
    }

    if (!generationId) {
      toast.error("Invalid generation: Missing generation ID.");
      return;
    }

    try {
      console.log('[GenerationDrop] 📤 Adding generation to shot...');
      
      // Add the generation to the shot using the existing mutation
      // The addImageToShot API will handle creating the shot_image_entry
      await addImageToShotMutation.mutateAsync({
        generation_id: generationId,
        shot_id: selectedShot.id,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        timelineFrame: targetFrame, // Position on timeline if provided
        project_id: projectId
      });
      
      console.log('[GenerationDrop] ✅ Generation added successfully, refreshing shot data...');
      
      // Refresh shot data
      await onShotImagesUpdate();
      
      console.log('[GenerationDrop] ✅ handleTimelineGenerationDrop complete');
    } catch (error) {
      console.error('[GenerationDrop] ❌ Error adding generation to timeline:', error);
      toast.error(`Failed to add generation: ${(error as Error).message}`);
      throw error;
    }
  }, [selectedShot?.id, selectedShot?.name, projectId, addImageToShotMutation, onShotImagesUpdate]);

  /**
   * Handle dropping external images onto batch mode grid
   * 
   * REFACTORED: Simplified to match timeline drop approach
   */
  const handleBatchImageDrop = useCallback(async (
    files: File[],
    targetPosition?: number,
    framePosition?: number
  ) => {
    console.log('[BatchDrop] 🎯 Starting drop:', {
      filesCount: files.length,
      framePosition,
      shotId: selectedShot?.id?.substring(0, 8)
    });

    if (!selectedShot?.id || !projectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    try {
      actions.setUploadingImage(true);
      
      // 1. Calculate target frame position
      const startFrame = framePosition ?? await calculateNextAvailableFrame(selectedShot.id, undefined);
      
      // 2. Crop images
      const processedFiles = await cropImagesToShotAspectRatio(
        files,
        selectedShot,
        projectId,
        projects,
        uploadSettings
      );
      
      // 3. Calculate positions for each file
      const positions = processedFiles.map((_, index) => startFrame + index);
      
      console.log('[BatchDrop] 📍 Calculated positions:', {
        startFrame,
        count: processedFiles.length,
        positions
      });
      
      // 4. Upload with positions
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: processedFiles,
        targetShotId: selectedShot.id,
        currentProjectQueryKey: projectId,
        currentShotCount: 0,
        skipAutoPosition: false,
        positions: positions
      });
      
      if (!result?.generationIds?.length) {
        console.warn('[BatchDrop] ⚠️ No generation IDs returned');
        return;
      }
      
      console.log('[BatchDrop] ✅ Upload complete:', {
        generationIds: result.generationIds.map(id => id.substring(0, 8)),
        positionsUsed: positions
      });
      
      // 5. If positions weren't set by the upload, set them now (fallback)
      const { data: checkData } = await supabase
        .from('shot_generations')
        .select('id, timeline_frame')
        .eq('shot_id', selectedShot.id)
        .in('generation_id', result.generationIds)
        .limit(1);
      
      if (checkData?.[0]?.timeline_frame === null) {
        console.log('[BatchDrop] 🔄 Setting positions (fallback)...');
        await persistTimelinePositions(
          selectedShot.id,
          result.generationIds,
          startFrame,
          1 // Use 1 frame spacing for batch mode
        );
      }

      // 6. Refresh shot data
      await onShotImagesUpdate();
      
      console.log('[BatchDrop] ✅ Drop complete');
      
    } catch (error) {
      console.error('[BatchDrop] ❌ Error:', error);
      toast.error(`Failed to add images: ${(error as Error).message}`);
      throw error;
    } finally {
      actions.setUploadingImage(false);
    }
  }, [selectedShot?.id, selectedShot?.aspect_ratio, projectId, projects, uploadSettings, actions, handleExternalImageDropMutation, onShotImagesUpdate]);

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
    console.log('[BatchDrop] 🎯 handleBatchGenerationDrop called:', {
      generationId: generationId?.substring(0, 8),
      targetPosition,
      framePosition,
      shotId: selectedShot?.id,
      projectId
    });

    if (!selectedShot?.id || !projectId) {
      toast.error("Cannot add generation: No shot or project selected.");
      return;
    }

    if (!generationId) {
      toast.error("Invalid generation: Missing generation ID.");
      return;
    }

    try {
      console.log('[BatchDrop] 📤 Adding generation to shot (batch mode)...');
      
      // Add the generation to the shot at the specified position
      await addImageToShotMutation.mutateAsync({
        generation_id: generationId,
        shot_id: selectedShot.id,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: projectId,
        // Use the calculated frame position for insertion
        timelineFrame: framePosition ?? targetPosition, // Prefer framePosition, fall back to targetPosition
      });
      
      console.log('[BatchDrop] ✅ Generation added successfully, refreshing shot data...');
      
      // Refresh shot data
      await onShotImagesUpdate();
      
      console.log('[BatchDrop] ✅ handleBatchGenerationDrop complete');
    } catch (error) {
      console.error('[BatchDrop] ❌ Error adding generation to batch:', error);
      toast.error(`Failed to add generation: ${(error as Error).message}`);
      throw error;
    }
  }, [selectedShot?.id, selectedShot?.name, projectId, addImageToShotMutation, onShotImagesUpdate]);

  // 🎯 FIX #3: Memoize the return object to prevent callback instability in parent components
  // Without this, every render creates a new object, causing ShotImagesEditor to rerender
  // even when the individual callbacks haven't changed
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
    // Expose mutation for direct use (e.g., for image flipping)
    updateGenerationLocationMutation,
  }), [
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
    updateGenerationLocationMutation,
  ]);
}; 