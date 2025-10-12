import { useState, useEffect, useCallback, useRef } from "react";
import { GenerationRow } from "@/types/shots";
import {
  calculateMaxGap,
  findClosestValidPosition,
  pixelToFrame,
  applyFluidTimeline,
} from "../utils/timeline-utils";
import { log } from "@/shared/lib/logger";
import { TIMELINE_PADDING_OFFSET } from "../constants";

interface DragState {
  isDragging: boolean;
  activeId: string | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  originalFramePos: number;
  dragSessionId?: string;
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
  fullMax: number;
  fullRange: number;
  containerRect: DOMRect | null;
  setIsDragInProgress?: (isDragging: boolean) => void;
}

export const useTimelineDrag = ({
  framePositions,
  setFramePositions,
  images,
  onImageReorder,
  contextFrames,
  fullMin,
  fullMax,
  fullRange,
  containerRect,
  setIsDragInProgress,
}: UseTimelineDragProps) => {
  
  // Debug: Log if setIsDragInProgress is available
  console.log('[TimelineMovementDebug] 🔧 useTimelineDrag initialized with setIsDragInProgress:', !!setIsDragInProgress);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    activeId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    originalFramePos: 0,
  });

  const dragRefsRef = useRef<DragRefs>({
    lastMouseUpTime: 0,
    isBlocked: false,
  });

  // Ref to store the most current mouse position (not dependent on React state)
  const currentMousePosRef = useRef<{ x: number; y: number } | null>(null);

  // Calculate target frame from mouse position using actual DOM positions
  const calculateTargetFrame = useCallback((clientX: number, containerRect: DOMRect | null): number => {
    if (!containerRect) return dragState.originalFramePos; // Fallback

    // GROUND TRUTH: Use actual container dimensions
    const containerWidth = containerRect.width;
    const containerLeft = containerRect.left;
    // Use the same padding offset as other timeline components for consistency
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);

    // Calculate where mouse is relative to container (accounting for padding)
    const relativeMouseX = clientX - containerLeft - TIMELINE_PADDING_OFFSET; // Subtract left padding
    const dragOffsetX = clientX - dragState.startX;

    // Find the actual position of the dragged item in the container
    const originalRelativePos = ((dragState.originalFramePos - fullMin) / fullRange) * effectiveWidth;

    // Allow dragging beyond right boundary to expand timeline, but clamp left boundary
    const targetRelativePos = Math.max(0, relativeMouseX);

    const baseCalculatedFrame = Math.max(0, pixelToFrame(targetRelativePos, effectiveWidth, fullMin, fullRange));
    const isExpanding = targetRelativePos > effectiveWidth;
    
    const finalFrame = isExpanding ? 
      Math.round(baseCalculatedFrame + ((targetRelativePos - effectiveWidth) / effectiveWidth) * fullRange) :
      baseCalculatedFrame;
      
    console.log('[TimelineExpansion] 🎯 DOM-BASED TARGET CALCULATION:', {
      clientX,
      containerLeft,
      relativeMouseX,
      dragOffsetX,
      originalFramePos: dragState.originalFramePos,
      fullMin,
      fullRange,
      containerWidth,
      effectiveWidth,
      paddingOffset: TIMELINE_PADDING_OFFSET,
      originalRelativePos,
      targetRelativePos,
      baseCalculatedFrame,
      isExpanding,
      overshoot: isExpanding ? targetRelativePos - effectiveWidth : 0,
      finalFrame,
      timestamp: new Date().toISOString()
    });

    // Calculate frame position, allowing expansion beyond current timeline bounds
    const calculatedFrame = Math.max(0, pixelToFrame(targetRelativePos, effectiveWidth, fullMin, fullRange));
    
    // If dragging beyond right edge, extend the timeline
    if (targetRelativePos > effectiveWidth) {
      // Calculate how far beyond the right edge we are
      const overshoot = targetRelativePos - effectiveWidth;
      const overshootFrames = (overshoot / effectiveWidth) * fullRange;
      // Round to whole frame numbers to avoid decimal distance displays
      return Math.round(calculatedFrame + overshootFrames);
    }
    
    return calculatedFrame;
  }, [dragState.startX, dragState.originalFramePos, fullMin, fullRange]);

  // Apply normal drag behavior - for now, allow free positioning to enable fluid timeline
  const calculateFinalPosition = useCallback((targetFrame: number): number => {
    if (!dragState.activeId) return targetFrame;

    // For fluid timeline behavior, we want to allow the target position
    // The fluid timeline logic will handle constraints
    return targetFrame;
  }, [dragState.activeId]);

  // Calculate positions during drag for preview
  const calculateDragPreview = useCallback((): Map<string, number> => {
    if (!dragState.isDragging || !dragState.activeId || !currentMousePosRef.current) {
      return framePositions;
    }

    const targetFrame = calculateTargetFrame(currentMousePosRef.current.x, containerRect);
    const finalPosition = calculateFinalPosition(targetFrame);

    console.log('[FluidTimelineDebug] 🚀 CALCULATE DRAG PREVIEW - Starting preview calculation:', {
      itemId: dragState.activeId.substring(0, 8),
      targetFrame,
      finalPosition,
      originalPos: framePositions.get(dragState.activeId) ?? 0,
      contextFrames,
      coordinate_source: 'currentMousePosRef.current.x',
      timestamp: new Date().toISOString()
    });

    const newPositions = new Map(framePositions);
    const originalPos = framePositions.get(dragState.activeId) ?? 0;

    // Handle normal drag swapping
    const swapTarget = [...framePositions.entries()].find(
      ([id, pos]) => id !== dragState.activeId && pos === finalPosition
    );

    if (swapTarget) {
      console.log('[FluidTimelineDebug] 🔄 SWAP DETECTED - Item would swap with:', {
        itemId: dragState.activeId.substring(0, 8),
        swapWithId: swapTarget[0].substring(0, 8),
        swapWithPos: swapTarget[1],
        newPos: finalPosition
      });

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
          console.log('[FluidTimelineDebug] 📍 FRAME 0 REASSIGNMENT - Moving frame 0 to:', {
            itemId: dragState.activeId.substring(0, 8),
            newFrame0Holder: nearest[0].substring(0, 8)
          });
          newPositions.set(nearest[0], 0);
        }
      }
      newPositions.set(dragState.activeId, finalPosition);
    }

    // Apply fluid timeline behavior (new behavior)
    console.log('[FluidTimelineDebug] 🌊 APPLYING FLUID TIMELINE - Before fluid timeline:', {
      itemId: dragState.activeId.substring(0, 8),
      positions: Array.from(newPositions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        pos
      }))
    });

    const result = applyFluidTimeline(newPositions, dragState.activeId, finalPosition, contextFrames, undefined, fullMin, fullMax);

    console.log('[FluidTimelineDebug] ✅ FLUID TIMELINE RESULT - After fluid timeline:', {
      itemId: dragState.activeId.substring(0, 8),
      originalPos,
      targetFrame,
      finalPosition,
      resultPositions: Array.from(result.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        pos
      })),
      positionsChanged: Array.from(result.entries())
        .filter(([id, pos]) => pos !== (framePositions.get(id) ?? 0))
        .map(([id, pos]) => ({
          id: id.substring(0, 8),
          oldPos: framePositions.get(id) ?? 0,
          newPos: pos,
          delta: pos - (framePositions.get(id) ?? 0)
        })),
      totalItemsShifted: Array.from(result.entries())
        .filter(([id, pos]) => pos !== (framePositions.get(id) ?? 0) && id !== dragState.activeId)
        .length
    });

    return result;
  }, [
    dragState.isDragging,
    dragState.activeId,
    dragState.currentX,
    framePositions,
    contextFrames,
    calculateTargetFrame,
    calculateFinalPosition,
  ]);

  // Calculate positions with a specific mouse position (for final drop calculation)
  const calculateDragPreviewWithPosition = useCallback((clientX: number): Map<string, number> => {
    if (!dragState.isDragging || !dragState.activeId) {
      return framePositions;
    }

    const targetFrame = calculateTargetFrame(clientX, containerRect);
    const finalPosition = calculateFinalPosition(targetFrame);

    console.log('[GroundTruthDrop] 🎯 DOM-BASED FINAL DROP CALCULATION:', {
      clientX,
      containerRect: containerRect ? {
        left: containerRect.left,
        width: containerRect.width
      } : null,
      targetFrame,
      finalPosition,
      originalPos: framePositions.get(dragState.activeId) ?? 0,
      itemId: dragState.activeId.substring(0, 8),
      approach: 'DOM_GROUND_TRUTH_WITH_CURRENT_MOUSE_REF',
      coordinate_source: 'currentMousePosRef.current.x',
      timestamp: new Date().toISOString()
    });

    const newPositions = new Map(framePositions);
    const originalPos = framePositions.get(dragState.activeId) ?? 0;

    // Handle normal drag swapping
    const swapTarget = [...framePositions.entries()].find(
      ([id, pos]) => id !== dragState.activeId && pos === finalPosition
    );

    if (swapTarget) {
      console.log('[FinalDropDebug] 🔄 SWAP DETECTED - Item would swap with:', {
        itemId: dragState.activeId.substring(0, 8),
        swapWithId: swapTarget[0].substring(0, 8),
        swapWithPos: swapTarget[1],
        newPos: finalPosition
      });

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
          console.log('[FinalDropDebug] 📍 FRAME 0 REASSIGNMENT - Moving frame 0 to:', {
            itemId: dragState.activeId.substring(0, 8),
            newFrame0Holder: nearest[0].substring(0, 8)
          });
          newPositions.set(nearest[0], 0);
        }
      }
      newPositions.set(dragState.activeId, finalPosition);
    }

    // Apply fluid timeline behavior (new behavior)
    console.log('[FinalDropDebug] 🌊 APPLYING FLUID TIMELINE - Before fluid timeline:', {
      itemId: dragState.activeId.substring(0, 8),
      positions: Array.from(newPositions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        pos
      }))
    });

    const result = applyFluidTimeline(newPositions, dragState.activeId, finalPosition, contextFrames, undefined, fullMin, fullMax);

    console.log('[FinalDropDebug] ✅ FINAL DROP RESULT - After fluid timeline:', {
      itemId: dragState.activeId.substring(0, 8),
      originalPos,
      targetFrame,
      finalPosition,
      resultPositions: Array.from(result.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        pos
      })),
      positionsChanged: Array.from(result.entries())
        .filter(([id, pos]) => pos !== (framePositions.get(id) ?? 0))
        .map(([id, pos]) => ({
          id: id.substring(0, 8),
          oldPos: framePositions.get(id) ?? 0,
          newPos: pos,
          delta: pos - (framePositions.get(id) ?? 0)
        })),
      totalItemsShifted: Array.from(result.entries())
        .filter(([id, pos]) => pos !== (framePositions.get(id) ?? 0) && id !== dragState.activeId)
        .length
    });

    return result;
  }, [
    dragState.isDragging,
    dragState.activeId,
    framePositions,
    contextFrames,
    calculateTargetFrame,
    calculateFinalPosition,
  ]);

  const handleMouseDown = useCallback((e: React.MouseEvent, imageId: string, containerRef: React.RefObject<HTMLDivElement>) => {
    // [NonDraggableDebug] Log EVERY mousedown attempt to track non-draggable items
    console.log('[NonDraggableDebug] 🖱️ MOUSEDOWN EVENT RECEIVED:', {
      itemId: imageId.substring(0, 8),
      eventType: e.type,
      buttons: e.buttons,
      button: e.button,
      clientX: e.clientX,
      clientY: e.clientY,
      target: (e.target as HTMLElement)?.tagName,
      currentTarget: (e.currentTarget as HTMLElement)?.tagName,
      timestamp: Date.now()
    });

    // Don't preventDefault immediately - allow double-click to work
    // We'll prevent text selection via CSS user-select: none instead
    const container = containerRef.current;
    if (!container) {
      console.log('[NonDraggableDebug] ❌ NO CONTAINER REF:', {
        itemId: imageId.substring(0, 8),
        containerRefExists: !!containerRef,
        containerRefCurrent: !!containerRef.current
      });
      return;
    }

    // Ensure we start with a fresh, accurate mouse position for this drag
    // This prevents reusing a stale value from a previous drag session
    currentMousePosRef.current = { x: e.clientX, y: e.clientY };

    // Prevent phantom drags
    const now = Date.now();
    const timeSinceLastUp = now - dragRefsRef.current.lastMouseUpTime;

    // 🎯 DRAG TRACKING: Log every drag start with common identifier
    const dragSessionId = `drag_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    (window as any).__CURRENT_DRAG_SESSION__ = dragSessionId;
    console.log(`[TimelineDragFlow] [DRAG_START] 🖱️ Session: ${dragSessionId} | Item ${imageId.substring(0, 8)} drag initiated at frame ${framePositions.get(imageId) ?? 0}`);
    
    console.log('[TimelineDragFix] 🎯 DRAG START DETECTED:', {
      itemId: imageId.substring(0, 8),
      buttons: e.buttons,
      isDragging: dragState.isDragging,
      timeSinceLastUp,
      timestamp: e.timeStamp,
      isBlocked: dragRefsRef.current.isBlocked,
      clientX: e.clientX,
      clientY: e.clientY,
      framePosition: framePositions.get(imageId) ?? 0,
      contextFrames,
      maxGap: calculateMaxGap(contextFrames),
      framePositionsCount: framePositions.size,
      framePositions: Array.from(framePositions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        pos
      })),
      willStartDrag: e.buttons === 1 && !dragState.isDragging && !dragRefsRef.current.isBlocked && timeSinceLastUp >= 50
    });

    log('TimelineDragDebug', 'mousedown', {
      id: imageId,
      buttons: e.buttons,
      isDragging: dragState.isDragging,
      timeSinceLastUp,
      timestamp: e.timeStamp,
      isBlocked: dragRefsRef.current.isBlocked,
    });

    if (e.buttons !== 1 || dragState.isDragging || dragRefsRef.current.isBlocked || timeSinceLastUp < 50) {
      console.log('[NonDraggableDebug] ❌ DRAG BLOCKED - Conditions not met:', {
        itemId: imageId.substring(0, 8),
        reasons: {
          wrongButton: e.buttons !== 1,
          alreadyDragging: dragState.isDragging,
          isBlocked: dragRefsRef.current.isBlocked,
          tooSoon: timeSinceLastUp < 50
        },
        details: {
          buttons: e.buttons,
          isDragging: dragState.isDragging,
          isBlocked: dragRefsRef.current.isBlocked,
          timeSinceLastUp,
          lastMouseUpTime: dragRefsRef.current.lastMouseUpTime
        }
      });
      console.log('[DragLifecycle] ❌ DRAG BLOCKED - Drag not allowed:', {
        itemId: imageId.substring(0, 8),
        buttons: e.buttons,
        isDragging: dragState.isDragging,
        isBlocked: dragRefsRef.current.isBlocked,
        timeSinceLastUp,
        reason: e.buttons !== 1 ? 'wrong_button' :
                dragState.isDragging ? 'already_dragging' :
                dragRefsRef.current.isBlocked ? 'blocked' : 'too_soon_after_last_drag (50ms)'
      });

      log('TimelineDragDebug', 'mousedown_blocked', {
        id: imageId,
        buttons: e.buttons,
        isDragging: dragState.isDragging,
        isBlocked: dragRefsRef.current.isBlocked,
        timeSinceLastUp,
        reason: e.buttons !== 1 ? 'wrong_button' :
                dragState.isDragging ? 'already_dragging' :
                dragRefsRef.current.isBlocked ? 'blocked' : 'too_soon_after_last_drag (50ms)'
      });
      return;
    }

    const framePos = framePositions.get(imageId) ?? 0;

    // Get adjacent items for context
    const sortedPositions = [...framePositions.entries()].sort((a, b) => a[1] - b[1]);
    const currentIndex = sortedPositions.findIndex(([id]) => id === imageId);
    const prevItem = currentIndex > 0 ? sortedPositions[currentIndex - 1] : null;
    const nextItem = currentIndex < sortedPositions.length - 1 ? sortedPositions[currentIndex + 1] : null;

    // COMPREHENSIVE DRAG START ANALYSIS - All info in one place
    console.log('[DRAG_START_ANALYSIS] 🎯 DRAG SESSION INITIALIZATION:', {
      // Item Info
      itemId: imageId.substring(0, 8),
      originalFramePos: framePos,
      startMouseX: e.clientX,
      startMouseY: e.clientY,

      // Adjacent Items Analysis
      adjacentItems: {
        prev: prevItem ? {
          id: prevItem[0].substring(0, 8),
          pos: prevItem[1],
          gap: framePos - prevItem[1]
        } : null,
        next: nextItem ? {
          id: nextItem[0].substring(0, 8),
          pos: nextItem[1],
          gap: nextItem[1] - framePos
        } : null
      },

      // Initial State
      initialDragState: {
        isDragging: true,
        activeId: imageId.substring(0, 8),
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        originalFramePos: framePos
      },

      // Context and Limits
      contextFrames,
      maxGap: calculateMaxGap(contextFrames),
      fullMin,
      fullRange,
      containerWidth: 1000,

      // Timeline Overview
      timelineItems: Array.from(framePositions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        pos
      })),

      // Timing
      timestamp: e.timeStamp,
      timestampISO: new Date().toISOString()
    });

    // CRITICAL: Set drag in progress flag to prevent query invalidation reloads
    if (setIsDragInProgress) {
      console.log('[TimelineMovementDebug] 🚀 DRAG STARTED - Setting isDragInProgress = true to prevent query reloads');
      setIsDragInProgress(true);
    }

    setDragState({
      isDragging: true,
      activeId: imageId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      originalFramePos: framePos,
      dragSessionId: dragSessionId,
    });

    log('TimelineDragDebug', 'start', {
      id: imageId,
      framePos,
    });
  }, [framePositions, dragState.isDragging, contextFrames]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging) return;

    // Update the ref with the most current mouse position (instantly available)
    currentMousePosRef.current = { x: e.clientX, y: e.clientY };

    // Only update currentX and currentY, don't modify startX or originalFramePos
    setDragState(prev => ({
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
    }));

    console.log('[TimelineDragFix] 🖱️ MOUSE MOVE DURING DRAG:', {
      itemId: dragState.activeId?.substring(0, 8),
      clientX: e.clientX,
      clientY: e.clientY,
      currentX: e.clientX,
      startX: dragState.startX,
      deltaX: e.clientX - dragState.startX,
      targetFrame: calculateTargetFrame(e.clientX, containerRect),
      timestamp: e.timeStamp
    });

    // DOM-based debugging for mouse movement
    if (containerRect) {
      console.log('[GroundTruthMouseMove] 🖱️ DOM-BASED MOUSE TRACKING:', {
        clientX: e.clientX,
        containerLeft: containerRect.left,
        relativeX: e.clientX - containerRect.left,
        approach: 'DOM_GROUND_TRUTH',
        timestamp: new Date().toISOString()
      });
    }

    if (dragState.activeId) {
      const targetFrame = calculateTargetFrame(e.clientX, containerRect);
      const finalPosition = calculateFinalPosition(targetFrame);
      const deltaX = e.clientX - dragState.startX;
      const frameDelta = finalPosition - dragState.originalFramePos;

      // COMPREHENSIVE DRAG ANALYSIS - All info in one place
      console.log('[DRAG_ANALYSIS] 🎯 DRAG OPERATION SUMMARY:', {
        // Item Info
        itemId: dragState.activeId.substring(0, 8),
        originalPos: dragState.originalFramePos,
        targetFrame,
        finalPosition,
        frameDelta,

      // Mouse Position Data
      mouse: {
        currentX: e.clientX,
        currentY: e.clientY,
        refX: currentMousePosRef.current?.x ?? e.clientX,
        startX: dragState.startX,
        startY: dragState.startY,
        deltaX,
        deltaY: e.clientY - dragState.startY,
        coordinate_source: 'currentMousePosRef.current.x (instantly available)'
      },

        // Drag State
        dragState: {
          isDragging: dragState.isDragging,
          activeId: dragState.activeId?.substring(0, 8),
          startX: dragState.startX,
          currentX: dragState.currentX,
          originalFramePos: dragState.originalFramePos
        },

        // Context
        contextFrames,
        maxGap: calculateMaxGap(contextFrames),
        fullMin,
        fullRange,

        // Calculations
        calculations: {
          targetFrame,
          finalPosition,
          wouldSnap: targetFrame !== finalPosition,
          snapAmount: finalPosition - targetFrame
        },

        // Timing
        timestamp: e.timeStamp,
        timestampISO: new Date().toISOString()
      });

      log('TimelineDragDebug', 'move', {
        id: dragState.activeId,
        deltaX: e.clientX - dragState.startX,
        frame: finalPosition,
        diffFrames: finalPosition - dragState.originalFramePos,
      });
    }
  }, [dragState.isDragging, dragState.activeId, dragState.originalFramePos, dragState.startX, dragState.currentX, calculateTargetFrame, calculateFinalPosition, contextFrames, fullMin, fullRange]);

  const handleMouseUp = useCallback((e: MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => {
    console.log('[TimelineDragFix] 🎯 MOUSE UP CALLED:', {
      isDragging: dragState.isDragging,
      activeId: dragState.activeId,
      timestamp: e.timeStamp,
      clientX: e.clientX,
      clientY: e.clientY,
      containerRef_exists: !!containerRef.current,
      setFramePositionsAvailable: typeof setFramePositions === 'function'
    });

    if (!dragState.isDragging || !dragState.activeId) {
      console.log('[TimelineDragFix] ❌ MOUSE UP - No active drag or no active ID:', {
        isDragging: dragState.isDragging,
        activeId: dragState.activeId,
        timestamp: e.timeStamp
      });
      return;
    }

    console.log('[TimelineMoveFlow] 🎯 MOUSE UP - Starting position update:', {
      itemId: dragState.activeId.substring(0, 8),
      originalPos: dragState.originalFramePos,
      timestamp: e.timeStamp,
      finalMouseX: e.clientX,
      finalMouseY: e.clientY,
      dragState_currentX: dragState.currentX,
      dragState_startX: dragState.startX
    });

    // Immediately block new drags to prevent cascading
    const now = Date.now();
    dragRefsRef.current.lastMouseUpTime = now;
    dragRefsRef.current.isBlocked = true;

    log('TimelineDragDebug', 'mouseup_start', {
      id: dragState.activeId,
      timestamp: e.timeStamp,
      isBlocked: true
    });

    console.log('[DragLifecycle] 📍 FINAL MOUSE POSITION CAPTURED:', {
      itemId: dragState.activeId.substring(0, 8),
      finalX: e.clientX,
      finalY: e.clientY,
      targetFrame: calculateTargetFrame(e.clientX, containerRect),
      timestamp: new Date().toISOString()
    });

    console.log('[MouseUpDebug] 🖱️ MOUSE UP - Calculating final drop position:', {
      e_clientX: e.clientX,
      dragState_currentX: dragState.currentX,
      dragState_startX: dragState.startX,
      dragState_originalFramePos: dragState.originalFramePos,
      timestamp: e.timeStamp,
      coordinate_mismatch: e.clientX !== dragState.currentX ? 'MISMATCH!' : 'MATCH'
    });

    // Calculate final positions using the last known drag position (for consistency)
    const finalTargetFrame = calculateTargetFrame(currentMousePosRef.current?.x ?? e.clientX, containerRect);
    console.log('[MouseUpDebug] 📊 FINAL TARGET FRAME CALCULATION:', {
      e_clientX: e.clientX,
      finalTargetFrame,
      dragState_currentX: dragState.currentX,
      dragState_startX: dragState.startX,
      expectedDelta: e.clientX - dragState.startX,
      usedDelta: dragState.currentX - dragState.startX,
      coordinate_source: 'dragState.currentX (for consistency)'
    });

    const finalPositions = calculateDragPreviewWithPosition(currentMousePosRef.current?.x ?? e.clientX);
    const finalPos = finalPositions.get(dragState.activeId) ?? dragState.originalFramePos;
    const finalDeltaX = dragState.currentX - dragState.startX;
    const finalFrameDelta = finalPos - dragState.originalFramePos;

    console.log('[MouseUpDebug] 📋 FINAL POSITIONS CALCULATED:', {
      finalTargetFrame,
      finalPos,
      finalDeltaX,
      finalFrameDelta,
      positionsCount: finalPositions.size,
      timestamp: new Date().toISOString()
    });

    // COMPREHENSIVE FINAL DROP ANALYSIS - All info in one place
    console.log('[FINAL_DROP_ANALYSIS] 🎯 FINAL DROP OPERATION SUMMARY:', {
      // Item Movement
      itemId: dragState.activeId.substring(0, 8),
      originalPos: dragState.originalFramePos,
      finalPos,
      frameDelta: finalFrameDelta,
      positionChanged: finalPos !== dragState.originalFramePos,

      // Mouse Position at Drop
      mouse: {
        dropX: e.clientX,
        dropY: e.clientY,
        usedX: dragState.currentX, // Used for calculation consistency
        startX: dragState.startX,
        startY: dragState.startY,
        totalDeltaX: finalDeltaX,
        totalDeltaY: e.clientY - dragState.startY,
        coordinate_source: 'dragState.currentX (consistent with drag preview)'
      },

      // Drag State at Completion
      dragState: {
        isDragging: dragState.isDragging,
        activeId: dragState.activeId?.substring(0, 8),
        startX: dragState.startX,
        currentX: dragState.currentX,
        originalFramePos: dragState.originalFramePos
      },

      // Frame Calculations
      calculations: {
        finalTargetFrame,
        finalPos,
        maxSingleMove: 50,
        contextFrames,
        maxGap: calculateMaxGap(contextFrames)
      },

      // Position Analysis
      positions: {
        before: Array.from(framePositions.entries()).map(([id, pos]) => ({
          id: id.substring(0, 8),
          pos
        })),
        after: Array.from(finalPositions.entries()).map(([id, pos]) => ({
          id: id.substring(0, 8),
          pos
        })),
        changes: Array.from(finalPositions.entries())
          .filter(([id, pos]) => pos !== (framePositions.get(id) ?? 0))
          .map(([id, pos]) => ({
            id: id.substring(0, 8),
            oldPos: framePositions.get(id) ?? 0,
            newPos: pos,
            delta: pos - (framePositions.get(id) ?? 0)
          }))
      },

      // Context and Limits
      limits: {
        contextFrames,
        maxGap: calculateMaxGap(contextFrames),
        fullMin,
        fullRange,
        containerWidth: 1000
      },

      // Timing
      timestamp: e.timeStamp,
      timestampISO: new Date().toISOString()
    });

    console.log('[DragLifecycle] 📊 DRAG COMPLETION - Calculating final positions:', {
      itemId: dragState.activeId.substring(0, 8),
      originalPos: dragState.originalFramePos,
      finalPos,
      positionChanged: finalPos !== dragState.originalFramePos,
      allPositions: Array.from(finalPositions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        pos
      })),
      timestamp: new Date().toISOString()
    });

    log('TimelineDragDebug', 'end', {
      id: dragState.activeId,
      originalPos: dragState.originalFramePos,
      finalPos,
    });

    // Apply final positions immediately to avoid any momentary fallback to database positions
    (async () => {
      console.log('[TimelineDragFix] 🚀 SETFRAMEPOSITIONS CALL IMMINENT - About to call setFramePositions:', {
        itemId: dragState.activeId.substring(0, 8),
        positionsCount: finalPositions.size,
        positionsToApply: Array.from(finalPositions.entries()).map(([id, pos]) => ({
          id: id.substring(0, 8),
          pos
        })),
        originalPositions: Array.from(framePositions.entries()).map(([id, pos]) => ({
          id: id.substring(0, 8),
          pos
        })),
        positionChanges: Array.from(finalPositions.entries())
          .filter(([id, newPos]) => (framePositions.get(id) ?? 0) !== newPos)
          .map(([id, newPos]) => ({
            id: id.substring(0, 8),
            oldPos: framePositions.get(id) ?? 0,
            newPos,
            delta: newPos - (framePositions.get(id) ?? 0)
          })),
        timestamp: new Date().toISOString(),
        setFramePositionsFunction: typeof setFramePositions
      });

      try {
        await setFramePositions(finalPositions);

        console.log('[TimelineDragFix] ✅ SETFRAMEPOSITIONS CALL COMPLETED SUCCESSFULLY:', {
          itemId: dragState.activeId.substring(0, 8),
          finalPositionsCount: finalPositions.size,
          timestamp: new Date().toISOString()
        });

        console.log('[TimelineDragFix] ✅ POSITIONS APPLIED - SKIPPING image order update during drag:', {
          itemId: dragState.activeId.substring(0, 8),
          finalPos,
          timestamp: new Date().toISOString(),
          reason: 'Timeline drag already set timeline_frame values - order update would overwrite them'
        });

        // 🎯 DRAG TRACKING: Log every drag completion
        console.log(`[TimelineDragFlow] [DRAG_COMPLETE] ✅ Session: ${dragState.dragSessionId || 'unknown'} | Item ${dragState.activeId.substring(0, 8)} drag completed: ${dragState.originalFramePos} → ${finalPos}`);
        (window as any).__CURRENT_DRAG_SESSION__ = null;
        
        // 🎯 DEBUG: Log all position changes to identify wrong item movements
        const allChanges = Array.from(finalPositions.entries())
          .filter(([id, newPos]) => (framePositions.get(id) ?? 0) !== newPos)
          .map(([id, newPos]) => ({
            id: id.substring(0, 8),
            oldPos: framePositions.get(id) ?? 0,
            newPos,
            isDraggedItem: id === dragState.activeId
          }));
        
        if (allChanges.length > 1) {
          console.log(`[TimelineDragFlow] [MULTI_ITEM_MOVE] ⚠️ Session: ${dragState.dragSessionId || 'unknown'} | Multiple items moving in single drag:`, allChanges);
          
          // 🚨 CONFLICT DETECTION: Check for duplicate final positions
          const finalPositionCounts = new Map<number, string[]>();
          for (const change of allChanges) {
            if (!finalPositionCounts.has(change.newPos)) {
              finalPositionCounts.set(change.newPos, []);
            }
            finalPositionCounts.get(change.newPos)!.push(change.id);
          }
          
          const finalConflicts = Array.from(finalPositionCounts.entries())
            .filter(([pos, ids]) => ids.length > 1);
            
          if (finalConflicts.length > 0) {
            console.error(`[TimelineDragFlow] [FINAL_CONFLICTS] 💥 Multiple items ended up at same positions after drag:`, 
              finalConflicts.map(([pos, ids]) => `Frame ${pos}: [${ids.join(', ')}]`));
          }
        }
        
        console.log('[DragLifecycle] 🎉 DRAG COMPLETE - All updates finished:', {
          itemId: dragState.activeId.substring(0, 8),
          finalPos,
          positionsUpdated: finalPositions.size,
          timestamp: new Date().toISOString()
        });
        
        log('TimelineDragDebug', 'drag_complete', {
          id: dragState.activeId,
          finalPos,
          orderUpdated: true
        });
      } catch (error) {
        console.error('[TimelineMoveFlow] ❌ ERROR APPLYING POSITIONS:', {
          itemId: dragState.activeId.substring(0, 8),
          error: error instanceof Error ? error.message : error,
          finalPos,
          stackTrace: error instanceof Error ? error.stack : undefined
        });
        console.error('[TimelineDragDebug] Error applying drag results:', error);
      }
    })();

    // Generate comprehensive drag summary with unique tag [TimelineItemMoveSummary]
    const mode = 'normal';
    
    const originalOrder = [...images]
      .sort((a, b) => {
        const fa = framePositions.get(a.shotImageEntryId) ?? 0;
        const fb = framePositions.get(b.shotImageEntryId) ?? 0;
        return fa - fb;
      })
      .map(img => img.shotImageEntryId);

    const finalOrder = [...images]
      .sort((a, b) => {
        const fa = finalPositions.get(a.shotImageEntryId) ?? 0;
        const fb = finalPositions.get(b.shotImageEntryId) ?? 0;
        return fa - fb;
      })
      .map(img => img.shotImageEntryId);

    // Create detailed before/after position maps for comprehensive logging
    const positionsBefore = [...framePositions.entries()]
      .sort(([, a], [, b]) => a - b)
      .map(([id, pos]) => {
        const imageIndex = images.findIndex(img => img.shotImageEntryId === id);
        return {
          id: id.slice(-8),
          imageIdx: imageIndex,
          frame: pos
        };
      });

    const positionsAfter = [...finalPositions.entries()]
      .sort(([, a], [, b]) => a - b)
      .map(([id, pos]) => {
        const imageIndex = images.findIndex(img => img.shotImageEntryId === id);
        return {
          id: id.slice(-8),
          imageIdx: imageIndex,
          frame: pos
        };
      });

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

    const orderChanged = JSON.stringify(originalOrder) !== JSON.stringify(finalOrder);
    const dragDirection = finalPos - dragState.originalFramePos;
    const dragDistance = Math.abs(dragDirection);

    // [TimelineItemMoveSummary] - Comprehensive timeline move logging with flattened structure
    log('TimelineItemMoveSummary', '[TimelineItemMoveSummary] Timeline drag move completed', {
      // Top-level move details
      moveType: 'drag',
      draggedImageId: dragState.activeId?.slice(-8),
      draggedImageIndex: images.findIndex(img => img.shotImageEntryId === dragState.activeId),
      draggedImageMove: `${dragState.originalFramePos} → ${finalPos} (${dragDirection > 0 ? '+' : ''}${dragDirection})`,
      
      // Attempt details
      mode,
      dragDistance,
      dragDirection: dragDirection > 0 ? 'right' : 'left',
      targetFrame: calculateTargetFrame(dragState.currentX, containerRect),
      
      // Change summary
      totalChanges: positionChanges.length,
      orderChanged,
      violations: positionChanges.some(change => Math.abs(change.delta) > calculateMaxGap(contextFrames)) ? 'POTENTIAL_GAP_VIOLATION' : 'none',
      
      // Frame 0 handling details
      frame0Moved: positionChanges.some(change => change.oldPos === 0),
      frame0NewPosition: positionChanges.find(change => change.oldPos === 0)?.newPos || 'unchanged',
      frame0Reason: dragState.originalFramePos === 0 && finalPos !== 0 ? 'dragged_item_was_at_frame_0' : 
                   positionChanges.some(change => change.oldPos === 0) ? 'frame_0_reassignment' : 'no_change',
      
      // Metadata
      contextFrames,
      totalImages: images.length,
      timestamp: new Date().toISOString(),
      
      // Detailed arrays
      positionsBefore,
      positionsAfter,
      positionChanges: positionChanges.length > 0 ? positionChanges : 'none'
    });

    // Prevent phantom drags (now variable already declared above)
    dragRefsRef.current.lastMouseUpTime = now;
    dragRefsRef.current.isBlocked = true;
    
    setTimeout(() => {
      dragRefsRef.current.isBlocked = false;
      log('TimelineDragDebug', 'unblocked', {
        previousDragId: dragState.activeId,
        timeSinceMouseUp: Date.now() - now
      });
    }, 100); // Reduced from 1000ms to 100ms for more responsive drag interactions
    
    log('TimelineDragDebug', 'mouseup', {
      id: dragState.activeId,
      timestamp: e.timeStamp,
      nowTime: now,
      finalPos,
    });

    // CRITICAL: Reset drag in progress flag after applying positions to prevent flicker
    if (setIsDragInProgress) {
      console.log('[TimelineMovementDebug] 🏁 DRAG ENDED - Setting isDragInProgress = false');
      setIsDragInProgress(false);
    }

    // Reset drag state
    setDragState({
      isDragging: false,
      activeId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      originalFramePos: 0,
    });

    // Clear the mouse position ref at the end of a drag to avoid stale values on next drag
    currentMousePosRef.current = null;
  }, [
    dragState, 
    images, 
    onImageReorder, 
    calculateDragPreviewWithPosition, 
    setFramePositions,
    framePositions,
    containerRect,
    calculateTargetFrame,
    contextFrames
  ]);

  // Calculate current values for rendering
  const dragOffset = dragState.isDragging
    ? { x: dragState.currentX - dragState.startX, y: 0 }
    : null;

  const currentDragFrame = dragState.isDragging && dragState.activeId
    ? calculateFinalPosition(calculateTargetFrame(dragState.currentX, containerRect))
    : null;

  // GROUND TRUTH COORDINATE ANALYSIS
  if (dragState.isDragging && dragState.activeId) {
    const rawOffsetX = dragState.currentX - dragState.startX;
    const frameBasedOffset_actual = currentDragFrame !== null ?
      ((currentDragFrame - dragState.originalFramePos) / fullRange) * (containerRect?.width || 1000) : 0;

    console.log('[GroundTruthAnalysis] 🎯 DOM-BASED COORDINATE SYSTEM:', {
      itemId: dragState.activeId.substring(0, 8),

      // Mouse movement
      mouseDelta: rawOffsetX,
      currentX: dragState.currentX,
      startX: dragState.startX,

      // Frame calculations with actual container width
      currentFrame: currentDragFrame,
      originalFrame: dragState.originalFramePos,
      frameDelta: currentDragFrame ? currentDragFrame - dragState.originalFramePos : 0,

      // DOM-based calculations
      containerWidth: containerRect?.width || 1000,
      frameBasedOffset_dom: frameBasedOffset_actual,
      syncDifference_dom: rawOffsetX - frameBasedOffset_actual,

      // Analysis
      coordinate_systems: {
        approach: 'DOM_GROUND_TRUTH',
        mouse_space: 'clientX_coordinates',
        calculation_space: 'actual_container_dimensions',
        visual_space: 'getBoundingClientRect',
        consistency_check: Math.abs(rawOffsetX - frameBasedOffset_actual) < 5 ? 'GOOD' : 'MISMATCH'
      },

      timestamp: new Date().toISOString()
    });
  }

  const swapTargetId = currentDragFrame !== null && dragState.activeId
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
          distanceToPrev: prev !== undefined ? Math.round(currentDragFrame - prev) : undefined,
          distanceToNext: next !== undefined ? Math.round(next - currentDragFrame) : undefined,
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
    calculateDragPreviewWithPosition,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}; 