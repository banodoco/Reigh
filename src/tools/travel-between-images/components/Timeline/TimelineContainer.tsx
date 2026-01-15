import React, { useRef, useState, useEffect, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useDeviceDetection } from '@/shared/hooks/useDeviceDetection';
import { calculateMaxGap, getPairInfo, getTimelineDimensions, pixelToFrame } from './utils/timeline-utils';
import { timelineDebugger } from './utils/timeline-debug';
import { framesToSeconds } from './utils/time-utils';
import type { VideoMetadata } from '@/shared/lib/videoUploader';

// Import components
import TimelineRuler from './TimelineRuler';
import DropIndicator from './DropIndicator';
import PairRegion from './PairRegion';
import TimelineItem from './TimelineItem';
import SingleImageEndpoint, { SINGLE_IMAGE_ENDPOINT_ID } from './SingleImageEndpoint';
import { GuidanceVideoStrip } from './GuidanceVideoStrip';
import { GuidanceVideoUploader } from './GuidanceVideoUploader';
import { GuidanceVideosContainer } from './GuidanceVideosContainer';
import { AudioStrip } from './AudioStrip';
import { SegmentOutputStrip } from './SegmentOutputStrip';
import { getDisplayUrl } from '@/shared/lib/utils';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from './constants';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
import { DatasetBrowserModal } from '@/shared/components/DatasetBrowserModal';
import { Resource, StructureVideoMetadata, useCreateResource } from '@/shared/hooks/useResources';
import { supabase } from '@/integrations/supabase/client';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

