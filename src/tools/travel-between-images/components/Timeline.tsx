import React, { useState, useEffect, useRef, useCallback } from "react";
import { GenerationRow } from "@/types/shots";
import { toast } from "sonner";
import MediaLightbox from "@/shared/components/MediaLightbox";
import { useIsMobile } from "@/shared/hooks/use-mobile";

// Import hooks
import { useZoom } from "./Timeline/hooks/useZoom";
import { useFileDrop } from "./Timeline/hooks/useFileDrop";
import { useTimelineDrag } from "./Timeline/hooks/useTimelineDrag";
// Import our database-backed position management
import { useEnhancedShotPositions } from "@/shared/hooks/useEnhancedShotPositions";

// Import components
import TimelineControls from "./Timeline/TimelineControls";
import TimelineRuler from "./Timeline/TimelineRuler";
import DropIndicator from "./Timeline/DropIndicator";
import PairRegion from "./Timeline/PairRegion";
import TimelineItem from "./Timeline/TimelineItem";

// Import utils
import { 
  getTimelineDimensions, 
  calculateMaxGap, 
  getPairInfo 
} from "./Timeline/utils/timeline-utils";

// Main Timeline component props
export interface TimelineProps {
  shotId: string;
  frameSpacing: number;
  contextFrames: number;
  onImageReorder: (orderedIds: string[]) => void;
  onImageSaved: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>;
  onContextFramesChange: (context: number) => void;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
  onImageDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  pendingPositions?: Map<string, number>;
  onPendingPositionApplied?: (generationId: string) => void;
  // Shared data props to prevent hook re-instantiation
  shotGenerations?: import("@/shared/hooks/useEnhancedShotPositions").ShotGeneration[];
  updateTimelineFrame?: (generationId: string, frame: number) => Promise<void>;
  images?: GenerationRow[];
  // Callback to reload parent data after timeline changes
  onTimelineChange?: () => Promise<void>;
}

/**
 * Refactored Timeline component with hooks and smaller components
 */
