import { useCallback, useRef } from 'react';
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { GenerationRow, Shot } from "@/types/shots";
import { useProject } from "@/shared/contexts/ProjectContext";
import { uploadImageToStorage } from "@/shared/lib/imageUploader";
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
import { useTaskQueueNotifier } from "@/shared/hooks/useTaskQueueNotifier";
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { ShotEditorState } from '../state/types';
import { isGenerationVideo, getNonVideoImages } from '../utils/generation-utils';

interface UseGenerationActionsProps {
  state: ShotEditorState;
  actions: {
    setUploadingImage: (value: boolean) => void;
    setFileInputKey: (value: number) => void;
    setDeletingVideoId: (value: string | null) => void;
    setDuplicatingImageId: (value: string | null) => void;
    setDuplicateSuccessImageId: (value: string | null) => void;
    setPendingFramePositions: (value: Map<string, number>) => void;
    setLocalOrderedShotImages: (value: GenerationRow[]) => void;
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

  // Task queue
  const { enqueueTasks, isEnqueuing, justQueued } = useTaskQueueNotifier({ 
    projectId,
    suppressPerTaskToast: true 
  });

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
      const currentProject = projects.find(p => p.id === projectId);
      const aspectRatioStr = currentProject?.aspectRatio || (currentProject as any)?.settings?.aspectRatio;
      if (currentProject && aspectRatioStr) {
        projectAspectRatio = parseRatio(aspectRatioStr);
        if (isNaN(projectAspectRatio)) {
          toast.error(`Invalid project aspect ratio: ${aspectRatioStr}`);
          actions.setUploadingImage(false);
          return;
        }
      } else {
        toast.error("Cannot crop to project size: Project aspect ratio not found.");
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

    actions.setLocalOrderedShotImages([...state.localOrderedShotImages, ...optimisticImages]);

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

        const imageUrl = await uploadImageToStorage(fileToUpload);
        const finalImageUrl = croppedImageUrl ? getDisplayUrl(imageUrl) : imageUrl;

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
          thumbUrl: finalImageUrl,
        });

        const finalImage: GenerationRow = {
          ...(newGeneration as Omit<GenerationRow, 'id' | 'shotImageEntryId'>),
          // Preserve the optimistic shotImageEntryId so React key stays stable
          shotImageEntryId: optimisticImage.shotImageEntryId,
          id: newGeneration.id,
          isOptimistic: false,
          imageUrl: finalImageUrl, // Ensure final URL is used
          thumbUrl: finalImageUrl,
        };
        
