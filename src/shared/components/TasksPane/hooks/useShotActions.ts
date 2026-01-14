import { useState, useCallback } from 'react';
import { toast as sonnerToast } from 'sonner';
import { useAddImageToShot, useAddImageToShotWithoutPosition } from '@/shared/hooks/useShots';

interface UseShotActionsOptions {
  lightboxSelectedShotId: string | undefined;
  currentShotId: string | null;
  lastAffectedShotId: string | null;
  selectedProjectId: string | null;
}

export function useShotActions({
  lightboxSelectedShotId,
  currentShotId,
  lastAffectedShotId,
  selectedProjectId,
}: UseShotActionsOptions) {
  // Optimistic updates for "Add to Shot" button states
  const [optimisticPositionedIds, setOptimisticPositionedIds] = useState<Set<string>>(new Set());
  const [optimisticUnpositionedIds, setOptimisticUnpositionedIds] = useState<Set<string>>(new Set());

  // Shot management mutations
  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();

  // Optimistic update handlers - use composite key mediaId:shotId
  const handleOptimisticPositioned = useCallback((mediaId: string, shotId?: string) => {
    const key = shotId ? `${mediaId}:${shotId}` : mediaId;
    setOptimisticPositionedIds(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setOptimisticUnpositionedIds(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);
  
  const handleOptimisticUnpositioned = useCallback((mediaId: string, shotId?: string) => {
    const key = shotId ? `${mediaId}:${shotId}` : mediaId;
    setOptimisticUnpositionedIds(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setOptimisticPositionedIds(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Handler for adding generation to shot (with position)
  const handleAddToShot = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    // Prefer the locally selected shot in the lightbox, falling back to global current shot
    const targetShotId = lightboxSelectedShotId || currentShotId || lastAffectedShotId;
    
    if (!targetShotId) {
      console.error('[useShotActions] No shot selected');
      sonnerToast.error('No shot selected. Please select a shot first.');
      return false;
    }
    
    if (!selectedProjectId) {
      console.error('[useShotActions] No project selected');
      sonnerToast.error('No project selected');
      return false;
    }
    
    // Optimistically update UI with composite key
    handleOptimisticPositioned(generationId, targetShotId);
    
    try {
      await addImageToShotMutation.mutateAsync({
        shot_id: targetShotId,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: selectedProjectId,
      });
      
      return true;
    } catch (error) {
      console.error('[useShotActions] Failed to add to shot:', error);
      // Revert optimistic update on error
      const key = `${generationId}:${targetShotId}`;
      setOptimisticPositionedIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      sonnerToast.error('Failed to add to shot');
      return false;
    }
  }, [lightboxSelectedShotId, currentShotId, lastAffectedShotId, selectedProjectId, addImageToShotMutation, handleOptimisticPositioned]);
  
  // Handler for adding generation to shot (without position)
  const handleAddToShotWithoutPosition = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    const targetShotId = lightboxSelectedShotId || currentShotId || lastAffectedShotId;

    if (!targetShotId) {
      console.error('[useShotActions] No shot selected');
      sonnerToast.error('No shot selected. Please select a shot first.');
      return false;
    }
    
    if (!selectedProjectId) {
      console.error('[useShotActions] No project selected');
      sonnerToast.error('No project selected');
      return false;
    }
    
    // Optimistically update UI with composite key
    handleOptimisticUnpositioned(generationId, targetShotId);
    
    try {
      await addImageToShotWithoutPositionMutation.mutateAsync({
        shot_id: targetShotId,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: selectedProjectId,
      });
      
      return true;
    } catch (error) {
      console.error('[useShotActions] Failed to add to shot without position:', error);
      // Revert optimistic update on error
      const key = `${generationId}:${targetShotId}`;
      setOptimisticUnpositionedIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      sonnerToast.error('Failed to add to shot');
      return false;
    }
  }, [lightboxSelectedShotId, currentShotId, lastAffectedShotId, selectedProjectId, addImageToShotWithoutPositionMutation, handleOptimisticUnpositioned]);

  return {
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    handleOptimisticPositioned,
    handleOptimisticUnpositioned,
  };
}

