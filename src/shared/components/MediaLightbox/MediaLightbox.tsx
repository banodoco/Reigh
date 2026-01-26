import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { GenerationRow, Shot } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import type { SegmentSlotModeData } from './types';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio, parseRatio } from '@/shared/lib/aspectRatios';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Move,
  Edit3,
  Eraser,
  Square,
  Diamond,
  Undo2,
  X,
  Film,
  Plus,
  Scissors,
  RefreshCw,
  Star,
  Check,
  Loader2,
  LockIcon,
  UnlockIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import { invalidateVariantChange } from '@/shared/hooks/useGenerationInvalidation';
import { useMarkVariantViewed } from '@/shared/hooks/useMarkVariantViewed';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { usePromoteVariantToGeneration } from '@/shared/hooks/usePromoteVariantToGeneration';
import { useAddImageToShot } from '@/shared/hooks/useShots';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';

// Import all extracted hooks
import {
  useUpscale,
  useInpainting,
  useGenerationName,
  useReferences,
  useGenerationLineage,
  useShotCreation,
  useLightboxNavigation,
  useStarToggle,
  useShotPositioning,
  useEditModeLoRAs,
  useSourceGeneration,
  useLayoutMode,
  useMagicEditMode,
  useEditSettingsPersistence,
  useRepositionMode,
  useSwipeNavigation,
  useButtonGroupProps,
  useImg2ImgMode,
} from './hooks';

// Import all extracted components
import {
  MediaDisplay,
  NavigationButtons,
  TaskDetailsSection,
  MediaControls,
  WorkflowControls,
  MediaDisplayWithCanvas,
  SourceGenerationDisplay,
  FloatingToolControls,
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
  EditModePanel,
  ShotSelectorControls,
  WorkflowControlsBar,
  NavigationArrows,
  OpenEditModeButton,
  TaskDetailsPanelWrapper,
  VideoEditPanel,
  InfoPanel,
  ControlsPanel,
  VideoEditModeDisplay,
  VideoTrimModeDisplay,
  SegmentRegenerateForm,
  SegmentSlotFormView,
} from './components';
import { FlexContainer, MediaWrapper } from './components/layouts';

// Import utils
import { downloadMedia } from './utils';
import { extractSegmentImages } from '@/tools/travel-between-images/components/VideoGallery/utils/gallery-utils';

// Import video trim components (conditional for segment videos)
import {
  useVariants,
  useVideoTrimming,
  useTrimSave,
  TrimControlsPanel,
  TrimTimelineBar,
  VariantSelector,
} from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor';

// Import video edit components (for regenerating portions)
import { VideoPortionEditor } from '@/tools/edit-video/components/VideoPortionEditor';
import { MultiPortionTimeline } from '@/shared/components/VideoPortionTimeline';
import { useVideoEditing } from './hooks/useVideoEditing';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';
import { deriveInputImages } from '@/shared/utils/taskParamsUtils';

interface ShotOption {
  id: string;
  name: string;
}

interface MediaLightboxProps {
  /** Media to display. Optional when segmentSlotMode is provided with no video. */
  media?: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  /**
   * Segment slot mode - when provided, MediaLightbox acts as a unified segment editor.
   * If segmentVideo is null, shows only the generate form (no media display).
   * Navigation uses onNavigateToPair for seamless slot-based navigation.
   */
  segmentSlotMode?: SegmentSlotModeData;
  // Configuration props to control features
  readOnly?: boolean; // Read-only mode - hides all interactive elements
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
  showMagicEdit?: boolean;
  autoEnterInpaint?: boolean; // Automatically enter inpaint mode when lightbox opens
  // Navigation availability
  hasNext?: boolean;
  hasPrevious?: boolean;
  // Workflow-specific props
  allShots?: ShotOption[];
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: any) => void;
  showTickForImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  showTickForSecondaryImageId?: string | null;
  onShowSecondaryTick?: (imageId: string) => void;
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
  // Star functionality
  starred?: boolean;
  onToggleStar?: (id: string, starred: boolean) => void;
  // Task details functionality
  showTaskDetails?: boolean;
  taskDetailsData?: {
    task: any;
    isLoading: boolean;
    error: any;
    inputImages: string[];
    taskId: string | null;
    onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
    onClose?: () => void;
  };
  // Mobile video task details toggle
  onShowTaskDetails?: () => void;
  // Shot creation functionality
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  // Shot navigation functionality
  onNavigateToShot?: (shot: Shot, options?: { isNewlyCreated?: boolean }) => void;
  // Tool type override for magic edit
  toolTypeOverride?: string;
  // Optimistic updates
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
  // Precomputed overrides from gallery source record
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
  // Navigation to specific generation
  onNavigateToGeneration?: (generationId: string) => void;
  // Open external generation (fetch from DB if not in current context)
  // Optional derivedContext array enables "Based On" navigation mode
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  // Shot ID for star persistence
  shotId?: string;
  // Tasks pane integration (desktop only)
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
  // Video trim functionality - deprecated, trim is now always available for videos
  showVideoTrimEditor?: boolean;
  onTrimModeChange?: (isTrimMode: boolean) => void;
  // Initial video trim mode (opens lightbox directly in trim mode)
  initialVideoTrimMode?: boolean;
  // Initial variant to display (when opening lightbox from a variant click)
  initialVariantId?: string;
  /**
   * When true, fetch variants for this generation itself (media.id) instead of its parent.
   * Use this when viewing child generations where variants are created on the child
   * (e.g., travel-between-images segments) rather than the parent (e.g., edit-video).
   */
  fetchVariantsForSelf?: boolean;
  /**
   * Current segment images from the timeline (overrides stored task params).
   * Use this when the timeline images may have changed since the video was generated.
   */
  currentSegmentImages?: {
    startUrl?: string;
    endUrl?: string;
    startGenerationId?: string;
    endGenerationId?: string;
    /** Shot generation ID for looking up per-pair metadata (prompt overrides, etc.) */
    startShotGenerationId?: string;
    /** Active child generation ID for this slot (use for regeneration to create variant on correct child) */
    activeChildGenerationId?: string;
  };
  /**
   * Callback when segment frame count changes in the regenerate form.
   * Used for instant/optimistic timeline updates.
   */
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  /**
   * Current frame count from timeline positions (source of truth).
   * Used to initialize the frame count slider in regenerate form.
   */
  currentFrameCount?: number;
}

