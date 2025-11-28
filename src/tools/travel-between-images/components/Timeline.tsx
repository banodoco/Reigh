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

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GenerationRow } from "@/types/shots";
import { toast } from "sonner";
import MediaLightbox from "@/shared/components/MediaLightbox";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useDeviceDetection } from "@/shared/hooks/useDeviceDetection";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Image, Upload } from "lucide-react";
import { transformForTimeline, type RawShotGeneration } from "@/shared/lib/generationTransformers";
import { isVideoGeneration } from "@/shared/lib/typeGuards";
import { useTaskFromUnifiedCache } from "@/shared/hooks/useUnifiedGenerations";
import { useGetTask } from "@/shared/hooks/useTasks";
import { deriveInputImages } from "@/shared/components/ImageGallery/utils";

// Clear legacy timeline cache on import
import "@/utils/clearTimelineCache";

// Import our extracted hooks and components
import { usePositionManagement } from "./Timeline/hooks/usePositionManagement";
import { useCoordinateSystem } from "./Timeline/hooks/useCoordinateSystem";
import { useLightbox } from "./Timeline/hooks/useLightbox";
import { useEnhancedShotPositions } from "@/shared/hooks/useEnhancedShotPositions";
import { useTimelinePositionUtils } from "@/shared/hooks/useTimelinePositionUtils";
import { timelineDebugger } from "./Timeline/utils/timeline-debug";
import { calculateMaxGap, validateGaps } from "./Timeline/utils/timeline-utils";
import { useExternalGenerations } from "@/shared/components/ShotImageManager/hooks/useExternalGenerations";
import { useDerivedNavigation } from "@/shared/hooks/useDerivedNavigation";

// Import components
import TimelineControls from "./Timeline/TimelineControls";
import TimelineContainer from "./Timeline/TimelineContainer";

// Main Timeline component props
export interface TimelineProps {
  shotId: string;
  projectId?: string;
  frameSpacing: number;
  onImageReorder: (orderedIds: string[]) => void;
  onImageSaved: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
  onImageDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  pendingPositions?: Map<string, number>;
  onPendingPositionApplied?: (generationId: string) => void;
  // Read-only mode - disables all interactions
  readOnly?: boolean;
  // Shared data props to prevent hook re-instantiation
  shotGenerations?: import("@/shared/hooks/useEnhancedShotPositions").ShotGeneration[];
  updateTimelineFrame?: (generationId: string, frame: number) => Promise<void>;
  images?: GenerationRow[]; // Filtered images for display
  allGenerations?: GenerationRow[]; // ALL generations for lookups (unfiltered)
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
  // Image upload handler for empty state
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  uploadProgress?: number;
  // Shot management for external generation viewing
  allShots?: Array<{ id: string; name: string }>;
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
}

/**
 * Refactored Timeline component with extracted hooks and modular architecture
 */
