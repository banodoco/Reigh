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
    
    // FIRST GAP (first pair): Constrained to 81 frames (starts from beginning, no context needed)
    // SUBSEQUENT GAPS: Constrained to 81 - contextFrames (need context from previous pair)
    const isFirstGap = (i === 1);
    const effectiveMaxGap = isFirstGap ? 81 : maxGap;
    
    if (diff > effectiveMaxGap) {
      log('TimelineFrameLimitIssue', 'Gap violation detected', {
        index: i,
        prevFrame: positions[i - 1],
        nextFrame: positions[i],
        diff,
        maxGap: effectiveMaxGap,
        isFirstGap,
      });
      return false;
    }
  }
  return true;
};

// ---------------------------------------------------------------------------
// Utility: shrink oversized gaps by left-shifting subsequent frames so that
// every gap ≤ maxGap.  Returns a **new** Map (does not mutate input).
// NOTE: First gap (first pair) is constrained to 81 frames (no context needed).
// Subsequent gaps are constrained to 81 - contextFrames (need context from previous pair).
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

  for (let i = 0; i < entries.length; i++) {
    const [id, originalPos] = entries[i];
    
    // Special case: preserve frame 0 exactly
    if (originalPos === 0) {
      result.set(id, 0);
      prev = 0;
    } else {
      const desiredPos = Math.max(originalPos, prev + 1); // keep minGap of 1
      
      // FIRST GAP (i === 1): Constrained to 81 frames (first pair from start)
      // SUBSEQUENT GAPS (i > 1): Constrained to 81 - contextFrames
      const isFirstGap = (i === 1);
      const effectiveMaxGap = isFirstGap ? 81 : maxGap;
      const allowedPos = Math.min(desiredPos, prev + effectiveMaxGap);
      
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
    return shrinkOversizedGaps(result, contextFrames, excludeId);
  }

  // Get adjacent items based on ORIGINAL positions, not the moved position
  const prevItem = originalDraggedIndex > 0 ? originalSorted[originalDraggedIndex - 1] : null;
  const nextItem = originalDraggedIndex < originalSorted.length - 1 ? originalSorted[originalDraggedIndex + 1] : null;

  let needsShift = false;
  let shiftAmount = 0;
  let violations = [];

  if (limitedMovementAmount !== 0) {

    let wouldCreateViolation = false;

    // Use the original adjacent items for gap calculations
    // First gap (when prevItem is at position 0): constrained to 81 frames
    // Subsequent gaps: constrained to 81 - contextFrames
    if (prevItem) {
      const isFirstGap = (prevItem[1] === 0);
      const effectiveMaxGap = isFirstGap ? 81 : maxGap;
      if (limitedTargetFrame - prevItem[1] > effectiveMaxGap) {
        wouldCreateViolation = true;
      }
    }

    if (nextItem) {
      const isFirstGap = (originalPos === 0);
      const effectiveMaxGap = isFirstGap ? 81 : maxGap;
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
    const isFirstGap = (prevItem[1] === 0);
    const effectiveMaxGap = isFirstGap ? 81 : maxGap;
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
    const isFirstGap = (originalPos === 0);
    const effectiveMaxGap = isFirstGap ? 81 : maxGap;
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

  if (!needsShift) {
    return shrinkOversizedGaps(result, contextFrames, excludeId);
  }

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
    // First gap (when prevItem is at position 0): constrained to 81 frames
    // Subsequent gaps: constrained to 81 - contextFrames
    const prevGapViolation = prevItem ? (targetFrame - prevItem[1] > (prevItem[1] === 0 ? 81 : maxGap)) : false;
    const nextGapViolation = nextItem ? (nextItem[1] - targetFrame > (originalPos === 0 ? 81 : maxGap)) : false;

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
      // Check if this is the first gap (when the adjacent item is at position 0)
      const isFirstGap = (nextItemAfterShift.pos === 0);
      const effectiveMaxGap = isFirstGap ? 81 : maxGap;
      
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
  
  // Handle empty positions case
  if (positions.length === 0) {
    return { fullMin: 0, fullMax: 0, fullRange: 1 }; // Minimal range for empty case
  }
  
  const staticMax = Math.max(...positions, 0);
  const staticMin = Math.min(...positions, 0);

  // NO RIGHT-SIDE PADDING - timeline ends exactly at the last image position
  const fullMax = staticMax;
  
  // NO LEFT-SIDE PADDING - timeline starts exactly at the first image position (or 0)
  const fullMin = Math.min(0, staticMin);
  const fullRange = Math.max(fullMax - fullMin, 1); // Ensure minimum range of 1 to avoid division by zero

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