const MediaLightbox: React.FC<MediaLightboxProps> = ({
  media: mediaProp,
  onClose,
  onNext,
  onPrevious,
  readOnly = false,
  showNavigation = true,
  showImageEditTools = true,
  showDownload = true,
  showMagicEdit = false,
  autoEnterInpaint = false,
  // Segment slot mode - for unified segment editor experience
  segmentSlotMode,
  // Navigation availability
  hasNext: hasNextProp = true,
  hasPrevious: hasPreviousProp = true,
  // Workflow-specific props
  allShots = [],
  selectedShotId,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  onDelete,
  isDeleting,
  onApplySettings,
  showTickForImageId,
  onShowTick,
  showTickForSecondaryImageId,
  onShowSecondaryTick,
  onMagicEdit,
  // Star functionality
  starred = false,
  onToggleStar,
  // Task details functionality
  showTaskDetails = false,
  taskDetailsData,
  // Mobile video task details toggle
  onShowTaskDetails,
  // Shot creation functionality
  onCreateShot,
  // Shot navigation functionality
  onNavigateToShot,
  // Tool type override for magic edit
  toolTypeOverride,
  // Optimistic updates
  optimisticPositionedIds,
  optimisticUnpositionedIds,
  onOptimisticPositioned,
  onOptimisticUnpositioned,
  // Overrides
  positionedInSelectedShot,
  associatedWithoutPositionInSelectedShot,
  // Navigation to specific generation
  onNavigateToGeneration,
  onOpenExternalGeneration,
  // Shot ID for star persistence
  shotId,
  tasksPaneOpen = false,
  tasksPaneWidth = 320,
  // Video trim functionality
  showVideoTrimEditor = false,
  onTrimModeChange,
  // Initial video trim mode
  initialVideoTrimMode = false,
  // Initial variant to display
  initialVariantId,
  // Fetch variants for self instead of parent
  fetchVariantsForSelf = false,
  // Current segment images from timeline (overrides stored params)
  currentSegmentImages,
  // Callback for instant timeline updates when frame count changes
  onSegmentFrameCountChange,
  // Current frame count from timeline positions (source of truth)
  currentFrameCount,
}) => {
  // ========================================
  // SEGMENT SLOT MODE - Unified segment editor
  // ========================================

  // When in segment slot mode, derive media and navigation from the slot data
  const isSegmentSlotMode = !!segmentSlotMode;
  const hasSegmentVideo = isSegmentSlotMode && !!segmentSlotMode.segmentVideo;

  // Flag for simplified form-only rendering (segment slot mode without video)
  const isFormOnlyMode = isSegmentSlotMode && !hasSegmentVideo;

  // Debug logging for segment slot navigation
  console.log('[SegmentSlotNav] MediaLightbox render:', {
    isSegmentSlotMode,
    hasSegmentVideo,
    isFormOnlyMode,
    currentIndex: segmentSlotMode?.currentIndex,
    totalPairs: segmentSlotMode?.totalPairs,
    hasMediaProp: !!mediaProp,
    segmentVideoId: segmentSlotMode?.segmentVideo?.id?.substring(0, 8),
  });

  // More detailed debug logging with filterable tag
  if (isSegmentSlotMode) {
    console.log('[SegmentClickDebug] MediaLightbox opened in segment slot mode:', {
      currentIndex: segmentSlotMode?.currentIndex,
      hasSegmentVideo,
      segmentVideoId: segmentSlotMode?.segmentVideo?.id?.substring(0, 8),
      segmentVideoLocation: segmentSlotMode?.segmentVideo?.location?.substring(0, 50),
      segmentVideoType: segmentSlotMode?.segmentVideo?.type,
      mediaPropId: mediaProp?.id?.substring(0, 8),
      mediaPropType: mediaProp?.type,
      mediaPropLocation: mediaProp?.location?.substring(0, 50),
      pairDataIndex: segmentSlotMode?.pairData?.index,
      activeChildGenerationId: segmentSlotMode?.activeChildGenerationId?.substring(0, 8),
    });
  }

  // Placeholder media for form-only mode - ensures hooks always receive valid data
  const placeholderMedia: GenerationRow = {
    id: 'placeholder',
    type: 'image',
    imageUrl: '',
    location: '',
    thumbUrl: '',
    contentType: 'image/png',
    params: {},
    metadata: {},
    created_at: new Date().toISOString(),
  };

  // Raw media: use slot's video if in slot mode, otherwise use prop (can be undefined in form-only mode)
  const rawMedia = hasSegmentVideo
    ? segmentSlotMode.segmentVideo!
    : mediaProp;

  // Media is always defined - use placeholder in form-only mode
  const media = rawMedia ?? placeholderMedia;

  // Slot-based navigation
  const hasNext = isSegmentSlotMode
    ? segmentSlotMode.currentIndex < segmentSlotMode.totalPairs - 1
    : hasNextProp;
  const hasPrevious = isSegmentSlotMode
    ? segmentSlotMode.currentIndex > 0
    : hasPreviousProp;

  // Navigation handlers for slot mode
  const handleSlotNavNext = useCallback(() => {
    console.log('[SegmentSlotNav] handleSlotNavNext called:', {
      isSegmentSlotMode,
      hasNext,
      currentIndex: segmentSlotMode?.currentIndex,
      targetIndex: (segmentSlotMode?.currentIndex ?? -1) + 1,
    });
    if (isSegmentSlotMode && hasNext) {
      segmentSlotMode.onNavigateToPair(segmentSlotMode.currentIndex + 1);
    } else if (onNext) {
      onNext();
    }
  }, [isSegmentSlotMode, hasNext, segmentSlotMode, onNext]);

  const handleSlotNavPrev = useCallback(() => {
    console.log('[SegmentSlotNav] handleSlotNavPrev called:', {
      isSegmentSlotMode,
      hasPrevious,
      currentIndex: segmentSlotMode?.currentIndex,
      targetIndex: (segmentSlotMode?.currentIndex ?? 1) - 1,
    });
    if (isSegmentSlotMode && hasPrevious) {
      segmentSlotMode.onNavigateToPair(segmentSlotMode.currentIndex - 1);
    } else if (onPrevious) {
      onPrevious();
    }
  }, [isSegmentSlotMode, hasPrevious, segmentSlotMode, onPrevious]);

  // ========================================
  // REFACTORED: All logic extracted to hooks
  // ========================================

  // Debug log for shotId prop
  console.log('[MediaLightbox] [ResolutionDebug] Props received:', {
    shotId: shotId?.substring(0, 8),
    mediaId: media?.id?.substring(0, 8),
    isVideo: media?.type === 'video' || media?.location?.includes('.mp4'),
    isSegmentSlotMode,
    hasSegmentVideo,
    slotIndex: segmentSlotMode?.currentIndex,
  });

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Basic state - only UI state remains here
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [isMakingMainVariant, setIsMakingMainVariant] = useState(false);
  const [replaceImages, setReplaceImages] = useState(true);
  const [previewImageDimensions, setPreviewImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const previousPreviewDataRef = useRef<GenerationRow | null>(null);

  // Track where pointer/click started to prevent accidental modal closure on drag
  const pointerDownTargetRef = useRef<EventTarget | null>(null);
  
  // Track double-tap on mobile/iPad
  const lastTapTimeRef = useRef<number>(0);
  const lastTapTargetRef = useRef<EventTarget | null>(null);
  const touchStartTargetRef = useRef<EventTarget | null>(null); // Track where touch started
  const touchStartedOnOverlayRef = useRef<boolean>(false); // Track if touch started on overlay background
  const variantsSectionRef = useRef<HTMLDivElement>(null); // For scrolling to variants section
  const DOUBLE_TAP_DELAY = 300; // ms

  // Basic hooks
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { selectedProjectId } = useProject();
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudMode = generationMethods.inCloud;
  const isLocalGeneration = generationMethods.onComputer && !generationMethods.inCloud;

  // Tasks pane control - allows opening tasks pane from within the lightbox
  const { 
    isTasksPaneLocked,
    setIsTasksPaneLocked,
    isTasksPaneOpen: isTasksPaneOpenContext,
    setIsTasksPaneOpen: setTasksPaneOpenContext,
    tasksPaneWidth: contextTasksPaneWidth,
  } = usePanes();
  
  // Determine if we should leave space for the tasks pane:
  // - When the tasks pane is locked open (globally)
  // - When the context says the pane is open (for programmatic control)
  // Note: We don't use the tasksPaneOpen prop anymore because it's a static value
  // that doesn't react to changes made from within the lightbox (e.g., unlocking)
  const effectiveTasksPaneOpen = isTasksPaneLocked || isTasksPaneOpenContext;
  const effectiveTasksPaneWidth = contextTasksPaneWidth || tasksPaneWidth;
  
  // Get active task count for the badge
  const { data: statusCounts } = useTaskStatusCounts(selectedProjectId ?? '');
  const cancellableTaskCount = statusCounts?.processing || 0;

  // Video edit mode - unified state for video editing with sub-modes (like image edit has text/inpaint/annotate/reposition)
  // Sub-modes: 'trim' for trimming video, 'replace' for portion replacement, 'regenerate' for full regeneration
  // Note: The persisted value is read from editSettingsPersistence and used to restore on re-entry
  // The wrapper setVideoEditSubMode is defined after editSettingsPersistence to access the persist setter
  // Initialize from localStorage directly to prevent flash (editSettingsPersistence isn't available yet)
  const [videoEditSubMode, setVideoEditSubModeLocal] = useState<'trim' | 'replace' | 'regenerate' | null>(() => {
    if (initialVideoTrimMode) return 'trim';
    // Check if this is a video (isVideo isn't computed yet, so check directly)
    const mediaIsVideo = media.type === 'video' || (media.location?.endsWith('.mp4') || media.location?.endsWith('.webm'));
    if (!mediaIsVideo) return null;
    // Check if we should restore to edit mode from localStorage
    try {
      const projectKey = selectedProjectId ? `lightbox-edit-last-used-${selectedProjectId}` : null;
      const stored = projectKey ? localStorage.getItem(projectKey) : localStorage.getItem('lightbox-edit-last-used-global');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.panelMode === 'edit' && parsed.videoEditSubMode) {
          console.log('[PanelRestore] Initializing videoEditSubMode from localStorage:', parsed.videoEditSubMode);
          return parsed.videoEditSubMode;
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return null;
  });

  // Derived states for compatibility with existing code
  const isVideoTrimMode = videoEditSubMode === 'trim';
  const isInVideoEditMode = videoEditSubMode !== null; // True when in any video edit sub-mode

  // Video ref and currentTime for trim mode (similar to videoEditing pattern)
  const trimVideoRef = useRef<HTMLVideoElement>(null);
  const [trimCurrentTime, setTrimCurrentTime] = useState(0);
  
  // Create as variant toggle - when false (createAsGeneration=true), creates new generation instead of variant
  const [createAsGeneration, setCreateAsGeneration] = useState(false);

  // Variant params to load into regenerate form (triggered from VariantSelector hover)
  const [variantParamsToLoad, setVariantParamsToLoad] = useState<Record<string, any> | null>(null);

  // Track component lifecycle and media changes - ALL TOP LEVEL
  useEffect(() => {
    console.log('[MediaLightbox] 🎬 ========== MOUNTED/CHANGED ==========');
    console.log('[MediaLightbox] mediaId:', media?.id?.substring(0, 8));
    console.log('[MediaLightbox] media.url:', (media as any)?.url);
    console.log('[MediaLightbox] media.imageUrl:', media?.imageUrl);
    console.log('[MediaLightbox] media.location:', media?.location);
    console.log('[MediaLightbox] media.thumbUrl:', (media as any)?.thumbUrl);
    console.log('[MediaLightbox] media.type:', media?.type);
    console.log('[MediaLightbox] mediaKeys:', media ? Object.keys(media) : 'no media');
    console.log('[MediaLightbox] ========================================');
    
    return () => {
      console.log('[MediaLightbox] 💀 Component will unmount or media will change');
    };
  }, [media?.id, (media as any)?.url, media?.imageUrl, media?.location, media?.type]);

  // Safety check - media is required unless we're in segment slot mode without a video
  if (!media && !isSegmentSlotMode) {
    console.error('[MediaLightbox] ❌ No media prop provided!');
    return null;
  }

  // Derived values - uses canonical isVideoAny from typeGuards
  const isVideo = isVideoAny(media as any);
  
  // CRITICAL: When viewing from ShotImagesEditor, media.id is the shot_generations.id (join table ID)
  // We need to use media.generation_id (actual generations table ID) for DB operations
  //
  // ID logic:
  // - If generation_id exists, use it (this is the correct generations.id)
  // - Only fall back to media.id if this is NOT a shot_generation record
  //   (shot_generation records have shotImageEntryId or shot_generation_id set to media.id)
  // Note: All these are guarded for segment slot mode without video (media is undefined)
  const isShotGenerationRecord = media
    ? ((media as any).shotImageEntryId === media.id || (media as any).shot_generation_id === media.id)
    : false;
  const actualGenerationId = media
    ? ((media as any).generation_id || (!isShotGenerationRecord ? media.id : null))
    : null;

  // Warn if shot_generation record is missing generation_id - indicates data pipeline bug
  if (media && isShotGenerationRecord && !(media as any).generation_id) {
    console.warn('[MediaLightbox] ⚠️ Shot generation record missing generation_id - edit settings will be disabled', {
      mediaId: media.id?.substring(0, 8),
      shotImageEntryId: (media as any).shotImageEntryId?.substring(0, 8),
      hasGenerationId: !!(media as any).generation_id,
    });
  }

  // For variant fetching: determine which generation's variants to show.
  // - fetchVariantsForSelf=true: fetch variants for this generation (used by travel-between-images children)
  // - fetchVariantsForSelf=false: fetch from parent if available (used by edit-video children)
  const variantFetchGenerationId = media
    ? (fetchVariantsForSelf
        ? actualGenerationId
        : ((media as any).parent_generation_id || actualGenerationId))
    : null;

  // DEBUG: Log variant fetching context (only when media exists)
  if (media) {
    console.log('[VariantFetchDebug] Media and variant context:', {
      mediaId: media.id?.substring(0, 8),
      actualGenerationId: actualGenerationId?.substring(0, 8),
      hasParentGenerationId: !!(media as any).parent_generation_id,
      parentGenerationId: (media as any).parent_generation_id?.substring(0, 8) || 'none',
      fetchVariantsForSelf,
      variantFetchGenerationId: variantFetchGenerationId?.substring(0, 8),
      mediaKeys: Object.keys(media).join(', '),
    });
  }
  
  // ========================================
  // ALL HOOKS - Business logic extracted
  // ========================================

  // Upscale hook
  const upscaleHook = useUpscale({ media, selectedProjectId, isVideo });
  const { 
    effectiveImageUrl,
    sourceUrlForTasks,
    isUpscaling,
    showingUpscaled,
    isPendingUpscale,
    hasUpscaledVersion,
    handleUpscale,
    handleToggleUpscaled,
  } = upscaleHook;

  // Helper to convert resolution string to dimensions
  const resolutionToDimensions = (resolution: string): { width: number; height: number } | null => {
    if (!resolution || typeof resolution !== 'string' || !resolution.includes('x')) return null;
    const [w, h] = resolution.split('x').map(Number);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
    return null;
  };

  // Helper to convert aspect ratio string to standard dimensions
  const aspectRatioToDimensions = (aspectRatio: string): { width: number; height: number } | null => {
    if (!aspectRatio) return null;

    // Direct lookup in our standard aspect ratios
    const directResolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatio];
    if (directResolution) {
      return resolutionToDimensions(directResolution);
    }

    // Try to parse and find closest standard aspect ratio
    const ratio = parseRatio(aspectRatio);
    if (!isNaN(ratio)) {
      const closestAspectRatio = findClosestAspectRatio(ratio);
      const closestResolution = ASPECT_RATIO_TO_RESOLUTION[closestAspectRatio];
      if (closestResolution) {
        return resolutionToDimensions(closestResolution);
      }
    }

    return null;
  };

  // Helper to extract dimensions from media object (checks multiple sources)
  // Priority: exact dimensions > resolution string > aspect_ratio > null
  const extractDimensionsFromMedia = React.useCallback((mediaObj: typeof media): { width: number; height: number } | null => {
    if (!mediaObj) return null;

    const params = (mediaObj as any)?.params;
    const metadata = mediaObj?.metadata as any;

    // 1. Check top-level width/height first (from generations table)
    if ((mediaObj as any)?.width && (mediaObj as any)?.height) {
      return { width: (mediaObj as any).width, height: (mediaObj as any).height };
    }

    // 2. Check metadata.width/height
    if (metadata?.width && metadata?.height) {
      return { width: metadata.width, height: metadata.height };
    }

    // 3. Check resolution strings in multiple locations
    const resolutionSources = [
      params?.resolution,
      params?.originalParams?.resolution,
      params?.orchestrator_details?.resolution,
      metadata?.resolution,
      metadata?.originalParams?.resolution,
      metadata?.originalParams?.orchestrator_details?.resolution,
    ];

    for (const res of resolutionSources) {
      const dims = resolutionToDimensions(res);
      if (dims) return dims;
    }

    // 4. Check for aspect_ratio in params and convert to standard dimensions
    // This is faster than falling back to project aspect ratio since data is already loaded
    const aspectRatioSources = [
      params?.aspect_ratio,
      params?.custom_aspect_ratio,
      params?.originalParams?.aspect_ratio,
      params?.orchestrator_details?.aspect_ratio,
      metadata?.aspect_ratio,
      metadata?.originalParams?.aspect_ratio,
      metadata?.originalParams?.orchestrator_details?.aspect_ratio,
    ];

    for (const ar of aspectRatioSources) {
      if (ar) {
        const dims = aspectRatioToDimensions(ar);
        if (dims) return dims;
      }
    }

    return null;
  }, []);

  // Image dimensions state (needed by inpainting hook)
  // Initialize from media to prevent size jump during progressive loading
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(() => {
    return extractDimensionsFromMedia(media);
  });

  // Update dimensions when media changes (e.g., switching images or variants)
  // This prevents the "small then big" flash during progressive loading
  // IMPORTANT: useLayoutEffect runs synchronously BEFORE browser paint,
  // so dimensions are updated before the user sees anything (prevents flicker on rapid clicks)
  React.useLayoutEffect(() => {
    const dims = extractDimensionsFromMedia(media);
    console.log('[LightboxDimensions] Extracting dimensions from media:', {
      mediaId: media?.id?.substring(0, 8),
      hasWidth: !!(media as any)?.width,
      hasMetadataWidth: !!(media?.metadata as any)?.width,
      hasParamsResolution: !!(media as any)?.params?.resolution,
      paramsResolution: (media as any)?.params?.resolution,
      hasOrchestratorResolution: !!(media?.metadata as any)?.originalParams?.orchestrator_details?.resolution,
      extractedDims: dims,
      keepingPrevious: !dims,
    });
    // Only update if we have new dimensions - otherwise keep previous as fallback
    if (dims) {
      setImageDimensions(dims);
    }
    // Note: Previous dimensions are kept if extraction fails, providing a smoother experience
  }, [media?.id, extractDimensionsFromMedia]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Flip functionality removed - use reposition mode instead
  const isFlippedHorizontally = false;
  const isSaving = false;

  // Edit Settings Persistence hook - manages LoRA mode, prompt, numGenerations with persistence
  const editSettingsPersistence = useEditSettingsPersistence({
    generationId: actualGenerationId,
    projectId: selectedProjectId,
    enabled: !isFormOnlyMode,
  });
  const { 
    loraMode, 
    setLoraMode, 
    customLoraUrl, 
    setCustomLoraUrl, 
    editModeLoRAs,
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
    // These will be synced with useInpainting
    editMode: persistedEditMode,
    numGenerations: persistedNumGenerations,
    prompt: persistedPrompt,
    setEditMode: setPersistedEditMode,
    setNumGenerations: setPersistedNumGenerations,
    setPrompt: setPersistedPrompt,
    // Img2Img persisted values
    img2imgStrength: persistedImg2imgStrength,
    img2imgPrompt: persistedImg2imgPrompt,
    img2imgPromptHasBeenSet: persistedImg2imgPromptHasBeenSet,
    img2imgEnablePromptExpansion: persistedImg2imgEnablePromptExpansion,
    setImg2imgStrength: setPersistedImg2imgStrength,
    setImg2imgPrompt: setPersistedImg2imgPrompt,
    setImg2imgEnablePromptExpansion: setPersistedImg2imgEnablePromptExpansion,
    isLoading: isLoadingEditSettings,
    isReady: isEditSettingsReady,
    hasPersistedSettings,
    // Advanced settings for two-pass generation
    advancedSettings,
    setAdvancedSettings,
    // Model selection for cloud mode
    qwenEditModel,
    setQwenEditModel,
    // Video/Panel mode persistence
    videoEditSubMode: persistedVideoEditSubMode,
    panelMode: persistedPanelMode,
    setVideoEditSubMode: setPersistedVideoEditSubMode,
    setPanelMode: setPersistedPanelMode,
  } = editSettingsPersistence;

  // Wrapper for setVideoEditSubMode that also persists to localStorage/DB
  const setVideoEditSubMode = useCallback((mode: 'trim' | 'replace' | 'regenerate' | null) => {
    console.log('[EDIT_DEBUG] 🎬 setVideoEditSubMode called:', mode, '(persisted was:', persistedVideoEditSubMode, ')');
    setVideoEditSubModeLocal(mode);
    if (mode) {
      // Persist when entering a sub-mode (not when exiting to null)
      setPersistedVideoEditSubMode(mode);
    }
  }, [setPersistedVideoEditSubMode, persistedVideoEditSubMode]);

  // Variants hook - fetch available variants for this generation
  // Moved early so activeVariant is available for edit hooks
  // Uses variantFetchGenerationId which prefers parent_generation_id for child generations
  // This ensures edit-video variants show correctly when viewing from TasksPane
  const variantsHook = useVariants({
    generationId: variantFetchGenerationId,
    enabled: !isFormOnlyMode, // Disable DB queries in form-only mode (placeholder media)
  });
  const {
    variants,
    primaryVariant,
    activeVariant,
    isLoading: isLoadingVariants,
    setActiveVariantId: rawSetActiveVariantId,
    refetch: refetchVariants,
    setPrimaryVariant,
    deleteVariant,
  } = variantsHook;

  // Hook to mark variants as viewed (removes NEW badge)
  const { markViewed } = useMarkVariantViewed();

  // Wrap setActiveVariantId with logging and mark-as-viewed
  const setActiveVariantId = React.useCallback((variantId: string) => {
    console.log('[VariantClickDebug] setActiveVariantId called:', {
      variantId: variantId?.substring(0, 8),
      currentActiveVariant: activeVariant?.id?.substring(0, 8),
      variantsCount: variants?.length,
    });
    // Mark variant as viewed when selected (fire-and-forget)
    // Pass generationId for optimistic badge update
    if (variantId) {
      const generationId = media.generation_id || media.id;
      markViewed({ variantId, generationId });
    }
    rawSetActiveVariantId(variantId);
  }, [rawSetActiveVariantId, activeVariant, variants, markViewed, media]);
  
  // Log when activeVariant changes
  React.useEffect(() => {
    console.log('[VariantClickDebug] activeVariant changed:', {
      activeVariantId: activeVariant?.id?.substring(0, 8),
      activeVariantType: activeVariant?.variant_type,
      activeVariantIsPrimary: activeVariant?.is_primary,
      activeVariantLocation: activeVariant?.location?.substring(0, 50),
    });
  }, [activeVariant]);

  // Set initial variant when variants load and initialVariantId is provided
  // Track which initialVariantId we've already handled to avoid re-setting on every render
  const handledInitialVariantRef = React.useRef<string | null>(null);
  
  React.useEffect(() => {
    // Only process if we have a new initialVariantId different from what we've handled
    if (initialVariantId && variants && variants.length > 0) {
      if (handledInitialVariantRef.current !== initialVariantId) {
        const targetVariant = variants.find(v => v.id === initialVariantId);
        if (targetVariant) {
          console.log('[VariantClickDebug] Setting initial variant from prop:', initialVariantId.substring(0, 8));
          setActiveVariantId(initialVariantId);
          handledInitialVariantRef.current = initialVariantId;
        }
      }
    }
  }, [initialVariantId, variants, setActiveVariantId]);
  
  // Reset handled ref when media changes (new item opened)
  // Guard for undefined media (segment slot mode without video)
  React.useEffect(() => {
    handledInitialVariantRef.current = null;
  }, [media?.id]);

  // Track which variant has been marked as viewed for this media to avoid duplicate marks
  const markedViewedVariantRef = React.useRef<string | null>(null);

  // Mark the initial/active variant as viewed when the lightbox opens
  // This handles the case where the primary variant is auto-selected without explicit setActiveVariantId call
  React.useEffect(() => {
    if (!media) return;
    if (activeVariant && activeVariant.id && markedViewedVariantRef.current !== activeVariant.id) {
      const generationId = media.generation_id || media.id;
      console.log('[VariantViewed] Marking initial variant as viewed:', {
        variantId: activeVariant.id.substring(0, 8),
        isPrimary: activeVariant.is_primary,
        generationId: generationId.substring(0, 8),
      });
      markViewed({ variantId: activeVariant.id, generationId });
      markedViewedVariantRef.current = activeVariant.id;
    }
  }, [activeVariant, media?.generation_id, media?.id, markViewed, media]);

  // Reset marked-viewed ref when media changes (new item opened)
  React.useEffect(() => {
    markedViewedVariantRef.current = null;
  }, [media?.id]);

  // Compute isViewingNonPrimaryVariant early for edit hooks
  const isViewingNonPrimaryVariant = activeVariant && !activeVariant.is_primary;
  
  // Log variant info for edit tracking
  React.useEffect(() => {
    console.log('[VariantRelationship] Edit mode variant info:');
    console.log('[VariantRelationship] - isViewingNonPrimaryVariant:', isViewingNonPrimaryVariant);
    console.log('[VariantRelationship] - activeVariantId:', activeVariant?.id);
    console.log('[VariantRelationship] - activeVariantType:', activeVariant?.variant_type);
    console.log('[VariantRelationship] - activeVariantIsPrimary:', activeVariant?.is_primary);
    console.log('[VariantRelationship] - willPassSourceVariantId:', isViewingNonPrimaryVariant ? activeVariant?.id : null);
  }, [activeVariant, isViewingNonPrimaryVariant]);

  // Variant promotion - create standalone generation from a variant
  const promoteVariantMutation = usePromoteVariantToGeneration();
  const addImageToShotMutation = useAddImageToShot(); // For adding with position support
  const [promoteSuccess, setPromoteSuccess] = useState(false);

  // Handler for "Make new image" button in VariantSelector
  const handlePromoteToGeneration = useCallback(async (variantId: string) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    console.log('[PromoteVariant] handlePromoteToGeneration called:', {
      variantId: variantId.substring(0, 8),
      projectId: selectedProjectId.substring(0, 8),
      sourceGenerationId: actualGenerationId.substring(0, 8),
    });

    setPromoteSuccess(false);

    try {
      const result = await promoteVariantMutation.mutateAsync({
        variantId,
        projectId: selectedProjectId,
        sourceGenerationId: actualGenerationId,
      });

      console.log('[PromoteVariant] Successfully created generation:', result.id.substring(0, 8));
      setPromoteSuccess(true);
      // Reset success state after delay
      setTimeout(() => setPromoteSuccess(false), 2000);
      // Stay on current item - don't navigate away
    } catch (error) {
      console.error('[PromoteVariant] Error promoting variant:', error);
      // Error toast is handled in the hook
    }
  }, [promoteVariantMutation, selectedProjectId, actualGenerationId]);

  // Handler for "Add as new image to shot" button in ShotSelectorControls
  // Positions new image between current and next item in the TARGET shot
  const handleAddVariantAsNewGenerationToShot = useCallback(async (
    shotId: string,
    variantId: string,
    currentTimelineFrame?: number
  ): Promise<boolean> => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return false;
    }

    console.log('[VariantToShot] Starting:', {
      shotId: shotId.substring(0, 8),
      variantId: variantId.substring(0, 8),
      projectId: selectedProjectId.substring(0, 8),
      sourceGenerationId: actualGenerationId.substring(0, 8),
      currentTimelineFrame,
    });

    try {
      // 1. Create the generation from the variant
      const newGen = await promoteVariantMutation.mutateAsync({
        variantId,
        projectId: selectedProjectId,
        sourceGenerationId: actualGenerationId,
      });

      console.log('[VariantToShot] Created generation:', newGen.id.substring(0, 8));

      // 2. Calculate target timeline frame by querying the TARGET shot's items
      let targetTimelineFrame: number | undefined;
      if (currentTimelineFrame !== undefined) {
        // Query the target shot to find the next item after current position
        const { data: shotItems } = await supabase
          .from('shot_generations')
          .select('timeline_frame')
          .eq('shot_id', shotId)
          .gt('timeline_frame', currentTimelineFrame)
          .order('timeline_frame', { ascending: true })
          .limit(1);

        const nextTimelineFrame = shotItems?.[0]?.timeline_frame ?? undefined;

        console.log('[VariantToShot] Frame calculation:', {
          currentTimelineFrame,
          nextTimelineFrame,
          hasNext: nextTimelineFrame !== undefined,
        });

        if (nextTimelineFrame !== undefined && nextTimelineFrame > currentTimelineFrame) {
          // Place in the middle between current and next
          targetTimelineFrame = Math.floor((currentTimelineFrame + nextTimelineFrame) / 2);
          console.log('[VariantToShot] Midpoint:', currentTimelineFrame, '+', nextTimelineFrame, '/ 2 =', targetTimelineFrame);
          // If middle would be same as current (consecutive frames), use current + 1
          if (targetTimelineFrame === currentTimelineFrame) {
            targetTimelineFrame = currentTimelineFrame + 1;
          }
        } else {
          // No next item in shot, place at current + 1
          targetTimelineFrame = currentTimelineFrame + 1;
          console.log('[VariantToShot] No next item, using current +1:', targetTimelineFrame);
        }
      }

      // 3. Add to shot
      await addImageToShotMutation.mutateAsync({
        shot_id: shotId,
        generation_id: newGen.id,
        project_id: selectedProjectId,
        imageUrl: newGen.location,
        thumbUrl: newGen.thumbnail_url || undefined,
        timelineFrame: targetTimelineFrame,
      });
      console.log('[VariantToShot] Added to shot at frame:', targetTimelineFrame);
      return true;
    } catch (error) {
      console.error('[VariantToShot] Error:', error);
      return false;
    }
  }, [promoteVariantMutation, addImageToShotMutation, selectedProjectId, actualGenerationId]);

  // Fetch available LoRAs - needed by edit modes and img2img
  const { data: availableLoras } = usePublicLoras();

  // LoRA manager for edit modes (text, inpaint, annotate, reposition)
  // Uses "Qwen Edit" type LoRAs from the resources table
  const editLoraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'none', // Don't persist for edit modes - quick tools
    enableProjectPersistence: false,
    disableAutoLoad: true,
  });

  // Compute effective LoRAs for edit mode task creation
  // Prioritize editLoraManager.selectedLoras over legacy editModeLoRAs
  const effectiveEditModeLoRAs = useMemo(() => {
    // If we have LoRAs selected via the new modal selector, use those
    if (editLoraManager.selectedLoras.length > 0) {
      return editLoraManager.selectedLoras.map(lora => ({
        url: lora.path,
        strength: lora.strength,
      }));
    }
    // Fall back to legacy editModeLoRAs (from dropdown selector)
    return editModeLoRAs;
  }, [editLoraManager.selectedLoras, editModeLoRAs]);

  // Inpainting hook
  const inpaintingHook = useInpainting({
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    isVideo,
    displayCanvasRef,
    maskCanvasRef,
    imageContainerRef,
    imageDimensions,
    handleExitInpaintMode: () => {
      // The hook will handle the state reset
    },
    loras: effectiveEditModeLoRAs,
    activeVariantId: activeVariant?.id, // Store strokes per-variant, not per-generation
    activeVariantLocation: activeVariant?.location, // Use variant's image URL when editing a variant
    createAsGeneration, // If true, create a new generation instead of a variant
    advancedSettings, // Pass advanced settings for hires fix
    // Canvas-based rendering URLs (for single canvas approach on mobile)
    // Use activeVariant.location if available, otherwise effectiveImageUrl
    imageUrl: !isVideo ? (activeVariant?.location || effectiveImageUrl) : undefined,
    thumbnailUrl: !isVideo ? (activeVariant?.thumbnail_url || media.thumbUrl) : undefined,
    // Pass persisted edit mode as initial value to prevent flash from 'text' default
    initialEditMode: persistedEditMode,
  });
  const {
    isInpaintMode,
    brushStrokes,
    isEraseMode,
    inpaintPrompt,
    inpaintNumGenerations,
    brushSize,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isAnnotateMode,
    editMode,
    annotationMode,
    selectedShapeId,
    showTextModeHint,
    setIsInpaintMode,
    setIsEraseMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,
    // Konva-based handlers
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
    handleUndo,
    handleClearMask,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,
    strokeOverlayRef,
    // Canvas-based rendering
    isImageLoaded: isInpaintImageLoaded,
    imageLoadError: inpaintImageLoadError,
    isDrawing,
    currentStroke,
  } = inpaintingHook;
  
  // ============================================
  // Sync persisted settings with useInpainting
  // ============================================
  
  // Track if we've synced initial values from persistence to inpainting
  const hasInitializedFromPersistenceRef = useRef(false);
  const lastSyncedGenerationIdRef = useRef<string | null>(null);
  
  // Reset sync tracking when generation changes
  useEffect(() => {
    if (actualGenerationId !== lastSyncedGenerationIdRef.current) {
      hasInitializedFromPersistenceRef.current = false;
      lastSyncedGenerationIdRef.current = actualGenerationId;
    }
  }, [actualGenerationId]);
  
  // Initialize inpainting state from persisted/lastUsed settings (once per generation)
  // IMPORTANT: Wait for isEditSettingsReady to ensure effective values are computed correctly
  useEffect(() => {
    if (
      isEditSettingsReady && 
      !hasInitializedFromPersistenceRef.current &&
      actualGenerationId
    ) {
      hasInitializedFromPersistenceRef.current = true;
      
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: Applying settings to inpainting state');
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: generationId:', actualGenerationId.substring(0, 8));
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: hasPersistedSettings:', hasPersistedSettings);
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: persistedEditMode:', persistedEditMode);
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: persistedNumGenerations:', persistedNumGenerations);
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: persistedPrompt:', persistedPrompt ? `"${persistedPrompt.substring(0, 30)}..."` : '(empty)');
      
      // Sync edit mode
      if (persistedEditMode && persistedEditMode !== editMode) {
        console.log('[EditSettingsPersist] 🔄 SYNC TO UI: Setting editMode from', editMode, 'to', persistedEditMode);
        setEditMode(persistedEditMode);
      }
      
      // Sync numGenerations
      if (persistedNumGenerations && persistedNumGenerations !== inpaintNumGenerations) {
        console.log('[EditSettingsPersist] 🔄 SYNC TO UI: Setting numGenerations from', inpaintNumGenerations, 'to', persistedNumGenerations);
        setInpaintNumGenerations(persistedNumGenerations);
      }
      
      // Sync prompt (only if has persisted settings - otherwise leave empty)
      if (hasPersistedSettings && persistedPrompt && persistedPrompt !== inpaintPrompt) {
        console.log('[EditSettingsPersist] 🔄 SYNC TO UI: Setting prompt');
        setInpaintPrompt(persistedPrompt);
      }
    }
  }, [
    isEditSettingsReady, 
    actualGenerationId, 
    hasPersistedSettings,
    persistedEditMode, 
    persistedNumGenerations, 
    persistedPrompt,
    editMode,
    inpaintNumGenerations,
    inpaintPrompt,
    setEditMode,
    setInpaintNumGenerations,
    setInpaintPrompt,
  ]);
  
  // Sync changes FROM inpainting TO persistence (debounced via the persistence hook)
  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;
    
    // Sync editMode changes
    if (editMode !== persistedEditMode) {
      console.log('[EditSettingsPersist] 💾 SYNC FROM UI: editMode changed to:', editMode);
      setPersistedEditMode(editMode);
    }
  }, [editMode, persistedEditMode, setPersistedEditMode, isEditSettingsReady]);
  
  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;
    
    // Sync numGenerations changes
    if (inpaintNumGenerations !== persistedNumGenerations) {
      console.log('[EditSettingsPersist] 💾 SYNC FROM UI: numGenerations changed to:', inpaintNumGenerations);
      setPersistedNumGenerations(inpaintNumGenerations);
    }
  }, [inpaintNumGenerations, persistedNumGenerations, setPersistedNumGenerations, isEditSettingsReady]);
  
  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;
    
    // Sync prompt changes
    if (inpaintPrompt !== persistedPrompt) {
      console.log('[EditSettingsPersist] 💾 SYNC FROM UI: prompt changed to:', inpaintPrompt ? `"${inpaintPrompt.substring(0, 30)}..."` : '(empty)');
      setPersistedPrompt(inpaintPrompt);
    }
  }, [inpaintPrompt, persistedPrompt, setPersistedPrompt, isEditSettingsReady]);
  
  // ============================================
  // End sync effects
  // ============================================
  
  // Handle exiting inpaint mode from UI buttons
  const handleExitInpaintMode = () => {
    console.log('[MediaLightbox] handleExitInpaintMode called');
    console.log('[MediaLightbox] handleExitInpaintMode stack:', new Error().stack);
    setIsInpaintMode(false);
  };

  // Magic Edit mode hook
  const magicEditHook = useMagicEditMode({
    media,
    selectedProjectId,
      autoEnterInpaint,
      isVideo,
        isInpaintMode,
    setIsInpaintMode,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    brushStrokes,
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    editModeLoRAs: effectiveEditModeLoRAs,
    sourceUrlForTasks,
    imageDimensions,
    toolTypeOverride,
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
    // Pass variant info for tracking source_variant_id (always track for complete lineage)
    activeVariantId: activeVariant?.id,
    activeVariantLocation: activeVariant?.location,
    createAsGeneration, // If true, create a new generation instead of a variant
    advancedSettings, // Pass advanced settings for hires fix
    qwenEditModel, // Pass model selection for cloud mode
    enabled: !isFormOnlyMode, // Disable DB queries in form-only mode (placeholder media)
  });
  const {
        isMagicEditMode,
    setIsMagicEditMode,
    magicEditPrompt,
    setMagicEditPrompt,
    magicEditNumImages,
    setMagicEditNumImages,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    isSpecialEditMode
  } = magicEditHook;

  // Persist panel mode for images when entering/exiting edit mode
  // Track previous value to detect transitions
  const prevIsSpecialEditModeRef = useRef(isSpecialEditMode);
  useEffect(() => {
    // Only handle for images (videos have separate handling)
    if (isVideo) return;

    const wasInEditMode = prevIsSpecialEditModeRef.current;
    prevIsSpecialEditModeRef.current = isSpecialEditMode;

    if (isSpecialEditMode && !wasInEditMode) {
      console.log('[PanelRestore] SAVING panelMode: edit (image entered special edit mode)');
      setPersistedPanelMode('edit');
    } else if (!isSpecialEditMode && wasInEditMode) {
      console.log('[PanelRestore] SAVING panelMode: info (image exited special edit mode)');
      setPersistedPanelMode('info');
    }
  }, [isSpecialEditMode, isVideo, setPersistedPanelMode]);

  // Reposition mode hook
  const repositionHook = useRepositionMode({
    media,
    selectedProjectId,
    imageDimensions,
    imageContainerRef,
    loras: effectiveEditModeLoRAs,
    inpaintPrompt,
    inpaintNumGenerations,
    handleExitInpaintMode: handleExitMagicEditMode,
    toolTypeOverride,
    shotId,
    onVariantCreated: setActiveVariantId,
    refetchVariants,
    createAsGeneration, // If true, create a new generation instead of a variant
    advancedSettings, // Pass advanced settings for hires fix
    activeVariantLocation: activeVariant?.location, // Use variant's image URL when editing a variant
    activeVariantId: activeVariant?.id, // Track source variant for lineage
    activeVariantParams: activeVariant?.params as Record<string, any> | null, // For loading saved transform data
  });
  const {
    transform: repositionTransform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    handleGenerateReposition,
    handleSaveAsVariant,
    getTransformStyle,
    isDragging: isRepositionDragging,
    dragHandlers: repositionDragHandlers,
  } = repositionHook;

  // Img2Img mode hook - uses persisted settings for strength and enablePromptExpansion
  const img2imgHook = useImg2ImgMode({
    media,
    selectedProjectId,
    isVideo,
    sourceUrlForTasks,
    toolTypeOverride,
    createAsGeneration,
    availableLoras,
    // Pass persisted values
    img2imgStrength: persistedImg2imgStrength,
    setImg2imgStrength: setPersistedImg2imgStrength,
    enablePromptExpansion: persistedImg2imgEnablePromptExpansion,
    setEnablePromptExpansion: setPersistedImg2imgEnablePromptExpansion,
    // Img2Img prompt is persisted separately to avoid cross-mode races
    img2imgPrompt: persistedImg2imgPrompt,
    setImg2imgPrompt: setPersistedImg2imgPrompt,
    img2imgPromptHasBeenSet: persistedImg2imgPromptHasBeenSet,
    // Number of generations (shared with other edit modes)
    numGenerations: persistedNumGenerations,
    // Use variant's image URL when editing a variant
    activeVariantLocation: activeVariant?.location,
    activeVariantId: activeVariant?.id, // Track source variant for lineage
  });
  const {
    img2imgPrompt,
    img2imgStrength,
    enablePromptExpansion,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    setImg2imgPrompt,
    setImg2imgStrength,
    setEnablePromptExpansion,
    handleGenerateImg2Img,
    loraManager: img2imgLoraManager,
  } = img2imgHook;

  // Layout mode hook
  const layoutHook = useLayoutMode({
    isMobile,
    showTaskDetails,
        isSpecialEditMode,
    isVideo,
    isInpaintMode,
    isMagicEditMode
  });
  const {
        isTabletOrLarger,
    isTouchLikeDevice,
        shouldShowSidePanel,
    isUnifiedEditMode,
    isPortraitMode
  } = layoutHook;

  // Source generation hook
  const { sourceGenerationData, sourcePrimaryVariant } = useSourceGeneration({
    media,
    onOpenExternalGeneration
  });

  // Generation name hook
  const generationNameHook = useGenerationName({ media, selectedProjectId });
  const {
    generationName,
    isEditingGenerationName,
    setIsEditingGenerationName,
    handleGenerationNameChange,
  } = generationNameHook;

  // References hook
  const referencesHook = useReferences({ media, selectedProjectId, isVideo, selectedShotId });
  const {
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
  } = referencesHook;

  // Add to Join Clips functionality
  const [isAddingToJoin, setIsAddingToJoin] = useState(false);
  const [addToJoinSuccess, setAddToJoinSuccess] = useState(false);
  const handleAddToJoin = useCallback(() => {
    if (!media || !isVideo) return;

    setIsAddingToJoin(true);
    try {
      // Get the video URL from the media object
      const videoUrl = (media as any).url || media.imageUrl || media.location;
      const thumbnailUrl = (media as any).thumbUrl || (media as any).thumbnail_url;

      // Get existing pending clips or start fresh
      const existingData = localStorage.getItem('pendingJoinClips');
      const pendingClips: Array<{ videoUrl: string; thumbnailUrl?: string; generationId: string; timestamp: number }> =
        existingData ? JSON.parse(existingData) : [];

      // Add new clip (avoid duplicates by generationId)
      if (!pendingClips.some(clip => clip.generationId === media.id)) {
        pendingClips.push({
          videoUrl,
          thumbnailUrl,
          generationId: media.id,
          timestamp: Date.now(),
        });
        localStorage.setItem('pendingJoinClips', JSON.stringify(pendingClips));
      }

      setAddToJoinSuccess(true);
      setTimeout(() => setAddToJoinSuccess(false), 2000);
    } catch (error) {
      console.error('[MediaLightbox] Failed to add to join:', error);
    } finally {
      setIsAddingToJoin(false);
    }
  }, [media, isVideo]);

  const handleGoToJoin = useCallback(() => {
    navigate('/tools/join-clips');
  }, [navigate]);

  // Generation lineage hook
  const lineageHook = useGenerationLineage({ media, enabled: !isFormOnlyMode });
  const {
    sourceGeneration,
    derivedItems,        // NEW: Unified list of generations + variants
    derivedGenerations,  // Legacy: Just generations (backwards compat)
    derivedPage,
    derivedTotalPages,
    paginatedDerived,
    setDerivedPage,
  } = lineageHook;
  
  // Log lineage data for debugging "Based On" feature
  useEffect(() => {
    console.log('[MediaLightbox:DerivedItems] 📊 Lineage hook results:', {
      mediaId: media.id.substring(0, 8),
      hasBasedOnField: !!(media as any).based_on,
      basedOnValue: (media as any).based_on?.substring(0, 8) || 'null',
      hasBasedOnInMetadata: !!(media.metadata as any)?.based_on,
      metadataBasedOn: (media.metadata as any)?.based_on?.substring(0, 8) || 'null',
      hasSourceGeneration: !!sourceGeneration,
      sourceGenerationId: sourceGeneration?.id.substring(0, 8) || 'null',
      hasDerivedItems: !!derivedItems && derivedItems.length > 0,
      derivedItemsCount: derivedItems?.length || 0,
      derivedGenerationsCount: derivedItems?.filter(d => d.itemType === 'generation').length || 0,
      derivedVariantsCount: derivedItems?.filter(d => d.itemType === 'variant').length || 0,
      hasOnOpenExternalGeneration: !!onOpenExternalGeneration,
      timestamp: Date.now()
    });
  }, [media.id, sourceGeneration, derivedItems, onOpenExternalGeneration]);

  // Shot creation hook
  const shotCreationHook = useShotCreation({ 
    media, 
    selectedProjectId, 
    allShots,
    onNavigateToShot,
    onClose,
    onShotChange,
  });
  const {
    isCreatingShot,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  } = shotCreationHook;

  // Navigation hook - use slot-aware handlers for unified navigation
  const navigationHook = useLightboxNavigation({
    onNext: handleSlotNavNext,
    onPrevious: handleSlotNavPrev,
    onClose,
  });
  const { safeClose, activateClickShield } = navigationHook;

  // Star toggle hook
  const starToggleHook = useStarToggle({ media, starred, shotId });
  const { localStarred, setLocalStarred, toggleStarMutation, handleToggleStar } = starToggleHook;

  // Shot positioning hook
  // Compute positionedInSelectedShot if not provided - check if media is in selected shot with position
  const computedPositionedInSelectedShot = useMemo(() => {
    if (typeof positionedInSelectedShot === 'boolean') {
      return positionedInSelectedShot; // Use provided override
    }
    // Not provided - return undefined to let useShotPositioning compute it from media data
    return undefined;
  }, [positionedInSelectedShot]);
  
  const shotPositioningHook = useShotPositioning({
    media,
    selectedShotId,
    allShots,
    positionedInSelectedShot: computedPositionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onNavigateToShot,
    onClose,
    onAddToShot,
    onAddToShotWithoutPosition,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
  });
  const {
      isAlreadyPositionedInSelectedShot,
      isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  } = shotPositioningHook;

  // ========================================
  // VIDEO TRIM HOOKS (available for all videos)
  // ========================================

  // Video trimming hook - manage trim state
  const trimmingHook = useVideoTrimming();
  const {
    trimState,
    setStartTrim,
    setEndTrim,
    resetTrim,
    setVideoDuration,
    trimmedDuration,
    hasTrimChanges,
  } = trimmingHook;

  // Keep video playing within constrained region when trim values change
  useEffect(() => {
    const video = trimVideoRef.current;
    if (!video || !isVideoTrimMode) return;
    
    const keepStart = trimState.startTrim;
    const keepEnd = trimState.videoDuration - trimState.endTrim;
    
    // If video is outside the new keep region, seek to start
    if (video.currentTime < keepStart || video.currentTime >= keepEnd) {
      video.currentTime = keepStart;
    }
    
    // Ensure video keeps playing
    if (video.paused) {
      video.play().catch(() => {
        // Ignore play errors (e.g., user interaction required)
      });
    }
  }, [isVideoTrimMode, trimState.startTrim, trimState.endTrim, trimState.videoDuration]);

  // Get the effective media URL (active variant or current media)
  // For videos in trim mode, use active variant if available
  // For images with selected edit variant, also use that variant
  const effectiveVideoUrl = useMemo(() => {
    if (isVideo && activeVariant) {
      return activeVariant.location;
    }
    return effectiveImageUrl;
  }, [isVideo, activeVariant, effectiveImageUrl]);

  // For images, use the active variant's location when a variant is explicitly selected
  const effectiveMediaUrl = useMemo(() => {
    console.log('[VariantClickDebug] effectiveMediaUrl computing:', {
      hasActiveVariant: !!activeVariant,
      activeVariantId: activeVariant?.id?.substring(0, 8),
      activeVariantIsPrimary: activeVariant?.is_primary,
      activeVariantLocation: activeVariant?.location?.substring(0, 50),
      effectiveImageUrl: effectiveImageUrl?.substring(0, 50),
    });
    
    // If an active variant is set (any variant, including primary), use its location
    if (activeVariant && activeVariant.location) {
      console.log('[VariantClickDebug] ✅ Using active variant location:', activeVariant.location.substring(0, 50));
      return activeVariant.location;
    }
    // Otherwise use the standard effective image URL
    console.log('[VariantClickDebug] Using effectiveImageUrl:', effectiveImageUrl?.substring(0, 50));
    return effectiveImageUrl;
  }, [activeVariant, effectiveImageUrl]);

  // Trim save hook - handle saving trimmed video
  const trimSaveHook = useTrimSave({
    generationId: media.id,
    projectId: selectedProjectId,
    sourceVideoUrl: effectiveVideoUrl,
    trimState,
    sourceVariantId: activeVariant?.id,
    onSuccess: (newVariantId) => {
      resetTrim();
      refetchVariants();
      // Set the newly created variant as the active one
      setActiveVariantId(newVariantId);
      setVideoEditSubMode(null);
      onTrimModeChange?.(false);
    },
  });
  const {
    isSaving: isSavingTrim,
    saveProgress: trimSaveProgress,
    saveError: trimSaveError,
    saveSuccess: trimSaveSuccess,
    saveTrimmedVideo,
  } = trimSaveHook;

  // Video Edit Mode hooks and state (for regenerating portions)
  // Get project for resolution
  const { projects } = useProject();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;

  // Video editing hook - handles all video edit state, validation, and generation
  const videoEditing = useVideoEditing({
    media,
    selectedProjectId,
    projectAspectRatio,
    isVideo,
    videoDuration: trimState.videoDuration,
    videoUrl: effectiveVideoUrl,
    onExitVideoEditMode: () => {
      // The hook handles setting isVideoEditMode to false internally
      onTrimModeChange?.(false);
    },
  });

  // Compute effective dimensions that are GUARANTEED to have a value
  // This is computed synchronously during render, so there's no flicker
  // Priority: extracted/loaded dimensions > project aspect ratio > 16:9 default
  const effectiveImageDimensions = React.useMemo(() => {
    // Use actual dimensions if we have them
    if (imageDimensions) {
      return imageDimensions;
    }

    // Fallback to project aspect ratio
    if (projectAspectRatio) {
      const resolution = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
      if (resolution && resolution.includes('x')) {
        const [w, h] = resolution.split('x').map(Number);
        if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
          console.log('[LightboxDimensions] Using project aspect ratio for effective dims:', {
            projectAspectRatio,
            resolution,
          });
          return { width: w, height: h };
        }
      }
    }

    // Absolute last resort: 16:9 default
    console.log('[LightboxDimensions] Using 16:9 default for effective dims');
    return { width: 1920, height: 1080 };
  }, [imageDimensions, projectAspectRatio]);

  // Extract source_task_id and check if variant already has orchestrator_details
  const { variantSourceTaskId, variantHasOrchestratorDetails } = useMemo(() => {
    const variantParams = activeVariant?.params as Record<string, any> | undefined;
    // Try multiple possible field names for the source task ID
    const taskId = variantParams?.source_task_id ||
                   variantParams?.orchestrator_task_id ||
                   variantParams?.task_id ||
                   null;
    // Validate it's a UUID before using (some params have non-UUID identifiers)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validTaskId = taskId && uuidRegex.test(taskId) ? taskId : null;
    const hasOrchestratorDetails = !!variantParams?.orchestrator_details;
    return { variantSourceTaskId: validTaskId, variantHasOrchestratorDetails: hasOrchestratorDetails };
  }, [activeVariant?.params, activeVariant?.id, activeVariant?.variant_type]);

  // Fetch the variant's source task when it differs from taskDetailsData
  // Skip fetch if variant already has orchestrator_details (e.g., clip_join variants)
  const { data: variantSourceTask, isLoading: isLoadingVariantTask } = useQuery({
    queryKey: ['variant-source-task', variantSourceTaskId],
    queryFn: async () => {
      if (!variantSourceTaskId) return null;
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', variantSourceTaskId)
        .single();
      if (error) {
        console.error('[VariantTaskDetails] Error fetching source task:', error);
        return null;
      }
      return data;
    },
    // Don't fetch if: no task ID, already have matching taskDetailsData, or variant has orchestrator_details
    enabled: !!variantSourceTaskId && variantSourceTaskId !== taskDetailsData?.taskId && !variantHasOrchestratorDetails,
    staleTime: 60000, // Cache for 1 minute
  });

  // For variants, show the variant's source task params instead of the original task
  // But ALWAYS preserve onApplySettingsFromTask so the Apply button shows
  const adjustedTaskDetailsData = useMemo(() => {
    // Check if we're viewing a variant that was created by a task (has source_task_id in params)
    const variantParams = activeVariant?.params as Record<string, any> | undefined;
    const isTaskCreatedVariant = activeVariant && variantParams && (
      variantParams.source_task_id ||
      variantParams.created_from ||
      (activeVariant.variant_type && activeVariant.variant_type !== 'original')
    );

    if (isTaskCreatedVariant && variantParams) {
      // Check if taskDetailsData already has the correct task (e.g., when opened from TasksPane)
      const hasMatchingTaskData = taskDetailsData?.taskId === variantParams.source_task_id && taskDetailsData?.task?.params;

      // Determine the best source of task params:
      // 1. If taskDetailsData matches, use its params (already have full data)
      // 2. If we fetched the source task, use its params
      // 3. Fall back to variant params (may be incomplete)
      // IMPORTANT: Use variant_type for display (e.g., 'clip_join'), NOT tool_type
      // tool_type is the tool that launched the task (e.g., 'travel-between-images'),
      // which is different from what kind of variant this is
      let effectiveParams = variantParams;
      const effectiveTaskType = activeVariant.variant_type || 'variant';

      if (hasMatchingTaskData) {
        effectiveParams = taskDetailsData.task.params;
      } else if (!variantParams.orchestrator_details && variantSourceTask?.params) {
        // Only use fetched task params if variant doesn't already have orchestrator_details
        // clip_join variants store orchestrator_details directly, so we don't want to overwrite
        effectiveParams = typeof variantSourceTask.params === 'string'
          ? JSON.parse(variantSourceTask.params)
          : variantSourceTask.params;
      }
      // Otherwise keep variantParams which may already have orchestrator_details (e.g., clip_join)

      // Extract input images using shared utility
      // This handles segment tasks (only segment images) vs full timeline tasks
      const variantInputImages = deriveInputImages(effectiveParams);

      return {
        task: {
          id: activeVariant.id,
          taskType: effectiveTaskType,
          params: effectiveParams,
          status: 'Complete',
          createdAt: activeVariant.created_at,
        },
        isLoading: isLoadingVariantTask,
        error: null,
        inputImages: variantInputImages,
        taskId: variantParams.source_task_id || activeVariant.id,
        // ALWAYS preserve onApplySettingsFromTask so Apply button shows for all variants
        onApplySettingsFromTask: taskDetailsData?.onApplySettingsFromTask,
      };
    }

    // If variants are still loading AND we don't have task data yet, show loading
    // But if we already have task data cached, show it immediately rather than blocking on variants
    // This provides better UX when task data is prefetched/cached
    // ALSO check if we're waiting for initialVariantId to be applied (clicked a specific variant)
    const waitingForInitialVariant = initialVariantId &&
      (!activeVariant || activeVariant.id !== initialVariantId);

    // Only override to loading if:
    // 1. Waiting for a specific variant (user clicked a variant)
    // 2. Variants loading AND no active variant AND task details still loading
    //    (If task details finished - either has task or knows there's none - don't block on variants)
    const shouldShowLoading = waitingForInitialVariant ||
      (isLoadingVariants && !activeVariant && taskDetailsData?.isLoading);

    if (shouldShowLoading) {
      return taskDetailsData ? { ...taskDetailsData, isLoading: true } : taskDetailsData;
    }

    // For all other cases, use the generation's task details as-is
    return taskDetailsData;
  }, [taskDetailsData, activeVariant, variantSourceTask, isLoadingVariantTask, isLoadingVariants, initialVariantId]);

  // Fetch shot's aspect ratio AND structure videos for regeneration
  // Structure videos are stored in shots.settings['travel-structure-video'] (via useStructureVideo hook)
  const { data: shotDataForRegen, isLoading: isLoadingShotAspectRatio } = useQuery({
    queryKey: ['shot-regen-data', shotId],
    queryFn: async () => {
      if (!shotId) return null;
      console.log('[StructureVideoFix] 🔍 [MediaLightbox] QUERY START - Fetching shot data for:', shotId?.substring(0, 8));
      const { data, error } = await supabase
        .from('shots')
        .select('aspect_ratio, settings')
        .eq('id', shotId)
        .single();
      if (error) {
        console.warn('[StructureVideoFix] ❌ [MediaLightbox] QUERY FAILED:', error);
        return null;
      }
      
      // DEBUG: Log ALL keys in settings to see where data actually lives
      const allSettings = data?.settings as Record<string, any>;
      const settingsKeys = allSettings ? Object.keys(allSettings) : [];
      console.log('[StructureVideoFix] 🗃️ [MediaLightbox] ALL SETTINGS KEYS:', settingsKeys);
      
      // NOTE: Structure videos are stored under 'travel-structure-video' key (via useStructureVideo hook)
      const structureVideoSettings = allSettings?.['travel-structure-video'] ?? {};
      // Also check wrong key for debugging
      const wrongKeySettings = allSettings?.['travel-between-images'] ?? {};
      
      console.log('[StructureVideoFix] 📦 [MediaLightbox] QUERY COMPLETE - Shot data fetched:', {
        shotId: shotId?.substring(0, 8),
        aspectRatio: data?.aspect_ratio,
        // Correct key (travel-structure-video)
        hasStructureVideos: !!(structureVideoSettings.structure_videos?.length > 0),
        structureVideosCount: structureVideoSettings.structure_videos?.length ?? 0,
        hasStructureGuidance: !!structureVideoSettings.structure_guidance,
        firstVideoPath: structureVideoSettings.structure_videos?.[0]?.path?.substring(0, 50) ?? '(none)',
        // Wrong key check (travel-between-images) 
        wrongKeyHasStructureVideos: !!(wrongKeySettings.structure_videos?.length > 0),
        wrongKeyCount: wrongKeySettings.structure_videos?.length ?? 0,
      });
      return {
        aspect_ratio: data?.aspect_ratio,
        structure_videos: structureVideoSettings.structure_videos ?? null,
        structure_guidance: structureVideoSettings.structure_guidance ?? null,
      };
    },
    enabled: !!shotId && isVideo,
    staleTime: 60000, // Cache for 1 minute
  });

  // Extract aspect ratio from combined query (backward compat)
  const shotAspectRatioData = shotDataForRegen?.aspect_ratio;

  // Compute effective resolution for regeneration: shot > project > stale params
  const effectiveRegenerateResolution = useMemo(() => {
    // Handle both cached formats: string (from this query) or object (from ChildGenerationsView cache)
    const aspectRatio = typeof shotAspectRatioData === 'string'
      ? shotAspectRatioData
      : shotAspectRatioData?.aspect_ratio;

    console.log('[MediaLightbox] [ResolutionDebug] Computing effectiveRegenerateResolution:', {
      shotId: shotId?.substring(0, 8),
      shotAspectRatioData,
      resolvedAspectRatio: aspectRatio,
      isLoadingShotAspectRatio,
      isVideo,
    });

    // Priority 1: Shot's aspect ratio
    if (aspectRatio) {
      const shotResolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatio];
      console.log('[MediaLightbox] [ResolutionDebug] Shot aspect ratio lookup:', {
        aspectRatio,
        mappedResolution: shotResolution,
        availableRatios: Object.keys(ASPECT_RATIO_TO_RESOLUTION),
      });
      if (shotResolution) {
        console.log('[MediaLightbox] [ResolutionDebug] ✅ Using SHOT resolution for regeneration:', {
          shotId: shotId?.substring(0, 8),
          aspectRatio,
          resolution: shotResolution
        });
        return shotResolution;
      }
    }
    // Priority 2: Fall back to project resolution (handled in SegmentRegenerateForm)
    console.log('[MediaLightbox] [ResolutionDebug] ⚠️ No shot resolution, will use project/params fallback');
    return undefined;
  }, [shotAspectRatioData, shotId, isLoadingShotAspectRatio, isVideo]);

  // Determine if regenerate mode is available for this video
  // Used to auto-fallback when persisted mode is 'regenerate' but it's not available
  const canRegenerate = useMemo(() => {
    if (!isVideo) return false;

    // Root parent videos (no parent_generation_id) cannot be regenerated
    const isRootParent = !(media as any).parent_generation_id;
    if (isRootParent) return false;

    // Join-clips outputs cannot be regenerated
    const mediaParams = (media as any).params as Record<string, any> | undefined;
    const toolType = (media.metadata as any)?.tool_type || mediaParams?.tool_type;
    if (toolType === 'join-clips') return false;

    // Need task params to regenerate
    const taskDataParams = adjustedTaskDetailsData?.task?.params;
    if (!taskDataParams && !mediaParams) return false;

    return true;
  }, [isVideo, media, adjustedTaskDetailsData]);

  // Create regenerate form for video edit panel
  // IMPORTANT: Use PRIMARY variant's params for regeneration, not the active variant's
  // This ensures regeneration respects the "main" variant's settings (e.g., LoRAs)
  const regenerateForm = useMemo(() => {
    // Use media.params as fallback when task params aren't available
    // This handles race conditions where task data hasn't loaded yet
    const mediaParams = (media as any).params as Record<string, any> | undefined;
    const taskDataParams = adjustedTaskDetailsData?.task?.params;

    // Don't show regenerate for root parent videos (final videos)
    // They don't have a parent_generation_id and regeneration doesn't make sense for them
    const isRootParent = !(media as any).parent_generation_id;
    if (isRootParent) {
      console.log('[MediaLightbox] [ResolutionDebug] regenerateForm: skipping (root parent video)');
      return null;
    }

    // Don't show regenerate for join-clips outputs - they don't have segments to regenerate
    const toolType = (media.metadata as any)?.tool_type || mediaParams?.tool_type;
    if (toolType === 'join-clips') {
      console.log('[MediaLightbox] [ResolutionDebug] regenerateForm: skipping (join-clips output)');
      return null;
    }

    if (!isVideo || (!taskDataParams && !mediaParams)) {
      console.log('[MediaLightbox] [ResolutionDebug] regenerateForm: skipping (not video or no params)', {
        isVideo,
        hasTaskParams: !!taskDataParams,
        hasMediaParams: !!mediaParams,
      });
      return null;
    }

    // Prefer primary variant's params if it has task data (source_task_id or orchestrator_details)
    // This ensures regeneration uses the "main" variant's settings, not whatever variant is being viewed
    const primaryParams = primaryVariant?.params as Record<string, any> | undefined;
    const primaryHasTaskData = primaryParams && (
      primaryParams.source_task_id ||
      primaryParams.orchestrator_details ||
      primaryParams.additional_loras
    );

    // Priority: primaryVariant params > task data params > media params (fallback)
    let taskParams = primaryHasTaskData
      ? primaryParams
      : (taskDataParams ?? mediaParams) as Record<string, any>;

    // Determine source for logging
    const paramsSource = primaryHasTaskData
      ? 'primaryVariant'
      : (taskDataParams ? 'adjustedTaskDetailsData' : 'mediaParams');

    console.log('[StructureVideoFix] [MediaLightbox] [RegenerateParams] Using params from:', {
      source: paramsSource,
      primaryVariantId: primaryVariant?.id?.substring(0, 8),
      primaryHasTaskData,
      hasAdditionalLoras: !!(taskParams.additional_loras || taskParams.orchestrator_details?.additional_loras),
    });

    // CRITICAL: Inject CURRENT shot's structure videos/guidance into params
    // The task params may be stale (from when the segment was created), but the shot
    // may now have a structure video configured. Use the shot's current config.
    //
    // NEW UNIFIED FORMAT: structure_guidance contains videos array inside it:
    // {
    //   "structure_guidance": {
    //     "target": "uni3c" | "vace",
    //     "videos": [{ path, start_frame, end_frame, treatment }],
    //     "strength": 1.0,
    //     // Uni3C: step_window, frame_policy, zero_empty_frames
    //     // VACE: preprocessing, canny_intensity, depth_contrast
    //   }
    // }
    const shotStructureVideos = shotDataForRegen?.structure_videos;
    let shotStructureGuidance: Record<string, unknown> | null = null;
    
    // Build unified structure_guidance from structure_videos array
    if (shotStructureVideos?.length > 0) {
      const firstVideo = shotStructureVideos[0];
      const isUni3cTarget = firstVideo.structure_type === 'uni3c';
      
      // Transform videos to the new format (strip structure_type, motion_strength, uni3c_* from each video)
      const cleanedVideos = shotStructureVideos.map((v: Record<string, unknown>) => ({
        path: v.path,
        start_frame: v.start_frame ?? 0,
        end_frame: v.end_frame ?? null,
        treatment: v.treatment ?? 'adjust',
        ...(v.metadata ? { metadata: v.metadata } : {}),
        ...(v.resource_id ? { resource_id: v.resource_id } : {}),
      }));
      
      shotStructureGuidance = {
        target: isUni3cTarget ? 'uni3c' : 'vace',
        videos: cleanedVideos,
        strength: firstVideo.motion_strength ?? 1.0,
      };
      
      if (isUni3cTarget) {
        // Uni3C specific params
        shotStructureGuidance.step_window = [
          firstVideo.uni3c_start_percent ?? 0,
          firstVideo.uni3c_end_percent ?? 1.0,
        ];
        shotStructureGuidance.frame_policy = 'fit';
        shotStructureGuidance.zero_empty_frames = true;
      } else {
        // VACE specific params
        const preprocessingMap: Record<string, string> = {
          'flow': 'flow',
          'canny': 'canny',
          'depth': 'depth',
          'raw': 'none',
        };
        shotStructureGuidance.preprocessing = preprocessingMap[firstVideo.structure_type ?? 'flow'] ?? 'flow';
        // Include optional VACE params if present
        if (firstVideo.canny_intensity != null) {
          shotStructureGuidance.canny_intensity = firstVideo.canny_intensity;
        }
        if (firstVideo.depth_contrast != null) {
          shotStructureGuidance.depth_contrast = firstVideo.depth_contrast;
        }
      }
      
      console.log('[StructureVideoFix] 🔧 [MediaLightbox] BUILT unified structure_guidance:', {
        target: shotStructureGuidance.target,
        videosCount: cleanedVideos.length,
        strength: shotStructureGuidance.strength,
        stepWindow: shotStructureGuidance.step_window,
        preprocessing: shotStructureGuidance.preprocessing,
        firstVideoPath: cleanedVideos[0]?.path?.substring(0, 50),
      });
    }
    
    // DEBUG: Always log the state of shotDataForRegen
    console.log('[StructureVideoFix] 🎯 [MediaLightbox] regenerateForm - shotDataForRegen state:', {
      shotId: shotId?.substring(0, 8),
      isLoadingShotAspectRatio,
      hasShotDataForRegen: !!shotDataForRegen,
      shotStructureVideosCount: shotStructureVideos?.length ?? 0,
      shotStructureGuidanceTarget: shotStructureGuidance?.target ?? '(none)',
      willInject: !!shotStructureGuidance,
    });
    
    if (shotStructureGuidance) {
      console.log('[StructureVideoFix] ✅ [MediaLightbox] INJECTING unified structure_guidance:', {
        target: shotStructureGuidance.target,
        videosCount: (shotStructureGuidance.videos as unknown[])?.length ?? 0,
        strength: shotStructureGuidance.strength,
      });
      
      // CLEANUP: Remove legacy structure params from orchestrator_details before injecting new unified format
      const cleanedOrchestratorDetails = { ...(taskParams.orchestrator_details || {}) };
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
      
      taskParams = {
        ...taskParams,
        // Include structure_guidance at top level for standalone segments
        structure_guidance: shotStructureGuidance,
        orchestrator_details: {
          ...cleanedOrchestratorDetails,
          // Also include in orchestrator_details for orchestrator tasks
          structure_guidance: shotStructureGuidance,
        },
      };
    } else {
      console.log('[StructureVideoFix] ⚠️ [MediaLightbox] NOT injecting - no structure videos from shot query');
    }

    const orchestratorDetails = taskParams.orchestrator_details || {};

    // Use shared utility to extract segment images (handles explicit URLs and array formats)
    const segmentIndex = taskParams.segment_index ?? 0;
    let segmentImageInfo = extractSegmentImages(taskParams, segmentIndex);

    // Priority 1: Use currentSegmentImages prop if provided (fresh timeline data)
    // This ensures regeneration uses the CURRENT timeline images, not stale stored params
    if (currentSegmentImages && (currentSegmentImages.startUrl || currentSegmentImages.endUrl)) {
        console.log('[MediaLightbox] [RegenerateImages] Using currentSegmentImages from timeline (overriding stored params):', {
          startUrl: currentSegmentImages.startUrl?.substring(0, 50),
          endUrl: currentSegmentImages.endUrl?.substring(0, 50),
        });
        segmentImageInfo = {
            startUrl: currentSegmentImages.startUrl,
            endUrl: currentSegmentImages.endUrl,
            startGenId: currentSegmentImages.startGenerationId,
            endGenId: currentSegmentImages.endGenerationId,
            hasImages: !!(currentSegmentImages.startUrl || currentSegmentImages.endUrl),
        };
    }
    // Priority 2: Fall back to passed inputImages if task params don't have them
    // This is critical for parent videos after "Join Segments" - the join task
    // doesn't have original input images, but the caller derives them from generation params
    else if (!segmentImageInfo.hasImages && adjustedTaskDetailsData?.inputImages?.length > 0) {
        console.log('[MediaLightbox] [RegenerateImages] Using passed inputImages as fallback:', adjustedTaskDetailsData.inputImages.length);
        const passedImages = adjustedTaskDetailsData.inputImages;
        segmentImageInfo = {
            startUrl: passedImages[0],
            endUrl: passedImages.length > 1 ? passedImages[passedImages.length - 1] : passedImages[0],
            startGenId: undefined,
            endGenId: undefined,
            hasImages: passedImages.length > 0,
        };
    }

    const { startUrl: startImageUrl, endUrl: endImageUrl, startGenId: startImageGenId, endGenId: endImageGenId } = segmentImageInfo;

    console.log('[MediaLightbox] [RegenerateImages] Image extraction:', {
      segmentIndex,
      hasImages: segmentImageInfo.hasImages,
      finalStartUrl: startImageUrl?.substring(0, 50),
      finalEndUrl: endImageUrl?.substring(0, 50),
    });

    // IMPORTANT: Only pass shot resolution, NOT stale params!
    // If shot resolution is undefined, let task creation logic (resolveProjectResolution)
    // fetch the correct resolution from the project. This prevents race conditions where
    // stale params have a different resolution than the current project/shot.
    const staleResolution = taskParams.parsed_resolution_wh || orchestratorDetails.parsed_resolution_wh;

    // For child segments, use the parent generation ID (not the segment's own ID)
    // This ensures new regenerations are linked to the correct parent
    // Priority: media field > orchestrator/task params > fall back to actualGenerationId
    const parentGenerationId = (media as any).parent_generation_id ||
                               orchestratorDetails.parent_generation_id ||
                               taskParams.parent_generation_id ||
                               actualGenerationId;

    console.log('[MediaLightbox] [ResolutionDebug] regenerateForm resolution computation:', {
      effectiveRegenerateResolution,
      taskParamsResolution: taskParams.parsed_resolution_wh,
      orchestratorResolution: orchestratorDetails.parsed_resolution_wh,
      staleResolution,
      finalResolution: effectiveRegenerateResolution || '(will be fetched by task creation)',
      source: effectiveRegenerateResolution ? 'SHOT' : 'TASK_CREATION_WILL_FETCH',
      mediaParentGenerationId: (media as any).parent_generation_id,
      parentGenerationId,
      actualGenerationId,
      isChildSegment: parentGenerationId !== actualGenerationId,
    });

    // Safe substring helper for debug logging (handles non-strings)
    const safeSubstr = (val: unknown): string => {
      if (typeof val === 'string') return val.substring(0, 8);
      if (val === null || val === undefined) return 'null';
      return `[${typeof val}]`;
    };

    // Extract pair_shot_generation_id for reading/writing per-pair metadata
    // This links regeneration to the specific timeline pair's settings
    // IMPORTANT: Prefer currentSegmentImages (live timeline) over stored params (may be stale)
    const orchPairIds = taskParams.orchestrator_details?.pair_shot_generation_ids;
    // Priority: segmentSlotMode (if available) > currentSegmentImages > task params
    const pairShotGenerationId = [
      segmentSlotMode?.pairData?.startImage?.id,  // Segment slot mode (highest priority - has fresh timeline data)
      currentSegmentImages?.startShotGenerationId,  // Live timeline prop
      taskParams.pair_shot_generation_id,
      taskParams.individual_segment_params?.pair_shot_generation_id,
      Array.isArray(orchPairIds) ? orchPairIds[segmentIndex] : undefined,
    ].find(v => typeof v === 'string') || undefined;

    // Debug: log pairShotGenerationId resolution
    console.log('[SegmentIdDebug] MediaLightbox pairShotGenerationId resolution:', {
      result: pairShotGenerationId?.substring(0, 8) || '(none)',
      sources: {
        segmentSlotMode_startImage_id: segmentSlotMode?.pairData?.startImage?.id?.substring(0, 8) || '(none)',
        currentSegmentImages_startShotGenerationId: currentSegmentImages?.startShotGenerationId?.substring(0, 8) || '(none)',
        taskParams_pair_shot_generation_id: taskParams.pair_shot_generation_id?.substring(0, 8) || '(none)',
        individual_segment_params: taskParams.individual_segment_params?.pair_shot_generation_id?.substring(0, 8) || '(none)',
        orchPairIds_segmentIndex: (Array.isArray(orchPairIds) ? orchPairIds[segmentIndex] : undefined)?.substring(0, 8) || '(none)',
      },
      hasSegmentSlotMode: !!segmentSlotMode,
      hasCurrentSegmentImages: !!currentSegmentImages,
      segmentIndex,
    });

    // Get the correct childGenerationId for regeneration
    // PRIMARY: Use activeChildGenerationId from slot (matched by pair_shot_generation_id in SegmentOutputStrip)
    // FALLBACK: If currentSegmentImages not provided, check if viewed media is a child segment
    // SAFETY: Validate video's pair_shot_generation_id matches current slot (defense against stale data)
    const isChildSegment = parentGenerationId !== actualGenerationId;
    const videoPairShotGenId = taskParams.pair_shot_generation_id ||
                               taskParams.individual_segment_params?.pair_shot_generation_id;
    const videoMatchesCurrentSlot = !pairShotGenerationId || !videoPairShotGenId ||
                                    pairShotGenerationId === videoPairShotGenId;

    // Use slot's activeChildGenerationId (source of truth), with fallback and safety check
    const childGenerationId = videoMatchesCurrentSlot
      ? (currentSegmentImages?.activeChildGenerationId || (isChildSegment ? actualGenerationId : undefined))
      : undefined;

    console.log('[MediaLightbox] childGenerationId resolution:', {
      activeChildFromSlot: safeSubstr(currentSegmentImages?.activeChildGenerationId),
      actualGenerationId: safeSubstr(actualGenerationId),
      isChildSegment,
      pairShotGenerationId: safeSubstr(pairShotGenerationId),
      videoPairShotGenId: safeSubstr(videoPairShotGenId),
      videoMatchesCurrentSlot,
      final: safeSubstr(childGenerationId) || 'null (will create new child)',
    });

    console.log('[PairMetadata] 🔗 MediaLightbox pairShotGenerationId sources (priority order):', {
      '1_fromCurrentSegmentImages': safeSubstr(currentSegmentImages?.startShotGenerationId),
      '2_fromTaskParams': safeSubstr(taskParams.pair_shot_generation_id),
      '3_fromIndividualSegmentParams': safeSubstr(taskParams.individual_segment_params?.pair_shot_generation_id),
      '4_fromOrchestratorDetails': Array.isArray(orchPairIds) ? safeSubstr(orchPairIds[segmentIndex]) : 'null',
      final: safeSubstr(pairShotGenerationId),
    });

    // Extract structure video props for the form
    const firstStructureVideo = shotStructureVideos?.[0];
    const structureVideoType = firstStructureVideo?.structure_type as 'uni3c' | 'flow' | 'canny' | 'depth' | undefined;
    const structureVideoDefaults = firstStructureVideo ? {
      motionStrength: firstStructureVideo.motion_strength ?? 1.2,
      treatment: (firstStructureVideo.treatment ?? 'adjust') as 'adjust' | 'clip',
      uni3cEndPercent: firstStructureVideo.uni3c_end_percent ?? 0.1,
    } : undefined;
    const structureVideoUrl = firstStructureVideo?.path;

    return (
      <SegmentRegenerateForm
        params={taskParams}
        projectId={selectedProjectId || null}
        generationId={parentGenerationId}
        shotId={shotId}
        childGenerationId={childGenerationId}
        segmentIndex={taskParams.segment_index ?? 0}
        startImageUrl={startImageUrl}
        endImageUrl={endImageUrl}
        startImageGenerationId={startImageGenId}
        endImageGenerationId={endImageGenId}
        projectResolution={effectiveRegenerateResolution}
        pairShotGenerationId={pairShotGenerationId}
        onFrameCountChange={onSegmentFrameCountChange}
        currentFrameCount={currentFrameCount}
        variantParamsToLoad={variantParamsToLoad}
        onVariantParamsLoaded={() => setVariantParamsToLoad(null)}
        structureVideoType={structureVideoType}
        structureVideoDefaults={structureVideoDefaults}
        structureVideoUrl={structureVideoUrl}
      />
    );
  }, [isVideo, adjustedTaskDetailsData, selectedProjectId, actualGenerationId, effectiveRegenerateResolution, media, primaryVariant, shotDataForRegen, shotId, currentSegmentImages, onSegmentFrameCountChange, currentFrameCount, variantParamsToLoad, setVariantParamsToLoad, segmentSlotMode]);

  // Handle entering video edit mode (unified) - restores last used sub-mode
  const handleEnterVideoEditMode = useCallback(() => {
    // Restore from persisted value (defaults to 'trim' if not set)
    let restoredMode = persistedVideoEditSubMode || 'trim';

    // Auto-fallback: if restoring to 'regenerate' but it's not available, use 'trim' instead
    if (restoredMode === 'regenerate' && !canRegenerate) {
      console.log('[EDIT_DEBUG] 🎬 handleEnterVideoEditMode: regenerate unavailable, falling back to trim');
      restoredMode = 'trim';
    }

    console.log('[EDIT_DEBUG] 🎬 handleEnterVideoEditMode: restoring to', restoredMode, '(persisted:', persistedVideoEditSubMode, ', canRegenerate:', canRegenerate, ')');
    setVideoEditSubMode(restoredMode);
    console.log('[PanelRestore] SAVING panelMode: edit (video entered edit mode)');
    setPersistedPanelMode('edit');

    // Set the appropriate mode flags based on restored sub-mode
    if (restoredMode === 'trim') {
      videoEditing.setIsVideoEditMode(false);
      onTrimModeChange?.(true);
    } else if (restoredMode === 'replace') {
      videoEditing.setIsVideoEditMode(true);
      resetTrim();
    } else if (restoredMode === 'regenerate') {
      videoEditing.setIsVideoEditMode(false);
      resetTrim();
    }

    // Try to capture video duration from already-loaded video element
    setTimeout(() => {
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach((video) => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          setVideoDuration(video.duration);
        }
      });
    }, 100);
  }, [onTrimModeChange, setVideoDuration, persistedVideoEditSubMode, setVideoEditSubMode, setPersistedPanelMode, canRegenerate, videoEditing, resetTrim]);

  // Handle exiting video edit mode entirely
  const handleExitVideoEditMode = useCallback(() => {
    console.log('[EDIT_DEBUG] 🎬 handleExitVideoEditMode: switching to Info panel');
    setVideoEditSubMode(null);
    console.log('[PanelRestore] SAVING panelMode: info (exited video edit mode)');
    setPersistedPanelMode('info');
    resetTrim();
    videoEditing.setIsVideoEditMode(false);
    onTrimModeChange?.(false);
  }, [resetTrim, videoEditing, onTrimModeChange, setVideoEditSubMode, setPersistedPanelMode]);

  // Handle switching to trim sub-mode
  const handleEnterVideoTrimMode = useCallback(() => {
    console.log('[EDIT_DEBUG] 🎬 handleEnterVideoTrimMode');
    setVideoEditSubMode('trim');
    videoEditing.setIsVideoEditMode(false);
    onTrimModeChange?.(true);

    // Try to capture video duration
    setTimeout(() => {
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach((video) => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          setVideoDuration(video.duration);
        }
      });
    }, 100);
  }, [videoEditing, onTrimModeChange, setVideoDuration, setVideoEditSubMode]);

  // Handle switching to replace (portion) sub-mode
  const handleEnterVideoReplaceMode = useCallback(() => {
    console.log('[EDIT_DEBUG] 🎬 handleEnterVideoReplaceMode');
    setVideoEditSubMode('replace');
    videoEditing.setIsVideoEditMode(true);
    resetTrim();
  }, [videoEditing, resetTrim, setVideoEditSubMode]);

  // Handle switching to regenerate (full segment) sub-mode
  const handleEnterVideoRegenerateMode = useCallback(() => {
    console.log('[EDIT_DEBUG] 🎬 handleEnterVideoRegenerateMode');
    setVideoEditSubMode('regenerate');
    videoEditing.setIsVideoEditMode(false);
    resetTrim();
  }, [videoEditing, resetTrim, setVideoEditSubMode]);

  // Legacy handler for exiting trim mode specifically
  const handleExitVideoTrimMode = useCallback(() => {
    console.log('[EDIT_DEBUG] 🎬 handleExitVideoTrimMode');
    setVideoEditSubMode(null);
    resetTrim();
    onTrimModeChange?.(false);
  }, [resetTrim, onTrimModeChange, setVideoEditSubMode]);

  // Track if we're in any video edit sub-mode (trim, replace, or regenerate)
  const isVideoTrimModeActive = isVideo && isVideoTrimMode;
  const isVideoReplaceModeActive = isVideo && videoEditSubMode === 'replace';
  const isVideoRegenerateModeActive = isVideo && videoEditSubMode === 'regenerate';

  // Track if we're in video edit mode (for regenerating portions) - sync with hook state
  const isVideoEditModeActive = isVideo && videoEditing.isVideoEditMode;

  // Alias for template usage - true when in regenerate sub-mode
  const isVideoEditMode = videoEditing.isVideoEditMode;

  // Combined special edit mode (for hiding certain UI elements)
  const isAnySpecialEditMode = isSpecialEditMode || isVideoTrimModeActive || isVideoEditModeActive;

  // Should show side panel (includes video trim mode and video edit mode)
  // On portrait mode or phones, use stacked layout; on landscape tablet+, use side panel layout
  const shouldShowSidePanelWithTrim = shouldShowSidePanel || ((!isPortraitMode && isTabletOrLarger) && (isVideoTrimModeActive || isVideoEditModeActive));

  // ========================================
  // UNIFIED LAYOUT MODE
  // ========================================
  // Single source of truth for layout decisions, replacing scattered conditionals.
  // - 'fullscreen': Takes full viewport (mobile, or form-only mode, or side panel modes)
  // - 'centered': Centered auto-size dialog (desktop image view without special modes)
  const needsFullscreenLayout = isMobile || isFormOnlyMode || shouldShowSidePanel || shouldShowSidePanelWithTrim;

  // Should account for tasks pane width offset (only on tablet+ in landscape with pane open)
  const needsTasksPaneOffset = needsFullscreenLayout && effectiveTasksPaneOpen && !isPortraitMode && isTabletOrLarger;

  // DEBUG: Log variants state for troubleshooting variant display issues
  React.useEffect(() => {
    console.log('[VariantDisplay] 🔍 Variants display debug:', {
      mediaId: media.id?.substring(0, 8),
      variantFetchGenerationId: variantFetchGenerationId?.substring(0, 8),
      variantsCount: variants?.length || 0,
      variantsArray: variants?.map(v => ({ id: v.id?.substring(0, 8), type: v.variant_type, isPrimary: v.is_primary })),
      isLoadingVariants,
      shouldShowVariants: variants && variants.length >= 1,
      shouldShowSidePanel,
      shouldShowSidePanelWithTrim,
      isVideoTrimModeActive,
      isVideoEditModeActive,
      isSpecialEditMode,
      showTaskDetails,
      isVideo,
    });
  }, [media.id, variantFetchGenerationId, variants, isLoadingVariants, shouldShowSidePanel, shouldShowSidePanelWithTrim, isVideoTrimModeActive, isVideoEditModeActive, isSpecialEditMode, showTaskDetails, isVideo]);

  // ========================================
  // AUTO-RESTORE PANEL MODE - Restore Edit mode if that was last used
  // ========================================
  const hasRestoredPanelModeRef = useRef(false);

  useEffect(() => {
    console.log('[PanelRestore] Effect triggered', {
      hasRestoredAlready: hasRestoredPanelModeRef.current,
      persistedPanelMode,
      isVideo,
      isSpecialEditMode,
      isInVideoEditMode,
      initialVideoTrimMode,
      autoEnterInpaint,
    });

    // Only restore once per media (prevent loops)
    if (hasRestoredPanelModeRef.current) {
      console.log('[PanelRestore] Skipping: already restored for this media');
      return;
    }

    // Don't restore if initialVideoTrimMode or autoEnterInpaint is set (explicit modes take precedence)
    if (initialVideoTrimMode || autoEnterInpaint) {
      console.log('[PanelRestore] Skipping: explicit mode requested', {
        initialVideoTrimMode,
        autoEnterInpaint,
      });
      hasRestoredPanelModeRef.current = true;
      return;
    }

    // Don't restore if already in edit mode
    if (isSpecialEditMode || isInVideoEditMode) {
      console.log('[PanelRestore] Skipping: already in edit mode', {
        isSpecialEditMode,
        isInVideoEditMode,
      });
      hasRestoredPanelModeRef.current = true;
      return;
    }

    if (persistedPanelMode === 'edit') {
      hasRestoredPanelModeRef.current = true;
      if (isVideo) {
        console.log('[PanelRestore] Restoring VIDEO to edit mode');
        setTimeout(() => handleEnterVideoEditMode(), 0);
      } else {
        console.log('[PanelRestore] Restoring IMAGE to edit mode (calling handleEnterMagicEditMode)');
        setTimeout(() => handleEnterMagicEditMode(), 0);
      }
    } else {
      console.log('[PanelRestore] Staying in INFO mode (persistedPanelMode:', persistedPanelMode, ')');
      hasRestoredPanelModeRef.current = true;
    }
  }, [persistedPanelMode, isVideo, handleEnterVideoEditMode, handleEnterMagicEditMode, initialVideoTrimMode, autoEnterInpaint, isSpecialEditMode, isInVideoEditMode]);

  // Reset restore flag when media changes
  useEffect(() => {
    console.log('[PanelRestore] Media changed, resetting restore flag', { mediaId: media.id?.substring(0, 8) });
    hasRestoredPanelModeRef.current = false;
  }, [media.id]);

  // ========================================
  // SWIPE NAVIGATION - Mobile/iPad gesture support
  // ========================================
  
  const swipeNavigation = useSwipeNavigation({
    onSwipeLeft: () => {
      if (hasNext) {
        console.log('[SwipeNav] Executing handleSlotNavNext');
        handleSlotNavNext();
      }
    },
    onSwipeRight: () => {
      if (hasPrevious) {
        console.log('[SwipeNav] Executing handleSlotNavPrev');
        handleSlotNavPrev();
      }
    },
    disabled:
      isAnySpecialEditMode ||
      readOnly ||
      !showNavigation,
    hasNext,
    hasPrevious,
    threshold: 50,
    velocityThreshold: 0.3,
  });

  // ========================================
  // SIMPLE HANDLERS - Just call props
  // ========================================

  const handleDownload = async () => {
    // Use the effective media URL (may be a variant)
    const urlToDownload = isVideo ? effectiveVideoUrl : effectiveMediaUrl;
    // Extract prompt from various possible sources for a better filename
    // Use migration utility to read segment overrides (handles new + old format)
    const segmentOverrides = readSegmentOverrides(media.metadata as Record<string, any> | null);
    const prompt = (media.params as any)?.prompt ||
                   (media.metadata as any)?.enhanced_prompt ||
                   segmentOverrides.prompt ||
                   (media.metadata as any)?.prompt;
    await downloadMedia(urlToDownload, media.id, isVideo, media.contentType, prompt);
  };

  const handleDelete = () => {
    if (onDelete) {
      // Delete the item - the parent will handle navigation automatically
      onDelete(media.id);
    }
  };

  // Centralized button group props - prevents prop divergence across layout branches
  const buttonGroupProps = useButtonGroupProps({
    // Shared base props
    isVideo,
    readOnly,
    isSpecialEditMode,
    selectedProjectId,
    isCloudMode,
    mediaId: media.id,

    // TopLeft & BottomLeft - Edit mode
    handleEnterMagicEditMode,

    // TopRight - Download & Delete
    showDownload,
    handleDownload,
    onDelete,
    handleDelete,
    isDeleting,
    onClose,

    // BottomLeft - Upscale
    isUpscaling,
    isPendingUpscale,
    hasUpscaledVersion,
    showingUpscaled,
    handleUpscale,
    handleToggleUpscaled,

    // BottomRight - Star & References
    localStarred,
    handleToggleStar,
    toggleStarPending: toggleStarMutation.isPending,
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
    handleAddToJoin,
    isAddingToJoin,
    addToJoinSuccess,
    onGoToJoin: handleGoToJoin,
  });

  const handleApplySettings = () => {
    if (onApplySettings) {
      onApplySettings(media.metadata);
    }
  };

  const handleShowTaskDetails = () => {
    if (onShowTaskDetails) {
      onShowTaskDetails();
    }
  };
  
  // Handle navigation to shot from the dropdown
  const handleNavigateToShotFromSelector = React.useCallback((shot: { id: string; name: string }) => {
    if (onNavigateToShot) {
      // Build a minimal Shot object compatible with navigation
      const minimalShot = {
        id: shot.id,
        name: shot.name,
        images: [],
        position: 0,
      };
      // Close the lightbox first, then navigate
      onClose();
      onNavigateToShot(minimalShot);
    }
  }, [onNavigateToShot, onClose]);
  
  // Replace in shot handler - swaps timeline position from parent to current image
  const handleReplaceInShot = React.useCallback(async (
    parentGenerationId: string,
    currentMediaId: string,
    parentTimelineFrame: number,
    shotIdParam: string
  ) => {
    console.log('[ReplaceInShot] Handler started', {
      parentId: parentGenerationId.substring(0, 8),
      currentId: currentMediaId.substring(0, 8),
      frame: parentTimelineFrame,
      shotId: shotIdParam.substring(0, 8)
    });
    
    try {
      // 1. Remove timeline_frame from parent's shot_generation record
      const { error: removeError } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: null })
        .eq('generation_id', parentGenerationId)
        .eq('shot_id', shotIdParam);
      
      if (removeError) throw removeError;
      
      // 2. Update or create shot_generation for current image with the timeline_frame
      // First check if current image already has a shot_generation for this shot
      const { data: existingAssoc } = await supabase
        .from('shot_generations')
        .select('id')
        .eq('generation_id', currentMediaId)
        .eq('shot_id', shotIdParam)
        .single();
      
      if (existingAssoc) {
        // Update existing
        const { error: updateError } = await supabase
          .from('shot_generations')
          .update({ 
            timeline_frame: parentTimelineFrame,
            metadata: { user_positioned: true, drag_source: 'replace_parent' }
          })
          .eq('id', existingAssoc.id);
        
        if (updateError) throw updateError;
      } else {
        // Create new
        const { error: createError } = await supabase
          .from('shot_generations')
          .insert({
            shot_id: shotIdParam,
            generation_id: currentMediaId,
            timeline_frame: parentTimelineFrame,
            metadata: { user_positioned: true, drag_source: 'replace_parent' }
          });
        
        if (createError) throw createError;
      }
      
      console.log('[ReplaceInShot] Handler completed successfully');
      
      // Close lightbox to force refresh when reopened
      onClose();
    } catch (error) {
      console.error('[ReplaceInShot] Handler failed:', error);
      throw error;
    }
  }, [onClose]);

  // Determine if current view can show "Make main variant" button
  // Case 1: Viewing a child generation that's based on something
  // Case 2: Viewing a non-primary variant of the current generation
  // Note: isViewingNonPrimaryVariant is defined earlier with the variants hook
  const canMakeMainVariantFromChild = !!sourceGenerationData && !!media.location;
  const canMakeMainVariantFromVariant = isViewingNonPrimaryVariant && !!activeVariant.location;
  const canMakeMainVariant = canMakeMainVariantFromChild || canMakeMainVariantFromVariant;

  // Log the canMakeMainVariant state
  console.log('[VariantClickDebug] canMakeMainVariant computed:', {
    canMakeMainVariant,
    canMakeMainVariantFromChild,
    canMakeMainVariantFromVariant,
    isViewingNonPrimaryVariant,
    activeVariantId: activeVariant?.id?.substring(0, 8),
    activeVariantIsPrimary: activeVariant?.is_primary,
    hasSourceGenerationData: !!sourceGenerationData,
    sourceGenerationId: sourceGenerationData?.id?.substring(0, 8),
    hasMediaLocation: !!media.location,
  });

  // Make main variant handler - handles two cases:
  // 1. Viewing a child generation: creates a variant on the parent with child's content
  // 2. Viewing a non-primary variant: sets that variant as primary
  const handleMakeMainVariant = React.useCallback(async () => {
    console.log('[VariantClickDebug] handleMakeMainVariant called in MediaLightbox', {
      canMakeMainVariantFromChild,
      canMakeMainVariantFromVariant,
      activeVariantId: activeVariant?.id?.substring(0, 8),
    });

    setIsMakingMainVariant(true);
    try {
      // Case 2: We're viewing a non-primary variant - just set it as primary
      if (canMakeMainVariantFromVariant && activeVariant) {
        console.log('[VariantClickDebug] Setting existing variant as primary:', activeVariant.id.substring(0, 8));
        await setPrimaryVariant(activeVariant.id);
        console.log('[VariantClickDebug] Successfully set variant as primary');
        // Refetch variants to update UI
        refetchVariants();
        return;
      }

      // Case 1: We're viewing a child generation - create variant on parent
      if (!sourceGenerationData || !media.location) {
        console.log('[VariantClickDebug] handleMakeMainVariant bailing - missing data:', {
          hasSourceGenerationData: !!sourceGenerationData,
          hasMediaLocation: !!media.location,
        });
        return;
      }

      const parentGenId = sourceGenerationData.id;
      console.log('[VariantClickDebug] Creating variant on parent generation', {
        parentId: parentGenId.substring(0, 8),
        currentId: media.id.substring(0, 8),
        currentLocation: media.location.substring(0, 50)
      });
      // 1. Create a new variant on the parent generation with current media's location
      const { data: insertedVariant, error: insertError } = await supabase
        .from('generation_variants')
        .insert({
          generation_id: parentGenId,
          location: media.location,
          thumbnail_url: media.thumbUrl || (media as any).thumbnail_url || null,
          is_primary: true,
          variant_type: 'child_promoted',
          name: null,
          params: {
            source_generation_id: media.id,
            promoted_at: new Date().toISOString()
          }
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[VariantClickDebug] Failed to create variant:', insertError);
        throw insertError;
      }

      console.log('[VariantClickDebug] Created variant:', insertedVariant?.id?.substring(0, 8));

      // 2. Update the parent generation's location and thumbnail
      const { error: updateError } = await supabase
        .from('generations')
        .update({
          location: media.location,
          thumbnail_url: media.thumbUrl || (media as any).thumbnail_url
        })
        .eq('id', parentGenId);

      if (updateError) {
        console.warn('[VariantClickDebug] Failed to update parent generation:', updateError);
      }

      console.log('[VariantClickDebug] Successfully made current media the main variant');

      // Invalidate caches so all views update (timeline, shot editor, galleries, variants list).
      // Use selectedShotId if available (most likely current context), else fall back to shotId.
      await invalidateVariantChange(queryClient, {
        generationId: parentGenId,
        shotId: selectedShotId || shotId,
        reason: 'child-promoted-to-primary',
      });

      // Close the lightbox (UI will now reflect updated data without refresh)
      onClose();
    } catch (error) {
      console.error('[VariantClickDebug] handleMakeMainVariant failed:', error);
    } finally {
      setIsMakingMainVariant(false);
    }
  }, [
    sourceGenerationData,
    media,
    onClose,
    canMakeMainVariantFromChild,
    canMakeMainVariantFromVariant,
    activeVariant,
    setPrimaryVariant,
    refetchVariants,
    queryClient,
    selectedShotId,
    shotId,
  ]);

  return (
    <TooltipProvider delayDuration={500}>
      <DialogPrimitive.Root
        open={true}
        // Modal mode blocks body scroll and traps focus
        // On tablet/desktop, always disable modal to allow TasksPane scrolling
        // (changing modal dynamically causes the dialog to flash/remount)
        // On mobile, keep modal=true for proper scroll locking
        modal={isMobile}
        onOpenChange={() => {
          // Prevent automatic closing - we handle all closing manually
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed z-[100000] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              // Disable animations on mobile to prevent blink during zoom/fade
              isMobile ? "" : "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "p-0 border-none shadow-none"
            )}
            onPointerDown={(e) => {
              // Track where the pointer down started
              pointerDownTargetRef.current = e.target;
              
              // Check if a higher z-index dialog is open - if so, don't block events
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                // MediaLightbox uses z-[100000], check if any higher z-index dialogs are open
                return zIndex > 100000;
              });
              
              if (hasHigherZIndexDialog) {
                return; // Let the higher dialog handle the event
              }
              
              // Completely block all pointer events from reaching underlying elements
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onPointerUp={(e) => {
              // Check if a higher z-index dialog is open - if so, don't block events
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                return zIndex > 100000;
              });
              
              if (hasHigherZIndexDialog) {
                return; // Let the higher dialog handle the event
              }
              
              // Block pointer up events to prevent accidental interactions
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onClick={(e) => {
              // Check if a higher z-index dialog is open - if so, don't handle the click
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                return zIndex > 100000;
              });

              if (hasHigherZIndexDialog) {
                return; // Let the higher dialog handle the event
              }

              // Prevent closing when in inpaint mode to avoid accidental data loss
              if (isInpaintMode) {
                pointerDownTargetRef.current = null; // Reset
                return;
              }

              // Close on single click if both pointer down and click are on the overlay itself
              // This prevents accidental closure when dragging from inside the modal
              const clickStartedOnOverlay = pointerDownTargetRef.current === e.currentTarget;
              const clickEndedOnOverlay = e.target === e.currentTarget;

              if (clickStartedOnOverlay && clickEndedOnOverlay) {
                onClose();
              }

              pointerDownTargetRef.current = null; // Reset
            }}
            onDoubleClick={(e) => {
              // Check if a higher z-index dialog is open - if so, don't handle the click
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                return zIndex > 100000;
              });
              
              if (hasHigherZIndexDialog) {
                return; // Let the higher dialog handle the event
              }
              
              // Prevent closing when in inpaint mode to avoid accidental data loss
              if (isInpaintMode) {
                return;
              }
              
              // Only close if BOTH the click started AND ended on the overlay
              // This prevents accidental closure when dragging from inside the modal
              const clickStartedOnOverlay = pointerDownTargetRef.current === e.currentTarget;
              const clickEndedOnOverlay = e.target === e.currentTarget;
              
              if (clickStartedOnOverlay && clickEndedOnOverlay) {
                onClose();
              }
            }}
            onTouchStart={(e) => {
              // Track where touch started for double-tap detection
              touchStartTargetRef.current = e.target;
              
              // Check if touch started directly on overlay (for double-tap to close)
              // e.target is the element that was touched, e.currentTarget is the overlay
              const touchedDirectlyOnOverlay = e.target === e.currentTarget;
              touchStartedOnOverlayRef.current = touchedDirectlyOnOverlay;
              
              console.log('[TouchDebug] 👆 Touch started on OVERLAY:', {
                directlyOnOverlay: touchedDirectlyOnOverlay,
                targetTagName: (e.target as HTMLElement).tagName,
                targetClassName: (e.target as HTMLElement).className?.substring?.(0, 50),
                isInpaintMode,
                timestamp: Date.now()
              });
              
              // Allow touch events on canvas when in inpaint mode
              const target = e.target as HTMLElement;
              if (isInpaintMode && target.tagName === 'CANVAS') {
                console.log('[InpaintPaint] 🎨 Allowing touch on canvas');
                return; // Don't stop propagation for canvas
              }
              
              // Allow touch events on interactive elements (buttons, inputs, etc.)
              const isInteractive = target.tagName === 'BUTTON' || 
                                   target.tagName === 'INPUT' || 
                                   target.tagName === 'TEXTAREA' || 
                                   target.tagName === 'SELECT' || 
                                   target.tagName === 'A' ||
                                   target.closest('button') !== null ||
                                   target.closest('a') !== null;
              
              if (isInteractive) {
                console.log('[TouchDebug] 🎯 Allowing touch on interactive element:', target.tagName);
                return; // Allow propagation for interactive elements
              }
              
              // Block touch events from bubbling through dialog content
              if (isMobile) e.stopPropagation();
            }}
            onTouchMove={(e) => {
              // Allow touch events on canvas when in inpaint mode
              const target = e.target as HTMLElement;
              if (isInpaintMode && target.tagName === 'CANVAS') {
                console.log('[InpaintPaint] 🖌️ Allowing touch move on canvas');
                return; // Don't stop propagation for canvas
              }
              
              // Allow touch events on interactive elements (buttons, inputs, etc.)
              const isInteractive = target.tagName === 'BUTTON' || 
                                   target.tagName === 'INPUT' || 
                                   target.tagName === 'TEXTAREA' || 
                                   target.tagName === 'SELECT' || 
                                   target.tagName === 'A' ||
                                   target.closest('button') !== null ||
                                   target.closest('a') !== null;
              
              if (isInteractive) {
                return; // Allow propagation for interactive elements
              }
              
              // Block touch move events from bubbling through dialog content
              if (isMobile) e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              // Allow touch events on canvas when in inpaint mode
              const target = e.target as HTMLElement;
              if (isInpaintMode && target.tagName === 'CANVAS') {
                console.log('[InpaintPaint] 🛑 Allowing touch end on canvas');
                return; // Don't stop propagation for canvas
              }
              
              // Allow touch events on interactive elements (buttons, inputs, etc.)
              const isInteractive = target.tagName === 'BUTTON' || 
                                   target.tagName === 'INPUT' || 
                                   target.tagName === 'TEXTAREA' || 
                                   target.tagName === 'SELECT' || 
                                   target.tagName === 'A' ||
                                   target.closest('button') !== null ||
                                   target.closest('a') !== null;
              
              if (isInteractive) {
                return; // Allow propagation for interactive elements
              }
              
              // Detect double-tap to close on mobile/iPad (only on overlay background)
              // Use touchStartedOnOverlayRef which was set in onTouchStart for more reliable detection
              const touchEndedOnOverlay = e.target === e.currentTarget;
              const validOverlayTap = touchStartedOnOverlayRef.current && touchEndedOnOverlay;
              
              console.log('[TouchDebug] 👆 Touch ended on OVERLAY:', {
                touchStartedOnOverlay: touchStartedOnOverlayRef.current,
                touchEndedOnOverlay,
                validOverlayTap,
                isInpaintMode,
                timestamp: Date.now()
              });
              
              if (!isInpaintMode && validOverlayTap) {
                const currentTime = Date.now();
                const timeSinceLastTap = currentTime - lastTapTimeRef.current;
                
                console.log('[TouchDebug] ⏱️ Double-tap check:', {
                  timeSinceLastTap,
                  threshold: DOUBLE_TAP_DELAY,
                  isWithinThreshold: timeSinceLastTap < DOUBLE_TAP_DELAY,
                  lastTapTargetMatches: lastTapTargetRef.current === e.currentTarget
                });
                
                // Check if this is a double-tap (within DOUBLE_TAP_DELAY and same target)
                if (timeSinceLastTap < DOUBLE_TAP_DELAY && lastTapTargetRef.current === e.currentTarget) {
                  console.log('[MediaLightbox] 📱 Double-tap detected on overlay, closing...');
                  onClose();
                  lastTapTimeRef.current = 0; // Reset
                  lastTapTargetRef.current = null;
                } else {
                  // First tap - record it
                  console.log('[TouchDebug] 📝 First tap recorded, waiting for second tap...');
                  lastTapTimeRef.current = currentTime;
                  lastTapTargetRef.current = e.currentTarget;
                }
              }
              
              // Reset touch tracking
              touchStartTargetRef.current = null;
              touchStartedOnOverlayRef.current = false;
              
              // Block touch end events from bubbling through dialog content
              if (isMobile) e.stopPropagation();
            }}
            onTouchCancel={(e) => {
              // Reset touch tracking on cancel
              touchStartTargetRef.current = null;
              touchStartedOnOverlayRef.current = false;
              
              // Check if a higher z-index dialog is open - if so, don't block events
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                return zIndex > 100000;
              });
              
              if (hasHigherZIndexDialog) {
                return; // Let the higher dialog handle the event
              }
              
              // Block touch cancel events on mobile
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            style={{ 
              // Ensure the overlay captures all pointer events
              pointerEvents: 'all',
              touchAction: 'none',
              // CRITICAL: cursor:pointer is required for iOS to register touch events!
              // See: https://github.com/facebook/react/issues/7635
              cursor: 'pointer',
              // Make sure overlay is above everything else
              zIndex: 10000,
              // Ensure full coverage
              position: 'fixed',
              top: 0,
              left: 0,
              // Adjust for tasks pane on tablet/desktop (use isTabletOrLarger, not !isMobile, for iPad support)
              right: effectiveTasksPaneOpen && isTabletOrLarger ? `${effectiveTasksPaneWidth}px` : 0,
              bottom: 0,
              // Smooth transition when tasks pane opens/closes
              transition: 'right 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
              // Adjust width for tasks pane on tablet/desktop
              ...(effectiveTasksPaneOpen && isTabletOrLarger ? {
                width: `calc(100vw - ${effectiveTasksPaneWidth}px)`
              } : {})
            }}
          />
          
          {/* Task pane handle - visible above lightbox overlay */}
          {!isMobile && (
            <div
              className="fixed top-1/2 -translate-y-1/2 flex flex-col items-center p-1 bg-zinc-800/90 backdrop-blur-sm border border-zinc-700 rounded-l-md gap-1 touch-none"
              style={{
                zIndex: 100001,
                pointerEvents: 'auto',
                right: effectiveTasksPaneOpen ? `${effectiveTasksPaneWidth}px` : 0,
                transition: 'right 300ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            >
              <TooltipProvider delayDuration={300}>
                {/* Task pane toggle - shows count, click to toggle open/close */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        // Toggle pane open state
                        setTasksPaneOpenContext(!effectiveTasksPaneOpen);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                      aria-label={`${cancellableTaskCount} tasks - click to ${effectiveTasksPaneOpen ? 'close' : 'open'}`}
                    >
                      <span className="text-xs font-light">{cancellableTaskCount}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {`${cancellableTaskCount} task${cancellableTaskCount === 1 ? '' : 's'} - click to ${effectiveTasksPaneOpen ? 'close' : 'open'}`}
                  </TooltipContent>
                </Tooltip>

                {/* Lock/Unlock button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const willBeLocked = !isTasksPaneLocked;
                        setIsTasksPaneLocked(willBeLocked);
                        setTasksPaneOpenContext(willBeLocked);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
                      aria-label={isTasksPaneLocked ? "Unlock tasks pane" : "Lock tasks pane open"}
                    >
                      {isTasksPaneLocked
                        ? <UnlockIcon className="h-4 w-4" />
                        : <LockIcon className="h-4 w-4" />
                      }
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {isTasksPaneLocked ? "Unlock tasks pane" : "Lock tasks pane open"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          
          <DialogPrimitive.Content
            ref={contentRef}
            tabIndex={-1} // Make the content focusable so it can receive key events
            onOpenAutoFocus={(event) => {
              // Prevent initial auto-focus on the first interactive element (e.g., the flip button)
              // which was causing tooltips to appear immediately when the modal opens.
              event.preventDefault();
              // Manually focus the dialog content so keyboard navigation works right away
              contentRef.current?.focus();
            }}
            // Prevent Escape key from auto-closing - we handle closing manually via safeClose
            onEscapeKeyDown={(event) => {
              event.preventDefault();
            }}
            // Ensure clicks within the dialog never reach the app behind it
            onPointerDown={(e) => {
              // Allow Radix Select/dropdown components to work properly
              const target = e.target as HTMLElement;
              const isRadixPortal = target.closest('[data-radix-popper-content-wrapper]') !== null;
              
              if (isRadixPortal) {
                return;
              }
              
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              // Allow touch events on canvas when in inpaint mode
              const target = e.target as HTMLElement;
              if (isInpaintMode && target.tagName === 'CANVAS') {
                console.log('[InpaintPaint] 🎨 Allowing touch on canvas');
                return; // Don't stop propagation for canvas
              }
              
              // Allow touch events on interactive elements (buttons, inputs, etc.)
              const isInteractive = target.tagName === 'BUTTON' || 
                                   target.tagName === 'INPUT' || 
                                   target.tagName === 'TEXTAREA' || 
                                   target.tagName === 'SELECT' || 
                                   target.tagName === 'A' ||
                                   target.closest('button') !== null ||
                                   target.closest('a') !== null;
              
              if (isInteractive) {
                console.log('[TouchDebug] 🎯 Allowing touch on interactive element:', target.tagName);
                return; // Allow propagation for interactive elements
              }
              
              // Block touch events from bubbling through dialog content
              if (isMobile) e.stopPropagation();
            }}
            onTouchMove={(e) => {
              // Allow touch events on canvas when in inpaint mode
              const target = e.target as HTMLElement;
              if (isInpaintMode && target.tagName === 'CANVAS') {
                console.log('[InpaintPaint] 🖌️ Allowing touch move on canvas');
                return; // Don't stop propagation for canvas
              }
              
              // Allow touch events on interactive elements (buttons, inputs, etc.)
              const isInteractive = target.tagName === 'BUTTON' || 
                                   target.tagName === 'INPUT' || 
                                   target.tagName === 'TEXTAREA' || 
                                   target.tagName === 'SELECT' || 
                                   target.tagName === 'A' ||
                                   target.closest('button') !== null ||
                                   target.closest('a') !== null;
              
              if (isInteractive) {
                return; // Allow propagation for interactive elements
              }
              
              // Block touch move events from bubbling through dialog content
              if (isMobile) e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              // Allow touch events on canvas when in inpaint mode
              const target = e.target as HTMLElement;
              if (isInpaintMode && target.tagName === 'CANVAS') {
                console.log('[InpaintPaint] 🛑 Allowing touch end on canvas');
                return; // Don't stop propagation for canvas
              }
              
              // Allow touch events on interactive elements (buttons, inputs, etc.)
              const isInteractive = target.tagName === 'BUTTON' || 
                                   target.tagName === 'INPUT' || 
                                   target.tagName === 'TEXTAREA' || 
                                   target.tagName === 'SELECT' || 
                                   target.tagName === 'A' ||
                                   target.closest('button') !== null ||
                                   target.closest('a') !== null;
              
              if (isInteractive) {
                return; // Allow propagation for interactive elements
              }
              
              // Block touch end events from bubbling through dialog content
              if (isMobile) e.stopPropagation();
            }}
            onTouchCancel={(e) => {
              // Check if a higher z-index dialog is open - if so, don't block events
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                return zIndex > 100000;
              });
              
              if (hasHigherZIndexDialog) {
                return; // Let the higher dialog handle the event
              }
              
              // Block touch cancel events on mobile
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            className={cn(
              "fixed z-[100000]",
              // Disable animations on mobile to prevent blink during zoom/fade
              isMobile ? "" : "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "p-0 border-none bg-transparent shadow-none",
              // Layout: Use unified needsFullscreenLayout for consistent behavior
              needsFullscreenLayout
                ? "inset-0 w-full h-full"
                : "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-auto h-auto data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
            )}
            style={{
              // Smooth transition when tasks pane opens/closes
              transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
              // Use unified needsTasksPaneOffset for consistent tasks pane handling
              ...(needsTasksPaneOffset ? {
                width: `calc(100vw - ${effectiveTasksPaneWidth}px)`
              } : needsFullscreenLayout ? {
                width: '100vw'
              } : {})
            }}
            onPointerDownOutside={(event) => {
              const target = event.target as Element;

              // Don't close if clicking inside the TasksPane (when modal={false} for scroll support)
              if (target.closest('[data-tasks-pane]')) {
                event.preventDefault();
                return;
              }

              // Don't close if clicking inside Radix portals (Select, Popover, DropdownMenu)
              // This check is BEFORE the inpaint mode check because we always want to protect these
              if (target.closest('[data-radix-select-content]') ||
                  target.closest('[data-radix-select-viewport]') ||
                  target.closest('[data-radix-select-item]') ||
                  target.closest('[data-radix-popover-content]') ||
                  target.closest('[data-radix-dropdown-menu-content]') ||
                  target.closest('[data-shot-selector-header]') ||
                  target.closest('[data-radix-select-trigger]')) {
                event.preventDefault();
                return;
              }

              // Don't close if Select is open
              if (isSelectOpen) {
                event.preventDefault();
                return;
              }
              
              // Prevent underlying click-throughs
              event.preventDefault();
              event.stopPropagation();

              // Extra mobile protection: block all event propagation
              if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
              }

              // In special edit modes with side panel, don't close if clicking on panel elements
              if (isInpaintMode && shouldShowSidePanel) {
                if (target.closest('[data-task-details-panel]') || target.closest('[role="button"]')) {
                  return;
                }
              }

              // Close the lightbox when clicking outside
              // Use setTimeout on mobile to ensure the event is fully blocked before closing
              if (isMobile) {
                setTimeout(() => {
                  onClose();
                }, 0);
              } else {
                onClose();
              }
            }}
          >
            {/* Accessibility: Hidden dialog title for screen readers */}
            <DialogPrimitive.Title className="sr-only">
              {isFormOnlyMode
                ? `Segment ${(segmentSlotMode?.currentIndex ?? 0) + 1} Settings`
                : `${media?.type?.includes('video') ? 'Video' : 'Image'} Lightbox - ${media?.id?.substring(0, 8)}`}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {isFormOnlyMode
                ? 'Configure and generate this video segment. Use Tab or arrow keys to navigate between segments.'
                : `View and interact with ${media?.type?.includes('video') ? 'video' : 'image'} in full screen. Use arrow keys to navigate, Escape to close.`}
            </DialogPrimitive.Description>

            {/* Segment Slot Mode: Form-only view when no video exists */}
            {isFormOnlyMode ? (
              <SegmentSlotFormView
                segmentSlotMode={segmentSlotMode!}
                onClose={onClose}
                onNavPrev={handleSlotNavPrev}
                onNavNext={handleSlotNavNext}
                hasPrevious={hasPrevious}
                hasNext={hasNext}
              />
            ) : shouldShowSidePanelWithTrim ? (
              // Tablet/Desktop layout with side panel (task details, inpaint, magic edit, or video trim)
              <div
                className="w-full h-full flex bg-black/90"
                onClick={(e) => {
                  e.stopPropagation();
                  // Close if clicking directly on the background (not on children)
                  if (e.target === e.currentTarget) {
                    onClose();
                  }
                }}
              >
                {/* Media section - Left side (60% width) */}
                <div
                  className="flex-1 flex items-center justify-center relative"
                  style={{ width: '60%' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Close if clicking directly on the background (not on children)
                    if (e.target === e.currentTarget) {
                      onClose();
                    }
                  }}
                >
                  {/* Navigation Arrows */}
                  <NavigationArrows
                    showNavigation={showNavigation}
                    readOnly={readOnly}
                    onPrevious={handleSlotNavPrev}
                    onNext={handleSlotNavNext}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    variant="desktop"
                  />

                  {/* Media Content */}
                  {isVideo && isVideoEditModeActive ? (
                    <VideoEditModeDisplay
                      videoRef={videoEditing.videoRef}
                      videoUrl={effectiveVideoUrl}
                      posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                      videoDuration={trimState.videoDuration}
                      onLoadedMetadata={setVideoDuration}
                      selections={videoEditing.selections}
                      activeSelectionId={videoEditing.activeSelectionId}
                      onSelectionChange={videoEditing.handleUpdateSelection}
                      onSelectionClick={videoEditing.setActiveSelectionId}
                      onRemoveSelection={videoEditing.handleRemoveSelection}
                      onAddSelection={videoEditing.handleAddSelection}
                    />
                  ) : isVideo && isVideoTrimModeActive ? (
                    <VideoTrimModeDisplay
                      videoRef={trimVideoRef}
                      videoUrl={effectiveVideoUrl}
                      posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                      trimState={trimState}
                      onLoadedMetadata={setVideoDuration}
                      onTimeUpdate={setTrimCurrentTime}
                    />
                  ) : (
                    <MediaDisplayWithCanvas
                      effectiveImageUrl={isVideo ? effectiveVideoUrl : effectiveMediaUrl}
                      thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                      isVideo={isVideo}
                      isFlippedHorizontally={isFlippedHorizontally}
                      isSaving={isSaving}
                      isInpaintMode={isInpaintMode}
                      editMode={editMode}
                      repositionTransformStyle={editMode === 'reposition' ? getTransformStyle() : undefined}
                      repositionDragHandlers={editMode === 'reposition' ? repositionDragHandlers : undefined}
                      isRepositionDragging={isRepositionDragging}
                      imageContainerRef={imageContainerRef}
                      canvasRef={canvasRef}
                      maskCanvasRef={maskCanvasRef}
                      onImageLoad={setImageDimensions}
                      onVideoLoadedMetadata={(e) => {
                        const video = e.currentTarget;
                        if (Number.isFinite(video.duration) && video.duration > 0) {
                          setVideoDuration(video.duration);
                        }
                      }}
                      onContainerClick={onClose}
                      variant="desktop-side-panel"
                      containerClassName="max-w-full max-h-full"
                      tasksPaneWidth={effectiveTasksPaneOpen && !isMobile ? effectiveTasksPaneWidth : 0}
                      debugContext="Desktop"
                      // Konva-based stroke overlay props
                      imageDimensions={effectiveImageDimensions}
                      brushStrokes={brushStrokes}
                      currentStroke={currentStroke}
                      isDrawing={isDrawing}
                      isEraseMode={isEraseMode}
                      brushSize={brushSize}
                      annotationMode={editMode === 'annotate' ? annotationMode : null}
                      selectedShapeId={selectedShapeId}
                      onStrokePointerDown={handleKonvaPointerDown}
                      onStrokePointerMove={handleKonvaPointerMove}
                      onStrokePointerUp={handleKonvaPointerUp}
                      onShapeClick={handleShapeClick}
                      strokeOverlayRef={strokeOverlayRef}
                    />
                  )}

                  {/* Delete button and mode toggle for selected annotation */}
                  {selectedShapeId && isAnnotateMode && (() => {
                    const buttonPos = getDeleteButtonPosition();
                    if (!buttonPos) return null;
                    
                    // Get selected shape info
                    const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
                    const isFreeForm = selectedShape?.isFreeForm || false;
                    
                    return (
                      <div className="fixed z-[100] flex gap-2" style={{
                        left: `${buttonPos.x}px`,
                        top: `${buttonPos.y}px`,
                        transform: 'translate(-50%, -50%)'
                      }}>
                        {/* Mode toggle button */}
                        <button
                          onClick={handleToggleFreeForm}
                          className={cn(
                            "rounded-full p-2 shadow-lg transition-colors",
                            isFreeForm 
                              ? "bg-purple-600 hover:bg-purple-700 text-white" 
                              : "bg-gray-700 hover:bg-gray-600 text-white"
                          )}
                          title={isFreeForm 
                            ? "Switch to rectangle mode (edges move linearly)" 
                            : "Switch to free-form mode (rhombus/non-orthogonal angles)"}
                        >
                          {isFreeForm ? <Diamond className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        </button>
                        
                        {/* Delete button */}
                        <button
                          onClick={handleDeleteSelected}
                          className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2 shadow-lg transition-colors"
                          title="Delete annotation (or press DELETE key)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })()}

                    {/* Top Center - Main Variant Badge/Button */}
                    {!readOnly && activeVariant && variants && (
                      <div
                        className="absolute top-8 md:top-16 left-1/2 transform -translate-x-1/2 z-[60] select-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2">
                          {/* Main variant badge - only show when multiple variants exist */}
                          {variants.length > 1 && activeVariant.is_primary && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-green-500/90 text-white text-sm font-medium shadow-lg">
                              <Check className="w-4 h-4" />
                              <span>Main variant</span>
                            </div>
                          )}
                          {/* Make main button - only show for non-primary variants */}
                          {!activeVariant.is_primary && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleMakeMainVariant}
                              disabled={isMakingMainVariant || !canMakeMainVariant}
                              className="bg-orange-500/90 hover:bg-orange-600 text-white border-none shadow-lg"
                            >
                              {isMakingMainVariant ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                              ) : (
                                <Star className="w-4 h-4 mr-1.5" />
                              )}
                              Make main
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Top Left - New image button */}
                    {!isVideo && !readOnly && (
                      <div
                        className="absolute top-4 left-4 z-[70] select-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handlePromoteToGeneration(activeVariant?.id || primaryVariant?.id || '')}
                          disabled={promoteVariantMutation.isPending || promoteSuccess || !selectedProjectId || !(activeVariant?.id || primaryVariant?.id)}
                          className={cn(
                            "bg-black/50 hover:bg-black/70 text-white",
                            promoteSuccess && "bg-green-500/90 hover:bg-green-500/90"
                          )}
                          title="Create a standalone image from this variant"
                        >
                          {promoteVariantMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                          ) : promoteSuccess ? (
                            <Check className="w-4 h-4 mr-1.5" />
                          ) : (
                            <Plus className="w-4 h-4 mr-1.5" />
                          )}
                          {promoteSuccess ? 'Created' : 'New image'}
                        </Button>
                      </div>
                    )}

                    {/* Floating Tool Controls - Tablet (landscape with sidebar) */}
                    {isSpecialEditMode && shouldShowSidePanel && (
                      <FloatingToolControls
                        variant="tablet"
                        editMode={editMode}
                        onSetEditMode={setEditMode}
                        brushSize={brushSize}
                        isEraseMode={isEraseMode}
                        onSetBrushSize={setBrushSize}
                        onSetIsEraseMode={setIsEraseMode}
                        annotationMode={editMode === 'annotate' ? annotationMode : null}
                        onSetAnnotationMode={setAnnotationMode}
                        repositionTransform={repositionTransform}
                        onRepositionTranslateXChange={setTranslateX}
                        onRepositionTranslateYChange={setTranslateY}
                        onRepositionScaleChange={setScale}
                        onRepositionRotationChange={setRotation}
                        onRepositionFlipH={toggleFlipH}
                        onRepositionFlipV={toggleFlipV}
                        onRepositionReset={resetTransform}
                        imageDimensions={effectiveImageDimensions}
                        brushStrokes={brushStrokes}
                        onUndo={handleUndo}
                        onClearMask={handleClearMask}
                        panelPosition={inpaintPanelPosition}
                        onSetPanelPosition={setInpaintPanelPosition}
                      />
                    )}

                    {/* Bottom Left Controls - Edit & Upscale */}
                    <BottomLeftControls {...buttonGroupProps.bottomLeft} />

                    {/* Bottom Right Controls - Star & Add to References */}
                    <BottomRightControls {...buttonGroupProps.bottomRight} />

                    {/* Top Right Controls - Download, Delete & Close */}
                    <TopRightControls {...buttonGroupProps.topRight} />

                    {/* Bottom Workflow Controls (hidden in special edit modes) */}
                    <WorkflowControlsBar
                      onAddToShot={onAddToShot}
                      onDelete={onDelete}
                      onApplySettings={onApplySettings}
                      isSpecialEditMode={isSpecialEditMode}
                      isVideo={isVideo}
                      mediaId={actualGenerationId}
                      imageUrl={effectiveMediaUrl}
                      thumbUrl={media.thumbUrl}
                      allShots={allShots}
                      selectedShotId={selectedShotId}
                      onShotChange={onShotChange}
                      onCreateShot={onCreateShot}
                      isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
                      isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
                      showTickForImageId={showTickForImageId}
                      showTickForSecondaryImageId={showTickForSecondaryImageId}
                      onAddToShotWithoutPosition={onAddToShotWithoutPosition}
                      onShowTick={onShowTick}
                      onShowSecondaryTick={onShowSecondaryTick}
                      onOptimisticPositioned={onOptimisticPositioned}
                      onOptimisticUnpositioned={onOptimisticUnpositioned}
                      contentRef={contentRef}
                      handleApplySettings={handleApplySettings}
                      onNavigateToShot={handleNavigateToShotFromSelector}
                      onClose={onClose}
                      onAddVariantAsNewGeneration={handleAddVariantAsNewGenerationToShot}
                      activeVariantId={activeVariant?.id || primaryVariant?.id}
                      currentTimelineFrame={media.timeline_frame}
                    />
                  </div>

                {/* Task Details / Inpaint / Magic Edit / Video Trim Panel - Right side (40% width) */}
                <div 
                  data-task-details-panel
                  className={cn(
                    "bg-background border-l border-border h-full overflow-hidden relative z-[60]"
                    // h-full constrains height so TaskDetailsPanel's footer stays visible
                    // overflow-hidden lets child components handle their own scrolling
                  )}
                  style={{ width: '40%' }}
                >
                  <ControlsPanel
                    variant="desktop"
                    isInVideoEditMode={isInVideoEditMode}
                    isSpecialEditMode={isSpecialEditMode}
                    // VideoEditPanel props
                    videoEditSubMode={videoEditSubMode}
                    onEnterTrimMode={handleEnterVideoTrimMode}
                    onEnterReplaceMode={handleEnterVideoReplaceMode}
                    onEnterRegenerateMode={handleEnterVideoRegenerateMode}
                    onExitVideoEditMode={handleExitVideoEditMode}
                    trimState={trimState}
                    onStartTrimChange={setStartTrim}
                    onEndTrimChange={setEndTrim}
                    onResetTrim={resetTrim}
                    trimmedDuration={trimmedDuration}
                    hasTrimChanges={hasTrimChanges}
                    onSaveTrim={saveTrimmedVideo}
                    isSavingTrim={isSavingTrim}
                    trimSaveProgress={trimSaveProgress}
                    trimSaveError={trimSaveError}
                    trimSaveSuccess={trimSaveSuccess}
                    videoUrl={effectiveVideoUrl}
                    trimCurrentTime={trimCurrentTime}
                    trimVideoRef={trimVideoRef}
                    videoEditing={videoEditing}
                    projectId={selectedProjectId}
                    regenerateForm={regenerateForm}
                    // EditModePanel props
                    sourceGenerationData={sourceGenerationData}
                    onOpenExternalGeneration={onOpenExternalGeneration}
                    allShots={allShots}
                    isCurrentMediaPositioned={isAlreadyPositionedInSelectedShot}
                    onReplaceInShot={handleReplaceInShot}
                    sourcePrimaryVariant={sourcePrimaryVariant}
                    onMakeMainVariant={handleMakeMainVariant}
                    canMakeMainVariant={canMakeMainVariant}
                    editMode={editMode}
                    setEditMode={setEditMode}
                    setIsInpaintMode={setIsInpaintMode}
                    inpaintPrompt={inpaintPrompt}
                    setInpaintPrompt={setInpaintPrompt}
                    inpaintNumGenerations={inpaintNumGenerations}
                    setInpaintNumGenerations={setInpaintNumGenerations}
                    loraMode={loraMode}
                    setLoraMode={setLoraMode}
                    customLoraUrl={customLoraUrl}
                    setCustomLoraUrl={setCustomLoraUrl}
                    isGeneratingInpaint={isGeneratingInpaint}
                    inpaintGenerateSuccess={inpaintGenerateSuccess}
                    isCreatingMagicEditTasks={isCreatingMagicEditTasks}
                    magicEditTasksCreated={magicEditTasksCreated}
                    brushStrokes={brushStrokes}
                    handleExitMagicEditMode={handleExitMagicEditMode}
                    handleUnifiedGenerate={handleUnifiedGenerate}
                    handleGenerateAnnotatedEdit={handleGenerateAnnotatedEdit}
                    handleGenerateReposition={handleGenerateReposition}
                    isGeneratingReposition={isGeneratingReposition}
                    repositionGenerateSuccess={repositionGenerateSuccess}
                    hasTransformChanges={hasTransformChanges}
                    handleSaveAsVariant={handleSaveAsVariant}
                    isSavingAsVariant={isSavingAsVariant}
                    saveAsVariantSuccess={saveAsVariantSuccess}
                    createAsGeneration={createAsGeneration}
                    onCreateAsGenerationChange={setCreateAsGeneration}
                    // Img2Img props
                    img2imgPrompt={img2imgPrompt}
                    setImg2imgPrompt={setImg2imgPrompt}
                    img2imgStrength={img2imgStrength}
                    setImg2imgStrength={setImg2imgStrength}
                    enablePromptExpansion={enablePromptExpansion}
                    setEnablePromptExpansion={setEnablePromptExpansion}
                    isGeneratingImg2Img={isGeneratingImg2Img}
                    img2imgGenerateSuccess={img2imgGenerateSuccess}
                    handleGenerateImg2Img={handleGenerateImg2Img}
                    img2imgLoraManager={img2imgLoraManager}
                    availableLoras={availableLoras}
                    editLoraManager={editLoraManager}
                    // Advanced settings for two-pass generation
                    advancedSettings={advancedSettings}
                    setAdvancedSettings={setAdvancedSettings}
                    isLocalGeneration={isLocalGeneration}
                    // Model selection for cloud mode
                    qwenEditModel={qwenEditModel}
                    setQwenEditModel={setQwenEditModel}
                    // InfoPanel props
                    isVideo={isVideo}
                    showImageEditTools={showImageEditTools}
                    readOnly={readOnly}
                    isInpaintMode={isInpaintMode}
                    onExitInpaintMode={handleExitInpaintMode}
                    onEnterInpaintMode={() => {
                      setIsInpaintMode(true);
                      setEditMode('inpaint');
                    }}
                    onEnterVideoEditMode={handleEnterVideoEditMode}
                    onClose={onClose}
                    taskDetailsData={adjustedTaskDetailsData}
                    generationName={generationName}
                    onGenerationNameChange={handleGenerationNameChange}
                    isEditingGenerationName={isEditingGenerationName}
                    onEditingGenerationNameChange={setIsEditingGenerationName}
                    derivedItems={derivedItems}
                    replaceImages={replaceImages}
                    onReplaceImagesChange={setReplaceImages}
                    onSwitchToPrimary={primaryVariant ? () => setActiveVariantId(primaryVariant.id) : undefined}
                    variantsSectionRef={variantsSectionRef}
                    // Shared props
                    currentMediaId={media.id}
                    currentShotId={selectedShotId || shotId}
                    derivedGenerations={derivedGenerations}
                    paginatedDerived={paginatedDerived}
                    derivedPage={derivedPage}
                    derivedTotalPages={derivedTotalPages}
                    onSetDerivedPage={setDerivedPage}
                    variants={variants}
                    activeVariant={activeVariant}
                    primaryVariant={primaryVariant}
                    onVariantSelect={setActiveVariantId}
                    onMakePrimary={setPrimaryVariant}
                    isLoadingVariants={isLoadingVariants}
                    onPromoteToGeneration={handlePromoteToGeneration}
                    isPromoting={promoteVariantMutation.isPending}
                    onDeleteVariant={deleteVariant}
                    onLoadVariantSettings={setVariantParamsToLoad}
                  />
                </div>
              </div>
            ) : (showTaskDetails || isSpecialEditMode || isVideoTrimModeActive || isVideoEditModeActive || (isSegmentSlotMode && hasSegmentVideo)) && isMobile ? (
              // Mobile layout with task details, special edit modes, video edit modes, or segment slot mode - stacked
              <div className="w-full h-full flex flex-col bg-black/90">
                {/* Media section - Top (50% height) with swipe navigation */}
                <div
                  className="flex-none flex items-center justify-center relative touch-pan-y z-10"
                  style={{
                    height: '50%',
                    transform: swipeNavigation.isSwiping ? `translateX(${swipeNavigation.swipeOffset}px)` : undefined,
                    transition: swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Close if clicking directly on the background (not on children)
                    if (e.target === e.currentTarget) {
                      onClose();
                    }
                  }}
                  {...swipeNavigation.swipeHandlers}
                >
                  {/* Media Content - same as above but adapted for mobile */}
                    {isVideo ? (
                      isVideoEditModeActive ? (
                        <VideoEditModeDisplay
                          videoRef={videoEditing.videoRef}
                          videoUrl={effectiveVideoUrl}
                          posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                          videoDuration={trimState.videoDuration}
                          onLoadedMetadata={setVideoDuration}
                          selections={videoEditing.selections}
                          activeSelectionId={videoEditing.activeSelectionId}
                          onSelectionChange={videoEditing.handleUpdateSelection}
                          onSelectionClick={videoEditing.setActiveSelectionId}
                          onRemoveSelection={videoEditing.handleRemoveSelection}
                          onAddSelection={videoEditing.handleAddSelection}
                        />
                      ) : isVideoTrimModeActive ? (
                        <VideoTrimModeDisplay
                          videoRef={trimVideoRef}
                          videoUrl={effectiveVideoUrl}
                          posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                          trimState={trimState}
                          onLoadedMetadata={setVideoDuration}
                          onTimeUpdate={setTrimCurrentTime}
                        />
                      ) : (
                        <StyledVideoPlayer
                          src={effectiveVideoUrl}
                          poster={activeVariant?.thumbnail_url || media.thumbUrl}
                          loop
                          muted
                          autoPlay
                          playsInline
                          preload="auto"
                          className="max-w-full max-h-full shadow-wes border border-border/20"
                          onLoadedMetadata={(e) => {
                            const video = e.currentTarget;
                            if (Number.isFinite(video.duration) && video.duration > 0) {
                              setVideoDuration(video.duration);
                            }
                          }}
                        />
                      )
                    ) : (
                    <MediaDisplayWithCanvas
                      effectiveImageUrl={effectiveMediaUrl}
                      thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                      isVideo={false}
                      isFlippedHorizontally={isFlippedHorizontally}
                      isSaving={isSaving}
                      isInpaintMode={isInpaintMode}
                      editMode={editMode}
                      repositionTransformStyle={editMode === 'reposition' ? getTransformStyle() : undefined}
                      repositionDragHandlers={editMode === 'reposition' ? repositionDragHandlers : undefined}
                      isRepositionDragging={isRepositionDragging}
                      imageContainerRef={imageContainerRef}
                      canvasRef={canvasRef}
                      maskCanvasRef={maskCanvasRef}
                      onImageLoad={setImageDimensions}
                      onContainerClick={onClose}
                      variant="mobile-stacked"
                      containerClassName="w-full h-full"
                      debugContext="Mobile Stacked"
                      // Konva-based stroke overlay props
                      imageDimensions={effectiveImageDimensions}
                      brushStrokes={brushStrokes}
                      currentStroke={currentStroke}
                      isDrawing={isDrawing}
                      isEraseMode={isEraseMode}
                      brushSize={brushSize}
                      annotationMode={editMode === 'annotate' ? annotationMode : null}
                      selectedShapeId={selectedShapeId}
                      onStrokePointerDown={handleKonvaPointerDown}
                      onStrokePointerMove={handleKonvaPointerMove}
                      onStrokePointerUp={handleKonvaPointerUp}
                      onShapeClick={handleShapeClick}
                      strokeOverlayRef={strokeOverlayRef}
                    />
                    )}

                    {/* Top Center - Main Variant Badge/Button (Mobile Stacked) */}
                    {!readOnly && activeVariant && variants && (
                      <div
                        className="absolute top-8 md:top-16 left-1/2 transform -translate-x-1/2 z-[60] select-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2">
                          {/* Main variant badge - only show when multiple variants exist */}
                          {variants.length > 1 && activeVariant.is_primary && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-green-500/90 text-white text-sm font-medium shadow-lg">
                              <Check className="w-4 h-4" />
                              <span>Main variant</span>
                            </div>
                          )}
                          {/* Make main button - only show for non-primary variants */}
                          {!activeVariant.is_primary && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleMakeMainVariant}
                              disabled={isMakingMainVariant || !canMakeMainVariant}
                              className="bg-orange-500/90 hover:bg-orange-600 text-white border-none shadow-lg"
                            >
                              {isMakingMainVariant ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                              ) : (
                                <Star className="w-4 h-4 mr-1.5" />
                              )}
                              Make main
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Top Left - New image button (Mobile Stacked) */}
                    {!isVideo && !readOnly && (
                      <div
                        className="absolute top-4 left-4 z-[70] select-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handlePromoteToGeneration(activeVariant?.id || primaryVariant?.id || '')}
                          disabled={promoteVariantMutation.isPending || promoteSuccess || !selectedProjectId || !(activeVariant?.id || primaryVariant?.id)}
                          className={cn(
                            "bg-black/50 hover:bg-black/70 text-white",
                            promoteSuccess && "bg-green-500/90 hover:bg-green-500/90"
                          )}
                          title="Create a standalone image from this variant"
                        >
                          {promoteVariantMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                          ) : promoteSuccess ? (
                            <Check className="w-4 h-4 mr-1.5" />
                          ) : (
                            <Plus className="w-4 h-4 mr-1.5" />
                          )}
                          {promoteSuccess ? 'Created' : 'New image'}
                        </Button>
                      </div>
                    )}

                    {/* Floating Tool Controls - Mobile (portrait, no sidebar) */}
                    {isSpecialEditMode && (
                      <FloatingToolControls
                        variant="mobile"
                        editMode={editMode}
                        onSetEditMode={setEditMode}
                        brushSize={brushSize}
                        isEraseMode={isEraseMode}
                        onSetBrushSize={setBrushSize}
                        onSetIsEraseMode={setIsEraseMode}
                        annotationMode={editMode === 'annotate' ? annotationMode : null}
                        onSetAnnotationMode={setAnnotationMode}
                        repositionTransform={repositionTransform}
                        onRepositionTranslateXChange={setTranslateX}
                        onRepositionTranslateYChange={setTranslateY}
                        onRepositionScaleChange={setScale}
                        onRepositionRotationChange={setRotation}
                        onRepositionFlipH={toggleFlipH}
                        onRepositionFlipV={toggleFlipV}
                        onRepositionReset={resetTransform}
                        imageDimensions={effectiveImageDimensions}
                        brushStrokes={brushStrokes}
                        onUndo={handleUndo}
                        onClearMask={handleClearMask}
                        panelPosition={inpaintPanelPosition}
                        onSetPanelPosition={setInpaintPanelPosition}
                      />
                    )}

                    {/* Mobile Stacked Layout - All button groups (matching desktop) */}
                    {/* Top Right Controls - Download, Delete & Close */}
                    <TopRightControls {...buttonGroupProps.topRight} />

                    {/* Bottom Left Controls - Edit & Upscale */}
                    <BottomLeftControls {...buttonGroupProps.bottomLeft} />

                    {/* Bottom Right Controls - Star & Add to References */}
                    <BottomRightControls {...buttonGroupProps.bottomRight} />

                    {/* Bottom Workflow Controls (hidden in special edit modes) */}
                    <WorkflowControlsBar
                      onAddToShot={onAddToShot}
                      onDelete={onDelete}
                      onApplySettings={onApplySettings}
                      isSpecialEditMode={isSpecialEditMode}
                      isVideo={isVideo}
                      mediaId={actualGenerationId}
                      imageUrl={effectiveMediaUrl}
                      thumbUrl={media.thumbUrl}
                      allShots={allShots}
                      selectedShotId={selectedShotId}
                      onShotChange={onShotChange}
                      onCreateShot={onCreateShot}
                      isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
                      isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
                      showTickForImageId={showTickForImageId}
                      showTickForSecondaryImageId={showTickForSecondaryImageId}
                      onAddToShotWithoutPosition={onAddToShotWithoutPosition}
                      onShowTick={onShowTick}
                      onShowSecondaryTick={onShowSecondaryTick}
                      onOptimisticPositioned={onOptimisticPositioned}
                      onOptimisticUnpositioned={onOptimisticUnpositioned}
                      contentRef={contentRef}
                      handleApplySettings={handleApplySettings}
                      onNavigateToShot={handleNavigateToShotFromSelector}
                      onClose={onClose}
                      onAddVariantAsNewGeneration={handleAddVariantAsNewGenerationToShot}
                      activeVariantId={activeVariant?.id || primaryVariant?.id}
                      currentTimelineFrame={media.timeline_frame}
                    />

                    {/* Navigation Arrows */}
                    <NavigationArrows
                      showNavigation={showNavigation}
                      readOnly={readOnly}
                      onPrevious={handleSlotNavPrev}
                      onNext={handleSlotNavNext}
                      hasPrevious={hasPrevious}
                      hasNext={hasNext}
                      variant="mobile"
                    />
                </div>

                {/* Task Details / Inpaint / Magic Edit Panel - Bottom (50% height) */}
                <div 
                  data-task-details-panel
                  className={cn(
                    "bg-background border-t border-border overflow-y-auto relative z-[60]"
                    // Removed flex centering to prevent top clipping with long content
                  )}
                  style={{ height: '50%' }}
                >
                  <ControlsPanel
                    variant="mobile"
                    isInVideoEditMode={isInVideoEditMode}
                    isSpecialEditMode={isSpecialEditMode}
                    // VideoEditPanel props
                    videoEditSubMode={videoEditSubMode}
                    onEnterTrimMode={handleEnterVideoTrimMode}
                    onEnterReplaceMode={handleEnterVideoReplaceMode}
                    onEnterRegenerateMode={handleEnterVideoRegenerateMode}
                    onExitVideoEditMode={handleExitVideoEditMode}
                    trimState={trimState}
                    onStartTrimChange={setStartTrim}
                    onEndTrimChange={setEndTrim}
                    onResetTrim={resetTrim}
                    trimmedDuration={trimmedDuration}
                    hasTrimChanges={hasTrimChanges}
                    onSaveTrim={saveTrimmedVideo}
                    isSavingTrim={isSavingTrim}
                    trimSaveProgress={trimSaveProgress}
                    trimSaveError={trimSaveError}
                    trimSaveSuccess={trimSaveSuccess}
                    videoUrl={effectiveVideoUrl}
                    trimCurrentTime={trimCurrentTime}
                    trimVideoRef={trimVideoRef}
                    videoEditing={videoEditing}
                    projectId={selectedProjectId}
                    regenerateForm={regenerateForm}
                    // EditModePanel props
                    sourceGenerationData={sourceGenerationData}
                    onOpenExternalGeneration={onOpenExternalGeneration}
                    allShots={allShots}
                    isCurrentMediaPositioned={isAlreadyPositionedInSelectedShot}
                    onReplaceInShot={handleReplaceInShot}
                    sourcePrimaryVariant={sourcePrimaryVariant}
                    onMakeMainVariant={handleMakeMainVariant}
                    canMakeMainVariant={canMakeMainVariant}
                    editMode={editMode}
                    setEditMode={setEditMode}
                    setIsInpaintMode={setIsInpaintMode}
                    inpaintPrompt={inpaintPrompt}
                    setInpaintPrompt={setInpaintPrompt}
                    inpaintNumGenerations={inpaintNumGenerations}
                    setInpaintNumGenerations={setInpaintNumGenerations}
                    loraMode={loraMode}
                    setLoraMode={setLoraMode}
                    customLoraUrl={customLoraUrl}
                    setCustomLoraUrl={setCustomLoraUrl}
                    isGeneratingInpaint={isGeneratingInpaint}
                    inpaintGenerateSuccess={inpaintGenerateSuccess}
                    isCreatingMagicEditTasks={isCreatingMagicEditTasks}
                    magicEditTasksCreated={magicEditTasksCreated}
                    brushStrokes={brushStrokes}
                    handleExitMagicEditMode={handleExitMagicEditMode}
                    handleUnifiedGenerate={handleUnifiedGenerate}
                    handleGenerateAnnotatedEdit={handleGenerateAnnotatedEdit}
                    handleGenerateReposition={handleGenerateReposition}
                    isGeneratingReposition={isGeneratingReposition}
                    repositionGenerateSuccess={repositionGenerateSuccess}
                    hasTransformChanges={hasTransformChanges}
                    handleSaveAsVariant={handleSaveAsVariant}
                    isSavingAsVariant={isSavingAsVariant}
                    saveAsVariantSuccess={saveAsVariantSuccess}
                    createAsGeneration={createAsGeneration}
                    onCreateAsGenerationChange={setCreateAsGeneration}
                    // Img2Img props
                    img2imgPrompt={img2imgPrompt}
                    setImg2imgPrompt={setImg2imgPrompt}
                    img2imgStrength={img2imgStrength}
                    setImg2imgStrength={setImg2imgStrength}
                    enablePromptExpansion={enablePromptExpansion}
                    setEnablePromptExpansion={setEnablePromptExpansion}
                    isGeneratingImg2Img={isGeneratingImg2Img}
                    img2imgGenerateSuccess={img2imgGenerateSuccess}
                    handleGenerateImg2Img={handleGenerateImg2Img}
                    img2imgLoraManager={img2imgLoraManager}
                    availableLoras={availableLoras}
                    editLoraManager={editLoraManager}
                    // Advanced settings for two-pass generation
                    advancedSettings={advancedSettings}
                    setAdvancedSettings={setAdvancedSettings}
                    isLocalGeneration={isLocalGeneration}
                    // Model selection for cloud mode
                    qwenEditModel={qwenEditModel}
                    setQwenEditModel={setQwenEditModel}
                    // InfoPanel props
                    isVideo={isVideo}
                    showImageEditTools={showImageEditTools}
                    readOnly={readOnly}
                    isInpaintMode={isInpaintMode}
                    onExitInpaintMode={handleExitInpaintMode}
                    onEnterInpaintMode={() => {
                      setIsInpaintMode(true);
                      setEditMode('inpaint');
                    }}
                    onEnterVideoEditMode={handleEnterVideoEditMode}
                    onClose={onClose}
                    taskDetailsData={adjustedTaskDetailsData}
                    generationName={generationName}
                    onGenerationNameChange={handleGenerationNameChange}
                    isEditingGenerationName={isEditingGenerationName}
                    onEditingGenerationNameChange={setIsEditingGenerationName}
                    derivedItems={derivedItems}
                    replaceImages={replaceImages}
                    onReplaceImagesChange={setReplaceImages}
                    onSwitchToPrimary={primaryVariant ? () => setActiveVariantId(primaryVariant.id) : undefined}
                    variantsSectionRef={variantsSectionRef}
                    // Shared props
                    currentMediaId={media.id}
                    currentShotId={selectedShotId || shotId}
                    derivedGenerations={derivedGenerations}
                    paginatedDerived={paginatedDerived}
                    derivedPage={derivedPage}
                    derivedTotalPages={derivedTotalPages}
                    onSetDerivedPage={setDerivedPage}
                    variants={variants}
                    activeVariant={activeVariant}
                    primaryVariant={primaryVariant}
                    onVariantSelect={setActiveVariantId}
                    onMakePrimary={setPrimaryVariant}
                    isLoadingVariants={isLoadingVariants}
                    onPromoteToGeneration={handlePromoteToGeneration}
                    isPromoting={promoteVariantMutation.isPending}
                    onDeleteVariant={deleteVariant}
                    onLoadVariantSettings={setVariantParamsToLoad}
                  />
                </div>
              </div>
            ) : (
              // Mobile/Tablet layout using new FlexContainer + MediaWrapper
              <FlexContainer
                onClick={(e) => {
                  e.stopPropagation();
                  // Don't close in edit modes to prevent accidental data loss
                  if (isInpaintMode) {
                    return;
                  }
                  // Close if clicking directly on the container background (not children)
                  if (e.target === e.currentTarget) {
                    onClose();
                  }
                }}
              >
                {/* Close Button - REMOVED */}

                {/* Media Container with Controls - includes swipe navigation */}
                <MediaWrapper
                  onClick={(e) => {
                    e.stopPropagation();
                    // Don't close in edit modes
                    if (isInpaintMode) return;
                    // Close if clicking directly on the wrapper background (not the video/image)
                    if (e.target === e.currentTarget) {
                      onClose();
                    }
                  }}
                  className={cn(
                    isMobile && isInpaintMode && "pointer-events-auto",
                    "touch-pan-y" // Allow vertical scrolling, capture horizontal
                  )}
                  {...swipeNavigation.swipeHandlers}
                  style={{
                    transform: swipeNavigation.isSwiping ? `translateX(${swipeNavigation.swipeOffset}px)` : undefined,
                    transition: swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
                  }}
                >
                  {/* Based On display removed from overlay - now shows in sidebar above task details */}
                  
                  {/* Media Display - The wrapper now handles centering */}
                {isVideo ? (
                  isVideoEditModeActive ? (
                    <VideoEditModeDisplay
                      videoRef={videoEditing.videoRef}
                      videoUrl={effectiveVideoUrl}
                      posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                      videoDuration={trimState.videoDuration}
                      onLoadedMetadata={setVideoDuration}
                      selections={videoEditing.selections}
                      activeSelectionId={videoEditing.activeSelectionId}
                      onSelectionChange={videoEditing.handleUpdateSelection}
                      onSelectionClick={videoEditing.setActiveSelectionId}
                      onRemoveSelection={videoEditing.handleRemoveSelection}
                      onAddSelection={videoEditing.handleAddSelection}
                    />
                  ) : isVideoTrimModeActive ? (
                    <VideoTrimModeDisplay
                      videoRef={trimVideoRef}
                      videoUrl={effectiveVideoUrl}
                      posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                      trimState={trimState}
                      onLoadedMetadata={setVideoDuration}
                      onTimeUpdate={setTrimCurrentTime}
                    />
                  ) : (
                    // Normal video display with StyledVideoPlayer
                    <StyledVideoPlayer
                      src={effectiveVideoUrl}
                      poster={activeVariant?.thumbnail_url || media.thumbUrl}
                      loop
                      muted
                      autoPlay
                      playsInline
                      preload="auto"
                      className="max-w-full max-h-full object-contain shadow-wes border border-border/20 rounded"
                      onLoadedMetadata={(e) => {
                        const video = e.currentTarget;
                        if (Number.isFinite(video.duration) && video.duration > 0) {
                          setVideoDuration(video.duration);
                        }
                      }}
                    />
                  )
                ) : (
                  <MediaDisplayWithCanvas
                    effectiveImageUrl={effectiveMediaUrl}
                    thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                    isVideo={false}
                    isFlippedHorizontally={isFlippedHorizontally}
                    isSaving={isSaving}
                    isInpaintMode={isInpaintMode}
                    editMode={editMode}
                    repositionTransformStyle={editMode === 'reposition' ? getTransformStyle() : undefined}
                    repositionDragHandlers={editMode === 'reposition' ? repositionDragHandlers : undefined}
                    isRepositionDragging={isRepositionDragging}
                    imageContainerRef={imageContainerRef}
                    canvasRef={canvasRef}
                    maskCanvasRef={maskCanvasRef}
                    onImageLoad={setImageDimensions}
                    onContainerClick={onClose}
                    variant="regular-centered"
                    containerClassName="w-full h-full"
                    debugContext="Regular Centered"
                    // Konva-based stroke overlay props
                    imageDimensions={effectiveImageDimensions}
                    brushStrokes={brushStrokes}
                    currentStroke={currentStroke}
                    isDrawing={isDrawing}
                    isEraseMode={isEraseMode}
                    brushSize={brushSize}
                    annotationMode={editMode === 'annotate' ? annotationMode : null}
                    selectedShapeId={selectedShapeId}
                    onStrokePointerDown={handleKonvaPointerDown}
                    onStrokePointerMove={handleKonvaPointerMove}
                    onStrokePointerUp={handleKonvaPointerUp}
                    onShapeClick={handleShapeClick}
                    strokeOverlayRef={strokeOverlayRef}
                  />
                )}

                  {/* Top Center - Main Variant Badge/Button */}
                  {!readOnly && activeVariant && variants && (
                    <div
                      className="absolute top-8 md:top-16 left-1/2 transform -translate-x-1/2 z-[60] select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        {/* Main variant badge - only show when multiple variants exist */}
                        {variants.length > 1 && activeVariant.is_primary && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-green-500/90 text-white text-sm font-medium shadow-lg">
                            <Check className="w-4 h-4" />
                            <span>Main variant</span>
                          </div>
                        )}
                        {/* Make main button - only show for non-primary variants */}
                        {!activeVariant.is_primary && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleMakeMainVariant}
                            disabled={isMakingMainVariant || !canMakeMainVariant}
                            className="bg-orange-500/90 hover:bg-orange-600 text-white border-none shadow-lg"
                          >
                            {isMakingMainVariant ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                            ) : (
                              <Star className="w-4 h-4 mr-1.5" />
                            )}
                            Make main
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Top Left - New image button */}
                  {!isVideo && !readOnly && (
                    <div
                      className="absolute top-4 left-4 z-[70] select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handlePromoteToGeneration(activeVariant?.id || primaryVariant?.id || '')}
                        disabled={promoteVariantMutation.isPending || promoteSuccess || !selectedProjectId || !(activeVariant?.id || primaryVariant?.id)}
                        className={cn(
                          "bg-black/50 hover:bg-black/70 text-white",
                          promoteSuccess && "bg-green-500/90 hover:bg-green-500/90"
                        )}
                        title="Create a standalone image from this variant"
                      >
                        {promoteVariantMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        ) : promoteSuccess ? (
                          <Check className="w-4 h-4 mr-1.5" />
                        ) : (
                          <Plus className="w-4 h-4 mr-1.5" />
                        )}
                        {promoteSuccess ? 'Created' : 'New image'}
                      </Button>
                    </div>
                  )}

                  {/* Bottom Left Controls - Mode Entry Buttons */}
                  {!readOnly && (
                    <div
                      className="absolute bottom-4 left-4 z-[70] select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Compact Edit Controls - for special edit mode */}
                      {isSpecialEditMode && editMode !== 'text' && (
                        <div className="mb-2 bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 w-40 border border-border shadow-xl">
                          {/* Brush Size Slider - Only in Inpaint mode */}
                          {editMode === 'inpaint' && (
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-foreground">Size:</label>
                                <span className="text-xs text-muted-foreground">{brushSize}px</span>
                              </div>
                              <input
                                type="range"
                                min={5}
                                max={100}
                                value={brushSize}
                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
                              />
                            </div>
                          )}
                          
                          {/* Paint/Erase or Circle/Arrow Toggle */}
                          {editMode === 'inpaint' && (
                            // Inpaint mode: Paint/Erase
                            <Button
                              variant={isEraseMode ? "default" : "secondary"}
                              size="sm"
                              onClick={() => setIsEraseMode(!isEraseMode)}
                              className={cn(
                                "w-full text-xs h-7",
                                isEraseMode && "bg-purple-600 hover:bg-purple-700"
                              )}
                            >
                              <Eraser className="h-3 w-3 mr-1" />
                              {isEraseMode ? 'Erase' : 'Paint'}
                            </Button>
                          )}
                          
                          {editMode === 'annotate' && (
                            // Annotate mode: Rectangle tool (always active)
                            <div className="flex gap-1">
                              <Button
                                variant="default"
                                size="sm"
                                className="flex-1 text-xs h-7"
                                disabled
                              >
                                <Square className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          
                          {/* Undo | Clear */}
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={handleUndo}
                                  disabled={brushStrokes.length === 0}
                                  className="flex-1 text-xs h-7"
                                >
                                  <Undo2 className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="z-[100001]">Undo</TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleClearMask}
                                  disabled={brushStrokes.length === 0}
                                  className="flex-1 text-xs h-7"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="z-[100001]">Clear all</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Regular Mobile Layout - All button groups (matching desktop) */}
                  {/* Top Right Controls - Download, Delete & Close */}
                  <TopRightControls {...buttonGroupProps.topRight} />

                  {/* Bottom Left Controls - Edit & Upscale */}
                  <BottomLeftControls {...buttonGroupProps.bottomLeft} />

                  {/* Bottom Right Controls - Star & Add to References */}
                  <BottomRightControls {...buttonGroupProps.bottomRight} />

                  {/* Bottom Workflow Controls (hidden in special edit modes) */}
                  <WorkflowControlsBar
                    onAddToShot={onAddToShot}
                    onDelete={onDelete}
                    onApplySettings={onApplySettings}
                    isSpecialEditMode={isSpecialEditMode}
                    isVideo={isVideo}
                    mediaId={actualGenerationId}
                    imageUrl={effectiveMediaUrl}
                    thumbUrl={media.thumbUrl}
                    allShots={allShots}
                    selectedShotId={selectedShotId}
                    onShotChange={onShotChange}
                    onCreateShot={onCreateShot}
                    isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
                    isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
                    showTickForImageId={showTickForImageId}
                    showTickForSecondaryImageId={showTickForSecondaryImageId}
                    onAddToShotWithoutPosition={onAddToShotWithoutPosition}
                    onShowTick={onShowTick}
                    onShowSecondaryTick={onShowSecondaryTick}
                    onOptimisticPositioned={onOptimisticPositioned}
                    onOptimisticUnpositioned={onOptimisticUnpositioned}
                    contentRef={contentRef}
                    handleApplySettings={handleApplySettings}
                    onNavigateToShot={handleNavigateToShotFromSelector}
                    onClose={onClose}
                    onAddVariantAsNewGeneration={handleAddVariantAsNewGenerationToShot}
                    activeVariantId={activeVariant?.id || primaryVariant?.id}
                    currentTimelineFrame={media.timeline_frame}
                  />

                  {/* Navigation Arrows */}
                  <NavigationArrows
                    showNavigation={showNavigation}
                    readOnly={readOnly}
                    onPrevious={handleSlotNavPrev}
                    onNext={handleSlotNavNext}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    variant="mobile"
                  />
                </MediaWrapper>

                {/* Workflow Controls - Below Media (hidden in special edit modes) */}
                {!readOnly && !isSpecialEditMode && (
                  <div className="w-full" onClick={(e) => e.stopPropagation()}>
                    <WorkflowControls
                      mediaId={actualGenerationId}
                      imageUrl={effectiveMediaUrl}
                      thumbUrl={media.thumbUrl}
                      isVideo={isVideo}
                      isInpaintMode={isInpaintMode}
                      allShots={allShots}
                      selectedShotId={selectedShotId}
                      onShotChange={onShotChange}
                      onCreateShot={onCreateShot}
                      contentRef={contentRef}
                      isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
                      isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
                      showTickForImageId={showTickForImageId}
                      showTickForSecondaryImageId={showTickForSecondaryImageId}
                      onAddToShot={onAddToShot}
                      onAddToShotWithoutPosition={onAddToShotWithoutPosition}
                      onShowTick={onShowTick}
                      onApplySettings={onApplySettings}
                      handleApplySettings={handleApplySettings}
                      onDelete={onDelete}
                      handleDelete={handleDelete}
                      isDeleting={isDeleting}
                      onNavigateToShot={handleNavigateToShotFromSelector}
                      onClose={onClose}
                    />
              </div>
                )}
              </FlexContainer>
            )}
          </DialogPrimitive.Content>
        
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </TooltipProvider>
  );
};

export default MediaLightbox;

// Export types for re-export
export type { MediaLightboxProps, ShotOption }; 