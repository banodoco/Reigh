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

  // Handle drag and drop reordering in batch mode
  const handleReorder = useCallback(async (orderedShotImageEntryIds: string[]) => {
    if (!shotId || orderedShotImageEntryIds.length === 0) {
      return;
    }

    console.log('[useEnhancedShotImageReorder] Handling reorder:', {
      shotId,
      orderedIds: orderedShotImageEntryIds.map(id => id.substring(0, 8))
    });

    try {
      // Find the changes by comparing current order with new order
      const currentImages = getImagesForMode('batch');
      const currentOrder = currentImages.map(img => img.shotImageEntryId || img.id);
      
      // Build a map of current positions
      const currentPositionMap = new Map<string, number>();
      currentImages.forEach((img, index) => {
        currentPositionMap.set(img.shotImageEntryId || img.id, index);
      });

      // Enhanced exchange detection: Convert any reordering into a series of adjacent exchanges
      // This handles both simple swaps and complex multi-step moves
      const exchanges: Array<{ fromId: string; toId: string; fromGenId: string; toGenId: string }> = [];
      
      // Create a working copy of the current order to simulate the exchanges
      const workingOrder = [...currentOrder];
      
      // For each position in the desired order, move the correct item there via adjacent swaps
      for (let targetPos = 0; targetPos < orderedShotImageEntryIds.length; targetPos++) {
        const desiredId = orderedShotImageEntryIds[targetPos];
        const currentPos = workingOrder.indexOf(desiredId);
        
        if (currentPos === -1) {
          console.warn(`[useEnhancedShotImageReorder] Item ${desiredId} not found in current order`);
          continue;
        }
        
        // If item is already in the right position, skip
        if (currentPos === targetPos) {
          continue;
        }
        
        // Move the item to target position via adjacent swaps
        if (currentPos < targetPos) {
          // Item needs to move right - swap with each item to the right
          for (let i = currentPos; i < targetPos; i++) {
            const itemA = workingOrder[i];
            const itemB = workingOrder[i + 1];
            
            // Find the generation objects for these items
            const imgA = currentImages.find(img => (img.shotImageEntryId || img.id) === itemA);
            const imgB = currentImages.find(img => (img.shotImageEntryId || img.id) === itemB);
            
            if (imgA && imgB) {
              exchanges.push({
                fromId: itemA,
                toId: itemB,
                fromGenId: imgA.id,
                toGenId: imgB.id
              });
              
              // Update working order to reflect this swap
              [workingOrder[i], workingOrder[i + 1]] = [workingOrder[i + 1], workingOrder[i]];
            }
          }
        } else {
          // Item needs to move left - swap with each item to the left
          for (let i = currentPos; i > targetPos; i--) {
            const itemA = workingOrder[i];
            const itemB = workingOrder[i - 1];
            
            // Find the generation objects for these items
            const imgA = currentImages.find(img => (img.shotImageEntryId || img.id) === itemA);
            const imgB = currentImages.find(img => (img.shotImageEntryId || img.id) === itemB);
            
            if (imgA && imgB) {
              exchanges.push({
                fromId: itemA,
                toId: itemB,
                fromGenId: imgA.id,
                toGenId: imgB.id
              });
              
              // Update working order to reflect this swap
              [workingOrder[i], workingOrder[i - 1]] = [workingOrder[i - 1], workingOrder[i]];
            }
          }
        }
      }
      
      // No need to remove duplicates since we're generating a specific sequence
      const uniqueExchanges = exchanges;

      console.log('[useEnhancedShotImageReorder] Enhanced exchange detection results:', {
        originalOrder: currentOrder.map(id => id.substring(0, 8)),
        desiredOrder: orderedShotImageEntryIds.map(id => id.substring(0, 8)),
        finalWorkingOrder: workingOrder.map(id => id.substring(0, 8)),
        exchangeCount: uniqueExchanges.length,
        exchanges: uniqueExchanges.map(ex => ({
          from: ex.fromGenId.substring(0, 8),
          to: ex.toGenId.substring(0, 8)
        })),
        orderMatches: JSON.stringify(workingOrder) === JSON.stringify(orderedShotImageEntryIds)
      });

      // Perform all exchanges in a batch to prevent UI flickering
      if (uniqueExchanges.length > 0) {
        await batchExchangePositions(
          uniqueExchanges.map(ex => ({
            generationIdA: ex.fromGenId,
            generationIdB: ex.toGenId
          }))
        );
      }

      if (uniqueExchanges.length > 0) {
        toast.success(`Exchanged positions for ${uniqueExchanges.length} item pairs`);
      }

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
        position: targetItem.position
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
