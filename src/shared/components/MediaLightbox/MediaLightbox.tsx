import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { GenerationRow, Shot } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import type { SegmentSlotModeData, AdjacentSegmentsData } from './types';
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
import { invalidateVariantChange } from '@/shared/hooks/useGenerationInvalidation';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';

// Import extracted hooks
import {
  useUpscale,
  useInpainting,
  useReferences,
  useGenerationLineage,
  useShotCreation,
  useLightboxNavigation,
  useStarToggle,
  useShotPositioning,
  useSourceGeneration,
  useLayoutMode,
  useMagicEditMode,
  useEditSettingsPersistence,
  useRepositionMode,
  useSwipeNavigation,
  useButtonGroupProps,
  useImg2ImgMode,
  useSegmentSlotMode,
  useReplaceInShot,
  useMakeMainVariant,
  // Newly integrated hooks
  useEffectiveMedia,
  useAdjustedTaskDetails,
  useVideoRegenerateMode,
  useVideoEditModeHandlers,
  usePanelModeRestore,
  useEditSettingsSync,
  useJoinClips,
  useVariantSelection,
  useVariantPromotion,
  useLightboxLayoutProps,
} from './hooks';

// Import only directly-used components (others are used via layout components)
import {
  SegmentSlotFormView,
} from './components';

// Import layout components
import {
  DesktopSidePanelLayout,
  MobileStackedLayout,
  CenteredLayout,
} from './components/layouts';

// Import utils
import { downloadMedia } from './utils';

