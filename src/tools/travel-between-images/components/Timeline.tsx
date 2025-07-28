import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/shared/components/ui/button";
import { Slider } from "@/shared/components/ui/slider";
import { Label } from "@/shared/components/ui/label";
import { GenerationRow } from "@/types/shots";
import { getDisplayUrl } from "@/shared/lib/utils";
import { toast } from "sonner";
import MediaLightbox from "@/shared/components/MediaLightbox";
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { log } from "@/shared/lib/logger";

// Props for individual timeline items
interface TimelineItemProps {
  image: GenerationRow;
  framePosition: number;
  isDragging: boolean;
  isSwapTarget: boolean;
  dragOffset: { x: number; y: number } | null;
  onMouseDown: (e: React.MouseEvent, imageId: string) => void;
  onDoubleClick: () => void;
  zoomLevel: number;
  timelineWidth: number;
  fullMinFrames: number;
  fullRange: number;
  currentDragFrame: number | null;
  dragDistances: { distanceToPrev?: number; distanceToNext?: number } | null;
  maxAllowedGap: number;
  originalFramePos: number;
}

// TimelineItem component - simplified without dnd-kit
const TimelineItem: React.FC<TimelineItemProps> = ({
  image,
  framePosition,
  isDragging,
  isSwapTarget,
  dragOffset,
  onMouseDown,
  onDoubleClick,
  zoomLevel,
  timelineWidth,
  fullMinFrames,
  fullRange,
  currentDragFrame,
  dragDistances,
  maxAllowedGap,
  originalFramePos,
}) => {
  // Calculate position as pixel offset instead of percentage
  const pixelPosition = ((framePosition - fullMinFrames) / fullRange) * timelineWidth;

  // Apply drag offset if dragging
  // To avoid double-counting we translate by the difference between the desired cursor offset
  // and the shift already implied by the updated framePosition.
  let finalX = pixelPosition;
  if (isDragging && dragOffset) {
    const originalPixel = ((originalFramePos - fullMinFrames) / fullRange) * timelineWidth;
    const desiredPixel = originalPixel + dragOffset.x;
    finalX = desiredPixel; // cursor-aligned
  }
  const finalY = isDragging && dragOffset ? dragOffset.y : 0;

  // Use current drag frame for display if dragging, otherwise use original position
  const displayFrame = isDragging && currentDragFrame !== null ? currentDragFrame : framePosition;

  // Calculate position in percentage of the full range
  const leftPercent = (finalX / timelineWidth) * 100;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPercent}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        transition: isDragging ? 'none' : 'all 0.2s ease-out',
        opacity: isDragging ? 0.8 : 1,
        zIndex: isDragging ? 10 : 1,
        cursor: 'move',
      }}
      onMouseDown={(e) => onMouseDown(e, image.shotImageEntryId)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      className={isSwapTarget ? "ring-4 ring-primary/60" : ""}
    >
      <div className="flex flex-col items-center relative">
        {/* Distance indicators on left/right */}
        {isDragging && dragDistances && (
          <>
            {dragDistances.distanceToPrev !== undefined && (
              <div
                className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full text-xs font-medium px-1 py-0.5 rounded mr-1 ${
                  dragDistances.distanceToPrev > maxAllowedGap
                    ? 'bg-red-500/90 text-white'
                    : 'bg-primary/90 text-primary-foreground'
                }`}
    >
                {dragDistances.distanceToPrev}f
              </div>
            )}
            {dragDistances.distanceToNext !== undefined && (
              <div
                className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-full text-xs font-medium px-1 py-0.5 rounded ml-1 ${
                  dragDistances.distanceToNext > maxAllowedGap
                    ? 'bg-red-500/90 text-white'
                    : 'bg-primary/90 text-primary-foreground'
                }`}
              >
                {dragDistances.distanceToNext}f
              </div>
            )}
          </>
        )}

        <div className={`relative w-24 h-24 border-2 ${isDragging ? "border-primary/50" : "border-primary"} rounded-lg overflow-hidden`}>
          <img
            src={getDisplayUrl(image.imageUrl)}
            alt={`Frame ${displayFrame}`}
            className="w-full h-full object-cover"
            draggable={false}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] leading-none text-center py-0.5">
            {displayFrame}
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Timeline component props
export interface TimelineProps {
  images: GenerationRow[];
  frameSpacing: number;
  contextFrames: number;
  onImageReorder: (orderedIds: string[]) => void;
  onImageSaved: (imageId: string, newImageUrl: string, createNew?: boolean) => void;
  shotId: string;
  onContextFramesChange: (context: number) => void;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
}