        return { optimisticId: optimisticImage.shotImageEntryId, finalImage, success: true };
      } catch (error: any) {
        console.error(`[ShotEditor] Error uploading one image: ${file.name}`, error);
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
        return { optimisticId: optimisticImage.shotImageEntryId, success: false };
      }
    });

    const results = await Promise.all(uploadPromises);

    // Build the final images array after processing results
    let updatedImages = [...state.localOrderedShotImages];
    results.forEach(result => {
      if (result.success) {
        const idx = updatedImages.findIndex(img => img.shotImageEntryId === result.optimisticId);
        if (idx !== -1) {
          updatedImages[idx] = result.finalImage!;
        }
      } else {
        updatedImages = updatedImages.filter(img => img.shotImageEntryId !== result.optimisticId);
      }
    });

    // Apply the single state update
    actions.setLocalOrderedShotImages(updatedImages);

    const successfulUploads = results.filter(r => r.success).length;
    if (successfulUploads > 0) {      
      // Update parent cache directly to avoid refetch-based reordering
      if (projectId) {
        queryClient.setQueryData<Shot[]>(['shots', projectId], (oldShots = []) => {
          return oldShots.map(shot => {
            if (shot.id !== selectedShot.id) return shot;
            return { ...shot, images: updatedImages };
          });
        });
      }
    }
    
    actions.setFileInputKey(Date.now());
    skipNextSyncRef.current = true; // Skip the next prop sync to prevent flicker
    actions.setUploadingImage(false);
  }, [
    state.localOrderedShotImages,
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
      // Optimistically remove the video from local state
      actions.setLocalOrderedShotImages(state.localOrderedShotImages.filter(img => img.id !== generationId));
      
      // Delete the generation (this will show success/error toasts automatically)
      await deleteGenerationMutation.mutateAsync(generationId);
      
      // Refresh the shot data
      onShotImagesUpdate(); 
    } catch (error) {
      // Rollback the optimistic update on error
      actions.setLocalOrderedShotImages(orderedShotImages);
    } finally {
      actions.setDeletingVideoId(null);
    }
  }, [selectedShot, projectId, actions, deleteGenerationMutation, onShotImagesUpdate, orderedShotImages]);

  const handleDeleteImageFromShot = useCallback(async (shotImageEntryId: string) => {
    if (!selectedShot || !projectId) {
      toast.error("Cannot delete image: No shot or project selected.");
      return;
    }

    // Optimistically remove the image from the local state
    actions.setLocalOrderedShotImages(state.localOrderedShotImages.filter(img => img.shotImageEntryId !== shotImageEntryId));
    
    removeImageFromShotMutation.mutate({
      shot_id: selectedShot.id,
      shotImageEntryId: shotImageEntryId, // Use the unique entry ID
      project_id: projectId,
    }, {
      onError: () => {
        // Rollback on error
        actions.setLocalOrderedShotImages(orderedShotImages);
      }
    });
  }, [selectedShot, projectId, actions, removeImageFromShotMutation, orderedShotImages]);

  const handleDuplicateImage = useCallback(async (shotImageEntryId: string, position: number) => {
    console.log('[DUPLICATE] handleDuplicateImage called', {
      shotImageEntryId,
      position,
      timestamp: Date.now()
    });

    if (!selectedShot || !projectId) {
      toast.error("Cannot duplicate image: No shot or project selected.");
      return;
    }

    const originalImage = state.localOrderedShotImages.find(img => img.shotImageEntryId === shotImageEntryId);
    if (!originalImage) {
      toast.error("Original image not found for duplication.");
      return;
    }
    const generationId = originalImage.id;

    // Start loading state targeting the specific shotImageEntryId
    actions.setDuplicatingImageId(shotImageEntryId);

    // Place the duplicate one position after the original (position + 1)
    const duplicatePosition = position + 1;

    console.log('[DUPLICATE] Calling duplicateImageInShotMutation', {
      duplicatePosition,
      originalPosition: position
    });

    duplicateImageInShotMutation.mutate({
      shot_id: selectedShot.id,
      generation_id: generationId,
      position: duplicatePosition,
      project_id: projectId,
    }, {
      onSuccess: () => {
        console.log('[DUPLICATE] Duplicate mutation successful');
        // Show success state
        actions.setDuplicateSuccessImageId(shotImageEntryId);
        // Clear success state after 2 seconds
        setTimeout(() => actions.setDuplicateSuccessImageId(null), 2000);
      },
      onError: (error) => {
        console.error('[DUPLICATE] Duplicate mutation failed:', error);
        toast.error(`Failed to duplicate image: ${error.message}`);
      },
      onSettled: () => {
        // Clear loading state
        actions.setDuplicatingImageId(null);
      }
    });
  }, [state.localOrderedShotImages, selectedShot, projectId, actions, duplicateImageInShotMutation]);

  const handleTimelineImageDrop = useCallback(async (files: File[], targetFrame?: number) => {
    if (!selectedShot?.id || !projectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    try {
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: files,
        targetShotId: selectedShot.id,
        currentProjectQueryKey: projectId,
        currentShotCount: 0 // Not needed when adding to existing shot
      });

      // If a target frame was specified and we got generation IDs back, set pending positions
      if (targetFrame !== undefined && result?.generationIds?.length > 0) {
        const newPending = new Map<string, number>();
        result.generationIds.forEach((genId, index) => {
            const framePosition = targetFrame + (index * batchVideoFrames);
            newPending.set(genId, framePosition);
        });
        const combined = new Map([...Array.from(state.pendingFramePositions.entries()), ...Array.from(newPending.entries())]);
        console.log('[ShotEditor] Set pending positions:', combined);
        actions.setPendingFramePositions(combined);
      }

      // Refresh the shot data, which will trigger Timeline to update
      onShotImagesUpdate();
    } catch (error) {
      console.error('Error adding images to timeline:', error);
      // Let Timeline component handle the error display via re-throw
      throw error; 
    }
  }, [selectedShot?.id, projectId, batchVideoFrames, actions, handleExternalImageDropMutation, onShotImagesUpdate]);

  return {
    handleImageUploadToShot,
    handleDeleteVideoOutput,
    handleDeleteImageFromShot,
    handleDuplicateImage,
    handleTimelineImageDrop,
    isEnqueuing,
    justQueued,
    enqueueTasks,
  };
}; 