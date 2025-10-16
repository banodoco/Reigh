import React, { useRef, useState, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { calculateMaxGap, getPairInfo, getTimelineDimensions, pixelToFrame } from './utils/timeline-utils';
import { timelineDebugger } from './utils/timeline-debug';
import { framesToSeconds } from './utils/time-utils';
import type { VideoMetadata } from '@/shared/lib/videoUploader';

// Import components
import TimelineRuler from './TimelineRuler';
import DropIndicator from './DropIndicator';
import PairRegion from './PairRegion';
import TimelineItem from './TimelineItem';
import { GuidanceVideoStrip } from './GuidanceVideoStrip';
import { GuidanceVideoUploader } from './GuidanceVideoUploader';
import { MagicEditModal } from '@/shared/components/MagicEditModal';
import { getDisplayUrl } from '@/shared/lib/utils';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from './constants';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Plus } from 'lucide-react';

// Import hooks
import { useZoom } from './hooks/useZoom';
import { useFileDrop } from './hooks/useFileDrop';
import { useTimelineDrag } from './hooks/useTimelineDrag';
import { useGlobalEvents } from './hooks/useGlobalEvents';

interface TimelineContainerProps {
  shotId: string;
  projectId?: string;
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
  enhancedPrompts?: Record<number, string>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  // Action handlers
  onImageDelete: (imageId: string) => void;
  onImageDuplicate: (imageId: string, timeline_frame: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
  // Lightbox handlers
  handleDesktopDoubleClick: (idx: number) => void;
  handleMobileTap: (idx: number) => void;
  // Structure video props
  structureVideoPath?: string | null;
  structureVideoMetadata?: VideoMetadata | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'flow' | 'canny' | 'depth';
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'flow' | 'canny' | 'depth'
  ) => void;
  // Auto-create individual prompts flag
  autoCreateIndividualPrompts?: boolean;
  // Empty state flag for blur effect
  hasNoImages?: boolean;
  // Read-only mode - disables all interactions
  readOnly?: boolean;
}