const Timeline: React.FC<TimelineProps> = ({
  shotId,
  frameSpacing,
  contextFrames,
  onImageReorder,
  onImageSaved,
  onContextFramesChange,
  onFramePositionsChange,
  onImageDrop,
  pendingPositions,
  onPendingPositionApplied,
  // Shared data props
  shotGenerations: propShotGenerations,
  updateTimelineFrame: propUpdateTimelineFrame,
  images: propImages,
  onTimelineChange
}) => {
  // Enhanced Timeline performance tracking with prop change detection
  const renderCountRef = React.useRef(0);
  const prevPropsRef = React.useRef<any>();

  React.useEffect(() => {
    renderCountRef.current++;
    const currentProps = {
      shotId,
      frameSpacing,
      contextFrames,
      propShotGenerations: propShotGenerations ? propShotGenerations.length : null,
      propUpdateTimelineFrame: !!propUpdateTimelineFrame,
      propImages: propImages ? propImages.length : null
    };
    
    const prevProps = prevPropsRef.current;
    // Only log the first few renders to debug mount issues
    if (renderCountRef.current <= 5) {
      console.log('[PositionSystemDebug] 🔄 TIMELINE RENDER #' + renderCountRef.current, {
        ...currentProps,
        // Prop change analysis (only show if previous props exist)
        ...(prevProps ? {
          shotIdChanged: shotId !== prevProps.shotId,
          frameSpacingChanged: frameSpacing !== prevProps.frameSpacing,
          contextFramesChanged: contextFrames !== prevProps.contextFrames,
          propShotGenerationsChanged: propShotGenerations !== prevProps.propShotGenerations,
          propUpdateTimelineFrameChanged: propUpdateTimelineFrame !== prevProps.propUpdateTimelineFrame,
          propImagesChanged: propImages !== prevProps.propImages,
          // Reference equality checks
          propShotGenerationsRef: propShotGenerations === prevProps.propShotGenerations ? 'SAME' : 'DIFFERENT',
          propImagesRef: propImages === prevProps.propImages ? 'SAME' : 'DIFFERENT'
        } : { firstRender: true })
      });
    }
    
    prevPropsRef.current = currentProps;
  });
  // Core state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialContextFrames = useRef(contextFrames);

  // Use shared data if provided, otherwise fallback to hook (for backward compatibility)
  const hookData = useEnhancedShotPositions(propShotGenerations ? null : shotId);
  const shotGenerations = propShotGenerations || hookData.shotGenerations;
  const updateTimelineFrame = propUpdateTimelineFrame || hookData.updateTimelineFrame;
  const initializeTimelineFrames = hookData.initializeTimelineFrames;
  const isLoading = propShotGenerations ? false : hookData.isLoading; // If props provided, not loading
  
  // Important: If using shared data, we need to ensure parent reloads when we make changes
  const parentLoadPositions = propShotGenerations ? hookData.loadPositions : null;
  
  // Use provided images or generate from shotGenerations
  const images = propImages || React.useMemo(() => {
    const timelineImages = shotGenerations
      .filter(sg => sg.generation)
      .map(sg => ({
        id: sg.generation_id,
        shotImageEntryId: sg.id,
        imageUrl: sg.generation?.location,
        thumbUrl: sg.generation?.location,
        location: sg.generation?.location,
        type: sg.generation?.type,
        createdAt: sg.generation?.created_at,
        position: sg.position,
        timeline_frame: sg.timeline_frame,
        metadata: sg.metadata
      } as GenerationRow & { position: number; timeline_frame?: number }));

    // Sort by timeline_frame, fallback to calculated frame
    return timelineImages.sort((a, b) => {
      const frameA = a.timeline_frame ?? (a.position * frameSpacing);
      const frameB = b.timeline_frame ?? (b.position * frameSpacing);
      return frameA - frameB;
    });
  }, [shotGenerations, frameSpacing]);
  
  // Convert database timeline_frame values to Timeline-compatible Map
  // Keep previous positions during loading to prevent flicker
  const [stablePositions, setStablePositions] = React.useState<Map<string, number>>(new Map());
  
  // Track dependency changes with refs
  const prevDepsRef = React.useRef<{
    shotGenerations: any;
    images: any;
    frameSpacing: number;
    shotId: string;
  }>();

  const framePositions = React.useMemo(() => {
    const currentDeps = { shotGenerations, images, frameSpacing, shotId };
    const prevDeps = prevDepsRef.current;
    
    console.log('[PositionSystemDebug] 🔄 RECALCULATING framePositions useMemo:', {
      shotId: shotId.substring(0, 8),
      shotGenerationsLength: shotGenerations.length,
      imagesLength: images.length,
      frameSpacing,
      isLoading,
      // Dependency change analysis
      shotGenerationsChanged: prevDeps ? shotGenerations !== prevDeps.shotGenerations : true,
      imagesChanged: prevDeps ? images !== prevDeps.images : true,
      frameSpacingChanged: prevDeps ? frameSpacing !== prevDeps.frameSpacing : true,
      shotIdChanged: prevDeps ? shotId !== prevDeps.shotId : true,
      // Reference checks
      shotGenerationsRef: shotGenerations === prevDeps?.shotGenerations ? 'SAME_REF' : 'DIFF_REF',
      imagesRef: images === prevDeps?.images ? 'SAME_REF' : 'DIFF_REF'
    });
    
    prevDepsRef.current = currentDeps;
    
    const positions = new Map<string, number>();
    
    shotGenerations.forEach(sg => {
      const matchingImage = images.find(img => img.id === sg.generation_id);
      if (matchingImage) {
        if (sg.timeline_frame !== null && sg.timeline_frame !== undefined) {
          positions.set(matchingImage.shotImageEntryId, sg.timeline_frame);
        } else {
          // Initialize with position * frameSpacing if no timeline_frame
          positions.set(matchingImage.shotImageEntryId, sg.position * frameSpacing);
        }
      }
    });

    console.log('[PositionSystemDebug] 📊 TIMELINE frame positions from database:', {
      shotId: shotId.substring(0, 8),
      positionsCount: positions.size,
      positions: Array.from(positions.entries()).map(([id, frame]) => ({
        id: id.substring(0, 8),
        frame
      })),
      isLoading
    });
    
    return positions;
  }, [shotGenerations, images, frameSpacing, shotId]);

  // Update stable positions when not loading, separate from useMemo
  React.useEffect(() => {
    if (!isLoading && framePositions.size > 0) {
      setStablePositions(framePositions);
    }
  }, [framePositions, isLoading]);

  // Auto-initialize timeline frames for existing shots that don't have them
  React.useEffect(() => {
    if (isLoading || !shotGenerations || shotGenerations.length === 0) return;

    // Check if any items are missing timeline_frame values
    const itemsWithoutFrames = shotGenerations.filter(sg => 
      sg.timeline_frame === null || sg.timeline_frame === undefined
    );

    if (itemsWithoutFrames.length > 0) {
      console.log('[PositionSystemDebug] 🚀 Auto-initializing timeline frames for existing shot:', {
        shotId: shotId.substring(0, 8),
        totalItems: shotGenerations.length,
        itemsNeedingInitialization: itemsWithoutFrames.length,
        defaultFrameSpacing: 60
      });

      // Use the proper default frame spacing (60) instead of current UI frameSpacing
      initializeTimelineFrames(60).catch(error => {
        console.error('[PositionSystemDebug] ❌ Failed to auto-initialize timeline frames:', error);
      });
    }
  }, [isLoading, shotGenerations, shotId, initializeTimelineFrames]);

  // Use stable positions during loading to prevent flicker
  const displayPositions = React.useMemo(() => {
    // Use stable positions if we have them and we're loading, OR if the fresh positions are empty/different
    const useStable = (isLoading && stablePositions.size > 0) || 
                     (stablePositions.size > 0 && framePositions.size === 0);
    
    if (useStable) {
      console.log('[PositionSystemDebug] ⏳ TIMELINE keeping stable positions:', {
        shotId: shotId.substring(0, 8),
        stableCount: stablePositions.size,
        freshCount: framePositions.size,
        isLoading,
        reason: isLoading ? 'loading' : 'fresh_positions_empty'
      });
      return stablePositions;
    }
    
    // If fresh positions are available and different from stable, use fresh
    if (framePositions.size > 0) {
      console.log('[PositionSystemDebug] 🔄 TIMELINE using fresh positions:', {
        shotId: shotId.substring(0, 8),
        freshCount: framePositions.size,
        isLoading
      });
    }
    
    return framePositions;
  }, [isLoading, stablePositions, framePositions, shotId]);

  // Database-backed setFramePositions function
  const setFramePositions = React.useCallback(async (newPositions: Map<string, number>) => {
    console.log('[PositionSystemDebug] 🎯 TIMELINE updating positions to database:', {
      shotId: shotId.substring(0, 8),
      positionsCount: newPositions.size,
    });

    // IMMEDIATELY update stable positions to prevent visual glitches during database update
    setStablePositions(new Map(newPositions));
    console.log('[PositionSystemDebug] 🎭 TIMELINE immediately updated stable positions for smooth transition');

    // Update database for each changed position
    const updatePromises: Promise<void>[] = [];
    newPositions.forEach((newFrame, shotImageEntryId) => {
      const currentFrame = displayPositions.get(shotImageEntryId);
      if (currentFrame !== newFrame) {
        // Find the generation ID from shotImageEntryId
        const matchingImage = images.find(img => img.shotImageEntryId === shotImageEntryId);
        if (matchingImage) {
          updatePromises.push(updateTimelineFrame(matchingImage.id, newFrame));
        }
      }
    });

    // Wait for all updates to complete
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      
      // If using shared data, trigger parent reload
      if (propShotGenerations && onTimelineChange) {
        await onTimelineChange();
      }
    }

    // Also call the original callback if provided
    if (onFramePositionsChange) {
      onFramePositionsChange(newPositions);
    }
  }, [displayPositions, images, updateTimelineFrame, onFramePositionsChange, shotId, propShotGenerations, onTimelineChange]);

  // Calculate dimensions
  const { fullMin, fullMax, fullRange } = getTimelineDimensions(displayPositions);

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
    framePositions: displayPositions,
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
  const doubleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

            const contextStartFrameUnclipped = actualEndFrame - contextFrames;
            const contextStartFrame = Math.max(0, contextStartFrameUnclipped);
            const visibleContextFrames = Math.max(0, actualEndFrame - contextStartFrame);
            
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
                originalFramePos={displayPositions.get(image.shotImageEntryId) ?? 0}
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
          onImageSaved={async (newUrl: string, createNew?: boolean) => await onImageSaved(images[lightboxIndex].id, newUrl, createNew)}
          showNavigation={true}
          showMagicEdit={true}
          hasNext={lightboxIndex < images.length - 1}
          hasPrevious={lightboxIndex > 0}
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