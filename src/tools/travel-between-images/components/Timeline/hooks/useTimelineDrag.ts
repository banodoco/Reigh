import { useState, useEffect, useCallback, useRef } from "react";
import { GenerationRow } from "@/types/shots";
import { 
  calculateMaxGap, 
  findClosestValidPosition, 
  pixelToFrame,
  clamp,
  shrinkOversizedGaps,
  expandUndersizedGaps,
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
  });

  const dragRefsRef = useRef<DragRefs>({
    lastMouseUpTime: 0,
    isBlocked: false,
  });

  // Calculate target frame from mouse position
  const calculateTargetFrame = useCallback((clientX: number): number => {
    const containerWidth = 1000; // Fixed width for calculations
    const dragOffsetX = clientX - dragState.startX;
    const originalPixelPos = ((dragState.originalFramePos - fullMin) / fullRange) * containerWidth;
    const targetPixelPos = originalPixelPos + dragOffsetX;
    return Math.max(0, pixelToFrame(targetPixelPos, containerWidth, fullMin, fullRange));
  }, [dragState.startX, dragState.originalFramePos, fullMin, fullRange]);

  // Apply drag behavior based on modifier keys
  const calculateFinalPosition = useCallback((targetFrame: number): number => {
    if (!dragState.activeId) return targetFrame;

    const isModifierDrag = dragState.isCommandPressed || dragState.isOptionPressed;
    
    if (!isModifierDrag) {
      // Normal drag: snap to valid position considering gaps
      return findClosestValidPosition(targetFrame, dragState.activeId, framePositions, contextFrames);
    }

    // Modifier drag: allow free positioning, gaps will be enforced later
    return targetFrame;
  }, [dragState.activeId, dragState.isCommandPressed, dragState.isOptionPressed, framePositions, contextFrames]);

  // Calculate positions during drag for preview
  const calculateDragPreview = useCallback((): Map<string, number> => {
    if (!dragState.isDragging || !dragState.activeId) {
      return framePositions;
    }

    const targetFrame = calculateTargetFrame(dragState.currentX);
    const finalPosition = calculateFinalPosition(targetFrame);
    
    const newPositions = new Map(framePositions);
    const originalPos = framePositions.get(dragState.activeId) ?? 0;
    
    // Handle normal drag swapping
    if (!dragState.isCommandPressed && !dragState.isOptionPressed) {
      const swapTarget = [...framePositions.entries()].find(
        ([id, pos]) => id !== dragState.activeId && pos === finalPosition
      );
      
      if (swapTarget) {
        // Swap positions
        newPositions.set(swapTarget[0], originalPos);
        newPositions.set(dragState.activeId, finalPosition);
      } else {
        // Handle frame 0 reassignment
        if (originalPos === 0 && finalPosition !== 0) {
          const nearest = [...framePositions.entries()]
            .filter(([id]) => id !== dragState.activeId)
            .sort((a, b) => a[1] - b[1])[0];
          if (nearest) {
            newPositions.set(nearest[0], 0);
          }
        }
        newPositions.set(dragState.activeId, finalPosition);
      }
    } else {
      // Modifier drag: simple positioning
      newPositions.set(dragState.activeId, finalPosition);
      
      // Ensure frame 0 is always occupied
      if (originalPos === 0 && finalPosition !== 0) {
        const hasFrameZero = Array.from(newPositions.values()).includes(0);
        if (!hasFrameZero) {
          const nearest = [...newPositions.entries()]
            .filter(([id]) => id !== dragState.activeId)
            .sort((a, b) => a[1] - b[1])[0];
          if (nearest) {
            newPositions.set(nearest[0], 0);
          }
        }
      }
    }

    // Apply gap enforcement based on modifier key used
    if (dragState.isCommandPressed && !dragState.isOptionPressed) {
      // Command key: compress gaps (push right)
      return shrinkOversizedGaps(newPositions, contextFrames);
    } else if (dragState.isOptionPressed && !dragState.isCommandPressed) {
      // Option key: expand gaps (pull left)
      const dragDirection = finalPosition - dragState.originalFramePos;
      if (dragDirection < 0) {
        // Only expand when pulling left
        return expandUndersizedGaps(newPositions, contextFrames, 15, dragState.activeId);
      } else {
        // If dragging right with Option, use normal shrink
        return shrinkOversizedGaps(newPositions, contextFrames);
      }
    } else {
      // Both keys or neither: default behavior
      return shrinkOversizedGaps(newPositions, contextFrames);
    }
  }, [
    dragState.isDragging,
    dragState.activeId,
    dragState.currentX,
    dragState.isCommandPressed,
    dragState.isOptionPressed,
    framePositions,
    contextFrames,
    calculateTargetFrame,
    calculateFinalPosition,
  ]);

  const handleMouseDown = useCallback((e: React.MouseEvent, imageId: string, containerRef: React.RefObject<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    // Prevent phantom drags
    const now = Date.now();
    const timeSinceLastUp = now - dragRefsRef.current.lastMouseUpTime;
    
    log('TimelineDragDebug', 'mousedown', {
      id: imageId,
      buttons: e.buttons,
      isDragging: dragState.isDragging,
      timeSinceLastUp,
      timestamp: e.timeStamp,
      isBlocked: dragRefsRef.current.isBlocked,
    });

    if (e.buttons !== 1 || dragState.isDragging || dragRefsRef.current.isBlocked || timeSinceLastUp < 200) {
      return;
    }

    const framePos = framePositions.get(imageId) ?? 0;

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
    });

    log('TimelineModifierDrag', 'start', {
      id: imageId,
      framePos,
      cmd: e.metaKey,
      opt: e.altKey,
      mode: e.metaKey && !e.altKey ? 'compress' : e.altKey && !e.metaKey ? 'expand' : 'normal',
    });
  }, [framePositions, dragState.isDragging]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging) return;
    
    setDragState(prev => ({
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
      isCommandPressed: e.metaKey,
      isOptionPressed: e.altKey,
    }));

    if (dragState.activeId) {
      const targetFrame = calculateTargetFrame(e.clientX);
      const finalPosition = calculateFinalPosition(targetFrame);
      
      log('TimelineModifierDrag', 'move', {
        id: dragState.activeId,
        deltaX: e.clientX - dragState.startX,
        frame: finalPosition,
        diffFrames: finalPosition - dragState.originalFramePos,
        cmd: e.metaKey,
        opt: e.altKey,
        mode: e.metaKey && !e.altKey ? 'compress' : e.altKey && !e.metaKey ? 'expand' : 'normal',
      });
    }
  }, [dragState.isDragging, dragState.activeId, dragState.originalFramePos, dragState.startX, calculateTargetFrame, calculateFinalPosition]);

  const handleMouseUp = useCallback((e: MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => {
    if (!dragState.isDragging || !dragState.activeId) return;

    // Get final positions from preview calculation
    const finalPositions = calculateDragPreview();
    const finalPos = finalPositions.get(dragState.activeId) ?? dragState.originalFramePos;

    log('TimelineModifierDrag', 'end', {
      id: dragState.activeId,
      originalPos: dragState.originalFramePos,
      finalPos,
      cmd: dragState.isCommandPressed,
      opt: dragState.isOptionPressed,
      mode: dragState.isCommandPressed && !dragState.isOptionPressed ? 'compress' : 
            dragState.isOptionPressed && !dragState.isCommandPressed ? 'expand' : 'normal',
    });

    // Apply final positions
    setFramePositions(finalPositions);

    // Update image order
    const newOrder = [...images]
      .sort((a, b) => {
        const fa = finalPositions.get(a.shotImageEntryId) ?? 0;
        const fb = finalPositions.get(b.shotImageEntryId) ?? 0;
        return fa - fb;
      })
      .map(img => img.shotImageEntryId);

    onImageReorder(newOrder);

    // Generate comprehensive drag summary
    const mode = dragState.isCommandPressed && !dragState.isOptionPressed ? 'compress' : 
                 dragState.isOptionPressed && !dragState.isCommandPressed ? 'expand' : 'normal';
    
    const originalOrder = [...images]
      .sort((a, b) => {
        const fa = framePositions.get(a.shotImageEntryId) ?? 0;
        const fb = framePositions.get(b.shotImageEntryId) ?? 0;
        return fa - fb;
      })
      .map(img => img.shotImageEntryId);

    const positionChanges = [...finalPositions.entries()]
      .filter(([id, newPos]) => {
        const oldPos = framePositions.get(id) ?? 0;
        return oldPos !== newPos;
      })
      .map(([id, newPos]) => {
        const oldPos = framePositions.get(id) ?? 0;
        const imageIndex = images.findIndex(img => img.shotImageEntryId === id);
        return {
          id: id.slice(-8), // last 8 chars for brevity
          imageIdx: imageIndex,
          oldPos,
          newPos,
          delta: newPos - oldPos
        };
      });

    const orderChanged = JSON.stringify(originalOrder) !== JSON.stringify(newOrder);
    const dragDirection = finalPos - dragState.originalFramePos;
    const dragDistance = Math.abs(dragDirection);

    log('DragSummary', 'Drag operation completed', {
      draggedImage: {
        id: dragState.activeId?.slice(-8),
        index: images.findIndex(img => img.shotImageEntryId === dragState.activeId),
        moved: `${dragState.originalFramePos} → ${finalPos} (${dragDirection > 0 ? '+' : ''}${dragDirection})`
      },
      mode,
      modifiers: { cmd: dragState.isCommandPressed, opt: dragState.isOptionPressed },
      dragDistance,
      totalChanges: positionChanges.length,
      orderChanged,
      positionChanges: positionChanges.length > 0 ? positionChanges : 'none',
      violations: positionChanges.some(change => Math.abs(change.delta) > calculateMaxGap(contextFrames)) ? 'POTENTIAL_GAP_VIOLATION' : 'none'
    });

    // Prevent phantom drags
    const now = Date.now();
    dragRefsRef.current.lastMouseUpTime = now;
    dragRefsRef.current.isBlocked = true;
    
    setTimeout(() => {
      dragRefsRef.current.isBlocked = false;
      log('TimelineDragDebug', 'unblocked', {});
    }, 300);
    
    log('TimelineDragDebug', 'mouseup', {
      id: dragState.activeId,
      timestamp: e.timeStamp,
      nowTime: now,
      finalPos,
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
    });
  }, [dragState, images, onImageReorder, calculateDragPreview]);

  // Calculate current values for rendering
  const dragOffset = dragState.isDragging 
    ? { x: dragState.currentX - dragState.startX, y: 0 }
    : null;
  
  const isModifierDrag = dragState.isCommandPressed || dragState.isOptionPressed;
  
  const currentDragFrame = dragState.isDragging && dragState.activeId
    ? calculateFinalPosition(calculateTargetFrame(dragState.currentX))
    : null;

  const swapTargetId = !isModifierDrag && currentDragFrame !== null && dragState.activeId
    ? [...framePositions.entries()].find(
        ([id, pos]) => id !== dragState.activeId && pos === currentDragFrame
      )?.[0] ?? null
    : null;

  const dragDistances = currentDragFrame !== null && dragState.activeId
    ? (() => {
        const preview = calculateDragPreview();
        const others = [...preview.entries()]
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

  return {
    dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    dragDistances,
    dynamicPositions: calculateDragPreview,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}; 