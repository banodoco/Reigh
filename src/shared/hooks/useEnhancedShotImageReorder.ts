import { useCallback } from 'react';
import { useEnhancedShotPositions } from './useEnhancedShotPositions';
import { toast } from 'sonner';

/**
 * Enhanced hook for handling shot image reordering with position exchange support
 * Now accepts parent hook functions to avoid duplicate data sources
 */
export const useEnhancedShotImageReorder = (
  shotId: string | null,
  parentHook?: {
    shotGenerations: any[];
    getImagesForMode: (mode: 'batch' | 'timeline') => any[];
    exchangePositions: (genIdA: string, genIdB: string) => Promise<void>;
    batchExchangePositions: (exchanges: Array<{ generationIdA: string; generationIdB: string }>) => Promise<void>;
    deleteItem: (genId: string) => Promise<void>;
    loadPositions: () => Promise<void>;
    isLoading: boolean;
  }
) => {
  // Use parent hook functions if provided, otherwise create own instance
  const ownHook = useEnhancedShotPositions(parentHook ? null : shotId);
  
  const {
    shotGenerations,
    getImagesForMode,
    exchangePositions,
    batchExchangePositions,
    deleteItem,
    loadPositions,
    isLoading
  } = parentHook || ownHook;

  // Handle drag and drop reordering in batch mode - Timeline-frame-based swapping
  const handleReorder = useCallback(async (orderedShotImageEntryIds: string[]) => {
    if (!shotId || orderedShotImageEntryIds.length === 0) {
      return;
    }

    console.log('[useEnhancedShotImageReorder] Handling timeline-frame-based reorder:', {
      shotId,
      orderedIds: orderedShotImageEntryIds.map(id => id.substring(0, 8))
    });

    try {
      // Get current images and their timeline_frame values
      const currentImages = getImagesForMode('batch');
      const currentOrder = currentImages.map(img => img.shotImageEntryId || img.id);
      
      // Find what actually changed between current and desired order
      const changes: Array<{
        oldPos: number;
        newPos: number;
        shotImageEntryId: string;
        generationId: string;
        currentTimelineFrame: number;
        targetTimelineFrame: number;
      }> = [];

      // For each item in the desired order, check if its position changed
      for (let newPos = 0; newPos < orderedShotImageEntryIds.length; newPos++) {
        const shotImageEntryId = orderedShotImageEntryIds[newPos];
        const oldPos = currentOrder.indexOf(shotImageEntryId);
        
        if (oldPos !== -1 && oldPos !== newPos) {
          // This item moved - find its current and target timeline_frame values
          const currentImg = currentImages[oldPos];
          const targetImg = currentImages[newPos];
          
          // Find the shot_generation data to get timeline_frame values
          const currentShotGen = shotGenerations.find(sg => sg.generation_id === currentImg.id);
          const targetShotGen = shotGenerations.find(sg => sg.generation_id === targetImg.id);
          
          if (currentShotGen && targetShotGen) {
            changes.push({
              oldPos,
              newPos,
              shotImageEntryId,
              generationId: currentImg.id,
              currentTimelineFrame: currentShotGen.timeline_frame || 0,
              targetTimelineFrame: targetShotGen.timeline_frame || 0
            });
          }
        }
      }

      console.log('[useEnhancedShotImageReorder] Timeline-frame-based changes detected:', {
        changesCount: changes.length,
        changes: changes.map(c => ({
          id: c.generationId.substring(0, 8),
          oldPos: c.oldPos,
          newPos: c.newPos,
          currentFrame: c.currentTimelineFrame,
          targetFrame: c.targetTimelineFrame,
          frameSwap: `${c.currentTimelineFrame} → ${c.targetTimelineFrame}`
        }))
      });

      if (changes.length === 0) {
        console.log('[useEnhancedShotImageReorder] No changes detected');
        return;
      }

      // Convert changes into direct timeline_frame swaps
      // For timeline-frame-based swapping, we need to identify pairs of items that should swap values
      const exchanges: Array<{ shotGenerationIdA: string; shotGenerationIdB: string }> = [];
      const processedPairs = new Set<string>();

      for (const change of changes) {
        // Find if there's another item that should get this item's current timeline_frame
        const reciprocalChange = changes.find(c => 
          c.generationId !== change.generationId && 
          c.targetTimelineFrame === change.currentTimelineFrame &&
          c.currentTimelineFrame === change.targetTimelineFrame
        );

        if (reciprocalChange) {
          // This is a direct swap - create exchange pair using shot_generation IDs
          const pairKey = [change.generationId, reciprocalChange.generationId].sort().join('-');
          
          if (!processedPairs.has(pairKey)) {
            // Find the shot_generation IDs for these generation IDs
            const shotGenA = shotGenerations.find(sg => sg.generation_id === change.generationId);
            const shotGenB = shotGenerations.find(sg => sg.generation_id === reciprocalChange.generationId);
            
            if (shotGenA && shotGenB) {
              exchanges.push({
                shotGenerationIdA: shotGenA.id,
                shotGenerationIdB: shotGenB.id
              });
              processedPairs.add(pairKey);
              
              console.log('[useEnhancedShotImageReorder] Direct timeline_frame swap:', {
                itemA: change.generationId.substring(0, 8),
                itemB: reciprocalChange.generationId.substring(0, 8),
                shotGenA: shotGenA.id.substring(0, 8),
                shotGenB: shotGenB.id.substring(0, 8),
                swapFrames: `${change.currentTimelineFrame} ↔ ${change.targetTimelineFrame}`
              });
            }
          }
        }
      }

      // Perform all exchanges in a batch
      if (exchanges.length > 0) {
        console.log('[useEnhancedShotImageReorder] Executing timeline-frame swaps:', {
          exchangeCount: exchanges.length,
          exchanges: exchanges.map(ex => ({
            shotGenA: ex.shotGenerationIdA.substring(0, 8),
            shotGenB: ex.shotGenerationIdB.substring(0, 8)
          }))
        });

        await batchExchangePositions(exchanges);
      } else {
        console.warn('[useEnhancedShotImageReorder] No direct swaps detected - complex reordering not yet supported in timeline-frame mode');
      }

      // Reordering completed successfully - no toast needed for smooth UX

    } catch (error) {
      console.error('[useEnhancedShotImageReorder] Reorder error:', error);
      toast.error('Failed to reorder items');
      throw error;
    }
  }, [shotId, getImagesForMode, exchangePositions]);

  // Handle item deletion
  const handleDelete = useCallback(async (shotImageEntryId: string) => {
    if (!shotId) {
      throw new Error('No shot ID provided for deletion');
    }

    try {
      // Find the shot generation record by its ID
      const targetItem = shotGenerations.find(sg => sg.id === shotImageEntryId);
      if (!targetItem) {
        throw new Error('Item not found for deletion');
      }

      console.log('[PositionSystemDebug] 🗑️ Deleting individual duplicate item:', {
        shotImageEntryId: shotImageEntryId.substring(0, 8),
        generationId: targetItem.generation_id.substring(0, 8),
        timeline_frame: targetItem.timeline_frame
      });

      // Pass the shot_generations.id (shotImageEntryId) to delete only this specific record
      await deleteItem(shotImageEntryId);
      
    } catch (error) {
      console.error('[useEnhancedShotImageReorder] Delete error:', error);
      toast.error('Failed to delete item');
      throw error;
    }
  }, [shotId, shotGenerations, deleteItem]);

  return {
    handleReorder,
    handleDelete,
    isLoading,
    // Provide batch-mode sorted images
    getBatchImages: () => getImagesForMode('batch')
  };
};
