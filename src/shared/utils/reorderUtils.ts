/**
 * Pure utility functions for handling image reordering logic
 * Extracted from useEnhancedShotImageReorder for better testability and reuse
 */

export interface ReorderItem {
  shotImageEntryId: string;
  generationId: string;
  timeline_frame?: number;
}

export interface ReorderChange {
  oldPos: number;
  newPos: number;
  shotImageEntryId: string;
  generationId: string;
  currentTimelineFrame: number;
  targetTimelineFrame: number;
}

export interface SwapStep {
  shotGenIdA: string;
  shotGenIdB: string;
  reason: string;
}

export interface ReorderAnalysis {
  changes: ReorderChange[];
  swapSequence: SwapStep[];
  duplicateGenerationIds: Array<{ generationId: string; count: number }>;
  finalOrder: string[];
}

/**
 * Analyzes the difference between current and desired order
 */
export function analyzeReorderChanges(
  currentImages: ReorderItem[],
  orderedShotImageEntryIds: string[],
  shotGenerations: Array<{ id: string; generation_id: string; timeline_frame?: number }>
): ReorderAnalysis {
  const currentOrder = currentImages.map(img => img.shotImageEntryId);
  
  // Check for duplicate generation_ids
  const generationIdCounts = new Map<string, number>();
  currentImages.forEach(img => {
    const count = generationIdCounts.get(img.generationId) || 0;
    generationIdCounts.set(img.generationId, count + 1);
  });
  
  const duplicateGenerationIds = Array.from(generationIdCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([generationId, count]) => ({ generationId, count }));

  // Find what actually changed between current and desired order
  const changes: ReorderChange[] = [];

  for (let newPos = 0; newPos < orderedShotImageEntryIds.length; newPos++) {
    const shotImageEntryId = orderedShotImageEntryIds[newPos];
    const oldPos = currentOrder.indexOf(shotImageEntryId);
    
    if (oldPos !== -1 && oldPos !== newPos) {
      const currentImg = currentImages[oldPos];
      const targetImg = currentImages[newPos];
      
      const currentShotGen = shotGenerations.find(sg => sg.generation_id === currentImg.generationId);
      const targetShotGen = shotGenerations.find(sg => sg.generation_id === targetImg.generationId);
      
      if (currentShotGen && targetShotGen) {
        changes.push({
          oldPos,
          newPos,
          shotImageEntryId,
          generationId: currentImg.generationId,
          currentTimelineFrame: currentShotGen.timeline_frame || 0,
          targetTimelineFrame: targetShotGen.timeline_frame || 0
        });
      }
    }
  }

  // Build sequential swaps using bubble-sort approach
  const swapSequence = buildSwapSequence(currentOrder, orderedShotImageEntryIds);

  return {
    changes,
    swapSequence,
    duplicateGenerationIds,
    finalOrder: [...orderedShotImageEntryIds]
  };
}

/**
 * Builds a sequence of swaps to transform current order into desired order
 * Uses bubble-sort approach for reliability
 */
export function buildSwapSequence(
  currentOrderIds: string[],
  desiredOrderIds: string[]
): SwapStep[] {
  const swapSequence: SwapStep[] = [];
  const workingOrder = [...currentOrderIds];
  
  // For each position, ensure the correct item is there
  for (let targetPos = 0; targetPos < desiredOrderIds.length; targetPos++) {
    const desiredItemId = desiredOrderIds[targetPos];
    const currentItemId = workingOrder[targetPos];
    
    if (currentItemId !== desiredItemId) {
      // Find where the desired item currently is
      const currentPos = workingOrder.findIndex(id => id === desiredItemId);
      
      if (currentPos === -1) {
        console.warn('[ReorderUtils] Desired item not found in current order:', {
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
  
  return swapSequence;
}

/**
 * Validates that a reorder operation is safe to perform
 */
export function validateReorderOperation(
  currentImages: ReorderItem[],
  orderedShotImageEntryIds: string[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check lengths match
  if (currentImages.length !== orderedShotImageEntryIds.length) {
    errors.push(`Length mismatch: current=${currentImages.length}, desired=${orderedShotImageEntryIds.length}`);
  }
  
  // Check all IDs are present
  const currentIds = new Set(currentImages.map(img => img.shotImageEntryId));
  const desiredIds = new Set(orderedShotImageEntryIds);
  
  for (const id of desiredIds) {
    if (!currentIds.has(id)) {
      errors.push(`Missing ID in current order: ${id.substring(0, 8)}`);
    }
  }
  
  for (const id of currentIds) {
    if (!desiredIds.has(id)) {
      errors.push(`Extra ID in current order: ${id.substring(0, 8)}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
