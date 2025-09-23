import { log } from "@/shared/lib/logger";

// Calculate max gap based on context frames
export const calculateMaxGap = (contextFrames: number): number => {
  const maxGap = 81 - contextFrames;
  return Math.max(maxGap, contextFrames + 10);
};

// Validate gap constraints
export const validateGaps = (
  testPositions: Map<string, number>, 
  contextFrames: number,
  excludeId?: string
): boolean => {
  const positions = [...testPositions.entries()]
    .filter(([id]) => id !== excludeId)
    .map(([_, pos]) => pos);
  positions.push(0); // Always include frame 0
  positions.sort((a, b) => a - b);

  const maxGap = calculateMaxGap(contextFrames);

  // Debug: log every validation attempt
  log('TimelineFrameLimitIssue', 'validateGaps check', { excludeId, maxGap, positions });

  for (let i = 1; i < positions.length; i++) {
    const diff = positions[i] - positions[i - 1];
    if (diff > maxGap) {
      log('TimelineFrameLimitIssue', 'Gap violation detected', {
        index: i,
        prevFrame: positions[i - 1],
        nextFrame: positions[i],
        diff,
        maxGap,
      });
      return false;
    }
  }
  return true;
};

// ---------------------------------------------------------------------------
// Utility: shrink oversized gaps by left-shifting subsequent frames so that
// every gap ≤ maxGap.  Returns a **new** Map (does not mutate input).
// ---------------------------------------------------------------------------
export const shrinkOversizedGaps = (
  positions: Map<string, number>,
  contextFrames: number,
  excludeId?: string,
): Map<string, number> => {
  const maxGap = calculateMaxGap(contextFrames);

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

  for (const [id, originalPos] of entries) {
    // Special case: preserve frame 0 exactly
    if (originalPos === 0) {
      result.set(id, 0);
      prev = 0;
    } else {
      const desiredPos = Math.max(originalPos, prev + 1); // keep minGap of 1
      const allowedPos = Math.min(desiredPos, prev + maxGap);
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
  contextFrames: number,
  excludeId?: string,
  fullMin: number = 0,
  fullMax: number = Number.MAX_SAFE_INTEGER
): Map<string, number> => {
  const maxGap = calculateMaxGap(contextFrames);
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
    contextFrames,
    timestamp: new Date().toISOString()
  });

  // Start with the proposed position (but use limited movement)
  const result = new Map(positions);
  const limitedTargetFrame = originalPos + limitedMovementAmount;
  result.set(draggedId, limitedTargetFrame);

  // Get all items sorted by position
  const sorted = [...result.entries()]
    .filter(([id]) => id !== excludeId)
    .sort((a, b) => a[1] - b[1]);

  // Find the dragged item's position in the sorted list
  const draggedIndex = sorted.findIndex(([id, _]) => id === draggedId);
  if (draggedIndex === -1) {
    console.log('[FluidTimelineCore] ⚠️ DRAGGED ITEM NOT FOUND - Falling back to shrinkOversizedGaps');
    return shrinkOversizedGaps(result, contextFrames, excludeId);
  }

  // For fluid timeline behavior, we want to shift subsequent items when dragging
  // Check the current gap situation
  const prevItem = draggedIndex > 0 ? sorted[draggedIndex - 1] : null;
  const nextItem = draggedIndex < sorted.length - 1 ? sorted[draggedIndex + 1] : null;

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
    // Check if the limited movement would create gap violations
    const limitedTargetFrame = originalPos + limitedMovementAmount;
    const draggedIndex = sorted.findIndex(([id, _]) => id === draggedId);
    const prevItem = draggedIndex > 0 ? sorted[draggedIndex - 1] : null;
    const nextItem = draggedIndex < sorted.length - 1 ? sorted[draggedIndex + 1] : null;

    let wouldCreateViolation = false;

    if (prevItem && limitedTargetFrame - prevItem[1] > maxGap) {
      wouldCreateViolation = true;
    }

    if (nextItem && nextItem[1] - limitedTargetFrame > maxGap) {
      wouldCreateViolation = true;
    }

    if (wouldCreateViolation) {
      needsShift = true;
      shiftAmount = Math.abs(limitedMovementAmount);
    } else {
      // Even if no violation, allow some fluid movement for better UX
      // But only shift a fraction of the movement to make it feel more natural
      needsShift = true;
      shiftAmount = Math.max(1, Math.abs(limitedMovementAmount) * 0.3); // Only 30% of the movement
    }
  }

  // Also check for gap violations (traditional logic) with the actual target frame
  if (prevItem && targetFrame - prevItem[1] > maxGap) {
    violations.push({
      type: 'GAP_VIOLATION',
      withItem: prevItem[0].substring(0, 8),
      gap: targetFrame - prevItem[1],
      maxAllowed: maxGap,
      requiredShift: targetFrame - prevItem[1] - maxGap
    });
  }

  if (nextItem && nextItem[1] - targetFrame > maxGap) {
    violations.push({
      type: 'GAP_VIOLATION',
      withItem: nextItem[0].substring(0, 8),
      gap: nextItem[1] - targetFrame,
      maxAllowed: maxGap,
      requiredShift: nextItem[1] - targetFrame - maxGap
    });
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
      const itemsToShiftRight = sorted.slice(draggedIndex + 1); // Items after dragged item
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
      const itemsToShiftLeft = sorted.slice(0, draggedIndex).reverse(); // Items before dragged item
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
      contextFrames
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
      itemsToShift: sorted.slice(draggedIndex + 1).length,
      shiftMagnitude: shiftAmount,
      totalAffectedItems: 1 + sorted.slice(draggedIndex + 1).length, // dragged + subsequent
      wouldCross: false, // Will be calculated after shifting
      constraintApplied: 'PENDING_CALCULATION'
    },

    // Final State Preview (preview based on current state)
    preview: {
      draggedFinalPos: limitedTargetFrame,
      subsequentItemsShifted: sorted.slice(draggedIndex + 1).map(([id, pos]) => ({
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
    return shrinkOversizedGaps(result, contextFrames, excludeId);
  }

  // Apply shifting to handle violations (both gap violations and boundary collisions)
  const shiftDirection = movementAmount > 0 ? 1 : -1;

  // Determine which items to shift based on violation types
  let itemsToShift: [string, number][] = [];

  // Handle different violation types
  for (const violation of violations) {
    if (violation.type === 'BOUNDARY_COLLISION') {
      if (violation.direction === 'SHIFT_RIGHT') {
        // Shift items to the right of dragged item
        itemsToShift = sorted.slice(draggedIndex + 1);
        break;
      } else if (violation.direction === 'SHIFT_LEFT') {
        // Shift items to the left of dragged item (in reverse order for consistent shifting)
        itemsToShift = sorted.slice(0, draggedIndex);
        break;
      }
    }
  }

  // If no boundary violations, use traditional logic for gap violations
  if (itemsToShift.length === 0) {
    // Symmetric handling:
    // - Dragging RIGHT (limitedMovementAmount > 0): if prev-gap violated, shift LEFT items
    // - Dragging LEFT (limitedMovementAmount < 0): if next-gap violated, shift RIGHT items
    const prevGapViolation = prevItem ? (targetFrame - prevItem[1] > maxGap) : false;
    const nextGapViolation = nextItem ? (nextItem[1] - targetFrame > maxGap) : false;

    if (limitedMovementAmount > 0 && prevGapViolation) {
      // Right drag stretching gap to the left → pull left items rightwards
      itemsToShift = sorted.slice(0, draggedIndex);
      console.log('[BoundaryCollisionDebug] 🔁 SYMMETRIC SHIFT (RIGHT DRAG, PREV GAP): shifting LEFT items', {
        draggedId: draggedId.substring(0, 8),
        prevItem: prevItem ? { id: prevItem[0].substring(0,8), pos: prevItem[1] } : null,
        draggedIndex,
        itemsToShift: itemsToShift.map(([id, pos]) => ({ id: id.substring(0,8), pos }))
      });
    } else if (limitedMovementAmount < 0 && nextGapViolation) {
      // Left drag stretching gap to the right → push right items leftwards
      itemsToShift = sorted.slice(draggedIndex + 1);
      console.log('[BoundaryCollisionDebug] 🔁 SYMMETRIC SHIFT (LEFT DRAG, NEXT GAP): shifting RIGHT items', {
        draggedId: draggedId.substring(0, 8),
        nextItem: nextItem ? { id: nextItem[0].substring(0,8), pos: nextItem[1] } : null,
        draggedIndex,
        itemsToShift: itemsToShift.map(([id, pos]) => ({ id: id.substring(0,8), pos }))
      });
    } else {
      // Default: shift subsequent items (previous behavior)
      itemsToShift = sorted.slice(draggedIndex + 1);
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
  });

  // Check if after shifting, the dragged item would cross another item
  const wouldCrossAfterShift = wouldCrossItem(draggedId, limitedTargetFrame, result, limitedMovementAmount);

  console.log('[FluidTimelineCore] 🚧 COLLISION DETECTION:', {
    draggedId: draggedId.substring(0, 8),
    wouldCrossAfterShift,
    movementDirection: limitedMovementAmount > 0 ? 'RIGHT' : 'LEFT',
    limitedTargetFrame
  });

  if (wouldCrossAfterShift) {
    // Find the new adjacent item after shifting
    const nextItemAfterShift = findNextItemInDirection(draggedId, limitedTargetFrame, result, limitedMovementAmount);

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
      const constraint = limitedMovementAmount > 0
        ? nextItemAfterShift.pos + maxGap  // Allow dragging past the next item
        : nextItemAfterShift.pos - maxGap; // Allow dragging past the previous item

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
      contextFrames,
      maxGap,
      containerWidth: 1000
    },

    // Timing
    timestamp: new Date().toISOString()
  });

  return result;
};

