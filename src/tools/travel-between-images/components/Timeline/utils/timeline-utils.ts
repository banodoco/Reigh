import { log } from "@/shared/lib/logger";
import { quantizeGap, isValidFrameCount } from "./time-utils";

// Calculate max gap based on context frames
// Formula: max_segments = baseMax - (context_frames * 2)
// baseMax is 77 when smooth continuations is enabled, 81 otherwise
export const calculateMaxGap = (contextFrames: number = 0, baseMax: number = 81): number => {
  return Math.max(1, baseMax - (contextFrames * 2));
};

// Minimum gap between frames (4N+1 format, starting at 5)
const MIN_GAP = 5;

// Validate gap constraints (max gap and 4N+1 format)
export const validateGaps = (
  testPositions: Map<string, number>, 
  excludeId?: string,
  checkQuantization: boolean = false // Set to true to also validate 4N+1 format
): boolean => {
  const positions = [...testPositions.entries()]
    .filter(([id]) => id !== excludeId)
    .map(([_, pos]) => pos);
  positions.push(0); // Always include frame 0
  positions.sort((a, b) => a - b);

  const maxGap = calculateMaxGap();

  // Debug: log every validation attempt
  log('TimelineFrameLimitIssue', 'validateGaps check', { excludeId, maxGap, positions, checkQuantization });

  for (let i = 1; i < positions.length; i++) {
    const diff = positions[i] - positions[i - 1];
    
    // All gaps constrained to 81 frames
    const effectiveMaxGap = maxGap;
    
    if (diff > effectiveMaxGap) {
      log('TimelineFrameLimitIssue', 'Gap violation detected', {
        index: i,
        prevFrame: positions[i - 1],
        nextFrame: positions[i],
        diff,
        maxGap: effectiveMaxGap,
      });
      return false;
    }
    
    // Optionally validate 4N+1 format for Wan model compatibility
    if (checkQuantization && diff > 0 && !isValidFrameCount(diff)) {
      log('TimelineFrameLimitIssue', 'Gap not in 4N+1 format', {
        index: i,
        prevFrame: positions[i - 1],
        nextFrame: positions[i],
        diff,
        expectedFormat: '4N+1 (1, 5, 9, 13, 17, 21, ...)',
      });
      return false;
    }
  }
  return true;
};

// ---------------------------------------------------------------------------
// Utility: shrink oversized gaps by left-shifting subsequent frames so that
// every gap ≤ maxGap.  Returns a **new** Map (does not mutate input).
// NOTE: All gaps are constrained to 81 frames AND quantized to 4N+1 format.
// ---------------------------------------------------------------------------
export const shrinkOversizedGaps = (
  positions: Map<string, number>,
  excludeId?: string,
): Map<string, number> => {
  const maxGap = calculateMaxGap();

  // Create sortable copy excluding optional id
  const entries = [...positions.entries()].filter(([id]) => id !== excludeId);
  // Always include frame 0 in the list
  if (!entries.some(([_, pos]) => pos === 0)) {
    // Find an id that currently sits at 0 (if any)
    const zeroId = [...positions.entries()].find(([_, pos]) => pos === 0)?.[0];
    if (zeroId) entries.push([zeroId, 0]);
  }

  entries.sort((a, b) => a[1] - b[1]);

  let prev = 0;
  const result = new Map<string, number>();

  for (let i = 0; i < entries.length; i++) {
    const [id, originalPos] = entries[i];
    
    // Special case: preserve frame 0 exactly
    if (originalPos === 0) {
      result.set(id, 0);
      prev = 0;
    } else {
      // Calculate the desired gap and quantize it to 4N+1 format
      const desiredGap = Math.max(originalPos - prev, MIN_GAP);
      const quantizedDesiredGap = quantizeGap(desiredGap, MIN_GAP);
      
      // Constrain gap to max and quantize the result
      const constrainedGap = Math.min(quantizedDesiredGap, maxGap);
      const quantizedGapValue = quantizeGap(constrainedGap, MIN_GAP);
      
      const allowedPos = prev + quantizedGapValue;
      
      result.set(id, allowedPos);
      prev = allowedPos;
    }
  }

  // Re-add the excluded id unchanged (caller may overwrite afterwards)
  if (excludeId && positions.has(excludeId)) {
    result.set(excludeId, positions.get(excludeId)!);
  }

  return result;
};

