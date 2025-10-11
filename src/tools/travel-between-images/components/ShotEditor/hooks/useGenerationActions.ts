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

    console.log('[OPTIMISTIC_DELETE] Parent handling optimistic removal from timeline', {
      shotImageEntryId: shotImageEntryId.substring(0, 8),
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
        console.log('[OPTIMISTIC_DELETE] Rolling back optimistic removal');
        actions.setLocalOrderedShotImages(orderedShotImages);
        skipNextSyncRef.current = false;
      }
    });
  }, [selectedShot?.id, projectId, actions, removeImageFromShotMutation, orderedShotImages, state.localOrderedShotImages, skipNextSyncRef]);

  const handleBatchDeleteImages = useCallback(async (shotImageEntryIds: string[]) => {
    if (!selectedShot || !projectId || shotImageEntryIds.length === 0) {
      return;
    }

    console.log('[OPTIMISTIC_DELETE] Parent handling batch optimistic removal from timeline', {
      idsToRemove: shotImageEntryIds.map(id => id.substring(0, 8)),
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
      console.log('[OPTIMISTIC_DELETE] Batch removal completed successfully');
    } catch (error) {
      // Rollback on error
      console.log('[OPTIMISTIC_DELETE] Rolling back batch optimistic removal');
      actions.setLocalOrderedShotImages(orderedShotImages);
      skipNextSyncRef.current = false;
      toast.error('Failed to remove some images from timeline');
    }
  }, [selectedShot?.id, projectId, actions, removeImageFromShotMutation, orderedShotImages, state.localOrderedShotImages, skipNextSyncRef]);

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

    const originalImage = state.localOrderedShotImages.find(img => img.shotImageEntryId === shotImageEntryId);
    if (!originalImage) {
      toast.error("Original image not found for duplication.");
      return;
    }
    const generationId = originalImage.id;
    
    console.log('[DUPLICATE_DEBUG] 📍 FOUND ORIGINAL IMAGE IN LOCAL STATE:', {
      shotImageEntryId: shotImageEntryId.substring(0, 8),
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

    console.log('[OPTIMISTIC_DUPLICATE] Adding optimistic duplicate for mobile', {
      originalId: shotImageEntryId.substring(0, 8),
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

  const handleTimelineImageDrop = useCallback(async (files: File[], targetFrame?: number) => {
    console.log('[AddImagesDebug] 🎯 handleTimelineImageDrop called:', {
      filesCount: files.length,
      targetFrame,
      targetFrameProvided: targetFrame !== undefined,
      shotId: selectedShot?.id,
      projectId,
      batchVideoFrames
    });

    if (!selectedShot?.id || !projectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    try {
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
              return file; // Return original if cropping fails
            } catch (error) {
              console.error(`Failed to crop image ${file.name}:`, error);
              return file; // Return original on error
            }
          });
          
          processedFiles = await Promise.all(cropPromises);
        }
      }
      
      console.log('[AddImagesDebug] 📤 Uploading images to shot (WITHOUT auto-positioning)...');
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: processedFiles,
        targetShotId: selectedShot.id,
        currentProjectQueryKey: projectId,
        currentShotCount: 0, // Not needed when adding to existing shot
        skipAutoPosition: true // CRITICAL: Skip auto-positioning so we can set positions ourselves
      });

      console.log('[AddImagesDebug] 📥 Upload result:', {
        hasResult: !!result,
        generationIds: result?.generationIds,
        generationIdsCount: result?.generationIds?.length
      });

      // Set pending positions for new images
      if (result?.generationIds?.length > 0) {
        let calculatedTargetFrame = targetFrame;
        
        console.log('[AddImagesDebug] 🎯 Setting pending positions, targetFrame:', {
          provided: targetFrame,
          willCalculate: calculatedTargetFrame === undefined
        });

        // If no target frame was specified, calculate it from existing positions using standardized query
        if (calculatedTargetFrame === undefined) {
          console.log('[AddImagesDebug] 🔍 Querying database for existing positions...');
          
          // Query shot_generations directly from database to get current positions
          const { data: shotGenerationsData, error } = await supabase
            .from('shot_generations')
            .select(`
              id,
              generation_id,
              timeline_frame,
              generations:generation_id (
                id,
                location,
                type
              )
            `)
            .eq('shot_id', selectedShot.id)
            .order('timeline_frame', { ascending: true });

          console.log('[AddImagesDebug] 📊 Database query result:', {
            hasError: !!error,
            error: error?.message,
            dataCount: shotGenerationsData?.length,
            sampleData: shotGenerationsData?.slice(0, 3).map(sg => ({
              id: sg.id.substring(0, 8),
              generation_id: sg.generation_id?.substring(0, 8),
              timeline_frame: sg.timeline_frame,
              hasGenerations: !!sg.generations,
              generationType: (sg.generations as any)?.type
            }))
          });

          if (error) {
            console.error('[AddImagesDebug] ❌ Error fetching shot generations for position calculation:', error);
            // Default to 0 if query fails
            calculatedTargetFrame = 0;
          } else if (shotGenerationsData) {
            // Filter out videos (standardized approach)
            const filteredShotGenerations = shotGenerationsData.filter(sg => {
              // Must have a generation
              if (!sg.generations) return false;
              
              // Not a video
              const gen = sg.generations as any;
              const isVideo = gen?.type === 'video' ||
                             gen?.type === 'video_travel_output' ||
                             (gen?.location && gen.location.endsWith('.mp4'));
              return !isVideo;
            });

            console.log('[AddImagesDebug] 🔍 After filtering videos:', {
              originalCount: shotGenerationsData.length,
              filteredCount: filteredShotGenerations.length,
              removedCount: shotGenerationsData.length - filteredShotGenerations.length
            });

            // Get positions only from items with valid timeline_frame
            const existingPositions = filteredShotGenerations
              .filter(sg => sg.timeline_frame !== null && sg.timeline_frame !== undefined)
              .map(sg => sg.timeline_frame!);
            
            console.log('[AddImagesDebug] 📍 Valid timeline_frame positions:', {
              count: existingPositions.length,
              positions: existingPositions,
              sorted: [...existingPositions].sort((a, b) => a - b)
            });

            if (existingPositions.length > 0) {
              const maxPosition = Math.max(...existingPositions);
              calculatedTargetFrame = maxPosition + 50; // Add 50 to the highest position
              console.log('[AddImagesDebug] ✅ Calculated target frame from database positions:', {
                maxPosition,
                calculatedTargetFrame,
                existingPositionsCount: existingPositions.length,
                allPositions: existingPositions
              });
            } else {
              // No existing positions, start at 0
              calculatedTargetFrame = 0;
              console.log('[AddImagesDebug] 🆕 No existing positions in database, starting at 0');
            }
          }
        }
        
        console.log('[AddImagesDebug] 🎯 Final calculatedTargetFrame:', calculatedTargetFrame);

        const newPending = new Map<string, number>();
        result.generationIds.forEach((genId, index) => {
            const framePosition = calculatedTargetFrame! + (index * batchVideoFrames);
            newPending.set(genId, framePosition);
            console.log('[AddImagesDebug] 📌 Setting pending position:', {
              generationId: genId.substring(0, 8),
              index,
              framePosition,
              calculation: `${calculatedTargetFrame} + (${index} * ${batchVideoFrames})`
            });
        });
        const combined = new Map([...Array.from(state.pendingFramePositions.entries()), ...Array.from(newPending.entries())]);
        console.log('[AddImagesDebug] 💾 Set pending positions:', {
          newPendingCount: newPending.size,
          existingPendingCount: state.pendingFramePositions.size,
          combinedCount: combined.size,
          combined: Array.from(combined.entries()).map(([id, pos]) => ({
            id: id.substring(0, 8),
            position: pos
          }))
        });
        actions.setPendingFramePositions(combined);
        
        // CRITICAL: Actually write the positions to the database
        // The upload already created records with auto-assigned positions
        // We need to overwrite them immediately before any other process runs
        console.log('[AddImagesDebug] 💿 Overwriting auto-assigned positions immediately...');
        
        console.log('[AddImagesDebug] 💿 Writing positions to database (direct update)...');
        try {
          // First, query to get the shot_generation IDs for these generation_ids
          console.log('[AddImagesDebug] 🔍 Querying for shot_generation records...');
          const { data: shotGenRecords, error: queryError } = await supabase
            .from('shot_generations')
            .select('id, generation_id, timeline_frame')
            .eq('shot_id', selectedShot.id)
            .in('generation_id', result.generationIds);
          
          if (queryError) {
            console.error('[AddImagesDebug] ❌ Error querying shot_generation records:', queryError);
            throw queryError;
          }
          
          console.log('[AddImagesDebug] 📋 Found shot_generation records:', {
            requested: result.generationIds.length,
            found: shotGenRecords?.length,
            records: shotGenRecords?.map(r => ({
              shotGenId: r.id.substring(0, 8),
              genId: r.generation_id.substring(0, 8),
              currentTimelineFrame: (r as any).timeline_frame
            }))
          });
          
          // Log if records already have positions (they shouldn't since we use skipAutoPosition: true)
          const recordsWithPositions = shotGenRecords?.filter(r => (r as any).timeline_frame !== null && (r as any).timeline_frame !== undefined);
          if (recordsWithPositions && recordsWithPositions.length > 0) {
            console.warn('[AddImagesDebug] ⚠️ UNEXPECTED: Records have timeline_frame values despite skipAutoPosition!', {
              count: recordsWithPositions.length,
              unexpectedPositions: recordsWithPositions.map(r => (r as any).timeline_frame),
              ourCalculatedPosition: calculatedTargetFrame,
              details: recordsWithPositions.map(r => ({
                shotGenId: r.id.substring(0, 8),
                genId: r.generation_id.substring(0, 8),
                unexpectedFrame: (r as any).timeline_frame,
                willOverwriteWith: calculatedTargetFrame
              }))
            });
          } else {
            console.log('[AddImagesDebug] ✅ Records have NULL timeline_frame as expected (skipAutoPosition worked!)');
          }
          
          if (!shotGenRecords || shotGenRecords.length === 0) {
            console.warn('[AddImagesDebug] ⚠️ No shot_generation records found yet, retrying...');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const { data: retryRecords, error: retryQueryError } = await supabase
              .from('shot_generations')
              .select('id, generation_id, timeline_frame')
              .eq('shot_id', selectedShot.id)
              .in('generation_id', result.generationIds);
            
            if (retryQueryError || !retryRecords || retryRecords.length === 0) {
              console.error('[AddImagesDebug] ❌ Still no records found after retry');
              return;
            }
            
            console.log('[AddImagesDebug] ✅ Retry found records:', {
              count: retryRecords.length,
              records: retryRecords.map(r => ({
                shotGenId: r.id.substring(0, 8),
                genId: r.generation_id.substring(0, 8),
                currentTimelineFrame: (r as any).timeline_frame
              }))
            });
            
            // Log if records already have positions (they shouldn't)
            const retryRecordsWithPositions = retryRecords.filter(r => (r as any).timeline_frame !== null && (r as any).timeline_frame !== undefined);
            if (retryRecordsWithPositions.length > 0) {
              console.warn('[AddImagesDebug] ⚠️ Retry: Records already have AUTO-ASSIGNED timeline_frame values from add_generation_to_shot!', {
                count: retryRecordsWithPositions.length,
                autoAssignedPositions: retryRecordsWithPositions.map(r => (r as any).timeline_frame),
                ourCalculatedPosition: calculatedTargetFrame,
                difference: retryRecordsWithPositions.length > 0 ? (retryRecordsWithPositions[0] as any).timeline_frame - calculatedTargetFrame! : 0,
                details: retryRecordsWithPositions.map(r => ({
                  shotGenId: r.id.substring(0, 8),
                  genId: r.generation_id.substring(0, 8),
                  autoAssignedFrame: (r as any).timeline_frame,
                  willOverwriteWith: calculatedTargetFrame
                }))
              });
            }
            
            // Use retry records for update below
            console.log('[AddImagesDebug] 🔄 Starting batch update (RETRY PATH) of timeline_frame values...');
            const updatePromises = result.generationIds.map(async (genId, index) => {
              const shotGenRecord = retryRecords.find(r => r.generation_id === genId);
              if (!shotGenRecord) {
                console.warn('[AddImagesDebug] ⚠️ No shot_generation found for generation:', genId.substring(0, 8));
                return { success: false, genId, error: 'Record not found' };
              }
              
              const framePosition = calculatedTargetFrame! + (index * batchVideoFrames);
              console.log('[AddImagesDebug] 💾 Updating shot_generation (retry):', {
                shotGenId: shotGenRecord.id.substring(0, 8),
                genId: genId.substring(0, 8),
                framePosition,
                index
              });
              
              const updateResult = await supabase
                .from('shot_generations')
                .update({ timeline_frame: framePosition })
                .eq('id', shotGenRecord.id);
              
              console.log('[AddImagesDebug] 📤 Update result (retry) for', genId.substring(0, 8), ':', {
                hasError: !!updateResult.error,
                error: updateResult.error,
                status: updateResult.status,
                statusText: updateResult.statusText
              });
              
              return { 
                success: !updateResult.error, 
                genId, 
                shotGenId: shotGenRecord.id,
                framePosition,
                error: updateResult.error 
              };
            });
            
            console.log('[AddImagesDebug] ⏳ Awaiting all updates (retry path)...');
            const results = await Promise.all(updatePromises);
            
            console.log('[AddImagesDebug] 📊 Batch update results summary (RETRY):', {
              total: results.length,
              successful: results.filter(r => r.success).length,
              failed: results.filter(r => !r.success).length,
              details: results.map(r => ({
                genId: r.genId.substring(0, 8),
                shotGenId: r.shotGenId?.substring(0, 8),
                framePosition: r.framePosition,
                success: r.success,
                error: typeof r.error === 'object' && r.error && 'message' in r.error ? r.error.message : r.error
              }))
            });
            
            const errors = results.filter(r => !r.success);
            
            if (errors.length > 0) {
              console.error('[AddImagesDebug] ❌ Errors updating positions (retry):', errors);
              toast.error(`Failed to set ${errors.length} timeline position(s)`);
            } else {
              console.log('[AddImagesDebug] ✅ Successfully updated all positions (retry)!');
              
              // Verify by querying the records back
              console.log('[AddImagesDebug] 🔍 Verifying updates by querying records back (retry)...');
              const { data: verifyData, error: verifyError } = await supabase
                .from('shot_generations')
                .select('id, generation_id, timeline_frame')
                .eq('shot_id', selectedShot.id)
                .in('generation_id', result.generationIds);
              
              console.log('[AddImagesDebug] ✔️ Verification query result (retry):', {
                hasError: !!verifyError,
                error: verifyError,
                recordsFound: verifyData?.length,
                records: verifyData?.map(r => ({
                  shotGenId: r.id.substring(0, 8),
                  genId: r.generation_id.substring(0, 8),
                  timeline_frame: r.timeline_frame
                }))
              });
            }
            
            return;
          }
          
          // Update each shot_generation record with its timeline_frame
          console.log('[AddImagesDebug] 🔄 Starting batch update of timeline_frame values...');
          const updatePromises = result.generationIds.map(async (genId, index) => {
            const shotGenRecord = shotGenRecords.find(r => r.generation_id === genId);
            if (!shotGenRecord) {
              console.warn('[AddImagesDebug] ⚠️ No shot_generation found for generation:', genId.substring(0, 8));
              return { success: false, genId, error: 'Record not found' };
            }
            
            const framePosition = calculatedTargetFrame! + (index * batchVideoFrames);
            console.log('[AddImagesDebug] 💾 Updating shot_generation:', {
              shotGenId: shotGenRecord.id.substring(0, 8),
              genId: genId.substring(0, 8),
              framePosition,
              index
            });
            
            const updateResult = await supabase
              .from('shot_generations')
              .update({ timeline_frame: framePosition })
              .eq('id', shotGenRecord.id);
            
            console.log('[AddImagesDebug] 📤 Update result for', genId.substring(0, 8), ':', {
              hasError: !!updateResult.error,
              error: updateResult.error,
              status: updateResult.status,
              statusText: updateResult.statusText
            });
            
            return { 
              success: !updateResult.error, 
              genId, 
              shotGenId: shotGenRecord.id,
              framePosition,
              error: updateResult.error 
            };
          });
          
          console.log('[AddImagesDebug] ⏳ Awaiting all updates...');
          const results = await Promise.all(updatePromises);
          
          console.log('[AddImagesDebug] 📊 Batch update results summary:', {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            details: results.map(r => ({
              genId: r.genId.substring(0, 8),
              shotGenId: r.shotGenId?.substring(0, 8),
              framePosition: r.framePosition,
              success: r.success,
              error: typeof r.error === 'object' && r.error && 'message' in r.error ? r.error.message : r.error
            }))
          });
          
          const errors = results.filter(r => !r.success);
          
          if (errors.length > 0) {
            console.error('[AddImagesDebug] ❌ Errors updating positions:', errors);
            toast.error(`Failed to set ${errors.length} timeline position(s)`);
          } else {
            console.log('[AddImagesDebug] ✅ Successfully updated all positions!');
            
            // Verify by querying the records back
            console.log('[AddImagesDebug] 🔍 Verifying updates by querying records back...');
            const { data: verifyData, error: verifyError } = await supabase
              .from('shot_generations')
              .select('id, generation_id, timeline_frame')
              .eq('shot_id', selectedShot.id)
              .in('generation_id', result.generationIds);
            
            console.log('[AddImagesDebug] ✔️ Verification query result:', {
              hasError: !!verifyError,
              error: verifyError,
              recordsFound: verifyData?.length,
              records: verifyData?.map(r => ({
                shotGenId: r.id.substring(0, 8),
                genId: r.generation_id.substring(0, 8),
                timeline_frame: r.timeline_frame
              }))
            });
          }
          
        } catch (dbError) {
          console.error('[AddImagesDebug] ❌ Exception writing positions to database:', dbError);
        }
      } else {
        console.log('[AddImagesDebug] ⚠️ No generation IDs returned from upload, not setting positions');
      }

      // Refresh the shot data, which will trigger Timeline to update
      console.log('[AddImagesDebug] 🔄 Calling onShotImagesUpdate to refresh...');
      onShotImagesUpdate();
      console.log('[AddImagesDebug] ✅ handleTimelineImageDrop complete');
    } catch (error) {
      console.error('[AddImagesDebug] ❌ Error adding images to timeline:', error);
      // Let Timeline component handle the error display via re-throw
      throw error; 
    }
  }, [selectedShot?.id, selectedShot?.aspect_ratio, projectId, projects, uploadSettings, batchVideoFrames, actions, handleExternalImageDropMutation, onShotImagesUpdate, state.pendingFramePositions]);

  return {
    handleImageUploadToShot,
    handleDeleteVideoOutput,
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
    handleDuplicateImage,
    handleTimelineImageDrop,
    isEnqueuing,
    justQueued,
    enqueueTasks,
    // Expose mutation for direct use (e.g., for image flipping)
    updateGenerationLocationMutation,
  };
}; 