/**
 * Drop Handlers Hook for VideoTravelToolPage
 * 
 * Manages drag-and-drop operations for:
 * - Dropping generations onto existing shots
 * - Dropping generations to create new shots
 * - Dropping files onto existing shots
 * - Dropping files to create new shots
 * 
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 * @see ShotListDisplay.tsx - Component that triggers these handlers
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { Shot } from '@/types/shots';

export interface GenerationDropData {
  generationId: string;
  imageUrl: string;
  thumbUrl?: string;
  metadata?: any;
}

export interface UseVideoTravelDropHandlersParams {
  /** Current project ID */
  selectedProjectId: string | null | undefined;
  /** Current shots list */
  shots: Shot[] | undefined;
  /** Mutation to create a new shot */
  createShotMutation: {
    mutateAsync: (params: { name: string; projectId: string }) => Promise<{ shot?: { id: string } }>;
  };
  /** Mutation to add an image to a shot with automatic position */
  addImageToShotMutation: {
    mutateAsync: (params: {
      shot_id: string;
      generation_id: string;
      project_id: string | null | undefined;
      imageUrl: string;
      thumbUrl?: string;
    }) => Promise<any>;
  };
  /** Mutation to add an image to a shot without timeline position */
  addImageToShotWithoutPositionMutation: {
    mutateAsync: (params: {
      shot_id: string;
      generation_id: string;
      project_id: string | null | undefined;
      imageUrl: string;
      thumbUrl?: string;
    }) => Promise<any>;
  };
  /** Mutation to handle external file drops */
  handleExternalImageDropMutation: {
    mutateAsync: (params: {
      imageFiles: File[];
      targetShotId: string | null;
      currentProjectQueryKey: string | null | undefined;
      currentShotCount: number;
      skipAutoPosition?: boolean;
    }) => Promise<any>;
  };
  /** Callback to refetch shots after mutations */
  refetchShots: () => void;
  /** Callback to set shot sort mode (used to show new shots at top) */
  setShotSortMode: (mode: 'ordered' | 'newest' | 'oldest') => void;
}

export interface UseVideoTravelDropHandlersReturn {
  /** Handle dropping a generation onto an existing shot */
  handleGenerationDropOnShot: (
    shotId: string,
    data: GenerationDropData,
    options?: { withoutPosition?: boolean }
  ) => Promise<void>;
  /** Handle dropping a generation to create a new shot */
  handleGenerationDropForNewShot: (data: GenerationDropData) => Promise<void>;
  /** Handle dropping files to create a new shot */
  handleFilesDropForNewShot: (files: File[]) => Promise<void>;
  /** Handle dropping files onto an existing shot */
  handleFilesDropOnShot: (
    shotId: string,
    files: File[],
    options?: { withoutPosition?: boolean }
  ) => Promise<void>;
}

/**
 * Hook that provides drop handlers for shot list drag-and-drop operations.
 */