// ---------------------------------------------------------------------------
// Utility: Quantize all positions in a map to ensure 4N+1 gaps between items.
// Maintains the relative order of items while adjusting positions.
// Returns a **new** Map (does not mutate input).
// ---------------------------------------------------------------------------
export const quantizePositions = (
  positions: Map<string, number>,
  minGap: number = MIN_GAP
): Map<string, number> => {
  const entries = [...positions.entries()].sort((a, b) => a[1] - b[1]);
  
  if (entries.length === 0) return new Map();
  
  const result = new Map<string, number>();
  
  // First item stays at its position (quantized to be a valid start)
  const [firstId, firstPos] = entries[0];
  // First position should be at 0 or a 4N+1 value from 0
  const quantizedFirstPos = firstPos === 0 ? 0 : quantizeGap(firstPos, minGap);
  result.set(firstId, quantizedFirstPos);
  
  let prev = quantizedFirstPos;
  
  // Process remaining items
  for (let i = 1; i < entries.length; i++) {
    const [id, originalPos] = entries[i];
    const currentGap = originalPos - entries[i - 1][1];
    
    // Quantize the gap to 4N+1 format
    const quantizedCurrentGap = quantizeGap(currentGap, minGap);
    
    const newPos = prev + quantizedCurrentGap;
    result.set(id, newPos);
    prev = newPos;
  }
  
  console.log('[QuantizePositions] 📐 Positions quantized to 4N+1 gaps:', {
    original: [...positions.entries()].map(([id, pos]) => ({ id: id.substring(0, 8), pos })),
    quantized: [...result.entries()].map(([id, pos]) => ({ id: id.substring(0, 8), pos })),
    gaps: entries.slice(1).map((_, i) => result.get(entries[i + 1][0])! - result.get(entries[i][0])!)
  });
  
  return result;
};

// ---------------------------------------------------------------------------
// Utility: Apply fluid timeline behavior - when dragging creates oversized gaps,
// shift all subsequent items along with the dragged item until it would cross
// another item, then apply gap constraints with the new adjacent item.
// ---------------------------------------------------------------------------
// Helper: find the next item in the direction of drag
const findNextItemInDirection = (
  draggedId: string,
  draggedNewPos: number,
  originalPositions: Map<string, number>,
  dragDirection: number
): { id: string; pos: number } | null => {
  const sorted = [...originalPositions.entries()]
    .filter(([id]) => id !== draggedId)
    .sort((a, b) => a[1] - b[1]);

  if (dragDirection > 0) {
    // Dragging right - find next item to the right
    const found = sorted.find(([id, pos]) => pos > draggedNewPos);
    return found ? { id: found[0], pos: found[1] } : null;
  } else {
    // Dragging left - find next item to the left
    const found = [...sorted].reverse().find(([id, pos]) => pos < draggedNewPos);
    return found ? { id: found[0], pos: found[1] } : null;
  }
};

// Helper: check if dragging would cross another item
const wouldCrossItem = (
  draggedId: string,
  draggedNewPos: number,
  originalPositions: Map<string, number>,
  dragDirection: number
): boolean => {
  const nextItem = findNextItemInDirection(draggedId, draggedNewPos, originalPositions, dragDirection);
  if (!nextItem) return false;

  const originalPos = originalPositions.get(draggedId) ?? 0;
  const nextPos = nextItem.pos;

  if (dragDirection > 0) {
    return draggedNewPos >= nextPos;
  } else {
    return draggedNewPos <= nextPos;
  }
};

