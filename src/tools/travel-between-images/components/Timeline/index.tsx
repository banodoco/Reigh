import React, { useState, useEffect, useRef, useCallback } from "react";
import { GenerationRow } from "@/types/shots";
import { toast } from "sonner";
import MediaLightbox from "@/shared/components/MediaLightbox";
import { useIsMobile } from "@/shared/hooks/use-mobile";

// Import hooks
import { useFramePositions } from "./hooks/useFramePositions";
import { useZoom } from "./hooks/useZoom";
import { useFileDrop } from "./hooks/useFileDrop";
import { useTimelineDrag } from "./hooks/useTimelineDrag";

// Import components
import TimelineControls from "./TimelineControls";
import TimelineRuler from "./TimelineRuler";
import DropIndicator from "./DropIndicator";
import PairRegion from "./PairRegion";
import TimelineItem from "./TimelineItem";

// Import utils
import { 
  getTimelineDimensions, 
  calculateMaxGap, 
  getPairInfo 
} from "./utils/timeline-utils";

// Main Timeline component props
export interface TimelineProps {
  images: GenerationRow[];
  frameSpacing: number;
  contextFrames: number;
  onImageReorder: (orderedIds: string[]) => void;
  onImageSaved: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>;
  shotId: string;
  onContextFramesChange: (context: number) => void;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
  onImageDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  pendingPositions?: Map<string, number>;
  onPendingPositionApplied?: (generationId: string) => void;
}

/**
 * Refactored Timeline component with hooks and smaller components
 */
