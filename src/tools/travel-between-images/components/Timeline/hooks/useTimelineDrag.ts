import { useState, useEffect, useCallback, useRef } from "react";
import { GenerationRow } from "@/types/shots";
import { 
  calculateMaxGap, 
  findClosestValidPosition, 
  pixelToFrame,
  clamp,
  shrinkOversizedGaps,
} from "../utils/timeline-utils";
import { log } from "@/shared/lib/logger";

interface DragState {
  isDragging: boolean;
  activeId: string | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  originalFramePos: number;
  isCommandPressed: boolean;
  isOptionPressed: boolean;
  leftGap: number;
  rightGap: number;
}

interface DragRefs {
  lastMouseUpTime: number;
  isBlocked: boolean;
}

interface UseTimelineDragProps {
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => void;
  images: GenerationRow[];
  onImageReorder: (orderedIds: string[]) => void;
  contextFrames: number;
  fullMin: number;
  fullRange: number;
}

export const useTimelineDrag = ({
  framePositions,
  setFramePositions,
  images,
  onImageReorder,
  contextFrames,
  fullMin,
  fullRange,
}: UseTimelineDragProps) => {
  // Drag state for timeline item reordering
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    activeId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    originalFramePos: 0,
    isCommandPressed: false,
    isOptionPressed: false,
    leftGap: 0,
    rightGap: 0,
  });

  // Track mouse up timing to prevent phantom restarts
  const dragRefsRef = useRef<DragRefs>({
    lastMouseUpTime: 0,
    isBlocked: false,
  });

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, imageId: string, containerRef: React.RefObject<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    // Much more aggressive phantom restart prevention
    const now = Date.now();
    const timeSinceLastUp = now - dragRefsRef.current.lastMouseUpTime;
    
    log('TimelineDragDebug', 'mousedown', {
      id: imageId,
      buttons: e.buttons,
      isDragging: dragState.isDragging,
      timeSinceLastUp,
      timestamp: e.timeStamp,
      lastUpTime: dragRefsRef.current.lastMouseUpTime,
      isBlocked: dragRefsRef.current.isBlocked,
    });

    // Prevent phantom restart after re-render moves element under cursor
    if (e.buttons !== 1) {
      log('TimelineDragDebug', 'rejected_buttons', { buttons: e.buttons });
      return; // only left button
    }
    if (dragState.isDragging) {
      log('TimelineDragDebug', 'rejected_already_dragging', {});
      return; // already dragging
    }
    if (dragRefsRef.current.isBlocked) {
      log('TimelineDragDebug', 'rejected_blocked', {});
      return; // temporarily blocked
    }
    if (timeSinceLastUp < 200) { // Increased from 100ms to 200ms
      log('TimelineDragDebug', 'rejected_too_soon', { timeSinceLastUp });
      return; // within same gesture
    }

    const framePos = framePositions.get(imageId) ?? 0;

    // Determine original gaps to neighbours
    const sorted = [...framePositions.entries()].sort((a,b)=>a[1]-b[1]);
    const idx = sorted.findIndex(([id])=>id===imageId);
    const prevPos = idx > 0 ? sorted[idx-1][1] : 0;
    const nextPos = idx < sorted.length-1 ? sorted[idx+1][1] : framePos + 9999; // Use large default for last item

    setDragState({
      isDragging: true,
      activeId: imageId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      originalFramePos: framePos,
      isCommandPressed: e.metaKey,
      isOptionPressed: e.altKey,
      leftGap: framePos - prevPos,
      rightGap: nextPos - framePos,
    });

          // Drag logging (start)
      if (e.metaKey || e.altKey) {
        log('TimelineModifierDrag', 'start', {
          id: imageId,
          framePos,
          cmd: e.metaKey,
          opt: e.altKey,
          leftGap: framePos - prevPos,
          rightGap: nextPos - framePos,
        });
      } else {
        log('TimelineNormalDrag', 'start', {
          id: imageId,
          framePos,
          leftGap: framePos - prevPos,
          rightGap: nextPos - framePos,
        });
      }
  }, [framePositions]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging) return;
    
    setDragState(prev => ({
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
      isCommandPressed: e.metaKey,
      isOptionPressed: e.altKey,
    }));

    if (dragState.isDragging && dragState.activeId) {
      const containerWidth = 1000; // This matches the value used in currentDragFrame calculation
      const dragOffsetX = e.clientX - dragState.startX;
      const originalPixelPos = ((dragState.originalFramePos - fullMin) / fullRange) * containerWidth;
      const targetPixelPos = originalPixelPos + dragOffsetX;
      const targetFrame = Math.max(0, pixelToFrame(targetPixelPos, containerWidth, fullMin, fullRange));
      const constrainedFrame = findClosestValidPosition(targetFrame, dragState.activeId, framePositions, contextFrames);
      
      if (e.metaKey || e.altKey) {
        log('TimelineModifierDrag', 'move', {
          id: dragState.activeId,
          deltaX: e.clientX - dragState.startX,
          frame: constrainedFrame,
          diffFrames: constrainedFrame - dragState.originalFramePos,
          cmd: e.metaKey,
          opt: e.altKey,
        });
      } else {
        log('TimelineNormalDrag', 'move', {
          id: dragState.activeId,
          deltaX: e.clientX - dragState.startX,
          frame: constrainedFrame,
          diffFrames: constrainedFrame - dragState.originalFramePos,
        });
      }
    }
  }, [dragState.isDragging]);

  const handleMouseUp = useCallback((e: MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => {
    if (!dragState.isDragging || !dragState.activeId || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const containerWidth = rect.width;

    // Calculate the pixel position where we're dropping
    const dragOffsetX = dragState.currentX - dragState.startX;
    const originalPixelPos = ((dragState.originalFramePos - fullMin) / fullRange) * containerWidth;
    const targetPixelPos = originalPixelPos + dragOffsetX;

    // Convert to frame number and constrain
    const targetFrame = Math.max(0, pixelToFrame(targetPixelPos, containerWidth, fullMin, fullRange));
    const validFrame = findClosestValidPosition(targetFrame, dragState.activeId, framePositions, contextFrames);

    // --------------------------------------------------------------------
    // Apply the final positions **including** the push / pull preview
    // --------------------------------------------------------------------

    // `dynamicPositions()` already contains the fully-calculated layout that
    // respects push / pull rules. Start from that instead of the stale
    // `framePositions` map so that sibling frames keep their previewed
    // positions and we don’t “snap back” on drop.

    const previewMap = dynamicPositions();

    // Also normalise oversized gaps one final time for persisted state.
    const updatedMap = shrinkOversizedGaps(new Map(previewMap), contextFrames);

    const originalPos = framePositions.get(dragState.activeId) ?? 0;

    // Debug: log drop details and tentative updated positions
    log('TimelineFrameLimitIssue', 'handleMouseUp drop result', {
      activeId: dragState.activeId,
      originalPos,
      validFrame,
      updatedPositions: Array.from(updatedMap.entries()),
    });

    const wasModifier = dragState.isCommandPressed || dragState.isOptionPressed;

    if (!dragState.isCommandPressed && !dragState.isOptionPressed) {
      // For normal drag, handle swapping and frame 0 reassignment logic
      const targetEntry = [...framePositions.entries()].find(
        ([id, pos]) => id !== dragState.activeId && pos === validFrame
      );

      if (targetEntry) {
        // Swap positions
        updatedMap.set(targetEntry[0], originalPos);
        updatedMap.set(dragState.activeId, validFrame);
      } else if (originalPos === 0 && validFrame !== 0) {
        // Frame 0 moved - find nearest to take its place
        const nearest = [...framePositions.entries()]
          .filter(([id]) => id !== dragState.activeId)
          .sort((a, b) => a[1] - b[1])[0];
        if (nearest) updatedMap.set(nearest[0], 0);
        updatedMap.set(dragState.activeId, validFrame);
      } else {
        updatedMap.set(dragState.activeId, validFrame);
      }
    } else {
      // For Command+drag or Option+drag...
      // NEW: guarantee that a frame always occupies position 0 after a Cmd-drag operation
      const hasFrameZero = Array.from(updatedMap.values()).some(v => v === 0);
      if (!hasFrameZero) {
        const nearest = [...updatedMap.entries()]
          .filter(([id]) => id !== dragState.activeId)
          .sort((a, b) => a[1] - b[1])[0];
        if (nearest) {
          updatedMap.set(nearest[0], 0);
        }
      }
    }

    // Drag logging (end)
    if (wasModifier) {
      log('TimelineModifierDrag', 'end', {
        id: dragState.activeId,
        originalPos,
        finalPos: validFrame,
        cmd: dragState.isCommandPressed,
        opt: dragState.isOptionPressed,
      });
    } else {
      log('TimelineNormalDrag', 'end', {
        id: dragState.activeId,
        originalPos,
        finalPos: validFrame,
      });
    }

    setFramePositions(updatedMap);

    // Update order
    const newOrder = [...images]
      .sort((a, b) => {
        const fa = updatedMap.get(a.shotImageEntryId) ?? 0;
        const fb = updatedMap.get(b.shotImageEntryId) ?? 0;
        return fa - fb;
      })
      .map(img => img.shotImageEntryId);

    onImageReorder(newOrder);

    // Store mouse up time to prevent phantom restarts
    const now = Date.now();
    dragRefsRef.current.lastMouseUpTime = now;
    dragRefsRef.current.isBlocked = true;
    
    // Unblock after a delay to prevent rapid-fire phantom drags
    setTimeout(() => {
      dragRefsRef.current.isBlocked = false;
      log('TimelineDragDebug', 'unblocked', {});
    }, 300);
    
    log('TimelineDragDebug', 'mouseup', {
      id: dragState.activeId,
      timestamp: e.timeStamp,
      nowTime: now,
      finalPos: validFrame,
    });

    // Reset drag state
    setDragState({
      isDragging: false,
      activeId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      originalFramePos: 0,
      isCommandPressed: false,
      isOptionPressed: false,
      leftGap: 0,
      rightGap: 0,
    });
  }, [dragState, framePositions, fullMin, fullRange, images, onImageReorder, contextFrames]);

  // Calculate current drag offset and target frame
  const dragOffset = dragState.isDragging 
    ? { x: dragState.currentX - dragState.startX, y: 0 }
    : null;
  
  const isModifierDrag = dragState.isCommandPressed || dragState.isOptionPressed;

  const currentDragFrame = dragState.isDragging && dragState.activeId
    ? (() => {
        const containerWidth = 1000; // This will need to be passed from the component
        const dragOffsetX = dragState.currentX - dragState.startX;
        const originalPixelPos = ((dragState.originalFramePos - fullMin) / fullRange) * containerWidth;
        const targetPixelPos = originalPixelPos + dragOffsetX;
        let targetFrame = Math.max(0, pixelToFrame(targetPixelPos, containerWidth, fullMin, fullRange));
        
        // When using modifiers, we don't snap to items for swapping.
        if (isModifierDrag) {
          // Skip early gap-validation – the push/pull algorithm that follows will
          // relocate neighbouring frames and enforce min/max gaps. Early
          // validation here incorrectly rejects moves (diffFrames = 0) because it
          // checks the unsynchronised layout where only the dragged frame moves.

          return targetFrame;
        }

        // Normal drag: snap to the closest gap-safe frame.
        return findClosestValidPosition(targetFrame, dragState.activeId, framePositions, contextFrames);
      })()
    : null;

  // Identify swap target. This should ONLY happen on a normal drag.
  const swapTargetId = !isModifierDrag && currentDragFrame !== null && dragState.activeId
    ? [...framePositions.entries()].find(
        ([id, pos]) => id !== dragState.activeId && pos === currentDragFrame
      )?.[0] ?? null
    : null;

  // Calculate drag distances for display
  const dragDistances = currentDragFrame !== null && dragState.activeId
    ? (() => {
        const originalPos = framePositions.get(dragState.activeId) ?? 0;
        const testMap = new Map(framePositions);
        testMap.set(dragState.activeId, currentDragFrame);

        // If we're moving frame 0, simulate the reassignment
        if (originalPos === 0 && currentDragFrame !== 0) {
          const nearest = [...testMap.entries()]
            .filter(([id]) => id !== dragState.activeId)
            .sort((a, b) => a[1] - b[1])[0];
          if (nearest) {
            testMap.set(nearest[0], 0);
          }
        }

        // Now calculate distances based on the simulated positions
        const others = [...testMap.entries()]
          .filter(([id]) => id !== dragState.activeId)
          .map(([_, pos]) => pos)
          .sort((a, b) => a - b);

        let prev: number | undefined;
        let next: number | undefined;
        others.forEach(pos => {
          if (pos < currentDragFrame) prev = pos;
          if (pos > currentDragFrame && next === undefined) next = pos;
        });

        return {
          distanceToPrev: prev !== undefined ? currentDragFrame - prev : undefined,
          distanceToNext: next !== undefined ? next - currentDragFrame : undefined,
        };
      })()
    : null;

  // Create dynamic positions including current drag position
  const dynamicPositions = useCallback(() => {
    if (!dragState.isDragging || !dragState.activeId || currentDragFrame === null) {
      return framePositions;
    }

    const newPositions = new Map(framePositions);
    const originalPos = framePositions.get(dragState.activeId) ?? 0;
    const frameDiff = currentDragFrame - originalPos; // raw cursor diff

    // Modifier-driven push logic ------------------------------------
    if ((dragState.isCommandPressed || dragState.isOptionPressed) && frameDiff !== 0) {
      // 1. Tentatively move dragged item
      newPositions.set(dragState.activeId, currentDragFrame);

      // 2. Ensure something occupies frame 0 if the first frame moves away
      if (originalPos === 0 && currentDragFrame !== 0) {
        const nearest = [...newPositions.entries()]
          .filter(([id]) => id !== dragState.activeId)
          .sort((a, b) => a[1] - b[1])[0];
        if (nearest) newPositions.set(nearest[0], 0);
      }

      // 3. Sort for deterministic order
      const sortedEntries = [...newPositions.entries()].sort((a, b) => a[1] - b[1]);
      const draggedIdx = sortedEntries.findIndex(([id]) => id === dragState.activeId);
      const maxGap = calculateMaxGap(contextFrames);
      const minGap = 1;  // Minimum allowed gap between frames

      // Helper: clamp value between min and max
      const clampValue = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(value, hi));

      // ---- COMMAND: Push/Pull frames to the right ----
      if (dragState.isCommandPressed && draggedIdx !== -1) {
        const isMovingRight = frameDiff > 0;
        const isMovingLeft = frameDiff < 0;
        
        if (isMovingRight) {
          // Moving right: PUSH frames to the right
          let lastPos = currentDragFrame;
          for (let i = draggedIdx + 1; i < sortedEntries.length; i++) {
            const [id, curPos] = sortedEntries[i];
            let newPos = curPos + frameDiff;
            
            const minPos = lastPos + minGap;
            const maxPos = lastPos + maxGap;
            newPos = clampValue(newPos, minPos, maxPos);

            newPositions.set(id, newPos);
            lastPos = newPos;
          }
        } else if (isMovingLeft) {
          // Moving left: PULL frames to the right (towards dragged item)
          let lastPos = currentDragFrame;
          for (let i = draggedIdx + 1; i < sortedEntries.length; i++) {
            const [id, curPos] = sortedEntries[i];
            // Pull them closer, but respect minimum gap
            let newPos = curPos + frameDiff;
            
            const minPos = lastPos + minGap;
            const maxPos = lastPos + maxGap;
            newPos = clampValue(newPos, minPos, maxPos);

            newPositions.set(id, newPos);
            lastPos = newPos;
          }
        }
      }

      // ---- OPTION: Push/Pull frames to the left ----
      if (dragState.isOptionPressed && draggedIdx !== -1) {
        const isMovingRight = frameDiff > 0;
        const isMovingLeft = frameDiff < 0;
        
        if (isMovingLeft) {
          // Moving left: PUSH frames to the left
          let nextPos = currentDragFrame;
          for (let i = draggedIdx - 1; i >= 0; i--) {
            const [id, curPos] = sortedEntries[i];
            if (curPos === 0 && id !== dragState.activeId) break; // keep frame 0 pinned

            let newPos = curPos + frameDiff;
            const maxPos = nextPos - minGap;
            const minPos = clampValue(nextPos - maxGap, 0, maxPos);
            newPos = clampValue(newPos, minPos, maxPos);

            newPositions.set(id, newPos);
            nextPos = newPos;
          }
        } else if (isMovingRight) {
          // Moving right: PULL frames to the left (towards dragged item)
          let nextPos = currentDragFrame;
          for (let i = draggedIdx - 1; i >= 0; i--) {
            const [id, curPos] = sortedEntries[i];
            if (curPos === 0 && id !== dragState.activeId) break; // keep frame 0 pinned

            // Pull them closer, but respect minimum gap
            let newPos = curPos + frameDiff;
            const maxPos = nextPos - minGap;
            const minPos = clampValue(nextPos - maxGap, 0, maxPos);
            newPos = clampValue(newPos, minPos, maxPos);

            newPositions.set(id, newPos);
            nextPos = newPos;
          }
        }
      }

      // 4. Post-push correction to ensure original gaps are preserved
      const updated = [...newPositions.entries()].sort((a, b) => a[1] - b[1]);
      const idx = updated.findIndex(([id]) => id === dragState.activeId);
      if (idx !== -1) {
        const draggedPosNow = updated[idx][1];
        // Left gap preserve
        if (idx > 0) {
          const prevPos = updated[idx - 1][1];
          if (draggedPosNow - prevPos < dragState.leftGap) {
            newPositions.set(dragState.activeId, prevPos + dragState.leftGap);
          }
        }
        // Right gap preserve
        if (idx < updated.length - 1) {
          const nextPos = updated[idx + 1][1];
          if (nextPos - draggedPosNow < dragState.rightGap) {
            newPositions.set(dragState.activeId, nextPos - dragState.rightGap);
          }
        }
      }

      // 5. Dual-modifier: final global clamp
      if (dragState.isCommandPressed && dragState.isOptionPressed) {
        const adjusted = findClosestValidPosition(newPositions.get(dragState.activeId) ?? currentDragFrame, dragState.activeId, framePositions, contextFrames);
        newPositions.set(dragState.activeId, adjusted);
      }
    } else {
      // Plain drag – use snapping
      newPositions.set(dragState.activeId, currentDragFrame);
    }

    // Final safety: shrink any oversized gaps that may still exist (rare off-by-one
    // cases when minGap offset pushes later frames too far).
    return shrinkOversizedGaps(newPositions, contextFrames);
  }, [framePositions, dragState.isDragging, dragState.activeId, dragState.isCommandPressed, dragState.isOptionPressed, dragState.leftGap, dragState.rightGap, currentDragFrame, contextFrames]);

  return {
    dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    dragDistances,
    dynamicPositions,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}; 