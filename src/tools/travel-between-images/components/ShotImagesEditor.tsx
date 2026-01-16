import React, { useState, useCallback, useEffect, useRef } from "react";
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
import SegmentSettingsModal from "./Timeline/SegmentSettingsModal";
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
  const [previewIsPlaying, setPreviewIsPlaying] = useState(true);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  
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
  
  // Preview video effects - handles video segments
  React.useEffect(() => {
    if (isPreviewTogetherOpen && previewVideoRef.current) {
      previewVideoRef.current.load();
      previewVideoRef.current.play().catch(() => {});
    }
  }, [currentPreviewIndex, isPreviewTogetherOpen]);
  
  // Auto-start playback when dialog opens OR when segment changes (for both video and image segments)
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
    }
  }, [isPreviewTogetherOpen]);
  
  // Note: Preview-related effects are defined after previewableSegments memo (see below)
  
  // Note: Pair prompts are retrieved from the enhanced shot positions hook below
  
  const [segmentSettingsModalData, setSegmentSettingsModalData] = useState<{
    isOpen: boolean;
    pairData: { 
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
    } | null;
  }>({
    isOpen: false,
    pairData: null,
  });


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
    const FPS = 24;
    
    // Build segments from ALL image pairs, enriching with video data from slots if available
    const segments = [];
    for (let pairIndex = 0; pairIndex < numPairs; pairIndex++) {
      // Get start and end images for this pair
      const startImage = sortedImages[pairIndex];
      const endImage = sortedImages[pairIndex + 1];
      
      // Calculate duration from frame positions
      const startFrame = startImage?.timeline_frame ?? 0;
      const endFrame = endImage?.timeline_frame ?? startFrame;
      const frameCount = endFrame - startFrame;
      const durationFromFrames = frameCount / FPS;
      
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
  }, [segmentSlots, shotGenerations]);
  
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
        setCurrentPreviewIndex(prev => 
          prev > 0 ? prev - 1 : previewableSegments.length - 1
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
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
                      <SectionHeader title="Guidance Video" theme="green" />
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
                onTimelineChange={async () => {
                  await loadPositions({ silent: true });
                }}
                // Pass shared hook data to prevent creating duplicate instances
                // BUT: Only pass if not using preloaded images (to avoid filtering conflict)
                hookData={preloadedImages ? undefined : hookData}
                onDragStateChange={handleDragStateChange}
                onPairClick={(pairIndex, pairData) => {
                  setSegmentSettingsModalData({
                    isOpen: true,
                    pairData,
                  });
                }}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
                onClearEnhancedPrompt={async (pairIndex) => {
                  console.log('[ClearEnhancedPrompt-Timeline] 🔵 Starting clear for pair index:', pairIndex);
                  console.log('[ClearEnhancedPrompt-Timeline] Total shotGenerations:', shotGenerations.length);
                  if (shotGenerations.length > 0) {
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0] keys:', Object.keys(shotGenerations[0]));
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].id:', shotGenerations[0].id); // shot_generations.id
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].generation_id:', shotGenerations[0].generation_id);
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].type:', shotGenerations[0].type);
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].location:', shotGenerations[0].location);
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].generation?.type:', shotGenerations[0].generation?.type);
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].generation?.location:', shotGenerations[0].generation?.location);
                  }
                  try {
                    // Convert pairIndex to generation ID using the same logic as pair prompts
                    // Filter out videos to match the timeline display
                    // Uses isVideoAny which handles both flattened and nested data structures
                    const filteredGenerations = shotGenerations.filter((sg, idx) => {
                      const video = isVideoAny(sg);
                      
                      if (idx === 0) {
                        console.log('[ClearEnhancedPrompt-Timeline] Filter [0] isVideo:', video);
                        console.log('[ClearEnhancedPrompt-Timeline] Filter [0] returning:', !video);
                      }
                      
                      return !video;
                    });
                    console.log('[ClearEnhancedPrompt-Timeline] Filtered generations count:', filteredGenerations.length);

                    const sortedGenerations = [...filteredGenerations]
                      .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));
                    console.log('[ClearEnhancedPrompt-Timeline] Sorted generations count:', sortedGenerations.length);

                    // Get the first item of the pair
                    const firstItem = sortedGenerations[pairIndex];
                    if (!firstItem) {
                      console.error('[ClearEnhancedPrompt-Timeline] ❌ No generation found for pair index:', pairIndex);
                      return;
                    }

                    console.log('[ClearEnhancedPrompt-Timeline] 🎯 Found generation at pairIndex:', pairIndex);
                    console.log('[ClearEnhancedPrompt-Timeline] firstItem.id:', firstItem.id); // shot_generations.id
                    console.log('[ClearEnhancedPrompt-Timeline] firstItem.generation_id:', firstItem.generation_id);
                    console.log('[ClearEnhancedPrompt-Timeline] firstItem.hasMetadata:', !!firstItem.metadata);
                    console.log('[ClearEnhancedPrompt-Timeline] firstItem.hasEnhancedPrompt:', !!firstItem.metadata?.enhanced_prompt);
                    
                    // firstItem.id IS the shot_generations.id (unique per entry)
                    const idToUse = firstItem.id;
                    console.log('[ClearEnhancedPrompt-Timeline] 📞 Calling clearEnhancedPrompt with id:', idToUse);
                    
                    await clearEnhancedPrompt(idToUse);
                  } catch (error) {
                    console.error('[ClearEnhancedPrompt-Timeline] ❌ Error:', error);
                  }
                }}
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
                onCreateShot={onCreateShot ? async (shotName: string, files: File[]) => {
                  const shotId = await onCreateShot(shotName);
                  return { shotId, shotName };
                } : undefined}
                // Single image duration endpoint
                singleImageEndFrame={singleImageEndFrame}
                onSingleImageEndFrameChange={handleSingleImageEndFrameChange}
                // Frame limit (77 with smooth continuations, 81 otherwise)
                maxFrameLimit={maxFrameLimit}
                // Shared output selection (syncs FinalVideoSection with SegmentOutputStrip)
                selectedOutputId={selectedOutputId}
                onSelectedOutputChange={onSelectedOutputChange}
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
                  onMagicEdit={(imageUrl, prompt, numImages) => {
                    // TODO: Wire through real magic-edit handler later.
                    console.log("Magic Edit:", { imageUrl, prompt, numImages });
                  }}
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
                  // Pair prompt props
                  onPairClick={(pairIndex, pairData) => {
                    console.log('[PairIndicatorDebug] ShotImagesEditor onPairClick called', { pairIndex, pairData });
                    setSegmentSettingsModalData({
                      isOpen: true,
                      pairData,
                    });
                  }}
                  pairPrompts={(() => {
                    // Convert pairPrompts from useEnhancedShotPositions to the format expected by ShotImageManager
                    const result: Record<number, { prompt: string; negativePrompt: string }> = {};
                    shotGenerations.forEach((sg, index) => {
                      const prompt = sg.metadata?.pair_prompt || "";
                      const negativePrompt = sg.metadata?.pair_negative_prompt || "";
                      if (prompt || negativePrompt) {
                        result[index] = { prompt, negativePrompt };
                      }
                    });
                    console.log('[PairIndicatorDebug] ShotImagesEditor pairPrompts:', {
                      shotGenerationsCount: shotGenerations.length,
                      resultKeys: Object.keys(result),
                      result
                    });
                    return result;
                  })()}
                  enhancedPrompts={(() => {
                    // Convert enhanced prompts to index-based format
                    const result: Record<number, string> = {};
                    shotGenerations.forEach((sg, index) => {
                      const enhancedPrompt = sg.metadata?.enhanced_prompt;
                      if (enhancedPrompt) {
                        result[index] = enhancedPrompt;
                      }
                    });
                    console.log('[PairIndicatorDebug] ShotImagesEditor enhancedPrompts:', {
                      shotGenerationsCount: shotGenerations.length,
                      resultKeys: Object.keys(result),
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
                      <SectionHeader title="Guidance Video" theme="green" />
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

      {/* Segment Settings Modal - Uses SegmentRegenerateControls form */}
      <SegmentSettingsModal
        isOpen={segmentSettingsModalData.isOpen}
        onClose={() => setSegmentSettingsModalData({ isOpen: false, pairData: null })}
        pairData={segmentSettingsModalData.pairData}
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
        initialParams={(() => {
          const parentParams = selectedParent?.params as Record<string, any> | undefined;
          if (!parentParams) return undefined;

          // Recompute segment frame gaps from the CURRENT timeline, matching full generation behavior.
          // In timeline mode, full generation sets:
          // - segment_frames = diffs between successive timeline_frame positions
          // - frame_overlap = 10 for each segment (today; may be configurable later)
          const sortedTimelineImages = [...(shotGenerations || [])]
            .filter((sg: any) => sg?.timeline_frame != null && sg.timeline_frame >= 0)
            .sort((a: any, b: any) => a.timeline_frame - b.timeline_frame);

          const timelineFrameGaps: number[] = [];
          for (let i = 0; i < sortedTimelineImages.length - 1; i++) {
            const gap = (sortedTimelineImages[i + 1].timeline_frame as number) - (sortedTimelineImages[i].timeline_frame as number);
            if (Number.isFinite(gap) && gap >= 0) timelineFrameGaps.push(gap);
          }

          const existingOverlap =
            (parentParams.orchestrator_details?.frame_overlap_expanded?.[0] as number | undefined) ??
            (parentParams.frame_overlap_expanded?.[0] as number | undefined) ??
            10;
          const timelineOverlaps = timelineFrameGaps.map(() => existingOverlap);

          console.log('[SegmentSettingsModal] [TimelineGaps] Using current timeline gaps for regeneration params:', {
            shotId: selectedShotId?.substring(0, 8),
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

          // Build structure_guidance config (NEW unified format) from the first video's settings
          // This is needed for individual segment generation to know target (vace/uni3c) and strength
          let structureGuidance: Record<string, unknown> | undefined;
          if (cleanedStructureVideos.length > 0 && propStructureVideos?.[0]) {
            const firstVideo = propStructureVideos[0];
            const isUni3cTarget = firstVideo.structure_type === 'uni3c';
            
            structureGuidance = {
              target: isUni3cTarget ? 'uni3c' : 'vace',
            };
            
            if (isUni3cTarget) {
              // Uni3C specific params
              structureGuidance.strength = firstVideo.motion_strength ?? 1.0;
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
              structureGuidance.strength = firstVideo.motion_strength ?? 1.0;
            }
          }

          if (cleanedStructureVideos.length > 0) {
            console.log('[SegmentSettingsModal] [MultiStructureDebug] Injecting structure guidance into regeneration params:', {
              shotId: selectedShotId?.substring(0, 8),
              structure_guidance: structureGuidance,
              structure_videos_count: cleanedStructureVideos.length,
              ranges: cleanedStructureVideos.map(v => ({ start_frame: v.start_frame, end_frame: v.end_frame })),
            });
          }

          // Load user_overrides from the start image's shot_generation.metadata so user edits persist
          const startImageId = segmentSettingsModalData.pairData?.startImage?.id;
          const startShotGen = startImageId ? shotGenerations.find(sg => sg.id === startImageId) : undefined;
          const userOverrides = startShotGen?.metadata?.user_overrides as Record<string, any> | undefined;
          const pairPromptVal = startShotGen?.metadata?.pair_prompt;
          const enhancedPromptVal = startShotGen?.metadata?.enhanced_prompt;

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

          return {
            ...parentParams,
            // Include structure_guidance at top level for individual segments
            ...(structureGuidance ? { structure_guidance: structureGuidance } : {}),
            orchestrator_details: {
              ...(parentParams.orchestrator_details || {}),
              ...(timelineFrameGaps.length > 0 ? {
                // These MUST match the current timeline spacing for correct segment positioning.
                segment_frames_expanded: timelineFrameGaps,
                frame_overlap_expanded: timelineOverlaps,
                num_new_segments_to_generate: timelineFrameGaps.length,
              } : {}),
              ...(cleanedStructureVideos.length > 0 ? { structure_videos: cleanedStructureVideos } : {}),
              // Include structure_guidance in orchestrator_details too (worker checks both)
              ...(structureGuidance ? { structure_guidance: structureGuidance } : {}),
            },
            // Include user_overrides so SegmentRegenerateControls can apply them on top
            user_overrides: userOverrides,
          };
        })()}
        projectResolution={resolvedProjectResolution}
        pairPrompt={(() => {
          if (!segmentSettingsModalData.pairData?.startImage?.id) return "";
          const shotGen = shotGenerations.find(sg => sg.id === segmentSettingsModalData.pairData.startImage.id);
          return shotGen?.metadata?.pair_prompt || "";
        })()}
        pairNegativePrompt={(() => {
          if (!segmentSettingsModalData.pairData?.startImage?.id) return "";
          const shotGen = shotGenerations.find(sg => sg.id === segmentSettingsModalData.pairData.startImage.id);
          return shotGen?.metadata?.pair_negative_prompt || "";
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
          
          // Calculate previous pair data
          return () => {
            const sortedImages = [...shotGenerations]
              .filter(sg => sg.timeline_frame != null && sg.timeline_frame >= 0)
              .sort((a, b) => a.timeline_frame! - b.timeline_frame!);
            
            if (sortedImages.length < 2) return;
            
            const prevIndex = currentIndex - 1;
            if (prevIndex < 0 || prevIndex >= sortedImages.length - 1) return;
            
            const startImage = sortedImages[prevIndex];
            const endImage = sortedImages[prevIndex + 1];
            
            // Access location from flattened GenerationRow structure
            const startLocation = startImage.imageUrl || startImage.location;
            const endLocation = endImage.imageUrl || endImage.location;
            
            setSegmentSettingsModalData({
              isOpen: true,
              pairData: {
                index: prevIndex,
                frames: endImage.timeline_frame! - startImage.timeline_frame!,
                startFrame: startImage.timeline_frame!,
                endFrame: endImage.timeline_frame!,
                startImage: {
                  id: startImage.id, // shot_generations.id
                  url: startLocation,
                  thumbUrl: startLocation,
                  timeline_frame: startImage.timeline_frame!,
                  position: prevIndex + 1,
                },
                endImage: {
                  id: endImage.id, // shot_generations.id
                  url: endLocation,
                  thumbUrl: endLocation,
                  timeline_frame: endImage.timeline_frame!,
                  position: prevIndex + 2,
                },
              },
            });
          };
        })()}
        onNavigateNext={(() => {
          if (!segmentSettingsModalData.pairData) return undefined;
          const currentIndex = segmentSettingsModalData.pairData.index;
          
          // Calculate if there's a next pair
          const sortedImages = [...shotGenerations]
            .filter(sg => sg.timeline_frame != null && sg.timeline_frame >= 0)
            .sort((a, b) => a.timeline_frame! - b.timeline_frame!);
          
          if (currentIndex >= sortedImages.length - 2) return undefined;
          
          // Calculate next pair data
          return () => {
            const nextIndex = currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= sortedImages.length - 1) return;
            
            const startImage = sortedImages[nextIndex];
            const endImage = sortedImages[nextIndex + 1];
            
            // Access location from flattened GenerationRow structure
            const startLocation = startImage.imageUrl || startImage.location;
            const endLocation = endImage.imageUrl || endImage.location;
            
            setSegmentSettingsModalData({
              isOpen: true,
              pairData: {
                index: nextIndex,
                frames: endImage.timeline_frame! - startImage.timeline_frame!,
                startFrame: startImage.timeline_frame!,
                endFrame: endImage.timeline_frame!,
                startImage: {
                  id: startImage.id, // shot_generations.id
                  url: startLocation,
                  thumbUrl: startLocation,
                  timeline_frame: startImage.timeline_frame!,
                  position: nextIndex + 1,
                },
                endImage: {
                  id: endImage.id, // shot_generations.id
                  url: endLocation,
                  thumbUrl: endLocation,
                  timeline_frame: endImage.timeline_frame!,
                  position: nextIndex + 2,
                },
              },
            });
          };
        })()}
        hasPrevious={(() => {
          if (!segmentSettingsModalData.pairData) return false;
          return segmentSettingsModalData.pairData.index > 0;
        })()}
        hasNext={(() => {
          if (!segmentSettingsModalData.pairData) return false;
          const sortedImages = [...shotGenerations]
            .filter(sg => sg.timeline_frame != null && sg.timeline_frame >= 0)
            .sort((a, b) => a.timeline_frame! - b.timeline_frame!);
          
          console.log('[PairPromptFlow] 📊 hasNext calculation:', {
            currentPairIndex: segmentSettingsModalData.pairData.index,
            totalSortedImages: sortedImages.length,
            totalPairs: sortedImages.length - 1,
            hasNext: segmentSettingsModalData.pairData.index < sortedImages.length - 2,
          });
          
          return segmentSettingsModalData.pairData.index < sortedImages.length - 2;
        })()}
        onFrameCountChange={(frameCount: number) => {
          console.log('[FrameCountDebug] onFrameCountChange CALLED with:', frameCount);
          // Update the end image's timeline_frame when frame count changes
          // AND shift all subsequent images by the delta
          const pairData = segmentSettingsModalData.pairData;
          if (!pairData?.endImage?.id || pairData.startFrame === undefined) {
            console.warn('[FrameCountDebug] Cannot update frame count: missing endImage or startFrame', {
              hasEndImage: !!pairData?.endImage,
              endImageId: pairData?.endImage?.id,
              startFrame: pairData?.startFrame,
            });
            return;
          }
          
          const oldEndFrame = pairData.endFrame;
          const newEndFrame = pairData.startFrame + frameCount;
          const delta = newEndFrame - oldEndFrame;

          if (delta === 0) {
            // Nothing to do
            return;
          }
          
          console.log('[FrameCountDebug] Updating timeline frames:', {
            frameCount,
            startFrame: pairData.startFrame,
            oldEndFrame,
            newEndFrame,
            delta,
            endImageId: pairData.endImage.id.substring(0, 8),
          });
          
          // Get all images sorted by timeline_frame
          const sortedImages = [...shotGenerations]
            .filter(sg => sg.timeline_frame != null && sg.timeline_frame >= 0)
            .sort((a, b) => a.timeline_frame! - b.timeline_frame!);

          // Find the end image in the ordered list, then shift it and everything after it.
          // Index-based shifting avoids accidentally shifting unrelated images that happen to share the same frame.
          let startShiftIndex = sortedImages.findIndex(sg => sg.id === pairData.endImage?.id);
          if (startShiftIndex === -1) {
            console.warn('[FrameCountDebug] End image not found in sortedImages; falling back to frame-based cutoff', {
              endImageId: pairData.endImage.id.substring(0, 8),
              oldEndFrame,
            });
            startShiftIndex = sortedImages.findIndex(sg => sg.timeline_frame === oldEndFrame);
          }

          if (startShiftIndex === -1) {
            console.warn('[FrameCountDebug] Could not determine shift start index; aborting shift', {
              endImageId: pairData.endImage.id.substring(0, 8),
              oldEndFrame,
            });
            return;
          }

          const imagesToShift = sortedImages.slice(startShiftIndex);
          
          console.log('[FrameCountDebug] Images to shift:', {
            total: imagesToShift.length,
            ids: imagesToShift.map(sg => sg.id.substring(0, 8)),
            frames: imagesToShift.map(sg => sg.timeline_frame),
          });

          const updates = imagesToShift.map(sg => {
            const nextFrame = (sg.timeline_frame as number) + delta;
            console.log('[FrameCountDebug] Shifting image:', sg.id.substring(0, 8), sg.timeline_frame, '->', nextFrame);
            return { id: sg.id, newFrame: nextFrame };
          });

          // Prefer batch update to avoid N sequential writes/races
          batchExchangePositions(updates as any)
            .then(() => {
              console.log('[FrameCountDebug] All frames shifted successfully (batch)');
            })
            .catch(err => {
              console.error('[FrameCountDebug] Error shifting frames (batch):', err);
            });
          
          // Also update the local modal state so the display stays in sync
          setSegmentSettingsModalData(prev => ({
            ...prev,
            pairData: prev.pairData ? {
              ...prev.pairData,
              frames: frameCount,
              endFrame: newEndFrame,
              endImage: prev.pairData.endImage ? {
                ...prev.pairData.endImage,
                timeline_frame: newEndFrame,
              } : undefined,
            } : null,
          }));
        }}
        onGenerateStarted={(pairShotGenerationId) => {
          // Optimistic UI update - show pending state immediately before task is detected
          addOptimisticPending(pairShotGenerationId);
        }}
      />
      
      {/* Preview Together Dialog */}
      <Dialog open={isPreviewTogetherOpen} onOpenChange={setIsPreviewTogetherOpen}>
        <DialogContent className="max-w-4xl w-full p-0 gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Preview Segments</DialogTitle>
          </DialogHeader>
          <div className="p-4">
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
              
              return (
                <div className="space-y-4">
                  <div className="relative bg-black rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: '300px' }}>
                    {currentSegment.hasVideo ? (
                      // Video segment
                      <video
                        ref={previewVideoRef}
                        src={currentSegment.videoUrl!}
                        className="max-w-full max-h-[60vh] object-contain cursor-pointer"
                        autoPlay
                        playsInline
                        onClick={() => {
                          const video = previewVideoRef.current;
                          if (video) {
                            if (video.paused) {
                              video.play();
                            } else {
                              video.pause();
                            }
                          }
                        }}
                        onPlay={() => {
                          setPreviewIsPlaying(true);
                          const audio = previewAudioRef.current;
                          if (audio && isAudioEnabled && propAudioUrl) {
                            syncAudioToVideo();
                          }
                        }}
                        onPause={() => {
                          setPreviewIsPlaying(false);
                          const audio = previewAudioRef.current;
                          if (audio) {
                            audio.pause();
                          }
                        }}
                        onTimeUpdate={() => {
                          const video = previewVideoRef.current;
                          if (video) {
                            // Scale current time by playback rate to show "real" time elapsed
                            const scaledTime = video.currentTime / (video.playbackRate || 1);
                            setPreviewCurrentTime(scaledTime);
                          }
                        }}
                        onSeeked={() => {
                          syncAudioToVideo();
                        }}
                        onLoadedMetadata={() => {
                          const video = previewVideoRef.current;
                          if (video) {
                            const actualDuration = video.duration;
                            const expectedDuration = currentSegment.durationFromFrames || actualDuration;
                            
                            // Adjust playback rate so video matches segment duration
                            if (expectedDuration > 0 && actualDuration > 0) {
                              const playbackRate = actualDuration / expectedDuration;
                              // Clamp to reasonable range (0.25x to 4x)
                              video.playbackRate = Math.max(0.25, Math.min(4, playbackRate));
                              console.log('[PreviewVideo] Adjusting playback rate:', {
                                actual: actualDuration.toFixed(2),
                                expected: expectedDuration.toFixed(2),
                                rate: video.playbackRate.toFixed(2),
                              });
                            }
                            
                            // Show expected duration in UI (what the segment should last)
                            setPreviewDuration(expectedDuration);
                            setPreviewCurrentTime(0);
                            syncAudioToVideo();
                          }
                        }}
                        onEnded={() => {
                          const nextIndex = (safeIndex + 1) % previewableSegments.length;
                          setCurrentPreviewIndex(nextIndex);
                        }}
                        key={currentSegment.videoUrl}
                      />
                    ) : (
                      // Image crossfade segment
                      <div 
                        className="relative w-full cursor-pointer"
                        style={{ maxHeight: '60vh' }}
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
                        {/* Base image to establish dimensions */}
                        <img
                          src={currentSegment.startImageUrl || currentSegment.endImageUrl || ''}
                          alt="Base"
                          className="w-full h-auto max-h-[60vh] object-contain invisible"
                        />
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
                    )}
                    
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
                            setCurrentPreviewIndex(prev => 
                              prev > 0 ? prev - 1 : previewableSegments.length - 1
                            );
                          }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-10 w-10"
                        >
                          <ChevronLeft className="h-6 w-6" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentPreviewIndex(prev => 
                              (prev + 1) % previewableSegments.length
                            );
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-10 w-10"
                        >
                          <ChevronRight className="h-6 w-6" />
                        </Button>
                      </>
                    )}
                    
                    {/* Controls overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-8">
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
                  
                  {/* Segment thumbnail indicators */}
                  <div className="flex items-center justify-center gap-2">
                    {previewableSegments.map((segment, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`relative transition-all duration-200 rounded-lg overflow-hidden ${
                          idx === safeIndex
                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                        style={{ width: 64, height: 36 }}
                        onClick={() => setCurrentPreviewIndex(idx)}
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
