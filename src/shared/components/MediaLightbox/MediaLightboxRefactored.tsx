import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { GenerationRow, Shot } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Move,
  Edit3,
  Pencil,
  Eraser,
  Square,
  Diamond,
  Undo2,
  X,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';

// Import all extracted hooks
import {
  useUpscale,
  useInpainting,
  useImageFlip,
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
} from './hooks';

// Import all extracted components
import {
  MediaDisplay,
  NavigationButtons,
  InpaintControlsPanel,
  MagicEditControlsPanel,
  TaskDetailsSection,
  MediaControls,
  WorkflowControls,
  MediaDisplayWithCanvas,
  SourceGenerationDisplay,
  FloatingToolControls,
  TopLeftControls,
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
  DerivedGenerationsGrid,
  EditModePanel,
  ShotSelectorControls,
  WorkflowControlsBar,
  NavigationArrows,
  OpenEditModeButton,
  TaskDetailsPanelWrapper,
} from './components';
import { FlexContainer, MediaWrapper } from './components/layouts';

// Import utils
import { downloadMedia } from './utils';

// Import video trim components (conditional for segment videos)
import {
  useVariants,
  useVideoTrimming,
  useTrimSave,
  TrimControlsPanel,
  VariantSelector,
} from '@/tools/travel-between-images/components/VideoGallery/components/VideoTrimEditor';

interface ShotOption {
  id: string;
  name: string;
}

interface MediaLightboxProps {
  media: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onImageSaved?: (newImageUrl: string, createNew?: boolean) => Promise<void>;
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
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
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
  onNavigateToShot?: (shot: Shot) => void;
  // Tool type override for magic edit
  toolTypeOverride?: string;
  // Optimistic updates
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (mediaId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string) => void;
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
  // Video trim functionality (optional, only for segment videos)
  showVideoTrimEditor?: boolean;
  onTrimModeChange?: (isTrimMode: boolean) => void;
}