// Convert pixel position to frame number
export const pixelToFrame = (pixelX: number, containerWidth: number, fullMin: number, fullRange: number): number => {
  const fraction = pixelX / containerWidth;
  return Math.round(fullMin + fraction * fullRange);
};

// Find closest valid position considering constraints
export const findClosestValidPosition = (
  targetFrame: number, 
  activeId: string,
  framePositions: Map<string, number>,
  contextFrames: number
): number => {
  const originalPos = framePositions.get(activeId) ?? 0;

  console.log('[SnapToPosition] 🎯 FIND CLOSEST VALID POSITION - Starting snap calculation:', {
    activeId: activeId.substring(0, 8),
    targetFrame,
    originalPos,
    contextFrames,
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

    const isValid = validateGaps(testMap, contextFrames);

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
export const getTimelineDimensions = (framePositions: Map<string, number>) => {
  const positions = Array.from(framePositions.values());
  const staticMax = Math.max(...positions, 0);
  const staticMin = Math.min(...positions, 0);
  const padding = 30;

  const fullMax = Math.max(60, staticMax + padding);
  const fullMin = Math.min(0, staticMin - padding);
  const fullRange = fullMax - fullMin;

  return { fullMin, fullMax, fullRange };
};

// Helper: clamp value between min and max
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

// Get pair information from positions
export const getPairInfo = (
  framePositions: Map<string, number>,
  contextFrames: number
) => {
  const sortedPositions = [...framePositions.entries()]
    .map(([id, pos]) => ({ id, pos }))
    .sort((a, b) => a.pos - b.pos);

  const pairs = [];
  for (let i = 0; i < sortedPositions.length - 1; i++) {
    const startFrame = sortedPositions[i].pos;
    const endFrame = sortedPositions[i + 1].pos;
    const pairFrames = endFrame - startFrame;

    const generationStart = (i === 0)
      ? startFrame
      : (sortedPositions[i].pos - contextFrames);

    pairs.push({
      index: i,
      startFrame,
      endFrame,
      frames: pairFrames,
      generationStart,
      contextStart: endFrame - contextFrames,
      contextEnd: endFrame,
    });
  }

  return pairs;
}; 