/**
 * Refactored Timeline component with simplified drag and drop
 */
const Timeline: React.FC<TimelineProps> = ({
  images,
  frameSpacing,
  contextFrames,
  onImageReorder,
  onImageSaved,
  shotId,
  onContextFramesChange,
  onFramePositionsChange
}) => {
  // Core state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCenter, setZoomCenter] = useState(0);

  // Drag state
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    activeId: string | null;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    originalFramePos: number;
    isCommandPressed: boolean;
    isOptionPressed: boolean;
    leftGap: number; // gap to previous frame at drag start
    rightGap: number; // gap to next frame at drag start
  }>({
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

  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialContextFrames = useRef(contextFrames);

  // Frame positions state
  const [framePositions, setFramePositions] = useState<Map<string, number>>(() => {
    const stored = localStorage.getItem(`timelineFramePositions_${shotId}`);
    if (stored) {
      try {
        return new Map(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    }
    const initial = new Map<string, number>();
    images.forEach((img, idx) => initial.set(img.shotImageEntryId, idx * frameSpacing));
    return initial;
  });

  // Save positions to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(`timelineFramePositions_${shotId}`, JSON.stringify(Array.from(framePositions.entries())));
      if (onFramePositionsChange) {
        onFramePositionsChange(framePositions);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [framePositions, shotId, onFramePositionsChange]);

  // Sync frame positions when images change
  useEffect(() => {
    setFramePositions(prev => {
      const map = new Map(prev);
      images.forEach((img, idx) => {
        if (!map.has(img.shotImageEntryId)) {
          map.set(img.shotImageEntryId, idx * frameSpacing);
        }
      });
      [...map.keys()].forEach(key => {
        if (!images.some(img => img.shotImageEntryId === key)) map.delete(key);
      });
      return map;
    });
  }, [images, frameSpacing]);

  // Calculate dimensions
  const getTimelineDimensions = useCallback(() => {
    const positions = Array.from(framePositions.values());
    const staticMax = Math.max(...positions, 0);
    const staticMin = Math.min(...positions, 0);
    const padding = 30;

    const fullMax = Math.max(60, staticMax + padding);
    const fullMin = Math.min(0, staticMin - padding);
    const fullRange = fullMax - fullMin;

    return { fullMin, fullMax, fullRange };
  }, [framePositions]);

  const { fullMin, fullMax, fullRange } = getTimelineDimensions();

  // Calculate zoom viewport
  const getZoomViewport = useCallback(() => {
    const zoomedRange = fullRange / zoomLevel;
    const halfZoomedRange = zoomedRange / 2;
    const clampedCenter = Math.max(
      fullMin + halfZoomedRange,
      Math.min(fullMax - halfZoomedRange, zoomCenter)
    );

    return {
      min: clampedCenter - halfZoomedRange,
      max: clampedCenter + halfZoomedRange,
      range: zoomedRange
    };
  }, [fullMin, fullMax, fullRange, zoomLevel, zoomCenter]);

  const viewport = getZoomViewport();

  // Calculate max gap based on context frames
  const calculateMaxGap = useCallback((): number => {
    const maxGap = 81 - contextFrames;
    return Math.max(maxGap, contextFrames + 10);
  }, [contextFrames]);

  // Validate gap constraints
  const validateGaps = useCallback((testPositions: Map<string, number>, excludeId?: string): boolean => {
    const positions = [...testPositions.entries()]
      .filter(([id]) => id !== excludeId)
      .map(([_, pos]) => pos);
    positions.push(0); // Always include frame 0
    positions.sort((a, b) => a - b);

    const maxGap = calculateMaxGap();

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
  }, [calculateMaxGap]);

  // Convert pixel position to frame number
  const pixelToFrame = useCallback((pixelX: number, containerWidth: number): number => {
    const fraction = pixelX / containerWidth;
    return Math.round(fullMin + fraction * fullRange);
  }, [fullMin, fullRange]);

  // Find closest valid position considering constraints
  const findClosestValidPosition = useCallback((targetFrame: number, activeId: string): number => {
    const originalPos = framePositions.get(activeId) ?? 0;

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

      return validateGaps(testMap);
    };

    // First check if target is valid
    if (validateWithFrame0Logic(targetFrame)) {
      return targetFrame;
    }

    // Binary search for closest valid position
    const direction = targetFrame > originalPos ? 1 : -1;
    let low = Math.min(originalPos, targetFrame);
    let high = Math.max(originalPos, targetFrame);
    let best = originalPos;

    while (low <= high) {
      const mid = Math.round((low + high) / 2);

      if (validateWithFrame0Logic(mid)) {
        best = mid;
        if (direction > 0) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      } else {
        if (direction > 0) {
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
    }

    return best;
  }, [framePositions, validateGaps]);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, imageId: string) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();

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
  }, [framePositions]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging || !containerRef.current) return;
    
    setDragState(prev => ({
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
      isCommandPressed: e.metaKey,
      isOptionPressed: e.altKey,
    }));
  }, [dragState.isDragging]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging || !dragState.activeId || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const containerWidth = rect.width;

    // Calculate the pixel position where we're dropping
    const dragOffsetX = dragState.currentX - dragState.startX;
    const originalPixelPos = ((dragState.originalFramePos - fullMin) / fullRange) * containerWidth;
    const targetPixelPos = originalPixelPos + dragOffsetX;

    // Convert to frame number and constrain
    const targetFrame = Math.max(0, pixelToFrame(targetPixelPos, containerWidth));
    const validFrame = findClosestValidPosition(targetFrame, dragState.activeId);

    // Apply the final positions from the dynamic preview
    // Get the current dynamic positions which already include Command+drag logic
    const currentDynamic = dynamicPositions();

    // Update the dragged item to its final valid position
    const updatedMap = new Map(currentDynamic);
    const originalPos = framePositions.get(dragState.activeId) ?? 0;

    // Debug: log drop details and tentative updated positions
    log('TimelineFrameLimitIssue', 'handleMouseUp drop result', {
      activeId: dragState.activeId,
      originalPos,
      validFrame,
      updatedPositions: Array.from(updatedMap.entries()),
    });

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
  }, [dragState, framePositions, fullMin, fullRange, pixelToFrame, findClosestValidPosition, images, onImageReorder]);

  // Set up global mouse event listeners
  useEffect(() => {
    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.isDragging, handleMouseMove, handleMouseUp]);

  // Auto-adjust positions when context frames change
  useEffect(() => {
    if (initialContextFrames.current === contextFrames) {
      initialContextFrames.current = contextFrames;
      return;
    }

    const maxGap = calculateMaxGap();
    const sortedPositions = [...framePositions.entries()]
      .map(([id, pos]) => ({ id, pos }))
      .sort((a, b) => a.pos - b.pos);

    let needsAdjustment = false;
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      const currentGap = sortedPositions[i + 1].pos - sortedPositions[i].pos;
      if (currentGap > maxGap) {
        needsAdjustment = true;
        break;
      }
    }

    if (needsAdjustment) {
      const adjustedPositions = new Map(framePositions);
      let currentPos = 0;
      for (let i = 0; i < sortedPositions.length; i++) {
        adjustedPositions.set(sortedPositions[i].id, currentPos);
        if (i < sortedPositions.length - 1) {
          currentPos += Math.min(maxGap, frameSpacing);
        }
      }

      setFramePositions(adjustedPositions);
      toast.info(`Timeline positions auto-adjusted due to context frame changes (max gap: ${maxGap} frames)`);
    }

    initialContextFrames.current = contextFrames;
  }, [contextFrames, calculateMaxGap, framePositions, frameSpacing]);

  // Get pair information
  const getPairInfo = useCallback((dynamicPositions?: Map<string, number>) => {
    const positionsToUse = dynamicPositions || framePositions;
    const sortedPositions = [...positionsToUse.entries()]
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
  }, [framePositions, contextFrames]);

  // Zoom controls
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.5, 10));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.5, 1));
  const handleZoomReset = () => {
    setZoomLevel(1);
    setZoomCenter(0);
  };
  const handleZoomToStart = () => {
    setZoomLevel(2);
    setZoomCenter(fullMin + fullRange / 4);
  };

  const handleTimelineDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relativeX = e.clientX - rect.left;
    const clickFrame = pixelToFrame(relativeX, rect.width);
    setZoomLevel(3);
    setZoomCenter(clickFrame);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1) return;
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!isHorizontal && Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const pan = (e.deltaY * fullRange) / 2000;
      setZoomCenter(z => z + pan);
    }
  };

  // Calculate current drag offset and target frame
  const dragOffset = dragState.isDragging && containerRef.current
    ? { x: dragState.currentX - dragState.startX, y: 0 }
    : null;
  
  const isModifierDrag = dragState.isCommandPressed || dragState.isOptionPressed;

  const currentDragFrame = dragState.isDragging && containerRef.current && dragState.activeId
    ? (() => {
        const rect = containerRef.current.getBoundingClientRect();
        const containerWidth = rect.width;
        const dragOffsetX = dragState.currentX - dragState.startX;
        const originalPixelPos = ((dragState.originalFramePos - fullMin) / fullRange) * containerWidth;
        const targetPixelPos = originalPixelPos + dragOffsetX;
        let targetFrame = Math.max(0, pixelToFrame(targetPixelPos, containerWidth));
        
        // When using modifiers, we don't snap to items for swapping.
        if (isModifierDrag) {
          // However, if ONLY ONE modifier is pressed, we must constrain the drag
          // relative to the "anchored" part of the timeline.
          const isPushRightOnly = dragState.isCommandPressed && !dragState.isOptionPressed;
          const isPushLeftOnly = dragState.isOptionPressed && !dragState.isCommandPressed;
          
          if (isPushRightOnly || isPushLeftOnly) {
            const sorted = [...framePositions.entries()].sort((a,b) => a[1]-b[1]);
            const activeIndex = sorted.findIndex(([id]) => id === dragState.activeId);
            const maxGap = calculateMaxGap();

            if (isPushRightOnly && activeIndex > 0) {
              const prevItem = sorted[activeIndex - 1];
              const minFrame = prevItem[1] + dragState.leftGap;
              const maxFrame = prevItem[1] + maxGap;
              targetFrame = Math.max(minFrame, Math.min(targetFrame, maxFrame));
            } else if (isPushLeftOnly && activeIndex < sorted.length - 1) {
              const nextItem = sorted[activeIndex + 1];
              const minFrameGlobal = Math.max(0, nextItem[1] - maxGap);
              const prevItemOpt = activeIndex > 0 ? sorted[activeIndex - 1] : null;
              const minFrameOriginal = prevItemOpt ? prevItemOpt[1] + dragState.leftGap : 0;
              const minFrame = Math.max(minFrameGlobal, minFrameOriginal);
              const maxFrame = nextItem[1] - dragState.rightGap;
              targetFrame = Math.max(minFrame, Math.min(targetFrame, maxFrame));
            }
          }
          
          // If both modifiers are held, we may still exceed max gap relative to frame 0. Clamp using gap validation.
          const isBothModifiers = dragState.isCommandPressed && dragState.isOptionPressed;
          if (isBothModifiers) {
            targetFrame = findClosestValidPosition(targetFrame, dragState.activeId);
          }
          return targetFrame;
        }

        // For a normal drag, find the closest valid spot to enable snapping.
        return findClosestValidPosition(targetFrame, dragState.activeId);
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

  // Lightbox navigation
  const goNext = () => setLightboxIndex(i => (i === null ? null : (i + 1) % images.length));
  const goPrev = () => setLightboxIndex(i => (i === null ? null : (i - 1 + images.length) % images.length));

  // Create dynamic positions including current drag position
  const dynamicPositions = useCallback(() => {
    if (!dragState.isDragging || !dragState.activeId || currentDragFrame === null) {
      return framePositions;
    }

    const newPositions = new Map(framePositions);
    const originalPos = framePositions.get(dragState.activeId) ?? 0;
    let frameDiff = currentDragFrame - originalPos; // raw cursor diff

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
      const maxGap = calculateMaxGap();

      // Helper: push a neighbour while respecting min/max.
      const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(value, hi));

      // ---- RIGHT PUSH (Cmd) ----
      if (dragState.isCommandPressed && draggedIdx !== -1) {
        const isMovingBackward = frameDiff < 0;
        let lastPos = currentDragFrame;
        for (let i = draggedIdx + 1; i < sortedEntries.length; i++) {
          const [id, curPos] = sortedEntries[i];
          let newPos = curPos + frameDiff;

          if (isMovingBackward) {
            const minPos = Math.max(0, lastPos + 1);
            const maxPos = lastPos + maxGap;
            newPos = clamp(newPos, minPos, maxPos);
          } else {
            const minPos = lastPos + 1;
            const maxPos = lastPos + maxGap;
            newPos = clamp(newPos, minPos, maxPos);
          }

          newPositions.set(id, newPos);
          lastPos = newPos;
        }
      }

      // ---- LEFT PUSH (Opt) ----
      if (dragState.isOptionPressed && draggedIdx !== -1) {
        const isMovingForward = frameDiff > 0;
        let nextPos = currentDragFrame;
        for (let i = draggedIdx - 1; i >= 0; i--) {
          const [id, curPos] = sortedEntries[i];
          if (curPos === 0 && id !== dragState.activeId) break; // keep frame 0 pinned

          let newPos = curPos + frameDiff;
          if (isMovingForward) {
            const maxPos = nextPos - 1;
            const minPos = clamp(nextPos - maxGap, 0, maxPos);
            newPos = clamp(newPos, minPos, maxPos);
          } else {
            const maxPos = nextPos - 1;
            const minPos = clamp(nextPos - maxGap, 0, maxPos);
            newPos = clamp(newPos, minPos, maxPos);
          }

          newPositions.set(id, newPos);
          nextPos = newPos;
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
        const adjusted = findClosestValidPosition(newPositions.get(dragState.activeId) ?? currentDragFrame, dragState.activeId);
        newPositions.set(dragState.activeId, adjusted);
      }
    } else {
      // Plain drag – use snapping
      newPositions.set(dragState.activeId, currentDragFrame);
    }

    return newPositions;
  }, [framePositions, dragState.isDragging, dragState.activeId, dragState.isCommandPressed, dragState.isOptionPressed, currentDragFrame, calculateMaxGap, findClosestValidPosition]);

  // Prepare data
  const currentPositions = dynamicPositions();
  const pairInfo = getPairInfo(currentPositions);
  const numPairs = Math.max(0, images.length - 1);
  const maxAllowedGap = calculateMaxGap();
  const containerWidth = containerRef.current?.clientWidth || 1000;

  // -----------------------------
  // Debug logging for zoom behaviour
  // -----------------------------
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const viewportInfo = getZoomViewport();
      console.groupCollapsed("[Timeline] Zoom Debug");
      console.table([
        {
          zoomLevel,
          zoomCenter,
          fullMin,
          fullMax,
          fullRange,
          viewportMin: viewportInfo.min,
          viewportMax: viewportInfo.max,
          rulerWidthStyle: zoomLevel > 1 ? `${zoomLevel * 100}%` : "100%",
          containerClientWidth: containerRef.current?.clientWidth ?? "N/A",
        },
      ]);
      console.groupEnd();
    }
  }, [zoomLevel, zoomCenter, fullMin, fullMax, fullRange, getZoomViewport]);

  return (
    <div className="w-full overflow-x-hidden">
      {/* Controls */}
      <div className="flex items-center justify-between mb-3 gap-6">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-1/2">
            <div className="flex items-center gap-2 mb-1">
              <Label htmlFor="contextFrames" className="text-sm font-medium">
                Context Frames: {contextFrames}
              </Label>
            </div>
            <Slider
              id="contextFrames"
              min={1}
              max={24}
              step={1}
              value={[contextFrames]}
              onValueChange={(value) => onContextFramesChange(value[0])}
              className="w-full"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-5 w-5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="mb-1 font-semibold">Timeline Drag Shortcuts</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li><kbd className="font-mono">⌘</kbd> – push frames <span className="font-medium">to the right</span></li>
                <li><kbd className="font-mono">⌥</kbd> – push frames <span className="font-medium">to the left</span></li>
                <li><kbd className="font-mono">⌘ + ⌥</kbd> – shift the <span className="font-medium">entire timeline</span></li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleZoomReset} disabled={zoomLevel <= 1}>
            <span className="text-xs">⤺</span> Zoom Out Fully
          </Button>
          <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoomLevel <= 1}>
            <span className="text-xs">−</span> Zoom Out
          </Button>
          <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoomLevel >= 10}>
            <span className="text-xs">+</span> Zoom In
          </Button>
          <Button variant="outline" size="sm" onClick={handleZoomToStart}>
            <span className="text-xs">⟵</span> Zoom to Start
          </Button>
          <span className="text-sm text-muted-foreground ml-2">{zoomLevel.toFixed(1)}x zoom</span>
        </div>
      </div>

      {/* Timeline */}
      <div
        ref={timelineRef}
        className={`timeline-scroll relative bg-muted/20 border rounded-lg p-4 overflow-x-auto mb-6 ${zoomLevel <= 1 ? 'no-scrollbar' : ''}`}
        style={{ minHeight: "200px", paddingBottom: "3rem" }}
        onWheel={handleWheel}
      >
        {/* Ruler */}
        <div
          className="absolute left-0 h-8 border-t"
          style={{
            bottom: "2rem",
            width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
            minWidth: '100%',
          }}
        >
          <div className="relative h-full">
            {Array.from({ length: Math.floor(fullMax / 30) + 1 }, (_, i) => {
              const frame = i * 30;
              const position = ((frame - fullMin) / fullRange) * 100;
              return (
                <div key={frame} className="absolute flex flex-col items-center" style={{ left: `${position}%` }}>
                  <div className="w-px h-4 bg-border"></div>
                  <span className="text-xs text-muted-foreground mt-1">{frame}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline container */}
        <div
          ref={containerRef}
          id="timeline-container"
          className="relative h-32 mb-8"
          onDoubleClick={handleTimelineDoubleClick}
          style={{
            width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
            minWidth: "100%",
            userSelect: 'none',
          }}
        >
          {/* Pair visualizations */}
          {pairInfo.map((pair, index) => {
            // Build sorted positions array with id for pixel calculations
            const sortedDynamicPositions = [...currentPositions.entries()].sort((a, b) => a[1] - b[1]);

            const [startEntry, endEntry] = [sortedDynamicPositions[index], sortedDynamicPositions[index + 1]];

            const getPixel = (entry: [string, number] | undefined): number => {
              if (!entry) return 0;
              const [id, framePos] = entry;
              // Base pixel from current framePos (may already be quantized)
              const basePixel = ((framePos - fullMin) / fullRange) * containerWidth;

              // When actively dragging this item, align to cursor using its ORIGINAL start pixel plus dragOffset
              if (dragState.isDragging && id === dragState.activeId && dragOffset) {
                const originalPixel = ((dragState.originalFramePos - fullMin) / fullRange) * containerWidth;
                return originalPixel + dragOffset.x;
              }

              return basePixel;
            };

            const startPixel = getPixel(startEntry);
            const endPixel = getPixel(endEntry);

            const actualStartFrame = startEntry?.[1] ?? pair.startFrame;
            const actualEndFrame = endEntry?.[1] ?? pair.endFrame;
            const actualFrames = actualEndFrame - actualStartFrame;

            const startPercent = (startPixel / containerWidth) * 100;
            const endPercent = (endPixel / containerWidth) * 100;

            const contextStartFrameUnclipped = actualEndFrame - contextFrames;
            const contextStartFrame = Math.max(0, contextStartFrameUnclipped);
            const visibleContextFrames = Math.max(0, actualEndFrame - contextStartFrame);
            
            const contextStartPixel = ((contextStartFrame - fullMin) / fullRange) * containerWidth;
            const contextStartPercent = (contextStartPixel / containerWidth) * 100;

            const generationStartPixel = ((pair.generationStart - fullMin) / fullRange) * containerWidth;
            const generationStartPercent = (generationStartPixel / containerWidth) * 100;

            const pairColorSchemes = [
              { bg: 'bg-blue-50', border: 'border-blue-300', context: 'bg-blue-200/60', text: 'text-blue-700', line: 'bg-blue-400' },
              { bg: 'bg-emerald-50', border: 'border-emerald-300', context: 'bg-emerald-200/60', text: 'text-emerald-700', line: 'bg-emerald-400' },
              { bg: 'bg-purple-50', border: 'border-purple-300', context: 'bg-purple-200/60', text: 'text-purple-700', line: 'bg-purple-400' },
              { bg: 'bg-orange-50', border: 'border-orange-300', context: 'bg-orange-200/60', text: 'text-orange-700', line: 'bg-orange-400' },
              { bg: 'bg-rose-50', border: 'border-rose-300', context: 'bg-rose-200/60', text: 'text-rose-700', line: 'bg-rose-400' },
              { bg: 'bg-teal-50', border: 'border-teal-300', context: 'bg-teal-200/60', text: 'text-teal-700', line: 'bg-teal-400' },
            ];
            const colorScheme = pairColorSchemes[index % pairColorSchemes.length];

            return (
              <React.Fragment key={`pair-${index}`}>
                {/* Main pair region */}
                <div
                  className={`absolute top-0 bottom-0 ${colorScheme.bg} ${colorScheme.border} border-l-2 border-r-2 border-solid pointer-events-none`}
                  style={{
                    left: `${startPercent}%`,
                    width: `${endPercent - startPercent}%`,
                    transition: dragState.isDragging ? 'none' : 'left 0.2s ease-out, width 0.2s ease-out',
                  }}
                />

                {/* Context frames region */}
                {contextFrames > 0 && visibleContextFrames > 0 && index < numPairs - 1 && (
                  <div
                    className={`absolute top-0 bottom-0 ${colorScheme.context} border-r border-dashed ${colorScheme.border.replace('border-', 'border-r-').replace('-300', '-400')} pointer-events-none`}
                    style={{
                      left: `${contextStartPercent}%`,
                      width: `${endPercent - contextStartPercent}%`,
                      transition: dragState.isDragging ? 'none' : 'left 0.2s ease-out, width 0.2s ease-out',
                    }}
                  >
                    <div className={`absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs font-medium ${colorScheme.text} bg-white/80 px-2 py-0.5 rounded`}>
                      Context ({visibleContextFrames}f)
                    </div>
                  </div>
                )}

                {/* Pair label */}
                <div
                  className={`absolute top-1/2 text-sm font-semibold ${colorScheme.text} bg-white/90 px-3 py-1 rounded-full border ${colorScheme.border} pointer-events-none z-10 shadow-sm`}
                  style={{
                    left: `${(startPercent + endPercent) / 2}%`,
                    transform: 'translate(-50%, -50%)',
                    transition: dragState.isDragging ? 'none' : 'left 0.2s ease-out',
                  }}
                >
                  Pair {index + 1} • {actualFrames}f
                </div>

                {/* Generation boundary lines */}
                <div
                  className={`absolute top-0 bottom-0 w-[2px] ${colorScheme.line} pointer-events-none z-5`}
                  style={{
                    left: `${generationStartPercent}%`,
                    transform: 'translateX(-50%)',
                    transition: dragState.isDragging ? 'none' : 'left 0.2s ease-out',
                  }}
                />
                <div
                  className={`absolute top-0 bottom-0 w-[2px] ${colorScheme.line} pointer-events-none z-5`}
                  style={{
                    left: `${endPercent}%`,
                    transform: 'translateX(-50%)',
                    transition: dragState.isDragging ? 'none' : 'left 0.2s ease-out',
                  }}
                />
              </React.Fragment>
            );
          })}

          {/* Timeline items */}
          {images.map((image, idx) => {
            const framePosition = currentPositions.get(image.shotImageEntryId) ?? idx * frameSpacing;
            const isDragging = dragState.isDragging && dragState.activeId === image.shotImageEntryId;

            return (
              <TimelineItem
                key={image.shotImageEntryId}
                image={image}
                framePosition={framePosition}
                isDragging={isDragging}
                isSwapTarget={swapTargetId === image.shotImageEntryId}
                dragOffset={isDragging ? dragOffset : null}
                onMouseDown={handleMouseDown}
                onDoubleClick={() => setLightboxIndex(idx)}
                zoomLevel={zoomLevel}
                timelineWidth={containerWidth}
                fullMinFrames={fullMin}
                fullRange={fullRange}
                currentDragFrame={isDragging ? currentDragFrame : null}
                dragDistances={isDragging ? dragDistances : null}
                maxAllowedGap={maxAllowedGap}
                originalFramePos={framePositions.get(image.shotImageEntryId) ?? 0}
              />
            );
          })}
                      </div>
                    </div>

      {/* Lightbox */}
            {lightboxIndex !== null && images[lightboxIndex] && (
              <MediaLightbox
                media={images[lightboxIndex]}
                onClose={() => setLightboxIndex(null)}
                onNext={images.length > 1 ? goNext : undefined}
                onPrevious={images.length > 1 ? goPrev : undefined}
                onImageSaved={(newUrl: string, createNew?: boolean) => onImageSaved(images[lightboxIndex].id, newUrl, createNew)}
                showNavigation={true}
                showMagicEdit={true}
                onMagicEdit={(imageUrl, prompt, numImages) => {
                  // TODO: Implement magic edit generation
                  console.log('Magic Edit from Timeline:', { imageUrl, prompt, numImages });
                }}
              />
            )}
    </div>
  );
};

export default Timeline; 