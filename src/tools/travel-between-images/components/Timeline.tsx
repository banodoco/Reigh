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
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Image, Upload } from "lucide-react";
import { transformForTimeline, type RawShotGeneration } from "@/shared/lib/generationTransformers";
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
import { timelineDebugger } from "./Timeline/utils/timeline-debug";
import { calculateMaxGap, validateGaps } from "./Timeline/utils/timeline-utils";
import { useExternalGenerations } from "@/shared/components/ShotImageManager/hooks/useExternalGenerations";

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
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  pendingPositions?: Map<string, number>;
  onPendingPositionApplied?: (generationId: string) => void;
  // Read-only mode - disables all interactions
  readOnly?: boolean;
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
  // Auto-create individual prompts flag
  autoCreateIndividualPrompts?: boolean;
  // Image upload handler for empty state
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  uploadProgress?: number;
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
  onGenerationDrop,
  pendingPositions,
  onPendingPositionApplied,
  readOnly = false,
  // Shared data props
  shotGenerations: propShotGenerations,
  updateTimelineFrame: propUpdateTimelineFrame,
  images: propImages,
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
  autoCreateIndividualPrompts,
  onImageUpload,
  isUploadingImage,
  uploadProgress = 0
}) => {
  
  // Navigation
  const navigate = useNavigate();
  
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
      // Use shared transformer instead of inline mapping
      result = shotGenerations
        .filter(sg => sg.generation)
        .map(sg => transformForTimeline(sg as any as RawShotGeneration))
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
    showNavigation
  } = useLightbox({ images: currentImages, shotId, isMobile });
  
  // Update the ref with the actual setter
  useEffect(() => {
    setLightboxIndexRef.current = openLightbox;
  }, [openLightbox]);
  
  // Wrap closeLightbox to clear external generations
  const closeLightbox = useCallback(() => {
    externalGens.setExternalGenerations([]);
    externalGens.setTempDerivedGenerations([]);
    externalGens.setDerivedNavContext(null);
    hookCloseLightbox();
  }, [hookCloseLightbox, externalGens]);
  
  // Override navigation when in derived navigation mode (navigating through "Based on this" items)
  const wrappedGoNext = useCallback(() => {
    if (externalGens.derivedNavContext && lightboxIndex !== null) {
      const currentId = currentImages[lightboxIndex]?.id;
      const currentDerivedIndex = externalGens.derivedNavContext.derivedGenerationIds.indexOf(currentId);
      
      console.log('[Timeline:DerivedNav] ➡️ Next in derived context', {
        currentId: currentId?.substring(0, 8),
        currentDerivedIndex,
        totalDerived: externalGens.derivedNavContext.derivedGenerationIds.length
      });
      
      if (currentDerivedIndex !== -1 && currentDerivedIndex < externalGens.derivedNavContext.derivedGenerationIds.length - 1) {
        const nextId = externalGens.derivedNavContext.derivedGenerationIds[currentDerivedIndex + 1];
        console.log('[Timeline:DerivedNav] 🎯 Navigating to next derived generation', {
          nextId: nextId.substring(0, 8)
        });
        externalGens.handleOpenExternalGeneration(nextId, externalGens.derivedNavContext.derivedGenerationIds);
      }
    } else {
      goNext();
    }
  }, [externalGens, lightboxIndex, currentImages, goNext]);
  
  const wrappedGoPrev = useCallback(() => {
    if (externalGens.derivedNavContext && lightboxIndex !== null) {
      const currentId = currentImages[lightboxIndex]?.id;
      const currentDerivedIndex = externalGens.derivedNavContext.derivedGenerationIds.indexOf(currentId);
      
      console.log('[Timeline:DerivedNav] ⬅️ Previous in derived context', {
        currentId: currentId?.substring(0, 8),
        currentDerivedIndex,
        totalDerived: externalGens.derivedNavContext.derivedGenerationIds.length
      });
      
      if (currentDerivedIndex !== -1 && currentDerivedIndex > 0) {
        const prevId = externalGens.derivedNavContext.derivedGenerationIds[currentDerivedIndex - 1];
        console.log('[Timeline:DerivedNav] 🎯 Navigating to previous derived generation', {
          prevId: prevId.substring(0, 8)
        });
        externalGens.handleOpenExternalGeneration(prevId, externalGens.derivedNavContext.derivedGenerationIds);
      }
    } else {
      goPrev();
    }
  }, [externalGens, lightboxIndex, currentImages, goPrev]);
  
  // Use combined images for current image and navigation
  const currentLightboxImage = lightboxIndex !== null ? currentImages[lightboxIndex] : null;
  const hasNext = lightboxIndex !== null ? lightboxIndex < currentImages.length - 1 : hookHasNext;
  const hasPrevious = lightboxIndex !== null ? lightboxIndex > 0 : hookHasPrevious;

  // Detect tablet/iPad size (768px+) for side-by-side task details layout
  const [isTabletOrLarger, setIsTabletOrLarger] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  );
  
  useEffect(() => {
    const handleResize = () => {
      setIsTabletOrLarger(window.innerWidth >= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch task ID mapping from unified cache
  const { data: taskMapping } = useTaskFromUnifiedCache(
    currentLightboxImage?.id || null
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
  const prevContextFramesRef = useRef<number>(contextFrames);
  const isAdjustingRef = useRef<boolean>(false);
  
  // Auto-adjust timeline positions when context frames increases
  useEffect(() => {
    // Skip if already adjusting to prevent loops
    if (isAdjustingRef.current) {
      return;
    }
    
    const prevContext = prevContextFramesRef.current;
    const currentContext = contextFrames;
    
    console.log('[ContextAdjust] 🎚️ useEffect triggered:', { 
      from: prevContext, 
      to: currentContext,
      isIncrease: currentContext > prevContext,
      hasImages: images.length > 0,
      positionsCount: framePositions.size
    });
    
    // Only adjust on increases (not decreases)
    if (currentContext <= prevContext || images.length === 0 || isLoading) {
      prevContextFramesRef.current = currentContext;
      return;
    }
    
    console.log('[ContextAdjust] 📈 Context frames increased from', prevContext, 'to', currentContext);
    
    // Use framePositions (source of truth)
    const currentPositions = new Map(framePositions);
    if (currentPositions.size === 0) {
      console.log('[ContextAdjust] ⏸️ No positions to adjust yet');
      prevContextFramesRef.current = currentContext;
      return;
    }
    
    const isValid = validateGaps(currentPositions, currentContext);
    
    if (!isValid) {
      console.log('[ContextAdjust] ⚠️ Current positions violate new constraint, adjusting...');
      isAdjustingRef.current = true;
      
      // Calculate new maxGap
      const newMaxGap = calculateMaxGap(currentContext);
      
      console.log('[ContextAdjust] 🔧 Adjustment parameters:', {
        currentContext,
        newMaxGap,
        itemCount: currentPositions.size
      });
      
      // Sort items by position
      const sorted = Array.from(currentPositions.entries())
        .sort((a, b) => a[1] - b[1]);
      
      console.log('[ContextAdjust] 📊 Current positions (sorted):', 
        sorted.map(([id, pos]) => ({ id: id.substring(0, 8), pos }))
      );
      
      // Adjust positions to fit within constraints
      const adjusted = new Map<string, number>();
      let prevPosition = 0;
      
      for (const [id, currentPos] of sorted) {
        if (currentPos === 0) {
          // Keep frame 0 at 0
          adjusted.set(id, 0);
          prevPosition = 0;
          console.log('[ContextAdjust] 📌 Item at frame 0, keeping:', id.substring(0, 8));
        } else {
          // Calculate the allowed range
          const minAllowedPosition = prevPosition + 1;
          const maxAllowedPosition = prevPosition + newMaxGap;
          
          console.log('[ContextAdjust] 🔍 Evaluating item:', {
            id: id.substring(0, 8),
            currentPos,
            prevPosition,
            minAllowedPosition,
            maxAllowedPosition,
            gap: currentPos - prevPosition
          });
          
          let newPosition = currentPos;
          
          if (currentPos < minAllowedPosition) {
            // Too close - push down to minimum allowed
            console.log('[ContextAdjust] 🔽 Too close! Pushing down from', currentPos, 'to', minAllowedPosition);
            newPosition = minAllowedPosition;
          } else if (currentPos > maxAllowedPosition) {
            // Too far - pull closer to fit within maxGap (this moves items to lower positions)
            console.log('[ContextAdjust] 🔼 Gap too large! Pulling closer from', currentPos, 'to', maxAllowedPosition);
            newPosition = maxAllowedPosition;
          } else {
            // Position is valid, keep it
            console.log('[ContextAdjust] ✓ Position valid, keeping at', currentPos);
            newPosition = currentPos;
          }
          
          adjusted.set(id, newPosition);
          prevPosition = newPosition;
        }
      }
      
      console.log('[ContextAdjust] 📊 Adjusted positions:', 
        Array.from(adjusted.entries()).map(([id, pos]) => ({ id: id.substring(0, 8), pos }))
      );
      
      // Check if we actually changed anything
      const hasChanges = Array.from(adjusted.entries()).some(
        ([id, newPos]) => newPos !== currentPositions.get(id)
      );
      
      console.log('[ContextAdjust] 🔄 Has changes?', hasChanges);
      
      if (hasChanges) {
        console.log('[ContextAdjust] ✅ Applying adjusted positions:', {
          changes: Array.from(adjusted.entries())
            .filter(([id, newPos]) => newPos !== currentPositions.get(id))
            .map(([id, newPos]) => ({
              id: id.substring(0, 8),
              old: currentPositions.get(id),
              new: newPos
            }))
        });
        
        // Apply the adjusted positions
        setFramePositions(adjusted).then(() => {
          isAdjustingRef.current = false;
          console.log('[ContextAdjust] 🎉 Positions successfully updated');
        }).catch((error) => {
          console.error('[ContextAdjust] ❌ Failed to adjust positions:', error);
          isAdjustingRef.current = false;
        });
      } else {
        isAdjustingRef.current = false;
      }
    } else {
      console.log('[ContextAdjust] ✅ Current positions are valid, no adjustment needed');
    }
    
    prevContextFramesRef.current = currentContext;
  }, [contextFrames, framePositions, images.length, isLoading, setFramePositions]);

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
                          onClick={() => navigate('/tools/image-generation')}
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
        contextFrames={contextFrames}
        framePositions={displayPositions}
        onContextFramesChange={onContextFramesChange}
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
        autoCreateIndividualPrompts={autoCreateIndividualPrompts}
        hasNoImages={hasNoImages}
        readOnly={readOnly}
        isUploadingImage={isUploadingImage}
        uploadProgress={uploadProgress}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && currentLightboxImage && (
        <MediaLightbox
          media={currentLightboxImage}
          shotId={shotId}
          starred={currentLightboxImage.starred ?? false}
          autoEnterInpaint={autoEnterInpaint}
          toolTypeOverride="travel-between-images"
          onClose={closeLightbox}
          onNext={images.length > 1 ? wrappedGoNext : undefined}
          onPrevious={images.length > 1 ? wrappedGoPrev : undefined}
          readOnly={readOnly}
          onDelete={!readOnly ? (mediaId: string) => {
            console.log('[Timeline] Delete from lightbox', {
              mediaId,
              shotImageEntryId: currentLightboxImage.shotImageEntryId
            });
            // Use shotImageEntryId for deletion to target the specific shot_generations entry
            onImageDelete(currentLightboxImage.shotImageEntryId);
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
          // Task details functionality - show on tablet+ (768px+), hide on mobile
          showTaskDetails={isTabletOrLarger}
          taskDetailsData={{
            task,
            isLoading: isLoadingTask,
            error: taskError,
            inputImages,
            taskId: task?.id || null,
            onClose: closeLightbox
          }}
        />
      )}
    </div>
  );
};

export default Timeline; 