const TimelineContainer: React.FC<TimelineContainerProps> = ({
  shotId,
  projectId,
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
  enhancedPrompts,
  defaultPrompt,
  defaultNegativePrompt,
  onClearEnhancedPrompt,
  onImageDelete,
  onImageDuplicate,
  readOnly = false,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  handleDesktopDoubleClick,
  handleMobileTap,
  structureVideoPath,
  structureVideoMetadata,
  structureVideoTreatment = 'adjust',
  structureVideoMotionStrength = 1.0,
  structureVideoType = 'flow',
  onStructureVideoChange,
  autoCreateIndividualPrompts,
  hasNoImages = false
}) => {
  // Local state for reset gap
  const [resetGap, setResetGap] = useState<number>(50);
  const maxGap = Math.max(1, 81 - contextFrames);
  
  // Magic Edit Modal state - lifted from TimelineItem to avoid z-index and event handling issues
  const [isMagicEditOpen, setIsMagicEditOpen] = useState(false);
  const [magicEditImageUrl, setMagicEditImageUrl] = useState<string>('');
  const [magicEditShotGenerationId, setMagicEditShotGenerationId] = useState<string>('');
  
  // File input ref for Add Images button
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Adjust resetGap when contextFrames changes to keep it within valid range
  useEffect(() => {
    if (resetGap > maxGap) {
      setResetGap(maxGap);
    }
  }, [contextFrames, maxGap, resetGap]);
  
  // Handle reset button click
  const handleReset = () => {
    onResetFrames(resetGap, contextFrames);
  };
  
  // Handle opening magic edit modal - called from TimelineItem
  const handleOpenMagicEdit = (imageUrl: string, shotGenerationId: string) => {
    console.log('[MagicEditModal] Opening modal at TimelineContainer level:', {
      imageUrl: imageUrl.substring(0, 50),
      shotGenerationId: shotGenerationId.substring(0, 8)
    });
    setMagicEditImageUrl(imageUrl);
    setMagicEditShotGenerationId(shotGenerationId);
    setIsMagicEditOpen(true);
  };
  
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
  const baseContainerWidth = containerRef.current?.clientWidth || 1000;
  // Adjust container width for zoom level to match video strip calculations
  const containerWidth = baseContainerWidth;

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
    zoomCenter,
    viewport,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,
    handleWheel,
    isZooming,
  } = useZoom({ fullMin, fullMax, fullRange });

  // Custom zoom handlers to zoom anchored to the leftmost part of timeline
  const handleZoomInToCenter = () => {
    // Zoom anchored to the leftmost frame
    handleZoomIn(fullMin);
  };

  const handleZoomOutFromCenter = () => {
    // Zoom anchored to the leftmost frame
    handleZoomOut(fullMin);
  };

  // Force re-render when zoom changes to update containerWidth measurement
  const [, forceUpdate] = useState({});
  useEffect(() => {
    // Small delay to allow DOM to reflow after zoom change
    const timer = setTimeout(() => {
      forceUpdate({});
    }, 0);
    return () => clearTimeout(timer);
  }, [zoomLevel]);

  // Preserve scroll position when timeline dimensions change (e.g., when tasks complete)
  // Track previous scroll position and timeline dimensions
  const prevScrollStateRef = useRef<{
    scrollLeft: number;
    scrollFraction: number;
    fullRange: number;
    fullMin: number;
  } | null>(null);

  useEffect(() => {
    // Skip during active zooming or dragging - those have their own scroll management
    if (isZooming || dragState.isDragging) {
      return;
    }

    const scrollContainer = timelineRef.current;
    const timelineContainer = containerRef.current;
    
    if (!scrollContainer || !timelineContainer) return;

    // Only preserve scroll when zoomed in
    if (zoomLevel <= 1) {
      prevScrollStateRef.current = null;
      return;
    }

    // Get current state
    const currentScrollLeft = scrollContainer.scrollLeft;
    const currentScrollWidth = timelineContainer.scrollWidth;
    const currentScrollFraction = currentScrollWidth > 0 ? currentScrollLeft / currentScrollWidth : 0;

    // Check if timeline dimensions changed
    const prev = prevScrollStateRef.current;
    const dimensionsChanged = prev && (prev.fullRange !== fullRange || prev.fullMin !== fullMin);

    if (dimensionsChanged && prev) {
      // Timeline dimensions changed - restore scroll position proportionally
      const timer = setTimeout(() => {
        const scrollContainer = timelineRef.current;
        const timelineContainer = containerRef.current;
        
        if (!scrollContainer || !timelineContainer) return;

        const newScrollWidth = timelineContainer.scrollWidth;
        const restoredScrollLeft = prev.scrollFraction * newScrollWidth;

        scrollContainer.scrollTo({
          left: Math.max(0, restoredScrollLeft),
          behavior: 'instant'
        });
      }, 10);

      return () => clearTimeout(timer);
    }

    // Save current state for next comparison
    prevScrollStateRef.current = {
      scrollLeft: currentScrollLeft,
      scrollFraction: currentScrollFraction,
      fullRange,
      fullMin
    };
  }, [fullRange, fullMin, zoomLevel, isZooming, dragState.isDragging]);

  // Scroll timeline to center on zoom center when zooming
  // IMPORTANT: Don't adjust scroll during drag operations to prevent view jumping
  // CRITICAL: Only adjust scroll when actively zooming, NOT when timeline dimensions change
  useEffect(() => {
    // Skip scroll adjustment if a drag is in progress or if the change is not from zooming
    if (dragState.isDragging || !isZooming) {
      return;
    }
    
    if (zoomLevel > 1 && timelineRef.current && containerRef.current) {
      // Small delay to allow DOM to reflow after zoom, then instantly scroll
      const timer = setTimeout(() => {
        const scrollContainer = timelineRef.current;
        const timelineContainer = containerRef.current;
        
        if (!scrollContainer || !timelineContainer) return;
        
        // Get dimensions
        const scrollWidth = timelineContainer.scrollWidth;
        const scrollContainerWidth = scrollContainer.clientWidth;
        
        // Calculate where the zoom center is in pixels within the zoomed timeline
        const centerFraction = (zoomCenter - fullMin) / fullRange;
        const centerPixelInZoomedTimeline = centerFraction * scrollWidth;
        
        // Scroll so the center point is in the middle of the viewport
        const targetScroll = centerPixelInZoomedTimeline - (scrollContainerWidth / 2);
        
        // Use instant scroll for immediate zoom-to-position effect (no two-step animation)
        scrollContainer.scrollTo({
          left: Math.max(0, targetScroll),
          behavior: 'instant'
        });
      }, 10); // Small delay to ensure DOM has reflowed
      
      return () => clearTimeout(timer);
    }
  }, [zoomLevel, zoomCenter, dragState.isDragging, isZooming]);

  // File drop hook
  const {
    isFileOver,
    dropTargetFrame,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useFileDrop({ onImageDrop, fullMin, fullRange });

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

  // Calculate whether to show pair labels globally
  // Check if the average pair has enough space for labels
  const calculateShowPairLabels = () => {
    if (images.length < 2) return false;
    
    // Calculate average pair width in pixels
    const sortedPositions = [...currentPositions.entries()].sort((a, b) => a[1] - b[1]);
    let totalPairWidth = 0;
    let pairCount = 0;
    
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      const [, startFrame] = sortedPositions[i];
      const [, endFrame] = sortedPositions[i + 1];
      const frameWidth = endFrame - startFrame;
      
      // Convert to pixels using consistent coordinate system
      const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
      const pixelWidth = (frameWidth / fullRange) * effectiveWidth * zoomLevel;
      
      totalPairWidth += pixelWidth;
      pairCount++;
    }
    
    const avgPairWidth = pairCount > 0 ? totalPairWidth / pairCount : 0;
    const minLabelWidth = 100; // Minimum pixels needed for label to be comprehensible
    
    return avgPairWidth >= minLabelWidth;
  };
  
  const showPairLabels = calculateShowPairLabels();

  return (
    <div className="w-full overflow-x-hidden relative">
      {/* Timeline wrapper with fixed overlays */}
      <div className="relative">
        {/* Fixed top controls overlay */}
        {shotId && projectId && onStructureVideoChange && structureVideoPath && structureVideoMetadata && (
          <div
            className="sticky left-0 right-0 z-30 flex items-center justify-between pointer-events-none px-8"
            style={{ top: '55px' }}
          >
            {/* Top-left: Zoom controls (always visible, even in read-only) */}
            <div className={`flex items-center gap-2 w-fit pointer-events-auto bg-background/95 backdrop-blur-sm px-2 py-1 rounded shadow-md border border-border/50 ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}>
              <span className="text-xs text-muted-foreground">Zoom: {zoomLevel.toFixed(1)}x</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomToStart}
                className="h-7 text-xs px-2"
              >
                ← Start
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomOutFromCenter}
                disabled={zoomLevel <= 1}
                className="h-7 w-7 p-0"
              >
                −
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomInToCenter}
                className="h-7 w-7 p-0"
              >
                +
              </Button>
              <Button
                variant={zoomLevel > 1.5 ? "default" : "outline"}
                size="sm"
                onClick={handleZoomReset}
                disabled={zoomLevel <= 1}
                className={`h-7 text-xs px-2 transition-all ${
                  zoomLevel > 3 ? 'animate-pulse ring-2 ring-primary' : 
                  zoomLevel > 1.5 ? 'ring-1 ring-primary/50' : ''
                }`}
                style={{
                  transform: zoomLevel > 1.5 ? `scale(${Math.min(1 + (zoomLevel - 1.5) * 0.08, 1.3)})` : 'scale(1)',
                }}
              >
                Reset
              </Button>
            </div>
            
            {/* Top-right: Structure controls (hidden in read-only mode) */}
            {!readOnly && (
            <div className={`flex items-center gap-1.5 pointer-events-auto ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}>
              {/* Structure type selector */}
              <Select value={structureVideoType} onValueChange={(type: 'flow' | 'canny' | 'depth') => {
                onStructureVideoChange(structureVideoPath, structureVideoMetadata, structureVideoTreatment, structureVideoMotionStrength, type);
              }}>
                <SelectTrigger className="h-6 w-[90px] text-[9px] px-2 py-0 border-muted-foreground/30 text-left [&>span]:line-clamp-none [&>span]:whitespace-nowrap">
                  <SelectValue>
                    {structureVideoType === 'flow' ? 'Optical flow' : structureVideoType === 'canny' ? 'Canny' : 'Depth'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flow">
                    <span className="text-xs">Optical flow</span>
                  </SelectItem>
                  <SelectItem value="canny">
                    <span className="text-xs">Canny</span>
                  </SelectItem>
                  <SelectItem value="depth">
                    <span className="text-xs">Depth</span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Strength compact display */}
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-muted/50 rounded text-xs">
                <span className="text-muted-foreground">Strength:</span>
                <span className={`font-medium ${
                  structureVideoMotionStrength < 0.5 ? 'text-amber-500' :
                  structureVideoMotionStrength > 1.5 ? 'text-blue-500' :
                  'text-foreground'
                }`}>
                  {structureVideoMotionStrength.toFixed(1)}x
                </span>
              </div>

              {/* Strength slider (compact) */}
              <div className="w-16">
                <Slider
                  value={[structureVideoMotionStrength]}
                  onValueChange={([value]) => {
                    onStructureVideoChange(structureVideoPath, structureVideoMetadata, structureVideoTreatment, value, structureVideoType);
                  }}
                  min={0}
                  max={2}
                  step={0.1}
                  className="h-4"
                />
              </div>
            </div>
            )}
          </div>
        )}

        {/* Timeline scrolling container */}
        <div
          ref={timelineRef}
          className={`timeline-scroll relative bg-muted/20 border rounded-lg px-5 overflow-x-auto mb-10 ${zoomLevel <= 1 ? 'no-scrollbar' : ''} ${
            isFileOver ? 'ring-2 ring-primary bg-primary/5' : ''
          }`}
          style={{ 
            minHeight: "240px", 
            paddingTop: structureVideoPath && structureVideoMetadata ? "4rem" : "1rem", 
            paddingBottom: "4.5rem" 
          }}
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

        {/* Structure video strip or uploader (hidden in read-only mode) */}
        {!readOnly && shotId && projectId && onStructureVideoChange && (
          structureVideoPath && structureVideoMetadata ? (
            <GuidanceVideoStrip
              videoUrl={structureVideoPath}
              videoMetadata={structureVideoMetadata}
              treatment={structureVideoTreatment}
              motionStrength={structureVideoMotionStrength}
              onTreatmentChange={(treatment) => {
                onStructureVideoChange(structureVideoPath, structureVideoMetadata, treatment, structureVideoMotionStrength, structureVideoType);
              }}
              onMotionStrengthChange={(strength) => {
                onStructureVideoChange(structureVideoPath, structureVideoMetadata, structureVideoTreatment, strength, structureVideoType);
              }}
              onRemove={() => {
                onStructureVideoChange(null, null, 'adjust', 1.0, 'flow');
              }}
              fullMin={fullMin}
              fullMax={fullMax}
              fullRange={fullRange}
              containerWidth={containerWidth}
              zoomLevel={zoomLevel}
              timelineFrameCount={images.length}
              frameSpacing={contextFrames}
            />
          ) : (
            <GuidanceVideoUploader
              shotId={shotId}
              projectId={projectId}
              onVideoUploaded={(videoUrl, metadata) => {
                if (videoUrl && metadata) {
                  onStructureVideoChange(videoUrl, metadata, structureVideoTreatment, structureVideoMotionStrength, structureVideoType);
                }
              }}
              currentVideoUrl={structureVideoPath}
              compact={false}
              zoomLevel={zoomLevel}
              onZoomIn={handleZoomInToCenter}
              onZoomOut={handleZoomOutFromCenter}
              onZoomReset={handleZoomReset}
              onZoomToStart={handleZoomToStart}
              hasNoImages={hasNoImages}
            />
          )
        )}

        {/* Timeline container - visually connected to structure video above */}
        <div
          ref={containerRef}
          id="timeline-container"
          className={`relative h-36 mb-10`}
          onDoubleClick={(e) => handleTimelineDoubleClick(e, containerRef)}
          style={{
            width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
            minWidth: "100%",
            userSelect: 'none',
            paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
            paddingRight: `${TIMELINE_HORIZONTAL_PADDING + 60}px`,
          }}
        >
          {/* Ruler - positioned inside timeline container to match image coordinate space */}
          <TimelineRuler
            fullMin={fullMin}
            fullMax={fullMax}
            fullRange={fullRange}
            zoomLevel={zoomLevel}
            containerWidth={containerWidth}
            hasNoImages={hasNoImages}
          />

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

              // Use the same coordinate system as TimelineItem and TimelineRuler
              // This ensures pair regions align perfectly with images
              const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
              const basePixel = TIMELINE_PADDING_OFFSET + ((framePos - fullMin) / fullRange) * effectiveWidth;
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
            const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
            const contextStartPixel = TIMELINE_PADDING_OFFSET + ((contextStartFrame - fullMin) / fullRange) * effectiveWidth;
            const contextStartPercent = (contextStartPixel / containerWidth) * 100;

            const generationStartPixel = TIMELINE_PADDING_OFFSET + ((pair.generationStart - fullMin) / fullRange) * effectiveWidth;
            const generationStartPercent = (generationStartPixel / containerWidth) * 100;

            // CRITICAL: Get the first image in this pair to read its metadata
            const startImage = images.find(img => img.shotImageEntryId === startEntry?.[0]);
            
            // Read pair prompts from props first, then fallback to metadata
            // Props take precedence when passed (used during batch generation setup)
            const pairPromptFromMetadata = (startImage as any)?.metadata?.pair_prompt || '';
            const pairNegativePromptFromMetadata = (startImage as any)?.metadata?.pair_negative_prompt || '';
            
            // Enhanced prompt: use prop if provided, otherwise fallback to metadata
            const enhancedPromptFromProps = enhancedPrompts?.[index] || '';
            const enhancedPromptFromMetadata = (startImage as any)?.metadata?.enhanced_prompt || '';
            const actualEnhancedPrompt = enhancedPromptFromProps || enhancedPromptFromMetadata;

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
                pairPrompt={pairPromptFromMetadata}
                pairNegativePrompt={pairNegativePromptFromMetadata}
                enhancedPrompt={actualEnhancedPrompt}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
                showLabel={showPairLabels}
                autoCreateIndividualPrompts={autoCreateIndividualPrompts || false}
                onClearEnhancedPrompt={onClearEnhancedPrompt}
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
                onMouseDown={readOnly ? undefined : (e) => handleMouseDown(e, image.shotImageEntryId, containerRef)}
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
                onMagicEdit={handleOpenMagicEdit}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                projectAspectRatio={projectAspectRatio}
                readOnly={readOnly}
              />
            );
          })}
        </div>
        </div>

        {/* Fixed bottom controls overlay - gap and add images (hidden in read-only mode) */}
        {!readOnly && (
        <div
          className="sticky left-0 right-0 z-30 flex items-center justify-between pointer-events-none px-8"
          style={{ bottom: '90px' }}
        >
          {/* Bottom-left: Gap control and Reset button */}
          <div 
            className={`flex items-center gap-2 w-fit pointer-events-auto ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}
          >
            {/* Gap to reset */}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Gap: {framesToSeconds(resetGap)}</Label>
              <Slider
                value={[resetGap]}
                onValueChange={([value]) => setResetGap(value)}
                min={1}
                max={maxGap}
                step={1}
                className="w-24 h-4"
              />
            </div>

            {/* Reset button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-7 text-xs px-2"
            >
              Reset
            </Button>
          </div>

          {/* Bottom-right: Add Images button */}
          {onImageDrop ? (
            <div 
              className={`pointer-events-auto ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    onImageDrop(files);
                    e.target.value = ''; // Reset input
                  }
                }}
                className="hidden"
                id="timeline-image-upload"
              />
              <Label htmlFor="timeline-image-upload" className="m-0 cursor-pointer">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-3 sm:px-2 lg:px-3"
                  asChild
                >
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    <span className="sm:hidden lg:inline">Add Images</span>
                  </span>
                </Button>
              </Label>
            </div>
          ) : <div />}
        </div>
        )}
      </div>
      
      {/* Magic Edit Modal - rendered at TimelineContainer level to avoid event handling conflicts */}
      <MagicEditModal
        isOpen={isMagicEditOpen}
        imageUrl={magicEditImageUrl}
        onClose={() => {
          console.log('[MagicEditModal] Closing modal at TimelineContainer level');
          setIsMagicEditOpen(false);
          setMagicEditImageUrl('');
          setMagicEditShotGenerationId('');
        }}
        shotGenerationId={magicEditShotGenerationId}
      />
    </div>
  );
};

export default TimelineContainer;
