import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { GenerationRow } from "@/types/shots";
import { toast } from "sonner";
import MediaLightbox from "@/shared/components/MediaLightbox";
import { useIsMobile } from "@/shared/hooks/use-mobile";

// Clear legacy timeline cache on import
import "@/utils/clearTimelineCache";

// Import our extracted hooks and components
import { usePositionManagement } from "./Timeline/hooks/usePositionManagement";
import { useCoordinateSystem } from "./Timeline/hooks/useCoordinateSystem";
import { useLightbox } from "./Timeline/hooks/useLightbox";
import { useEnhancedShotPositions } from "@/shared/hooks/useEnhancedShotPositions";
import { timelineDebugger } from "./Timeline/utils/timeline-debug";
import { calculateMaxGap } from "./Timeline/utils/timeline-utils";
import { useExternalGenerations } from "@/shared/components/ShotImageManager/hooks/useExternalGenerations";
import { useDerivedNavigation } from "@/shared/hooks/useDerivedNavigation";

// Import components
import TimelineControls from "./Timeline/TimelineControls";
import TimelineContainer from "./Timeline/TimelineContainer";

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
  // Shared hook data to prevent creating duplicate hook instances
  hookData?: import("@/shared/hooks/useEnhancedShotPositions").UseEnhancedShotPositionsReturn;
  // Pair-specific prompt editing
  onPairClick?: (pairIndex: number, pairData: {
    index: number;
    frames: number;
    startFrame: number;
    endFrame: number;
    startImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      timeline_frame: number;
      position: number;
    } | null;
    endImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      timeline_frame: number;
      position: number;
    } | null;
  }) => void;
  // Pair prompt data for display (optional - will use database if not provided)
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

