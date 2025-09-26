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
            
            console.log('[BatchModeReorderFlow] [SWAP_DETECTION] 🔄 Attempting to find shot_generations for swap:', {
              changeA: {
                generationId: change.generationId.substring(0, 8),
                shotImageEntryId: change.shotImageEntryId.substring(0, 8),
                foundShotGen: shotGenA?.id?.substring(0, 8) || 'NOT_FOUND'
              },
              changeB: {
                generationId: reciprocalChange.generationId.substring(0, 8),
                shotImageEntryId: reciprocalChange.shotImageEntryId.substring(0, 8),
                foundShotGen: shotGenB?.id?.substring(0, 8) || 'NOT_FOUND'
              }
            });
            
            if (shotGenA && shotGenB) {
              exchanges.push({
                shotGenerationIdA: shotGenA.id,
                shotGenerationIdB: shotGenB.id
              });
              processedPairs.add(pairKey);
              
              console.log('[BatchModeReorderFlow] [DIRECT_SWAP] ✅ Direct timeline_frame swap detected:', {
                itemA: change.generationId.substring(0, 8),
                itemB: reciprocalChange.generationId.substring(0, 8),
                shotGenA: shotGenA.id.substring(0, 8),
                shotGenB: shotGenB.id.substring(0, 8),
                swapFrames: `${change.currentTimelineFrame} ↔ ${change.targetTimelineFrame}`
              });
            } else {
              console.warn('[BatchModeReorderFlow] [SWAP_FAILED] ❌ Could not find shot_generations for swap:', {
                missingA: !shotGenA,
                missingB: !shotGenB,
                changeA: change.generationId.substring(0, 8),
                changeB: reciprocalChange.generationId.substring(0, 8)
              });
            }
          }
        } else {
          console.log('[BatchModeReorderFlow] [NO_RECIPROCAL] ℹ️ No reciprocal change found for:', {
            generationId: change.generationId.substring(0, 8),
            shotImageEntryId: change.shotImageEntryId.substring(0, 8),
            oldPos: change.oldPos,
            newPos: change.newPos,
            currentFrame: change.currentTimelineFrame,
            targetFrame: change.targetTimelineFrame
          });
        }
      }

      // Perform all exchanges in a batch
      if (exchanges.length > 0) {
        console.log('[BatchModeReorderFlow] [EXCHANGES_DETECTED] 🔄 Executing timeline-frame swaps:', {
          exchangeCount: exchanges.length,
          exchanges: exchanges.map(ex => ({
            shotGenA: ex.shotGenerationIdA.substring(0, 8),
            shotGenB: ex.shotGenerationIdB.substring(0, 8)
          })),
          timestamp: Date.now()
        });

        console.log('[BatchModeReorderFlow] [CALLING_DB] 📞 Calling batchExchangePositions...');
        await batchExchangePositions(exchanges);
        console.log('[BatchModeReorderFlow] [DB_COMPLETE] ✅ batchExchangePositions completed');
      } else {
        console.warn('[BatchModeReorderFlow] [COMPLEX_REORDER] ⚠️ No direct swaps detected - attempting sequential timeline frame updates...');
        
        // Handle complex reordering by updating timeline_frames sequentially
        // This handles cases where items need to move in a chain (A→B→C→D) rather than direct swaps (A↔B)
        if (changes.length > 0) {
          console.log('[BatchModeReorderFlow] [SEQUENTIAL_UPDATE] 🔄 Performing sequential timeline frame updates:', {
            changesCount: changes.length,
            changes: changes.map(c => ({
              shotImageEntryId: c.shotImageEntryId.substring(0, 8),
              generationId: c.generationId.substring(0, 8),
              frameChange: `${c.currentTimelineFrame} → ${c.targetTimelineFrame}`
            }))
          });
          
          // Use updateTimelineFrame for each change instead of exchanges
          for (const change of changes) {
            const shotGeneration = shotGenerations.find(sg => sg.generation_id === change.generationId);
            if (shotGeneration) {
              console.log('[BatchModeReorderFlow] [SEQUENTIAL_ITEM] 🎯 Updating timeline frame:', {
                shotGenerationId: shotGeneration.id.substring(0, 8),
                generationId: change.generationId.substring(0, 8),
                frameChange: `${change.currentTimelineFrame} → ${change.targetTimelineFrame}`
              });
              
              await updateTimelineFrame(shotGeneration.id, change.targetTimelineFrame, {
                user_positioned: true,
                drag_source: 'batch_reorder_sequential',
                drag_session_id: 'batch_sequential_' + Date.now()
              });
            }
          }
          
          console.log('[BatchModeReorderFlow] [SEQUENTIAL_COMPLETE] ✅ Sequential updates completed, reloading positions...');
          await loadPositions({ reason: 'reorder' });
        }
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
