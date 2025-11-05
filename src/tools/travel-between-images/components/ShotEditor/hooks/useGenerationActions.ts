import { useCallback, useRef } from 'react';
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

        // Generate client-side thumbnail
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
          `);
          
          // Upload both main image and thumbnail
          const uploadResult = await uploadImageWithThumbnail(fileToUpload, thumbnailResult.thumbnailBlob, userId);
          finalImageUrl = croppedImageUrl ? getDisplayUrl(uploadResult.imageUrl) : uploadResult.imageUrl;
          thumbnailUrl = uploadResult.thumbnailUrl;
          
          } catch (thumbnailError) {
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
  }, [selectedShot?.id, projectId, actions, deleteGenerationMutation, onShotImagesUpdate, orderedShotImages]);

  const handleDeleteImageFromShot = useCallback(async (shotImageEntryId: string) => {
    if (!selectedShot || !projectId) {
      toast.error("Cannot remove image: No shot or project selected.");
      return;
    }

    ,
      currentCount: state.localOrderedShotImages.length
    });

    // Optimistically remove the image from the local state
    // NOTE: This removes timeline_frame (not deleting the record), so generation is preserved
    const optimisticImages = state.localOrderedShotImages.filter(img => img.shotImageEntryId !== shotImageEntryId);
    actions.setLocalOrderedShotImages(optimisticImages);
    skipNextSyncRef.current = true; // Skip next prop sync to prevent flicker
    
    removeImageFromShotMutation.mutate({
      shot_id: selectedShot.id,
      shotImageEntryId: shotImageEntryId, // Use the unique entry ID
      project_id: projectId,
    }, {
      onError: () => {
        // Rollback on error
        actions.setLocalOrderedShotImages(orderedShotImages);
        skipNextSyncRef.current = false;
      }
    });
  }, [selectedShot?.id, projectId, actions, removeImageFromShotMutation, orderedShotImages, state.localOrderedShotImages, skipNextSyncRef]);

  const handleBatchDeleteImages = useCallback(async (shotImageEntryIds: string[]) => {
    if (!selectedShot || !projectId || shotImageEntryIds.length === 0) {
      return;
    }

    ),
      totalCount: shotImageEntryIds.length,
      currentCount: state.localOrderedShotImages.length
    });

    // Optimistically remove all images from the local state
    // NOTE: This removes timeline_frame (not deleting the records), so generations are preserved
    const optimisticImages = state.localOrderedShotImages.filter(img => !shotImageEntryIds.includes(img.shotImageEntryId));
    actions.setLocalOrderedShotImages(optimisticImages);
    skipNextSyncRef.current = true; // Skip next prop sync to prevent flicker
    
    // Execute all timeline removals
    const removePromises = shotImageEntryIds.map(id => 
      removeImageFromShotMutation.mutateAsync({
        shot_id: selectedShot.id,
        shotImageEntryId: id,
        project_id: projectId,
      })
    );

    try {
      await Promise.all(removePromises);
      } catch (error) {
      // Rollback on error
      actions.setLocalOrderedShotImages(orderedShotImages);
      skipNextSyncRef.current = false;
      toast.error('Failed to remove some images from timeline');
    }
  }, [selectedShot?.id, projectId, actions, removeImageFromShotMutation, orderedShotImages, state.localOrderedShotImages, skipNextSyncRef]);

  const handleDuplicateImage = useCallback(async (shotImageEntryId: string, timeline_frame: number) => {
    ,
      timeline_frame,
      timestamp: Date.now(),
      source: 'timeline_duplicate_button'
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
    
    ,
      generationId: generationId.substring(0, 8),
      timeline_frame_from_button: timeline_frame,
      timeline_frame_from_image: (originalImage as any).timeline_frame,
      imageUrl: originalImage.imageUrl?.substring(0, 50) + '...',
      totalImagesInShot: state.localOrderedShotImages.length
    });

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

    ,
      tempDuplicateId: tempDuplicateId.substring(0, 8),
      currentImagesCount: state.localOrderedShotImages.length
    });

    // Find position of original image and insert duplicate after it
    const originalIndex = state.localOrderedShotImages.findIndex(img => img.shotImageEntryId === shotImageEntryId);
    const optimisticImages = [...state.localOrderedShotImages];
    if (originalIndex !== -1) {
      optimisticImages.splice(originalIndex + 1, 0, optimisticDuplicate);
      actions.setLocalOrderedShotImages(optimisticImages);
      skipNextSyncRef.current = true; // Skip the next prop sync to prevent flicker
    }

    // Position is now computed from timeline_frame, so we don't need to calculate it
    // The useDuplicateImageInShot hook will calculate the timeline_frame midpoint
    
    .timeline_frame
    });

    duplicateImageInShotMutation.mutate({
      shot_id: selectedShot.id,
      generation_id: generationId,
      // Position will be computed from timeline_frame - no parameter needed
      project_id: projectId,
    }, {
      onSuccess: (result) => {
        // Replace optimistic duplicate with real data
        const updatedImages = state.localOrderedShotImages.map(img => 
          img.shotImageEntryId === tempDuplicateId ? {
            ...img,
            shotImageEntryId: result.id,
            id: result.generation_id,
            isOptimistic: false
          } : img
        );
        actions.setLocalOrderedShotImages(updatedImages);
        
        // Show success state
        actions.setDuplicateSuccessImageId(shotImageEntryId);
        // Clear success state after 2 seconds
        setTimeout(() => actions.setDuplicateSuccessImageId(null), 2000);
      },
      onError: (error) => {
        console.error('[DUPLICATE] Duplicate mutation failed:', error);
        toast.error(`Failed to duplicate image: ${error.message}`);
        
        // Remove optimistic duplicate on error
        const revertedImages = state.localOrderedShotImages.filter(img => img.shotImageEntryId !== tempDuplicateId);
        actions.setLocalOrderedShotImages(revertedImages);
      },
      onSettled: () => {
        // Clear loading state
        actions.setDuplicatingImageId(null);
      }
    });
  }, [state.localOrderedShotImages, selectedShot?.id, projectId, actions, duplicateImageInShotMutation, skipNextSyncRef]);

  /**
   * Handle dropping external image files onto the timeline
   * This is now a clean orchestration function using extracted helpers
   */
  const handleTimelineImageDrop = useCallback(async (files: File[], targetFrame?: number) => {
    if (!selectedShot?.id || !projectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    try {
      // Set uploading state
      actions.setUploadingImage(true);
      
      // 1. Crop images to shot aspect ratio
      const processedFiles = await cropImagesToShotAspectRatio(
        files,
        selectedShot,
        projectId,
        projects,
        uploadSettings
      );
      
      // 2. Upload images to shot
      ...');
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: processedFiles,
        targetShotId: selectedShot.id,
        currentProjectQueryKey: projectId,
        currentShotCount: 0, // Not needed when adding to existing shot
        skipAutoPosition: true, // CRITICAL: Skip auto-positioning so we can set positions ourselves
        onProgress: (fileIndex, fileProgress, overallProgress) => {
          `);
        }
      });

      // 3. Set pending positions for new images
      if (result?.generationIds?.length > 0) {
        // Calculate target frame if not provided
        const calculatedTargetFrame = await calculateNextAvailableFrame(
          selectedShot.id,
          targetFrame
        );
        
        // Create position map for new images
        const newPending = createPositionMap(
          result.generationIds,
                calculatedTargetFrame,
          batchVideoFrames
        );
        
        // Combine with existing pending positions
        const combined = new Map([
          ...Array.from(state.pendingFramePositions.entries()), 
          ...Array.from(newPending.entries())
        ]);
        
        ).map(([id, pos]) => ({
            id: id.substring(0, 8),
            position: pos
          }))
        });
        
        actions.setPendingFramePositions(combined);
        
        // 4. Persist positions to database immediately
        await persistTimelinePositions(
          selectedShot.id,
          result.generationIds,
          calculatedTargetFrame,
          batchVideoFrames
        );
      } else {
        }

      // 5. Refresh the shot data, which will trigger Timeline to update
      onShotImagesUpdate();
      } catch (error) {
      // Let Timeline component handle the error display via re-throw
      throw error; 
    } finally {
      // Clear uploading state
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
    onShotImagesUpdate, 
    state.pendingFramePositions
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
    ,
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
      
      // Refresh shot data
      await onShotImagesUpdate();
      
      } catch (error) {
      console.error('[GenerationDrop] ❌ Error adding generation to timeline:', error);
      toast.error(`Failed to add generation: ${(error as Error).message}`);
      throw error;
    }
  }, [selectedShot?.id, selectedShot?.name, projectId, addImageToShotMutation, onShotImagesUpdate]);

  /**
   * Handle dropping external images onto batch mode grid
   * Uploads files and inserts them at the specified position
   */
  const handleBatchImageDrop = useCallback(async (
    files: File[],
    targetPosition?: number,
    framePosition?: number
  ) => {
    });

    if (!selectedShot?.id || !projectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    try {
      // Set uploading state
      actions.setUploadingImage(true);
      // Crop images to shot aspect ratio before uploading
      let processedFiles = files;
      
      // Prioritize shot aspect ratio over project aspect ratio
      const currentProject = projects.find(p => p.id === projectId);
      const aspectRatioStr = selectedShot?.aspect_ratio || currentProject?.aspectRatio || (currentProject as any)?.settings?.aspectRatio;
      
      if (aspectRatioStr && uploadSettings?.cropToProjectSize !== false) {
        const targetAspectRatio = parseRatio(aspectRatioStr);
        
        if (!isNaN(targetAspectRatio)) {
          const cropPromises = files.map(async (file) => {
            try {
              const result = await cropImageToProjectAspectRatio(file, targetAspectRatio);
              if (result) {
                return result.croppedFile;
              }
              return file;
            } catch (error) {
              console.error(`Failed to crop image ${file.name}:`, error);
              return file;
            }
          });
          
          processedFiles = await Promise.all(cropPromises);
          }
      }
      
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: processedFiles,
        targetShotId: selectedShot.id,
        currentProjectQueryKey: projectId,
        currentShotCount: 0,
        skipAutoPosition: true
      });
      
      : [],
        timestamp: Date.now()
      });
      
      ),
        generationIdsCount: result?.generationIds?.length,
        timestamp: Date.now()
      });
      
      // Update frame positions for the newly uploaded images
      if (result?.generationIds?.length > 0 && framePosition !== undefined) {
        ),
          startFrame: framePosition,
          count: result.generationIds.length,
        });

        const newPendingPositions = new Map<string, number>();
        result.generationIds.forEach((id, i) => {
          const newFrame = framePosition + i;
          newPendingPositions.set(id, newFrame);
          ,
            index: i,
            frame: newFrame
          });
        });
        
        actions.setPendingFramePositions(new Map([...state.pendingFramePositions, ...newPendingPositions]));
        
        // NOW: Directly update the database with these frame positions (like timeline does)
        try {
          const { data: shotGenRecords, error: queryError } = await supabase
            .from('shot_generations')
            .select('id, generation_id, timeline_frame')
            .eq('shot_id', selectedShot.id)
            .in('generation_id', result.generationIds);
          
          ,
              generationId: r.generation_id.substring(0, 8),
              currentFrame: (r as any).timeline_frame
            }))
          });
          
          if (queryError) {
            throw queryError;
          }
          
          if (!shotGenRecords || shotGenRecords.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const { data: retryRecords, error: retryError } = await supabase
              .from('shot_generations')
              .select('id, generation_id, timeline_frame')
              .eq('shot_id', selectedShot.id)
              .in('generation_id', result.generationIds);
            
            if (retryError || !retryRecords || retryRecords.length === 0) {
              return;
            }
            
            // Use retry records
            ...');
            const updatePromises = result.generationIds.map(async (genId, index) => {
              const shotGenRecord = retryRecords.find(r => r.generation_id === genId);
              if (!shotGenRecord) {
                return { success: false, genId };
              }
              
              const frameValue = framePosition + index;
              ,
                generationId: genId.substring(0, 8),
                frameValue
              });
              
              const { error: updateError } = await supabase
                .from('shot_generations')
                .update({ timeline_frame: frameValue })
                .eq('id', shotGenRecord.id);
              
              if (updateError) {
                return { success: false, genId, error: updateError };
              }
              
              ,
                frameValue
              });
              
              return { success: true, genId, frameValue };
            });
            
            const updateResults = await Promise.all(updatePromises);
            :', {
              total: updateResults.length,
              successful: updateResults.filter(r => r.success).length,
              failed: updateResults.filter(r => !r.success).length
            });
            
            return;
          }
          
          // Update all records
          const updatePromises = result.generationIds.map(async (genId, index) => {
            const shotGenRecord = shotGenRecords.find(r => r.generation_id === genId);
            if (!shotGenRecord) {
              return { success: false, genId };
            }
            
            const frameValue = framePosition + index;
            ,
              generationId: genId.substring(0, 8),
              frameValue
            });
            
            const { error: updateError } = await supabase
              .from('shot_generations')
              .update({ timeline_frame: frameValue })
              .eq('id', shotGenRecord.id);
            
            if (updateError) {
              return { success: false, genId, error: updateError };
            }
            
            ,
              frameValue
            });
            
            return { success: true, genId, frameValue };
          });
          
          const updateResults = await Promise.all(updatePromises);
          .length,
            failed: updateResults.filter(r => !r.success).length,
            details: updateResults.map(r => ({
              generationId: r.genId.substring(0, 8),
              success: r.success,
              frameValue: r.frameValue
            }))
          });
          
        } catch (dbError) {
        }
      } else {
        }
      
      await onShotImagesUpdate();
      
      } catch (error) {
      toast.error(`Failed to add images: ${(error as Error).message}`);
      throw error;
    } finally {
      actions.setUploadingImage(false);
      }
  }, [selectedShot?.id, selectedShot?.aspect_ratio, projectId, projects, uploadSettings, actions, handleExternalImageDropMutation, onShotImagesUpdate, state.pendingFramePositions]);

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
    ,
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
      ...');
      
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
      
      // Refresh shot data
      await onShotImagesUpdate();
      
      } catch (error) {
      console.error('[BatchDrop] ❌ Error adding generation to batch:', error);
      toast.error(`Failed to add generation: ${(error as Error).message}`);
      throw error;
    }
  }, [selectedShot?.id, selectedShot?.name, projectId, addImageToShotMutation, onShotImagesUpdate]);

  return {
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
  };
}; 