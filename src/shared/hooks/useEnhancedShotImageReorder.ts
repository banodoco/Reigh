import { useCallback } from 'react';
import { useEnhancedShotPositions } from './useEnhancedShotPositions';
import { toast } from 'sonner';
import { 
  analyzeReorderChanges, 
  validateReorderOperation, 
  type ReorderItem 
} from '../utils/reorderUtils';

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
  
  const {
    shotGenerations,
    getImagesForMode,
    exchangePositions,
    exchangePositionsNoReload,
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
      
      // Convert to ReorderItem format for utility functions
      const reorderItems: ReorderItem[] = currentImages.map(img => ({
        shotImageEntryId: img.shotImageEntryId,
        generationId: img.id,
        timeline_frame: img.timeline_frame
      }));
      
      // Validate the reorder operation
      const validation = validateReorderOperation(reorderItems, orderedShotImageEntryIds);
      if (!validation.isValid) {
        console.error('[BatchModeReorderFlow] [VALIDATION_FAILED] ❌ Invalid reorder operation:', validation.errors);
        throw new Error(`Invalid reorder operation: ${validation.errors.join(', ')}`);
      }
      
      // Analyze the reorder using extracted utilities
      const analysis = analyzeReorderChanges(reorderItems, orderedShotImageEntryIds, shotGenerations);
      
      // 🔍 DIAGNOSTIC: Log the analysis results
      console.log('[BatchModeReorderFlow] [DATA_STRUCTURE] 📊 Current data structure analysis:', {
        currentImages: reorderItems.map((item, index) => ({
          index,
          shotImageEntryId: item.shotImageEntryId?.substring(0, 8),
          generationId: item.generationId?.substring(0, 8),
          timeline_frame: item.timeline_frame
        })),
        shotGenerations: shotGenerations.map(sg => ({
          shotGenId: sg.id.substring(0, 8),
          generationId: sg.generation_id.substring(0, 8),
          timeline_frame: sg.timeline_frame
        })),
        orderedShotImageEntryIds: orderedShotImageEntryIds.map(id => id.substring(0, 8)),
        timestamp: Date.now()
      });
      
      // Log duplicate detection results
      if (analysis.duplicateGenerationIds.length > 0) {
        console.warn('[BatchModeReorderFlow] [DUPLICATE_DETECTION] ⚠️ Found duplicate generation_ids:', {
          duplicates: analysis.duplicateGenerationIds.map(dup => ({ 
            generationId: dup.generationId.substring(0, 8), 
            count: dup.count 
          })),
          totalDuplicates: analysis.duplicateGenerationIds.length
        });
      }

      console.log('[BatchModeReorderFlow] [CHANGES_DETECTED] 📋 Timeline-frame-based changes detected:', {
        changesCount: analysis.changes.length,
        changes: analysis.changes.map(c => ({
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

      if (analysis.changes.length === 0) {
        console.log('[useEnhancedShotImageReorder] No changes detected');
        return;
      }

      // Log the swap sequence analysis
      console.log('[BatchModeReorderFlow] [SEQUENTIAL_SWAPS] 🔄 Building sequential swap sequence...');
      console.log('[BatchModeReorderFlow] [ORDER_COMPARISON] 📋 Comparing orders:', {
        currentOrder: reorderItems.map(item => item.shotImageEntryId.substring(0, 8)),
        desiredOrder: orderedShotImageEntryIds.map(id => id.substring(0, 8)),
        timestamp: Date.now()
      });
      
      console.log('[BatchModeReorderFlow] [SWAP_SEQUENCE] 📝 Generated swap sequence:', {
        totalSwaps: analysis.swapSequence.length,
        swaps: analysis.swapSequence.map((swap, i) => ({
          step: i + 1,
          itemA: swap.shotGenIdA.substring(0, 8),
          itemB: swap.shotGenIdB.substring(0, 8),
          reason: swap.reason
        })),
        finalOrder: analysis.finalOrder.map(id => id.substring(0, 8)),
        timestamp: Date.now()
      });
      
      // Execute the swap sequence
      if (analysis.swapSequence.length > 0) {
        console.log('[BatchModeReorderFlow] [EXECUTING_SWAPS] 🚀 Executing sequential swaps...');
        
        for (let i = 0; i < analysis.swapSequence.length; i++) {
          const swap = analysis.swapSequence[i];
          console.log('[BatchModeReorderFlow] [SWAP_STEP] 🔀 Step', i + 1, 'of', analysis.swapSequence.length, ':', {
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