// Skeleton component for uploading images
const TimelineSkeletonItem: React.FC<{
  framePosition: number;
  fullMin: number;
  fullRange: number;
  containerWidth: number;
  projectAspectRatio?: string;
}> = ({
  framePosition,
  fullMin,
  fullRange,
  containerWidth,
  projectAspectRatio,
}) => {
  const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const pixelPosition = TIMELINE_PADDING_OFFSET + ((framePosition - fullMin) / fullRange) * effectiveWidth;
  const leftPercent = (pixelPosition / containerWidth) * 100;

  // Calculate aspect ratio
  let aspectRatioStyle: React.CSSProperties = { aspectRatio: '1' };
  if (projectAspectRatio) {
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (!isNaN(w) && !isNaN(h)) {
      aspectRatioStyle = { aspectRatio: `${w / h}` };
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPercent}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        transition: 'left 0.2s ease-out',
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
       <div 
        className="relative border-2 border-primary/20 rounded-lg overflow-hidden bg-muted/50"
        style={{
          width: '120px',
          maxHeight: '120px',
          ...aspectRatioStyle,
        }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
           <Loader2 className="h-6 w-6 text-primary/60 animate-spin" />
        </div>
      </div>
    </div>
  );
};

// Import hooks
import { useZoom } from './hooks/useZoom';
import { useUnifiedDrop } from './hooks/useUnifiedDrop';
import { useTimelineDrag } from './hooks/useTimelineDrag';
import { useGlobalEvents } from './hooks/useGlobalEvents';
import { useTapToMove } from './hooks/useTapToMove';
import { applyFluidTimeline } from './utils/timeline-utils';

interface TimelineContainerProps {
  shotId: string;
  projectId?: string;
  images: GenerationRow[];
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  onImageDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  setIsDragInProgress: (dragging: boolean) => void;
  // Control props
  onResetFrames: (gap: number) => Promise<void>;
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
  handleInpaintClick?: (idx: number) => void;
  // Structure video props (legacy single-video interface)
  structureVideoPath?: string | null;
  structureVideoMetadata?: VideoMetadata | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  /** Uni3C end percent (only used when structureVideoType is 'uni3c') */
  uni3cEndPercent?: number;
  onUni3cEndPercentChange?: (value: number) => void;
  
  // NEW: Multi-video array interface
  structureVideos?: import('@/shared/lib/tasks/travelBetweenImages').StructureVideoConfigWithMetadata[];
  onAddStructureVideo?: (video: import('@/shared/lib/tasks/travelBetweenImages').StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<import('@/shared/lib/tasks/travelBetweenImages').StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;
  // Audio strip props
  audioUrl?: string | null;
  audioMetadata?: { duration: number; name?: string } | null;
  onAudioChange?: (
    audioUrl: string | null,
    metadata: { duration: number; name?: string } | null
  ) => void;
  // Empty state flag for blur effect
  hasNoImages?: boolean;
  // Read-only mode - disables all interactions
  readOnly?: boolean;
  // Upload progress tracking
  isUploadingImage?: boolean;
  uploadProgress?: number;
  // Single image endpoint for setting video duration
  singleImageEndFrame?: number;
  onSingleImageEndFrameChange?: (endFrame: number) => void;
  // Maximum frame limit for timeline gaps (77 with smooth continuations, 81 otherwise)
  maxFrameLimit?: number;
  // Shared output selection state (syncs FinalVideoSection with SegmentOutputStrip)
  selectedOutputId?: string | null;
  onSelectedOutputChange?: (id: string | null) => void;
}

const TimelineContainer: React.FC<TimelineContainerProps> = ({
  shotId,
  projectId,
  images,
  isUploadingImage = false,
  uploadProgress = 0,
  framePositions,
  setFramePositions,
  onImageReorder,
  onImageDrop,
  onGenerationDrop,
  setIsDragInProgress,
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
  handleInpaintClick,
  structureVideoPath,
  structureVideoMetadata,
  structureVideoTreatment = 'adjust',
  structureVideoMotionStrength = 1.0,
  structureVideoType = 'flow',
  onStructureVideoChange,
  uni3cEndPercent = 0.1,
  onUni3cEndPercentChange,
  // NEW: Multi-video array props
  structureVideos,
  onAddStructureVideo,
  onUpdateStructureVideo,
  onRemoveStructureVideo,
  audioUrl,
  audioMetadata,
  onAudioChange,
  hasNoImages = false,
  singleImageEndFrame,
  onSingleImageEndFrameChange,
  maxFrameLimit = 81,
  selectedOutputId,
  onSelectedOutputChange,
}) => {
  // [ZoomDebug] Track component mounts to detect unwanted remounts
  const mountCountRef = useRef(0);
  useEffect(() => {
    mountCountRef.current++;
    console.log('[ZoomDebug] 🔴 TimelineContainer MOUNTED:', {
      mountCount: mountCountRef.current,
      shotId: shotId?.substring(0, 8),
      imageCount: images.length,
      timestamp: Date.now()
    });
    return () => {
      console.log('[ZoomDebug] 🔴 TimelineContainer UNMOUNTING:', {
        mountCount: mountCountRef.current,
        shotId: shotId?.substring(0, 8),
        timestamp: Date.now()
      });
    };
  }, []);
  
  // Local state for reset gap
  const [resetGap, setResetGap] = useState<number>(50);
  const maxGap = 81;
  
  // State for video browser modal
  const [showVideoBrowser, setShowVideoBrowser] = useState(false);

  // Track when uploading a structure video to show loading state immediately
  const [isUploadingStructureVideo, setIsUploadingStructureVideo] = useState(false);
  
  // Resource creation hook for video upload
  const createResource = useCreateResource();
  
  // Privacy defaults for new resources
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });
  
  // Track pending drop frame for skeleton
  const [pendingDropFrame, setPendingDropFrame] = useState<number | null>(null);
  
  // Track pending duplicate frame for skeleton
  const [pendingDuplicateFrame, setPendingDuplicateFrame] = useState<number | null>(null);
  
  // Track pending external add frame (from GenerationsPane)
  const [pendingExternalAddFrame, setPendingExternalAddFrame] = useState<number | null>(null);
  
  // Listen for global pending add events (from GenerationsPane)
  useEffect(() => {
    console.log('[PATH_COMPARE] 🎧 TimelineContainer setting up event listener for shot:', shotId?.substring(0, 8));
    
    const handlePendingAdd = (event: CustomEvent) => {
      const { frame, shotId: targetShotId } = event.detail;
      
      console.log('[PATH_COMPARE] 🔵 TimelineContainer received timeline:pending-add event:', {
        frame,
        targetShotId: targetShotId?.substring(0, 8),
        currentShotId: shotId?.substring(0, 8),
        matches: targetShotId === shotId || !targetShotId
      });
      
      // Only handle if this is for the current shot
      if (targetShotId && targetShotId !== shotId) {
        console.log('[PATH_COMPARE] 🔵 Ignoring - different shot');
        return;
      }
      
      console.log('[PATH_COMPARE] 🔵 Setting pendingExternalAddFrame:', frame);
      setPendingExternalAddFrame(frame);
    };
    
    window.addEventListener('timeline:pending-add', handlePendingAdd as EventListener);
    return () => {
      console.log('[PATH_COMPARE] 🎧 TimelineContainer removing event listener for shot:', shotId?.substring(0, 8));
      window.removeEventListener('timeline:pending-add', handlePendingAdd as EventListener);
    };
  }, [shotId]);

  // Track images array changes
  const prevImagesRef = React.useRef<typeof images>([]);
  useEffect(() => {
    const prevImages = prevImagesRef.current;
    if (prevImages.length !== images.length) {
      console.log('[PATH_COMPARE] 📊 Images array changed:', {
        prevCount: prevImages.length,
        newCount: images.length,
        diff: images.length - prevImages.length,
        // Find what was added or removed
        added: images.filter(img => !prevImages.find(p => p.id === img.id)).map(img => ({
          id: img.id?.substring(0, 8),
          frame: img.timeline_frame,
          _optimistic: (img as any)._optimistic
        })),
        removed: prevImages.filter(img => !images.find(p => p.id === img.id)).map(img => ({
          id: img.id?.substring(0, 8),
          frame: img.timeline_frame,
          _optimistic: (img as any)._optimistic
        })),
        timestamp: Date.now()
      });
    }
    prevImagesRef.current = images;
  }, [images]);

  // Clear pending external add frame when the new item appears
  useEffect(() => {
    if (pendingExternalAddFrame !== null) {
      const imageAtFrame = images.find(img => img.timeline_frame === pendingExternalAddFrame);
      if (imageAtFrame) {
        console.log('[PATH_COMPARE] 🔵 ✨ New item appeared at pending external frame, clearing skeleton:', {
          pendingExternalAddFrame,
          imageId: imageAtFrame.id?.substring(0, 8),
          _optimistic: (imageAtFrame as any)._optimistic,
          timestamp: Date.now()
        });
        // Add a small delay to ensure smooth transition
        setTimeout(() => setPendingExternalAddFrame(null), 100);
      }
    }
  }, [images, pendingExternalAddFrame]);

  // Safety timeout for pending external add frame
  useEffect(() => {
    if (pendingExternalAddFrame !== null) {
      const timer = setTimeout(() => {
        setPendingExternalAddFrame(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingExternalAddFrame]);
  
  // Track internal generation drop processing state
  const [isInternalDropProcessing, setIsInternalDropProcessing] = useState(false);
  
  // Clear pending frame when upload finishes
  useEffect(() => {
    // Only clear if we're not processing an internal drop
    if (!isUploadingImage && !isInternalDropProcessing) {
      setPendingDropFrame(null);
    }
  }, [isUploadingImage, isInternalDropProcessing]);
  
  // Clear pending duplicate frame when the new item appears
  useEffect(() => {
    if (pendingDuplicateFrame !== null) {
      const hasImageAtFrame = images.some(img => img.timeline_frame === pendingDuplicateFrame);
      if (hasImageAtFrame) {
        setPendingDuplicateFrame(null);
      }
    }
  }, [images, pendingDuplicateFrame]);

  // Safety timeout for pending duplicate frame
  useEffect(() => {
    if (pendingDuplicateFrame !== null) {
      const timer = setTimeout(() => {
        setPendingDuplicateFrame(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingDuplicateFrame]);

  // Wrap onImageDrop to intercept targetFrame
  const handleImageDropInterceptor = React.useCallback(async (files: File[], targetFrame?: number) => {
    if (targetFrame !== undefined) {
      console.log('[TimelineContainer] 🦴 Setting pending drop skeleton at frame (file):', targetFrame);
      setPendingDropFrame(targetFrame);
    }
    if (onImageDrop) {
      await onImageDrop(files, targetFrame);
    }
  }, [onImageDrop]);

  // Wrap onGenerationDrop to intercept targetFrame and track processing
  const handleGenerationDropInterceptor = React.useCallback(async (
    generationId: string, 
    imageUrl: string, 
    thumbUrl: string | undefined, 
    targetFrame?: number
  ) => {
    console.log('[PATH_COMPARE] 🟢 DRAG PATH INTERCEPTOR - before mutation:', {
      generationId: generationId?.substring(0, 8),
      imageUrl: imageUrl?.substring(0, 60),
      thumbUrl: thumbUrl?.substring(0, 60),
      targetFrame,
      timestamp: Date.now()
    });
    
    if (targetFrame !== undefined) {
      console.log('[PATH_COMPARE] 🟢 DRAG PATH - Setting pendingDropFrame BEFORE mutation:', targetFrame);
      setPendingDropFrame(targetFrame);
      setIsInternalDropProcessing(true);
    }
    
    try {
      if (onGenerationDrop) {
        await onGenerationDrop(generationId, imageUrl, thumbUrl, targetFrame);
      }
    } finally {
      console.log('[PATH_COMPARE] 🟢 DRAG PATH INTERCEPTOR - after mutation, clearing skeleton');
      setIsInternalDropProcessing(false);
      // We don't strictly need to clear pendingDropFrame here because the effect will catch the state change
      // But clearing it ensures it disappears even if the effect logic is complex
      setPendingDropFrame(null); 
    }
  }, [onGenerationDrop]);
  
  // Wrap onImageDuplicate to show skeleton at the target frame
  const handleDuplicateInterceptor = React.useCallback((imageId: string, timeline_frame: number) => {
    // Calculate where the duplicate will appear (midpoint between this frame and next)
    // Find the next image's frame
    const sortedImages = [...images]
      .filter(img => img.timeline_frame !== undefined && img.timeline_frame !== null)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    
    const currentIndex = sortedImages.findIndex(img => img.timeline_frame === timeline_frame);
    const nextImage = currentIndex >= 0 && currentIndex < sortedImages.length - 1 
      ? sortedImages[currentIndex + 1] 
      : null;
    
    // Calculate the target frame for the duplicate
    // Default gap of 30 frames when duplicating the last/only image
    const DEFAULT_DUPLICATE_GAP = 30;
    let duplicateTargetFrame: number;
    if (nextImage && nextImage.timeline_frame !== undefined) {
      // Midpoint between current and next
      duplicateTargetFrame = Math.floor((timeline_frame + nextImage.timeline_frame) / 2);
    } else {
      // Last/only image - put duplicate DEFAULT_DUPLICATE_GAP frames after it
      duplicateTargetFrame = timeline_frame + DEFAULT_DUPLICATE_GAP;
    }
    
    console.log('[PendingDebug] 🦴 Setting pending duplicate skeleton at frame:', {
      duplicateTargetFrame,
      currentFullMax: fullMax,
      willExpandTimeline: duplicateTargetFrame > fullMax,
      timestamp: Date.now()
    });
    setPendingDuplicateFrame(duplicateTargetFrame);
    
    // Call the actual duplicate handler
    onImageDuplicate(imageId, timeline_frame);
  }, [images, onImageDuplicate]);
  
  // File input ref for Add Images button
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Adjust resetGap when maxGap changes to keep it within valid range
  useEffect(() => {
    if (resetGap > maxGap) {
      setResetGap(maxGap);
    }
  }, [maxGap, resetGap]);
  
  // Handle reset button click
  const handleReset = () => {
    onResetFrames(resetGap);
    // Also update the single image endpoint if present
    // When there's 1 image, the endpoint should be at resetGap frames from the image (which is at 0)
    if (images.length === 1 && onSingleImageEndFrameChange) {
      onSingleImageEndFrameChange(resetGap);
    }
  };
  
  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track when a drag just ended to prevent scroll jumps
  const dragJustEndedRef = useRef(false);
  const dragEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // State for context visibility with delay
  const [showContext, setShowContext] = useState(false);
  const contextTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isMobile = useIsMobile();
  
  // Detect tablets - treat them differently from phones for tap-to-move
  const { isTablet } = useDeviceDetection();
  
  // Only show tap-to-move on tablets (not phones or desktop)
  const enableTapToMove = isTablet && !readOnly;

  // Track dimensions at drag start to prevent view jumping when reducing duration
  const dragStartDimensionsRef = useRef<{ fullMin: number; fullMax: number; fullRange: number } | null>(null);
  const isEndpointDraggingRef = useRef(false);

  // Calculate coordinate system using proper timeline dimensions
  // Include pending frames (drop, duplicate, external add) so the ruler updates immediately
  // Also include single image endpoint if present
  const rawDimensions = getTimelineDimensions(
    framePositions,
    [
      pendingDropFrame,
      pendingDuplicateFrame,
      pendingExternalAddFrame,
      // Include endpoint for single-image case so timeline extends to show it
      images.length === 1 && singleImageEndFrame !== undefined ? singleImageEndFrame : null
    ]
  );
  
  // Get actual container dimensions for calculations
  const containerRect = containerRef.current?.getBoundingClientRect() || null;
  const baseContainerWidth = containerRef.current?.clientWidth || 1000;
  // Adjust container width for zoom level to match video strip calculations
  const containerWidth = baseContainerWidth;

  // Drag hook - uses raw dimensions for internal calculations
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
    fullMin: rawDimensions.fullMin,
    fullMax: rawDimensions.fullMax,
    fullRange: rawDimensions.fullRange,
    containerRect,
    setIsDragInProgress,
  });

  // Set/clear frozen dimensions when image drag starts/ends
  // (Endpoint drags set this manually in their mouse handlers)
  useEffect(() => {
    if (dragState.isDragging && dragState.activeId && !dragStartDimensionsRef.current) {
      // Image drag just started - capture current dimensions
      dragStartDimensionsRef.current = {
        fullMin: rawDimensions.fullMin,
        fullMax: rawDimensions.fullMax,
        fullRange: rawDimensions.fullRange,
      };
    } else if (!dragState.isDragging && !isEndpointDraggingRef.current && dragStartDimensionsRef.current) {
      // Drag ended - clear frozen dimensions
      dragStartDimensionsRef.current = null;
    }
  }, [dragState.isDragging, dragState.activeId, rawDimensions.fullMin, rawDimensions.fullMax, rawDimensions.fullRange]);

  // Calculate frozen dimensions for rendering
  // During drag, prevent the coordinate system from shrinking (only allow expansion)
  // This prevents the view from jumping when reducing duration
  const isDraggingAnything = dragState.isDragging || isEndpointDraggingRef.current;

  let fullMin = rawDimensions.fullMin;
  let fullMax = rawDimensions.fullMax;
  let fullRange = rawDimensions.fullRange;

  if (isDraggingAnything && dragStartDimensionsRef.current) {
    // Use the larger of current or drag-start dimensions to prevent shrinking
    fullMax = Math.max(rawDimensions.fullMax, dragStartDimensionsRef.current.fullMax);
    fullMin = Math.min(rawDimensions.fullMin, dragStartDimensionsRef.current.fullMin);
    fullRange = fullMax - fullMin;
  }

  // [PendingDebug] Log when pending frames affect timeline dimensions
  if (pendingDropFrame !== null || pendingDuplicateFrame !== null || pendingExternalAddFrame !== null) {
    console.log('[PendingDebug] 📏 Timeline dimensions with pending frames:', {
      pendingDropFrame,
      pendingDuplicateFrame,
      pendingExternalAddFrame,
      fullMin,
      fullMax,
      fullRange,
      framePositionsCount: framePositions.size,
      timestamp: Date.now()
    });
  }

  // Tap-to-move hook (for tablets only)
  // Uses the same position conflict logic as desktop drag
  const handleTapToMoveAction = React.useCallback(async (imageId: string, targetFrame: number) => {
    const originalPos = framePositions.get(imageId) ?? 0;
    
    console.log('[TapToMove] Moving item:', {
      imageId: imageId.substring(0, 8),
      targetFrame,
      originalPos
    });
    
    // Don't move if target is same as current position
    if (targetFrame === originalPos) {
      console.log('[TapToMove] Target same as current position, skipping');
      return;
    }
    
    const newPositions = new Map(framePositions);
    
    // Check if another item is at the target position (same logic as desktop drag)
    const conflictingItem = [...framePositions.entries()].find(
      ([id, pos]) => id !== imageId && pos === targetFrame
    );
    
    if (conflictingItem) {
      console.log('[TapToMove] 🎯 POSITION CONFLICT DETECTED:', {
        itemId: imageId.substring(0, 8),
        conflictWithId: conflictingItem[0].substring(0, 8),
        targetPos: targetFrame
      });
      
      if (targetFrame === 0) {
        // Special case: moving to position 0
        // The moved item takes position 0
        // The existing item moves to the middle between 0 and the next item
        const sortedItems = [...framePositions.entries()]
          .filter(([id]) => id !== imageId && id !== conflictingItem[0])
          .sort((a, b) => a[1] - b[1]);
        
        // Find the next item after position 0
        const nextItem = sortedItems.find(([_, pos]) => pos > 0);
        const nextItemPos = nextItem ? nextItem[1] : 50; // Default to 50 if no next item
        
        // Move the conflicting item to the midpoint
        const midpoint = Math.floor(nextItemPos / 2);
        
        console.log('[TapToMove] 📍 POSITION 0 INSERT:', {
          movedItem: imageId.substring(0, 8),
          displacedItem: conflictingItem[0].substring(0, 8),
          displacedNewPos: midpoint,
          nextItemPos
        });
        
        newPositions.set(conflictingItem[0], midpoint);
        newPositions.set(imageId, 0);
      } else {
        // Normal case: moving to an occupied position (not 0)
        // Just move the item to 1 frame higher than the target
        const adjustedPosition = targetFrame + 1;
        
        console.log('[TapToMove] 📍 INSERT (not swap):', {
          movedItem: imageId.substring(0, 8),
          originalTarget: targetFrame,
          adjustedPosition,
          occupiedBy: conflictingItem[0].substring(0, 8)
        });
        
        newPositions.set(imageId, adjustedPosition);
      }
    } else {
      // No conflict - just move to the target position
      newPositions.set(imageId, targetFrame);
    }
    
    // Handle frame 0 reassignment if we're leaving position 0
    if (originalPos === 0 && targetFrame !== 0 && !conflictingItem) {
      // We're moving away from position 0, and no one is taking it
      // Find the nearest item to become the new position 0
      const nearest = [...framePositions.entries()]
        .filter(([id]) => id !== imageId)
        .sort((a, b) => a[1] - b[1])[0];
      if (nearest) {
        console.log('[TapToMove] 📍 FRAME 0 REASSIGNMENT:', {
          itemId: imageId.substring(0, 8),
          newFrame0Holder: nearest[0].substring(0, 8)
        });
        newPositions.set(nearest[0], 0);
      }
    }
    
    // Apply fluid timeline logic to ensure proper spacing
    const finalPositions = applyFluidTimeline(
      newPositions,
      imageId,
      targetFrame,
      undefined,
      fullMin,
      fullMax
    );
    
    console.log('[TapToMove] Final positions after fluid timeline:', {
      imageId: imageId.substring(0, 8),
      targetFrame,
      finalFrame: finalPositions.get(imageId),
      totalItems: finalPositions.size
    });
    
    // Update positions via setFramePositions which handles database update
    await setFramePositions(finalPositions);
    
    console.log('[TapToMove] Position update completed');
  }, [framePositions, setFramePositions, fullMin, fullMax]);
  
  const tapToMove = useTapToMove({
    isEnabled: enableTapToMove,
    onMove: handleTapToMoveAction,
    framePositions,
    fullMin,
    fullRange,
    timelineWidth: containerWidth
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
  
  // Track when drag ends to prevent scroll jumps from coordinate system changes
  useEffect(() => {
    if (!dragState.isDragging && dragState.activeId === null) {
      // Drag just ended - set flag and clear after a delay
      dragJustEndedRef.current = true;
      
      if (dragEndTimeoutRef.current) {
        clearTimeout(dragEndTimeoutRef.current);
      }
      
      dragEndTimeoutRef.current = setTimeout(() => {
        dragJustEndedRef.current = false;
      }, 500); // 500ms cooldown after drag ends
    }
    
    return () => {
      if (dragEndTimeoutRef.current) {
        clearTimeout(dragEndTimeoutRef.current);
      }
    };
  }, [dragState.isDragging, dragState.activeId]);

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
    isZooming,
  } = useZoom({ fullMin, fullMax, fullRange, containerRef: timelineRef });

  // Custom zoom handlers that preserve the current viewport center
  const handleZoomInToCenter = () => {
    // Calculate the current viewport center from scroll position
    const scrollContainer = timelineRef.current;
    const timelineContainer = containerRef.current;
    
    if (!scrollContainer || !timelineContainer) {
      // Fallback to fullMin if refs not available
      console.log('[ZoomFix] No refs available, falling back to fullMin');
      handleZoomIn(fullMin);
      return;
    }
    
    // Get current scroll position
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollWidth = timelineContainer.scrollWidth;
    const viewportWidth = scrollContainer.clientWidth;
    
    // Calculate the center of the current viewport in pixels
    const viewportCenterPixel = scrollLeft + (viewportWidth / 2);
    
    // Convert pixel position to frame position
    const viewportCenterFraction = scrollWidth > 0 ? viewportCenterPixel / scrollWidth : 0;
    const viewportCenterFrame = fullMin + (viewportCenterFraction * fullRange);
    
    console.log('[ZoomFix] Zoom In - preserving viewport center:', {
      scrollLeft,
      scrollWidth,
      viewportWidth,
      viewportCenterPixel,
      viewportCenterFraction: viewportCenterFraction.toFixed(3),
      viewportCenterFrame: viewportCenterFrame.toFixed(1),
      fullMin,
      fullRange
    });
    
    // Zoom anchored to the current viewport center
    handleZoomIn(viewportCenterFrame);
  };

  const handleZoomOutFromCenter = () => {
    // Calculate the current viewport center from scroll position
    const scrollContainer = timelineRef.current;
    const timelineContainer = containerRef.current;
    
    if (!scrollContainer || !timelineContainer) {
      // Fallback to fullMin if refs not available
      console.log('[ZoomFix] No refs available, falling back to fullMin');
      handleZoomOut(fullMin);
      return;
    }
    
    // Get current scroll position
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollWidth = timelineContainer.scrollWidth;
    const viewportWidth = scrollContainer.clientWidth;
    
    // Calculate the center of the current viewport in pixels
    const viewportCenterPixel = scrollLeft + (viewportWidth / 2);
    
    // Convert pixel position to frame position
    const viewportCenterFraction = scrollWidth > 0 ? viewportCenterPixel / scrollWidth : 0;
    const viewportCenterFrame = fullMin + (viewportCenterFraction * fullRange);
    
    console.log('[ZoomFix] Zoom Out - preserving viewport center:', {
      scrollLeft,
      scrollWidth,
      viewportWidth,
      viewportCenterPixel,
      viewportCenterFraction: viewportCenterFraction.toFixed(3),
      viewportCenterFrame: viewportCenterFrame.toFixed(1),
      fullMin,
      fullRange
    });
    
    // Zoom anchored to the current viewport center
    handleZoomOut(viewportCenterFrame);
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

  // REMOVED: "Preserve scroll position" effect (lines 358-420)
  // This was conflicting with useZoom's center preservation and causing jitters/drift.
  // useZoom now handles logical center preservation, and the effect below handles scroll sync.

  // Scroll timeline to center on zoom center when zooming
  // IMPORTANT: Only scroll when actually zooming, not when dropping items or changing positions
  useEffect(() => {
    // Skip scroll adjustment if:
    // - A drag is in progress
    // - A drag just ended (cooldown period to prevent coordinate system change scroll)
    // - Not zoomed in
    if (dragState.isDragging || dragJustEndedRef.current || zoomLevel <= 1) {
      return;
    }
    
    if (timelineRef.current && containerRef.current) {
      // Small delay to allow DOM to reflow after zoom change, then instantly scroll
      const timer = setTimeout(() => {
        // Double-check the drag cooldown in case it changed during the timeout
        if (dragJustEndedRef.current) return;
        
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
        
        // Use instant scroll for immediate zoom-to-position effect
        scrollContainer.scrollTo({
          left: Math.max(0, targetScroll),
          behavior: 'instant'
        });
      }, 10); // Small delay to ensure DOM has reflowed
      
      return () => clearTimeout(timer);
    }
  }, [zoomLevel, zoomCenter]); // Dependencies don't include dragState to avoid re-running on drop

  // Unified drop hook (handles both file drops and generation drops)
  const {
    isFileOver,
    dropTargetFrame,
    dragType,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useUnifiedDrop({ 
    onImageDrop: handleImageDropInterceptor, 
    onGenerationDrop: handleGenerationDropInterceptor, 
    fullMin, 
    fullRange 
  });

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
  const pairInfo = getPairInfo(currentPositions);
  const numPairs = Math.max(0, images.length - 1);
  const maxAllowedGap = 81;
  
  // Compute shot_generation_id → position index map for instant video slot updates
  // This allows videos to move instantly during drag (without waiting for DB refetch)
  // IMPORTANT: compute this every render (not memoized) because currentPositions may be mutated in-place.
  // This keeps segment outputs moving instantly during drag/reorder.
  const localShotGenPositions = (() => {
    const posMap = new Map<string, number>();
    const sortedEntries = [...currentPositions.entries()].sort((a, b) => a[1] - b[1]);
    sortedEntries.forEach(([shotGenId], index) => {
      posMap.set(shotGenId, index);
    });
    return posMap;
  })();

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
        {/* Fixed top controls overlay - Zoom and Structure controls */}
        {/* Show when: there's a structure video OR when showing the uploader (no video, not readOnly) */}
        {shotId && projectId && onStructureVideoChange && (structureVideoPath || !readOnly) && (
        <div
          className="absolute left-0 z-30 flex items-end justify-between pointer-events-none px-8"
          style={{ 
            width: "100%", 
            maxWidth: "100vw", 
            top: zoomLevel > 1 ? '0.98875rem' : '1rem' // Move up slightly when zoomed to avoid scrollbar overlap
          }}
        >
          {/* Zoom controls */}
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

          {/* Middle: Add Audio - absolutely centered */}
          {!audioUrl && onAudioChange && !readOnly && (
            <label className="absolute left-1/2 -translate-x-1/2 cursor-pointer pointer-events-auto">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const audio = new Audio();
                    const tempUrl = URL.createObjectURL(file);
                    audio.src = tempUrl;
                    await new Promise<void>((resolve, reject) => {
                      audio.addEventListener('loadedmetadata', () => resolve());
                      audio.addEventListener('error', () => reject(new Error('Failed to load audio')));
                    });
                    const { uploadVideoToStorage } = await import('@/shared/lib/videoUploader');
                    const uploadedUrl = await uploadVideoToStorage(file, projectId!, shotId);
                    URL.revokeObjectURL(tempUrl);
                    onAudioChange(uploadedUrl, { duration: audio.duration, name: file.name });
                    e.target.value = '';
                  } catch (error) {
                    console.error('Error uploading audio:', error);
                  }
                }}
              />
              <span className="text-xs text-muted-foreground hover:text-foreground">Add Audio</span>
            </label>
          )}

          {/* Right side: Upload button for guidance video (controls moved to Motion section) */}
          {/* Show upload controls: always for multi-video mode, or when no video in legacy mode */}
          {(structureVideos ? true : !structureVideoPath) && (
            /* Add guidance video controls - styled like zoom controls, on the right */
            <div className={`flex items-center gap-2 pointer-events-auto bg-background/95 backdrop-blur-sm px-2 py-1 rounded shadow-md border border-border/50 ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Guidance video:
              </span>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsUploadingStructureVideo(true);
                  try {
                    const { extractVideoMetadata, uploadVideoToStorage } = await import('@/shared/lib/videoUploader');
                    const metadata = await extractVideoMetadata(file);
                    const videoUrl = await uploadVideoToStorage(file, projectId!, shotId);

                    // Create resource for reuse
                    const { data: { user } } = await supabase.auth.getUser();
                    const now = new Date().toISOString();
                    const resourceMetadata: StructureVideoMetadata = {
                      name: `Guidance Video ${new Date().toLocaleString()}`,
                      videoUrl: videoUrl,
                      thumbnailUrl: null,
                      videoMetadata: metadata,
                      created_by: { is_you: true, username: user?.email || 'user' },
                      is_public: privacyDefaults.resourcesPublic,
                      createdAt: now,
                    };
                    await createResource.mutateAsync({ type: 'structure-video', metadata: resourceMetadata });

                    // Use multi-video interface if available, otherwise fall back to legacy
                    if (onAddStructureVideo) {
                      // Calculate default range for new video
                      // Use full video length - don't limit to timeline extent
                      const videoFrameCount = metadata.total_frames;
                      let start_frame = 0;
                      let end_frame = videoFrameCount;
                      
                      // If there are existing videos, place after last
                      if (structureVideos && structureVideos.length > 0) {
                        const sorted = [...structureVideos].sort((a, b) => a.start_frame - b.start_frame);
                        const lastVideo = sorted[sorted.length - 1];
                        const lastVideoIndex = structureVideos.findIndex(v => v.path === lastVideo.path && v.start_frame === lastVideo.start_frame);
                        start_frame = lastVideo.end_frame;
                        end_frame = start_frame + videoFrameCount;
                        
                        // If no space on timeline (start would be at or past fullMax),
                        // clip 1/5 of the last video's range and place new video there
                        if (start_frame >= fullMax && onUpdateStructureVideo && lastVideoIndex >= 0) {
                          const lastVideoRange = lastVideo.end_frame - lastVideo.start_frame;
                          const clipAmount = Math.max(10, Math.floor(lastVideoRange / 5)); // At least 10 frames
                          const newLastVideoEnd = lastVideo.end_frame - clipAmount;
                          
                          // Only clip if the last video would still have meaningful duration
                          if (newLastVideoEnd > lastVideo.start_frame + 10) {
                            onUpdateStructureVideo(lastVideoIndex, { end_frame: newLastVideoEnd });
                            start_frame = newLastVideoEnd;
                            end_frame = start_frame + videoFrameCount;
                          }
                        }
                      }
                      
                      onAddStructureVideo({
                        path: videoUrl,
                        start_frame,
                        end_frame,
                        treatment: 'adjust',
                        motion_strength: 1.0,
                        structure_type: 'flow',
                        metadata,
                        resource_id: null,
                      });
                    } else if (onStructureVideoChange) {
                      // Legacy single-video interface
                      onStructureVideoChange(videoUrl, metadata, structureVideoTreatment, structureVideoMotionStrength, structureVideoType);
                    }
                    e.target.value = '';
                  } catch (error) {
                    console.error('Error uploading video:', error);
                  } finally {
                    setIsUploadingStructureVideo(false);
                  }
                }}
                className="hidden"
                id="guidance-video-upload-top"
              />
              <Label htmlFor="guidance-video-upload-top" className="m-0 cursor-pointer">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  asChild
                >
                  <span>Upload</span>
                </Button>
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setShowVideoBrowser(true)}
              >
                Browse
              </Button>
            </div>
          )}
        </div>
        )}

        {/* Timeline scrolling container */}
        <div
          ref={timelineRef}
          className={`timeline-scroll relative bg-muted/20 border rounded-lg px-5 overflow-x-auto ${zoomLevel <= 1 ? 'no-scrollbar' : ''} ${
            isFileOver ? 'ring-2 ring-primary bg-primary/5' : ''
          }`}
          style={{
            minHeight: "240px",
            paddingTop: structureVideoPath || isUploadingStructureVideo ? "2.5rem" : "2.5rem",  // Same padding for controls bar
            paddingBottom: "7.5rem"
          }}
          onDragEnter={handleDragEnter}
          onDragOver={(e) => handleDragOver(e, containerRef)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, containerRef)}
        >

        {/* Segment output strip - shows generated segments above timeline */}
        {shotId && projectId && !readOnly && (
          <SegmentOutputStrip
            shotId={shotId}
            projectId={projectId}
            projectAspectRatio={projectAspectRatio}
            pairInfo={pairInfo}
            fullMin={fullMin}
            fullMax={fullMax}
            fullRange={fullRange}
            containerWidth={containerWidth}
            zoomLevel={zoomLevel}
            localShotGenPositions={localShotGenPositions}
            onOpenPairSettings={onPairClick ? (pairIndex: number) => {
              // Construct pair data for the modal (same logic as PairRegion onPairClick)
              const sortedPositions = [...currentPositions.entries()].sort((a, b) => a[1] - b[1]);
              const startEntry = sortedPositions[pairIndex];
              const endEntry = sortedPositions[pairIndex + 1];
              
              if (!startEntry || !endEntry) return;
              
              const startImage = images.find(img => img.id === startEntry[0]);
              const endImage = images.find(img => img.id === endEntry[0]);
              
              const startPosition = pairIndex + 1;
              const endPosition = pairIndex + 2;
              
              onPairClick(pairIndex, {
                index: pairIndex,
                frames: endEntry[1] - startEntry[1],
                startFrame: startEntry[1],
                endFrame: endEntry[1],
                startImage: startImage ? {
                  id: startImage.id,
                  url: startImage.imageUrl || startImage.thumbUrl,
                  thumbUrl: startImage.thumbUrl,
                  timeline_frame: (startImage as GenerationRow & { timeline_frame?: number }).timeline_frame ?? 0,
                  position: startPosition
                } : null,
                endImage: endImage ? {
                  id: endImage.id,
                  url: endImage.imageUrl || endImage.thumbUrl,
                  thumbUrl: endImage.thumbUrl,
                  timeline_frame: (endImage as GenerationRow & { timeline_frame?: number }).timeline_frame ?? 0,
                  position: endPosition
                } : null
              });
            } : undefined}
            selectedParentId={selectedOutputId}
            onSelectedParentChange={onSelectedOutputChange}
          />
        )}

        {/* Structure video strip(s) - supports both multi-video and legacy single-video */}
        {shotId && projectId && (
          // NEW: Use GuidanceVideosContainer when array interface is available
          structureVideos && onUpdateStructureVideo && onRemoveStructureVideo ? (
            <GuidanceVideosContainer
              structureVideos={structureVideos}
              onUpdateVideo={onUpdateStructureVideo}
              onRemoveVideo={onRemoveStructureVideo}
              fullMin={fullMin}
              fullMax={fullMax}
              fullRange={fullRange}
              containerWidth={containerWidth}
              zoomLevel={zoomLevel}
              timelineFrameCount={images.length}
              readOnly={readOnly}
            />
          ) : onStructureVideoChange && (
            // LEGACY: Fall back to single-video interface
            structureVideoPath ? (
              // Show video strip if there's a path, even without metadata (metadata can be fetched from video)
              <GuidanceVideoStrip
                videoUrl={structureVideoPath}
                videoMetadata={structureVideoMetadata || null}
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
                onMetadataExtracted={(metadata) => {
                  // Save extracted metadata back to database (backup when metadata wasn't saved initially)
                  console.log('[TimelineContainer] 💾 Saving extracted metadata back to database');
                  onStructureVideoChange(structureVideoPath, metadata, structureVideoTreatment, structureVideoMotionStrength, structureVideoType);
                }}
                fullMin={fullMin}
                fullMax={fullMax}
                fullRange={fullRange}
                containerWidth={containerWidth}
                zoomLevel={zoomLevel}
                timelineFrameCount={images.length}
                frameSpacing={50}
                readOnly={readOnly}
              />
            ) : isUploadingStructureVideo ? (
              // Show loading placeholder while uploading
              <div
                className="relative h-28 mb-0"
                style={{
                  width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
                  minWidth: '100%',
                }}
              >
                <div className="absolute left-4 right-4 top-6 bottom-2 flex items-center justify-center bg-muted/50 dark:bg-muted-foreground/15 border border-border/30 rounded-sm">
                  <span className="text-xs text-muted-foreground font-medium">
                    Uploading video...
                  </span>
                </div>
              </div>
            ) : !readOnly ? (
              // Only show uploader placeholder if NOT readOnly and no video exists
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
            ) : null
          )
        )}

        {/* Audio strip - shown when audio is uploaded */}
        {onAudioChange && audioUrl && (
          <div className="mt-1 mb-2">
            <AudioStrip
              audioUrl={audioUrl}
              audioMetadata={audioMetadata || null}
              onRemove={() => onAudioChange(null, null)}
              fullMin={fullMin}
              fullMax={fullMax}
              fullRange={fullRange}
              containerWidth={containerWidth}
              zoomLevel={zoomLevel}
              readOnly={readOnly}
              compact={!!structureVideoPath}
            />
          </div>
        )}

        {/* Timeline container - visually connected to structure video above */}
        <div
          ref={containerRef}
          id="timeline-container"
          className={`relative h-36 mb-2`}
          onDoubleClick={(e) => {
            // Don't zoom if double-clicking on an item or button
            const target = e.target as HTMLElement;
            const isClickingItem = target.closest('[data-item-id]');
            const isClickingButton = target.closest('button');
            
            if (!isClickingItem && !isClickingButton) {
              handleTimelineDoubleClick(e, containerRef);
            }
          }}
          onClick={(e) => {
            // On tablets, handle tap-to-place for selected items
            if (enableTapToMove && tapToMove.selectedItemId) {
              // Only handle clicks on the timeline background, not on items or buttons
              const target = e.target as HTMLElement;
              const isClickingItem = target.closest('[data-item-id]');
              const isClickingButton = target.closest('button');
              
              if (!isClickingItem && !isClickingButton) {
                e.preventDefault();
                e.stopPropagation();
                tapToMove.handleTimelineTap(e.clientX, containerRef);
              }
            }
          }}
          style={{
            width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
            minWidth: "100%",
            userSelect: 'none',
            paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
            paddingRight: `${TIMELINE_HORIZONTAL_PADDING + 60}px`,
            cursor: tapToMove.selectedItemId ? 'crosshair' : 'default',
          }}
        >
          {/* Drop position indicator - positioned in timeline area only */}
          <DropIndicator
            isVisible={isFileOver}
            dropTargetFrame={dropTargetFrame}
            fullMin={fullMin}
            fullRange={fullRange}
            containerWidth={containerWidth}
            dragType={dragType}
          />

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

            // Don't hide pairs during drag - let them stretch and follow the dragged item
            // This provides better visual feedback about where the item is moving
            // (Previously we hid pairs involving the dragged item, but this caused too many
            // markers to disappear, especially when dragging items in the middle)

            // Hide context with delay for non-dragged pairs when not dragging
            // REMOVED: This was causing pairs to disappear ("naked images") for 100ms after drop
            // if (!dragState.isDragging && !showContext) {
            //   return null; 
            // }

            // Calculate pixel positions with padding adjustment
            const getPixel = (entry: [string, number] | undefined): number => {
              if (!entry) return 0;
              const [id, framePos] = entry;

              // Skip DOM-based positioning for dragged items
              // REMOVED: Now that we show pairs during drag, we need the actual pixel position, not 0
              // if (dragState.isDragging && id === dragState.activeId) {
              //   return 0; 
              // }

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

            const contextStartFrameUnclipped = actualEndFrame;
            const contextStartFrame = Math.max(0, contextStartFrameUnclipped);
            const visibleContextFrames = Math.max(0, actualEndFrame - contextStartFrame);
            
            // Use same padding calculation as getPixel function
            const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
            const contextStartPixel = TIMELINE_PADDING_OFFSET + ((contextStartFrame - fullMin) / fullRange) * effectiveWidth;
            const contextStartPercent = (contextStartPixel / containerWidth) * 100;

            const generationStartPixel = TIMELINE_PADDING_OFFSET + ((pair.generationStart - fullMin) / fullRange) * effectiveWidth;
            const generationStartPercent = (generationStartPixel / containerWidth) * 100;

            // CRITICAL: Get the first image in this pair to read its metadata
            // startEntry[0] is the shot_generations.id which matches img.id
            const startImage = images.find(img => img.id === startEntry?.[0]);
            
            // Read pair prompts from props first, then fallback to metadata
            // Props take precedence when passed (used during batch generation setup)
            // Type-safe access to metadata (no 'as any' needed)
            const pairPromptFromMetadata = startImage?.metadata?.pair_prompt || '';
            const pairNegativePromptFromMetadata = startImage?.metadata?.pair_negative_prompt || '';
            
            // Enhanced prompt: use prop if provided, otherwise fallback to metadata
            const enhancedPromptFromProps = enhancedPrompts?.[index] || '';
            const enhancedPromptFromMetadata = startImage?.metadata?.enhanced_prompt || '';
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
                numPairs={numPairs}
                startFrame={pair.startFrame}
                endFrame={pair.endFrame}
                onPairClick={onPairClick ? (pairIndex, pairData) => {
                  // Get the images for this pair (by shot_generations.id)
                  const startImage = images.find(img => img.id === startEntry?.[0]);
                  const endImage = images.find(img => img.id === endEntry?.[0]);
                  
                  // Calculate actual position numbers (1-based)
                  const startPosition = index + 1; // First image in pair
                  const endPosition = index + 2;   // Second image in pair
                  
                  // Debug logging for pair click
                  console.log('[PairClick] 🔍 PAIR CLICKED:', {
                    pairIndex,
                    mapLoopIndex: index,
                    sortedPositionsLength: sortedDynamicPositions.length,
                    startEntryId: startEntry?.[0]?.substring(0, 8),
                    startEntryFrame: startEntry?.[1],
                    endEntryId: endEntry?.[0]?.substring(0, 8),
                    endEntryFrame: endEntry?.[1],
                    startImageFound: !!startImage,
                    startImageId: startImage?.id?.substring(0, 8),
                    allSortedIds: sortedDynamicPositions.map(([id, frame]) => `${id.substring(0, 8)}@${frame}`),
                  });
                  
                  // Call the original onPairClick with enhanced data
                  onPairClick(pairIndex, {
                    ...pairData,
                    startImage: startImage ? {
                      id: startImage.id, // shot_generations.id
                      url: startImage.imageUrl || startImage.thumbUrl,
                      thumbUrl: startImage.thumbUrl,
                      timeline_frame: (startImage as GenerationRow & { timeline_frame?: number }).timeline_frame ?? 0,
                      position: startPosition
                    } : null,
                    endImage: endImage ? {
                      id: endImage.id, // shot_generations.id
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
                hidePairLabel={
                  !!tapToMove.selectedItemId || 
                  (isFileOver && dropTargetFrame !== null && dropTargetFrame > actualStartFrame && dropTargetFrame < actualEndFrame) ||
                  (dragState.isDragging && currentDragFrame !== null && currentDragFrame > actualStartFrame && currentDragFrame < actualEndFrame)
                }
                onClearEnhancedPrompt={onClearEnhancedPrompt}
              />
            );
          })}

          {/* Single image endpoint - draggable handle to set video duration when there's only one image */}
          {images.length === 1 && currentPositions.size > 0 && onSingleImageEndFrameChange && (() => {
            const entry = [...currentPositions.entries()][0];
            if (!entry) return null;

            const [id, imageFrame] = entry;
            // Default end frame to 49 frames from image (approximately 2 seconds at 24fps)
            // Use provided singleImageEndFrame or calculate default
            const defaultEndFrame = imageFrame + 49;
            const effectiveEndFrame = singleImageEndFrame ?? defaultEndFrame;
            const gapToImage = effectiveEndFrame - imageFrame;

            // Check if endpoint is being dragged
            const isEndpointDragging = dragState.isDragging && dragState.activeId === SINGLE_IMAGE_ENDPOINT_ID;

            return (
              <SingleImageEndpoint
                framePosition={effectiveEndFrame}
                imageFramePosition={imageFrame}
                isDragging={isEndpointDragging}
                dragOffset={isEndpointDragging ? dragOffset : null}
                onMouseDown={readOnly ? undefined : (e, endpointId) => {
                  // Custom drag handler for the endpoint
                  // We'll track mouse movement and update the endpoint position
                  e.preventDefault();
                  e.stopPropagation();

                  // Store dimensions at drag start to prevent view jumping when reducing
                  dragStartDimensionsRef.current = { fullMin, fullMax, fullRange };
                  isEndpointDraggingRef.current = true;

                  const handleMouseMove = (moveEvent: MouseEvent) => {
                    if (!containerRef.current) return;

                    // Use the frozen dimensions during drag
                    const frozenFullMin = dragStartDimensionsRef.current?.fullMin ?? fullMin;
                    const frozenFullMax = dragStartDimensionsRef.current?.fullMax ?? fullMax;
                    const frozenFullRange = dragStartDimensionsRef.current?.fullRange ?? fullRange;

                    const containerRect = containerRef.current.getBoundingClientRect();
                    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
                    const relativeX = moveEvent.clientX - containerRect.left - TIMELINE_PADDING_OFFSET;

                    // Calculate frame from pixel position using frozen dimensions
                    let newFrame = frozenFullMin + (relativeX / effectiveWidth) * frozenFullRange;

                    // Constrain: minimum 5 frames from image, maximum based on maxFrameLimit (77 for smooth continuations, 81 otherwise)
                    const minFrame = imageFrame + 5;
                    const maxFrame = imageFrame + maxFrameLimit;
                    newFrame = Math.max(minFrame, Math.min(Math.round(newFrame), maxFrame));

                    // Quantize to 4N+1 format (5, 9, 13, 17, 21, 25, ...)
                    const gap = newFrame - imageFrame;
                    const quantizedGap = Math.max(5, Math.round((gap - 1) / 4) * 4 + 1);
                    const quantizedFrame = imageFrame + quantizedGap;

                    onSingleImageEndFrameChange(Math.min(quantizedFrame, maxFrame));
                  };

                  const handleMouseUp = () => {
                    // Clear the frozen dimensions on drag end
                    dragStartDimensionsRef.current = null;
                    isEndpointDraggingRef.current = false;
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                  };

                  document.addEventListener('mousemove', handleMouseMove);
                  document.addEventListener('mouseup', handleMouseUp);
                }}
                timelineWidth={containerWidth}
                fullMinFrames={fullMin}
                fullRange={fullRange}
                currentDragFrame={isEndpointDragging ? currentDragFrame : null}
                gapToImage={gapToImage}
                maxAllowedGap={maxAllowedGap}
                readOnly={readOnly}
              />
            );
          })()}

          {/* Pending item vertical marker - shows immediately when drop/duplicate/add starts */}
          {(pendingDropFrame !== null || pendingDuplicateFrame !== null || pendingExternalAddFrame !== null) && (() => {
            const pendingFrame = pendingDropFrame ?? pendingDuplicateFrame ?? pendingExternalAddFrame;
            if (pendingFrame === null) return null;
            
            const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
            const pixelPos = TIMELINE_PADDING_OFFSET + ((pendingFrame - fullMin) / fullRange) * effectiveWidth;
            const leftPercent = (pixelPos / containerWidth) * 100;
            
            // Use a lighter/dashed style to indicate it's pending
            // Color matches the next pair color based on current item count
            const pairColors = ['bg-blue-300', 'bg-emerald-300', 'bg-purple-300', 'bg-orange-300', 'bg-rose-300', 'bg-teal-300'];
            const colorIndex = images.length % pairColors.length;
            
            return (
              <div
                className={`absolute top-0 bottom-0 w-[2px] ${pairColors[colorIndex]} pointer-events-none z-5 opacity-60`}
                style={{
                  left: `${leftPercent}%`,
                  transform: 'translateX(-50%)',
                }}
              />
            );
          })()}

          {/* Skeleton for uploading item */}
          {(isUploadingImage || isInternalDropProcessing) && pendingDropFrame !== null && (
            <TimelineSkeletonItem
              framePosition={pendingDropFrame}
              fullMin={fullMin}
              fullRange={fullRange}
              containerWidth={containerWidth}
              projectAspectRatio={projectAspectRatio}
            />
          )}
          
          {/* Skeleton for duplicating item */}
          {pendingDuplicateFrame !== null && (
            <TimelineSkeletonItem
              framePosition={pendingDuplicateFrame}
              fullMin={fullMin}
              fullRange={fullRange}
              containerWidth={containerWidth}
              projectAspectRatio={projectAspectRatio}
            />
          )}

          {/* Skeleton for external add (GenerationsPane) */}
          {pendingExternalAddFrame !== null && (
            <TimelineSkeletonItem
              framePosition={pendingExternalAddFrame}
              fullMin={fullMin}
              fullRange={fullRange}
              containerWidth={containerWidth}
              projectAspectRatio={projectAspectRatio}
            />
          )}

          {/* Timeline items */}
          {(() => {
            // [TimelineVisibility] Log what items are about to be rendered
            const itemsWithPositions = images.filter(img => {
              // img.id is shot_generations.id - unique per entry
              return currentPositions.has(img.id) || img.timeline_frame !== undefined;
            });
            const itemsWithoutPositions = images.filter(img => {
              return !currentPositions.has(img.id) && img.timeline_frame === undefined;
            });
            
            if (itemsWithoutPositions.length > 0) {
              console.log(`[TimelineVisibility] ⏳ SKIPPING ${itemsWithoutPositions.length} items without positions:`, {
                shotId: shotId.substring(0, 8),
                skippedIds: itemsWithoutPositions.map(img => img.id?.substring(0, 8)),
                renderingCount: itemsWithPositions.length,
                timestamp: Date.now()
              });
            }
            
            console.log(`[TimelineVisibility] 🎬 RENDERING ${itemsWithPositions.length}/${images.length} timeline items:`, {
              shotId: shotId.substring(0, 8),
              currentPositionsSize: currentPositions.size,
              timestamp: Date.now()
            });
            return null;
          })()}
          {images.map((image, idx) => {
            // imageKey is shot_generations.id - unique per entry
            const imageKey = image.id;
            
            // KEY FIX: Get position from the positions map, but fall back to image.timeline_frame
            // for newly added items whose ID just changed (temp -> real)
            const positionFromMap = currentPositions.get(imageKey);
            
            // Use position from map if available, otherwise fall back to image.timeline_frame
            // This prevents flicker when temp ID is replaced with real ID in onSuccess
            const framePosition = positionFromMap ?? image.timeline_frame;
            
            // Only skip if we truly have no position information at all
            if (framePosition === undefined || framePosition === null) {
              // Log skipped items at debug level
              if (process.env.NODE_ENV === 'development') {
                console.log(`[TimelineVisibility] ⏳ Skipping item with no position:`, {
                  imageKey: imageKey?.substring(0, 8),
                  positionFromMap,
                  imageTimelineFrame: image.timeline_frame,
                  reason: 'No position available from map or image'
                });
              }
              return null;
            }
            
            const isDragging = dragState.isDragging && dragState.activeId === imageKey;

            return (
              <TimelineItem
                key={imageKey}
                image={image}
                framePosition={framePosition}
                isDragging={isDragging}
                isSwapTarget={swapTargetId === imageKey}
                dragOffset={isDragging ? dragOffset : null}
                onMouseDown={readOnly ? undefined : (e) => handleMouseDown(e, imageKey, containerRef)}
                onDoubleClick={isMobile && !isTablet ? undefined : () => handleDesktopDoubleClick(idx)}
                onMobileTap={isMobile ? () => {
                  console.log('[DoubleTapFlow] 📲 TimelineContainer handleMobileTap called:', {
                    itemId: imageKey?.substring(0, 8),
                    index: idx,
                    isMobile,
                    isTablet
                  });
                  handleMobileTap(idx);
                } : undefined}
                zoomLevel={zoomLevel}
                timelineWidth={containerWidth}
                fullMinFrames={fullMin}
                fullRange={fullRange}
                currentDragFrame={isDragging ? currentDragFrame : null}
                dragDistances={isDragging ? dragDistances : null}
                maxAllowedGap={maxAllowedGap}
                originalFramePos={framePositions.get(imageKey) ?? 0}
                onDelete={onImageDelete}
                onDuplicate={handleDuplicateInterceptor}
                onInpaintClick={handleInpaintClick ? () => handleInpaintClick(idx) : undefined}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                projectAspectRatio={projectAspectRatio}
                readOnly={readOnly}
                isSelectedForMove={tapToMove.isItemSelected(imageKey)}
                onTapToMove={enableTapToMove ? () => tapToMove.handleItemTap(imageKey) : undefined}
              />
            );
          })}
        </div>
        </div>

        {/* Fixed bottom controls overlay */}
        <div
          className="absolute bottom-4 left-0 z-30 flex items-center justify-between pointer-events-none px-8"
          style={{ 
            width: "100%", 
            maxWidth: "100vw",
            bottom: zoomLevel > 1 ? '1.6rem' : '1rem' // Lift controls when zoomed to avoid scrollbar overlap
          }}
        >
          {readOnly ? (
            // Read-only mode: Just zoom controls
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
          ) : (
            <>
              {/* Bottom-left: Gap control and Reset button */}
              <div 
                className={`flex items-center gap-2 w-fit pointer-events-auto bg-background/95 backdrop-blur-sm px-2 py-1 rounded shadow-md border border-border/50 ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}
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

              {/* Bottom-right: Add Images button with progress */}
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
                    disabled={isUploadingImage}
                  />
                  {isUploadingImage ? (
                    <div className="flex flex-col gap-1.5 min-w-[120px]">
                      <div className="text-xs text-muted-foreground">
                        Uploading... {Math.round(uploadProgress)}%
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div 
                          className="bg-primary h-1.5 rounded-full transition-all duration-200"
                          style={{ width: `${Math.round(uploadProgress)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
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
                  )}
                </div>
              ) : <div />}
            </>
          )}
        </div>
      </div>
      
      {/* Video Browser Modal */}
      <DatasetBrowserModal
        isOpen={showVideoBrowser}
        onOpenChange={setShowVideoBrowser}
        resourceType="structure-video"
        title="Browse Guidance Videos"
        onResourceSelect={(resource: Resource) => {
          const metadata = resource.metadata as StructureVideoMetadata;
          console.log('[TimelineContainer] Video selected from browser:', {
            resourceId: resource.id,
            videoUrl: metadata.videoUrl,
          });
          
          // Use multi-video interface if available, otherwise fall back to legacy
          if (onAddStructureVideo && metadata.videoMetadata) {
            // Calculate default range for new video
            // Use full video length - don't limit to timeline extent
            const videoFrameCount = metadata.videoMetadata.total_frames;
            let start_frame = 0;
            let end_frame = videoFrameCount;
            
            // If there are existing videos, place after last
            if (structureVideos && structureVideos.length > 0) {
              const sorted = [...structureVideos].sort((a, b) => a.start_frame - b.start_frame);
              const lastVideo = sorted[sorted.length - 1];
              const lastVideoIndex = structureVideos.findIndex(v => v.path === lastVideo.path && v.start_frame === lastVideo.start_frame);
              start_frame = lastVideo.end_frame;
              end_frame = start_frame + videoFrameCount;
              
              // If no space on timeline (start would be at or past fullMax),
              // clip 1/5 of the last video's range and place new video there
              if (start_frame >= fullMax && onUpdateStructureVideo && lastVideoIndex >= 0) {
                const lastVideoRange = lastVideo.end_frame - lastVideo.start_frame;
                const clipAmount = Math.max(10, Math.floor(lastVideoRange / 5)); // At least 10 frames
                const newLastVideoEnd = lastVideo.end_frame - clipAmount;
                
                // Only clip if the last video would still have meaningful duration
                if (newLastVideoEnd > lastVideo.start_frame + 10) {
                  onUpdateStructureVideo(lastVideoIndex, { end_frame: newLastVideoEnd });
                  start_frame = newLastVideoEnd;
                  end_frame = start_frame + videoFrameCount;
                }
              }
            }
            
            onAddStructureVideo({
              path: metadata.videoUrl,
              start_frame,
              end_frame,
              treatment: 'adjust',
              motion_strength: 1.0,
              structure_type: 'flow',
              metadata: metadata.videoMetadata,
              resource_id: resource.id,
            });
          } else if (onStructureVideoChange) {
            // Legacy single-video interface
            onStructureVideoChange(
              metadata.videoUrl, 
              metadata.videoMetadata, 
              structureVideoTreatment, 
              structureVideoMotionStrength, 
              structureVideoType
            );
          }
          setShowVideoBrowser(false);
        }}
      />
    </div>
  );
};

// 🎯 PERF FIX: Wrap in React.memo to prevent re-renders when props haven't changed
export default React.memo(TimelineContainer);