const Timeline: React.FC<TimelineProps> = ({
  images,
  frameSpacing,
  contextFrames,
  onImageReorder,
  onImageSaved,
  shotId,
  onContextFramesChange,
  onFramePositionsChange,
  onImageDrop,
  pendingPositions,
  onPendingPositionApplied
}) => {
  // Core state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialContextFrames = useRef(contextFrames);

  // Frame positions hook
  const { framePositions, setFramePositions } = useFramePositions({
    images,
    frameSpacing,
    shotId,
    pendingPositions,
    onPendingPositionApplied,
    onFramePositionsChange,
  });

  // Calculate dimensions
  const { fullMin, fullMax, fullRange } = getTimelineDimensions(framePositions);

  // Zoom hook
  const {
    zoomLevel,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,
    handleWheel,
  } = useZoom({ fullMin, fullMax, fullRange });

  // File drop hook
  const {
    isFileOver,
    dropTargetFrame,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useFileDrop({ onImageDrop, fullMin, fullRange });

  // Drag hook
  const {
    dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    dragDistances,
    dynamicPositions,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useTimelineDrag({
    framePositions,
    setFramePositions,
    images,
    onImageReorder,
    contextFrames,
    fullMin,
    fullRange,
  });

  // Set up global mouse event listeners for drag
  useEffect(() => {
    if (dragState.isDragging) {
      const moveHandler = (e: MouseEvent) => handleMouseMove(e);
      const upHandler = (e: MouseEvent) => handleMouseUp(e, containerRef);
      
      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', upHandler);
      
      return () => {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
      };
    }
  }, [dragState.isDragging, handleMouseMove, handleMouseUp]);

  // Auto-adjust positions when context frames change
  useEffect(() => {
    if (initialContextFrames.current === contextFrames) {
      initialContextFrames.current = contextFrames;
      return;
    }

    const maxGap = calculateMaxGap(contextFrames);
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
  }, [contextFrames, framePositions, frameSpacing, setFramePositions]);

  // Lightbox navigation
  const goNext = () => setLightboxIndex(i => (i === null ? null : (i + 1) % images.length));
  const goPrev = () => setLightboxIndex(i => (i === null ? null : (i - 1 + images.length) % images.length));

  // Prepare data
  const currentPositions = dynamicPositions();
  const pairInfo = getPairInfo(currentPositions, contextFrames);
  const numPairs = Math.max(0, images.length - 1);
  const maxAllowedGap = calculateMaxGap(contextFrames);
  const containerWidth = containerRef.current?.clientWidth || 1000;

  const isMobile = useIsMobile();

  // Mobile double-tap detection refs
  const lastTouchTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);

  // Handle mobile double-tap detection for image lightbox
  const handleMobileTap = (idx: number) => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTouchTimeRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // This is a double-tap, clear any pending timeout and open lightbox
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      setLightboxIndex(idx);
    } else {
      // This is a single tap, set a timeout to handle it if no second tap comes
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      doubleTapTimeoutRef.current = setTimeout(() => {
        // Single tap on mobile - you could add single tap behavior here if needed
        doubleTapTimeoutRef.current = null;
      }, 300);
    }
    
    lastTouchTimeRef.current = currentTime;
  };

  return (
    <div className="w-full overflow-x-hidden">
      {/* Controls */}
      <TimelineControls
        contextFrames={contextFrames}
        onContextFramesChange={onContextFramesChange}
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onZoomToStart={handleZoomToStart}
      />

      {/* Timeline */}
      <div
        ref={timelineRef}
        className={`timeline-scroll relative bg-muted/20 border rounded-lg p-4 overflow-x-auto mb-6 ${zoomLevel <= 1 ? 'no-scrollbar' : ''} ${
          isFileOver ? 'ring-2 ring-primary bg-primary/5' : ''
        }`}
        style={{ minHeight: "200px", paddingBottom: "3rem" }}
        onWheel={handleWheel}
        onDragEnter={handleDragEnter}
        onDragOver={(e) => handleDragOver(e, containerRef)}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop position indicator */}
        <DropIndicator
          isVisible={isFileOver}
          dropTargetFrame={dropTargetFrame}
          fullMin={fullMin}
          fullRange={fullRange}
        />

        {/* Ruler */}
        <TimelineRuler
          fullMin={fullMin}
          fullMax={fullMax}
          fullRange={fullRange}
          zoomLevel={zoomLevel}
        />

        {/* Timeline container */}
        <div
          ref={containerRef}
          id="timeline-container"
          className="relative h-32 mb-8"
          onDoubleClick={(e) => handleTimelineDoubleClick(e, containerRef)}
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

            // Fix: Base context frames on actual pair length, not just end frame
            const contextStartFrame = Math.max(actualStartFrame, actualEndFrame - contextFrames);
            const visibleContextFrames = Math.min(contextFrames, actualFrames);
            
            const contextStartPixel = ((contextStartFrame - fullMin) / fullRange) * containerWidth;
            const contextStartPercent = (contextStartPixel / containerWidth) * 100;

            const generationStartPixel = ((pair.generationStart - fullMin) / fullRange) * containerWidth;
            const generationStartPercent = (generationStartPixel / containerWidth) * 100;

            return (
              <PairRegion
                key={`pair-${index}`}
                index={index}
                startPercent={startPercent}
                endPercent={endPercent}
                contextStartPercent={contextStartPercent}
                generationStartPercent={generationStartPercent}
                actualFrames={actualFrames}
                visibleContextFrames={visibleContextFrames}
                isDragging={dragState.isDragging}
                contextFrames={contextFrames}
                numPairs={numPairs}
              />
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
                onMouseDown={(e) => handleMouseDown(e, image.shotImageEntryId, containerRef)}
                onDoubleClick={isMobile ? undefined : () => setLightboxIndex(idx)}
                onMobileTap={isMobile ? () => handleMobileTap(idx) : undefined}
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
          media={(() => {
            const media = images[lightboxIndex];
            console.log('[StarDebug:Timeline] MediaLightbox media', {
              mediaId: media.id,
              mediaKeys: Object.keys(media),
              hasStarred: 'starred' in media,
              starredValue: (media as any).starred,
              timestamp: Date.now()
            });
            return media;
          })()}
          onClose={() => setLightboxIndex(null)}
          onNext={images.length > 1 ? goNext : undefined}
          onPrevious={images.length > 1 ? goPrev : undefined}
          onImageSaved={async (newUrl: string, createNew?: boolean) => await onImageSaved(images[lightboxIndex].id, newUrl, createNew)}
          showNavigation={true}
          showMagicEdit={true}
          hasNext={lightboxIndex < images.length - 1}
          hasPrevious={lightboxIndex > 0}
          starred={(images[lightboxIndex] as any).starred || false}
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