// Import video trim hooks (components used via layout components)
import {
  useVariants,
  useVideoTrimming,
  useTrimSave,
} from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor';
import { useVideoEditing } from './hooks/useVideoEditing';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';

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
  /**
   * Adjacent segment data for navigation from images to videos.
   * When provided, shows buttons to jump to videos that start/end with this image.
   */
  adjacentSegments?: AdjacentSegmentsData;
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
  // Adjacent segment navigation
  adjacentSegments,
}) => {
  // ========================================
  // SEGMENT SLOT MODE - Unified segment editor
  // ========================================
  const {
    isSegmentSlotMode,
    hasSegmentVideo,
    isFormOnlyMode,
    media,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
  } = useSegmentSlotMode({
    segmentSlotMode,
    mediaProp,
    hasNextProp,
    hasPreviousProp,
    onNext,
    onPrevious,
  });

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

  // Lock body scroll when lightbox is open on desktop
  // (On mobile, Radix's modal={true} handles this, but on desktop we use modal={false}
  // to allow TasksPane interaction, so we need manual scroll locking)
  useEffect(() => {
    if (isMobile) return; // Radix handles mobile

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobile]);

  const { selectedProjectId, projects } = useProject();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
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

  // Variant selection with mark-as-viewed behavior
  const { setActiveVariantId, isViewingNonPrimaryVariant } = useVariantSelection({
    media,
    rawSetActiveVariantId,
    activeVariant,
    variants,
    initialVariantId,
  });

  // Variant promotion - create standalone generation from a variant
  const {
    promoteSuccess,
    isPromoting,
    handlePromoteToGeneration,
    handleAddVariantAsNewGenerationToShot,
  } = useVariantPromotion({
    selectedProjectId,
    actualGenerationId,
  });

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
    qwenEditModel, // Pass model selection for inpaint/annotate modes
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
  
  // Edit settings sync hook - bidirectional sync between persistence and UI
  useEditSettingsSync({
    actualGenerationId,
    isEditSettingsReady,
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
    setPersistedEditMode,
    setPersistedNumGenerations,
    setPersistedPrompt,
  });
  
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

  // Load variant settings for image editing tasks
  // When variantParamsToLoad is set and it's an image edit task, load the settings into the form
  useEffect(() => {
    if (!variantParamsToLoad || isVideo) return;

    // Check both task_type and created_from fields (variants store task type in created_from)
    const taskType = (variantParamsToLoad.task_type || variantParamsToLoad.created_from) as string | undefined;

    // Check if it's an image edit task type
    const imageEditTaskTypes = [
      'z_image_turbo_i2i',
      'image_inpaint',
      'qwen_image_edit',
      'magic_edit',
      'kontext_image_edit',
      'flux_image_edit',
      'annotated_image_edit',
    ];

    console.log('[LoadVariantSettings] Checking variant params for image edit:', {
      task_type: variantParamsToLoad.task_type,
      created_from: variantParamsToLoad.created_from,
      resolvedTaskType: taskType,
      isImageEdit: taskType ? imageEditTaskTypes.includes(taskType) : false,
    });

    if (!taskType || !imageEditTaskTypes.includes(taskType)) {
      // Not an image edit task, let video handling deal with it
      return;
    }

    console.log('[LoadVariantSettings] Loading image edit variant settings:', {
      taskType,
      prompt: variantParamsToLoad.prompt?.substring(0, 50),
      hasLoras: !!variantParamsToLoad.loras?.length,
      qwenEditModel: variantParamsToLoad.qwen_edit_model,
      strength: variantParamsToLoad.strength,
    });

    // Determine edit mode from task type
    let targetEditMode: 'text' | 'inpaint' | 'annotate' | 'img2img' = 'text';
    if (taskType === 'z_image_turbo_i2i') {
      targetEditMode = 'img2img';
    } else if (taskType === 'image_inpaint') {
      targetEditMode = 'inpaint';
    } else if (taskType === 'annotated_image_edit') {
      targetEditMode = 'annotate';
    }
    // magic_edit, qwen_image_edit, kontext_image_edit, flux_image_edit → 'text'

    // Enter edit mode and set the correct sub-mode
    handleEnterMagicEditMode();
    setEditMode(targetEditMode);

    // Load prompt
    if (variantParamsToLoad.prompt) {
      if (targetEditMode === 'img2img') {
        setImg2imgPrompt(variantParamsToLoad.prompt);
      } else {
        setInpaintPrompt(variantParamsToLoad.prompt);
      }
    }

    // Load img2img strength
    if (targetEditMode === 'img2img' && typeof variantParamsToLoad.strength === 'number') {
      setImg2imgStrength(variantParamsToLoad.strength);
    }

    // Load qwen edit model
    if (variantParamsToLoad.qwen_edit_model && setQwenEditModel) {
      setQwenEditModel(variantParamsToLoad.qwen_edit_model);
    }

    // Load LoRAs
    if (variantParamsToLoad.loras && Array.isArray(variantParamsToLoad.loras)) {
      const loraManager = targetEditMode === 'img2img' ? img2imgLoraManager : editLoraManager;
      if (loraManager) {
        // Clear existing LoRAs first
        loraManager.selectedLoras.forEach(lora => loraManager.handleRemoveLora(lora.id));
        // Add new LoRAs
        variantParamsToLoad.loras.forEach((lora: { url: string; strength: number }) => {
          // Find matching LoRA in available list
          const matchingLora = availableLoras?.find(l => l.URL === lora.url);
          if (matchingLora) {
            loraManager.handleAddLora({
              ...matchingLora,
              strength: lora.strength,
            });
          }
        });
      }
    }

    // Load number of generations
    if (typeof variantParamsToLoad.numImages === 'number') {
      setInpaintNumGenerations(variantParamsToLoad.numImages);
    }

    // Clear the params after loading
    setVariantParamsToLoad(null);
  }, [
    variantParamsToLoad,
    isVideo,
    handleEnterMagicEditMode,
    setEditMode,
    setInpaintPrompt,
    setImg2imgPrompt,
    setImg2imgStrength,
    setQwenEditModel,
    setInpaintNumGenerations,
    setVariantParamsToLoad,
    img2imgLoraManager,
    editLoraManager,
    availableLoras,
  ]);

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

  // Generation name - stubbed out (hook was removed)
  const generationName = media?.name || '';
  const isEditingGenerationName = false;
  const setIsEditingGenerationName = (_: boolean) => {};
  const handleGenerationNameChange = (_: string) => {};

  // References hook
  const referencesHook = useReferences({ media, selectedProjectId, isVideo, selectedShotId });
  const {
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
  } = referencesHook;

  // Add to Join Clips functionality
  const {
    isAddingToJoin,
    addToJoinSuccess,
    handleAddToJoin,
    handleGoToJoin,
  } = useJoinClips({ media, isVideo });

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

  // Effective media hook - computes effective URLs and dimensions
  const { effectiveVideoUrl, effectiveMediaUrl, effectiveImageDimensions } = useEffectiveMedia({
    isVideo,
    activeVariant,
    effectiveImageUrl,
    imageDimensions,
    projectAspectRatio,
  });

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

  // Adjusted task details hook - shows variant's source task instead of original generation's task
  const { adjustedTaskDetailsData } = useAdjustedTaskDetails({
    activeVariant,
    taskDetailsData,
    isLoadingVariants,
    initialVariantId,
  });

  // Video regenerate mode hook - handles shot data, canRegenerate, and regenerateFormProps
  const { canRegenerate, regenerateFormProps } = useVideoRegenerateMode({
    isVideo,
    media,
    shotId,
    selectedProjectId,
    actualGenerationId,
    adjustedTaskDetailsData,
    primaryVariant,
    currentSegmentImages,
    segmentSlotMode,
    variantParamsToLoad,
    setVariantParamsToLoad,
    // In segment slot mode, the callback comes via segmentSlotMode; otherwise via prop
    onSegmentFrameCountChange: segmentSlotMode?.onFrameCountChange ?? onSegmentFrameCountChange,
    currentFrameCount,
  });

  // Video edit mode handlers hook - provides enter/exit handlers for video edit modes
  const videoEditModeHandlers = useVideoEditModeHandlers({
    setVideoEditSubMode,
    persistedVideoEditSubMode,
    canRegenerate,
    setPersistedPanelMode,
    videoEditingSetIsVideoEditMode: videoEditing.setIsVideoEditMode,
    onTrimModeChange,
    resetTrim,
    setVideoDuration,
  });
  const {
    handleEnterVideoEditMode,
    handleExitVideoEditMode,
    handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode,
    handleExitVideoTrimMode,
  } = videoEditModeHandlers;

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

  // Panel mode restore hook - restores edit/info mode when opening media
  usePanelModeRestore({
    mediaId: media.id,
    persistedPanelMode,
    isVideo,
    isSpecialEditMode,
    isInVideoEditMode,
    initialVideoTrimMode,
    autoEnterInpaint,
    handleEnterVideoEditMode,
    handleEnterMagicEditMode,
  });

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
  
  // Use the extracted hook for replace in shot functionality
  const { handleReplaceInShot } = useReplaceInShot({ onClose });

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

  // Use the extracted hook for make main variant functionality
  const { isMakingMainVariant, handleMakeMainVariant } = useMakeMainVariant({
    media,
    sourceGenerationData,
    canMakeMainVariantFromChild,
    canMakeMainVariantFromVariant,
    activeVariant,
    setPrimaryVariant,
    refetchVariants,
    shotId,
    selectedShotId,
    onClose,
  });


  // ==========================================================================
  // LAYOUT PROPS BUILDING (via hook)
  // ==========================================================================
  const {
    controlsPanelProps,
    workflowBarProps,
    floatingToolProps,
    sidePanelLayoutProps,
    centeredLayoutProps,
  } = useLightboxLayoutProps({
    // Core
    onClose,
    readOnly,
    selectedProjectId,
    isMobile,
    actualGenerationId,

    // Media
    media,
    isVideo,
    effectiveMediaUrl,
    effectiveVideoUrl,
    imageDimensions,
    setImageDimensions,
    effectiveImageDimensions,

    // Variants
    variants,
    activeVariant,
    primaryVariant,
    isLoadingVariants,
    setActiveVariantId,
    setPrimaryVariant,
    deleteVariant,
    promoteSuccess,
    isPromoting,
    handlePromoteToGeneration,
    isMakingMainVariant,
    canMakeMainVariant,
    handleMakeMainVariant,
    variantParamsToLoad,
    setVariantParamsToLoad,
    variantsSectionRef,

    // Video edit
    isVideoTrimModeActive,
    isVideoEditModeActive,
    isInVideoEditMode,
    videoEditSubMode,
    trimVideoRef,
    trimState,
    setStartTrim,
    setEndTrim,
    resetTrim,
    trimmedDuration,
    hasTrimChanges,
    saveTrimmedVideo,
    isSavingTrim,
    trimSaveProgress,
    trimSaveError,
    trimSaveSuccess,
    setVideoDuration,
    setTrimCurrentTime,
    trimCurrentTime,
    videoEditing,
    handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode,
    handleExitVideoEditMode,
    handleEnterVideoEditMode,
    regenerateFormProps,

    // Edit mode
    isInpaintMode,
    isAnnotateMode,
    isSpecialEditMode,
    editMode,
    setEditMode,
    setIsInpaintMode,
    brushStrokes,
    currentStroke,
    isDrawing,
    isEraseMode,
    setIsEraseMode,
    brushSize,
    setBrushSize,
    annotationMode,
    setAnnotationMode,
    selectedShapeId,
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
    strokeOverlayRef,
    handleUndo,
    handleClearMask,
    getDeleteButtonPosition,
    handleToggleFreeForm,
    handleDeleteSelected,
    isRepositionDragging,
    repositionDragHandlers,
    getTransformStyle,
    repositionTransform,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    imageContainerRef,
    canvasRef: displayCanvasRef,
    maskCanvasRef,
    isFlippedHorizontally,
    isSaving,
    handleExitInpaintMode,
    inpaintPanelPosition,
    setInpaintPanelPosition,

    // Edit form props
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    handleGenerateAnnotatedEdit,
    handleGenerateReposition,
    isGeneratingReposition,
    repositionGenerateSuccess,
    hasTransformChanges,
    handleSaveAsVariant,
    isSavingAsVariant,
    saveAsVariantSuccess,
    createAsGeneration,
    setCreateAsGeneration,

    // Img2Img props
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    handleGenerateImg2Img,
    img2imgLoraManager,
    availableLoras,
    editLoraManager,
    advancedSettings,
    setAdvancedSettings,
    isLocalGeneration,
    qwenEditModel,
    setQwenEditModel,

    // Info panel props
    showImageEditTools,
    adjustedTaskDetailsData,
    generationName,
    handleGenerationNameChange,
    isEditingGenerationName,
    setIsEditingGenerationName,
    derivedItems,
    derivedGenerations,
    paginatedDerived,
    derivedPage,
    derivedTotalPages,
    setDerivedPage,
    replaceImages,
    setReplaceImages,
    sourceGenerationData,
    sourcePrimaryVariant,
    onOpenExternalGeneration,

    // Navigation
    showNavigation,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeNavigation,

    // Panel
    effectiveTasksPaneOpen,
    effectiveTasksPaneWidth,

    // Button group props (pre-built)
    buttonGroupProps,

    // Workflow props
    allShots,
    selectedShotId,
    shotId,
    onAddToShot,
    onAddToShotWithoutPosition,
    onDelete,
    onApplySettings,
    onShotChange,
    onCreateShot,
    showTickForImageId,
    showTickForSecondaryImageId,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    contentRef,
    handleApplySettings,
    handleNavigateToShotFromSelector,
    handleAddVariantAsNewGenerationToShot,
    handleReplaceInShot,
    isDeleting,
    handleDelete,

    // Adjacent segment navigation
    adjacentSegments,

    // Segment slot mode (for constituent image navigation)
    segmentSlotMode: hasSegmentVideo ? segmentSlotMode : undefined,
  });

  return (
    <TooltipProvider delayDuration={500}>
      <DialogPrimitive.Root
        open={true}
        // Modal mode blocks body scroll and traps focus
        // On tablet/desktop, disable modal to allow pane controls interaction
        // On phones only, keep modal=true for proper scroll locking
        modal={isMobile && !isTabletOrLarger}
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

              // Check if click target is on an element with higher z-index (e.g., pane controls)
              // Walk up the DOM tree to check
              let target = e.target as HTMLElement | null;
              while (target && target !== document.body) {
                const zIndex = parseInt(window.getComputedStyle(target).zIndex || '0', 10);
                if (zIndex > 100000) {
                  return; // Let the higher z-index element handle the event
                }
                target = target.parentElement;
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

              // Check if click target is on an element with higher z-index (e.g., pane controls)
              let target = e.target as HTMLElement | null;
              while (target && target !== document.body) {
                const zIndex = parseInt(window.getComputedStyle(target).zIndex || '0', 10);
                if (zIndex > 100000) {
                  return; // Let the higher z-index element handle the event
                }
                target = target.parentElement;
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

              // Check if click target is on an element with higher z-index (e.g., pane controls)
              let target = e.target as HTMLElement | null;
              while (target && target !== document.body) {
                const zIndex = parseInt(window.getComputedStyle(target).zIndex || '0', 10);
                if (zIndex > 100000) {
                  return; // Let the higher z-index element handle the event
                }
                target = target.parentElement;
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

              // Check if click target is on an element with higher z-index (e.g., pane controls)
              let target = e.target as HTMLElement | null;
              while (target && target !== document.body) {
                const zIndex = parseInt(window.getComputedStyle(target).zIndex || '0', 10);
                if (zIndex > 100000) {
                  return; // Let the higher z-index element handle the event
                }
                target = target.parentElement;
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
              // Ensure full coverage - use 100dvh for iPad compatibility
              position: 'fixed',
              top: 0,
              left: 0,
              // Adjust for tasks pane on tablet/desktop (use isTabletOrLarger, not !isMobile, for iPad support)
              right: effectiveTasksPaneOpen && isTabletOrLarger ? `${effectiveTasksPaneWidth}px` : 0,
              bottom: 0,
              // Explicit height for iPad - bottom:0 alone can be inconsistent
              height: '100dvh',
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
                width: `calc(100vw - ${effectiveTasksPaneWidth}px)`,
                // Explicit height for iPad - h-full (100%) can be inconsistent
                height: '100dvh',
              } : needsFullscreenLayout ? {
                width: '100vw',
                // Explicit height for iPad - h-full (100%) can be inconsistent
                height: '100dvh',
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
                readOnly={readOnly}
              />
            ) : shouldShowSidePanelWithTrim ? (
              // Tablet/Desktop layout with side panel
              <DesktopSidePanelLayout {...sidePanelLayoutProps} />
            ) : (showTaskDetails || isSpecialEditMode || isVideoTrimModeActive || isVideoEditModeActive || (isSegmentSlotMode && hasSegmentVideo)) && isMobile ? (
              // Mobile layout with stacked panels
              <MobileStackedLayout {...sidePanelLayoutProps} />
            ) : (
              // Centered layout (no side panel)
              <CenteredLayout {...centeredLayoutProps} />
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
