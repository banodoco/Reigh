import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { GenerationRow } from "@/types/shots";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { SegmentedControl, SegmentedControlItem } from "@/shared/components/ui/segmented-control";
import ShotImageManager from "@/shared/components/ShotImageManager";
import Timeline from "./Timeline"; // Main timeline component with drag/drop and image actions
import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { useEnhancedShotPositions } from "@/shared/hooks/useEnhancedShotPositions";
import { useEnhancedShotImageReorder } from "@/shared/hooks/useEnhancedShotImageReorder";
import { useTimelinePositionUtils } from "@/shared/hooks/useTimelinePositionUtils";
import { supabase } from "@/integrations/supabase/client";
import MediaLightbox from "@/shared/components/MediaLightbox";
import type { SegmentSlotModeData } from "@/shared/components/MediaLightbox/types";
import type { PairData } from "./Timeline/TimelineContainer";
import { Download, Loader2, Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { useSegmentOutputsForShot } from '../hooks/useSegmentOutputsForShot';
import { toast } from "sonner";
import { getDisplayUrl } from '@/shared/lib/utils';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import { BatchGuidanceVideo } from './BatchGuidanceVideo';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Video } from 'lucide-react';
import { isVideoGeneration, isPositioned, isVideoAny } from '@/shared/lib/typeGuards';
import { useVariantBadges } from '@/shared/hooks/useVariantBadges';
import { usePendingSegmentTasks } from '@/shared/hooks/usePendingSegmentTasks';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';

interface ShotImagesEditorProps {
  /** Controls whether internal UI should render the skeleton */
  isModeReady: boolean;
  /** Optional error text shown at the top of the card */
  settingsError?: string | null;
  /** Whether the UI is currently on a mobile breakpoint */
  isMobile: boolean;
  /** Current generation mode */
  generationMode: "batch" | "timeline";
  /** Callback to switch modes */
  onGenerationModeChange: (mode: "batch" | "timeline") => void;
  /** Selected shot id */
  selectedShotId: string;
  /** Optional preloaded images (for read-only/share views) - bypasses database queries */
  preloadedImages?: any[];
  /** Read-only mode - disables all interactions */
  readOnly?: boolean;
  /** Project id for video uploads */
  projectId?: string;
  /** Shot name for download filename */
  shotName?: string;
  /** Frame spacing (frames between key-frames) */
  batchVideoFrames: number;
  /** Reordering callback – receives ordered ids and optionally the dragged item ID */
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  /** Timeline frame positions change */
  onFramePositionsChange: (newPositions: Map<string, number>) => void;
  /** Callback when external images are dropped on the timeline */
  onImageDrop: (files: File[], targetFrame?: number) => Promise<void>;
  /** Callback when generations are dropped from GenerationsPane onto the timeline */
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  /** Callback when external images are dropped on batch mode grid */
  onBatchFileDrop?: (files: File[], targetPosition?: number) => Promise<void>;
  /** Callback when generations are dropped from GenerationsPane onto batch mode grid */
  onBatchGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetPosition?: number) => Promise<void>;
  /** Map of pending frame positions coming from server */
  pendingPositions: Map<string, number>;
  /** Callback when pending position is applied */
  onPendingPositionApplied: (generationId: string) => void;
  /** Image deletion callback - id is shot_generations.id (unique per entry) */
  onImageDelete: (id: string) => void;
  /** Batch image deletion callback - ids are shot_generations.id values */
  onBatchImageDelete?: (ids: string[]) => void;
  /** Image duplication callback - id is shot_generations.id */
  onImageDuplicate?: (id: string, timeline_frame: number) => void;
  /** Number of columns for batch mode grid */
  columns: 2 | 3 | 4 | 6;
  /** Skeleton component to show while loading */
  skeleton: React.ReactNode;
  /** Count of unpositioned generations */
  unpositionedGenerationsCount: number;
  /** Callback to open unpositioned pane */
  onOpenUnpositionedPane: () => void;
  /** File input key for resetting */
  fileInputKey: number;
  /** Image upload callback */
  onImageUpload: (files: File[]) => Promise<void>;
  /** Whether currently uploading image */
  isUploadingImage: boolean;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  /** ID of image currently being duplicated */
  duplicatingImageId?: string | null;
  /** ID of image that was just duplicated (for success indication) */
  duplicateSuccessImageId?: string | null;
  /** Project aspect ratio for display */
  projectAspectRatio?: string;
  /** Default prompt for timeline pairs (from existing generation settings) */
  defaultPrompt?: string;
  onDefaultPromptChange?: (prompt: string) => void;
  /** Default negative prompt for timeline pairs (from existing generation settings) */
  defaultNegativePrompt?: string;
  onDefaultNegativePromptChange?: (prompt: string) => void;
  /** Structure video props - passed from parent for task generation */
  // Structure video props - legacy single-video interface
  structureVideoPath?: string | null;
  structureVideoMetadata?: VideoMetadata | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  /** Uni3C end percent (only used when structureVideoType is 'uni3c') */
  uni3cEndPercent?: number;
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  /** Callback for changing uni3c end percent */
  onUni3cEndPercentChange?: (value: number) => void;
  // NEW: Multi-video array interface
  structureVideos?: import("@/shared/lib/tasks/travelBetweenImages").StructureVideoConfigWithMetadata[];
  onAddStructureVideo?: (video: import("@/shared/lib/tasks/travelBetweenImages").StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<import("@/shared/lib/tasks/travelBetweenImages").StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;
  /** Set the entire structure videos array (for overlap resolution) */
  onSetStructureVideos?: (videos: import("@/shared/lib/tasks/travelBetweenImages").StructureVideoConfigWithMetadata[]) => void;
  /** Audio strip props */
  audioUrl?: string | null;
  audioMetadata?: { duration: number; name?: string } | null;
  onAudioChange?: (
    audioUrl: string | null,
    metadata: { duration: number; name?: string } | null
  ) => void;
  /** Callback when selection state changes */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** Shot management for external generation viewing */
  allShots?: any[];
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (shotId: string, generationId: string, position: number) => Promise<void>;
  onAddToShotWithoutPosition?: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (name: string) => Promise<string>;
  /** Callback to notify parent of drag state changes - used to suppress query refetches during drag */
  onDragStateChange?: (isDragging: boolean) => void;
  /** Callback when single-image duration changes (for single-image video generation) */
  onSingleImageDurationChange?: (durationFrames: number) => void;
  /** Maximum frame limit for timeline gaps (77 when smoothContinuations enabled, 81 otherwise) */
  maxFrameLimit?: number;
  /** Whether smooth continuations is enabled - used to compact timeline gaps when toggled */
  smoothContinuations?: boolean;
  /** Shared selected output parent ID (for syncing FinalVideoSection with SegmentOutputStrip) */
  selectedOutputId?: string | null;
  /** Callback when selected output changes */
  onSelectedOutputChange?: (id: string | null) => void;
}

// Force TypeScript to re-evaluate this interface

