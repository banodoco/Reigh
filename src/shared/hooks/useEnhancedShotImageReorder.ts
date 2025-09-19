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

      // Find what changed by comparing arrays
      const exchanges: Array<{ fromId: string; toId: string; fromGenId: string; toGenId: string }> = [];
      
      for (let newIndex = 0; newIndex < orderedShotImageEntryIds.length; newIndex++) {
        const newId = orderedShotImageEntryIds[newIndex];
        const currentIndex = currentOrder.indexOf(newId);
        
        if (currentIndex !== newIndex && currentIndex !== -1) {
          // This item moved - find what it swapped with
          const displacedId = currentOrder[newIndex];
          const displacedNewIndex = orderedShotImageEntryIds.indexOf(displacedId);
          
          if (displacedNewIndex === currentIndex) {
            // This is a clean swap between two items
            const fromImg = currentImages.find(img => (img.shotImageEntryId || img.id) === newId);
            const toImg = currentImages.find(img => (img.shotImageEntryId || img.id) === displacedId);
            
            if (fromImg && toImg) {
              exchanges.push({
                fromId: newId,
                toId: displacedId,
                fromGenId: fromImg.id,
                toGenId: toImg.id
              });
            }
          }
        }
      }

      // Remove duplicates (each swap is detected twice)
      const uniqueExchanges = exchanges.filter((exchange, index) => 
        !exchanges.slice(0, index).some(prev => 
          (prev.fromGenId === exchange.toGenId && prev.toGenId === exchange.fromGenId)
        )
      );

      console.log('[useEnhancedShotImageReorder] Detected exchanges:', {
        exchangeCount: uniqueExchanges.length,
        exchanges: uniqueExchanges.map(ex => ({
          from: ex.fromGenId.substring(0, 8),
          to: ex.toGenId.substring(0, 8)
        }))
      });

      // Perform all exchanges
      for (const exchange of uniqueExchanges) {
        await exchangePositions(exchange.fromGenId, exchange.toGenId);
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
