import { useCallback } from 'react';
import { useEnhancedShotPositions } from './useEnhancedShotPositions';
import { useBatchReorder } from './useBatchReorder';
import { toast } from 'sonner';
import { analyzeReorderOperation, validateReorderAnalysis } from '@/shared/utils/reorderUtils';

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
    exchangePositionsNoReload: (shotGenIdA: string, shotGenIdB: string) => Promise<void>;
    batchExchangePositions: (exchanges: Array<{ generationIdA: string; generationIdB: string }>) => Promise<void>;
    deleteItem: (genId: string) => Promise<void>;
    loadPositions: () => Promise<void>;
    isLoading: boolean;
  }
) => {
  // Use parent hook functions if provided, otherwise create own instance
  const ownHook = useEnhancedShotPositions(parentHook ? null : shotId);
  const ownBatchReorder = useBatchReorder({ 
    shotId: parentHook ? null : shotId,
    onReload: parentHook ? undefined : (reason) => ownHook.loadPositions({ reason: 'reorder' })
  });
  
  const {
    shotGenerations,
    getImagesForMode,
    exchangePositions,
    deleteItem,
    loadPositions,
    isLoading
  } = parentHook || ownHook;
  
  const {
    batchExchangePositions,
    exchangePositionsNoReload
  } = parentHook ? {
    batchExchangePositions: parentHook.batchExchangePositions,
    exchangePositionsNoReload: parentHook.exchangePositionsNoReload
  } : ownBatchReorder;

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
      
      // Safety check: If orderedIds has more items than currentImages, data is out of sync
      // This can happen when an image was just added but positions haven't reloaded yet
      if (orderedShotImageEntryIds.length !== currentImages.length) {
        console.warn('[useEnhancedShotImageReorder] Data sync issue - array length mismatch:', {
          orderedIdsLength: orderedShotImageEntryIds.length,
          currentImagesLength: currentImages.length,
          orderedIds: orderedShotImageEntryIds.map(id => id.substring(0, 8)),
          currentIds: currentOrder.map(id => id.substring(0, 8))
        });
        
        // Check if any IDs in orderedIds are missing from currentImages
        const missingIds = orderedShotImageEntryIds.filter(id => !currentOrder.includes(id));
        if (missingIds.length > 0) {
          console.warn('[useEnhancedShotImageReorder] Missing IDs detected - aborting reorder:', {
            missingIds: missingIds.map(id => id.substring(0, 8)),
            note: 'This can happen when reordering immediately after adding an image. Try again in a moment.'
          });
          toast.error('Please wait a moment and try again');
          return;
        }
      }
      
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
          
          // Safety check: Ensure both images exist AND have id field (handles race conditions from just-added images)
          if (!currentImg || !targetImg || !currentImg.id || !targetImg.id) {
            console.warn('[useEnhancedShotImageReorder] Skipping change - missing image data or id:', {
              shotImageEntryId: shotImageEntryId.substring(0, 8),
              oldPos,
              newPos,
              hasCurrentImg: !!currentImg,
              hasTargetImg: !!targetImg,
              currentImgHasId: currentImg ? !!currentImg.id : false,
              targetImgHasId: targetImg ? !!targetImg.id : false,
              currentImagesLength: currentImages.length,
              orderedIdsLength: orderedShotImageEntryIds.length,
              currentImgData: currentImg ? {
                shotImageEntryId: currentImg.shotImageEntryId?.substring(0, 8),
                id: currentImg.id?.substring(0, 8) || 'MISSING',
                timeline_frame: currentImg.timeline_frame
              } : 'null',
              targetImgData: targetImg ? {
                shotImageEntryId: targetImg.shotImageEntryId?.substring(0, 8),
                id: targetImg.id?.substring(0, 8) || 'MISSING',
                timeline_frame: targetImg.timeline_frame
              } : 'null'
            });
            continue;
          }
          
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
      
      // Use pure utility function to analyze the reorder operation
      let reorderAnalysis;
      try {
        reorderAnalysis = analyzeReorderOperation(currentOrderIds, desiredOrderIds);
        validateReorderAnalysis(reorderAnalysis, desiredOrderIds);
      } catch (error) {
        console.error('[BatchModeReorderFlow] [ANALYSIS_ERROR] ❌ Failed to analyze reorder operation:', error);
        throw error;
      }
      
      const { swapSequence, finalOrder, noChangesNeeded } = reorderAnalysis;
      
      console.log('[BatchModeReorderFlow] [SWAP_SEQUENCE] 📝 Generated swap sequence:', {
        totalSwaps: swapSequence.length,
        noChangesNeeded,
        swaps: swapSequence.map((swap, i) => ({
          step: i + 1,
          itemA: swap.shotGenIdA.substring(0, 8),
          itemB: swap.shotGenIdB.substring(0, 8),
          reason: swap.reason
        })),
        finalOrder: finalOrder.map(id => id.substring(0, 8)),
        timestamp: Date.now()
      });
      
      // Execute the swap sequence
      if (!noChangesNeeded && swapSequence.length > 0) {
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