const Timeline: React.FC<TimelineProps> = ({
  shotId,
  projectId,
  frameSpacing,
  onImageReorder,
  onImageSaved,
  onFramePositionsChange,
  onImageDrop,
  onGenerationDrop,
  pendingPositions,
  onPendingPositionApplied,
  readOnly = false,
  // Shared data props
  shotGenerations: propShotGenerations,
  updateTimelineFrame: propUpdateTimelineFrame,
  images: propImages,
  allGenerations: propAllGenerations,
  onTimelineChange,
  hookData: propHookData,
  onPairClick,
  pairPrompts,
  enhancedPrompts,
  defaultPrompt,
  defaultNegativePrompt,
  onClearEnhancedPrompt,
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
  onImageUpload,
  isUploadingImage,
  uploadProgress = 0,
  // Shot management props
  allShots,
  selectedShotId,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  onCreateShot
}) => {
  // [ZoomDebug] Track Timeline mounts to detect unwanted remounts
  const timelineMountRef = React.useRef(0);
  React.useEffect(() => {
    timelineMountRef.current++;
    console.log('[ZoomDebug] 🟢 Timeline MOUNTED:', {
      mountCount: timelineMountRef.current,
      shotId: shotId?.substring(0, 8),
      propImagesCount: propImages?.length || 0,
      timestamp: Date.now()
    });
    return () => {
      console.log('[ZoomDebug] 🟢 Timeline UNMOUNTING:', {
        mountCount: timelineMountRef.current,
        shotId: shotId?.substring(0, 8),
        timestamp: Date.now()
      });
    };
  }, []);

  // [ShotNavPerf] Track Timeline component renders and image count - ONLY ON CHANGE
  const timelineRenderCount = React.useRef(0);
  timelineRenderCount.current += 1;
  const prevTimelineStateRef = React.useRef<string>('');
  const timelineStateKey = `${shotId}-${propImages?.length || 0}-${propShotGenerations?.length || 0}`;
  
  React.useEffect(() => {
    if (prevTimelineStateRef.current !== timelineStateKey) {
      console.log('[ShotNavPerf] 🎞️ Timeline STATE CHANGED (render #' + timelineRenderCount.current + ')', {
        shotId: shotId?.substring(0, 8),
        propImagesCount: propImages?.length || 0,
        propShotGenerationsCount: propShotGenerations?.length || 0,
        timestamp: Date.now()
      });
      prevTimelineStateRef.current = timelineStateKey;
    }
  }, [timelineStateKey, shotId, propImages?.length, propShotGenerations?.length]);
  
  // Navigation
  const navigate = useNavigate();
  
  // Core state
  const [isPersistingPositions, setIsPersistingPositions] = useState<boolean>(false);
  
  // Local state for shot selector dropdown (separate from the shot being viewed)
  const [lightboxSelectedShotId, setLightboxSelectedShotId] = useState<string | undefined>(selectedShotId || shotId);
  const [isDragInProgress, setIsDragInProgress] = useState<boolean>(false);
  

  // Refs (removed initialContextFrames - no longer needed for auto-adjustment)

  // Remove excessive render tracking - not needed in production
  
  // Use shared hook data if provided, otherwise create new instance (for backward compatibility)
  // NEW: When propAllGenerations is provided, use utility hook for position management with ALL data
  const legacyHookData = useEnhancedShotPositions(!propAllGenerations ? shotId : null, isDragInProgress);
  const utilsHookData = useTimelinePositionUtils({
    shotId: propAllGenerations ? shotId : null,
    generations: propAllGenerations || [], // Use ALL generations for lookups, not filtered images
    projectId: projectId, // Pass projectId to invalidate ShotsPane cache
  });
  
  // Choose data source: prefer propHookData, then utility hook if allGenerations provided, else legacy hook
  const hookData = propHookData || (propAllGenerations ? {
    shotGenerations: utilsHookData.shotGenerations,
    updateTimelineFrame: utilsHookData.updateTimelineFrame,
    batchExchangePositions: utilsHookData.batchExchangePositions,
    initializeTimelineFrames: utilsHookData.initializeTimelineFrames,
    loadPositions: utilsHookData.loadPositions,
    pairPrompts: utilsHookData.pairPrompts,
    isLoading: utilsHookData.isLoading,
  } as any : legacyHookData);
  
  const shotGenerations = propShotGenerations || hookData.shotGenerations;
  const updateTimelineFrame = propUpdateTimelineFrame || hookData.updateTimelineFrame;
  const batchExchangePositions = hookData.batchExchangePositions; // Always use hook for exchanges
  const initializeTimelineFrames = hookData.initializeTimelineFrames;
  
  // [TimelineVisibility] Track when Timeline receives data updates from parent
  React.useEffect(() => {
    console.log('[TimelineVisibility] 📥 Timeline DATA RECEIVED from parent:', {
      shotId: shotId.substring(0, 8),
      propShotGenerationsCount: propShotGenerations?.length ?? 0,
      propImagesCount: propImages?.length ?? 0,
      shotGenerationsCount: shotGenerations.length,
      hasPropHookData: !!propHookData,
      hasPropImages: !!propImages,
      dataSource: propHookData ? 'shared hookData' : propImages ? 'utility hook (two-phase)' : 'legacy hook',
      timestamp: Date.now()
    });
  }, [shotId, propShotGenerations, propImages, shotGenerations, propHookData]);
  
  // Log data source for debugging
  console.log('[UnifiedDataFlow] Timeline data source:', {
    shotId: shotId.substring(0, 8),
    hasPropHookData: !!propHookData,
    hasPropImages: !!propImages,
    dataSource: propHookData ? 'shared hookData' : propImages ? 'utility hook (two-phase)' : 'legacy hook',
    imageCount: shotGenerations.length,
  });
  
  console.log('[DataTrace] 📥 Timeline received data:', {
    shotId: shotId.substring(0, 8),
    shotGenerationsCount: shotGenerations.length,
    propImagesCount: propImages?.length || 0,
    usingPropImages: !!propImages,
  });
  
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
      // Use shared transformer instead of inline mapping
      result = shotGenerations
        .filter(sg => sg.generation)
        .map(sg => transformForTimeline(sg as any as RawShotGeneration))
        .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    }
    
    // CRITICAL: Filter out videos - they should never appear on timeline
    // Uses canonical isVideoGeneration from typeGuards
    result = result.filter(img => !isVideoGeneration(img));

    // [TimelineVisibility] Log images array changes
    console.log(`[TimelineVisibility] 📸 IMAGES ARRAY COMPUTED:`, {
      shotId: shotId.substring(0, 8),
      source: propImages ? 'propImages' : 'shotGenerations',
      totalImages: result.length,
      shotGenerationsCount: shotGenerations.length,
      images: result.map(img => ({
        id: img.id?.substring(0, 8), // shot_generations.id
        generation_id: img.generation_id?.substring(0, 8),
        timeline_frame: img.timeline_frame,
        hasImageUrl: !!img.imageUrl
      })),
      timestamp: Date.now()
    });

    // [Position0Debug] Log timeline data transformation for debugging
    const position0Images = result.filter(img => img.timeline_frame === 0);
    console.log(`[Position0Debug] 🎭 Timeline images data transformation:`, {
      shotId,
      totalImages: result.length,
      dataSource: propImages ? 'propImages' : 'shotGenerations',
      position0Images: position0Images.map(img => ({
        id: img.id?.substring(0, 8), // shot_generations.id
        generation_id: img.generation_id?.substring(0, 8),
        timeline_frame: img.timeline_frame,
        hasImageUrl: !!img.imageUrl
      })),
      allImages: result.map(img => ({
        id: img.id?.substring(0, 8), // shot_generations.id
        generation_id: img.generation_id?.substring(0, 8),
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

    console.log('[DataTrace] 🎨 Timeline final images for display:', {
      shotId: shotId.substring(0, 8),
      total: result.length,
      source: propImages ? 'propImages' : 'shotGenerations',
      positioned: result.filter(img => img.timeline_frame != null && img.timeline_frame >= 0).length,
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
    autoEnterInpaint,
    goNext,
    goPrev,
    closeLightbox: hookCloseLightbox,
    openLightbox,
    openLightboxWithInpaint,
    handleDesktopDoubleClick,
    handleMobileTap,
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
    logPrefix: '[Timeline:DerivedNav]'
  });
  
  // Use combined images for current image and navigation
  const currentLightboxImage = lightboxIndex !== null ? currentImages[lightboxIndex] : null;
  const hasNext = derivedHasNext;
  const hasPrevious = derivedHasPrevious;
  
  // Adapter functions for onAddToShot that use the lightbox selected shot ID
  const handleAddToShotAdapter = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    if (!onAddToShot || !lightboxSelectedShotId) {
      console.warn('[Timeline] Cannot add to shot: missing onAddToShot or lightboxSelectedShotId');
      return false;
    }

    try {
      console.log('[Timeline] Adding generation to shot with position', {
        generationId: generationId.substring(0, 8),
        shotId: lightboxSelectedShotId.substring(0, 8)
      });

      // Call parent's onAddToShot with the selected shot ID
      // Position is a number according to ShotEditor's signature: (shotId: string, generationId: string, position: number)
      await onAddToShot(lightboxSelectedShotId as any, generationId as any, 0 as any);
      toast.success('Added to shot');
      return true;
    } catch (error) {
      console.error('[Timeline] Error adding to shot:', error);
      toast.error(`Failed to add to shot: ${(error as Error).message}`);
      return false;
    }
  }, [lightboxSelectedShotId, onAddToShot]);

  const handleAddToShotWithoutPositionAdapter = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    if (!onAddToShotWithoutPosition || !lightboxSelectedShotId) {
      console.warn('[Timeline] Cannot add to shot without position: missing handler or lightboxSelectedShotId');
      return false;
    }

    try {
      console.log('[Timeline] Adding generation to shot without position', {
        generationId: generationId.substring(0, 8),
        shotId: lightboxSelectedShotId.substring(0, 8)
      });

      // Call parent's onAddToShotWithoutPosition with the selected shot ID
      await onAddToShotWithoutPosition(lightboxSelectedShotId as any, generationId as any);
      toast.success('Added to shot (unpositioned)');
      return true;
    } catch (error) {
      console.error('[Timeline] Error adding to shot without position:', error);
      toast.error(`Failed to add to shot: ${(error as Error).message}`);
      return false;
    }
  }, [lightboxSelectedShotId, onAddToShotWithoutPosition]);

  // Detect tablet/iPad size (768px+) for side-by-side task details layout
  const { isTabletOrLarger } = useDeviceDetection();

  // Fetch task ID mapping from unified cache
  // Uses generation_id (the actual generation record) not id (shot_generations entry)
  const { data: taskMapping } = useTaskFromUnifiedCache(
    currentLightboxImage?.generation_id || null
  );

  // Extract taskId and convert from Json to string
  const taskId = React.useMemo(() => {
    if (!taskMapping?.taskId) return undefined;
    return String(taskMapping.taskId);
  }, [taskMapping]);

  // Fetch full task details using the task ID (only enabled when we have a taskId)
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(
    taskId || ''  // Pass empty string if no taskId, hook will be disabled via enabled: !!taskId
  );

  // Derive input images from task metadata
  const inputImages = React.useMemo(() => {
    if (!task) return [];
    return deriveInputImages(task);
  }, [task]);

  // Preload next/previous images when lightbox is open for faster navigation
  useEffect(() => {
    if (!currentLightboxImage) return;
    
    // Preload next image
    if (hasNext && lightboxIndex !== null && lightboxIndex + 1 < images.length) {
      const nextImage = images[lightboxIndex + 1];
      if (nextImage?.imageUrl) {
        const img = new window.Image();
        img.src = nextImage.imageUrl;
      }
    }
    
    // Preload previous image
    if (hasPrevious && lightboxIndex !== null && lightboxIndex > 0) {
      const prevImage = images[lightboxIndex - 1];
      if (prevImage?.imageUrl) {
        const img = new window.Image();
        img.src = prevImage.imageUrl;
      }
    }
  }, [currentLightboxImage, lightboxIndex, images, hasNext, hasPrevious]);

  // Close lightbox if current image no longer exists (e.g., deleted)
  useEffect(() => {
    if (lightboxIndex !== null && !currentLightboxImage) {
      console.log('[Timeline] Current lightbox image no longer exists, closing lightbox');
      closeLightbox();
    }
  }, [lightboxIndex, currentLightboxImage, closeLightbox]);

  // Listen for star updates and refetch shot data
  useEffect(() => {
    const handleStarUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { shotId: updatedShotId } = customEvent.detail || {};
      
      // Only refetch if this event is for our current shot
      if (updatedShotId === shotId) {
        console.log('[StarPersist] 🎯 Timeline received star-updated event, refetching...', {
          shotId,
          timestamp: Date.now()
        });
        
        // Trigger a refetch of shot generations
        if (hookData?.loadPositions) {
          hookData.loadPositions({ silent: true, reason: 'shot_change' });
        }
      }
    };
    
    window.addEventListener('generation-star-updated', handleStarUpdated);
    return () => window.removeEventListener('generation-star-updated', handleStarUpdated);
  }, [shotId, hookData]);

  // Track previous context frames to detect increases
  // const prevContextFramesRef = useRef<number>(contextFrames);
  // const isAdjustingRef = useRef<boolean>(false);
  
  // Auto-adjust timeline positions when context frames increases
  /*
  // REMOVED: Auto-adjust logic for context frames as context frames are being removed
  // The logic was checking if currentContext > prevContext and adjusting positions if gaps were too small
  // or too large based on calculateMaxGap(contextFrames).
  */

  // Handle resetting frames to evenly spaced intervals and setting context frames
  const handleResetFrames = useCallback(async (gap: number) => {
    // First set the context frames (this will trigger all constraint recalculations)
    // onContextFramesChange(newContextFrames); // Removed
    
    // Then set the positions with the specified gap
    const newPositions = new Map<string, number>();
    images.forEach((image, index) => {
      // Use id (shot_generations.id) for position mapping - unique per entry
      newPositions.set(image.id, index * gap);
    });

    await setFramePositions(newPositions);
  }, [images, setFramePositions]);

  // Check if timeline is empty
  const hasNoImages = images.length === 0;

  // Drag and drop state for empty state upload container
  const [isFileOver, setIsFileOver] = useState(false);

  // Drag and drop handlers for empty state
  const handleEmptyStateDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files') && onImageUpload) {
      setIsFileOver(true);
    }
  }, [onImageUpload]);

  const handleEmptyStateDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files') && onImageUpload) {
      setIsFileOver(true);
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }, [onImageUpload]);

  const handleEmptyStateDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide if we're leaving the container entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsFileOver(false);
    }
  }, []);

  const handleEmptyStateDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFileOver(false);

    if (!onImageUpload) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Validate image types
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const validFiles = files.filter(file => {
      if (validImageTypes.includes(file.type)) {
        return true;
      }
      toast.error(`Invalid file type for ${file.name}. Only JPEG, PNG, and WebP are supported.`);
      return false;
    });

    if (validFiles.length === 0) return;

    try {
      await onImageUpload(validFiles);
    } catch (error) {
      console.error('Error handling image drop:', error);
      toast.error(`Failed to add images: ${(error as Error).message}`);
    }
  }, [onImageUpload]);

  return (
    <div className="w-full overflow-x-hidden relative">
      {/* Blur and overlay when no images */}
      {hasNoImages && (
        <>
          {/* Very light blur overlay */}
          <div className="absolute inset-0 backdrop-blur-[0.5px] bg-background/5 z-10" />
          
          {/* Upload container */}
          {onImageUpload && (
            <div 
              className="absolute inset-0 z-20 flex items-start justify-center pt-20 p-4"
              onDragEnter={handleEmptyStateDragEnter}
              onDragOver={handleEmptyStateDragOver}
              onDragLeave={handleEmptyStateDragLeave}
              onDrop={handleEmptyStateDrop}
            >
              <div className={`w-full max-w-md p-6 border-2 rounded-lg bg-background shadow-lg transition-all duration-200 ${
                isFileOver 
                  ? 'border-primary bg-primary/5 ring-2 ring-primary scale-105' 
                  : 'border-border'
              }`}>
                <div className="flex flex-col items-center gap-3 text-center">
                  {isFileOver ? (
                    <>
                      <Upload className="h-12 w-12 text-primary animate-bounce" />
                      <div>
                        <h3 className="font-medium mb-2 text-primary">Drop images here</h3>
                        <p className="text-sm text-muted-foreground">
                          Release to add images to timeline
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Image className="h-10 w-10 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium mb-2">No images on timeline</h3>
                      </div>
                      
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            onImageUpload(files);
                            e.target.value = ''; // Reset input
                          }
                        }}
                        className="hidden"
                        id="timeline-empty-image-upload"
                        disabled={isUploadingImage}
                      />
                      <div className="flex gap-2 w-full">
                        <Label htmlFor="timeline-empty-image-upload" className="m-0 cursor-pointer flex-1">
                          <Button
                            variant="outline"
                            size="default"
                            disabled={isUploadingImage}
                            className="w-full"
                            asChild
                          >
                            <span>
                              {isUploadingImage ? 'Uploading...' : 'Upload Images'}
                            </span>
                          </Button>
                        </Label>
                        
                        <Button
                          variant="default"
                          size="default"
                          onClick={() => {
                            // Open image generation in a new tab to preserve context in travel tool
                            window.open('/tools/image-generation', '_blank', 'noopener,noreferrer');
                          }}
                          className="flex-1"
                        >
                          Start generating
                        </Button>
                      </div>
                      
                      {/* Subtle drag and drop hint */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                        <Upload className="h-3 w-3" />
                        <span>or drag and drop</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Timeline Container - includes both controls and timeline */}
      <TimelineContainer
        shotId={shotId}
        projectId={projectId}
        images={images}
        framePositions={displayPositions}
        onResetFrames={handleResetFrames}
        setFramePositions={setFramePositions}
        onImageReorder={onImageReorder}
        onImageSaved={onImageSaved}
        onImageDrop={onImageDrop}
        onGenerationDrop={onGenerationDrop}
        setIsDragInProgress={setIsDragInProgress}
        onPairClick={onPairClick}
        pairPrompts={actualPairPrompts}
        enhancedPrompts={enhancedPrompts || {}}
        defaultPrompt={defaultPrompt}
        defaultNegativePrompt={defaultNegativePrompt}
        onClearEnhancedPrompt={readOnly ? undefined : onClearEnhancedPrompt}
        onImageDelete={onImageDelete}
        onImageDuplicate={onImageDuplicate}
        duplicatingImageId={duplicatingImageId}
        duplicateSuccessImageId={duplicateSuccessImageId}
        projectAspectRatio={projectAspectRatio}
        handleDesktopDoubleClick={handleDesktopDoubleClick}
        handleMobileTap={handleMobileTap}
        handleInpaintClick={openLightboxWithInpaint}
        structureVideoPath={structureVideoPath}
        structureVideoMetadata={structureVideoMetadata}
        structureVideoTreatment={structureVideoTreatment}
        structureVideoMotionStrength={structureVideoMotionStrength}
        structureVideoType={structureVideoType}
        onStructureVideoChange={onStructureVideoChange}
        hasNoImages={hasNoImages}
        readOnly={readOnly}
        isUploadingImage={isUploadingImage}
        uploadProgress={uploadProgress}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && currentLightboxImage && (() => {
        // Determine if the current image is positioned in the selected shot
        // For timeline images (non-external gens), check if they have a timeline_frame
        // Use lightboxSelectedShotId instead of selectedShotId so it updates when dropdown changes
        const isExternalGen = lightboxIndex >= images.length;
        const isInSelectedShot = !isExternalGen && lightboxSelectedShotId && (
          shotId === lightboxSelectedShotId || 
          (currentLightboxImage as any).shot_id === lightboxSelectedShotId ||
          (Array.isArray((currentLightboxImage as any).all_shot_associations) && 
           (currentLightboxImage as any).all_shot_associations.some((assoc: any) => assoc.shot_id === lightboxSelectedShotId))
        );
        
        const positionedInSelectedShot = isInSelectedShot
          ? (currentLightboxImage as any).timeline_frame !== null && (currentLightboxImage as any).timeline_frame !== undefined
          : undefined;
        
        const associatedWithoutPositionInSelectedShot = isInSelectedShot
          ? (currentLightboxImage as any).timeline_frame === null || (currentLightboxImage as any).timeline_frame === undefined
          : undefined;

        return (
          <MediaLightbox
            media={currentLightboxImage}
            shotId={shotId}
            starred={currentLightboxImage.starred ?? false}
            autoEnterInpaint={autoEnterInpaint}
            toolTypeOverride="travel-between-images"
            onClose={() => {
              closeLightbox();
              // Reset dropdown to current shot when closing
              setLightboxSelectedShotId(selectedShotId || shotId);
            }}
            onNext={images.length > 1 ? wrappedGoNext : undefined}
            onPrevious={images.length > 1 ? wrappedGoPrev : undefined}
            readOnly={readOnly}
            onDelete={!readOnly ? (mediaId: string) => {
              console.log('[Timeline] Delete from lightbox', {
                mediaId,
                id: currentLightboxImage.id, // shot_generations.id - unique per entry
                generation_id: currentLightboxImage.generation_id
              });
              // Use id (shot_generations.id) for deletion to target the specific entry
              onImageDelete(currentLightboxImage.id);
            } : undefined}
            onImageSaved={async (newUrl: string, createNew?: boolean) => {
              console.log('[ImageFlipDebug] [Timeline] MediaLightbox onImageSaved called', {
                imageId: currentLightboxImage.id,
                newUrl,
                createNew,
                timestamp: Date.now()
              });
              
              await onImageSaved(currentLightboxImage.id, newUrl, createNew);
              
              console.log('[ImageFlipDebug] [Timeline] Parent onImageSaved completed, triggering onTimelineChange', {
                timestamp: Date.now()
              });
              
              // Trigger reload of timeline data after flip
              if (onTimelineChange) {
                await onTimelineChange();
                console.log('[ImageFlipDebug] [Timeline] onTimelineChange completed', {
                  timestamp: Date.now()
                });
              }
            }}
            showNavigation={showNavigation}
            showMagicEdit={true}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
            onNavigateToGeneration={(generationId: string) => {
              console.log('[Timeline:DerivedNav] 📍 Navigate to generation', {
                generationId: generationId.substring(0, 8),
                timelineImagesCount: images.length,
                externalGenerationsCount: externalGens.externalGenerations.length,
                tempDerivedCount: externalGens.tempDerivedGenerations.length,
                totalImagesCount: currentImages.length
              });
              // Search in combined images (timeline + external + derived)
              const index = currentImages.findIndex((img: any) => img.id === generationId);
              if (index !== -1) {
                console.log('[Timeline:DerivedNav] ✅ Found at index', index);
                openLightbox(index);
              } else {
                console.log('[Timeline:DerivedNav] ⚠️ Not found in current images');
                toast.info('This generation is not currently loaded');
              }
            }}
            onOpenExternalGeneration={externalGens.handleOpenExternalGeneration}
            onMagicEdit={(imageUrl, prompt, numImages) => {
              // TODO: Implement magic edit generation
              timelineDebugger.logEvent('Magic edit requested', { shotId, imageUrl, prompt, numImages });
            }}
            // Task details functionality - now shown on all devices including mobile
            showTaskDetails={true}
            taskDetailsData={{
              task,
              isLoading: isLoadingTask,
              error: taskError,
              inputImages,
              taskId: task?.id || null,
              onClose: closeLightbox
            }}
            // Shot management props
            allShots={allShots}
            selectedShotId={isExternalGen ? externalGens.externalGenLightboxSelectedShot : lightboxSelectedShotId}
            onShotChange={isExternalGen ? (shotId) => {
              externalGens.setExternalGenLightboxSelectedShot(shotId);
            } : (shotId) => {
              console.log('[Timeline] Shot selector changed to:', shotId);
              setLightboxSelectedShotId(shotId);
              onShotChange?.(shotId);
            }}
            onAddToShot={isExternalGen ? externalGens.handleExternalGenAddToShot : (onAddToShot ? handleAddToShotAdapter : undefined)}
            onAddToShotWithoutPosition={isExternalGen ? externalGens.handleExternalGenAddToShotWithoutPosition : (onAddToShotWithoutPosition ? handleAddToShotWithoutPositionAdapter : undefined)}
            onCreateShot={onCreateShot}
            positionedInSelectedShot={positionedInSelectedShot}
            associatedWithoutPositionInSelectedShot={associatedWithoutPositionInSelectedShot}
          />
        );
      })()}
    </div>
  );
};

export default Timeline; 