const MediaLightbox: React.FC<MediaLightboxProps> = ({ 
  media, 
  onClose, 
  onNext, 
  onPrevious, 
  onImageSaved,
  readOnly = false,
  showNavigation = true,
  showImageEditTools = true,
  showDownload = true,
  showMagicEdit = false,
  autoEnterInpaint = false,
  // Navigation availability
  hasNext = true,
  hasPrevious = true,
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
}) => {
  // ========================================
  // REFACTORED: All logic extracted to hooks
  // ========================================

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
  const DOUBLE_TAP_DELAY = 300; // ms

  // Basic hooks
  const isMobile = useIsMobile();
  const { selectedProjectId } = useProject();
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudMode = generationMethods.inCloud;

  // Video trim mode state (only used when showVideoTrimEditor is true)
  const [isVideoTrimMode, setIsVideoTrimMode] = useState(false);

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

  // Safety check
  if (!media) {
    console.error('[MediaLightbox] ❌ No media prop provided!');
    return null;
  }

  // Derived values - uses canonical isVideoAny from typeGuards
  const isVideo = isVideoAny(media as any);
  
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

  // Image flip hook  
  const imageFlipHook = useImageFlip({ 
    media, 
    onImageSaved,
    onClose,
  });
  const { 
    isFlippedHorizontally,
      hasChanges,
      isSaving,
    handleFlip,
    handleSave,
    imageDimensions,
    setImageDimensions,
    canvasRef,
  } = imageFlipHook;

  // Edit Mode LoRAs hook
  const { isInSceneBoostEnabled, setIsInSceneBoostEnabled, loraMode, setLoraMode, customLoraUrl, setCustomLoraUrl, editModeLoRAs } = useEditModeLoRAs();

  // Variants hook - fetch available variants for this generation
  // Moved early so activeVariant is available for edit hooks
  const variantsHook = useVariants({
    generationId: media.id,
    enabled: true, // Always enabled to support variant display in DerivedGenerationsGrid
  });
  const {
    variants,
    primaryVariant,
    activeVariant,
    isLoading: isLoadingVariants,
    setActiveVariantId: rawSetActiveVariantId,
    refetch: refetchVariants,
    setPrimaryVariant,
  } = variantsHook;
  
  // Wrap setActiveVariantId with logging
  const setActiveVariantId = React.useCallback((variantId: string) => {
    console.log('[VariantClickDebug] setActiveVariantId called:', {
      variantId: variantId?.substring(0, 8),
      currentActiveVariant: activeVariant?.id?.substring(0, 8),
      variantsCount: variants?.length,
    });
    rawSetActiveVariantId(variantId);
  }, [rawSetActiveVariantId, activeVariant, variants]);
  
  // Log when activeVariant changes
  React.useEffect(() => {
    console.log('[VariantClickDebug] activeVariant changed:', {
      activeVariantId: activeVariant?.id?.substring(0, 8),
      activeVariantType: activeVariant?.variant_type,
      activeVariantIsPrimary: activeVariant?.is_primary,
      activeVariantLocation: activeVariant?.location?.substring(0, 50),
    });
  }, [activeVariant]);

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
    loras: editModeLoRAs,
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
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClearMask,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,
  } = inpaintingHook;
  
  // Handle exiting inpaint mode from UI buttons
  const handleExitInpaintMode = () => {
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
    editModeLoRAs,
    sourceUrlForTasks,
    imageDimensions,
    toolTypeOverride,
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
    // Pass variant info for tracking source_variant_id
    activeVariantId: isViewingNonPrimaryVariant ? activeVariant?.id : null,
    activeVariantLocation: isViewingNonPrimaryVariant ? activeVariant?.location : null,
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
    isUnifiedEditMode
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

  // Generation lineage hook
  const lineageHook = useGenerationLineage({ media });
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

  // Navigation hook
  const navigationHook = useLightboxNavigation({
    onNext,
    onPrevious,
    onClose,
    isInpaintMode,
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
  // VIDEO TRIM HOOKS (only when showVideoTrimEditor is true)
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

  // Get the effective media URL (active variant or current media)
  // For videos with trim editor, use active variant
  // For images with selected edit variant, also use that variant
  const effectiveVideoUrl = useMemo(() => {
    if (showVideoTrimEditor && activeVariant) {
      return activeVariant.location;
    }
    return effectiveImageUrl;
  }, [showVideoTrimEditor, activeVariant, effectiveImageUrl]);

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
      setIsVideoTrimMode(false);
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


  // For segment videos (showVideoTrimEditor), hide the "Apply These Settings" button
  const adjustedTaskDetailsData = useMemo(() => {
    if (!taskDetailsData) return undefined;
    if (!showVideoTrimEditor) return taskDetailsData;
    
    // Strip onApplySettingsFromTask for segment videos
    const { onApplySettingsFromTask, ...rest } = taskDetailsData;
    return rest;
  }, [taskDetailsData, showVideoTrimEditor]);

  // Handle entering/exiting video trim mode
  const handleEnterVideoTrimMode = useCallback(() => {
    setIsVideoTrimMode(true);
    onTrimModeChange?.(true);
    
    // Try to capture video duration from already-loaded video element
    setTimeout(() => {
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach((video) => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          setVideoDuration(video.duration);
        }
      });
    }, 100);
  }, [onTrimModeChange, setVideoDuration]);

  const handleExitVideoTrimMode = useCallback(() => {
    setIsVideoTrimMode(false);
    resetTrim();
    onTrimModeChange?.(false);
  }, [resetTrim, onTrimModeChange]);

  // Track if we're in any special edit mode (including video trim)
  const isVideoTrimModeActive = showVideoTrimEditor && isVideo && isVideoTrimMode;

  // Combined special edit mode (for hiding certain UI elements)
  const isAnySpecialEditMode = isSpecialEditMode || isVideoTrimModeActive;

  // Should show side panel (includes video trim mode)
  const shouldShowSidePanelWithTrim = shouldShowSidePanel || isVideoTrimModeActive;

  // ========================================
  // SIMPLE HANDLERS - Just call props
  // ========================================

  const handleDownload = async () => {
    // Use the effective media URL (may be a variant)
    const urlToDownload = isVideo ? effectiveVideoUrl : effectiveMediaUrl;
    await downloadMedia(urlToDownload, media.id, isVideo);
  };

  const handleDelete = () => {
    if (onDelete) {
      // Delete the item - the parent will handle navigation automatically
      onDelete(media.id);
    }
  };

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
      onNavigateToShot(minimalShot);
    }
  }, [onNavigateToShot]);
  
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
    
    // Case 2: We're viewing a non-primary variant - just set it as primary
    if (canMakeMainVariantFromVariant && activeVariant) {
      console.log('[VariantClickDebug] Setting existing variant as primary:', activeVariant.id.substring(0, 8));
      try {
        await setPrimaryVariant(activeVariant.id);
        console.log('[VariantClickDebug] Successfully set variant as primary');
        // Refetch variants to update UI
        refetchVariants();
      } catch (error) {
        console.error('[VariantClickDebug] Failed to set variant as primary:', error);
      }
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
    
    try {
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
      
      // Refresh the page to show updated data
      onClose();
    } catch (error) {
      console.error('[VariantClickDebug] handleMakeMainVariant failed:', error);
      throw error;
    }
  }, [sourceGenerationData, media, onClose, canMakeMainVariantFromChild, canMakeMainVariantFromVariant, activeVariant, setPrimaryVariant, refetchVariants]);

  return (
    <TooltipProvider delayDuration={500}>
      <DialogPrimitive.Root 
        open={true} 
        // Allow scrolling/interactions outside when tasks pane is open on desktop
        modal={!(tasksPaneOpen && !isMobile)}
        onOpenChange={() => {
          // Prevent automatic closing - we handle all closing manually
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay 
            className={cn(
              "fixed inset-0 z-[100000] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
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
              
              // Single clicks don't close - only double-clicks close now
              // Just reset the tracking
              pointerDownTargetRef.current = null;
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
              // Adjust for tasks pane on desktop
              right: tasksPaneOpen && !isMobile ? `${tasksPaneWidth}px` : 0,
              bottom: 0,
              // Adjust width for tasks pane on desktop
              ...(tasksPaneOpen && !isMobile ? {
                width: `calc(100vw - ${tasksPaneWidth}px)`
              } : {})
            }}
          />
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
              // Layout: Full screen for special modes on tablet+, otherwise centered
              shouldShowSidePanel
                ? "left-0 top-0 h-full" // Full screen layout for side panel modes (width handled inline)
                : isMobile 
                  ? "inset-0 w-full h-full" // Mobile: full screen
                  : "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-auto h-auto data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
            )}
            style={shouldShowSidePanel && tasksPaneOpen && !isMobile ? {
              width: `calc(100vw - ${tasksPaneWidth}px)`
            } : shouldShowSidePanelWithTrim ? {
              width: '100vw'
            } : undefined}
            onPointerDownOutside={(event) => {
              if (isInpaintMode) {
                // 🚀 MOBILE FIX: Prevent underlying click-throughs and then close manually
                // Always stop propagation and default so the gesture does not reach elements behind
                event.preventDefault();
                event.stopPropagation();
                
                // Extra mobile protection: block all event propagation
                if (typeof event.stopImmediatePropagation === 'function') {
                  event.stopImmediatePropagation();
                }

                if (shouldShowSidePanel) {
                  // Tablet/Desktop with side panel: only close if clicking on the panel or buttons
                  const target = event.target as Element;
                  if (target.closest('[data-task-details-panel]') || target.closest('[role="button"]')) {
                    return;
                  }
                }

                // Don't close if clicking inside Radix portals (Select, Popover, DropdownMenu)
                const target = event.target as Element;
                if (target.closest('[data-radix-select-content]') || 
                    target.closest('[data-radix-select-viewport]') ||
                    target.closest('[data-radix-select-item]') ||
                    target.closest('[data-radix-popover-content]') || 
                    target.closest('[data-radix-dropdown-menu-content]')) {
                  return;
                }

                // Don't close if Select is open
                if (isSelectOpen) {
                  return;
                }

                // Don't close if clicking on ShotSelector trigger or content (additional safety)
                if (target.closest('[data-radix-select-trigger]') || target.closest('[data-radix-select-content]')) {
                  return;
                }
                
                // Use setTimeout to ensure the event is fully blocked before closing
                setTimeout(() => {
                  onClose();
                }, 0);
              }
            }}
          >
            {/* Accessibility: Hidden dialog title for screen readers */}
            <DialogPrimitive.Title className="sr-only">
              {media.type?.includes('video') ? 'Video' : 'Image'} Lightbox - {media.id?.substring(0, 8)}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              View and interact with {media.type?.includes('video') ? 'video' : 'image'} in full screen. Use arrow keys to navigate, Escape to close.
            </DialogPrimitive.Description>
            
            {shouldShowSidePanelWithTrim ? (
              // Tablet/Desktop layout with side panel (task details, inpaint, magic edit, or video trim)
              <div 
                className="w-full h-full flex bg-black/90"
                onClick={(e) => {
                  // Swallow event - single clicks don't close, only double-clicks
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => {
                  // Close if double-clicking on the background (not on content)
                  e.stopPropagation();
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
                    // Swallow event - single clicks don't close, only double-clicks
                    e.stopPropagation();
                  }}
                  onDoubleClick={(e) => {
                    // Close if double-clicking on the media section background (not on content)
                    e.stopPropagation();
                    if (e.target === e.currentTarget) {
                      onClose();
                    }
                  }}
                >
                  {/* Navigation Arrows */}
                  <NavigationArrows
                    showNavigation={showNavigation}
                    readOnly={readOnly}
                    onPrevious={onPrevious}
                    onNext={onNext}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    variant="desktop"
                  />

                  {/* Media Content */}
                  <MediaDisplayWithCanvas
                    effectiveImageUrl={isVideo ? effectiveVideoUrl : effectiveMediaUrl}
                    thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                    isVideo={isVideo}
                    isFlippedHorizontally={isFlippedHorizontally}
                    isSaving={isSaving}
                    isInpaintMode={isInpaintMode}
                    editMode={editMode}
                    imageContainerRef={imageContainerRef}
                    canvasRef={canvasRef}
                    displayCanvasRef={displayCanvasRef}
                    maskCanvasRef={maskCanvasRef}
                    onImageLoad={setImageDimensions}
                    onVideoLoadedMetadata={(e) => {
                      const video = e.currentTarget;
                      if (Number.isFinite(video.duration) && video.duration > 0 && showVideoTrimEditor) {
                        setVideoDuration(video.duration);
                      }
                    }}
                    handlePointerDown={handlePointerDown}
                    handlePointerMove={handlePointerMove}
                    handlePointerUp={handlePointerUp}
                    variant="desktop-side-panel"
                    containerClassName="max-w-full max-h-full"
                    tasksPaneWidth={tasksPaneOpen && !isMobile ? tasksPaneWidth : 0}
                    debugContext="Desktop"
                  />

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

                    {/* Top Left Controls - Flip & Save */}
                    <TopLeftControls
                      isVideo={isVideo}
                      readOnly={readOnly}
                      isSpecialEditMode={isSpecialEditMode}
                      selectedProjectId={selectedProjectId}
                      isCloudMode={isCloudMode}
                      showImageEditTools={showImageEditTools}
                      hasChanges={hasChanges}
                      isSaving={isSaving}
                      handleFlip={handleFlip}
                      handleSave={handleSave}
                      effectiveImageUrl={effectiveMediaUrl}
                    />

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
                        annotationMode={annotationMode}
                        onSetAnnotationMode={setAnnotationMode}
                        brushStrokes={brushStrokes}
                        onUndo={handleUndo}
                        onClearMask={handleClearMask}
                        panelPosition={inpaintPanelPosition}
                        onSetPanelPosition={setInpaintPanelPosition}
                      />
                    )}

                    {/* Bottom Left Controls - Edit & Upscale */}
                    <BottomLeftControls
                      isVideo={isVideo}
                      readOnly={readOnly}
                      isSpecialEditMode={isSpecialEditMode}
                      selectedProjectId={selectedProjectId}
                      isCloudMode={isCloudMode}
                      handleEnterMagicEditMode={handleEnterMagicEditMode}
                      isUpscaling={isUpscaling}
                      isPendingUpscale={isPendingUpscale}
                      hasUpscaledVersion={hasUpscaledVersion}
                      showingUpscaled={showingUpscaled}
                      handleUpscale={handleUpscale}
                      handleToggleUpscaled={handleToggleUpscaled}
                    />

                    {/* Bottom Right Controls - Star & Add to References */}
                    <BottomRightControls
                      isVideo={isVideo}
                      readOnly={readOnly}
                      isSpecialEditMode={isSpecialEditMode}
                      selectedProjectId={selectedProjectId}
                      isCloudMode={isCloudMode}
                      localStarred={localStarred}
                      handleToggleStar={handleToggleStar}
                      toggleStarPending={toggleStarMutation.isPending}
                      isAddingToReferences={isAddingToReferences}
                      addToReferencesSuccess={addToReferencesSuccess}
                      handleAddToReferences={handleAddToReferences}
                    />

                    {/* Top Right Controls - Download, Delete & Close */}
                    <TopRightControls
                      isVideo={isVideo}
                      readOnly={readOnly}
                      isSpecialEditMode={isSpecialEditMode}
                      selectedProjectId={selectedProjectId}
                      isCloudMode={isCloudMode}
                      showDownload={showDownload}
                      handleDownload={handleDownload}
                      onDelete={onDelete}
                      handleDelete={handleDelete}
                      isDeleting={isDeleting}
                      mediaId={media.id}
                      onClose={onClose}
                    />

                    {/* Bottom Workflow Controls (hidden in special edit modes) */}
                    <WorkflowControlsBar
                      onAddToShot={onAddToShot}
                      onDelete={onDelete}
                      onApplySettings={onApplySettings}
                      isSpecialEditMode={isSpecialEditMode}
                      isVideo={isVideo}
                      allShots={allShots}
                      selectedShotId={selectedShotId}
                      onShotChange={onShotChange}
                      onCreateShot={onCreateShot}
                      isCreatingShot={isCreatingShot}
                      quickCreateSuccess={quickCreateSuccess}
                      handleQuickCreateAndAdd={handleQuickCreateAndAdd}
                      handleQuickCreateSuccess={handleQuickCreateSuccess}
                      isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
                      isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
                      showTickForImageId={showTickForImageId}
                      showTickForSecondaryImageId={showTickForSecondaryImageId}
                      mediaId={media.id}
                      onAddToShotWithoutPosition={onAddToShotWithoutPosition}
                      handleAddToShot={handleAddToShot}
                      handleAddToShotWithoutPosition={handleAddToShotWithoutPosition}
                      setIsSelectOpen={setIsSelectOpen}
                      contentRef={contentRef}
                      handleApplySettings={handleApplySettings}
                      onNavigateToShot={handleNavigateToShotFromSelector}
                    />
                  </div>

                {/* Task Details / Inpaint / Magic Edit / Video Trim Panel - Right side (40% width) */}
                <div 
                  data-task-details-panel
                  className={cn(
                    "bg-background border-l border-border overflow-y-auto relative z-[60]"
                    // Removed flex centering to prevent top clipping with long content
                  )}
                  style={{ width: '40%' }}
                >
                  {isVideoTrimModeActive ? (
                    <TrimControlsPanel
                      trimState={trimState}
                      onStartTrimChange={setStartTrim}
                      onEndTrimChange={setEndTrim}
                      onResetTrim={resetTrim}
                      trimmedDuration={trimmedDuration}
                      hasTrimChanges={hasTrimChanges}
                      onSave={saveTrimmedVideo}
                      isSaving={isSavingTrim}
                      saveProgress={trimSaveProgress}
                      saveError={trimSaveError}
                      saveSuccess={trimSaveSuccess}
                      onClose={handleExitVideoTrimMode}
                      variant="desktop"
                      videoUrl={effectiveVideoUrl}
                    />
                  ) : isSpecialEditMode ? (
                    <EditModePanel
                      sourceGenerationData={sourceGenerationData}
                      onOpenExternalGeneration={onOpenExternalGeneration}
                      currentShotId={selectedShotId || shotId}
                      allShots={allShots}
                      currentMediaId={media.id}
                      isCurrentMediaPositioned={isAlreadyPositionedInSelectedShot}
                      onReplaceInShot={handleReplaceInShot}
                      sourcePrimaryVariant={sourcePrimaryVariant}
                      onMakeMainVariant={handleMakeMainVariant}
                      canMakeMainVariant={canMakeMainVariant}
                      editMode={editMode}
                      setEditMode={setEditMode}
                      setIsInpaintMode={setIsInpaintMode}
                      showTextModeHint={showTextModeHint}
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
                      derivedGenerations={derivedGenerations}
                      paginatedDerived={paginatedDerived}
                      derivedPage={derivedPage}
                      derivedTotalPages={derivedTotalPages}
                      setDerivedPage={setDerivedPage}
                      variants={variants}
                      activeVariantId={activeVariant?.id || null}
                      onVariantSelect={setActiveVariantId}
                      onMakePrimary={setPrimaryVariant}
                      isLoadingVariants={isLoadingVariants}
                      onClose={onClose}
                      variant="desktop"
                    />
                  ) : (
                    <div className="w-full">
                      {/* Top bar with Based On (left) and Info/Edit Toggle + Close (right) - Sticky */}
                      <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 z-[80] bg-background">
                        {/* Based On display - Show source image OR primary variant */}
                        {(() => {
                          console.log('[ReplaceInShot] MediaLightbox passing props', {
                            hasSourceGeneration: !!sourceGenerationData,
                            isViewingNonPrimaryVariant,
                            hasPrimaryVariant: !!primaryVariant,
                            selectedShotId: selectedShotId?.substring(0, 8),
                            currentMediaId: media.id.substring(0, 8),
                          });
                          return null;
                        })()}
                        {sourceGenerationData && onOpenExternalGeneration ? (
                          <SourceGenerationDisplay
                            sourceGeneration={sourceGenerationData}
                            onNavigate={onOpenExternalGeneration}
                            variant="compact"
                            currentShotId={selectedShotId || shotId}
                            allShots={allShots}
                            currentMediaId={media.id}
                            isCurrentMediaPositioned={isAlreadyPositionedInSelectedShot}
                            onReplaceInShot={handleReplaceInShot}
                            sourcePrimaryVariant={sourcePrimaryVariant}
                            onMakeMainVariant={handleMakeMainVariant}
                            canMakeMainVariant={canMakeMainVariant}
                          />
                        ) : (
                          <div></div>
                        )}
                        
                        {/* Info | Edit | Trim Toggle and Close Button */}
                        <div className="flex items-center gap-3">
                          {showImageEditTools && !readOnly && !isVideo && (
                            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                              <button
                                className="px-3 py-1.5 text-sm rounded transition-colors bg-background text-foreground shadow-sm"
                                disabled
                              >
                                Info
                              </button>
                              <button
                                onClick={() => {
                                  setIsInpaintMode(true);
                                  setEditMode('inpaint');
                                }}
                                className="px-3 py-1.5 text-sm rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-background/50"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                          {/* Video Trim toggle (only for segment videos with trim editor enabled) */}
                          {showVideoTrimEditor && isVideo && !readOnly && (
                            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                              <button
                                className="px-3 py-1.5 text-sm rounded transition-colors bg-background text-foreground shadow-sm"
                                disabled
                              >
                                Info
                              </button>
                              <button
                                onClick={handleEnterVideoTrimMode}
                                className="px-3 py-1.5 text-sm rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-background/50"
                              >
                                Trim
                              </button>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="h-8 w-8 p-0 hover:bg-muted"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                    <TaskDetailsPanelWrapper
                      taskDetailsData={adjustedTaskDetailsData}
                      generationName={generationName}
                      onGenerationNameChange={handleGenerationNameChange}
                      isEditingGenerationName={isEditingGenerationName}
                      onEditingGenerationNameChange={setIsEditingGenerationName}
                      derivedItems={derivedItems}
                      derivedGenerations={derivedGenerations}
                      paginatedDerived={paginatedDerived}
                      derivedPage={derivedPage}
                      derivedTotalPages={derivedTotalPages}
                      onSetDerivedPage={setDerivedPage}
                      onNavigateToGeneration={onOpenExternalGeneration}
                      onVariantSelect={setActiveVariantId}
                      currentMediaId={media.id}
                      currentShotId={selectedShotId || shotId}
                      replaceImages={replaceImages}
                      onReplaceImagesChange={setReplaceImages}
                      onClose={onClose}
                      variant="desktop"
                      activeVariant={activeVariant}
                      primaryVariant={primaryVariant}
                      onSwitchToPrimary={primaryVariant ? () => setActiveVariantId(primaryVariant.id) : undefined}
                    />
                    
                    {/* Variants section - below task details */}
                    {variants && variants.length > 1 && (
                      <div className="px-4 pb-2 -mt-2">
                        <VariantSelector
                          variants={variants}
                          activeVariantId={activeVariant?.id || null}
                          onVariantSelect={setActiveVariantId}
                          onMakePrimary={setPrimaryVariant}
                          isLoading={isLoadingVariants}
                        />
                      </div>
                    )}
                    </div>
                  )}
                </div>
              </div>
            ) : (showTaskDetails || isSpecialEditMode) && isMobile ? (
              // Mobile layout with task details or special edit modes - stacked
              <div className="w-full h-full flex flex-col bg-black/90">
                {/* Media section - Top (50% height) */}
                <div 
                  className="flex-1 flex items-center justify-center relative"
                  style={{ height: '50%' }}
                  onClick={(e) => {
                    // Single clicks don't close - only double-clicks
                    e.stopPropagation();
                  }}
                  onDoubleClick={(e) => {
                    // Close if double-clicking on the black space (not on the media or controls)
                    if (e.target === e.currentTarget) {
                      onClose();
                    }
                  }}
                >
                  {/* Media Content - same as above but adapted for mobile */}
                    {isVideo ? (
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
                          if (Number.isFinite(video.duration) && video.duration > 0 && showVideoTrimEditor) {
                            setVideoDuration(video.duration);
                          }
                        }}
                      />
                    ) : (
                    <MediaDisplayWithCanvas
                      effectiveImageUrl={effectiveMediaUrl}
                      thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                      isVideo={false}
                      isFlippedHorizontally={isFlippedHorizontally}
                      isSaving={isSaving}
                      isInpaintMode={isInpaintMode}
                      editMode={editMode}
                      imageContainerRef={imageContainerRef}
                      canvasRef={canvasRef}
                      displayCanvasRef={displayCanvasRef}
                      maskCanvasRef={maskCanvasRef}
                      onImageLoad={setImageDimensions}
                      handlePointerDown={handlePointerDown}
                      handlePointerMove={handlePointerMove}
                      handlePointerUp={handlePointerUp}
                      variant="mobile-stacked"
                      containerClassName="w-full h-full"
                      debugContext="Mobile Stacked"
                    />
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
                        annotationMode={annotationMode}
                        onSetAnnotationMode={setAnnotationMode}
                        brushStrokes={brushStrokes}
                        onUndo={handleUndo}
                        onClearMask={handleClearMask}
                        panelPosition={inpaintPanelPosition}
                        onSetPanelPosition={setInpaintPanelPosition}
                      />
                    )}

                    {/* Mobile Stacked Layout - All button groups (matching desktop) */}
                    {/* Top Left Controls - Flip & Save */}
                    <TopLeftControls
                      isVideo={isVideo}
                      readOnly={readOnly}
                      isSpecialEditMode={isSpecialEditMode}
                      selectedProjectId={selectedProjectId}
                      isCloudMode={isCloudMode}
                      showImageEditTools={showImageEditTools}
                      hasChanges={hasChanges}
                      isSaving={isSaving}
                      handleFlip={handleFlip}
                      handleSave={handleSave}
                      effectiveImageUrl={effectiveMediaUrl}
                    />

                    {/* Top Right Controls - Download, Delete & Close */}
                    <TopRightControls
                      isVideo={isVideo}
                      readOnly={readOnly}
                      isSpecialEditMode={isSpecialEditMode}
                      selectedProjectId={selectedProjectId}
                      isCloudMode={isCloudMode}
                      showDownload={showDownload}
                      handleDownload={handleDownload}
                      onDelete={onDelete}
                      handleDelete={handleDelete}
                      isDeleting={isDeleting}
                      mediaId={media.id}
                      onClose={onClose}
                    />

                    {/* Bottom Left Controls - Edit & Upscale */}
                    <BottomLeftControls
                      isVideo={isVideo}
                      readOnly={readOnly}
                      isSpecialEditMode={isSpecialEditMode}
                      selectedProjectId={selectedProjectId}
                      isCloudMode={isCloudMode}
                      handleEnterMagicEditMode={handleEnterMagicEditMode}
                      isUpscaling={isUpscaling}
                      isPendingUpscale={isPendingUpscale}
                      hasUpscaledVersion={hasUpscaledVersion}
                      showingUpscaled={showingUpscaled}
                      handleUpscale={handleUpscale}
                      handleToggleUpscaled={handleToggleUpscaled}
                    />

                    {/* Bottom Right Controls - Star & Add to References */}
                    <BottomRightControls
                      isVideo={isVideo}
                      readOnly={readOnly}
                      isSpecialEditMode={isSpecialEditMode}
                      selectedProjectId={selectedProjectId}
                      isCloudMode={isCloudMode}
                      localStarred={localStarred}
                      handleToggleStar={handleToggleStar}
                      toggleStarPending={toggleStarMutation.isPending}
                      isAddingToReferences={isAddingToReferences}
                      addToReferencesSuccess={addToReferencesSuccess}
                      handleAddToReferences={handleAddToReferences}
                    />

                    {/* Bottom Workflow Controls (hidden in special edit modes) */}
                    <WorkflowControlsBar
                      onAddToShot={onAddToShot}
                      onDelete={onDelete}
                      onApplySettings={onApplySettings}
                      isSpecialEditMode={isSpecialEditMode}
                      isVideo={isVideo}
                      allShots={allShots}
                      selectedShotId={selectedShotId}
                      onShotChange={onShotChange}
                      onCreateShot={onCreateShot}
                                isCreatingShot={isCreatingShot}
                                quickCreateSuccess={quickCreateSuccess}
                      handleQuickCreateAndAdd={handleQuickCreateAndAdd}
                      handleQuickCreateSuccess={handleQuickCreateSuccess}
                      isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
                      isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
                      showTickForImageId={showTickForImageId}
                      showTickForSecondaryImageId={showTickForSecondaryImageId}
                      mediaId={media.id}
                      onAddToShotWithoutPosition={onAddToShotWithoutPosition}
                      handleAddToShot={handleAddToShot}
                      handleAddToShotWithoutPosition={handleAddToShotWithoutPosition}
                      setIsSelectOpen={setIsSelectOpen}
                      contentRef={contentRef}
                      handleApplySettings={handleApplySettings}
                      onNavigateToShot={handleNavigateToShotFromSelector}
                    />

                    {/* Navigation Arrows */}
                    <NavigationArrows
                      showNavigation={showNavigation}
                      readOnly={readOnly}
                      onPrevious={onPrevious}
                      onNext={onNext}
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
                  {isSpecialEditMode ? (
                    <EditModePanel
                      sourceGenerationData={sourceGenerationData}
                      onOpenExternalGeneration={onOpenExternalGeneration}
                      currentShotId={selectedShotId || shotId}
                      allShots={allShots}
                      currentMediaId={media.id}
                      isCurrentMediaPositioned={isAlreadyPositionedInSelectedShot}
                      onReplaceInShot={handleReplaceInShot}
                      sourcePrimaryVariant={sourcePrimaryVariant}
                      onMakeMainVariant={handleMakeMainVariant}
                      canMakeMainVariant={canMakeMainVariant}
                      editMode={editMode}
                      setEditMode={setEditMode}
                      setIsInpaintMode={setIsInpaintMode}
                      showTextModeHint={showTextModeHint}
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
                      derivedGenerations={derivedGenerations}
                      paginatedDerived={paginatedDerived}
                      derivedPage={derivedPage}
                      derivedTotalPages={derivedTotalPages}
                      setDerivedPage={setDerivedPage}
                      variants={variants}
                      activeVariantId={activeVariant?.id || null}
                      onVariantSelect={setActiveVariantId}
                      onMakePrimary={setPrimaryVariant}
                      isLoadingVariants={isLoadingVariants}
                      onClose={onClose}
                      variant="mobile"
                    />
                  ) : (
                    <div className="w-full">
                      {/* Top bar with Based On (left) and Info/Edit Toggle + Close (right) - Sticky */}
                      <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 z-[80] bg-background">
                        {/* Based On display - Show source image OR primary variant */}
                        {sourceGenerationData && onOpenExternalGeneration ? (
                          <SourceGenerationDisplay
                            sourceGeneration={sourceGenerationData}
                            onNavigate={onOpenExternalGeneration}
                            variant="compact"
                            currentShotId={selectedShotId || shotId}
                            allShots={allShots}
                            currentMediaId={media.id}
                            isCurrentMediaPositioned={isAlreadyPositionedInSelectedShot}
                            onReplaceInShot={handleReplaceInShot}
                            sourcePrimaryVariant={sourcePrimaryVariant}
                            onMakeMainVariant={handleMakeMainVariant}
                            canMakeMainVariant={canMakeMainVariant}
                          />
                        ) : (
                          <div></div>
                        )}
                        
                        {/* Info | Edit Toggle and Close Button */}
                        <div className="flex items-center gap-3">
                          {showImageEditTools && !readOnly && !isVideo && (
                            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                              <button
                                className="px-3 py-1.5 text-sm rounded transition-colors bg-background text-foreground shadow-sm"
                                disabled
                              >
                                Info
                              </button>
                              <button
                                onClick={() => {
                                  setIsInpaintMode(true);
                                  setEditMode('inpaint');
                                }}
                                className="px-3 py-1.5 text-sm rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-background/50"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="h-8 w-8 p-0 hover:bg-muted"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    
                    {/* Variant Selector (for images/videos with multiple variants) - Mobile */}
                    <TaskDetailsPanelWrapper
                      taskDetailsData={adjustedTaskDetailsData}
                      generationName={generationName}
                      onGenerationNameChange={handleGenerationNameChange}
                      isEditingGenerationName={isEditingGenerationName}
                      onEditingGenerationNameChange={setIsEditingGenerationName}
                      derivedItems={derivedItems}
                      derivedGenerations={derivedGenerations}
                      paginatedDerived={paginatedDerived}
                      derivedPage={derivedPage}
                      derivedTotalPages={derivedTotalPages}
                      onSetDerivedPage={setDerivedPage}
                      onNavigateToGeneration={onOpenExternalGeneration}
                      onVariantSelect={setActiveVariantId}
                      currentMediaId={media.id}
                      currentShotId={selectedShotId || shotId}
                      replaceImages={replaceImages}
                      onReplaceImagesChange={setReplaceImages}
                      onClose={onClose}
                      variant="mobile"
                      activeVariant={activeVariant}
                      primaryVariant={primaryVariant}
                      onSwitchToPrimary={primaryVariant ? () => setActiveVariantId(primaryVariant.id) : undefined}
                    />
                    
                    {/* Variants section - below task details */}
                    {variants && variants.length > 1 && (
                      <div className="px-3 pb-2 -mt-2">
                        <VariantSelector
                          variants={variants}
                          activeVariantId={activeVariant?.id || null}
                          onVariantSelect={setActiveVariantId}
                          onMakePrimary={setPrimaryVariant}
                          isLoading={isLoadingVariants}
                        />
                      </div>
                    )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Mobile/Tablet layout using new FlexContainer + MediaWrapper
              <FlexContainer
                onClick={(e) => {
                  // Single clicks don't close - only double-clicks
                  if (isInpaintMode) {
                    e.stopPropagation();
                    return;
                  }
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => {
                  // Only allow background double-clicks to close when not in edit modes
                  // and only if the click is on the container itself (not children)
                  if (isInpaintMode) {
                    e.stopPropagation();
                    return;
                  }
                  if (e.target === e.currentTarget) {
                    onClose();
                  }
                }}
              >
                {/* Close Button - REMOVED */}

                {/* Media Container with Controls */}
                <MediaWrapper 
                  onClick={(e) => e.stopPropagation()}
                  className={cn(isMobile && isInpaintMode && "pointer-events-auto")}
                >
                  {/* Based On display removed from overlay - now shows in sidebar above task details */}
                  
                  {/* Media Display - The wrapper now handles centering */}
                {isVideo ? (
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
                      if (Number.isFinite(video.duration) && video.duration > 0 && showVideoTrimEditor) {
                        setVideoDuration(video.duration);
                      }
                    }}
                  />
                ) : (
                  <MediaDisplayWithCanvas
                    effectiveImageUrl={effectiveMediaUrl}
                    thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
                    isVideo={false}
                    isFlippedHorizontally={isFlippedHorizontally}
                    isSaving={isSaving}
                    isInpaintMode={isInpaintMode}
                    editMode={editMode}
                    imageContainerRef={imageContainerRef}
                    canvasRef={canvasRef}
                    displayCanvasRef={displayCanvasRef}
                    maskCanvasRef={maskCanvasRef}
                    onImageLoad={setImageDimensions}
                    handlePointerDown={handlePointerDown}
                    handlePointerMove={handlePointerMove}
                    handlePointerUp={handlePointerUp}
                    variant="regular-centered"
                    containerClassName="w-full h-full"
                    debugContext="Regular Centered"
                  />
                )}

                  {/* Bottom Left Controls - Mode Entry Buttons */}
                  {!readOnly && (
                    <div className="absolute bottom-4 left-4 z-[70]">
                      <div className="flex items-center space-x-2">
                        {!isSpecialEditMode && (
                        <>
                          {/* Unified Edit Button */}
                          {!isVideo && selectedProjectId && isCloudMode && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleEnterMagicEditMode}
                              className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                              title="Edit image"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                      </div>
                      
                      {/* Compact Edit Controls - Above the bottom buttons */}
                      {isSpecialEditMode && editMode !== 'text' && (
                        <div className="mb-2 bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 w-40 border border-border shadow-xl">
                          {/* Brush Size Slider - Only in Inpaint mode */}
                          {editMode === 'inpaint' && (
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-foreground">Size</label>
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
                  {/* Top Left Controls - Flip & Save */}
                  <TopLeftControls
                    isVideo={isVideo}
                    readOnly={readOnly}
                    isSpecialEditMode={isSpecialEditMode}
                    selectedProjectId={selectedProjectId}
                    isCloudMode={isCloudMode}
                    showImageEditTools={showImageEditTools}
                    hasChanges={hasChanges}
                    isSaving={isSaving}
                    handleFlip={handleFlip}
                    handleSave={handleSave}
                    effectiveImageUrl={effectiveMediaUrl}
                  />

                  {/* Top Right Controls - Download, Delete & Close */}
                  <TopRightControls
                    isVideo={isVideo}
                    readOnly={readOnly}
                    isSpecialEditMode={isSpecialEditMode}
                    selectedProjectId={selectedProjectId}
                    isCloudMode={isCloudMode}
                    showDownload={showDownload}
                    handleDownload={handleDownload}
                    onDelete={onDelete}
                    handleDelete={handleDelete}
                    isDeleting={isDeleting}
                    mediaId={media.id}
                    onClose={onClose}
                  />

                    {/* Bottom Left Controls - Edit & Upscale */}
                  <BottomLeftControls
                    isVideo={isVideo}
                    readOnly={readOnly}
                    isSpecialEditMode={isSpecialEditMode}
                    selectedProjectId={selectedProjectId}
                    isCloudMode={isCloudMode}
                    handleEnterMagicEditMode={handleEnterMagicEditMode}
                    isUpscaling={isUpscaling}
                    isPendingUpscale={isPendingUpscale}
                    hasUpscaledVersion={hasUpscaledVersion}
                    showingUpscaled={showingUpscaled}
                    handleUpscale={handleUpscale}
                    handleToggleUpscaled={handleToggleUpscaled}
                  />

                  {/* Bottom Right Controls - Star & Add to References */}
                  <BottomRightControls
                    isVideo={isVideo}
                    readOnly={readOnly}
                    isSpecialEditMode={isSpecialEditMode}
                    selectedProjectId={selectedProjectId}
                    isCloudMode={isCloudMode}
                    localStarred={localStarred}
                    handleToggleStar={handleToggleStar}
                    toggleStarPending={toggleStarMutation.isPending}
                    isAddingToReferences={isAddingToReferences}
                    addToReferencesSuccess={addToReferencesSuccess}
                    handleAddToReferences={handleAddToReferences}
                  />

                  {/* Bottom Workflow Controls (hidden in special edit modes) */}
                  <WorkflowControlsBar
                    onAddToShot={onAddToShot}
                    onDelete={onDelete}
                    onApplySettings={onApplySettings}
                    isSpecialEditMode={isSpecialEditMode}
                    isVideo={isVideo}
                    allShots={allShots}
                    selectedShotId={selectedShotId}
                    onShotChange={onShotChange}
                    onCreateShot={onCreateShot}
                              isCreatingShot={isCreatingShot}
                              quickCreateSuccess={quickCreateSuccess}
                    handleQuickCreateAndAdd={handleQuickCreateAndAdd}
                    handleQuickCreateSuccess={handleQuickCreateSuccess}
                    isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
                    isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
                    showTickForImageId={showTickForImageId}
                    showTickForSecondaryImageId={showTickForSecondaryImageId}
                    mediaId={media.id}
                    onAddToShotWithoutPosition={onAddToShotWithoutPosition}
                    handleAddToShot={handleAddToShot}
                    handleAddToShotWithoutPosition={handleAddToShotWithoutPosition}
                    setIsSelectOpen={setIsSelectOpen}
                    contentRef={contentRef}
                    handleApplySettings={handleApplySettings}
                    onNavigateToShot={handleNavigateToShotFromSelector}
                  />

                  {/* Navigation Arrows */}
                  <NavigationArrows
                    showNavigation={showNavigation}
                    readOnly={readOnly}
                    onPrevious={onPrevious}
                    onNext={onNext}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    variant="mobile"
                  />
                </MediaWrapper>

                {/* Workflow Controls - Below Media (hidden in special edit modes) */}
                {!readOnly && !isSpecialEditMode && (
                  <div className="w-full" onClick={(e) => e.stopPropagation()}>
                    <WorkflowControls
                      mediaId={media.id}
                      isVideo={isVideo}
                      isInpaintMode={isInpaintMode}
                      allShots={allShots}
                      selectedShotId={selectedShotId}
                      onShotChange={onShotChange}
                      onCreateShot={onCreateShot}
                      isSelectOpen={isSelectOpen}
                      setIsSelectOpen={setIsSelectOpen}
                      contentRef={contentRef}
                      isAlreadyPositionedInSelectedShot={isAlreadyPositionedInSelectedShot}
                      isAlreadyAssociatedWithoutPosition={isAlreadyAssociatedWithoutPosition}
                      showTickForImageId={showTickForImageId}
                      showTickForSecondaryImageId={showTickForSecondaryImageId}
                      isCreatingShot={isCreatingShot}
                      quickCreateSuccess={quickCreateSuccess}
                      handleQuickCreateAndAdd={handleQuickCreateAndAdd}
                      handleQuickCreateSuccess={handleQuickCreateSuccess}
                      onAddToShot={onAddToShot}
                      onAddToShotWithoutPosition={onAddToShotWithoutPosition}
                      handleAddToShot={handleAddToShot}
                      handleAddToShotWithoutPosition={handleAddToShotWithoutPosition}
                      onApplySettings={onApplySettings}
                      handleApplySettings={handleApplySettings}
                      onDelete={onDelete}
                      handleDelete={handleDelete}
                      isDeleting={isDeleting}
                      onNavigateToShot={handleNavigateToShotFromSelector}
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