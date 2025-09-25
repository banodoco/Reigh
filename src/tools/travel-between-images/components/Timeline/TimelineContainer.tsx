import React, { useRef, useState, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { calculateMaxGap, getPairInfo, getTimelineDimensions } from './utils/timeline-utils';
import { timelineDebugger } from './utils/timeline-debug';

// Import components
import TimelineControls from './TimelineControls';
import TimelineRuler from './TimelineRuler';
import DropIndicator from './DropIndicator';
import PairRegion from './PairRegion';
import TimelineItem from './TimelineItem';
import { TIMELINE_HORIZONTAL_PADDING } from './constants';

// Import hooks
import { useZoom } from './hooks/useZoom';
import { useFileDrop } from './hooks/useFileDrop';
import { useTimelineDrag } from './hooks/useTimelineDrag';
import { useGlobalEvents } from './hooks/useGlobalEvents';
import { useLightbox } from './hooks/useLightbox';

interface TimelineContainerProps {
  shotId: string;
  images: GenerationRow[];
  contextFrames: number;
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  onImageReorder: (orderedIds: string[]) => void;
  onImageSaved: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>;
  onImageDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  setIsDragInProgress: (dragging: boolean) => void;
  // Control props
  onContextFramesChange: (context: number) => void;
  onResetFrames: (gap: number, contextFrames: number) => Promise<void>;
  // Pair-specific props
  onPairClick?: (pairIndex: number, pairData: any) => void;
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  // Action handlers
  onImageDelete: (imageId: string) => void;
  onImageDuplicate: (imageId: string, timeline_frame: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
}

const TimelineContainer: React.FC<TimelineContainerProps> = ({
  shotId,
  images,
  contextFrames,
  framePositions,
  setFramePositions,
  onImageReorder,
  onImageSaved,
  onImageDrop,
  setIsDragInProgress,
  onContextFramesChange,
  onResetFrames,
  onPairClick,
  pairPrompts,
  defaultPrompt,
  defaultNegativePrompt,
  onImageDelete,
  onImageDuplicate,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio
}) => {
  
  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State for context visibility with delay
  const [showContext, setShowContext] = useState(false);
  const contextTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isMobile = useIsMobile();

  // Calculate coordinate system using proper timeline dimensions
  const { fullMin, fullMax, fullRange } = getTimelineDimensions(framePositions);

  // Get actual container dimensions for calculations
  const containerRect = containerRef.current?.getBoundingClientRect() || null;
  const containerWidth = containerRef.current?.clientWidth || 1000;

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
    fullMax,
    fullRange,
    containerRect,
    setIsDragInProgress,
  });

  // Global events hook
  useGlobalEvents({
    isDragging: dragState.isDragging,
    activeId: dragState.activeId,
    shotId,
    handleMouseMove,
    handleMouseUp,
    containerRef
  });

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

  // Lightbox hook
  const {
    lightboxIndex,
    currentLightboxImage,
    goNext,
    goPrev,
    openLightbox,
    closeLightbox,
    handleMobileTap,
    handleDesktopDoubleClick,
    hasNext,
    hasPrevious,
    showNavigation
  } = useLightbox({ images, shotId, isMobile });

  // Simple drag state tracking - remove excessive logging

  // Effect to handle context visibility delay when not dragging
  useEffect(() => {
    if (!dragState.isDragging) {
      // Clear any existing timer
      if (contextTimerRef.current) {
        clearTimeout(contextTimerRef.current);
      }
      
      // Set a 100ms delay before showing context
      contextTimerRef.current = setTimeout(() => {
        setShowContext(true);
      }, 100);
    } else {
      // Hide context immediately when dragging starts
      setShowContext(false);
      if (contextTimerRef.current) {
        clearTimeout(contextTimerRef.current);
      }
    }

    // Cleanup timer on unmount
    return () => {
      if (contextTimerRef.current) {
        clearTimeout(contextTimerRef.current);
      }
    };
  }, [dragState.isDragging]);

  // Prepare data
  const currentPositions = dynamicPositions();
  const pairInfo = getPairInfo(currentPositions, contextFrames);
  const numPairs = Math.max(0, images.length - 1);
  const maxAllowedGap = calculateMaxGap(contextFrames);

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
        onResetFrames={onResetFrames}
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
          containerWidth={containerWidth}
        />

        {/* Ruler */}
        <TimelineRuler
          fullMin={fullMin}
          fullMax={fullMax}
          fullRange={fullRange}
          zoomLevel={zoomLevel}
          containerWidth={containerWidth}
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
            paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`, // Add left buffer space
            paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`, // Add right buffer space
          }}
        >
          {/* Pair visualizations */}
          {pairInfo.map((pair, index) => {
            // Build sorted positions array with id for pixel calculations
            const sortedDynamicPositions = [...currentPositions.entries()].sort((a, b) => a[1] - b[1]);
            const [startEntry, endEntry] = [sortedDynamicPositions[index], sortedDynamicPositions[index + 1]];

            // Hide context for pairs involving the dragged item
            if (dragState.isDragging && dragState.activeId) {
              const isDraggedItemInPair = startEntry?.[0] === dragState.activeId || endEntry?.[0] === dragState.activeId;
              if (isDraggedItemInPair) {
                return null; // Skip rendering context for dragged item
              }
            }

            // Hide context with delay for non-dragged pairs when not dragging
            if (!dragState.isDragging && !showContext) {
              return null; // Skip rendering until delay period is over
            }

            // Calculate pixel positions with padding adjustment
            const getPixel = (entry: [string, number] | undefined): number => {
              if (!entry) return 0;
              const [id, framePos] = entry;

              // Skip DOM-based positioning for dragged items
              if (dragState.isDragging && id === dragState.activeId) {
                return 0; // Return 0 since this won't be used anyway
              }

              // Use actual container dimensions minus padding
              const paddingOffset = TIMELINE_HORIZONTAL_PADDING; // Left padding
              const effectiveWidth = containerWidth - (paddingOffset * 2); // Subtract both left and right padding
              const basePixel = paddingOffset + ((framePos - fullMin) / fullRange) * effectiveWidth;
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
            
            // Use same padding calculation as getPixel function
            const paddingOffset = TIMELINE_HORIZONTAL_PADDING;
            const effectiveWidth = containerWidth - (paddingOffset * 2);
            const contextStartPixel = paddingOffset + ((contextStartFrame - fullMin) / fullRange) * effectiveWidth;
            const contextStartPercent = (contextStartPixel / containerWidth) * 100;

            const generationStartPixel = paddingOffset + ((pair.generationStart - fullMin) / fullRange) * effectiveWidth;
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
                startFrame={pair.startFrame}
                endFrame={pair.endFrame}
                onPairClick={onPairClick ? (pairIndex, pairData) => {
                  // Get the images for this pair
                  const startImage = images.find(img => img.shotImageEntryId === startEntry?.[0]);
                  const endImage = images.find(img => img.shotImageEntryId === endEntry?.[0]);
                  
                  // Calculate actual position numbers (1-based)
                  const startPosition = index + 1; // First image in pair
                  const endPosition = index + 2;   // Second image in pair
                  
                  // Call the original onPairClick with enhanced data
                  onPairClick(pairIndex, {
                    ...pairData,
                    startImage: startImage ? {
                      id: startImage.shotImageEntryId,
                      url: startImage.imageUrl || startImage.thumbUrl,
                      thumbUrl: startImage.thumbUrl,
                      timeline_frame: (startImage as GenerationRow & { timeline_frame?: number }).timeline_frame ?? 0,
                      position: startPosition
                    } : null,
                    endImage: endImage ? {
                      id: endImage.shotImageEntryId,
                      url: endImage.imageUrl || endImage.thumbUrl,
                      thumbUrl: endImage.thumbUrl,
                      timeline_frame: (endImage as GenerationRow & { timeline_frame?: number }).timeline_frame ?? 0,
                      position: endPosition
                    } : null
                  });
                } : undefined}
                pairPrompt={pairPrompts?.[index]?.prompt}
                pairNegativePrompt={pairPrompts?.[index]?.negativePrompt}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
              />
            );
          })}

          {/* Timeline items */}
          {images.map((image, idx) => {
            const framePosition = currentPositions.get(image.shotImageEntryId) ?? idx * 50;
            const isDragging = dragState.isDragging && dragState.activeId === image.shotImageEntryId;

            // [Position0Debug] Track position lookup failures for item 50bbb119
            if (image.shotImageEntryId.startsWith('50bbb119')) {
              console.log(`[Position0Debug] 🔍 Position lookup for item 50bbb119:`, {
                shotImageEntryId: image.shotImageEntryId,
                framePosition,
                fromCurrentPositions: currentPositions.has(image.shotImageEntryId),
                currentPositionsValue: currentPositions.get(image.shotImageEntryId),
                fallbackCalculation: !currentPositions.has(image.shotImageEntryId) ? `${idx} * 50 = ${idx * 50}` : null,
                currentPositionsSize: currentPositions.size,
                allCurrentPositionsKeys: Array.from(currentPositions.keys()).map(k => k.substring(0, 8))
              });
            }

            // [Position0Debug] Only log position 0 items to reduce noise
            if (framePosition === 0) {
              console.log(`[Position0Debug] 🎬 POSITION 0 ITEM RENDERING:`, {
                idx,
                imageId: image.shotImageEntryId.substring(0, 8),
                framePosition,
                coordinateSystem: { fullMin, fullMax, fullRange },
                fromCurrentPositions: currentPositions.has(image.shotImageEntryId),
                currentPositionsValue: currentPositions.get(image.shotImageEntryId)
              });
            }

            return (
              <TimelineItem
                key={image.shotImageEntryId}
                image={image}
                framePosition={framePosition}
                isDragging={isDragging}
                isSwapTarget={swapTargetId === image.shotImageEntryId}
                dragOffset={isDragging ? dragOffset : null}
                onMouseDown={(e) => handleMouseDown(e, image.shotImageEntryId, containerRef)}
                onDoubleClick={isMobile ? undefined : () => handleDesktopDoubleClick(idx)}
                onMobileTap={isMobile ? () => handleMobileTap(idx) : undefined}
                zoomLevel={zoomLevel}
                timelineWidth={containerWidth}
                fullMinFrames={fullMin}
                fullRange={fullRange}
                currentDragFrame={isDragging ? currentDragFrame : null}
                dragDistances={isDragging ? dragDistances : null}
                maxAllowedGap={maxAllowedGap}
                originalFramePos={framePositions.get(image.shotImageEntryId) ?? 0}
                onDelete={onImageDelete}
                onDuplicate={onImageDuplicate}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                projectAspectRatio={projectAspectRatio}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TimelineContainer;