export const useVideoTravelDropHandlers = ({
  selectedProjectId,
  shots,
  createShotMutation,
  addImageToShotMutation,
  addImageToShotWithoutPositionMutation,
  handleExternalImageDropMutation,
  refetchShots,
  setShotSortMode,
}: UseVideoTravelDropHandlersParams): UseVideoTravelDropHandlersReturn => {
  
  // Handle dropping a generation onto an existing shot
  const handleGenerationDropOnShot = useCallback(async (
    shotId: string,
    data: GenerationDropData,
    options?: { withoutPosition?: boolean }
  ) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    const targetShot = shots?.find(s => s.id === shotId);
    const withoutPosition = options?.withoutPosition ?? false;
    
    console.log('[ShotDrop] Adding generation to shot:', {
      shotId: shotId.substring(0, 8),
      shotName: targetShot?.name,
      generationId: data.generationId?.substring(0, 8),
      withoutPosition,
      timestamp: Date.now()
    });

    try {
      if (withoutPosition) {
        // Add without timeline position
        await addImageToShotWithoutPositionMutation.mutateAsync({
          shot_id: shotId,
          generation_id: data.generationId,
          project_id: selectedProjectId,
          imageUrl: data.imageUrl,
          thumbUrl: data.thumbUrl,
        });
      } else {
        // Add with automatic position assignment
        await addImageToShotMutation.mutateAsync({
          shot_id: shotId,
          generation_id: data.generationId,
          project_id: selectedProjectId,
          imageUrl: data.imageUrl,
          thumbUrl: data.thumbUrl,
        });
      }
    } catch (error) {
      console.error('[ShotDrop] Failed to add to shot:', error);
      toast.error(`Failed to add to shot: ${(error as Error).message}`);
    }
  }, [selectedProjectId, shots, addImageToShotMutation, addImageToShotWithoutPositionMutation]);

  // Handle dropping a generation to create a new shot
  const handleGenerationDropForNewShot = useCallback(async (
    data: GenerationDropData
  ) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    const newShotName = `Shot ${(shots?.length ?? 0) + 1}`;
    console.log('[ShotDrop] Creating new shot with generation:', {
      newShotName,
      generationId: data.generationId?.substring(0, 8),
      timestamp: Date.now()
    });

    try {
      // First create the shot
      const result = await createShotMutation.mutateAsync({
        name: newShotName,
        projectId: selectedProjectId,
      } as any);

      const newShotId = result.shot?.id;
      if (!newShotId) {
        throw new Error('Failed to create shot - no ID returned');
      }

      // Then add the generation to it
      await addImageToShotMutation.mutateAsync({
        shot_id: newShotId,
        generation_id: data.generationId,
        project_id: selectedProjectId,
        imageUrl: data.imageUrl,
        thumbUrl: data.thumbUrl,
      });

      // Switch to "Newest First" so the new shot appears at the top
      setShotSortMode('newest');

      // Refetch shots to update the list (don't await - mutations already invalidate cache)
      refetchShots();
    } catch (error) {
      console.error('[ShotDrop] Failed to create new shot:', error);
      toast.error(`Failed to create shot: ${(error as Error).message}`);
    }
  }, [selectedProjectId, shots, createShotMutation, addImageToShotMutation, refetchShots, setShotSortMode]);

  // Handle dropping files to create a new shot
  const handleFilesDropForNewShot = useCallback(async (files: File[]) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    console.log('[ShotDrop] Creating new shot with files:', {
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      timestamp: Date.now()
    });

    try {
      // Use the external image drop mutation which handles file uploads and shot creation
      await handleExternalImageDropMutation.mutateAsync({
        imageFiles: files,
        targetShotId: null, // Create new shot
        currentProjectQueryKey: selectedProjectId,
        currentShotCount: shots?.length ?? 0
      });

      // Switch to "Newest First" so the new shot appears at the top
      setShotSortMode('newest');

      // Refetch shots to update the list (don't await - mutations already invalidate cache)
      refetchShots();
    } catch (error) {
      console.error('[ShotDrop] Failed to create new shot from files:', error);
      toast.error(`Failed to create shot: ${(error as Error).message}`);
    }
  }, [selectedProjectId, shots, handleExternalImageDropMutation, refetchShots, setShotSortMode]);

  // Handle dropping files onto an existing shot
  const handleFilesDropOnShot = useCallback(async (
    shotId: string,
    files: File[],
    options?: { withoutPosition?: boolean }
  ) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    const withoutPosition = options?.withoutPosition ?? false;

    console.log('[ShotDrop] Adding files to existing shot:', {
      shotId: shotId.substring(0, 8),
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      withoutPosition,
      timestamp: Date.now()
    });

    try {
      await handleExternalImageDropMutation.mutateAsync({
        imageFiles: files,
        targetShotId: shotId, // Add to existing shot
        currentProjectQueryKey: selectedProjectId,
        currentShotCount: shots?.length ?? 0,
        skipAutoPosition: withoutPosition, // Use skipAutoPosition to add without timeline position
      });

      // Refetch shots - skeleton clears when new images appear in data
      refetchShots();
    } catch (error) {
      console.error('[ShotDrop] Failed to add files to shot:', error);
      toast.error(`Failed to add images: ${(error as Error).message}`);
    }
  }, [selectedProjectId, shots, handleExternalImageDropMutation, refetchShots]);

  return {
    handleGenerationDropOnShot,
    handleGenerationDropForNewShot,
    handleFilesDropForNewShot,
    handleFilesDropOnShot,
  };
};
