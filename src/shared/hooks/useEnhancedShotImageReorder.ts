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

    console.log('[BatchModeReorderFlow] [HANDLE_REORDER] 🎯 useEnhancedShotImageReorder.handleReorder called:', {
      shotId: shotId.substring(0, 8),
      orderedShotImageEntryIds: orderedShotImageEntryIds.map(id => id.substring(0, 8)),
      totalItems: orderedShotImageEntryIds.length,
      timestamp: Date.now()
    });

    console.log('[useEnhancedShotImageReorder] Handling timeline-frame-based reorder:', {
      shotId,
      orderedIds: orderedShotImageEntryIds.map(id => id.substring(0, 8))
    });

    try {
      // Get current images and their timeline_frame values
      const currentImages = getImagesForMode('batch');
      const currentOrder = currentImages.map(img => img.shotImageEntryId || img.id);
      
      // 🔍 DIAGNOSTIC: Log the full data structure to understand duplicates
      console.log('[BatchModeReorderFlow] [DATA_STRUCTURE] 📊 Current data structure analysis:', {
        currentImages: currentImages.map((img, index) => ({
          index,
          shotImageEntryId: img.shotImageEntryId?.substring(0, 8),
          generationId: img.id?.substring(0, 8),
          timeline_frame: img.timeline_frame
        })),
        shotGenerations: shotGenerations.map(sg => ({
          shotGenId: sg.id.substring(0, 8),
          generationId: sg.generation_id.substring(0, 8),
          timeline_frame: sg.timeline_frame
        })),
        orderedShotImageEntryIds: orderedShotImageEntryIds.map(id => id.substring(0, 8)),
        timestamp: Date.now()
      });
      
      // 🔍 DIAGNOSTIC: Check for duplicate generation_ids
      const generationIdCounts = new Map<string, number>();
      currentImages.forEach(img => {
        const count = generationIdCounts.get(img.id) || 0;
        generationIdCounts.set(img.id, count + 1);
      });
      
      const duplicateGenerationIds = Array.from(generationIdCounts.entries()).filter(([_, count]) => count > 1);
      if (duplicateGenerationIds.length > 0) {
        console.warn('[BatchModeReorderFlow] [DUPLICATE_DETECTION] ⚠️ Found duplicate generation_ids:', {
          duplicates: duplicateGenerationIds.map(([genId, count]) => ({ 
            generationId: genId.substring(0, 8), 
            count 
          })),
          totalDuplicates: duplicateGenerationIds.length
        });
      }
      
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

      console.log('[BatchModeReorderFlow] [CHANGES_DETECTED] 📋 Timeline-frame-based changes detected:', {
        changesCount: changes.length,
        changes: changes.map(c => ({
          shotImageEntryId: c.shotImageEntryId.substring(0, 8),
          generationId: c.generationId.substring(0, 8),
          oldPos: c.oldPos,
          newPos: c.newPos,
          currentFrame: c.currentTimelineFrame,
          targetFrame: c.targetTimelineFrame,
          frameSwap: `${c.currentTimelineFrame} → ${c.targetTimelineFrame}`
        })),
        timestamp: Date.now()
      });

      if (changes.length === 0) {
        console.log('[useEnhancedShotImageReorder] No changes detected');
        return;
      }

      // Build sequential swaps to transform current order into desired order
      // This handles any permutation (simple swaps, complex chains, duplicate generation_ids)
      console.log('[BatchModeReorderFlow] [SEQUENTIAL_SWAPS] 🔄 Building sequential swap sequence...');
      
      // Create working arrays with shot_generation IDs (the unique identifiers we need for swaps)
      const currentOrderIds = currentImages.map(img => img.shotImageEntryId);
      const desiredOrderIds = [...orderedShotImageEntryIds]; // Copy to avoid mutation
      
      console.log('[BatchModeReorderFlow] [ORDER_COMPARISON] 📋 Comparing orders:', {
        currentOrder: currentOrderIds.map(id => id.substring(0, 8)),
        desiredOrder: desiredOrderIds.map(id => id.substring(0, 8)),
        timestamp: Date.now()
      });
      
      // Build sequence of swaps needed to transform current → desired
      const swapSequence: Array<{ shotGenIdA: string; shotGenIdB: string; reason: string }> = [];
      const workingOrder = [...currentOrderIds]; // Working copy we'll mutate
      
      // For each position, ensure the correct item is there
      for (let targetPos = 0; targetPos < desiredOrderIds.length; targetPos++) {
        const desiredItemId = desiredOrderIds[targetPos];
        const currentItemId = workingOrder[targetPos];
        
        if (currentItemId !== desiredItemId) {
          // Find where the desired item currently is
          const currentPos = workingOrder.findIndex(id => id === desiredItemId);
          
          if (currentPos === -1) {
            console.error('[BatchModeReorderFlow] [MISSING_ITEM] ❌ Desired item not found in current order:', {
              desiredItemId: desiredItemId.substring(0, 8),
              targetPos,
              workingOrder: workingOrder.map(id => id.substring(0, 8))
            });
            continue;
          }
          
          // Bubble the desired item toward its target position via sequential swaps
          for (let swapPos = currentPos; swapPos > targetPos; swapPos--) {
            const itemA = workingOrder[swapPos];
            const itemB = workingOrder[swapPos - 1];
            
            swapSequence.push({
              shotGenIdA: itemA,
              shotGenIdB: itemB,
              reason: `Moving ${itemA.substring(0, 8)} from pos ${swapPos} to ${swapPos - 1} (target: ${targetPos})`
            });
            
            // Apply swap to working order
            workingOrder[swapPos] = itemB;
            workingOrder[swapPos - 1] = itemA;
          }
        }
      }
      
      console.log('[BatchModeReorderFlow] [SWAP_SEQUENCE] 📝 Generated swap sequence:', {
        totalSwaps: swapSequence.length,
        swaps: swapSequence.map((swap, i) => ({
          step: i + 1,
          itemA: swap.shotGenIdA.substring(0, 8),
          itemB: swap.shotGenIdB.substring(0, 8),
          reason: swap.reason
        })),
        finalOrder: workingOrder.map(id => id.substring(0, 8)),
        timestamp: Date.now()
      });
      
      // Execute the swap sequence
      if (swapSequence.length > 0) {
        console.log('[BatchModeReorderFlow] [EXECUTING_SWAPS] 🚀 Executing sequential swaps...');
        
        for (let i = 0; i < swapSequence.length; i++) {
          const swap = swapSequence[i];
          console.log('[BatchModeReorderFlow] [SWAP_STEP] 🔀 Step', i + 1, 'of', swapSequence.length, ':', {
            itemA: swap.shotGenIdA.substring(0, 8),
            itemB: swap.shotGenIdB.substring(0, 8),
            reason: swap.reason
          });
          
          await exchangePositionsNoReload(swap.shotGenIdA, swap.shotGenIdB);
        }
        
        console.log('[BatchModeReorderFlow] [SWAPS_COMPLETE] ✅ All swaps completed, reloading positions...');
        await loadPositions({ reason: 'reorder' });
      } else {
        console.log('[BatchModeReorderFlow] [NO_SWAPS_NEEDED] ℹ️ No swaps needed - order already correct');
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
