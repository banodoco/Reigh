/**
 * Pure utility functions for handling complex reordering operations
 * These functions contain no side effects and can be easily tested
 */

export interface SwapStep {
  shotGenIdA: string;
  shotGenIdB: string;
  reason: string;
}

export interface ReorderAnalysis {
  swapSequence: SwapStep[];
  finalOrder: string[];
  noChangesNeeded: boolean;
}

/**
 * Analyzes a reorder operation and generates the sequence of swaps needed
 * to transform the current order into the desired order.
 * 
 * Uses a bubble-sort approach: for each target position, bubbles the correct 
 * item there via sequential swaps. This handles any permutation including
 * simple A↔B swaps, complex chain moves, and scenarios with duplicate generation_ids.
 * 
 * @param currentOrder Array of current shot_generation IDs in their current order
 * @param desiredOrder Array of shot_generation IDs in the desired order
 * @returns Analysis object with swap sequence and metadata
 */
export function analyzeReorderOperation(
  currentOrder: string[],
  desiredOrder: string[]
): ReorderAnalysis {
  // Validate inputs
  if (currentOrder.length !== desiredOrder.length) {
    throw new Error('Current and desired order arrays must have the same length');
  }
  
  if (currentOrder.length === 0) {
    return {
      swapSequence: [],
      finalOrder: [],
      noChangesNeeded: true
    };
  }
  
  // Check if reordering is actually needed
  const ordersMatch = currentOrder.every((id, index) => id === desiredOrder[index]);
  if (ordersMatch) {
    return {
      swapSequence: [],
      finalOrder: [...currentOrder],
      noChangesNeeded: true
    };
  }
  
  // Create working copy for simulation
  const workingOrder = [...currentOrder];
  const swapSequence: SwapStep[] = [];
  
  // For each position, ensure the correct item is there
  for (let targetPos = 0; targetPos < desiredOrder.length; targetPos++) {
    const desiredItemId = desiredOrder[targetPos];
    const currentItemId = workingOrder[targetPos];
    
    if (currentItemId !== desiredItemId) {
      // Find where the desired item currently is
      const currentPos = workingOrder.findIndex(id => id === desiredItemId);
      
      if (currentPos === -1) {
        throw new Error(`Desired item ${desiredItemId} not found in current order`);
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
  
  return {
    swapSequence,
    finalOrder: workingOrder,
    noChangesNeeded: false
  };
}

/**
 * Validates that a reorder analysis is consistent
 * @param analysis The analysis to validate
 * @param desiredOrder The expected final order
 * @returns true if valid, throws error if invalid
 */
export function validateReorderAnalysis(
  analysis: ReorderAnalysis,
  desiredOrder: string[]
): boolean {
  if (analysis.noChangesNeeded) {
    return true;
  }
  
  // Check that final order matches desired order
  if (analysis.finalOrder.length !== desiredOrder.length) {
    throw new Error('Final order length does not match desired order length');
  }
  
  for (let i = 0; i < desiredOrder.length; i++) {
    if (analysis.finalOrder[i] !== desiredOrder[i]) {
      throw new Error(`Final order mismatch at position ${i}: expected ${desiredOrder[i]}, got ${analysis.finalOrder[i]}`);
    }
  }
  
  return true;
}
