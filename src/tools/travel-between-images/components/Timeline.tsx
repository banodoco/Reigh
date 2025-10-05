/**
 * Timeline Component - Refactored Modular Architecture
 * 
 * This is the main Timeline component that orchestrates all timeline functionality
 * using a modular architecture. The complex logic has been extracted into focused
 * modules for better maintainability and testability.
 * 
 * 📁 MODULAR STRUCTURE:
 * 
 * 🎯 /hooks/ - Custom hooks for specific functionality:
 *   • usePositionManagement.ts - Manages all position state and database updates
 *   • useCoordinateSystem.ts - Handles timeline dimensions and coordinate calculations  
 *   • useLightbox.ts - Manages lightbox state and navigation (mobile + desktop)
 *   • useGlobalEvents.ts - Handles global mouse events during drag operations
 *   • useZoom.ts - Zoom controls and viewport management
 *   • useFileDrop.ts - File drag-and-drop functionality
 *   • useTimelineDrag.ts - Complex drag-and-drop timeline operations
 * 
 * 🔧 /utils/ - Utility functions and helpers:
 *   • timeline-debug.ts - Centralized logging system with categories and structured output
 *   • timeline-utils.ts - Core calculation functions (dimensions, gaps, pair info)
 * 
 * 🎨 /components/ - UI components:
 *   • TimelineContainer.tsx - Main timeline rendering logic and controls
 *   • TimelineControls.tsx - Zoom and context frame controls
 *   • TimelineRuler.tsx - Frame number ruler display
 *   • TimelineItem.tsx - Individual draggable timeline items
 *   • PairRegion.tsx - Pair visualization and context display
 *   • DropIndicator.tsx - Visual feedback for file drops
 *   • PairPromptModal.tsx - Modal for editing pair prompts
 * 
 * 🏗️ ARCHITECTURE BENEFITS:
 *   • Single Responsibility - Each module has one clear purpose
 *   • Testability - Hooks can be unit tested in isolation
 *   • Maintainability - Changes are localized to specific modules
 *   • Reusability - Hooks can be used in other components
 *   • Performance - Optimized re-render patterns and dependency management
 *   • Debugging - Structured logging with categorized output
 * 
 * 📊 SIZE REDUCTION: 1,287 lines → 347 lines (73% reduction)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
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

// Import components
import TimelineControls from "./Timeline/TimelineControls";
import TimelineContainer from "./Timeline/TimelineContainer";

// Main Timeline component props
export interface TimelineProps {
  shotId: string;
  projectId?: string;
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
  // Structure video props (matches backend parameter names)
  structureVideoPath?: string | null;
  structureVideoMetadata?: import("@/shared/lib/videoUploader").VideoMetadata | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'flow' | 'canny' | 'depth';
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: import("@/shared/lib/videoUploader").VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'flow' | 'canny' | 'depth'
  ) => void;
  // Auto-create individual prompts flag
  autoCreateIndividualPrompts?: boolean;
}

/**
 * Refactored Timeline component with extracted hooks and modular architecture
 */
const Timeline: React.FC<TimelineProps> = ({
  shotId,
  projectId,
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
  projectAspectRatio,
  // Structure video props
  structureVideoPath,
  structureVideoMetadata,
  structureVideoTreatment,
  structureVideoMotionStrength,
  structureVideoType,
  onStructureVideoChange,
  autoCreateIndividualPrompts
}) => {
  
  // Core state
  const [isPersistingPositions, setIsPersistingPositions] = useState<boolean>(false);
  const [isDragInProgress, setIsDragInProgress] = useState<boolean>(false);

  // Refs (removed initialContextFrames - no longer needed for auto-adjustment)

  // Remove excessive render tracking - not needed in production
  
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
    let result: (GenerationRow & { timeline_frame?: number })[];
    
    if (propImages) {
      result = propImages;
    } else {
      result = shotGenerations
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
        } as GenerationRow & { timeline_frame?: number }))
        .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    }

    // [Position0Debug] Log timeline data transformation for debugging
    const position0Images = result.filter(img => img.timeline_frame === 0);
    console.log(`[Position0Debug] 🎭 Timeline images data transformation:`, {
      shotId,
      totalImages: result.length,
      dataSource: propImages ? 'propImages' : 'shotGenerations',
      position0Images: position0Images.map(img => ({
        id: img.shotImageEntryId?.substring(0, 8) || img.id?.substring(0, 8),
        timeline_frame: img.timeline_frame,
        hasImageUrl: !!img.imageUrl
      })),
      allImages: result.map(img => ({
        id: img.shotImageEntryId?.substring(0, 8) || img.id?.substring(0, 8),
        timeline_frame: img.timeline_frame,
        hasImageUrl: !!img.imageUrl
      })).sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0)),
      shotGenerationsData: !propImages ? shotGenerations.map(sg => ({
        id: sg.id.substring(0, 8),
        generation_id: sg.generation_id?.substring(0, 8),
        timeline_frame: sg.timeline_frame,
        hasGeneration: !!sg.generation
      })) : 'using propImages'
    });

    return result;
  }, [shotGenerations, propImages, shotId]);

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

  // Lightbox hook
  const isMobile = useIsMobile();
  const {
    lightboxIndex,
    currentLightboxImage,
    goNext,
    goPrev,
    closeLightbox,
    handleDesktopDoubleClick,
    handleMobileTap,
    hasNext,
    hasPrevious,
    showNavigation
  } = useLightbox({ images, shotId, isMobile });

  // Note: Removed auto-adjustment useEffect - context frames now only applied via Reset button

  // Handle resetting frames to evenly spaced intervals and setting context frames
  const handleResetFrames = useCallback(async (gap: number, newContextFrames: number) => {
    // First set the context frames (this will trigger all constraint recalculations)
    onContextFramesChange(newContextFrames);
    
    // Then set the positions with the specified gap
    const newPositions = new Map<string, number>();
    images.forEach((image, index) => {
      newPositions.set(image.shotImageEntryId, index * gap);
    });

    await setFramePositions(newPositions);
  }, [images, setFramePositions, onContextFramesChange]);

  return (
    <div className="w-full overflow-x-hidden">
      {/* Timeline Container - includes both controls and timeline */}
      <TimelineContainer
        shotId={shotId}
        projectId={projectId}
        images={images}
        contextFrames={contextFrames}
        framePositions={displayPositions}
        onContextFramesChange={onContextFramesChange}
        onResetFrames={handleResetFrames}
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
        handleDesktopDoubleClick={handleDesktopDoubleClick}
        handleMobileTap={handleMobileTap}
        structureVideoPath={structureVideoPath}
        structureVideoMetadata={structureVideoMetadata}
        structureVideoTreatment={structureVideoTreatment}
        structureVideoMotionStrength={structureVideoMotionStrength}
        structureVideoType={structureVideoType}
        onStructureVideoChange={onStructureVideoChange}
        autoCreateIndividualPrompts={autoCreateIndividualPrompts}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && currentLightboxImage && (
        <MediaLightbox
          media={currentLightboxImage}
          onClose={closeLightbox}
          onNext={images.length > 1 ? goNext : undefined}
          onPrevious={images.length > 1 ? goPrev : undefined}
          onImageSaved={async (newUrl: string, createNew?: boolean) => 
            await onImageSaved(currentLightboxImage.id, newUrl, createNew)
          }
          showNavigation={showNavigation}
          showMagicEdit={true}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
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