export const applyFluidTimeline = (
  positions: Map<string, number>,
  draggedId: string,
  targetFrame: number,
  excludeId?: string,
  fullMin: number = 0,
  fullMax: number = Number.MAX_SAFE_INTEGER
): Map<string, number> => {
  const maxGap = calculateMaxGap();
  const originalPos = positions.get(draggedId) ?? 0;
  const movementAmount = targetFrame - originalPos;

  // Limit the movement amount to make it feel more natural
  const maxSingleMove = 50; // Maximum frames an item can move in one drag operation
  const limitedMovementAmount = Math.max(-maxSingleMove, Math.min(maxSingleMove, movementAmount));

  console.log('[FluidTimelineCore] 🎯 APPLY FLUID TIMELINE - Starting fluid timeline calculation:', {
    draggedId: draggedId.substring(0, 8),
    originalPos,
    targetFrame,
    movementAmount,
    limitedMovementAmount,
    maxGap,
    timestamp: new Date().toISOString()
  });

  // 🎯 DEBUG: Check for position conflicts (multiple items at same position)
  const positionConflicts = new Map<number, string[]>();
  for (const [id, pos] of positions) {
    if (!positionConflicts.has(pos)) {
      positionConflicts.set(pos, []);
    }
    positionConflicts.get(pos)!.push(id.substring(0, 8));
  }
  
  const conflicts = Array.from(positionConflicts.entries())
    .filter(([pos, ids]) => ids.length > 1);
  
  if (conflicts.length > 0) {
    console.log(`[TIMELINE_TRACK] [POSITION_CONFLICTS] ⚠️ Multiple items at same positions:`, 
      conflicts.map(([pos, ids]) => `${pos}: [${ids.join(', ')}]`).join(', '));
  }

  // Start with the proposed position (but use limited movement)
  const result = new Map(positions);
  const limitedTargetFrame = originalPos + limitedMovementAmount;
  result.set(draggedId, limitedTargetFrame);

  // Get all items sorted by ORIGINAL positions (before any movement)
  const originalSorted = [...positions.entries()]
    .filter(([id]) => id !== excludeId)
    .sort((a, b) => a[1] - b[1]);

  // Find the dragged item's position in the ORIGINAL sorted list
  const originalDraggedIndex = originalSorted.findIndex(([id, _]) => id === draggedId);
  if (originalDraggedIndex === -1) {
    console.log('[FluidTimelineCore] ⚠️ DRAGGED ITEM NOT FOUND - Falling back to shrinkOversizedGaps');
    return shrinkOversizedGaps(result, excludeId);
  }

  // Get adjacent items based on ORIGINAL positions, not the moved position
  const prevItem = originalDraggedIndex > 0 ? originalSorted[originalDraggedIndex - 1] : null;
  const nextItem = originalDraggedIndex < originalSorted.length - 1 ? originalSorted[originalDraggedIndex + 1] : null;

  let needsShift = false;
  let shiftAmount = 0;
  let violations = [];

  console.log('[FluidTimelineCore] 🔄 MOVEMENT ANALYSIS:', {
    originalPos,
    targetFrame,
    rawMovementAmount: movementAmount,
    limitedMovementAmount,
    maxSingleMove
  });

  if (limitedMovementAmount !== 0) {
    const limitedTargetFrame = originalPos + limitedMovementAmount;

    let wouldCreateViolation = false;

    // Use the original adjacent items for gap calculations
    // All gaps constrained to 81 frames
    if (prevItem) {
      const effectiveMaxGap = maxGap;
      if (limitedTargetFrame - prevItem[1] > effectiveMaxGap) {
        wouldCreateViolation = true;
      }
    }

    if (nextItem) {
      const effectiveMaxGap = maxGap;
      if (nextItem[1] - limitedTargetFrame > effectiveMaxGap) {
        wouldCreateViolation = true;
      }
    }

    if (wouldCreateViolation) {
      needsShift = true;
      shiftAmount = Math.abs(limitedMovementAmount);
      console.log(`[TIMELINE_TRACK] [GAP_VIOLATION] ⚠️ Gap violation detected - shifting required for item ${draggedId.substring(0, 8)}`);
    } else {
      // NO SHIFT NEEDED: If no gap violation, don't shift adjacent items
      needsShift = false;
      shiftAmount = 0;
      console.log(`[TIMELINE_TRACK] [NO_VIOLATION] ✅ No gap violation - no shifting needed for item ${draggedId.substring(0, 8)}`);
    }
  }

  // Also check for gap violations (traditional logic) with the actual target frame
  if (prevItem) {
    const effectiveMaxGap = maxGap;
    if (targetFrame - prevItem[1] > effectiveMaxGap) {
      violations.push({
        type: 'GAP_VIOLATION',
        withItem: prevItem[0].substring(0, 8),
        gap: targetFrame - prevItem[1],
        maxAllowed: effectiveMaxGap,
        requiredShift: targetFrame - prevItem[1] - effectiveMaxGap
      });
    }
  }

  if (nextItem) {
    const effectiveMaxGap = maxGap;
    if (nextItem[1] - targetFrame > effectiveMaxGap) {
      violations.push({
        type: 'GAP_VIOLATION',
        withItem: nextItem[0].substring(0, 8),
        gap: nextItem[1] - targetFrame,
        maxAllowed: effectiveMaxGap,
        requiredShift: nextItem[1] - targetFrame - effectiveMaxGap
      });
    }
  }

  // [BoundaryCollisionDebug] Check for boundary collisions
  const hitsLeftBoundary = targetFrame <= fullMin;
  const hitsRightBoundary = targetFrame >= fullMax;

  if (hitsLeftBoundary || hitsRightBoundary) {
    console.log('[BoundaryCollisionDebug] 🚨 BOUNDARY COLLISION DETECTED:', {
      draggedId: draggedId.substring(0, 8),
      targetFrame,
      fullMin,
      fullMax,
      hitsLeftBoundary,
      hitsRightBoundary,
      boundaryType: hitsLeftBoundary ? 'LEFT_EDGE' : 'RIGHT_EDGE',
      boundaryContext: {
        distanceFromLeftBoundary: targetFrame - fullMin,
        distanceFromRightBoundary: fullMax - targetFrame,
        movementDirection: movementAmount > 0 ? 'RIGHT' : 'LEFT'
      },
      timestamp: new Date().toISOString()
    });

    // When hitting a boundary, we need to shift adjacent items to make room
    if (hitsLeftBoundary) {
      // When hitting left boundary while moving left, shift items to the RIGHT
      const itemsToShiftRight = originalSorted.slice(originalDraggedIndex + 1); // Items after dragged item
      if (itemsToShiftRight.length > 0) {
        violations.push({
          type: 'BOUNDARY_COLLISION',
          withItem: 'LEFT_EDGE',
          gap: Math.abs(targetFrame - fullMin),
          maxAllowed: 0, // At boundary, no gap allowed
          requiredShift: Math.abs(targetFrame - fullMin),
          direction: 'SHIFT_RIGHT'
        });
      }
    } else if (hitsRightBoundary) {
      // When hitting right boundary while moving right, shift items to the LEFT
      const itemsToShiftLeft = originalSorted.slice(0, originalDraggedIndex).reverse(); // Items before dragged item
      if (itemsToShiftLeft.length > 0) {
        violations.push({
          type: 'BOUNDARY_COLLISION',
          withItem: 'RIGHT_EDGE',
          gap: Math.abs(targetFrame - fullMax),
          maxAllowed: 0, // At boundary, no gap allowed
          requiredShift: Math.abs(targetFrame - fullMax),
          direction: 'SHIFT_LEFT'
        });
      }
    }
  }

  // COMPREHENSIVE FLUID TIMELINE ANALYSIS - All decision factors in one place
  console.log('[FLUID_TIMELINE_ANALYSIS] 🌊 FLUID TIMELINE DECISION MATRIX:', {
    // Input Parameters
    input: {
      draggedId: draggedId.substring(0, 8),
      originalPos,
      targetFrame,
      limitedTargetFrame,
      movementAmount,
      limitedMovementAmount,
      maxGap,
    },

    // Adjacent Items Analysis
    adjacent: {
      prevItem: prevItem ? {
        id: prevItem[0].substring(0, 8),
        pos: prevItem[1],
        gapToDragged: targetFrame - prevItem[1],
        gapToLimited: limitedTargetFrame - prevItem[1],
        violation: targetFrame - prevItem[1] > maxGap ? 'YES' : 'NO'
      } : null,
      nextItem: nextItem ? {
        id: nextItem[0].substring(0, 8),
        pos: nextItem[1],
        gapFromDragged: nextItem[1] - targetFrame,
        gapFromLimited: nextItem[1] - limitedTargetFrame,
        violation: nextItem[1] - targetFrame > maxGap ? 'YES' : 'NO'
      } : null
    },

    // Violation Analysis
    violations: violations.map(v => ({
      type: v.type,
      withItem: v.withItem,
      gap: v.gap,
      maxAllowed: v.maxAllowed,
      requiredShift: v.requiredShift,
      severity: v.gap > v.maxAllowed ? 'CRITICAL' : 'MINOR',
      direction: v.direction || 'UNKNOWN'
    })),

    // Decision Logic
    decision: {
      needsShift,
      shiftAmount,
      shiftDirection: limitedMovementAmount > 0 ? 'RIGHT' : 'LEFT',
      shiftReason: needsShift ?
        (violations.length > 0 ? 'VIOLATIONS' : 'FLUID_MOVEMENT') :
        'NO_MOVEMENT_NEEDED',
      shiftType: violations.length > 0 ? 'CORRECTIVE' : 'ENHANCEMENT'
    },

    // Movement Limits Applied
    limits: {
      maxSingleMove: 50,
      movementLimited: movementAmount !== limitedMovementAmount,
      limitApplied: Math.abs(movementAmount) > 50 ? 'YES' : 'NO'
    },

    // Timeline Impact (preview based on current state)
    impact: {
      itemsToShift: originalSorted.slice(originalDraggedIndex + 1).length,
      shiftMagnitude: shiftAmount,
      totalAffectedItems: 1 + originalSorted.slice(originalDraggedIndex + 1).length, // dragged + subsequent
      wouldCross: false, // Will be calculated after shifting
      constraintApplied: 'PENDING_CALCULATION'
    },

    // Final State Preview (preview based on current state)
    preview: {
      draggedFinalPos: limitedTargetFrame,
      subsequentItemsShifted: originalSorted.slice(originalDraggedIndex + 1).map(([id, pos]) => ({
        id: id.substring(0, 8),
        oldPos: pos,
        newPos: pos + (shiftAmount * (limitedMovementAmount > 0 ? 1 : -1))
      }))
    },

    // Timestamp
    timestamp: new Date().toISOString()
  });

  if (!needsShift) {
    console.log('[FluidTimelineCore] ✅ NO MOVEMENT - Using standard gap enforcement');
    return shrinkOversizedGaps(result, excludeId);
  }

  // SIMPLIFIED: Don't shift other items during drag
  // The complex shifting logic was causing items to disappear and markers to jump
  // Instead, just enforce gap constraints on the final result
  console.log('[FluidTimelineCore] 🛑 SHIFTING DISABLED - Complex shifting caused instability');
  console.log('[FluidTimelineCore] 📍 Dragged item position:', {
    draggedId: draggedId.substring(0, 8),
    targetFrame: limitedTargetFrame,
    violations: violations.length
  });
  
  // Just apply gap constraints without shifting other items
  return shrinkOversizedGaps(result, excludeId);

  /* DISABLED: Complex shifting logic that was causing issues
  // Apply shifting to handle violations (both gap violations and boundary collisions)
  const shiftDirection = movementAmount > 0 ? 1 : -1;

  // Determine which items to shift based on violation types
  let itemsToShift: [string, number][] = [];

  // Handle different violation types - use original sorted positions
  for (const violation of violations) {
    if (violation.type === 'BOUNDARY_COLLISION') {
      if (violation.direction === 'SHIFT_RIGHT') {
        // Shift items to the right of dragged item
        itemsToShift = originalSorted.slice(originalDraggedIndex + 1);
        break;
      } else if (violation.direction === 'SHIFT_LEFT') {
        // Shift items to the left of dragged item (in reverse order for consistent shifting)
        itemsToShift = originalSorted.slice(0, originalDraggedIndex);
        break;
      }
    }
  }

  // If no boundary violations, use traditional logic for gap violations
  if (itemsToShift.length === 0) {
    // FIXED: Only shift immediately adjacent items, not all items on one side
    // All gaps constrained to 81 frames
    const prevGapViolation = prevItem ? (targetFrame - prevItem[1] > maxGap) : false;
    const nextGapViolation = nextItem ? (nextItem[1] - targetFrame > maxGap) : false;

    if (limitedMovementAmount > 0 && prevGapViolation && prevItem) {
      // Right drag stretching gap to the left → only shift the immediately previous item
      itemsToShift = [prevItem];
      console.log('[BoundaryCollisionDebug] 🔁 ADJACENT SHIFT (RIGHT DRAG, PREV GAP): shifting only adjacent previous item', {
        draggedId: draggedId.substring(0, 8),
        prevItem: { id: prevItem[0].substring(0,8), pos: prevItem[1] },
        originalDraggedIndex,
        itemsToShift: itemsToShift.map(([id, pos]) => ({ id: id.substring(0,8), pos }))
      });
    } else if (limitedMovementAmount < 0 && nextGapViolation && nextItem) {
      // Left drag stretching gap to the right → only shift the immediately next item
      itemsToShift = [nextItem];
      console.log('[BoundaryCollisionDebug] 🔁 ADJACENT SHIFT (LEFT DRAG, NEXT GAP): shifting only adjacent next item', {
        draggedId: draggedId.substring(0, 8),
        nextItem: { id: nextItem[0].substring(0,8), pos: nextItem[1] },
        originalDraggedIndex,
        itemsToShift: itemsToShift.map(([id, pos]) => ({ id: id.substring(0,8), pos }))
      });
    } else {
      // Default: no shifting for normal drag operations
      itemsToShift = [];
      console.log('[BoundaryCollisionDebug] ✅ NO SHIFT NEEDED: Normal drag operation within constraints', {
        draggedId: draggedId.substring(0, 8),
        limitedMovementAmount,
        prevGapViolation,
        nextGapViolation
      });
    }
  }

  console.log('[FluidTimelineCore] 🌊 APPLYING TIMELINE SHIFT:', {
    draggedId: draggedId.substring(0, 8),
    shiftDirection: shiftDirection > 0 ? 'RIGHT' : 'LEFT',
    shiftAmount,
    violationTypes: violations.map(v => v.type),
    itemsToShift: itemsToShift.map(([id, pos]) => ({
      id: id.substring(0, 8),
      oldPos: pos,
      newPos: pos + (shiftAmount * shiftDirection)
    })),
    boundaryCollisionDetected: violations.some(v => v.type === 'BOUNDARY_COLLISION')
  });

  // Shift items by the required amount
  itemsToShift.forEach(([id, pos]) => {
    const newPos = pos + (shiftAmount * shiftDirection);
    result.set(id, newPos);
    
    // 🎯 MOVEMENT TRACKING: Log fluid timeline shifts
    console.log(`[TIMELINE_TRACK] [FLUID_SHIFT] 🌊 Item ${id.substring(0, 8)} shifted by fluid timeline: ${pos} → ${newPos} (Δ${newPos - pos})`);
  });

  // Check if after shifting, the dragged item would cross another item
  // Use ORIGINAL positions for collision detection, not the shifted positions
  const wouldCrossAfterShift = wouldCrossItem(draggedId, limitedTargetFrame, positions, limitedMovementAmount);

  console.log('[FluidTimelineCore] 🚧 COLLISION DETECTION:', {
    draggedId: draggedId.substring(0, 8),
    wouldCrossAfterShift,
    movementDirection: limitedMovementAmount > 0 ? 'RIGHT' : 'LEFT',
    limitedTargetFrame
  });

  if (wouldCrossAfterShift) {
    // Find the new adjacent item after shifting (use original positions for this check)
    const nextItemAfterShift = findNextItemInDirection(draggedId, limitedTargetFrame, positions, limitedMovementAmount);

    if (nextItemAfterShift) {
      console.log('[FluidTimelineCore] ⚡ CONSTRAINT APPLICATION - Would cross item:', {
        draggedId: draggedId.substring(0, 8),
        crossingItem: {
          id: nextItemAfterShift.id.substring(0, 8),
          pos: nextItemAfterShift.pos
        }
      });

      // Apply gap constraint between dragged item and new adjacent item
      // For rightward drags, allow the dragged item to move past the next item
      // For leftward drags, allow the dragged item to move past the previous item
      const effectiveMaxGap = maxGap;
      
      const constraint = limitedMovementAmount > 0
        ? nextItemAfterShift.pos + effectiveMaxGap  // Allow dragging past the next item
        : nextItemAfterShift.pos - effectiveMaxGap; // Allow dragging past the previous item

      const constrainedPos = limitedMovementAmount > 0
        ? Math.min(limitedTargetFrame, constraint)
        : Math.max(limitedTargetFrame, constraint);

      console.log('[FluidTimelineCore] 🔒 APPLYING CONSTRAINT:', {
        draggedId: draggedId.substring(0, 8),
        limitedTargetFrame,
        constraint,
        constrainedPos,
        constraintType: limitedMovementAmount > 0 ? 'MIN_CONSTRAINT' : 'MAX_CONSTRAINT'
      });

      result.set(draggedId, constrainedPos);

      // Re-apply shifting with the constrained position
      const finalShiftAmount = Math.abs(constrainedPos - limitedTargetFrame);
      const finalShiftDirection = limitedMovementAmount > 0 ? 1 : -1;

      console.log('[FluidTimelineCore] 🔄 RE-APPLYING SHIFT WITH CONSTRAINT:', {
        draggedId: draggedId.substring(0, 8),
        finalShiftAmount,
        finalShiftDirection: finalShiftDirection > 0 ? 'RIGHT' : 'LEFT'
      });

      // Get the current positions after constraint (they may have changed)
      const currentPositions = [...result.entries()]
        .filter(([id]) => id !== excludeId)
        .sort((a, b) => a[1] - b[1]);

      const newDraggedIndex = currentPositions.findIndex(([id, _]) => id === draggedId);
      const finalItemsToShift = currentPositions.slice(newDraggedIndex + 1);

      console.log('[FluidTimelineCore] 📋 FINAL SHIFT ITEMS:', {
        finalItemsToShift: finalItemsToShift.map(([id, pos]) => ({
          id: id.substring(0, 8),
          oldPos: pos,
          newPos: pos + (finalShiftAmount * finalShiftDirection)
        }))
      });

      finalItemsToShift.forEach(([id, pos]) => {
        const newPos = pos + (finalShiftAmount * finalShiftDirection);
        result.set(id, newPos);
      });
    }
  }

  // COMPREHENSIVE FLUID TIMELINE RESULT - Complete analysis of what happened
  console.log('[FLUID_TIMELINE_RESULT] ✅ FLUID TIMELINE OPERATION COMPLETE:', {
    // Operation Summary
    operation: {
      draggedId: draggedId.substring(0, 8),
      originalPos,
      targetFrame,
      limitedTargetFrame,
      finalPos: result.get(draggedId),
      actualMovement: result.get(draggedId) - originalPos,
      limitedMovement: limitedTargetFrame - originalPos
    },

    // Movement Analysis
    movement: {
      rawMovementAmount: movementAmount,
      limitedMovementAmount,
      movementLimited: movementAmount !== limitedMovementAmount,
      limitReason: Math.abs(movementAmount) > 50 ? 'MAX_LIMIT_REACHED' : 'WITHIN_LIMITS',
      effectiveMovement: result.get(draggedId) - originalPos
    },

    // Shifting Analysis
    shifting: {
      needsShift,
      shiftAmount,
      shiftDirection: limitedMovementAmount > 0 ? 'RIGHT' : 'LEFT',
      itemsShifted: itemsToShift.length,
      totalItemsAffected: 1 + itemsToShift.length,
      shiftReason: violations.length > 0 ? 'VIOLATIONS' : 'FLUID_ENHANCEMENT',
      shiftType: violations.length > 0 ? 'CORRECTIVE' : 'ENHANCEMENT'
    },

    // Constraint Analysis
    constraints: {
      wouldCross: false, // Will be calculated after actual shifting
      constraintApplied: 'PENDING_CALCULATION',
      constraintType: 'PENDING_CALCULATION',
      finalPositionAfterConstraints: result.get(draggedId)
    },

    // Complete Position Changes
    positions: {
      before: Array.from(positions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        pos
      })),
      after: Array.from(result.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        pos
      })),
      changes: Array.from(result.entries())
        .filter(([id, pos]) => pos !== (positions.get(id) ?? 0))
        .map(([id, pos]) => ({
          id: id.substring(0, 8),
          oldPos: positions.get(id) ?? 0,
          newPos: pos,
          delta: pos - (positions.get(id) ?? 0),
          itemType: id === draggedId ? 'DRAGGED_ITEM' : 'SHIFTED_ITEM'
        }))
    },

    // Context and Limits
    context: {
      maxGap,
      containerWidth: 1000
    },

    // Timing
    timestamp: new Date().toISOString()
  });

  return result;
  END DISABLED BLOCK */
};