/**
 * Refactored Timeline component with extracted hooks and modular architecture
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
  onTimelineChange,
  hookData: propHookData,
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
  
  // Core state
  const [isPersistingPositions, setIsPersistingPositions] = useState<boolean>(false);
  const [isDragInProgress, setIsDragInProgress] = useState<boolean>(false);
  
  // Refs
  // Refs (removed initialContextFrames - no longer needed for auto-adjustment)
  
  // Enhanced Timeline performance tracking
  const renderCountRef = useRef(0);
  const prevPropsRef = useRef<any>();

  useEffect(() => {
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
    if (renderCountRef.current <= 3) {
      timelineDebugger.logRender(`Timeline render #${renderCountRef.current}`, {
        shotId,
        ...currentProps,
        // Prop change analysis (only show if previous props exist)
        ...(prevProps ? {
          shotIdChanged: shotId !== prevProps.shotId,
          frameSpacingChanged: frameSpacing !== prevProps.frameSpacing,
          contextFramesChanged: contextFrames !== prevProps.contextFrames,
          propShotGenerationsChanged: propShotGenerations !== prevProps.propShotGenerations,
          propUpdateTimelineFrameChanged: propUpdateTimelineFrame !== prevProps.propUpdateTimelineFrame,
          propImagesChanged: propImages !== prevProps.propImages
        } : { firstRender: true })
      });
    }
    
    prevPropsRef.current = currentProps;
  });

  // Use shared hook data if provided, otherwise create new instance (for backward compatibility)
  const hookData = propHookData || useEnhancedShotPositions(shotId, isDragInProgress);
  const shotGenerations = propShotGenerations || hookData.shotGenerations;
  const updateTimelineFrame = propUpdateTimelineFrame || hookData.updateTimelineFrame;
  const batchExchangePositions = hookData.batchExchangePositions; // Always use hook for exchanges
  const initializeTimelineFrames = hookData.initializeTimelineFrames;

  // Get pair prompts from database instead of props (now reactive)
  const databasePairPrompts = hookData.pairPrompts;
  const actualPairPrompts = pairPrompts || databasePairPrompts; // Fallback to props for backward compatibility
  const isLoading = propShotGenerations ? false : hookData.isLoading; // If props provided, never show loading (shared data)
  
  // Use provided images or generate from shotGenerations
  const images = React.useMemo(() => {
    if (propImages) return propImages;
    
    const imagesWithPositions = shotGenerations
      .filter(sg => sg.generation)
      .map(sg => ({
        id: sg.generation_id,
        shotImageEntryId: sg.id,
        imageUrl: sg.generation?.location,
        thumbUrl: sg.generation?.location,
        location: sg.generation?.location,
        type: sg.generation?.type,
        createdAt: sg.generation?.created_at,
        timeline_frame: sg.timeline_frame,
        metadata: sg.metadata
      } as GenerationRow & { timeline_frame?: number }));

    // Sort by timeline_frame only (no position fallback needed)
    return imagesWithPositions.sort((a, b) => {
      const frameA = a.timeline_frame ?? 0;
      const frameB = b.timeline_frame ?? 0;
      return frameA - frameB;
    });
  }, [shotGenerations, frameSpacing, propImages]);

  // Position management hook
  const {
    framePositions,
    displayPositions,
    stablePositions,
    setStablePositions,
    setFramePositions,
    analyzePositionChanges
  } = usePositionManagement({
    shotId,
    shotGenerations,
    images,
    frameSpacing,
    isLoading,
    isPersistingPositions,
    isDragInProgress,
    updateTimelineFrame,
    onFramePositionsChange,
    setIsPersistingPositions
  });

  // Coordinate system hook
  const { fullMin, fullMax, fullRange } = useCoordinateSystem({
    positions: displayPositions,
    shotId,
    isDragInProgress
  });

  // Ref for lightbox index setter (needed for external generations)
  const setLightboxIndexRef = useRef<(index: number) => void>(() => {});
  
  // External generations hook (same as ShotImageManager)
  const externalGens = useExternalGenerations({
    selectedShotId: shotId,
    optimisticOrder: images,
    images: images,
    setLightboxIndexRef
  });
  
  // Combine timeline images with external generations for navigation
  const currentImages = useMemo(() => {
    return [...images, ...externalGens.externalGenerations, ...externalGens.tempDerivedGenerations];
  }, [images, externalGens.externalGenerations, externalGens.tempDerivedGenerations]);

  // Lightbox hook
  const isMobile = useIsMobile();
  const {
    lightboxIndex,
    currentLightboxImage: hookLightboxImage,
    goNext,
    goPrev,
    closeLightbox: hookCloseLightbox,
    openLightbox,
    hasNext: hookHasNext,
    hasPrevious: hookHasPrevious,
    showNavigation,
    setLightboxIndex // Get the raw state setter
  } = useLightbox({ images: currentImages, shotId, isMobile });
  
  // Update the ref with the actual setter, using the raw state setter to avoid stale closures
  useEffect(() => {
    setLightboxIndexRef.current = setLightboxIndex;
  }, [setLightboxIndex]);
  
  // Wrap closeLightbox to clear external generations
  const closeLightbox = useCallback(() => {
    externalGens.setExternalGenerations([]);
    externalGens.setTempDerivedGenerations([]);
    externalGens.setDerivedNavContext(null);
    hookCloseLightbox();
  }, [hookCloseLightbox, externalGens]);
  
  // Add derived navigation mode support (navigates only through "Based on this" items when active)
  const { wrappedGoNext, wrappedGoPrev, hasNext: derivedHasNext, hasPrevious: derivedHasPrevious } = useDerivedNavigation({
    derivedNavContext: externalGens.derivedNavContext,
    lightboxIndex,
    currentImages,
    handleOpenExternalGeneration: externalGens.handleOpenExternalGeneration,
    goNext,
    goPrev,
    logPrefix: '[TimelineRefactored:DerivedNav]'
  });
  
  // Use combined images for current image and navigation
  const currentLightboxImage = lightboxIndex !== null ? currentImages[lightboxIndex] : null;
  const hasNext = derivedHasNext;
  const hasPrevious = derivedHasPrevious;

  // Note: Removed auto-adjustment useEffect - context frames now only applied via Reset button

  // Handle resetting frames to evenly spaced intervals and setting context frames
  const handleResetFrames = useCallback(async (gap: number, newContextFrames: number) => {
    timelineDebugger.logPositionUpdate('Resetting frames', {
      shotId,
      gap,
      newContextFrames,
      imagesCount: images.length
    });

    // First set the context frames (this will trigger all constraint recalculations)
    onContextFramesChange(newContextFrames);

    // Create new positions: 0, gap, gap*2, gap*3, etc.
    const newPositions = new Map<string, number>();
    images.forEach((image, index) => {
      newPositions.set(image.shotImageEntryId, index * gap);
    });

    timelineDebugger.logPositionUpdate('New positions calculated', {
      shotId,
      positions: Array.from(newPositions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        position: pos
      }))
    });

    try {
      await setFramePositions(newPositions);
      timelineDebugger.logPositionUpdate('Frame reset completed', { shotId });
    } catch (error) {
      timelineDebugger.logPositionError('Frame reset failed', { shotId, error });
    }
  }, [images, setFramePositions, shotId, onContextFramesChange]);

  return (
    <div className="w-full overflow-x-hidden">
      {/* Controls */}
      <TimelineControls
        contextFrames={contextFrames}
        onContextFramesChange={onContextFramesChange}
        zoomLevel={1} // Will be provided by TimelineContainer
        onZoomIn={() => {}} // Will be provided by TimelineContainer
        onZoomOut={() => {}} // Will be provided by TimelineContainer
        onZoomReset={() => {}} // Will be provided by TimelineContainer
        onZoomToStart={() => {}} // Will be provided by TimelineContainer
        onResetFrames={handleResetFrames}
      />

      {/* Timeline Container */}
      <TimelineContainer
        shotId={shotId}
        images={images}
        contextFrames={contextFrames}
        framePositions={displayPositions}
        setFramePositions={setFramePositions}
        onImageReorder={onImageReorder}
        onImageSaved={onImageSaved}
        onImageDrop={onImageDrop}
        setIsDragInProgress={setIsDragInProgress}
        onPairClick={onPairClick}
        pairPrompts={actualPairPrompts}
        defaultPrompt={defaultPrompt}
        defaultNegativePrompt={defaultNegativePrompt}
        onImageDelete={onImageDelete}
        onImageDuplicate={onImageDuplicate}
        duplicatingImageId={duplicatingImageId}
        duplicateSuccessImageId={duplicateSuccessImageId}
        projectAspectRatio={projectAspectRatio}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && currentLightboxImage && (
        <MediaLightbox
          media={currentLightboxImage}
          onClose={closeLightbox}
          onNext={images.length > 1 ? wrappedGoNext : undefined}
          onPrevious={images.length > 1 ? wrappedGoPrev : undefined}
          onImageSaved={async (newUrl: string, createNew?: boolean) => 
            await onImageSaved(currentLightboxImage.id, newUrl, createNew)
          }
          showNavigation={showNavigation}
          showMagicEdit={true}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          onNavigateToGeneration={(generationId: string) => {
            ,
              timelineImagesCount: images.length,
              externalGenerationsCount: externalGens.externalGenerations.length,
              tempDerivedCount: externalGens.tempDerivedGenerations.length,
              totalImagesCount: currentImages.length
            });
            // Search in combined images (timeline + external + derived)
            const index = currentImages.findIndex((img: any) => img.id === generationId);
            if (index !== -1) {
              openLightbox(index);
            } else {
              toast.info('This generation is not currently loaded');
            }
          }}
          onOpenExternalGeneration={externalGens.handleOpenExternalGeneration}
          onMagicEdit={(imageUrl, prompt, numImages) => {
            // TODO: Implement magic edit generation
            timelineDebugger.logEvent('Magic edit requested', { shotId, imageUrl, prompt, numImages });
          }}
        />
      )}
    </div>
  );
};

export default Timeline;
