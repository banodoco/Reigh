/**
 * Drop Handlers Hook for VideoTravelToolPage
 * 
 * Manages drag-and-drop operations for:
 * - Dropping generations onto existing shots
 * - Dropping generations to create new shots
 * - Dropping files onto existing shots
 * - Dropping files to create new shots
 * 
 * Uses useShotCreation for new shot creation (handles inheritance, events, etc.)
 * 
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 * @see ShotListDisplay.tsx - Component that triggers these handlers
 * @see useShotCreation.ts - Unified shot creation hook
 */

import { useCallback, useContext } from 'react';
import { toast } from 'sonner';
import { Shot } from '@/types/shots';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { useShotCreation } from '@/shared/hooks/useShotCreation';

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
  /** Mutation to handle external file drops (for existing shots only) */
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
 * 
 * New shot creation is delegated to useShotCreation which handles:
 * - Settings inheritance (runs in background)
 * - Last affected shot tracking
 * - Optimistic skeleton events
 */
export const useVideoTravelDropHandlers = ({
  selectedProjectId,
  shots,
  addImageToShotMutation,
  addImageToShotWithoutPositionMutation,
  handleExternalImageDropMutation,
  setShotSortMode,
}: UseVideoTravelDropHandlersParams): UseVideoTravelDropHandlersReturn => {
  
  // Use unified shot creation hook
  const { createShot } = useShotCreation();
  
  // Get setLastAffectedShotId to update the default shot in GenerationsPane
  const lastAffectedShotContext = useContext(LastAffectedShotContext);
  const setLastAffectedShotId = lastAffectedShotContext?.setLastAffectedShotId;
  
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
      
      // Update last affected shot so GenerationsPane targets this shot by default
      setLastAffectedShotId?.(shotId);
    } catch (error) {
      console.error('[ShotDrop] Failed to add to shot:', error);
      toast.error(`Failed to add to shot: ${(error as Error).message}`);
    }
  }, [selectedProjectId, shots, addImageToShotMutation, addImageToShotWithoutPositionMutation, setLastAffectedShotId]);

  // Handle dropping a generation to create a new shot
  const handleGenerationDropForNewShot = useCallback(async (
    data: GenerationDropData
  ) => {
    console.log('[ShotDrop] Creating new shot with generation:', {
      generationId: data.generationId?.substring(0, 8),
      timestamp: Date.now()
    });

    // Use unified shot creation - handles inheritance, lastAffectedShot, events automatically
    const result = await createShot({
      generationId: data.generationId,
      generationPreview: {
        imageUrl: data.imageUrl,
        thumbUrl: data.thumbUrl,
      },
      onSuccess: () => {
        // Switch to "Newest First" so the new shot appears at the top
        setShotSortMode('newest');
      },
    });

    if (!result) {
      // Error already shown by useShotCreation
      return;
    }

    console.log('[ShotDrop] New shot created:', {
      shotId: result.shotId.substring(0, 8),
      shotName: result.shotName,
    });
  }, [createShot, setShotSortMode]);

  // Handle dropping files to create a new shot
  const handleFilesDropForNewShot = useCallback(async (files: File[]) => {
    console.log('[ShotDrop] Creating new shot with files:', {
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      timestamp: Date.now()
    });

    // Use unified shot creation - handles inheritance, lastAffectedShot, events automatically
    const result = await createShot({
      files,
      onSuccess: () => {
        // Switch to "Newest First" so the new shot appears at the top
        setShotSortMode('newest');
      },
    });

    if (!result) {
      // Error already shown by useShotCreation
      return;
    }

    console.log('[ShotDrop] New shot created from files:', {
      shotId: result.shotId.substring(0, 8),
      shotName: result.shotName,
    });
  }, [createShot, setShotSortMode]);

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
      
      // Update last affected shot so GenerationsPane targets this shot by default
      setLastAffectedShotId?.(shotId);
    } catch (error) {
      console.error('[ShotDrop] Failed to add files to shot:', error);
      toast.error(`Failed to add images: ${(error as Error).message}`);
    }
  }, [selectedProjectId, shots, handleExternalImageDropMutation, setLastAffectedShotId]);

  return {
    handleGenerationDropOnShot,
    handleGenerationDropForNewShot,
    handleFilesDropForNewShot,
    handleFilesDropOnShot,
  };
};