// Convert pixel position to frame number
// Note: This function expects pixelX to be relative to the container edge (not accounting for padding)
// The padding offset is applied in the calling code (e.g., useTimelineDrag, useFileDrop)
export const pixelToFrame = (pixelX: number, containerWidth: number, fullMin: number, fullRange: number): number => {
  const fraction = pixelX / containerWidth;
  return Math.round(fullMin + fraction * fullRange);
};

// Find closest valid position considering constraints
export const findClosestValidPosition = (
  targetFrame: number, 
  activeId: string,
  framePositions: Map<string, number>,
): number => {
  const originalPos = framePositions.get(activeId) ?? 0;

  console.log('[SnapToPosition] 🎯 FIND CLOSEST VALID POSITION - Starting snap calculation:', {
    activeId: activeId.substring(0, 8),
    targetFrame,
    originalPos,
    timestamp: new Date().toISOString()
  });

  // Helper to validate position with frame 0 reassignment logic
  const validateWithFrame0Logic = (testFrame: number): boolean => {
    const testMap = new Map(framePositions);
    testMap.set(activeId, testFrame);

    // If we're moving frame 0, simulate the reassignment
    if (originalPos === 0 && testFrame !== 0) {
      // Find what would become the new frame 0
      const nearest = [...testMap.entries()]
        .filter(([id]) => id !== activeId)
        .sort((a, b) => a[1] - b[1])[0];
      if (nearest) {
        testMap.set(nearest[0], 0);
      }
    }

    const isValid = validateGaps(testMap);

    if (!isValid) {
      console.log('[SnapToPosition] ❌ POSITION INVALID:', {
        activeId: activeId.substring(0, 8),
        testFrame,
        violations: []
      });
    }

    return isValid;
  };

  // First check if target is valid
  if (validateWithFrame0Logic(targetFrame)) {
    console.log('[SnapToPosition] ✅ TARGET VALID - No snapping needed:', {
      activeId: activeId.substring(0, 8),
      targetFrame,
      originalPos
    });
    return targetFrame;
  }

  console.log('[SnapToPosition] 🔍 TARGET INVALID - Starting binary search for valid position:', {
    activeId: activeId.substring(0, 8),
    targetFrame,
    originalPos,
    searchRange: { low: Math.min(originalPos, targetFrame), high: Math.max(originalPos, targetFrame) }
  });

  // Binary search for closest valid position
  const direction = targetFrame > originalPos ? 1 : -1;
  let low = Math.min(originalPos, targetFrame);
  let high = Math.max(originalPos, targetFrame);
  let best = originalPos;
  let iterations = 0;
  const maxIterations = 20; // Prevent infinite loops

  while (low <= high && iterations < maxIterations) {
    const mid = Math.round((low + high) / 2);
    iterations++;

    console.log(`[SnapToPosition] 🔄 BINARY SEARCH ITERATION ${iterations}:`, {
      activeId: activeId.substring(0, 8),
      low,
      high,
      mid,
      direction: direction > 0 ? 'RIGHT' : 'LEFT'
    });

    if (validateWithFrame0Logic(mid)) {
      best = mid;
      console.log(`[SnapToPosition] ✅ VALID POSITION FOUND: ${mid} (best: ${best})`);

      if (direction > 0) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } else {
      console.log(`[SnapToPosition] ❌ POSITION INVALID: ${mid}`);

      if (direction > 0) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
  }

  console.log('[SnapToPosition] ✅ BINARY SEARCH COMPLETE:', {
    activeId: activeId.substring(0, 8),
    targetFrame,
    originalPos,
    snappedTo: best,
    snapDelta: best - targetFrame,
    iterations
  });

  return best;
};

// Calculate timeline dimensions
// MINIMUM_TIMELINE_MAX ensures the timeline always shows at least this many frames
// This provides space for duplicating the only item in a shot
const MINIMUM_TIMELINE_MAX = 30;

export const getTimelineDimensions = (
  framePositions: Map<string, number>,
  pendingFrames?: (number | null)[] // Optional pending frames (drop, duplicate) to include in range calculation
) => {
  const positions = Array.from(framePositions.values());
  
  // Include valid pending frames in the calculation
  const validPendingFrames = (pendingFrames || []).filter((f): f is number => f !== null && f !== undefined);
  const allPositions = [...positions, ...validPendingFrames];
  
  // [PendingDebug] Log when pending frames are included
  if (validPendingFrames.length > 0) {
    console.log('[PendingDebug] 📐 getTimelineDimensions including pending frames:', {
      positions: positions.slice(0, 5), // First 5 positions
      validPendingFrames,
      allPositionsCount: allPositions.length
    });
  }
  
  // Handle empty positions case
  if (allPositions.length === 0) {
    return { fullMin: 0, fullMax: MINIMUM_TIMELINE_MAX, fullRange: MINIMUM_TIMELINE_MAX }; // Show minimum range for empty case
  }
  
  const staticMax = Math.max(...allPositions, 0);
  const staticMin = Math.min(...allPositions, 0);

  // Ensure timeline shows at least MINIMUM_TIMELINE_MAX frames
  // This provides visual space when there's only one item at position 0
  const fullMax = Math.max(staticMax, MINIMUM_TIMELINE_MAX);
  
  // NO LEFT-SIDE PADDING - timeline starts exactly at the first image position (or 0)
  const fullMin = Math.min(0, staticMin);
  const fullRange = Math.max(fullMax - fullMin, 1); // Ensure minimum range of 1 to avoid division by zero

  // DEBUG: Detect outlier positions that might cause timeline to extend unexpectedly
  const sortedPositions = [...positions].sort((a, b) => a - b);
  const median = sortedPositions[Math.floor(sortedPositions.length / 2)];
  const outliers = positions.filter(p => Math.abs(p - median) > 200); // More than 200 frames from median
  
  if (outliers.length > 0) {
    console.warn('[TimelineOutlier] ⚠️ OUTLIER POSITIONS DETECTED:', {
      outliers,
      median,
      allPositions: sortedPositions,
      fullRange,
      itemsWithOutliers: [...framePositions.entries()]
        .filter(([_, pos]) => outliers.includes(pos))
        .map(([id, pos]) => ({ id: id.substring(0, 8), position: pos }))
    });
  }

  // DEBUG: Log coordinate system calculation for position 0 visibility debugging
  if (positions.includes(0)) {
    console.log('[NoPaddingFix] 🎯 Timeline dimensions calculated with NO PADDING:', {
      positions: positions.sort((a, b) => a - b),
      staticMin,
      staticMax,
      fullMin,
      fullMax,
      fullRange,
      noPadding: 'Timeline ends exactly at last image position',
      position0PixelCalculation: {
        framePosition: 0,
        fullMinFrames: fullMin,
        formula: `60 + ((0 - ${fullMin}) / ${fullRange}) * effectiveWidth`,
        normalizedPosition: (0 - fullMin) / fullRange,
        shouldBeAtStart: fullMin === 0 && staticMin === 0
      }
    });
  }

  return { fullMin, fullMax, fullRange };
};

// Helper: clamp value between min and max
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

// Get pair information from positions
export const getPairInfo = (
  framePositions: Map<string, number>,
  // contextFrames is no longer used for calculation but might be kept for other visualizations if needed,
  // but based on the request, we should just ignore it for "full width" logic.
  // However, I'll remove it to match the cleanup.
) => {
  const sortedPositions = [...framePositions.entries()]
    .map(([id, pos]) => ({ id, pos }))
    .sort((a, b) => a.pos - b.pos);

  const pairs = [];
  for (let i = 0; i < sortedPositions.length - 1; i++) {
    const startFrame = sortedPositions[i].pos;
    const endFrame = sortedPositions[i + 1].pos;
    const pairFrames = endFrame - startFrame;

    const generationStart = startFrame;

    pairs.push({
      index: i,
      startFrame,
      endFrame,
      frames: pairFrames,
      generationStart,
      contextStart: endFrame, // No context overlap, or effectively 0
      contextEnd: endFrame,
    });
  }

  return pairs;
}; 