const ShotImagesEditor: React.FC<ShotImagesEditorProps> = ({
  isModeReady,
  settingsError,
  isMobile,
  generationMode,
  onGenerationModeChange,
  selectedShotId,
  preloadedImages,
  readOnly = false,
  projectId,
  shotName,
  batchVideoFrames,
  onImageReorder,
  onFramePositionsChange,
  onImageDrop,
  onGenerationDrop,
  onBatchFileDrop,
  onBatchGenerationDrop,
  pendingPositions,
  onPendingPositionApplied,
  onImageDelete,
  onBatchImageDelete,
  onImageDuplicate,
  columns,
  skeleton,
  unpositionedGenerationsCount,
  onOpenUnpositionedPane,
  fileInputKey,
  onImageUpload,
  isUploadingImage,
  uploadProgress = 0,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  defaultPrompt = "",
  onDefaultPromptChange,
  defaultNegativePrompt = "",
  onDefaultNegativePromptChange,
  // Structure video props (legacy single-video)
  structureVideoPath: propStructureVideoPath,
  structureVideoMetadata: propStructureVideoMetadata,
  structureVideoTreatment: propStructureVideoTreatment = 'adjust',
  structureVideoMotionStrength: propStructureVideoMotionStrength = 1.0,
  structureVideoType: propStructureVideoType = 'flow',
  uni3cEndPercent: propUni3cEndPercent = 0.1,
  onStructureVideoChange: propOnStructureVideoChange,
  onUni3cEndPercentChange: propOnUni3cEndPercentChange,
  // NEW: Multi-video array props
  structureVideos: propStructureVideos,
  onAddStructureVideo: propOnAddStructureVideo,
  onUpdateStructureVideo: propOnUpdateStructureVideo,
  onRemoveStructureVideo: propOnRemoveStructureVideo,
  onSetStructureVideos: propOnSetStructureVideos,
  // Audio strip props
  audioUrl: propAudioUrl,
  audioMetadata: propAudioMetadata,
  onAudioChange: propOnAudioChange,
  onSelectionChange,
  // Shot management for external generation viewing
  allShots,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  onCreateShot,
  onDragStateChange,
  onSingleImageDurationChange,
  maxFrameLimit = 81,
  smoothContinuations = false,
  selectedOutputId,
  onSelectedOutputChange,
}) => {
  // Convert aspect ratio (e.g. "4:3") to concrete resolution string (e.g. "768x576").
  // IMPORTANT: Segment regeneration expects WxH; passing the aspect ratio string would
  // incorrectly store parsed_resolution_wh as "4:3".
  const resolvedProjectResolution = projectAspectRatio
    ? ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio]
    : undefined;

  // Track local drag state to suppress hook reloads during drag operations
  // This is forwarded via onDragStateChange but we also need it locally for useEnhancedShotPositions
  const [isDragInProgress, setIsDragInProgress] = useState(false);

  // Single image endpoint state - stores the end frame for single-image duration control
  // Initialized to batchVideoFrames when there's 1 image
  const [singleImageEndFrame, setSingleImageEndFrame] = useState<number | undefined>(undefined);

  // Handle single image end frame changes - notify parent which updates batchVideoFrames
  const handleSingleImageEndFrameChange = useCallback((endFrame: number) => {
    setSingleImageEndFrame(endFrame);
    // The endFrame represents frames from 0 (where the single image typically sits)
    // So endFrame IS the duration in frames
    if (onSingleImageDurationChange) {
      onSingleImageDurationChange(endFrame);
    }
  }, [onSingleImageDurationChange]);

  // Initialize single image endpoint when switching to single-image mode
  // Use batchVideoFrames as the default duration
  useEffect(() => {
    // This runs when image count or batchVideoFrames changes
    // We only want to initialize if singleImageEndFrame is currently undefined
    if (singleImageEndFrame === undefined) {
      // Initialize with batchVideoFrames (image is typically at frame 0)
      setSingleImageEndFrame(batchVideoFrames);
    }
  }, [batchVideoFrames]); // Only re-run when batchVideoFrames changes, not when singleImageEndFrame does

  // Wrapper to track drag state locally AND forward to parent
  const handleDragStateChange = useCallback((isDragging: boolean) => {
    setIsDragInProgress(isDragging);
    onDragStateChange?.(isDragging);
  }, [onDragStateChange]);
  // [ZoomDebug] Track ShotImagesEditor mounts to detect unwanted remounts
  const shotImagesEditorMountRef = React.useRef(0);
  React.useEffect(() => {
    shotImagesEditorMountRef.current++;
    console.log('[ZoomDebug] 🟡 ShotImagesEditor MOUNTED:', {
      mountCount: shotImagesEditorMountRef.current,
      selectedShotId: selectedShotId?.substring(0, 8),
      isModeReady,
      preloadedImagesCount: preloadedImages?.length || 0,
      timestamp: Date.now()
    });
    return () => {
      console.log('[ZoomDebug] 🟡 ShotImagesEditor UNMOUNTING:', {
        mountCount: shotImagesEditorMountRef.current,
        selectedShotId: selectedShotId?.substring(0, 8),
        timestamp: Date.now()
      });
    };
  }, []);

  // [RenderProfile] DETAILED PROFILING: Track what props are changing to cause re-renders
  const renderCount = React.useRef(0);
  renderCount.current += 1;
  
  // Track all props that could cause re-renders
  const prevPropsRef = React.useRef<{
    selectedShotId?: string;
    preloadedImagesLength: number;
    isModeReady: boolean;
    generationMode: string;
    readOnly: boolean;
    batchVideoFrames?: number;
    pendingPositionsSize: number;
    columns: number;
    unpositionedGenerationsCount: number;
    fileInputKey: number;
    isUploadingImage: boolean;
    uploadProgress: number;
    duplicatingImageId?: string | null;
    duplicateSuccessImageId?: string | null;
    defaultPrompt: string;
    defaultNegativePrompt: string;
    structureVideoPath?: string | null;
    structureVideoTreatment: string;
    structureVideoMotionStrength: number;
    structureVideoType: string;
    allShotsLength: number;
  }>({
    selectedShotId: undefined,
    preloadedImagesLength: 0,
    isModeReady: false,
    generationMode: '',
    readOnly: false,
    pendingPositionsSize: 0,
    columns: 2,
    unpositionedGenerationsCount: 0,
    fileInputKey: 0,
    isUploadingImage: false,
    uploadProgress: 0,
    duplicatingImageId: null,
    duplicateSuccessImageId: null,
    defaultPrompt: '',
    defaultNegativePrompt: '',
    structureVideoPath: null,
    structureVideoTreatment: 'adjust',
    structureVideoMotionStrength: 1.0,
    structureVideoType: 'flow',
    allShotsLength: 0,
  });
  
  React.useEffect(() => {
    const currentProps = {
      selectedShotId,
      preloadedImagesLength: preloadedImages?.length || 0,
      isModeReady,
      generationMode,
      readOnly,
      batchVideoFrames,
      pendingPositionsSize: pendingPositions.size,
      columns,
      unpositionedGenerationsCount,
      fileInputKey,
      isUploadingImage,
      uploadProgress,
      duplicatingImageId,
      duplicateSuccessImageId,
      defaultPrompt,
      defaultNegativePrompt,
      structureVideoPath: propStructureVideoPath,
      structureVideoTreatment: propStructureVideoTreatment,
      structureVideoMotionStrength: propStructureVideoMotionStrength,
      structureVideoType: propStructureVideoType,
      allShotsLength: allShots?.length || 0,
    };
    
    const prev = prevPropsRef.current;
    const changedProps: string[] = [];
    
    (Object.keys(currentProps) as Array<keyof typeof currentProps>).forEach(key => {
      if (prev[key] !== currentProps[key]) {
        changedProps.push(`${key}: ${JSON.stringify(prev[key])} → ${JSON.stringify(currentProps[key])}`);
      }
    });
    
    if (changedProps.length > 0) {
      console.log(`[RenderProfile] 📸 ShotImagesEditor RENDER #${renderCount.current} - Props changed:`, {
        changedProps,
        timestamp: Date.now()
      });
    } else if (renderCount.current > 1) {
      // Re-render with NO prop changes - this is the problem!
      console.warn(`[RenderProfile] ⚠️ ShotImagesEditor RENDER #${renderCount.current} - NO PROPS CHANGED (parent re-render)`, {
        timestamp: Date.now()
      });
    }
    
    prevPropsRef.current = currentProps;
  });
  
  // [RenderProfile] Track callback prop changes (these are often unstable)
  const prevCallbacksRef = React.useRef<{
    onGenerationModeChange?: any;
    onImageReorder?: any;
    onFramePositionsChange?: any;
    onImageDrop?: any;
    onGenerationDrop?: any;
    onBatchFileDrop?: any;
    onBatchGenerationDrop?: any;
    onPendingPositionApplied?: any;
    onImageDelete?: any;
    onBatchImageDelete?: any;
    onImageDuplicate?: any;
    onOpenUnpositionedPane?: any;
    onImageUpload?: any;
    onDefaultPromptChange?: any;
    onDefaultNegativePromptChange?: any;
    propOnStructureVideoChange?: any;
    onSelectionChange?: any;
    onShotChange?: any;
    onAddToShot?: any;
    onAddToShotWithoutPosition?: any;
    onCreateShot?: any;
  }>({});
  
  React.useEffect(() => {
    const callbacks = {
      onGenerationModeChange,
      onImageReorder,
      onFramePositionsChange,
      onImageDrop,
      onGenerationDrop,
      onBatchFileDrop,
      onBatchGenerationDrop,
      onPendingPositionApplied,
      onImageDelete,
      onBatchImageDelete,
      onImageDuplicate,
      onOpenUnpositionedPane,
      onImageUpload,
      onDefaultPromptChange,
      onDefaultNegativePromptChange,
      propOnStructureVideoChange,
      onSelectionChange,
      onShotChange,
      onAddToShot,
      onAddToShotWithoutPosition,
      onCreateShot,
    };
    
    const prev = prevCallbacksRef.current;
    const changedCallbacks: string[] = [];
    
    (Object.keys(callbacks) as Array<keyof typeof callbacks>).forEach(key => {
      if (prev[key] !== callbacks[key]) {
        changedCallbacks.push(key);
      }
    });
    
    if (changedCallbacks.length > 0) {
      console.warn(`[RenderProfile] 🔄 ShotImagesEditor RENDER #${renderCount.current} - Callback props changed (UNSTABLE): [${changedCallbacks.join(', ')}]`, {
        count: changedCallbacks.length,
        hint: 'Parent should wrap these in useCallback',
        timestamp: Date.now()
      });
    }
    
    prevCallbacksRef.current = callbacks;
  });
  
  // Force mobile to use batch mode regardless of desktop setting
  const effectiveGenerationMode = isMobile ? 'batch' : generationMode;
  
  // State for download functionality
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  
  // State for segment preview dialog
  const [isPreviewTogetherOpen, setIsPreviewTogetherOpen] = useState(false);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const previewThumbnailsRef = useRef<HTMLDivElement>(null);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(true);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [isPreviewVideoLoading, setIsPreviewVideoLoading] = useState(true);
  
  // Audio sync state for preview
  const [segmentDurations, setSegmentDurations] = useState<number[]>([]);
  const [segmentOffsets, setSegmentOffsets] = useState<number[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isLoadingDurations, setIsLoadingDurations] = useState(false);
  
  // Fetch segment outputs for preview
  // Uses controlled state if provided so batch mode respects FinalVideoSection selection
  const {
    segmentSlots,
    selectedParentId,
    selectedParent,
    isLoading: segmentsLoading,
  } = useSegmentOutputsForShot(
    selectedShotId,
    projectId || '',
    undefined, // localShotGenPositions not needed here
    selectedOutputId,
    onSelectedOutputChange
  );

  // [BatchModeSelection] Debug: trace controlled state flow
  console.log('[BatchModeSelection] ShotImagesEditor hook inputs/outputs:', {
    // Inputs (controlled state from parent)
    controlledSelectedOutputId: selectedOutputId?.substring(0, 8) || 'NONE',
    hasOnSelectedOutputChange: !!onSelectedOutputChange,
    // Outputs from hook
    hookSelectedParentId: selectedParentId?.substring(0, 8) || 'NONE',
    segmentSlotsCount: segmentSlots.length,
    segmentSlotIds: segmentSlots.slice(0, 3).map(s => s.type === 'child' ? s.child.id.substring(0, 8) : 'placeholder'),
    // Context
    generationMode,
    selectedShotId: selectedShotId?.substring(0, 8),
  });

  // Get optimistic pending handler for immediate UI feedback when generate is clicked
  const { addOptimisticPending } = usePendingSegmentTasks(selectedShotId, projectId || null);

  // [PairModalDebug] Log segment output state
  console.log('[PairModalDebug] ShotImagesEditor segment outputs:', {
    selectedShotId: selectedShotId?.substring(0, 8),
    selectedParentId: selectedParentId?.substring(0, 8) || null,
    hasSelectedParent: !!selectedParent,
    segmentSlotsCount: segmentSlots.length,
  });
  
  // Log segment slots details for preview debugging
  console.log('[PreviewCrossfade] segmentSlots from hook:', {
    count: segmentSlots.length,
    slots: segmentSlots.map(slot => ({
      type: slot.type,
      index: slot.index,
      hasLocation: slot.type === 'child' ? !!slot.child?.location : false,
    })),
  });
  
  // State for crossfade animation (moved here, actual memo is after shotGenerations is defined)
  const [crossfadeProgress, setCrossfadeProgress] = useState(0);
  const crossfadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dual video element approach for seamless cuts between videos
  // One video plays while the other preloads the next segment
  const previewVideoRefB = useRef<HTMLVideoElement>(null);
  const [activeVideoSlot, setActiveVideoSlot] = useState<'A' | 'B'>('A');
  const [preloadedIndex, setPreloadedIndex] = useState<number | null>(null);
  // Track which index we're currently preloading (set immediately on load, cleared when canplaythrough fires)
  const preloadingIndexRef = useRef<number | null>(null);

  // Auto-start playback state when dialog opens OR when segment changes (for both video and image segments)
  React.useEffect(() => {
    if (isPreviewTogetherOpen) {
      // Start playing immediately - this triggers on dialog open AND segment change
      setPreviewIsPlaying(true);
      console.log('[PreviewCrossfade] Auto-starting playback for segment:', currentPreviewIndex);
    }
  }, [isPreviewTogetherOpen, currentPreviewIndex]);
  
  // Reset preview state when dialog closes
  React.useEffect(() => {
    if (!isPreviewTogetherOpen) {
      setCurrentPreviewIndex(0);
      setPreviewCurrentTime(0);
      setPreviewDuration(0);
      setPreviewIsPlaying(false); // Reset to false when closed
      setIsPreviewVideoLoading(true); // Reset for next open
      // Reset audio state
      setSegmentDurations([]);
      setSegmentOffsets([]);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
      // Reset crossfade state
      setCrossfadeProgress(0);
      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
      // Reset dual-video state
      setActiveVideoSlot('A');
      setPreloadedIndex(null);
      preloadingIndexRef.current = null;
    }
  }, [isPreviewTogetherOpen]);
  
  // Note: Preview-related effects are defined after previewableSegments memo (see below)
  
  // Note: Pair prompts are retrieved from the enhanced shot positions hook below
  
  // Segment slot lightbox state - opens MediaLightbox in segment slot mode
  // When pairIndex is set, MediaLightbox opens showing form (no video) or video+form (has video)
  const [segmentSlotLightboxIndex, setSegmentSlotLightboxIndex] = useState<number | null>(null);

  // Pending image to open in lightbox - used for navigation from segment back to constituent image
  // When set, child components (ShotImageManagerDesktop/Timeline) will open the lightbox for this image
  const [pendingImageToOpen, setPendingImageToOpen] = useState<string | null>(null);

  // Track lightbox transitions to keep overlay visible during navigation between image/segment lightboxes
  const [isLightboxTransitioning, setIsLightboxTransitioning] = useState(false);

  // Clear transition state when segment slot lightbox opens
  // (Image lightbox clearing is handled in Timeline/ShotImageManager via their useEffect)
  useEffect(() => {
    if (segmentSlotLightboxIndex !== null && isLightboxTransitioning) {
      // Small delay to ensure the new lightbox has rendered
      const timer = setTimeout(() => {
        setIsLightboxTransitioning(false);
        document.body.classList.remove('lightbox-transitioning');
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [segmentSlotLightboxIndex, isLightboxTransitioning]);

  // Safety cleanup: always remove the class when transition state is cleared
  // This prevents the class from getting stuck if something goes wrong
  useEffect(() => {
    if (!isLightboxTransitioning) {
      document.body.classList.remove('lightbox-transitioning');
    }
  }, [isLightboxTransitioning]);

  // Safety timeout: remove the class after 500ms max to prevent it getting stuck
  useEffect(() => {
    if (isLightboxTransitioning) {
      const safetyTimer = setTimeout(() => {
        setIsLightboxTransitioning(false);
        document.body.classList.remove('lightbox-transitioning');
      }, 500);
      return () => clearTimeout(safetyTimer);
    }
  }, [isLightboxTransitioning]);

  // Safety: ensure body scroll is restored after lightbox transition ends
  // This fixes a race condition where two MediaLightbox instances' scroll lock effects interfere
  useEffect(() => {
    if (!isLightboxTransitioning && segmentSlotLightboxIndex === null) {
      // No lightbox is transitioning and segment lightbox is closed
      // If there's still overflow:hidden on body, it might be stuck - restore it
      // (Only do this after a brief delay to let any opening lightbox set its own lock)
      const timer = setTimeout(() => {
        // Only restore if no lightbox should be open
        // The image lightbox state is managed by Timeline/ShotImageManager, we can't check it here
        // But if segmentSlotLightboxIndex is null and we just finished transitioning,
        // we should be safe to check if overflow needs restoring
        if (document.body.style.overflow === 'hidden' && !document.querySelector('[data-radix-dialog-overlay]')) {
          console.log('[ScrollFix] Restoring body scroll - no dialog overlay found');
          document.body.style.overflow = '';
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLightboxTransitioning, segmentSlotLightboxIndex]);

  // Enhanced position management
  // Centralized position management - shared between Timeline and ShotImageManager
  // When preloadedImages is provided, use new utility hook; otherwise use legacy hook
  // CRITICAL: Pass isDragInProgress to suppress realtime/query reloads during drag operations
  const legacyHookData = useEnhancedShotPositions(preloadedImages ? null : selectedShotId, isDragInProgress);
  
  // NEW: Use utility hook when preloaded images are provided
  // CRITICAL: Pass the same generations array that we use for display
  // Otherwise clearEnhancedPrompt will look in a different/empty array
  const utilsData = useTimelinePositionUtils({
    shotId: preloadedImages ? selectedShotId : null,
    generations: preloadedImages || legacyHookData.shotGenerations,  // Use legacyHookData as fallback
    projectId: projectId, // Pass projectId to invalidate ShotsPane cache
  });
  
  // Choose data source based on whether we have preloaded images
  const hookData: typeof legacyHookData = preloadedImages ? {
    // Use utility hook data when preloaded
    shotGenerations: utilsData.shotGenerations,
    pairPrompts: utilsData.pairPrompts,
    isLoading: utilsData.isLoading,
    error: utilsData.error ? utilsData.error.message : '',
    updateTimelineFrame: utilsData.updateTimelineFrame,
    batchExchangePositions: utilsData.batchExchangePositions,
    loadPositions: utilsData.loadPositions,
    updatePairPrompts: utilsData.updatePairPrompts,
    clearEnhancedPrompt: utilsData.clearEnhancedPrompt,
    initializeTimelineFrames: utilsData.initializeTimelineFrames,
    // Provide filtering function for mode-specific views
    getImagesForMode: (mode: 'batch' | 'timeline') => {
      // BOTH modes show only positioned non-video images
      // Uses canonical filters from typeGuards
      const positioned = preloadedImages
        .filter(img => isPositioned(img) && !isVideoGeneration(img))
        .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
      console.log('[TimelinePositionUtils] getImagesForMode:', {
        mode,
        total: preloadedImages.length,
        positioned: positioned.length,
        filtered: preloadedImages.length - positioned.length,
      });
      return positioned;
    },
    exchangePositions: async () => {},
    exchangePositionsNoReload: async () => {},
    deleteItem: async () => {},
    updatePairPromptsByIndex: async () => {},
    clearAllEnhancedPrompts: async () => {},
    isPersistingPositions: false,
    setIsPersistingPositions: () => {},
    getPositionsForMode: () => new Map(),
    addItem: async () => {},
    applyTimelineFrames: async () => {},
    getPairPrompts: () => utilsData.pairPrompts,
  } as any : legacyHookData;
  
  const {
    getImagesForMode,
    isLoading: positionsLoading,
    shotGenerations: dbShotGenerations,
    updateTimelineFrame,
    exchangePositions,
    exchangePositionsNoReload,
    batchExchangePositions,
    deleteItem,
    loadPositions,
    pairPrompts, // Use reactive pairPrompts value directly
    updatePairPrompts, // Direct update by shot_generation.id
    updatePairPromptsByIndex,
    clearEnhancedPrompt,
    clearAllEnhancedPrompts
  } = hookData;
  
  // Use preloaded images if provided, otherwise use database images
  const shotGenerations = preloadedImages || dbShotGenerations;
  
  // Log data source for debugging
  console.log('[UnifiedDataFlow] ShotImagesEditor data source:', {
    selectedShotId: selectedShotId.substring(0, 8),
    usingPreloadedImages: !!preloadedImages,
    dataSource: preloadedImages ? 'two-phase (from ShotEditor)' : 'legacy (useEnhancedShotPositions)',
    imageCount: shotGenerations.length,
    withMetadata: shotGenerations.filter((img: any) => img.metadata).length,
    withId: shotGenerations.filter((img: any) => img.id).length, // id is shot_generations.id
    positioned: shotGenerations.filter((img: any) => img.timeline_frame != null && img.timeline_frame !== -1).length,
    unpositioned: shotGenerations.filter((img: any) => img.timeline_frame == null || img.timeline_frame === -1).length,
    hookDataShotGensCount: hookData.shotGenerations.length,
  });

  // Compute pair data for segment slot lightbox (shared source of truth with TimelineContainer)
  // IMPORTANT: In batch mode, use per-pair pair_num_frames; in timeline mode, use actual timeline_frame differences
  const pairDataByIndex = React.useMemo(() => {
    const dataMap = new Map<number, PairData>();
    const sortedImages = [...(shotGenerations || [])]
      .filter((img: any) => img.timeline_frame != null && img.timeline_frame >= 0 && !isVideoAny(img))
      .sort((a: any, b: any) => a.timeline_frame - b.timeline_frame);

    for (let pairIndex = 0; pairIndex < sortedImages.length - 1; pairIndex++) {
      const startImage = sortedImages[pairIndex];
      const endImage = sortedImages[pairIndex + 1];

      // In batch mode: use metadata pair_num_frames > uniform batchVideoFrames
      // In timeline mode: use actual timeline_frame differences
      const isBatchMode = effectiveGenerationMode === 'batch';
      const startImageOverrides = readSegmentOverrides(startImage.metadata as Record<string, any> | null);
      const pairNumFramesFromMetadata = startImageOverrides.numFrames;
      const frames = isBatchMode
        ? (pairNumFramesFromMetadata ?? batchVideoFrames)
        : (endImage.timeline_frame ?? 0) - (startImage.timeline_frame ?? 0);
      const startFrame = isBatchMode
        ? pairIndex * batchVideoFrames
        : (startImage.timeline_frame ?? 0);
      const endFrame = isBatchMode
        ? (pairIndex + 1) * batchVideoFrames
        : (endImage.timeline_frame ?? 0);

      const pairDataEntry = {
        index: pairIndex,
        frames,
        startFrame,
        endFrame,
        startImage: {
          id: startImage.id,
          generationId: startImage.generation_id,
          url: startImage.imageUrl || startImage.location,
          thumbUrl: startImage.thumbUrl || startImage.location,
          position: pairIndex + 1,
        },
        endImage: {
          id: endImage.id,
          generationId: endImage.generation_id,
          url: endImage.imageUrl || endImage.location,
          thumbUrl: endImage.thumbUrl || endImage.location,
          position: pairIndex + 2,
        },
      };
      // Debug: log if startImage.id is missing
      if (!pairDataEntry.startImage.id) {
        console.error('[SegmentIdDebug] ⚠️ Missing startImage.id in pairDataByIndex!', {
          pairIndex,
          rawStartImageId: startImage.id,
          rawStartImageKeys: Object.keys(startImage),
          rawStartImage: JSON.stringify(startImage).substring(0, 200),
        });
      }
      dataMap.set(pairIndex, pairDataEntry);
    }
    return dataMap;
  }, [shotGenerations, effectiveGenerationMode, batchVideoFrames]);

  // Debounce ref for frame count changes (declared before segmentSlotModeData memo that uses it)
  const frameCountDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Build SegmentSlotModeData for MediaLightbox when a segment slot is open
  const segmentSlotModeData: SegmentSlotModeData | null = useMemo(() => {
    if (segmentSlotLightboxIndex === null) return null;

    const pairData = pairDataByIndex.get(segmentSlotLightboxIndex);
    if (!pairData) {
      console.log('[SegmentClickDebug] No pairData for segmentSlotLightboxIndex:', segmentSlotLightboxIndex);
      return null;
    }

    // Find the segment slot for this pair (if video exists)
    const pairSlot = segmentSlots.find(slot => slot.index === segmentSlotLightboxIndex);
    const segmentVideo = pairSlot?.type === 'child' ? pairSlot.child : null;

    console.log('[SegmentClickDebug] Building segmentSlotModeData:', {
      segmentSlotLightboxIndex,
      pairDataIndex: pairData.index,
      segmentSlotsCount: segmentSlots.length,
      segmentSlotIndices: segmentSlots.map(s => s.index),
      foundPairSlot: !!pairSlot,
      pairSlotType: pairSlot?.type,
      pairSlotIndex: pairSlot?.index,
      segmentVideoId: segmentVideo?.id?.substring(0, 8),
      segmentVideoLocation: segmentVideo?.location?.substring(0, 50),
      segmentVideoType: segmentVideo?.type,
      // Check if this might be a parent generation
      segmentVideoParentId: (segmentVideo as any)?.parent_generation_id?.substring(0, 8),
    });

    // Get structure video info for this segment
    const pairStartFrame = pairData.startFrame ?? 0;
    const pairEndFrame = pairData.endFrame ?? 0;

    // Find covering structure video (if any)
    const coveringVideo = (propStructureVideos || []).find(video => {
      const videoStart = video.start_frame ?? 0;
      const videoEnd = video.end_frame ?? Infinity;
      return pairEndFrame > videoStart && pairStartFrame < videoEnd;
    }) ?? (effectiveGenerationMode === 'batch' && propStructureVideos?.[0]);

    // Get prompts from metadata
    const shotGen = shotGenerations.find(sg => sg.id === pairData.startImage?.id);
    const overrides = readSegmentOverrides(shotGen?.metadata as Record<string, any> | null);

    // Debug: log what we're passing to MediaLightbox
    console.log('[SegmentIdDebug] Building segmentSlotModeData:', {
      segmentSlotLightboxIndex,
      pairDataStartImageId: pairData.startImage?.id?.substring(0, 8) || '(none)',
      pairDataEndImageId: pairData.endImage?.id?.substring(0, 8) || '(none)',
      hasStartImage: !!pairData.startImage,
      startImageKeys: pairData.startImage ? Object.keys(pairData.startImage) : [],
    });

    return {
      currentIndex: segmentSlotLightboxIndex,
      totalPairs: pairDataByIndex.size,
      pairData: {
        index: pairData.index,
        frames: pairData.frames,
        startFrame: pairData.startFrame,
        endFrame: pairData.endFrame,
        startImage: pairData.startImage,
        endImage: pairData.endImage,
      },
      segmentVideo,
      activeChildGenerationId: pairSlot?.type === 'child' ? pairSlot.child.id : undefined,
      onNavigateToPair: (index: number) => {
        console.log('[SegmentSlotNav] onNavigateToPair called:', {
          targetIndex: index,
          hasPairData: pairDataByIndex.has(index),
          pairDataSize: pairDataByIndex.size,
          pairDataIndices: [...pairDataByIndex.keys()],
          segmentSlotsCount: segmentSlots.length,
          segmentSlotIndices: segmentSlots.map(s => s.index),
        });
        if (pairDataByIndex.has(index)) {
          console.log('[SegmentSlotNav] Setting segmentSlotLightboxIndex to:', index);
          setSegmentSlotLightboxIndex(index);
        } else {
          console.log('[SegmentSlotNav] ❌ pairDataByIndex does NOT have index:', index);
        }
      },
      projectId: projectId || null,
      shotId: selectedShotId,
      parentGenerationId: selectedParentId || undefined,
      pairPrompt: overrides.prompt || '',
      pairNegativePrompt: overrides.negativePrompt || '',
      defaultPrompt,
      defaultNegativePrompt,
      enhancedPrompt: shotGen?.metadata?.enhanced_prompt || '',
      projectResolution: resolvedProjectResolution,
      structureVideoType: coveringVideo?.structure_type ?? null,
      structureVideoDefaults: coveringVideo ? {
        motionStrength: coveringVideo.motion_strength ?? 1.2,
        treatment: coveringVideo.treatment ?? 'adjust',
        uni3cEndPercent: coveringVideo.uni3c_end_percent ?? 0.1,
      } : undefined,
      structureVideoUrl: coveringVideo?.path,
      // Always provide frame range in Timeline Mode so uploads work even when no video exists yet
      // For preview, we need video metadata; for uploads, we just need segment frame range
      structureVideoFrameRange: (effectiveGenerationMode === 'timeline' || coveringVideo) ? {
        segmentStart: pairStartFrame,
        segmentEnd: pairEndFrame,
        videoTotalFrames: coveringVideo?.metadata?.total_frames ?? 60,
        videoFps: coveringVideo?.metadata?.frame_rate ?? 24,
      } : undefined,
      onFrameCountChange: (pairShotGenerationId: string, frameCount: number) => {
        // In batch mode, don't update timeline
        if (effectiveGenerationMode === 'batch') return;

        // Debounce and call the unified handler
        if (frameCountDebounceRef.current) {
          clearTimeout(frameCountDebounceRef.current);
        }
        frameCountDebounceRef.current = setTimeout(() => {
          updatePairFrameCount(pairShotGenerationId, frameCount);
        }, 150);
      },
      onGenerateStarted: (pairShotGenerationId) => {
        addOptimisticPending(pairShotGenerationId);
      },

      // Per-segment structure video management (Timeline Mode only)
      isTimelineMode: effectiveGenerationMode === 'timeline',
      existingStructureVideos: propStructureVideos ?? [],
      onAddSegmentStructureVideo: (video) => {
        // Timeline mode only - add structure video for this segment
        if (effectiveGenerationMode !== 'timeline') return;

        // If we have setStructureVideos, use it for proper overlap resolution
        if (propOnSetStructureVideos) {
          const newStart = video.start_frame ?? 0;
          const newEnd = video.end_frame ?? Infinity;

          console.log('[SegmentStructureVideo] Adding video with overlap resolution:', {
            newRange: `${newStart}-${newEnd}`,
            existingVideos: (propStructureVideos || []).map(v => `${v.start_frame ?? 0}-${v.end_frame ?? '∞'}`),
          });

          // Resolve overlaps: use flatMap to handle splitting
          const updatedVideos = (propStructureVideos || []).flatMap((existing) => {
            const existingStart = existing.start_frame ?? 0;
            const existingEnd = existing.end_frame ?? Infinity;

            // No overlap - keep as is
            if (newEnd <= existingStart || newStart >= existingEnd) {
              return [existing];
            }

            // Existing is completely within new range - remove entirely
            if (existingStart >= newStart && existingEnd <= newEnd) {
              console.log('[SegmentStructureVideo] Removing video completely covered:', {
                existingRange: `${existingStart}-${existingEnd}`,
              });
              return [];
            }

            // Existing spans across new video - SPLIT into two parts
            if (existingStart < newStart && existingEnd > newEnd) {
              console.log('[SegmentStructureVideo] Splitting video around new segment:', {
                existingRange: `${existingStart}-${existingEnd}`,
                beforePart: `${existingStart}-${newStart}`,
                afterPart: `${newEnd}-${existingEnd}`,
              });
              return [
                { ...existing, end_frame: newStart },      // Part before
                { ...existing, start_frame: newEnd },     // Part after
              ];
            }

            // Existing starts before new, ends within new - trim end
            if (existingStart < newStart) {
              console.log('[SegmentStructureVideo] Trimming video end:', {
                existingRange: `${existingStart}-${existingEnd}`,
                newEnd: newStart,
              });
              return [{ ...existing, end_frame: newStart }];
            }

            // Existing starts within new, ends after new - trim start
            if (existingEnd > newEnd) {
              console.log('[SegmentStructureVideo] Trimming video start:', {
                existingRange: `${existingStart}-${existingEnd}`,
                newStart: newEnd,
              });
              return [{ ...existing, start_frame: newEnd }];
            }

            // Shouldn't reach here, but keep as is
            return [existing];
          });

          // Filter out any videos that ended up with zero or negative length
          const validVideos = updatedVideos.filter(v => {
            const start = v.start_frame ?? 0;
            const end = v.end_frame ?? Infinity;
            if (end <= start) {
              console.log('[SegmentStructureVideo] Removing zero-length video:', {
                range: `${start}-${end}`,
              });
              return false;
            }
            return true;
          });

          // Add the new video and set the entire array
          console.log('[SegmentStructureVideo] Final video array:', {
            newVideo: `${video.start_frame}-${video.end_frame}`,
            existingAfterTrim: validVideos.map(v => `${v.start_frame ?? 0}-${v.end_frame ?? '∞'}`),
            removedCount: updatedVideos.length - validVideos.length,
          });
          propOnSetStructureVideos([...validVideos, video]);
        } else if (propOnAddStructureVideo) {
          // Fallback: just add without overlap handling
          propOnAddStructureVideo(video);
        }
      },
      onUpdateSegmentStructureVideo: (updates) => {
        // Find the index of the covering video and update it
        if (!propOnUpdateStructureVideo || !coveringVideo || !propStructureVideos) return;

        const index = propStructureVideos.findIndex(v => v.path === coveringVideo.path);
        if (index >= 0) {
          propOnUpdateStructureVideo(index, updates);
        }
      },
      onRemoveSegmentStructureVideo: () => {
        // Find the index of the covering video and remove it
        if (!propOnRemoveStructureVideo || !coveringVideo || !propStructureVideos) return;

        const index = propStructureVideos.findIndex(v => v.path === coveringVideo.path);
        if (index >= 0) {
          propOnRemoveStructureVideo(index);
        }
      },

      // Navigate to constituent image - closes segment slot and opens image lightbox
      onNavigateToImage: (shotGenerationId: string) => {
        console.log('[ConstituentImageNav] Navigate to image:', shotGenerationId?.substring(0, 8));
        // Synchronously add class - CSS will show overlay and disable animations
        document.body.classList.add('lightbox-transitioning');
        setIsLightboxTransitioning(true);
        // Close the segment slot lightbox and request image lightbox to open
        setSegmentSlotLightboxIndex(null);
        setPendingImageToOpen(shotGenerationId);
      },
    };
  }, [
    segmentSlotLightboxIndex,
    pairDataByIndex,
    segmentSlots,
    propStructureVideos,
    effectiveGenerationMode,
    shotGenerations,
    projectId,
    selectedShotId,
    selectedParentId,
    defaultPrompt,
    defaultNegativePrompt,
    resolvedProjectResolution,
    addOptimisticPending,
    propOnAddStructureVideo,
    propOnUpdateStructureVideo,
    propOnRemoveStructureVideo,
    propOnSetStructureVideos,
  ]);

  // Unified frame count update handler - called from MediaLightbox segment slot mode
  // Timeline positions are the source of truth - no metadata sync needed
  // Handles constraints: if increasing would exceed maxFrameLimit, compresses subsequent pairs proportionally
  const updatePairFrameCount = useCallback(async (pairShotGenerationId: string, newFrameCount: number) => {
    console.log('[FrameCountUpdate] Frame count change requested:', {
      pairShotGenerationId: pairShotGenerationId?.substring(0, 8),
      newFrameCount,
      maxFrameLimit,
    });

    if (!shotGenerations?.length || effectiveGenerationMode !== 'timeline') {
      console.log('[FrameCountUpdate] ❌ Skipped: no generations or not in timeline mode');
      return;
    }

    // Find the pair by startImage.id (pairShotGenerationId)
    const sortedImages = [...shotGenerations]
      .filter((img: any) => img.timeline_frame != null && img.timeline_frame >= 0)
      .sort((a: any, b: any) => a.timeline_frame - b.timeline_frame);

    const pairIndex = sortedImages.findIndex((img: any) => img.id === pairShotGenerationId);
    if (pairIndex === -1 || pairIndex >= sortedImages.length - 1) {
      console.log('[FrameCountUpdate] ❌ Pair not found:', pairShotGenerationId?.substring(0, 8));
      return;
    }

    const startImage = sortedImages[pairIndex];
    const endImage = sortedImages[pairIndex + 1];
    const currentFrameCount = (endImage.timeline_frame ?? 0) - (startImage.timeline_frame ?? 0);

    // Check if requested frame count exceeds maxFrameLimit
    const exceedsMax = newFrameCount > maxFrameLimit;
    const effectiveNewFrameCount = Math.min(newFrameCount, maxFrameLimit);

    // Collect original frame counts for subsequent pairs
    const subsequentPairs: Array<{ startIdx: number; endIdx: number; originalFrames: number }> = [];
    for (let j = pairIndex + 1; j < sortedImages.length - 1; j++) {
      const pairStart = sortedImages[j];
      const pairEnd = sortedImages[j + 1];
      subsequentPairs.push({
        startIdx: j,
        endIdx: j + 1,
        originalFrames: (pairEnd.timeline_frame ?? 0) - (pairStart.timeline_frame ?? 0),
      });
    }

    // If exceeds max and there are subsequent pairs, borrow from them proportionally
    const overflow = exceedsMax ? newFrameCount - maxFrameLimit : 0;
    const needsCompression = overflow > 0 && subsequentPairs.length > 0;
    const totalSubsequentFrames = subsequentPairs.reduce((sum, p) => sum + p.originalFrames, 0);

    // Calculate how much we can actually borrow (can't compress below 1 frame per pair)
    const minTotalSubsequent = subsequentPairs.length; // 1 frame minimum per pair
    const maxBorrowable = Math.max(0, totalSubsequentFrames - minTotalSubsequent);
    const actualBorrow = Math.min(overflow, maxBorrowable);
    const finalFrameCount = effectiveNewFrameCount + actualBorrow;
    const finalDelta = finalFrameCount - currentFrameCount;

    if (finalDelta === 0) {
      console.log('[FrameCountUpdate] No change needed');
      return;
    }

    console.log('[FrameCountUpdate] Updating:', {
      pairIndex,
      currentFrameCount,
      finalFrameCount,
      finalDelta,
      needsCompression,
    });

    // Calculate new positions for all subsequent images
    const updates: Array<{ id: string; newFrame: number }> = [];

    if (needsCompression && actualBorrow > 0) {
      // Calculate compression ratio
      const targetTotal = totalSubsequentFrames - actualBorrow;
      const compressionRatio = targetTotal / totalSubsequentFrames;

      console.log('[FrameCountUpdate] Compression mode:', { actualBorrow, compressionRatio: compressionRatio.toFixed(3) });

      // Apply proportional compression
      let currentFrame = (startImage.timeline_frame ?? 0) + finalFrameCount;

      // First subsequent image (end of target pair)
      updates.push({ id: sortedImages[pairIndex + 1].id, newFrame: currentFrame });

      for (let i = 0; i < subsequentPairs.length; i++) {
        const pair = subsequentPairs[i];
        const compressedFrames = Math.max(1, Math.min(maxFrameLimit, Math.round(pair.originalFrames * compressionRatio)));
        currentFrame += compressedFrames;

        if (pair.endIdx < sortedImages.length) {
          updates.push({ id: sortedImages[pair.endIdx].id, newFrame: currentFrame });
        }
      }
    } else {
      // Simple shift: just add delta to all subsequent images
      for (let j = pairIndex + 1; j < sortedImages.length; j++) {
        const img = sortedImages[j];
        const newFrame = (img.timeline_frame ?? 0) + finalDelta;
        updates.push({ id: img.id, newFrame });
      }
    }

    // Apply updates in parallel to database
    await Promise.all(updates.map(update =>
      supabase
        .from('shot_generations')
        .update({ timeline_frame: update.newFrame })
        .eq('id', update.id)
    ));

    console.log('[FrameCountUpdate] ✅ Updated', updates.length, 'positions');

    // Refresh data to show the updated positions
    if (loadPositions) {
      await loadPositions({ silent: true, reason: 'frame-count-update' as any });
    }

    return { finalFrameCount };
  }, [shotGenerations, effectiveGenerationMode, loadPositions, maxFrameLimit]);

  // Alias for MediaLightbox compatibility
  const handleSegmentFrameCountChange = updatePairFrameCount;

  // Get ALL segments for preview (both with videos and image-only)
  // NOTE: This must be after shotGenerations is defined
  // IMPORTANT: Build from IMAGE PAIRS, not segmentSlots - otherwise we miss image-only segments
  const allSegmentsForPreview = React.useMemo(() => {
    // Get sorted images to find start/end for each pair
    const sortedImages = [...(shotGenerations || [])]
      .filter((img: any) => img.timeline_frame != null && img.timeline_frame >= 0)
      .sort((a: any, b: any) => a.timeline_frame - b.timeline_frame);
    
    // Build a lookup of segment slots by index for quick access
    const slotsByIndex = new Map<number, typeof segmentSlots[0]>();
    segmentSlots.forEach(slot => {
      slotsByIndex.set(slot.index, slot);
    });
    
    // Number of pairs = number of images - 1 (each pair is consecutive images)
    const numPairs = Math.max(0, sortedImages.length - 1);
    
    console.log('[PreviewCrossfade] Building allSegmentsForPreview:', {
      shotGenerationsCount: shotGenerations?.length || 0,
      sortedImagesCount: sortedImages.length,
      segmentSlotsCount: segmentSlots.length,
      numPairs,
      sortedImageFrames: sortedImages.map((img: any) => img.timeline_frame),
    });
    
    // FPS for calculating duration from frames
    const FPS = 16;
    
    // Build segments from ALL image pairs, enriching with video data from slots if available
    const segments = [];
    for (let pairIndex = 0; pairIndex < numPairs; pairIndex++) {
      // Get start and end images for this pair
      const startImage = sortedImages[pairIndex];
      const endImage = sortedImages[pairIndex + 1];
      
      // Get frame positions (for logging and timeline mode calculation)
      const startFrame = startImage?.timeline_frame ?? 0;
      const endFrame = endImage?.timeline_frame ?? startFrame;

      // Calculate duration - in batch mode use uniform batchVideoFrames, otherwise from timeline positions
      const isBatchMode = effectiveGenerationMode === 'batch';
      const durationFromFrames = isBatchMode
        ? batchVideoFrames / FPS  // Batch mode: uniform duration for all pairs
        : (endFrame - startFrame) / FPS;  // Timeline mode: from actual frame positions
      
      // Check if there's a slot with video for this pair
      const slot = slotsByIndex.get(pairIndex);
      const hasVideoInSlot = slot?.type === 'child' && !!slot.child?.location;
      
      console.log('[PreviewCrossfade] Processing pair:', {
        pairIndex,
        hasSlot: !!slot,
        slotType: slot?.type,
        hasVideoInSlot,
        startImageUrl: startImage?.imageUrl?.substring(0, 50) || null,
        endImageUrl: endImage?.imageUrl?.substring(0, 50) || null,
        startFrame,
        endFrame,
        durationFromFrames,
      });
      
      if (hasVideoInSlot && slot?.type === 'child') {
        // Has video
        segments.push({
          hasVideo: true,
          videoUrl: getDisplayUrl(slot.child.location),
          thumbUrl: getDisplayUrl(slot.child.thumbUrl || slot.child.location),
          startImageUrl: startImage?.imageUrl || startImage?.thumbUrl || null,
          endImageUrl: endImage?.imageUrl || endImage?.thumbUrl || null,
          index: pairIndex,
          durationFromFrames, // Used as fallback if video duration fails to load
        });
      } else {
        // No video - will show crossfade
        segments.push({
          hasVideo: false,
          videoUrl: null,
          thumbUrl: startImage?.thumbUrl || startImage?.imageUrl || null,
          startImageUrl: startImage?.imageUrl || startImage?.thumbUrl || null,
          endImageUrl: endImage?.imageUrl || endImage?.thumbUrl || null,
          index: pairIndex,
          durationFromFrames,
        });
      }
    }
    
    console.log('[PreviewCrossfade] allSegmentsForPreview result:', segments.map(s => ({
      index: s.index,
      hasVideo: s.hasVideo,
      hasStartImg: !!s.startImageUrl,
      hasEndImg: !!s.endImageUrl,
      duration: s.durationFromFrames,
    })));
    
    return segments;
  }, [segmentSlots, shotGenerations, effectiveGenerationMode, batchVideoFrames]);
  
  // Filter to just segments we can actually preview (have video OR have both images)
  const previewableSegments = React.useMemo(() => {
    const filtered = allSegmentsForPreview.filter(seg => 
      seg.hasVideo || (seg.startImageUrl && seg.endImageUrl)
    );
    console.log('[PreviewCrossfade] previewableSegments:', {
      allCount: allSegmentsForPreview.length,
      filteredCount: filtered.length,
      segments: filtered.map(s => ({ index: s.index, hasVideo: s.hasVideo })),
    });
    return filtered;
  }, [allSegmentsForPreview]);
  
  const hasVideosToPreview = previewableSegments.length > 0;
  console.log('[PreviewCrossfade] hasVideosToPreview:', hasVideosToPreview);

  // Preload next video for seamless cuts
  React.useEffect(() => {
    if (!isPreviewTogetherOpen || previewableSegments.length <= 1) return;

    const safeIndex = Math.min(currentPreviewIndex, previewableSegments.length - 1);
    const nextIndex = (safeIndex + 1) % previewableSegments.length;
    const nextSegment = previewableSegments[nextIndex];

    // Only preload if next segment has video and we haven't already preloaded it (or aren't currently preloading it)
    if (!nextSegment?.hasVideo || preloadedIndex === nextIndex || preloadingIndexRef.current === nextIndex) return;

    // Track the video element and listener for cleanup
    let preloadedVideo: HTMLVideoElement | null = null;
    let canPlayHandler: (() => void) | null = null;
    let retryInterval: NodeJS.Timeout | null = null;

    // Function to attempt preloading
    const attemptPreload = () => {
      // Get the inactive video element
      const inactiveVideo = activeVideoSlot === 'A' ? previewVideoRefB.current : previewVideoRef.current;
      if (!inactiveVideo) return false; // Element not mounted yet

      preloadedVideo = inactiveVideo;

      // Mark that we're preloading this index
      preloadingIndexRef.current = nextIndex;

      // Handler for when video is ready to play
      canPlayHandler = () => {
        // Only set preloadedIndex if this is still the index we're preloading
        if (preloadingIndexRef.current === nextIndex) {
          setPreloadedIndex(nextIndex);
          preloadingIndexRef.current = null;
          console.log('[SeamlessCut] Video ready to play:', { nextIndex });
        }
        if (preloadedVideo && canPlayHandler) {
          preloadedVideo.removeEventListener('canplaythrough', canPlayHandler);
        }
      };

      // Listen for video ready event before marking as preloaded
      inactiveVideo.addEventListener('canplaythrough', canPlayHandler);

      // Preload the next video
      inactiveVideo.src = nextSegment.videoUrl!;
      inactiveVideo.load();
      console.log('[SeamlessCut] Preloading next video:', { nextIndex, url: nextSegment.videoUrl?.substring(0, 50) });

      return true; // Successfully started preload
    };

    // Try immediately
    if (!attemptPreload()) {
      // If video element not available (Dialog portal not mounted yet), retry
      // This is critical for the first preload when the dialog just opened
      let retryCount = 0;
      const maxRetries = 20; // More retries since preloading is important
      retryInterval = setInterval(() => {
        retryCount++;
        if (attemptPreload() || retryCount >= maxRetries) {
          if (retryInterval) clearInterval(retryInterval);
          retryInterval = null;
          if (retryCount >= maxRetries) {
            console.warn('[SeamlessCut] Failed to preload - video element never became available');
          }
        }
      }, 50);
    }

    return () => {
      if (retryInterval) clearInterval(retryInterval);
      if (preloadedVideo && canPlayHandler) {
        preloadedVideo.removeEventListener('canplaythrough', canPlayHandler);
      }
    };
  }, [isPreviewTogetherOpen, currentPreviewIndex, previewableSegments, activeVideoSlot, preloadedIndex]);

  // Set active video src and start playback
  // This runs on dialog open, manual navigation, or slot swap
  React.useEffect(() => {
    if (!isPreviewTogetherOpen || previewableSegments.length === 0) return;

    const safeIndex = Math.min(currentPreviewIndex, previewableSegments.length - 1);
    const currentSegment = previewableSegments[safeIndex];

    // Only handle video segments
    if (!currentSegment?.hasVideo || !currentSegment.videoUrl) return;

    // Function to set up and play the video
    const setupAndPlayVideo = () => {
      const activeVideo = activeVideoSlot === 'A' ? previewVideoRef.current : previewVideoRefB.current;
      if (!activeVideo) {
        console.log('[SeamlessCut] Video element not available yet');
        return false; // Signal that we need to retry
      }

      // Check if video already has the correct src (preloaded case)
      const currentSrc = activeVideo.src;
      const targetSrc = currentSegment.videoUrl;

      // Compare URLs (handle relative vs absolute)
      const srcMatches = currentSrc && (currentSrc === targetSrc || currentSrc.endsWith(new URL(targetSrc, window.location.href).pathname));

      if (srcMatches) {
        // Already has correct src (from preload) - just play
        console.log('[SeamlessCut] Video already preloaded, playing:', { slot: activeVideoSlot, index: safeIndex });
        activeVideo.play().catch(() => {});
        return true;
      }

      // Need to load the video (initial load or manual navigation)
      console.log('[SeamlessCut] Loading active video:', { slot: activeVideoSlot, index: safeIndex });
      setIsPreviewVideoLoading(true);
      activeVideo.src = currentSegment.videoUrl;
      activeVideo.load();
      activeVideo.play().catch(() => {});
      return true;
    };

    // Try immediately
    if (setupAndPlayVideo()) return;

    // If video element not available (Dialog portal not mounted yet), retry after a frame
    // This handles the race condition where the effect runs before the Dialog content mounts
    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = setInterval(() => {
      retryCount++;
      console.log('[SeamlessCut] Retrying video setup, attempt:', retryCount);
      if (setupAndPlayVideo() || retryCount >= maxRetries) {
        clearInterval(retryInterval);
        if (retryCount >= maxRetries) {
          console.warn('[SeamlessCut] Max retries reached, video element never became available');
        }
      }
    }, 50);

    return () => clearInterval(retryInterval);
  }, [isPreviewTogetherOpen, currentPreviewIndex, previewableSegments, activeVideoSlot]);

  // Helper to calculate global time across all segments
  const getGlobalTime = React.useCallback((segmentIndex: number, timeInSegment: number) => {
    if (segmentOffsets.length === 0 || segmentIndex >= segmentOffsets.length) return 0;
    return segmentOffsets[segmentIndex] + timeInSegment;
  }, [segmentOffsets]);
  
  // Sync audio when video plays
  const syncAudioToVideo = React.useCallback(() => {
    const video = previewVideoRef.current;
    const audio = previewAudioRef.current;
    if (!video || !audio || !isAudioEnabled || !propAudioUrl) return;
    
    // Scale video time by playback rate to get "real" elapsed time
    const scaledVideoTime = video.currentTime / (video.playbackRate || 1);
    const globalTime = getGlobalTime(currentPreviewIndex, scaledVideoTime);
    audio.currentTime = globalTime;
    
    if (!video.paused) {
      audio.play().catch(() => {}); // Ignore autoplay errors
    }
  }, [currentPreviewIndex, getGlobalTime, isAudioEnabled, propAudioUrl]);
  
  // Calculate segment durations and offsets when dialog opens
  // Uses frame-based duration so videos will be speed-adjusted to match
  React.useEffect(() => {
    if (!isPreviewTogetherOpen || previewableSegments.length === 0) return;
    
    // Use frame-based duration for all segments (videos will adjust playback rate to match)
    const durations = previewableSegments.map(segment => 
      segment.durationFromFrames || 2 // Default 2s if no frame data
    );
    
    // Calculate cumulative offsets: [0, dur1, dur1+dur2, ...]
    const offsets: number[] = [0];
    for (let i = 0; i < durations.length - 1; i++) {
      offsets.push(offsets[i] + durations[i]);
    }
    
    console.log('[PreviewAudio] Segment durations (from frames):', durations);
    console.log('[PreviewAudio] Calculated offsets:', offsets);
    
    setSegmentDurations(durations);
    setSegmentOffsets(offsets);
    setIsLoadingDurations(false);
  }, [isPreviewTogetherOpen, previewableSegments]);

  // Auto-scroll thumbnail strip to keep current segment centered (when possible)
  // At start: first thumbnail at left edge, at end: last thumbnail at right edge
  React.useEffect(() => {
    if (!isPreviewTogetherOpen || !previewThumbnailsRef.current) return;

    const container = previewThumbnailsRef.current;
    const thumbnailWidth = 64; // Width of each thumbnail
    const gap = 8; // gap-2 = 0.5rem = 8px
    const itemTotalWidth = thumbnailWidth + gap;
    const containerWidth = container.offsetWidth;
    const totalSegments = previewableSegments.length;

    // Total content width (all thumbnails + gaps, minus last gap)
    const totalContentWidth = (totalSegments * thumbnailWidth) + ((totalSegments - 1) * gap);

    // If all thumbnails fit, no scrolling needed
    if (totalContentWidth <= containerWidth) {
      return;
    }

    // Calculate ideal scroll to center current thumbnail
    const thumbnailCenter = (currentPreviewIndex * itemTotalWidth) + (thumbnailWidth / 2);
    const idealScrollLeft = thumbnailCenter - (containerWidth / 2);

    // Clamp to valid scroll range (0 to maxScroll)
    const maxScroll = totalContentWidth - containerWidth;
    const clampedScrollLeft = Math.max(0, Math.min(maxScroll, idealScrollLeft));

    container.scrollTo({
      left: clampedScrollLeft,
      behavior: 'smooth'
    });
  }, [isPreviewTogetherOpen, currentPreviewIndex, previewableSegments.length]);

  // Keyboard navigation for preview dialog
  React.useEffect(() => {
    if (!isPreviewTogetherOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping) return;
      
      if (previewableSegments.length === 0) return;
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        // Reset dual-video state on manual navigation
        setActiveVideoSlot('A');
        setPreloadedIndex(null);
        setCurrentPreviewIndex(prev =>
          prev > 0 ? prev - 1 : previewableSegments.length - 1
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        // Reset dual-video state on manual navigation
        setActiveVideoSlot('A');
        setPreloadedIndex(null);
        setCurrentPreviewIndex(prev =>
          (prev + 1) % previewableSegments.length
        );
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewTogetherOpen, previewableSegments.length]);
  
  // Crossfade animation effect for image-only segments
  React.useEffect(() => {
    console.log('[PreviewCrossfade] Effect triggered:', {
      isPreviewTogetherOpen,
      previewableSegmentsLength: previewableSegments.length,
      currentPreviewIndex,
      previewIsPlaying,
    });
    
    if (!isPreviewTogetherOpen || previewableSegments.length === 0) {
      console.log('[PreviewCrossfade] Early return: dialog not open or no segments');
      return;
    }
    
    const safeIndex = Math.min(currentPreviewIndex, previewableSegments.length - 1);
    const currentSegment = previewableSegments[safeIndex];
    
    console.log('[PreviewCrossfade] Current segment:', {
      safeIndex,
      hasSegment: !!currentSegment,
      hasVideo: currentSegment?.hasVideo,
      startImageUrl: currentSegment?.startImageUrl?.substring(0, 50),
      endImageUrl: currentSegment?.endImageUrl?.substring(0, 50),
    });
    
    // Only run crossfade for image-only segments
    if (!currentSegment || currentSegment.hasVideo || !previewIsPlaying) {
      console.log('[PreviewCrossfade] Skipping crossfade:', {
        noSegment: !currentSegment,
        hasVideo: currentSegment?.hasVideo,
        notPlaying: !previewIsPlaying,
      });
      // Clear timer if video segment or paused
      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
      return;
    }
    
    // Image-only segment - start crossfade animation
    const segmentDuration = segmentDurations[safeIndex] || currentSegment.durationFromFrames || 2;
    const startTime = Date.now();
    const duration = segmentDuration * 1000; // Convert to ms
    
    console.log('[PreviewCrossfade] 🎬 STARTING crossfade animation:', {
      segmentDuration,
      durationMs: duration,
      startImageUrl: currentSegment.startImageUrl?.substring(0, 50),
      endImageUrl: currentSegment.endImageUrl?.substring(0, 50),
    });
    
    // Sync audio at start
    const audio = previewAudioRef.current;
    if (audio && isAudioEnabled && propAudioUrl) {
      const globalTime = getGlobalTime(safeIndex, 0);
      audio.currentTime = globalTime;
      audio.play().catch(() => {});
    }
    
    setCrossfadeProgress(0);
    setPreviewCurrentTime(0);
    setPreviewDuration(segmentDuration);
    
    // Clear any existing timer first
    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
    }
    
    crossfadeTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Log every 500ms to avoid spam
      if (Math.floor(elapsed / 500) !== Math.floor((elapsed - 50) / 500)) {
        console.log('[PreviewCrossfade] ⏱️ Tick:', { elapsed, progress: progress.toFixed(2), duration });
      }
      
      setCrossfadeProgress(progress);
      setPreviewCurrentTime(progress * segmentDuration);
      
      if (progress >= 1) {
        console.log('[PreviewCrossfade] ✅ Crossfade complete, advancing to next segment');
        // Crossfade complete - advance to next segment
        clearInterval(crossfadeTimerRef.current!);
        crossfadeTimerRef.current = null;
        const nextIndex = (safeIndex + 1) % previewableSegments.length;
        setCurrentPreviewIndex(nextIndex);
      }
    }, 50); // Update ~20 times per second
    
    console.log('[PreviewCrossfade] ✅ Timer started, ref:', !!crossfadeTimerRef.current);
    
    return () => {
      console.log('[PreviewCrossfade] Cleanup: clearing timer');
      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
    };
  // Note: We use JSON.stringify for segment data to avoid re-running on every render
  // when the array reference changes but content is the same
  }, [isPreviewTogetherOpen, currentPreviewIndex, JSON.stringify(previewableSegments.map(s => ({ hasVideo: s.hasVideo, index: s.index }))), previewIsPlaying, segmentDurations.length, isAudioEnabled, propAudioUrl]);
  
  // Enhanced reorder management for batch mode - pass parent hook to avoid duplication
  // When using preloaded images, still need shotId for mutations!
  const { handleReorder, handleDelete } = useEnhancedShotImageReorder(
    selectedShotId, // Always pass shotId - needed for mutations 
    preloadedImages ? {
      shotGenerations: utilsData.shotGenerations,
      getImagesForMode: hookData.getImagesForMode, // Use the filtering function we created
      exchangePositions: async (genIdA: string, genIdB: string) => {
        // Single exchange - just use batchExchangePositions with one item
        await utilsData.batchExchangePositions([
          { id: genIdA, newFrame: 0 }, // Placeholder, will be calculated
          { id: genIdB, newFrame: 0 }
        ]);
      },
      exchangePositionsNoReload: async (shotGenIdA: string, shotGenIdB: string) => {
        console.log('[ShotImagesEditor] exchangePositionsNoReload - swapping pair:', {
          shotGenIdA: shotGenIdA.substring(0, 8),
          shotGenIdB: shotGenIdB.substring(0, 8),
        });
        // Call utility's batchExchangePositions with pair swap format
        await utilsData.batchExchangePositions([{ shotGenerationIdA: shotGenIdA, shotGenerationIdB: shotGenIdB }] as any);
      },
      batchExchangePositions: utilsData.batchExchangePositions, // REAL function!
      deleteItem: async (shotGenerationId: string) => {
        console.log('[DELETE:ShotImagesEditor] 🔄 deleteItem stub forwarding to onImageDelete', {
          shotGenerationId: shotGenerationId.substring(0, 8),
          hasOnImageDelete: !!onImageDelete,
          timestamp: Date.now()
        });
        // Forward to the actual delete handler passed from parent
        if (onImageDelete) {
          onImageDelete(shotGenerationId);
        } else {
          console.error('[DELETE:ShotImagesEditor] ❌ No onImageDelete handler provided!');
        }
      },
      loadPositions: utilsData.loadPositions, // REAL function!
      moveItemsToMidpoint: utilsData.moveItemsToMidpoint, // NEW: Midpoint-based reordering (single or multi)
      isLoading: utilsData.isLoading
    } as any : {
      shotGenerations,
      getImagesForMode,
      exchangePositions,
      exchangePositionsNoReload,
      batchExchangePositions,
      deleteItem,
      loadPositions,
      isLoading: positionsLoading
    }
  );

  // Memoize images and shotGenerations to prevent infinite re-renders in Timeline
  const images = React.useMemo(() => {
    // ALWAYS use getImagesForMode to apply correct filtering for the mode
    const result = getImagesForMode(generationMode);
    
    console.log('[UnifiedDataFlow] ShotImagesEditor images memoization:', {
      selectedShotId: selectedShotId.substring(0, 8),
      generationMode,
      usingPreloaded: !!preloadedImages,
      totalImages: result.length,
      positioned: result.filter((img: any) => img.timeline_frame != null && img.timeline_frame !== -1).length,
      unpositioned: result.filter((img: any) => img.timeline_frame == null || img.timeline_frame === -1).length,
    });
    
    console.log('[DataTrace] 📤 ShotImagesEditor → passing to Timeline/Manager:', {
      shotId: selectedShotId.substring(0, 8),
      mode: generationMode,
      total: result.length,
      willBeDisplayed: result.length,
    });
    
    return result;
  }, [getImagesForMode, generationMode, selectedShotId]);

  // Extract generation IDs for variant badge fetching
  // Use generation_id since these are shot_generations entries
  const generationIds = React.useMemo(() => 
    images.map((img: any) => img.generation_id || img.id).filter(Boolean) as string[],
    [images]
  );

  // Lazy-load variant badge data (derivedCount, hasUnviewedVariants, unviewedVariantCount)
  // This allows images to display immediately while badge data loads in background
  const { getBadgeData, isLoading: isBadgeDataLoading } = useVariantBadges(generationIds);

  // Merge badge data with images for variant count and NEW badge display
  const imagesWithBadges = React.useMemo(() => {
    // Don't merge badge data while loading - prevents showing "0" badges
    if (isBadgeDataLoading) {
      return images;
    }
    return images.map((img: any) => {
      const generationId = img.generation_id || img.id;
      const badgeData = getBadgeData(generationId);
      return {
        ...img,
        derivedCount: badgeData.derivedCount,
        hasUnviewedVariants: badgeData.hasUnviewedVariants,
        unviewedVariantCount: badgeData.unviewedVariantCount,
      };
    });
  }, [images, getBadgeData, isBadgeDataLoading]);

  // Memoize shotGenerations to prevent reference changes
  const memoizedShotGenerations = React.useMemo(() => {
    return shotGenerations;
  }, [shotGenerations]);

  // Track if we've ever had data to prevent unmounting Timeline during refetches
  // This prevents zoom reset when data is being refetched
  const hasEverHadDataRef = React.useRef(false);
  if (memoizedShotGenerations.length > 0) {
    hasEverHadDataRef.current = true;
  }
  // Reset when shot changes
  React.useEffect(() => {
    hasEverHadDataRef.current = memoizedShotGenerations.length > 0;
  }, [selectedShotId]);

  // Track previous smoothContinuations value to detect when it's enabled
  const prevSmoothContinuationsRef = useRef(smoothContinuations);

  // Effect: Compact timeline gaps when smooth continuations is enabled
  // This reduces any gaps > 77 frames down to 77
  useEffect(() => {
    const wasEnabled = !prevSmoothContinuationsRef.current && smoothContinuations;
    prevSmoothContinuationsRef.current = smoothContinuations;

    if (!wasEnabled || readOnly) return;

    // Get positioned images sorted by frame
    const positionedImages = images
      .filter((img: any) => img.timeline_frame != null && img.timeline_frame !== -1)
      .sort((a: any, b: any) => a.timeline_frame - b.timeline_frame);

    if (positionedImages.length < 2) return;

    // Find gaps > maxFrameLimit and calculate shifts needed
    const updates: Array<{ id: string; newFrame: number }> = [];
    let cumulativeShift = 0;

    // Always start from frame 0 for gap calculation
    let prevFrame = 0;

    for (const img of positionedImages) {
      const currentFrame = (img as any).timeline_frame;
      const gap = currentFrame - prevFrame;

      if (gap > maxFrameLimit) {
        // This gap is too large, need to shift this and all subsequent images
        const excess = gap - maxFrameLimit;
        cumulativeShift += excess;
      }

      if (cumulativeShift > 0) {
        const newFrame = currentFrame - cumulativeShift;
        updates.push({ id: (img as any).id, newFrame });
      }

      prevFrame = currentFrame - cumulativeShift; // Use the new position for next gap calculation
    }

    // Apply updates if any
    if (updates.length > 0) {
      console.log('[SmoothContinuations] Compacting timeline gaps:', {
        updatesCount: updates.length,
        maxFrameLimit,
        updates: updates.map(u => ({ id: u.id.substring(0, 8), newFrame: u.newFrame }))
      });

      // Update each frame position
      // Use Promise.all to batch the updates
      Promise.all(
        updates.map(({ id, newFrame }) => updateTimelineFrame(id, newFrame))
      ).then(() => {
        console.log('[SmoothContinuations] Timeline gaps compacted successfully');
      }).catch((err) => {
        console.error('[SmoothContinuations] Error compacting timeline gaps:', err);
      });
    }
  }, [smoothContinuations, images, maxFrameLimit, updateTimelineFrame, readOnly]);

  // Note: Pair prompts cleanup is handled automatically by the database
  // when shot_generations are deleted, since prompts are stored in their metadata

  // Download all shot images handler
  const handleDownloadAllImages = useCallback(async () => {
    if (!images || images.length === 0) {
      toast.error("No images to download");
      return;
    }

    setIsDownloadingImages(true);
    
    try {
      // Dynamic import JSZip
      const JSZipModule = await import('jszip');
      const zip = new JSZipModule.default();
      
      // Sort images by position for consistent ordering
      const sortedImages = [...images].sort((a, b) => {
        const posA = (a as any).position || 0;
        const posB = (b as any).position || 0;
        return posA - posB;
      });
      
      // Process images sequentially to avoid overwhelming the server
      for (let i = 0; i < sortedImages.length; i++) {
        const image = sortedImages[i];
        const accessibleImageUrl = getDisplayUrl(image.imageUrl || image.location || '');
        
        try {
          // Fetch the image blob
          const response = await fetch(accessibleImageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          
          // Determine file extension
          let fileExtension = 'png'; // Default fallback
          const contentType = blob.type || (image as any).metadata?.content_type;
          
          if (contentType && typeof contentType === 'string') {
            if (contentType.includes('jpeg') || contentType.includes('jpg')) {
              fileExtension = 'jpg';
            } else if (contentType.includes('png')) {
              fileExtension = 'png';
            } else if (contentType.includes('webp')) {
              fileExtension = 'webp';
            } else if (contentType.includes('gif')) {
              fileExtension = 'gif';
            }
          }
          
          // Generate zero-padded filename
          const paddedNumber = String(i + 1).padStart(3, '0');
          const filename = `${paddedNumber}.${fileExtension}`;
          
          // Add to zip
          zip.file(filename, blob);
        } catch (error) {
          console.error(`Error processing image ${i + 1}:`, error);
          // Continue with other images, don't fail the entire operation
          toast.error(`Failed to process image ${i + 1}, continuing with others...`);
        }
      }
      
      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Create download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // Generate filename with shot name and timestamp
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 16).replace(/[:-]/g, '').replace('T', '-');
      const sanitizedShotName = shotName ? shotName.replace(/[^a-zA-Z0-9-_]/g, '-') : 'shot';
      a.download = `${sanitizedShotName}-${timestamp}.zip`;
      
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error("Error downloading shot images:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Could not create zip file. ${errorMessage}`);
    } finally {
      setIsDownloadingImages(false);
    }
  }, [images]);

    console.log('[ShotImagesEditor] Render:', {
    selectedShotId,
    generationMode,
    imagesCount: images.length,
    positionsLoading,
    isModeReady
  });

  // Wrap onDefaultPromptChange to also clear all enhanced prompts when base prompt changes
  const handleDefaultPromptChange = React.useCallback(async (newPrompt: string) => {
    // First update the default prompt
    onDefaultPromptChange(newPrompt);
    
    // Then clear all enhanced prompts for the shot
    try {
      await clearAllEnhancedPrompts();
      console.log('[ShotImagesEditor] 🧹 Cleared all enhanced prompts after base prompt change');
    } catch (error) {
      console.error('[ShotImagesEditor] Error clearing enhanced prompts:', error);
    }
  }, [onDefaultPromptChange, clearAllEnhancedPrompts]);

  // Adapter functions to convert between ShotImageManager's signature and ShotEditor's signature
  // CRITICAL FIX: Now receives targetShotId from the callback, not from props!
  // This ensures the image is added to the shot the user SELECTED in the dropdown, not the shot being viewed
  const handleAddToShotAdapter = React.useCallback(async (
    targetShotId: string,
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    console.log('[ShotSelectorDebug] ShotImagesEditor handleAddToShotAdapter called', {
      component: 'ShotImagesEditor',
      hasOnAddToShot: !!onAddToShot,
      targetShotId: targetShotId?.substring(0, 8),
      viewedShotId: selectedShotId?.substring(0, 8),
      generationId: generationId?.substring(0, 8),
      isDifferentShot: targetShotId !== selectedShotId
    });

    if (!onAddToShot || !targetShotId) {
      console.warn('[ShotImagesEditor] Cannot add to shot: missing onAddToShot or targetShotId');
      return false;
    }

    try {
      // Pass position as undefined to let the mutation calculate the correct position for the TARGET shot
      // CRITICAL: We can't use `images` here because `images` are for the VIEWED shot, not the TARGET shot
      await onAddToShot(targetShotId, generationId, undefined as any);
      return true;
    } catch (error) {
      console.error('[ShotImagesEditor] Error adding to shot:', error);
      return false;
    }
  }, [onAddToShot, selectedShotId]);

  // CRITICAL FIX: Now receives targetShotId from the callback
  const handleAddToShotWithoutPositionAdapter = React.useCallback(async (
    targetShotId: string,
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    if (!onAddToShotWithoutPosition || !targetShotId) {
      console.warn('[ShotImagesEditor] Cannot add to shot without position: missing handler or targetShotId');
      return false;
    }

    try {
      await onAddToShotWithoutPosition(targetShotId, generationId);
      return true;
    } catch (error) {
      console.error('[ShotImagesEditor] Error adding to shot without position:', error);
      return false;
    }
  }, [onAddToShotWithoutPosition]);

  // [ShotNavPerf] Removed redundant render completion log - use STATE CHANGED log instead

  // ============================================================================
  // STABLE CALLBACK REFS FOR TIMELINE PROPS
  // These use refs to avoid recreating callbacks when dependencies change,
  // which would defeat React.memo on Timeline and cause cascade re-renders.
  // ============================================================================

  // Ref to hold current values for stable callbacks
  const stableCallbackDepsRef = React.useRef({
    loadPositions,
    pairDataByIndex,
    setSegmentSlotLightboxIndex,
    shotGenerations,
    clearEnhancedPrompt,
    onCreateShot,
  });

  // Update ref values on each render (but don't trigger re-renders)
  stableCallbackDepsRef.current = {
    loadPositions,
    pairDataByIndex,
    setSegmentSlotLightboxIndex,
    shotGenerations,
    clearEnhancedPrompt,
    onCreateShot,
  };

  // Stable callback: onTimelineChange
  const handleTimelineChange = React.useCallback(async () => {
    await stableCallbackDepsRef.current.loadPositions({ silent: true });
  }, []);

  // Stable callback: onPairClick
  const handlePairClick = React.useCallback((pairIndex: number, passedPairData?: PairData) => {
    const { pairDataByIndex, setSegmentSlotLightboxIndex } = stableCallbackDepsRef.current;
    console.log('[SegmentClickDebug] onPairClick (Timeline) called:', {
      pairIndex,
      passedPairDataIndex: passedPairData?.index,
      hasPairDataInMap: pairDataByIndex.has(pairIndex),
      pairDataByIndexKeys: [...pairDataByIndex.keys()],
    });
    if (passedPairData || pairDataByIndex.has(pairIndex)) {
      console.log('[SegmentClickDebug] Setting segmentSlotLightboxIndex to:', pairIndex);
      setSegmentSlotLightboxIndex(pairIndex);
    }
  }, []);

  // Stable callback: onClearEnhancedPrompt
  const handleClearEnhancedPromptByIndex = React.useCallback(async (pairIndex: number) => {
    const { shotGenerations, clearEnhancedPrompt } = stableCallbackDepsRef.current;
    console.log('[ClearEnhancedPrompt-Timeline] 🔵 Starting clear for pair index:', pairIndex);
    try {
      // Filter out videos to match the timeline display
      const filteredGenerations = shotGenerations.filter((sg: any) => !isVideoAny(sg));
      const sortedGenerations = [...filteredGenerations]
        .sort((a: any, b: any) => (a.timeline_frame || 0) - (b.timeline_frame || 0));

      // Get the first item of the pair
      const firstItem = sortedGenerations[pairIndex];
      if (!firstItem) {
        console.error('[ClearEnhancedPrompt-Timeline] ❌ No generation found for pair index:', pairIndex);
        return;
      }

      const idToUse = firstItem.id;
      console.log('[ClearEnhancedPrompt-Timeline] 📞 Calling clearEnhancedPrompt with id:', idToUse);
      await clearEnhancedPrompt(idToUse);
    } catch (error) {
      console.error('[ClearEnhancedPrompt-Timeline] ❌ Error clearing enhanced prompt:', error);
    }
  }, []);

  // Stable callback: onCreateShot adapter
  const handleCreateShotAdapter = React.useCallback(async (shotName: string, _files: File[]) => {
    const { onCreateShot } = stableCallbackDepsRef.current;
    if (!onCreateShot) return { shotId: '', shotName: '' };
    const shotId = await onCreateShot(shotName);
    return { shotId, shotName };
  }, []);

  // Stable callback: onMagicEdit placeholder (TODO: wire through real handler)
  const handleMagicEditPlaceholder = React.useCallback((imageUrl: string, prompt: string, numImages: number) => {
    console.log("Magic Edit:", { imageUrl, prompt, numImages });
  }, []);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg font-light">
              Guidance
              {settingsError && (
                <div className="text-sm text-destructive mt-1">
                  {settingsError}
                </div>
              )}
            </CardTitle>
            
            {/* Preview Together Button - Icon only, show when segments are available (hidden in read-only mode) */}
            {!readOnly && hasVideosToPreview && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCurrentPreviewIndex(0);
                        setIsPreviewTogetherOpen(true);
                      }}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Preview all generated segments together</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* Download All Images Button - Icon only, next to title (hidden in read-only mode) */}
            {!readOnly && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownloadAllImages}
                      disabled={isDownloadingImages || !images || images.length === 0}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    >
                      {isDownloadingImages ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download all images in this shot as a zip file</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Generation Mode Toggle - Hidden on mobile, disabled look in read-only mode */}
            {!isMobile && (
              <SegmentedControl
                value={generationMode}
                onValueChange={(value) => {
                  if (!readOnly && (value === "batch" || value === "timeline")) {
                    onGenerationModeChange(value);
                  }
                }}
                disabled={readOnly}
              >
                <SegmentedControlItem value="timeline">
                  Timeline
                </SegmentedControlItem>
                <SegmentedControlItem value="batch">
                  Batch
                </SegmentedControlItem>
              </SegmentedControl>
            )}

          </div>
        </div>
      </CardHeader>

      {/* Content - Show skeleton if not ready, otherwise show actual content */}
      {/* IMPORTANT: Don't unmount Timeline during refetches - use hasEverHadDataRef to prevent zoom reset */}
      <CardContent>
        {(() => {
          const showSkeleton = !isModeReady || (positionsLoading && !memoizedShotGenerations.length && !hasEverHadDataRef.current);
          console.log('[ZoomDebug] 🔵 ShotImagesEditor skeleton condition:', {
            showSkeleton,
            isModeReady,
            positionsLoading,
            shotGensLength: memoizedShotGenerations.length,
            hasEverHadData: hasEverHadDataRef.current,
            timestamp: Date.now()
          });
          return showSkeleton;
        })() ? (
          <div className="p-1">
            {/* Show section headers even in skeleton mode for batch mode */}
            {effectiveGenerationMode === "batch" && (
              <>
                <div className="mb-4">
                  <SectionHeader title="Input Images" theme="blue" />
                </div>
                {skeleton}
                
                {/* Show Guidance Video header and skeleton if enabled */}
                {selectedShotId && projectId && propOnStructureVideoChange && (
                  <>
                    <div className="mb-4 mt-6">
                      <SectionHeader title="Camera Guidance Video" theme="green" />
                    </div>
                    {/* Guidance Video Upload Skeleton */}
                    <div className="mb-4">
                      <div className="w-full sm:w-2/3 md:w-1/2 lg:w-1/3 p-4 border rounded-lg bg-muted/20">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <Video className="h-8 w-8 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Add a motion guidance video to control the animation
                          </p>
                          <Skeleton className="w-full h-9" />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {effectiveGenerationMode === "timeline" && skeleton}
          </div>
        ) : (
          <div className="p-1">
            {effectiveGenerationMode === "timeline" ? (
              <>
              <Timeline
                key={`timeline-${selectedShotId}`}
                shotId={selectedShotId}
                projectId={projectId}
                frameSpacing={batchVideoFrames}
                onImageReorder={onImageReorder}
                onFramePositionsChange={onFramePositionsChange}
                onImageDrop={onImageDrop}
                onGenerationDrop={onGenerationDrop}
                pendingPositions={pendingPositions}
                onPendingPositionApplied={onPendingPositionApplied}
                onImageDelete={onImageDelete}
                onImageDuplicate={onImageDuplicate}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                projectAspectRatio={projectAspectRatio}
                readOnly={readOnly}
                // Pass shared data to prevent reloading
                // Pass ALL generations for lookups, but filtered images for display
                shotGenerations={preloadedImages ? undefined : memoizedShotGenerations}
                updateTimelineFrame={updateTimelineFrame}
                allGenerations={preloadedImages}
                images={imagesWithBadges}
                onTimelineChange={handleTimelineChange}
                // Pass shared hook data to prevent creating duplicate instances
                // BUT: Only pass if not using preloaded images (to avoid filtering conflict)
                hookData={preloadedImages ? undefined : hookData}
                onDragStateChange={handleDragStateChange}
                onPairClick={handlePairClick}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
                onClearEnhancedPrompt={handleClearEnhancedPromptByIndex}
                // Structure video props
                structureVideoPath={propStructureVideoPath}
                structureVideoMetadata={propStructureVideoMetadata}
                structureVideoTreatment={propStructureVideoTreatment}
                structureVideoMotionStrength={propStructureVideoMotionStrength}
                structureVideoType={propStructureVideoType}
                onStructureVideoChange={propOnStructureVideoChange}
                uni3cEndPercent={propUni3cEndPercent}
                onUni3cEndPercentChange={propOnUni3cEndPercentChange}
                // NEW: Multi-video array props
                structureVideos={propStructureVideos}
                onAddStructureVideo={propOnAddStructureVideo}
                onUpdateStructureVideo={propOnUpdateStructureVideo}
                onRemoveStructureVideo={propOnRemoveStructureVideo}
                // Audio strip props
                audioUrl={propAudioUrl}
                audioMetadata={propAudioMetadata}
                onAudioChange={propOnAudioChange}
                // Image upload for empty state
                onImageUpload={onImageUpload}
                isUploadingImage={isUploadingImage}
                uploadProgress={uploadProgress}
                // Shot management for external generation viewing
                allShots={allShots}
                selectedShotId={selectedShotId}
                onShotChange={onShotChange}
                onAddToShot={onAddToShot ? handleAddToShotAdapter : undefined}
                onAddToShotWithoutPosition={onAddToShotWithoutPosition ? handleAddToShotWithoutPositionAdapter : undefined}
                onCreateShot={onCreateShot ? handleCreateShotAdapter : undefined}
                // Single image duration endpoint
                singleImageEndFrame={singleImageEndFrame}
                onSingleImageEndFrameChange={handleSingleImageEndFrameChange}
                // Frame limit (77 with smooth continuations, 81 otherwise)
                maxFrameLimit={maxFrameLimit}
                // Shared output selection (syncs FinalVideoSection with SegmentOutputStrip)
                selectedOutputId={selectedOutputId}
                onSelectedOutputChange={onSelectedOutputChange}
                // Instant timeline updates from MediaLightbox
                onSegmentFrameCountChange={handleSegmentFrameCountChange}
                // Segment slots for adjacent segment navigation in lightbox
                segmentSlots={segmentSlots}
                onOpenSegmentSlot={(pairIndex) => setSegmentSlotLightboxIndex(pairIndex)}
                // Constituent image navigation support (from segment back to image)
                pendingImageToOpen={pendingImageToOpen}
                onClearPendingImageToOpen={() => {
                  setPendingImageToOpen(null);
                  // Also clear transition state when image lightbox opens
                  setTimeout(() => {
                    setIsLightboxTransitioning(false);
                    document.body.classList.remove('lightbox-transitioning');
                  }, 50);
                }}
                // Lightbox transition support (keeps overlay visible during navigation)
                onStartLightboxTransition={() => setIsLightboxTransitioning(true)}
              />
              
              {/* Helper for un-positioned generations - in timeline mode, show after timeline */}
              <div className="mt-4" style={{ minHeight: unpositionedGenerationsCount > 0 ? '40px' : '0px' }}>
                {unpositionedGenerationsCount > 0 && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
                    <div className="text-sm text-muted-foreground">
                      {unpositionedGenerationsCount} unpositioned generation{unpositionedGenerationsCount !== 1 ? 's' : ''}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={onOpenUnpositionedPane}
                      className="text-xs"
                    >
                      View & Position
                    </Button>
                  </div>
                )}
              </div>
              </>
            ) : (
              <>
                {/* Subheader for input images */}
                <div className="mb-4">
                  <SectionHeader title="Input Images" theme="blue" />
                </div>
                
                <ShotImageManager
                  images={imagesWithBadges}
                  onImageDelete={handleDelete}
                  onBatchImageDelete={onBatchImageDelete}
                  onImageDuplicate={onImageDuplicate}
                  onImageReorder={handleReorder}
                  columns={columns}
                  generationMode={isMobile ? "batch" : generationMode}
                  onMagicEdit={handleMagicEditPlaceholder}
                  duplicatingImageId={duplicatingImageId}
                  duplicateSuccessImageId={duplicateSuccessImageId}
                  projectAspectRatio={projectAspectRatio}
                  onImageUpload={onImageUpload}
                  isUploadingImage={isUploadingImage}
                  batchVideoFrames={batchVideoFrames}
                  onSelectionChange={onSelectionChange}
                  readOnly={readOnly}
                  onFileDrop={onBatchFileDrop}
                  onGenerationDrop={onBatchGenerationDrop}
                  shotId={selectedShotId}
                  projectId={projectId}
                  toolTypeOverride="travel-between-images"
                  // Shot management for external generation viewing
                  allShots={allShots}
                  selectedShotId={selectedShotId}
                  onShotChange={onShotChange}
                  onAddToShot={(() => {
                    const result = onAddToShot ? handleAddToShotAdapter : undefined;
                    console.log('[ShotSelectorDebug] ShotImagesEditor -> ShotImageManager onAddToShot', {
                      component: 'ShotImagesEditor',
                      hasOnAddToShot: !!onAddToShot,
                      hasAdapter: !!handleAddToShotAdapter,
                      finalOnAddToShot: !!result,
                      allShotsLength: allShots?.length || 0,
                      selectedShotId: selectedShotId
                    });
                    return result;
                  })()}
                  onAddToShotWithoutPosition={onAddToShotWithoutPosition ? handleAddToShotWithoutPositionAdapter : undefined}
                  onCreateShot={onCreateShot ? async (shotName: string, files: File[]) => {
                    const shotId = await onCreateShot(shotName);
                    return { shotId, shotName };
                  } : undefined}
                  // Pair prompt props - lookup from pairDataByIndex (single source of truth)
                  onPairClick={(pairIndex, passedPairData) => {
                    // Open MediaLightbox in segment slot mode for this pair
                    console.log('[PairIndicatorDebug] ShotImagesEditor onPairClick called', { pairIndex });
                    if (passedPairData || pairDataByIndex.has(pairIndex)) {
                      setSegmentSlotLightboxIndex(pairIndex);
                    }
                  }}
                  pairPrompts={pairPrompts}
                  enhancedPrompts={(() => {
                    // Convert enhanced prompts to index-based format
                    // CRITICAL: Use sorted/filtered images array for correct index alignment
                    const result: Record<number, string> = {};
                    images.forEach((img, index) => {
                      const enhancedPrompt = (img as any).metadata?.enhanced_prompt;
                      if (enhancedPrompt) {
                        result[index] = enhancedPrompt;
                      }
                    });
                    return result;
                  })()}
                  defaultPrompt={defaultPrompt}
                  defaultNegativePrompt={defaultNegativePrompt}
                  onClearEnhancedPrompt={async (pairIndex) => {
                    try {
                      console.log('[ClearEnhancedPrompt-Batch] 🔵 Starting clear for pair index:', pairIndex);
                      console.log('[ClearEnhancedPrompt-Batch] Total shotGenerations:', shotGenerations.length);
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].id:', shotGenerations[0]?.id);
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].id:', shotGenerations[0]?.id); // shot_generations.id
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].generation_id:', shotGenerations[0]?.generation_id);
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].type:', shotGenerations[0]?.type);
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].generation?.type:', shotGenerations[0]?.generation?.type);
                      
                      // Convert pairIndex to generation ID using the same logic as pair prompts
                      // Filter out videos to match the display
                      // Uses isVideoAny which handles both flattened and nested data structures
                      const filteredGenerations = shotGenerations.filter(sg => !isVideoAny(sg));

                      console.log('[ClearEnhancedPrompt-Batch] Filtered generations count:', filteredGenerations.length);

                      const sortedGenerations = [...filteredGenerations]
                        .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));

                      console.log('[ClearEnhancedPrompt-Batch] Sorted generations count:', sortedGenerations.length);
                      sortedGenerations.forEach((sg, i) => {
                        console.log(`[ClearEnhancedPrompt-Batch] Sorted[${i}].id:`, sg.id?.substring(0, 8));
                        console.log(`[ClearEnhancedPrompt-Batch] Sorted[${i}].timeline_frame:`, sg.timeline_frame);
                        console.log(`[ClearEnhancedPrompt-Batch] Sorted[${i}].hasEnhancedPrompt:`, !!sg.metadata?.enhanced_prompt);
                      });

                      // Get the first item of the pair
                      const firstItem = sortedGenerations[pairIndex];
                      if (!firstItem) {
                        console.error('[ClearEnhancedPrompt-Batch] ❌ No generation found for pair index:', pairIndex);
                        return;
                      }

                      console.log('[ClearEnhancedPrompt-Batch] 🎯 Found generation at pairIndex:', pairIndex);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.id:', firstItem.id);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.id (short):', firstItem.id?.substring(0, 8));
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.generation_id:', firstItem.generation_id);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.id (short):', firstItem.id?.substring(0, 8)); // shot_generations.id
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.generation_id (short):', firstItem.generation_id?.substring(0, 8));
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.hasMetadata:', !!firstItem.metadata);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.hasEnhancedPrompt:', !!firstItem.metadata?.enhanced_prompt);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.enhancedPromptPreview:', firstItem.metadata?.enhanced_prompt?.substring(0, 50));
                      
                      // The clearEnhancedPrompt function expects shot_generation.id
                      // CRITICAL: firstItem.id IS the shot_generation.id (unique per entry)
                      const shotGenerationId = firstItem.id;
                      
                      console.log('[ClearEnhancedPrompt-Batch] 📞 Calling clearEnhancedPrompt with shot_generation.id:', shotGenerationId);
                      console.log('[ClearEnhancedPrompt-Batch] shot_generation.id (short):', shotGenerationId?.substring(0, 8));
                      await clearEnhancedPrompt(shotGenerationId);
                      console.log('[ClearEnhancedPrompt-Batch] ✅ clearEnhancedPrompt completed');
                    } catch (error) {
                      console.error('[ClearEnhancedPrompt-Batch] ❌ Error:', error);
                    }
                  }}
                  onDragStateChange={handleDragStateChange}
                  // Segment slots for video display in batch mode
                  segmentSlots={segmentSlots}
                  // Constituent image navigation support (from segment back to image)
                  pendingImageToOpen={pendingImageToOpen}
                  onClearPendingImageToOpen={() => {
                  setPendingImageToOpen(null);
                  // Also clear transition state when image lightbox opens
                  setTimeout(() => {
                    setIsLightboxTransitioning(false);
                    document.body.classList.remove('lightbox-transitioning');
                  }, 50);
                }}
                  // Lightbox transition support (keeps overlay visible during navigation)
                  onStartLightboxTransition={() => setIsLightboxTransitioning(true)}
                />

                {/* Helper for un-positioned generations - in batch mode, show after input images */}
                <div className="mt-4" style={{ minHeight: unpositionedGenerationsCount > 0 ? '40px' : '0px' }}>
                  {unpositionedGenerationsCount > 0 && (
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
                      <div className="text-sm text-muted-foreground">
                        {unpositionedGenerationsCount} unpositioned generation{unpositionedGenerationsCount !== 1 ? 's' : ''}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={onOpenUnpositionedPane}
                        className="text-xs"
                      >
                        View & Position
                      </Button>
                    </div>
                  )}
                </div>
                
                {/* Batch mode structure video (hidden in readOnly when no video exists) */}
                {selectedShotId && projectId && propOnStructureVideoChange && (propStructureVideoPath || !readOnly) && (
                  <>
                    <div className="mb-4 mt-6">
                      <SectionHeader title="Camera Guidance Video" theme="green" />
                    </div>
                    <BatchGuidanceVideo
                      shotId={selectedShotId}
                      projectId={projectId}
                      videoUrl={propStructureVideoPath}
                      videoMetadata={propStructureVideoMetadata}
                      treatment={propStructureVideoTreatment}
                      motionStrength={propStructureVideoMotionStrength}
                      structureType={propStructureVideoType}
                      imageCount={images.length}
                      timelineFramePositions={images.map((img, index) => index * batchVideoFrames)}
                      onVideoUploaded={(videoUrl, metadata, resourceId) => {
                        propOnStructureVideoChange(
                          videoUrl,
                          metadata,
                          propStructureVideoTreatment,
                          propStructureVideoMotionStrength,
                          propStructureVideoType,
                          resourceId
                        );
                      }}
                      onTreatmentChange={(treatment) => {
                        if (propStructureVideoPath && propStructureVideoMetadata) {
                          propOnStructureVideoChange(
                            propStructureVideoPath,
                            propStructureVideoMetadata,
                            treatment,
                            propStructureVideoMotionStrength,
                            propStructureVideoType
                          );
                        }
                      }}
                      onMotionStrengthChange={(strength) => {
                        if (propStructureVideoPath && propStructureVideoMetadata) {
                          propOnStructureVideoChange(
                            propStructureVideoPath,
                            propStructureVideoMetadata,
                            propStructureVideoTreatment,
                            strength,
                            propStructureVideoType
                          );
                        }
                      }}
                      onStructureTypeChange={(type) => {
                        // Always save structure type selection, even if no video uploaded yet
                        // When video is uploaded, it will use the pre-selected type
                        propOnStructureVideoChange(
                          propStructureVideoPath,
                          propStructureVideoMetadata,
                          propStructureVideoTreatment,
                          propStructureVideoMotionStrength,
                          type
                        );
                      }}
                      uni3cEndPercent={propUni3cEndPercent}
                      onUni3cEndPercentChange={propOnUni3cEndPercentChange}
                      readOnly={readOnly}
                      hideStructureSettings={true}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>

      {/* Persistent overlay during lightbox transitions - keeps screen dark while switching between lightboxes */}
      {/* z-index must be higher than MediaLightbox (z-[100000]) to cover its fade-out animation */}
      {isLightboxTransitioning && (
        <div
          className="fixed inset-0 z-[100001] bg-black/80 pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Segment Slot Lightbox - Unified segment editor (handles both video and no-video cases) */}
      {segmentSlotModeData && (
        <MediaLightbox
          media={segmentSlotModeData.segmentVideo ?? undefined}
          segmentSlotMode={segmentSlotModeData}
          onClose={() => setSegmentSlotLightboxIndex(null)}
          shotId={selectedShotId}
          readOnly={readOnly}
          fetchVariantsForSelf={true}
        />
      )}

      {/* DEPRECATED: SegmentSettingsModal - Replaced by MediaLightbox segment slot mode above
      <SegmentSettingsModal
        isOpen={false}
        onClose={() => {}}
        pairData={
          // In batch mode with multiple images, always use batchVideoFrames for task submission
          // This ensures the "Duration per pair" setting is respected
          (effectiveGenerationMode === 'batch' && images.length > 1 && segmentSettingsModalData.pairData)
            ? { ...segmentSettingsModalData.pairData, frames: batchVideoFrames }
            : segmentSettingsModalData.pairData
        }
        projectId={projectId || null}
        shotId={selectedShotId}
        generationId={selectedParentId || undefined}
        isRegeneration={(() => {
          // Check if this specific pair has a child generation (is regenerating existing)
          const pairIndex = segmentSettingsModalData.pairData?.index;
          if (pairIndex === undefined) return false;
          const pairSlot = segmentSlots.find(slot => slot.index === pairIndex);
          const hasChildForPair = pairSlot?.type === 'child';
          console.log('[PairModalDebug] Checking pair child:', { pairIndex, hasChildForPair, pairSlotType: pairSlot?.type });
          return hasChildForPair;
        })()}
        childGenerationId={(() => {
          // Get the active child generation ID for this slot (for creating variants)
          const pairIndex = segmentSettingsModalData.pairData?.index;
          if (pairIndex === undefined) return undefined;
          const pairSlot = segmentSlots.find(slot => slot.index === pairIndex);
          const childId = pairSlot?.type === 'child' ? pairSlot.child.id : undefined;
          console.log('[PairModalDebug] Active child for pair:', { pairIndex, childId: childId?.substring(0, 8) });
          return childId;
        })()}
        initialParams={(() => {
          const parentParams = selectedParent?.params as Record<string, any> | undefined;
          if (!parentParams) return undefined;

          // Recompute segment frame gaps from the CURRENT timeline, matching full generation behavior.
          // IMPORTANT: In batch mode, use uniform batchVideoFrames; in timeline mode, use actual timeline_frame differences
          const sortedTimelineImages = [...(shotGenerations || [])]
            .filter((sg: any) => sg?.timeline_frame != null && sg.timeline_frame >= 0)
            .sort((a: any, b: any) => a.timeline_frame - b.timeline_frame);

          const isBatchMode = effectiveGenerationMode === 'batch';
          const timelineFrameGaps: number[] = [];
          for (let i = 0; i < sortedTimelineImages.length - 1; i++) {
            // In batch mode: uniform batchVideoFrames for all pairs
            // In timeline mode: actual timeline_frame differences
            const gap = isBatchMode
              ? batchVideoFrames
              : (sortedTimelineImages[i + 1].timeline_frame as number) - (sortedTimelineImages[i].timeline_frame as number);
            if (Number.isFinite(gap) && gap >= 0) timelineFrameGaps.push(gap);
          }

          const existingOverlap =
            (parentParams.orchestrator_details?.frame_overlap_expanded?.[0] as number | undefined) ??
            (parentParams.frame_overlap_expanded?.[0] as number | undefined) ??
            10;
          const timelineOverlaps = timelineFrameGaps.map(() => existingOverlap);

          console.log('[SegmentSettingsModal] [TimelineGaps] Using current timeline gaps for regeneration params:', {
            shotId: selectedShotId?.substring(0, 8),
            mode: effectiveGenerationMode,
            isBatchMode,
            batchVideoFrames: isBatchMode ? batchVideoFrames : 'N/A',
            gapsCount: timelineFrameGaps.length,
            firstGaps: timelineFrameGaps.slice(0, 5),
            overlap: existingOverlap,
            // Helpful for debugging off-by-ones
            firstFrames: sortedTimelineImages.slice(0, 5).map((img: any) => img.timeline_frame),
          });

          // Inject structure_videos for segment regeneration if configured on the shot.
          // Parent generations can be missing this field (older runs / legacy format),
          // but regen needs it for multi-structure video support.
          const cleanedStructureVideos = (propStructureVideos || [])
            .filter(v => !!v?.path)
            .map(v => ({
              path: v.path,
              start_frame: v.start_frame,
              end_frame: v.end_frame,
              treatment: v.treatment,
              // Only include source range if explicitly set
              ...(v.source_start_frame !== undefined ? { source_start_frame: v.source_start_frame } : {}),
              ...(v.source_end_frame !== undefined && v.source_end_frame !== null ? { source_end_frame: v.source_end_frame } : {}),
            }));

          // Build UNIFIED structure_guidance config with videos INSIDE
          // The new format puts videos inside structure_guidance:
          // { target, videos: [...], strength, step_window/preprocessing, ... }
          let structureGuidance: Record<string, unknown> | undefined;
          if (cleanedStructureVideos.length > 0 && propStructureVideos?.[0]) {
            const firstVideo = propStructureVideos[0];
            const isUni3cTarget = firstVideo.structure_type === 'uni3c';
            
            structureGuidance = {
              target: isUni3cTarget ? 'uni3c' : 'vace',
              videos: cleanedStructureVideos, // Videos INSIDE structure_guidance
              strength: firstVideo.motion_strength ?? 1.0,
            };
            
            if (isUni3cTarget) {
              // Uni3C specific params
              structureGuidance.step_window = [
                firstVideo.uni3c_start_percent ?? 0,
                firstVideo.uni3c_end_percent ?? 1.0,
              ];
              structureGuidance.frame_policy = 'fit';
              structureGuidance.zero_empty_frames = true;
            } else {
              // VACE specific params
              const preprocessingMap: Record<string, string> = {
                'flow': 'flow',
                'canny': 'canny',
                'depth': 'depth',
                'raw': 'none',
              };
              structureGuidance.preprocessing = preprocessingMap[firstVideo.structure_type ?? 'flow'] ?? 'flow';
            }
          }

          if (structureGuidance) {
            console.log('[SegmentSettingsModal] [MultiStructureDebug] Injecting UNIFIED structure_guidance:', {
              shotId: selectedShotId?.substring(0, 8),
              target: structureGuidance.target,
              videosCount: (structureGuidance.videos as unknown[]).length,
              strength: structureGuidance.strength,
            });
          }

          // Load user_overrides from the start image's shot_generation.metadata so user edits persist
          const startImageId = segmentSettingsModalData.pairData?.startImage?.id;
          const startShotGen = startImageId ? shotGenerations.find(sg => sg.id === startImageId) : undefined;
          // Use migration utility to read segment overrides
          const segmentOverrides = readSegmentOverrides(startShotGen?.metadata as Record<string, any> | null);
          const userOverrides = (startShotGen?.metadata as any)?.user_overrides as Record<string, any> | undefined;
          const pairPromptVal = segmentOverrides.prompt;
          // enhanced_prompt is separate (AI-generated, not user settings)
          const enhancedPromptVal = (startShotGen?.metadata as any)?.enhanced_prompt;

          // Only log when we have actual pair data (avoid noise from closed modal)
          if (segmentSettingsModalData.pairData?.index !== undefined) {
            const pairIdx = segmentSettingsModalData.pairData?.index;
            const pp = pairPromptVal ? `"${pairPromptVal.substring(0, 30)}..."` : 'null';
            const ep = enhancedPromptVal ? 'yes' : 'null';
            const uo = userOverrides ? Object.keys(userOverrides).join(',') : 'null';
            const indexMap = sortedTimelineImages.map((sg: any, i: number) => `[${i}]→${sg.id?.substring(0, 8)}`).join(' ');
            
            console.log(`[PerPairData] 📥 FORM LOAD (SegmentSettingsModal) | pair=${pairIdx} → ${startImageId?.substring(0, 8)} | pair_prompt=${pp} | enhanced=${ep} | overrides=${uo} | default=${defaultPrompt ? `"${defaultPrompt.substring(0, 20)}..."` : 'null'}`);
            console.log(`[PerPairData]   INDEX MAP (SegmentSettingsModal): ${indexMap}`);
          }

          // CLEANUP: Remove legacy structure params from orchestrator_details before injecting new unified format
          const cleanedOrchestratorDetails = { ...(parentParams.orchestrator_details || {}) };
          const legacyStructureParams = [
            'structure_type', 'structure_videos', 'structure_video_path', 'structure_video_treatment',
            'structure_video_motion_strength', 'structure_video_type', 'structure_canny_intensity',
            'structure_depth_contrast', 'structure_guidance_video_url', 'structure_guidance_frame_offset',
            'use_uni3c', 'uni3c_guide_video', 'uni3c_strength', 'uni3c_start_percent', 
            'uni3c_end_percent', 'uni3c_guidance_frame_offset',
          ];
          for (const param of legacyStructureParams) {
            delete cleanedOrchestratorDetails[param];
          }
          
          return {
            ...parentParams,
            // UNIFIED FORMAT: Include structure_guidance at top level (contains videos inside)
            ...(structureGuidance ? { structure_guidance: structureGuidance } : {}),
            orchestrator_details: {
              ...cleanedOrchestratorDetails,
              ...(timelineFrameGaps.length > 0 ? {
                // These MUST match the current timeline spacing for correct segment positioning.
                segment_frames_expanded: timelineFrameGaps,
                frame_overlap_expanded: timelineOverlaps,
                num_new_segments_to_generate: timelineFrameGaps.length,
              } : {}),
              // UNIFIED FORMAT: Only inject structure_guidance (videos are inside it)
              // NO separate structure_videos array
              ...(structureGuidance ? { structure_guidance: structureGuidance } : {}),
            },
            // Include user_overrides so useSegmentSettings can apply them on top
            user_overrides: userOverrides,
          };
        })()}
        projectResolution={resolvedProjectResolution}
        pairPrompt={(() => {
          if (!segmentSettingsModalData.pairData?.startImage?.id) return "";
          const shotGen = shotGenerations.find(sg => sg.id === segmentSettingsModalData.pairData.startImage.id);
          const overrides = readSegmentOverrides(shotGen?.metadata as Record<string, any> | null);
          return overrides.prompt || "";
        })()}
        pairNegativePrompt={(() => {
          if (!segmentSettingsModalData.pairData?.startImage?.id) return "";
          const shotGen = shotGenerations.find(sg => sg.id === segmentSettingsModalData.pairData.startImage.id);
          const overrides = readSegmentOverrides(shotGen?.metadata as Record<string, any> | null);
          return overrides.negativePrompt || "";
        })()}
        enhancedPrompt={(() => {
          if (!segmentSettingsModalData.pairData?.startImage?.id) return "";
          const shotGen = shotGenerations.find(sg => sg.id === segmentSettingsModalData.pairData.startImage.id);
          return shotGen?.metadata?.enhanced_prompt || "";
        })()}
        defaultPrompt={defaultPrompt}
        defaultNegativePrompt={defaultNegativePrompt}
        onNavigatePrevious={(() => {
          if (!segmentSettingsModalData.pairData) return undefined;
          const currentIndex = segmentSettingsModalData.pairData.index;
          if (currentIndex <= 0) return undefined;

          // Use pairDataByIndex for navigation (single source of truth)
          return () => {
            const prevPairData = pairDataByIndex.get(currentIndex - 1);
            if (prevPairData) {
              setSegmentSettingsModalData({ isOpen: true, pairData: prevPairData });
            }
          };
        })()}
        onNavigateNext={(() => {
          if (!segmentSettingsModalData.pairData) return undefined;
          const currentIndex = segmentSettingsModalData.pairData.index;
          const nextPairData = pairDataByIndex.get(currentIndex + 1);
          if (!nextPairData) return undefined;

          // Use pairDataByIndex for navigation (single source of truth)
          return () => {
            setSegmentSettingsModalData({ isOpen: true, pairData: nextPairData });
          };
        })()}
        hasPrevious={(() => {
          if (!segmentSettingsModalData.pairData) return false;
          return pairDataByIndex.has(segmentSettingsModalData.pairData.index - 1);
        })()}
        hasNext={(() => {
          if (!segmentSettingsModalData.pairData) return false;
          return pairDataByIndex.has(segmentSettingsModalData.pairData.index + 1);
        })()}
        onFrameCountChange={(frameCount: number) => {
          console.log('[ModalFrameCount] onFrameCountChange:', frameCount, 'mode:', effectiveGenerationMode);

          // Always update local modal state immediately for responsive UI
          setSegmentSettingsModalData(prev => ({
            ...prev,
            pairData: prev.pairData ? {
              ...prev.pairData,
              frames: frameCount,
              endFrame: (prev.pairData.startFrame ?? 0) + frameCount,
            } : null,
          }));

          // In batch mode, don't update timeline - batch mode uses uniform batchVideoFrames
          if (effectiveGenerationMode === 'batch') {
            console.log('[ModalFrameCount] Skipping timeline update in batch mode');
            return;
          }

          // Timeline mode: update individual pair frame count
          const startImageId = segmentSettingsModalData.pairData?.startImage?.id;
          if (!startImageId) {
            console.warn('[ModalFrameCount] No startImageId available');
            return;
          }

          // Debounce and call the unified handler
          if (frameCountDebounceRef.current) {
            clearTimeout(frameCountDebounceRef.current);
          }

          frameCountDebounceRef.current = setTimeout(() => {
            updatePairFrameCount(startImageId, frameCount);
          }, 150);
        }}
        onGenerateStarted={(pairShotGenerationId) => {
          // Optimistic UI update - show pending state immediately before task is detected
          addOptimisticPending(pairShotGenerationId);
        }}
        structureVideoType={(() => {
          // Determine if this segment has structure video coverage
          if (!propStructureVideos || propStructureVideos.length === 0) return null;

          const pairStartFrame = segmentSettingsModalData.pairData?.startFrame ?? 0;
          const pairEndFrame = segmentSettingsModalData.pairData?.endFrame ?? 0;

          // In batch mode, the structure video covers all segments
          if (effectiveGenerationMode === 'batch') {
            return propStructureVideos[0].structure_type ?? 'flow';
          }

          // In timeline mode, find a structure video that overlaps with this segment
          const coveringVideo = propStructureVideos.find(video => {
            const videoStart = video.start_frame ?? 0;
            const videoEnd = video.end_frame ?? Infinity;
            // Check for overlap: segment overlaps with video if segmentEnd > videoStart AND segmentStart < videoEnd
            return pairEndFrame > videoStart && pairStartFrame < videoEnd;
          });

          return coveringVideo?.structure_type ?? null;
        })()}
        structureVideoDefaults={(() => {
          // Get structure video defaults for this segment
          if (!propStructureVideos || propStructureVideos.length === 0) return undefined;

          const pairStartFrame = segmentSettingsModalData.pairData?.startFrame ?? 0;
          const pairEndFrame = segmentSettingsModalData.pairData?.endFrame ?? 0;

          let coveringVideo = propStructureVideos[0]; // Default to first video

          // In timeline mode, find the specific video that covers this segment
          if (effectiveGenerationMode !== 'batch') {
            const found = propStructureVideos.find(video => {
              const videoStart = video.start_frame ?? 0;
              const videoEnd = video.end_frame ?? Infinity;
              return pairEndFrame > videoStart && pairStartFrame < videoEnd;
            });
            if (!found) return undefined;
            coveringVideo = found;
          }

          return {
            motionStrength: coveringVideo.motion_strength ?? 1.2,
            treatment: coveringVideo.treatment ?? 'adjust',
            uni3cEndPercent: coveringVideo.uni3c_end_percent ?? 0.1,
          };
        })()}
        structureVideoUrl={(() => {
          if (!propStructureVideos || propStructureVideos.length === 0) return undefined;

          const pairStartFrame = segmentSettingsModalData.pairData?.startFrame ?? 0;
          const pairEndFrame = segmentSettingsModalData.pairData?.endFrame ?? 0;

          // In batch mode, use first video
          if (effectiveGenerationMode === 'batch') {
            return propStructureVideos[0].path;
          }

          // In timeline mode, find covering video
          const found = propStructureVideos.find(video => {
            const videoStart = video.start_frame ?? 0;
            const videoEnd = video.end_frame ?? Infinity;
            return pairEndFrame > videoStart && pairStartFrame < videoEnd;
          });
          return found?.path;
        })()}
        structureVideoFrameRange={(() => {
          if (!propStructureVideos || propStructureVideos.length === 0) return undefined;

          const pairStartFrame = segmentSettingsModalData.pairData?.startFrame ?? 0;
          const pairEndFrame = segmentSettingsModalData.pairData?.endFrame ?? 0;

          let coveringVideo = propStructureVideos[0];

          if (effectiveGenerationMode !== 'batch') {
            const found = propStructureVideos.find(video => {
              const videoStart = video.start_frame ?? 0;
              const videoEnd = video.end_frame ?? Infinity;
              return pairEndFrame > videoStart && pairStartFrame < videoEnd;
            });
            if (!found) return undefined;
            coveringVideo = found;
          }

          const videoTotalFrames = coveringVideo.metadata?.total_frames ?? 60;
          const videoFps = coveringVideo.metadata?.frame_rate ?? 24;

          return {
            segmentStart: pairStartFrame,
            segmentEnd: pairEndFrame,
            videoTotalFrames,
            videoFps,
          };
        })()}
      />
      */}

      {/* Preview Together Dialog */}
      <Dialog open={isPreviewTogetherOpen} onOpenChange={setIsPreviewTogetherOpen}>
        <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Preview Segments</DialogTitle>
          </DialogHeader>
          <div className="p-4 overflow-hidden">
            {previewableSegments.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                No segments available to preview
              </div>
            ) : (() => {
              const safeIndex = Math.min(currentPreviewIndex, previewableSegments.length - 1);
              const currentSegment = previewableSegments[safeIndex];
              
              console.log('[PreviewCrossfade] Rendering preview:', {
                safeIndex,
                currentPreviewIndex,
                previewableSegmentsLength: previewableSegments.length,
                hasSegment: !!currentSegment,
                hasVideo: currentSegment?.hasVideo,
                startImageUrl: currentSegment?.startImageUrl?.substring(0, 50),
                endImageUrl: currentSegment?.endImageUrl?.substring(0, 50),
                crossfadeProgress,
              });
              
              // Calculate aspect ratio for consistent container sizing
              const previewAspectStyle = (() => {
                if (!projectAspectRatio) return { aspectRatio: '16/9' };
                const [w, h] = projectAspectRatio.split(':').map(Number);
                if (w && h) return { aspectRatio: `${w}/${h}` };
                return { aspectRatio: '16/9' };
              })();

              return (
                <div className="flex flex-col gap-4 overflow-hidden">
                  {/* Video container - centered, fixed height with aspect ratio determining width */}
                  <div className="flex justify-center w-full">
                    <div
                      className="relative bg-black rounded-lg overflow-hidden max-w-full h-[60vh]"
                      style={previewAspectStyle}
                    >

                    {/* Loading skeleton - shown while video is loading */}
                    {currentSegment.hasVideo && isPreviewVideoLoading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Skeleton className="w-full h-full bg-muted/20" />
                      </div>
                    )}
                    {/* Dual video elements for seamless cuts */}
                    {currentSegment.hasVideo && (
                      <>
                        {/* Video A - on top when activeVideoSlot === 'A', behind when 'B' */}
                        {/* Using z-index instead of invisible so the outgoing video acts as backdrop until incoming renders */}
                        <video
                          ref={previewVideoRef}
                          className={`absolute inset-0 w-full h-full object-contain cursor-pointer ${activeVideoSlot === 'A' ? 'z-10' : 'z-0 pointer-events-none'}`}
                          playsInline
                          muted={activeVideoSlot !== 'A'}
                          onClick={() => {
                            const video = activeVideoSlot === 'A' ? previewVideoRef.current : previewVideoRefB.current;
                            if (video) {
                              if (video.paused) {
                                video.play();
                              } else {
                                video.pause();
                              }
                            }
                          }}
                          onPlay={() => {
                            if (activeVideoSlot !== 'A') return;
                            setPreviewIsPlaying(true);
                            const audio = previewAudioRef.current;
                            if (audio && isAudioEnabled && propAudioUrl) {
                              syncAudioToVideo();
                            }
                          }}
                          onPause={() => {
                            if (activeVideoSlot !== 'A') return;
                            setPreviewIsPlaying(false);
                            const audio = previewAudioRef.current;
                            if (audio) {
                              audio.pause();
                            }
                          }}
                          onTimeUpdate={() => {
                            if (activeVideoSlot !== 'A') return;
                            const video = previewVideoRef.current;
                            if (video) {
                              const scaledTime = video.currentTime / (video.playbackRate || 1);
                              setPreviewCurrentTime(scaledTime);
                            }
                          }}
                          onSeeked={() => {
                            if (activeVideoSlot === 'A') syncAudioToVideo();
                          }}
                          onLoadedMetadata={() => {
                            if (activeVideoSlot !== 'A') return;
                            const video = previewVideoRef.current;
                            if (video) {
                              const actualDuration = video.duration;
                              const expectedDuration = currentSegment.durationFromFrames || actualDuration;
                              if (expectedDuration > 0 && actualDuration > 0) {
                                const playbackRate = actualDuration / expectedDuration;
                                video.playbackRate = Math.max(0.25, Math.min(4, playbackRate));
                              }
                              setPreviewDuration(expectedDuration);
                              setPreviewCurrentTime(0);
                              setIsPreviewVideoLoading(false);
                              syncAudioToVideo();
                              // Retry play now that video is ready - initial play() in effect may have failed
                              video.play().catch(() => {});
                            }
                          }}
                          onEnded={() => {
                            if (activeVideoSlot !== 'A') return;
                            const nextIndex = (safeIndex + 1) % previewableSegments.length;
                            const nextSegment = previewableSegments[nextIndex];
                            if (nextSegment?.hasVideo && preloadedIndex === nextIndex) {
                              setActiveVideoSlot('B');
                              setPreloadedIndex(null);
                              previewVideoRefB.current?.play().catch(() => {});
                              console.log('[SeamlessCut] Swapping A -> B');
                            }
                            setCurrentPreviewIndex(nextIndex);
                          }}
                        />
                        {/* Video B - on top when activeVideoSlot === 'B', behind when 'A' */}
                        {/* Using z-index instead of invisible so the outgoing video acts as backdrop until incoming renders */}
                        <video
                          ref={previewVideoRefB}
                          className={`absolute inset-0 w-full h-full object-contain cursor-pointer ${activeVideoSlot === 'B' ? 'z-10' : 'z-0 pointer-events-none'}`}
                          playsInline
                          muted={activeVideoSlot !== 'B'}
                          onClick={() => {
                            const video = activeVideoSlot === 'A' ? previewVideoRef.current : previewVideoRefB.current;
                            if (video) {
                              if (video.paused) {
                                video.play();
                              } else {
                                video.pause();
                              }
                            }
                          }}
                          onPlay={() => {
                            if (activeVideoSlot !== 'B') return;
                            setPreviewIsPlaying(true);
                            const audio = previewAudioRef.current;
                            if (audio && isAudioEnabled && propAudioUrl) {
                              syncAudioToVideo();
                            }
                          }}
                          onPause={() => {
                            if (activeVideoSlot !== 'B') return;
                            setPreviewIsPlaying(false);
                            const audio = previewAudioRef.current;
                            if (audio) {
                              audio.pause();
                            }
                          }}
                          onTimeUpdate={() => {
                            if (activeVideoSlot !== 'B') return;
                            const video = previewVideoRefB.current;
                            if (video) {
                              const scaledTime = video.currentTime / (video.playbackRate || 1);
                              setPreviewCurrentTime(scaledTime);
                            }
                          }}
                          onSeeked={() => {
                            if (activeVideoSlot === 'B') syncAudioToVideo();
                          }}
                          onLoadedMetadata={() => {
                            if (activeVideoSlot !== 'B') return;
                            const video = previewVideoRefB.current;
                            if (video) {
                              const actualDuration = video.duration;
                              const expectedDuration = currentSegment.durationFromFrames || actualDuration;
                              if (expectedDuration > 0 && actualDuration > 0) {
                                const playbackRate = actualDuration / expectedDuration;
                                video.playbackRate = Math.max(0.25, Math.min(4, playbackRate));
                              }
                              setPreviewDuration(expectedDuration);
                              setPreviewCurrentTime(0);
                              setIsPreviewVideoLoading(false);
                              syncAudioToVideo();
                              // Retry play now that video is ready - initial play() in effect may have failed
                              video.play().catch(() => {});
                            }
                          }}
                          onEnded={() => {
                            if (activeVideoSlot !== 'B') return;
                            const nextIndex = (safeIndex + 1) % previewableSegments.length;
                            const nextSegment = previewableSegments[nextIndex];
                            if (nextSegment?.hasVideo && preloadedIndex === nextIndex) {
                              setActiveVideoSlot('A');
                              setPreloadedIndex(null);
                              previewVideoRef.current?.play().catch(() => {});
                              console.log('[SeamlessCut] Swapping B -> A');
                            }
                            setCurrentPreviewIndex(nextIndex);
                          }}
                        />
                      </>
                    )}
                    {!currentSegment.hasVideo ? (
                      // Image crossfade segment
                      <div
                        className="absolute inset-0 cursor-pointer"
                        onClick={() => {
                          // Toggle play/pause for crossfade
                          setPreviewIsPlaying(prev => {
                            const newPlaying = !prev;
                            const audio = previewAudioRef.current;
                            if (audio) {
                              if (newPlaying) {
                                audio.play().catch(() => {});
                              } else {
                                audio.pause();
                              }
                            }
                            return newPlaying;
                          });
                        }}
                      >
                        {/* Start image - fades out */}
                        {currentSegment.startImageUrl && (
                          <img
                            src={currentSegment.startImageUrl}
                            alt="Start"
                            className="absolute inset-0 w-full h-full object-contain"
                            style={{ 
                              opacity: 1 - crossfadeProgress,
                              transition: 'opacity 100ms ease-out'
                            }}
                          />
                        )}
                        {/* End image - fades in */}
                        {currentSegment.endImageUrl && (
                          <img
                            src={currentSegment.endImageUrl}
                            alt="End"
                            className="absolute inset-0 w-full h-full object-contain"
                            style={{ 
                              opacity: crossfadeProgress,
                              transition: 'opacity 100ms ease-out'
                            }}
                          />
                        )}
                        {/* "No video" indicator */}
                        <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/50 text-white text-xs">
                          Crossfade (no video)
                        </div>
                        {/* Play/pause indicator */}
                        {!previewIsPlaying && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-black/50 rounded-full p-4">
                              <Play className="h-8 w-8 text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Hidden audio element for background audio sync */}
                    {propAudioUrl && (
                      <audio
                        ref={previewAudioRef}
                        src={propAudioUrl}
                        preload="auto"
                        style={{ display: 'none' }}
                      />
                    )}
                    
                    {/* Navigation arrows */}
                    {previewableSegments.length > 1 && (
                      <>
                        <Button
                          variant="secondary"
                          size="lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Reset dual-video state on manual navigation
                            setActiveVideoSlot('A');
                            setPreloadedIndex(null);
                            setCurrentPreviewIndex(prev =>
                              prev > 0 ? prev - 1 : previewableSegments.length - 1
                            );
                          }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10"
                        >
                          <ChevronLeft className="h-6 w-6" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Reset dual-video state on manual navigation
                            setActiveVideoSlot('A');
                            setPreloadedIndex(null);
                            setCurrentPreviewIndex(prev =>
                              (prev + 1) % previewableSegments.length
                            );
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10"
                        >
                          <ChevronRight className="h-6 w-6" />
                        </Button>
                      </>
                    )}
                    
                    {/* Controls overlay - z-20 to be above videos (z-10) */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-8 z-20">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (currentSegment.hasVideo) {
                              const video = previewVideoRef.current;
                              if (video) {
                                if (video.paused) {
                                  video.play();
                                } else {
                                  video.pause();
                                }
                              }
                            } else {
                              // Toggle crossfade play/pause
                              setPreviewIsPlaying(prev => {
                                const newPlaying = !prev;
                                const audio = previewAudioRef.current;
                                if (audio) {
                                  if (newPlaying) {
                                    audio.play().catch(() => {});
                                  } else {
                                    audio.pause();
                                  }
                                }
                                return newPlaying;
                              });
                            }
                          }}
                          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/30 transition-colors"
                        >
                          {previewIsPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                        </button>
                        
                        {/* Audio toggle */}
                        {propAudioUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newEnabled = !isAudioEnabled;
                              setIsAudioEnabled(newEnabled);
                              const audio = previewAudioRef.current;
                              if (audio) {
                                if (newEnabled && previewIsPlaying) {
                                  if (currentSegment.hasVideo) {
                                    syncAudioToVideo();
                                  } else {
                                    const globalTime = getGlobalTime(safeIndex, previewCurrentTime);
                                    audio.currentTime = globalTime;
                                    audio.play().catch(() => {});
                                  }
                                } else {
                                  audio.pause();
                                }
                              }
                            }}
                            className={`w-10 h-10 rounded-full backdrop-blur-sm text-white flex items-center justify-center transition-colors ${
                              isAudioEnabled ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 hover:bg-white/20'
                            }`}
                            title={isAudioEnabled ? 'Mute audio' : 'Unmute audio'}
                          >
                            {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                          </button>
                        )}
                        
                        <span className="text-white text-sm tabular-nums min-w-[85px]">
                          {Math.floor(previewCurrentTime / 60)}:{Math.floor(previewCurrentTime % 60).toString().padStart(2, '0')} / {Math.floor(previewDuration / 60)}:{Math.floor(previewDuration % 60).toString().padStart(2, '0')}
                        </span>
                        
                        <div className="flex-1 relative h-4 flex items-center">
                          <div className="absolute inset-x-0 h-1.5 bg-white/30 rounded-full" />
                          <div 
                            className="absolute left-0 h-1.5 bg-white rounded-full"
                            style={{ width: `${(previewCurrentTime / (previewDuration || 1)) * 100}%` }}
                          />
                          <div 
                            className="absolute w-3 h-3 bg-white rounded-full shadow-md cursor-pointer"
                            style={{ 
                              left: `calc(${(previewCurrentTime / (previewDuration || 1)) * 100}% - 6px)`,
                            }}
                          />
                          <input
                            type="range"
                            min={0}
                            max={previewDuration || 100}
                            step={0.1}
                            value={previewCurrentTime}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (currentSegment.hasVideo) {
                                const video = previewVideoRef.current;
                                if (video) {
                                  const newTime = parseFloat(e.target.value);
                                  video.currentTime = newTime;
                                  setPreviewCurrentTime(newTime);
                                }
                              }
                              // For crossfade, scrubbing is disabled (would need more complex state)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>

                  {/* Segment thumbnail strip - horizontal scroll, auto-scrolls to current */}
                  <div
                    ref={previewThumbnailsRef}
                    className="overflow-x-auto w-full no-scrollbar"
                  >
                    <div className="flex gap-2 p-3">
                      {previewableSegments.map((segment, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`relative flex-shrink-0 transition-all duration-200 rounded-lg overflow-hidden ${
                            idx === safeIndex
                              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                          style={{ width: 64, height: 36 }}
                          onClick={() => {
                            // Reset dual-video state on manual navigation
                            setActiveVideoSlot('A');
                            setPreloadedIndex(null);
                            setCurrentPreviewIndex(idx);
                          }}
                          aria-label={`Go to segment ${segment.index + 1}`}
                        >
                          <img
                            src={segment.thumbUrl || segment.startImageUrl || ''}
                            alt={`Segment ${segment.index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {!segment.hasVideo && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <span className="text-[8px] text-white">IMG</span>
                            </div>
                          )}
                          <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                            {segment.index + 1}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// NOTE: Removed custom arePropsEqual comparison (was ~90 lines of manual prop checking).
// The custom comparison was error-prone (missed imageUrl, causing variant updates to not render).
// Default shallow comparison is safer - any new preloadedImages reference triggers re-render.
// If perf becomes an issue, consider useMemo in parent to stabilize array references.

export default React.memo(ShotImagesEditor);
