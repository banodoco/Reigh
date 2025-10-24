import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GenerationRow, Shot } from '@/types/shots';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  FlipHorizontal, 
  Save, 
  Download, 
  Trash2, 
  Settings, 
  PlusCircle, 
  CheckCircle, 
  Star, 
  ImagePlus, 
  Loader2, 
  ArrowUpCircle, 
  Eye, 
  EyeOff, 
  Paintbrush, 
  Eraser, 
  Undo2,
  Sparkles,
  Pencil,
  ArrowDown,
  ArrowUp,
  Maximize2,
  Circle,
  ArrowRight,
  Move,
  Edit3,
  Type
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import ShotSelector from '@/shared/components/ShotSelector';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import TaskDetailsPanel from '@/tools/travel-between-images/components/TaskDetailsPanel';
import { createBatchMagicEditTasks } from '@/shared/lib/tasks/magicEdit';
import { useShotGenerationMetadata } from '@/shared/hooks/useShotGenerationMetadata';
import { supabase } from '@/integrations/supabase/client';

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
  useInSceneBoost,
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
  TopLeftControls,
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
} from './components';
import { FlexContainer, MediaWrapper } from './components/layouts';

// Import utils
import { downloadMedia } from './utils';

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
}) => {
  // ========================================
  // REFACTORED: All logic extracted to hooks
  // ========================================
  
  // DEBUG: Log raw media object on mount/update
  const mediaKeys = Object.keys(media);
  console.log('[BasedOnLineage] 🎬 MediaLightbox received media:', 
    '\n  mediaId:', media.id.substring(0, 8),
    '\n  fullMediaId:', media.id,
    '\n  hasBasedOn:', !!(media as any).based_on,
    '\n  basedOnValue:', (media as any).based_on?.substring(0, 8) || null,
    '\n  fullBasedOnValue:', (media as any).based_on,
    '\n  mediaType:', media.type,
    '\n  mediaKeysCount:', mediaKeys.length,
    '\n  mediaKeys:', mediaKeys.join(', '),
    '\n  hasBasedOnInKeys:', mediaKeys.includes('based_on')
  );
  
  // DEBUG: Log props for shot selector visibility
  console.log('[ShotSelectorDebug] 📍 MediaLightbox props for shot controls:', 
    '\n  onAddToShot:', !!onAddToShot,
    '\n  onDelete:', !!onDelete,
    '\n  onApplySettings:', !!onApplySettings,
    '\n  allShots:', allShots,
    '\n  allShots.length:', allShots?.length || 0,
    '\n  selectedShotId:', selectedShotId,
    '\n  onShotChange:', !!onShotChange,
    '\n  onCreateShot:', !!onCreateShot,
    '\n  onNavigateToShot:', !!onNavigateToShot,
    '\n  mediaType:', media.type,
    '\n  readOnly:', readOnly
  );

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

  // Basic hooks
  const isMobile = useIsMobile();
  const { selectedProjectId } = useProject();
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudMode = generationMethods.inCloud;

  // Safety check
  if (!media) {
    return null;
  }

  // ========================================
  // TOP-LEVEL DIAGNOSTIC LOGS
  // ========================================
  console.log('[StarPersist] 🎬 MediaLightbox opened with media:', {
      mediaId: media.id,
    mediaType: media.type,
    location: media.location,
    starredProp: starred,
    hasStarredProp: typeof starred === 'boolean',
    // Check all possible star-related fields
    mediaStarred: (media as any).starred,
    hasMediaStarred: 'starred' in media,
    mediaStarredType: typeof (media as any).starred,
    // Check shot-related IDs
    shotImageEntryId: (media as any).shotImageEntryId,
    shot_generation_id: (media as any).shot_generation_id,
    hasShotImageEntryId: 'shotImageEntryId' in media,
    hasShot_generation_id: 'shot_generation_id' in media,
    // Show all keys on media object
    allMediaKeys: Object.keys(media),
    // Show full media object
    fullMediaObject: JSON.parse(JSON.stringify(media)),
    // Context
    selectedShotId,
    readOnly,
    timestamp: Date.now(),
  });

  // Derived values
  const isVideo = media.type === 'video' || media.type === 'video_travel_output' || media.location?.endsWith('.mp4');
  
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

  // In-Scene Boost hook
  const { isInSceneBoostEnabled, setIsInSceneBoostEnabled, inpaintLoras } = useInSceneBoost();

  // Inpainting hook
  console.log('[InpaintDebug] 🔍 Passing to useInpainting hook:', {
    shotId: shotId?.substring(0, 8),
    toolTypeOverride,
    selectedProjectId: selectedProjectId?.substring(0, 8),
    mediaId: media.id.substring(0, 8),
    hasLoras: !!inpaintLoras,
    lorasCount: inpaintLoras?.length || 0
  });
  
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
      console.log('[InpaintPaint] 🚪 Exiting inpaint mode from component');
      // The hook will handle the state reset
      // We just need to provide this callback for when the hook needs to exit
    },
    loras: inpaintLoras,
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
    shapeEditMode,
    setIsInpaintMode,
    setIsEraseMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,
    setShapeEditMode,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClearMask,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    getDeleteButtonPosition,
  } = inpaintingHook;
  
  // Handle exiting inpaint mode from UI buttons
  const handleExitInpaintMode = () => {
    console.log('[InpaintPaint] 🚪 Exit button clicked');
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
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
    sourceUrlForTasks,
    imageDimensions,
    toolTypeOverride
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
  const { sourceGenerationData } = useSourceGeneration({
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
    derivedGenerations,
    derivedPage,
    derivedTotalPages,
    paginatedDerived,
    setDerivedPage,
  } = lineageHook;

  // Shot creation hook
  const shotCreationHook = useShotCreation({ 
    media, 
    selectedProjectId, 
    allShots,
    onNavigateToShot,
    onClose,
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

  // Log star toggle state initialization
  console.log('[StarPersist] ⭐ Star toggle hook initialized:', {
      mediaId: media.id,
    initialLocalStarred: localStarred,
    starredProp: starred,
    mediaStarred: (media as any).starred,
    shotImageEntryId: (media as any).shotImageEntryId,
    shot_generation_id: (media as any).shot_generation_id,
    note: 'This is the state that will be displayed in the UI',
    timestamp: Date.now(),
  });

  // WRAPPED STAR TOGGLE - Add top-level logging
  const wrappedHandleToggleStar = () => {
    console.log('[StarPersist] 🎯 TOP-LEVEL: Star button CLICKED in MediaLightbox', {
          mediaId: media.id,
      currentLocalStarred: localStarred,
      willToggleTo: !localStarred,
      starredProp: starred,
      mediaStarred: (media as any).starred,
      shotImageEntryId: (media as any).shotImageEntryId,
      shot_generation_id: (media as any).shot_generation_id,
      selectedShotId,
      // Show what ID will be used for mutation
      willMutateWithId: media.id,
      mutationIsPending: toggleStarMutation.isPending,
      // Context
      callStack: new Error().stack?.split('\n').slice(1, 4).join(' | '),
      timestamp: Date.now(),
    });
    
    // Call the actual handler
    handleToggleStar();
    
    console.log('[StarPersist] 🎯 TOP-LEVEL: Called handleToggleStar(), optimistic update should be active', {
        mediaId: media.id,
      expectedNewLocalStarred: !localStarred,
      timestamp: Date.now(),
    });
  };

  // Shot positioning hook
  const shotPositioningHook = useShotPositioning({
    media,
      selectedShotId,
    allShots,
    positionedInSelectedShot,
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
  // SIMPLE HANDLERS - Just call props
  // ========================================

  const handleDownload = async () => {
    await downloadMedia(effectiveImageUrl, media.id, isVideo);
  };

  const handleDelete = () => {
    if (onDelete) {
      console.log('[MediaLightbox] Delete button clicked', {
        mediaId: media.id,
        hasNext: onNext && hasNext,
        hasPrevious: onPrevious && hasPrevious
      });
      
      // Delete the item - the parent will handle navigation automatically
      // When the array shrinks, the current index will:
      // - Show the next item if we're in the middle (natural array shift)
      // - Show the previous item if we were at the end
      // - Close the lightbox if this was the last item
      onDelete(media.id);
      
      // IMPORTANT: Don't call onNext/onPrevious here!
      // The parent component's state will update and handle the transition naturally.
      // If we call navigation functions here, we'll skip an item because:
      // 1. Delete shrinks array and index already points to next item
      // 2. Then calling onNext() advances index again, skipping an item
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

  return (
    <TooltipProvider delayDuration={500}>
      <DialogPrimitive.Root 
        open={true} 
        onOpenChange={() => {
          // Prevent automatic closing - we handle all closing manually
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay 
            className={cn(
              "fixed inset-0 z-[100000] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              // Disable animations on mobile to prevent blink during zoom/fade
              isMobile ? "" : "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "p-0 border-none shadow-none",
              // Layout: Full screen for special modes on tablet+, otherwise centered
              shouldShowSidePanel
                ? "left-0 top-0 w-full h-full" // Full screen layout for side panel modes
                : isMobile 
                  ? "inset-0 w-full h-full" // Full screen on mobile
                  : "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-auto h-auto data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
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
              
              // Only close if BOTH the click started AND ended on the overlay
              // This prevents accidental closure when dragging from inside the modal
              const clickStartedOnOverlay = pointerDownTargetRef.current === e.currentTarget;
              const clickEndedOnOverlay = e.target === e.currentTarget;
              
              if (clickStartedOnOverlay && clickEndedOnOverlay) {
                onClose();
              }
              
              // Reset the tracking
              pointerDownTargetRef.current = null;
            }}
            onTouchStart={(e) => {
              // Allow touch events on canvas when in inpaint mode
              const target = e.target as HTMLElement;
              if (isInpaintMode && target.tagName === 'CANVAS') {
                console.log('[InpaintPaint] 🎨 Allowing touch on canvas');
                return; // Don't stop propagation for canvas
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
            style={{ 
              // Ensure the overlay captures all pointer events
              pointerEvents: 'all',
              touchAction: 'none',
              // Make sure overlay is above everything else
              zIndex: 10000,
              // Ensure full coverage
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
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
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onTouchStart={(e) => {
              // Allow touch events on canvas when in inpaint mode
              const target = e.target as HTMLElement;
              if (isInpaintMode && target.tagName === 'CANVAS') {
                console.log('[InpaintPaint] 🎨 Allowing touch on canvas');
                return; // Don't stop propagation for canvas
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
              // Block touch end events from bubbling through dialog content
              if (isMobile) e.stopPropagation();
            }}
            className={cn(
              "fixed z-[100000]",
              // Disable animations on mobile to prevent blink during zoom/fade
              isMobile ? "" : "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "p-0 border-none bg-transparent shadow-none",
              // Layout: Full screen for special modes on tablet+, otherwise centered
              shouldShowSidePanel
                ? "left-0 top-0 w-full h-full" // Full screen layout for side panel modes
                : isMobile 
                  ? "inset-0 w-full h-full" // Mobile: full screen
                  : "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-auto h-auto data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
            )}
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
            
            {shouldShowSidePanel ? (
              // Tablet/Desktop layout with side panel (task details, inpaint, or magic edit)
              <div 
                className="w-full h-full flex bg-black/90"
                onClick={(e) => {
                  // Swallow event, and close if clicking on the background (not on content)
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
                    // Swallow event, and close if clicking on the media section background (not on content)
                    e.stopPropagation();
                    if (e.target === e.currentTarget) {
                      onClose();
                    }
                  }}
                >
                  {/* Navigation Controls - Left Arrow */}
                  {showNavigation && !readOnly && onPrevious && hasPrevious && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onPrevious}
                      className="bg-black/50 hover:bg-black/70 text-white z-[80] h-10 w-10 sm:h-12 sm:w-12 absolute left-4 top-1/2 -translate-y-1/2"
                    >
                      <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
                    </Button>
                  )}

                  {/* Media Content */}
                  <MediaDisplayWithCanvas
                    effectiveImageUrl={effectiveImageUrl}
                    thumbUrl={media.thumbUrl}
                    isVideo={isVideo}
                    isFlippedHorizontally={isFlippedHorizontally}
                    isSaving={isSaving}
                    isInpaintMode={isInpaintMode}
                    imageContainerRef={imageContainerRef}
                    canvasRef={canvasRef}
                    displayCanvasRef={displayCanvasRef}
                    maskCanvasRef={maskCanvasRef}
                    onImageLoad={setImageDimensions}
                    handlePointerDown={handlePointerDown}
                    handlePointerMove={handlePointerMove}
                    handlePointerUp={handlePointerUp}
                    variant="desktop-side-panel"
                    containerClassName="max-w-full max-h-full"
                    debugContext="Desktop"
                  />

                    {/* Edit Controls for Selected Annotation */}
                    {selectedShapeId && isAnnotateMode && (() => {
                      const buttonPos = getDeleteButtonPosition();
                      if (!buttonPos) return null;
                      
                      return (
                        <div className="fixed z-[100] flex gap-2" style={{
                          left: `${buttonPos.x}px`,
                          top: `${buttonPos.y}px`,
                          transform: 'translate(-50%, -50%)'
                        }}>
                          {/* Toggle: Adjust / Move Mode */}
                          <div className="flex bg-gray-800 rounded-lg p-1 shadow-lg">
                            <button
                              onClick={() => setShapeEditMode('adjust')}
                              className={cn(
                                "p-2 rounded-md transition-colors",
                                shapeEditMode === 'adjust'
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-300 hover:text-white"
                              )}
                              title="Adjust mode (drag to resize)"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setShapeEditMode('move')}
                              className={cn(
                                "p-2 rounded-md transition-colors",
                                shapeEditMode === 'move'
                                  ? "bg-blue-600 text-white"
                                  : "text-gray-300 hover:text-white"
                              )}
                              title="Move mode (drag to reposition)"
                            >
                              <Move className="h-4 w-4" />
                            </button>
                          </div>
                          
                          {/* Delete Button */}
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
                      effectiveImageUrl={effectiveImageUrl}
                    />

                    {/* Floating Inpaint Controls - Separate from other buttons */}
                    {isSpecialEditMode && shouldShowSidePanel && editMode !== 'text' && (
                      <div className={cn(
                        "absolute left-4 z-[70]",
                        inpaintPanelPosition === 'top' ? 'top-4' : 'bottom-4'
                      )}>
                      {/* Compact Edit Controls - Always shown in special edit mode */}
                        <div className={cn(
                          "relative",
                          inpaintPanelPosition === 'top' ? 'mt-2' : 'mb-2'
                        )}>
                          {/* Position Toggle Button - at top when panel is at bottom */}
                          {inpaintPanelPosition === 'bottom' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setInpaintPanelPosition('top')}
                                  className="mx-auto w-fit px-2 py-1 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-t-md flex items-center justify-center transition-colors border border-border border-b-0 shadow-lg"
                                >
                                  <ArrowUp className="h-3 w-3 mt-0.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="z-[100001]">Move controls to top</TooltipContent>
                            </Tooltip>
                          )}
                          
                          <div className="bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 w-40 border border-border shadow-xl">
                            {/* Brush Size Slider */}
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
                              <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                                <button
                                  onClick={() => setIsEraseMode(false)}
                                  className={cn(
                                    "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-all",
                                    !isEraseMode 
                                      ? "bg-primary text-primary-foreground shadow-sm" 
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <Paintbrush className="h-3 w-3" />
                                  Paint
                                </button>
                                <button
                                  onClick={() => setIsEraseMode(true)}
                                  className={cn(
                                    "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-all",
                                    isEraseMode 
                                      ? "bg-purple-600 text-white shadow-sm" 
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <Eraser className="h-3 w-3" />
                                  Erase
                                </button>
                              </div>
                            )}
                            
                            {editMode === 'annotate' && (
                              <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                                <button
                                  onClick={() => setAnnotationMode('circle')}
                                  className={cn(
                                    "flex-1 flex items-center justify-center px-2 py-1 rounded text-xs transition-all",
                                    annotationMode === 'circle' 
                                      ? "bg-primary text-primary-foreground shadow-sm" 
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <Circle className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => setAnnotationMode('arrow')}
                                  className={cn(
                                    "flex-1 flex items-center justify-center px-2 py-1 rounded text-xs transition-all",
                                    annotationMode === 'arrow' 
                                      ? "bg-primary text-primary-foreground shadow-sm" 
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <ArrowRight className="h-3 w-3" />
                                </button>
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
                          
                          {/* Position Toggle Button - at bottom when panel is at top */}
                          {inpaintPanelPosition === 'top' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setInpaintPanelPosition('bottom')}
                                  className="mx-auto w-fit px-2 py-1 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-b-md flex items-center justify-center transition-colors border border-border border-t-0 shadow-lg relative z-10"
                                >
                                  <ArrowDown className="h-3 w-3 -mt-0.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="z-[100001]">Move controls to bottom</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
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
                      handleToggleStar={wrappedHandleToggleStar}
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
                    {(() => {
                      const shouldShowWorkflowControls = (onAddToShot || onDelete || onApplySettings) && !isSpecialEditMode;
                      console.log('[ShotSelectorDebug] 🎯 Bottom Workflow Controls render check:', 
                        '\n  shouldShowWorkflowControls:', shouldShowWorkflowControls,
                        '\n  onAddToShot:', !!onAddToShot,
                        '\n  onDelete:', !!onDelete,
                        '\n  onApplySettings:', !!onApplySettings,
                        '\n  isSpecialEditMode:', isSpecialEditMode,
                        '\n  isInpaintMode:', isInpaintMode,
                        '\n  isMagicEditMode:', isMagicEditMode
                      );
                      return shouldShowWorkflowControls;
                    })() && (
                      <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 z-10">
                        <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
                          {/* Shot Selection and Add to Shot */}
                          {(() => {
                            const shouldShowShotSelector = onAddToShot && allShots.length > 0 && !isVideo;
                            console.log('[ShotSelectorDebug] 🎯 ShotSelector render check:', 
                              '\n  shouldShowShotSelector:', shouldShowShotSelector,
                              '\n  onAddToShot:', !!onAddToShot,
                              '\n  allShots.length:', allShots?.length || 0,
                              '\n  isVideo:', isVideo,
                              '\n  mediaType:', media.type
                            );
                            return shouldShowShotSelector;
                          })() && (
                            <>
                              <ShotSelector
                                value={selectedShotId || ''}
                                onValueChange={onShotChange || (() => {})}
                                shots={allShots}
                                placeholder="Select shot"
                                triggerClassName="w-32 h-8 bg-black/50 border-white/20 text-white text-xs"
                                onOpenChange={setIsSelectOpen}
                                showAddShot={!!onCreateShot}
                                onCreateShot={handleQuickCreateAndAdd}
                                isCreatingShot={isCreatingShot}
                                quickCreateSuccess={quickCreateSuccess}
                                onQuickCreateSuccess={handleQuickCreateSuccess}
                                container={contentRef.current}
                              />

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleAddToShot}
                                    disabled={!selectedShotId}
                                    className={`h-8 px-3 text-white ${
                                      isAlreadyPositionedInSelectedShot || showTickForImageId === media.id
                                        ? 'bg-green-600/80 hover:bg-green-600'
                                        : 'bg-blue-600/80 hover:bg-blue-600'
                                    }`}
                                  >
                                    {isAlreadyPositionedInSelectedShot || showTickForImageId === media.id ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <PlusCircle className="h-4 w-4" />
                                    )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="z-[100001]">
                              {isAlreadyPositionedInSelectedShot || showTickForImageId === media.id
                                ? 'Added with position. Jump to shot.'
                                : 'Add to shot with position'}
                            </TooltipContent>
                          </Tooltip>

                              {onAddToShotWithoutPosition && !isAlreadyPositionedInSelectedShot && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={handleAddToShotWithoutPosition}
                                      disabled={!selectedShotId}
                                      className={`h-8 px-3 text-white ${
                                        isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === media.id
                                          ? 'bg-green-600/80 hover:bg-green-600'
                                          : 'bg-purple-600/80 hover:bg-purple-600'
                                      }`}
                                    >
                                      {isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === media.id ? (
                                        <CheckCircle className="h-4 w-4" />
                                      ) : (
                                        <PlusCircle className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="z-[100001]">
                                    {isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === media.id
                                      ? 'Added without position. Jump to shot.'
                                      : 'Add to shot without position'}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                        </>
                      )}

                      {/* Apply Settings */}
                      {onApplySettings && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleApplySettings}
                              className="bg-purple-600/80 hover:bg-purple-600 text-white h-8 px-3"
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">Apply settings</TooltipContent>
                        </Tooltip>
                      )}

                        </div>
                      </div>
                    )}

                  {/* Navigation Controls - Right Arrow */}
                  {showNavigation && !readOnly && onNext && hasNext && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onNext}
                      className="bg-black/50 hover:bg-black/70 text-white z-[80] h-10 w-10 sm:h-12 sm:w-12 absolute right-4 top-1/2 -translate-y-1/2"
                    >
                      <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
                    </Button>
                  )}
                  </div>

                {/* Task Details / Inpaint / Magic Edit Panel - Right side (40% width) */}
                <div 
                  data-task-details-panel
                  className={cn(
                    "bg-background border-l border-border overflow-y-auto"
                    // Removed flex centering to prevent top clipping with long content
                  )}
                  style={{ width: '40%' }}
                >
                  {isSpecialEditMode ? (
                    // Inpaint Controls Panel - Always shown in sidebar when in inpaint mode
                    <div className="p-6 space-y-4 w-full">
                      {/* Based On display - Show source image this was derived from */}
                      {(() => {
                        console.log('[BasedOn:EditMode] 🎨 Render check', {
                          hasSourceData: !!sourceGenerationData,
                          hasHandler: !!onOpenExternalGeneration,
                          willShow: !!(sourceGenerationData && onOpenExternalGeneration),
                          sourceId: sourceGenerationData?.id?.substring(0, 8)
                        });
                        
                        if (sourceGenerationData && onOpenExternalGeneration) {
                          return (
                            <SourceGenerationDisplay
                              sourceGeneration={sourceGenerationData}
                              onNavigate={onOpenExternalGeneration}
                              variant="full"
                              className="mb-3"
                            />
                          );
                        }
                        return null;
                      })()}
                      
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h2 className="text-2xl font-light">Edit Image</h2>
                          
                          {/* Three-way toggle: Text | Inpaint | Annotate */}
                          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                            <button
                              onClick={() => setEditMode('text')}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-all",
                                editMode === 'text'
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Type className="h-3.5 w-3.5" />
                              Text
                            </button>
                            <button
                              onClick={() => setEditMode('inpaint')}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-all",
                                editMode === 'inpaint'
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Paintbrush className="h-3.5 w-3.5" />
                              Inpaint
                            </button>
                            <button
                              onClick={() => setEditMode('annotate')}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-all",
                                editMode === 'annotate'
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Annotate
                            </button>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleExitMagicEditMode}
                          className="text-sm px-3 py-1 md:flex md:flex-col md:items-center md:leading-tight hover:bg-transparent active:bg-transparent"
                        >
                          <span className="md:hidden">Close edit mode</span>
                          <span className="hidden md:block">Close</span>
                          <span className="hidden md:block">Edit Mode</span>
                        </Button>
                      </div>
                      
                      <div className="space-y-4">
                        {/* Prompt Field */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Prompt</label>
                          <textarea
                            value={inpaintPrompt}
                            onChange={(e) => setInpaintPrompt(e.target.value)}
                            placeholder="Describe what to generate in the masked area..."
                            className="w-full min-h-[100px] bg-background border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            rows={4}
                          />
                        </div>
                        
                        {/* Number of Generations Slider */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Number of Generations</label>
                            <span className="text-sm text-muted-foreground">{inpaintNumGenerations}</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={16}
                            value={inpaintNumGenerations}
                            onChange={(e) => setInpaintNumGenerations(parseInt(e.target.value))}
                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                          <p className="text-xs text-muted-foreground">Generate 1-16 variations</p>
                        </div>
                        
                        {/* Generate Button - Unified */}
                        <Button
                          variant="default"
                          size="default"
                          onClick={editMode === 'annotate' ? handleGenerateAnnotatedEdit : handleUnifiedGenerate}
                          disabled={
                            (editMode === 'annotate' && (brushStrokes.length === 0 || !inpaintPrompt.trim())) ||
                            (editMode !== 'annotate' && !inpaintPrompt.trim()) || 
                            (editMode === 'inpaint' && brushStrokes.length === 0) ||
                            isGeneratingInpaint || 
                            inpaintGenerateSuccess || 
                            isCreatingMagicEditTasks || 
                            magicEditTasksCreated
                          }
                          className={cn(
                            "w-full",
                            (inpaintGenerateSuccess || magicEditTasksCreated) && "bg-green-600 hover:bg-green-600"
                          )}
                        >
                          {(isGeneratingInpaint || isCreatingMagicEditTasks) ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (inpaintGenerateSuccess || magicEditTasksCreated) ? (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              {editMode === 'inpaint' ? 'Success!' : 'Submitted, results will appear below'}
                            </>
                          ) : editMode === 'inpaint' ? (
                            <>
                              <Paintbrush className="h-4 w-4 mr-2" />
                              Generate inpainted image
                            </>
                          ) : editMode === 'annotate' ? (
                            <>
                              <Pencil className="h-4 w-4 mr-2" />
                              Generate based on annotations
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Generate text edit
                            </>
                          )}
                        </Button>
                        
                      </div>
                      
                      {/* Derived Generations Section - Show images based on this one */}
                      {derivedGenerations && derivedGenerations.length > 0 && (
                        <div className="border-t border-border pt-4 mt-4">
                          <div className="mb-3 flex items-start justify-between">
                            <div>
                              <h3 className="text-sm font-medium">
                                Edits of this image ({derivedGenerations.length})
                              </h3>
                    </div>
                            
                            {/* Pagination controls - top right */}
                            {derivedTotalPages > 1 && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setDerivedPage(p => Math.max(1, p - 1))}
                                  disabled={derivedPage === 1}
                                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </button>
                                <span className="text-xs text-muted-foreground">
                                  {derivedPage}/{derivedTotalPages}
                                </span>
                                <button
                                  onClick={() => setDerivedPage(p => Math.min(derivedTotalPages, p + 1))}
                                  disabled={derivedPage === derivedTotalPages}
                                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2">
                            {paginatedDerived.map((derived, derivedIdx) => {
                              // Calculate actual index in full derivedGenerations array
                              const actualIndex = derivedGenerations?.findIndex(d => d.id === derived.id) ?? derivedIdx;
                              
                              return (
                              <div
                                key={derived.id}
                                className="relative aspect-square group overflow-hidden rounded border border-border hover:border-primary transition-colors cursor-pointer"
                                onClick={async () => {
                                  console.log('[DerivedNav] 🖼️ Thumbnail clicked', {
                                    derivedId: derived.id.substring(0, 8),
                                    derivedUrl: derived.location,
                                    currentMediaId: media.id.substring(0, 8),
                                    hasOnNavigateToGeneration: !!onNavigateToGeneration,
                                    hasOnOpenExternalGeneration: !!onOpenExternalGeneration,
                                    timestamp: Date.now()
                                  });
                                  
                                  // Prefer onOpenExternalGeneration (handles both in-context and external)
                                  if (onOpenExternalGeneration) {
                                    console.log('[DerivedNav] 🌐 Using onOpenExternalGeneration (universal handler)', {
                                      derivedId: derived.id.substring(0, 8),
                                      sourceId: media.id.substring(0, 8),
                                      passingDerivedContext: true,
                                      derivedCount: derivedGenerations?.length || 0
                                    });
                                    // Pass the full derived context for navigation
                                    await onOpenExternalGeneration(
                                      derived.id, 
                                      derivedGenerations?.map(d => d.id) || []
                                    );
                                  } else if (onNavigateToGeneration) {
                                    // Fallback to navigate-only mode (ImageGallery context)
                                    console.log('[DerivedNav] 🎯 Falling back to onNavigateToGeneration', {
                                      derivedId: derived.id.substring(0, 8)
                                    });
                                    onNavigateToGeneration(derived.id);
                                  } else {
                                    console.error('[DerivedNav] ❌ No navigation handlers available!');
                                  }
                                }}
                              >
                                <img
                                  src={derived.thumbUrl}
                                  alt="Derived generation"
                                  className="w-full h-full object-contain bg-black/20"
                                />
                                
                                {/* Simple hover overlay - no buttons */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors pointer-events-none" />
                                
                                {derived.starred && (
                                  <div className="absolute top-1 right-1 z-10 pointer-events-none">
                                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                  </div>
                                )}
                              </div>
                            );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full">
                      {/* Open Edit Mode Button - shown when not in special edit mode */}
                      {!readOnly && showImageEditTools && (
                        <div className="p-6 pb-4 border-b border-border flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setIsInpaintMode(true);
                              setEditMode('inpaint');
                            }}
                            className="text-sm px-3 py-1 md:flex md:flex-col md:items-center md:leading-tight hover:bg-transparent active:bg-transparent"
                          >
                            <span className="md:hidden">Open edit mode</span>
                            <span className="hidden md:block">Open</span>
                            <span className="hidden md:block">Edit Mode</span>
                          </Button>
                        </div>
                      )}
                      
                      {/* Based On display - Show source image this was derived from (ABOVE task details) */}
                      {sourceGenerationData && onOpenExternalGeneration && (
                        <div className="border-b border-border p-4">
                          <SourceGenerationDisplay
                            sourceGeneration={sourceGenerationData}
                            onNavigate={onOpenExternalGeneration}
                            variant="compact"
                          />
                        </div>
                      )}
                    
                    <TaskDetailsPanel
                      task={taskDetailsData?.task}
                      isLoading={taskDetailsData?.isLoading || false}
                      error={taskDetailsData?.error}
                      inputImages={taskDetailsData?.inputImages || []}
                      taskId={taskDetailsData?.taskId || null}
                      replaceImages={replaceImages}
                      onReplaceImagesChange={setReplaceImages}
                      onApplySettingsFromTask={taskDetailsData?.onApplySettingsFromTask ? (taskId, replaceImages, inputImages) => {
                        taskDetailsData.onApplySettingsFromTask?.(taskId, replaceImages, inputImages);
                        onClose(); // Close lightbox after applying settings
                      } : undefined}
                      onClose={taskDetailsData?.onClose || onClose}
                      className=""
                      generationName={generationName}
                      onGenerationNameChange={handleGenerationNameChange}
                      isEditingGenerationName={isEditingGenerationName}
                      onEditingGenerationNameChange={setIsEditingGenerationName}
                      showUserImage={false}
                      derivedSection={(() => {
                        console.log('[BasedOnDebug] Desktop render check - Derived Generations section', {
                          hasDerivedGenerations: !!derivedGenerations,
                          derivedCount: derivedGenerations?.length || 0,
                          paginatedDerivedCount: paginatedDerived.length,
                          willRender: !!derivedGenerations && derivedGenerations.length > 0
                        });
                        
                        if (!derivedGenerations || derivedGenerations.length === 0) return null;
                        
                        console.log('[BasedOnDebug] Inside Derived Generations section render', {
                          derivedGenerationsLength: derivedGenerations.length,
                          paginatedDerivedLength: paginatedDerived.length,
                          derivedTotalPages,
                          derivedPage
                        });
                        
                        return (
                          <div className="space-y-3 mb-6">
                            <div className="border-t border-border p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <h3 className="text-lg font-light">
                                  Based on this ({derivedGenerations.length})
                                </h3>
                                {derivedTotalPages > 1 && (
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDerivedPage(p => Math.max(1, p - 1))}
                                      disabled={derivedPage === 1}
                                      className="h-7 w-7 p-0"
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-xs text-muted-foreground">
                                      {derivedPage} / {derivedTotalPages}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDerivedPage(p => Math.min(derivedTotalPages, p + 1))}
                                      disabled={derivedPage === derivedTotalPages}
                                      className="h-7 w-7 p-0"
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-3 gap-2">
                                {paginatedDerived.map((derived, derivedIdx) => {
                                  // Calculate actual index in full derivedGenerations array
                                  const actualIndex = derivedGenerations?.findIndex(d => d.id === derived.id) ?? derivedIdx;
                                  
                                  return (
                                  <div
                                    key={derived.id}
                                    className="relative aspect-square group overflow-hidden rounded border border-border hover:border-primary transition-colors cursor-pointer"
                                    onClick={async () => {
                                      console.log('[DerivedNav:TaskPanel] 🖼️ Thumbnail clicked', {
                                        derivedId: derived.id.substring(0, 8),
                                        derivedUrl: derived.location,
                                        currentMediaId: media.id.substring(0, 8),
                                        hasOnOpenExternalGeneration: !!onOpenExternalGeneration,
                                        hasOnNavigateToGeneration: !!onNavigateToGeneration,
                                        timestamp: Date.now()
                                      });
                                      
                                      if (onOpenExternalGeneration) {
                                        // Pass the full derived context for navigation
                                        await onOpenExternalGeneration(
                                          derived.id,
                                          derivedGenerations?.map(d => d.id) || []
                                        );
                                      } else if (onNavigateToGeneration) {
                                        onNavigateToGeneration(derived.id);
                                      }
                                    }}
                                  >
                                    <img
                                      src={derived.thumbUrl}
                                      alt="Derived generation"
                                      className="w-full h-full object-contain bg-black/20"
                                    />
                                    
                                    {/* Simple hover overlay - no buttons */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors pointer-events-none" />
                                    
                                    {(derived as any).starred && (
                                      <div className="absolute top-1 right-1 z-10 pointer-events-none">
                                        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                      </div>
                                    )}
                                  </div>
                                );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    />
                    </div>
                  )}
                </div>
              </div>
            ) : (showTaskDetails || isSpecialEditMode) && isMobile ? (
              // Mobile layout with task details or special edit modes - stacked
              <div className="w-full h-full flex flex-col bg-black/90">
                {/* Media section - Top (60% height) */}
                <div 
                  className="flex-1 flex items-center justify-center relative"
                  style={{ height: '60%' }}
                  onClick={(e) => {
                    // Close if clicking on the black space (not on the media or controls)
                    if (e.target === e.currentTarget) {
                      onClose();
                    }
                  }}
                >
                  {/* Media Content - same as above but adapted for mobile */}
                    {isVideo ? (
                      <StyledVideoPlayer
                        src={effectiveImageUrl}
                        poster={media.thumbUrl}
                        loop
                        muted
                        autoPlay
                        playsInline
                        preload="auto"
                        className="max-w-full max-h-full shadow-wes border border-border/20"
                      />
                    ) : (
                    <MediaDisplayWithCanvas
                      effectiveImageUrl={effectiveImageUrl}
                      thumbUrl={media.thumbUrl}
                      isVideo={false}
                      isFlippedHorizontally={isFlippedHorizontally}
                      isSaving={isSaving}
                      isInpaintMode={isInpaintMode}
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

                    {/* Mobile Inpaint Controls - Top/Bottom positioned (shown in special edit modes) */}
                    {isSpecialEditMode && (
                      <div className={cn(
                        "absolute left-2 z-[70]",
                        inpaintPanelPosition === 'top' ? 'top-2' : 'bottom-2'
                      )}>
                        {/* Position Toggle Button - at top when panel is at bottom */}
                        {inpaintPanelPosition === 'bottom' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setInpaintPanelPosition('top')}
                                className="mx-auto w-fit px-2 py-1 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-t-md flex items-center justify-center transition-colors border border-border border-b-0 shadow-lg"
                              >
                                <ArrowUp className="h-3 w-3 mt-0.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="z-[100001]">Move controls to top</TooltipContent>
                          </Tooltip>
                        )}
                        
                        <div className="bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 w-32 border border-border shadow-xl">
                          {/* Brush Size Slider */}
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
                          
                          {/* Erase Toggle */}
                          <Button
                            variant={isEraseMode ? "default" : "secondary"}
                            size="sm"
                            onClick={() => setIsEraseMode(!isEraseMode)}
                            className={cn(
                              "w-full text-xs h-6",
                              isEraseMode && "bg-purple-600 hover:bg-purple-700"
                            )}
                          >
                            <Eraser className="h-3 w-3 mr-1" />
                            {isEraseMode ? 'Erase' : 'Paint'}
                          </Button>
                          
                          {/* Undo | Clear */}
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={handleUndo}
                                  disabled={brushStrokes.length === 0}
                                  className="flex-1 text-xs h-6"
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
                                  className="flex-1 text-xs h-6"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="z-[100001]">Clear all</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        
                        {/* Position Toggle Button - at bottom when panel is at top */}
                        {inpaintPanelPosition === 'top' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setInpaintPanelPosition('bottom')}
                                className="mx-auto w-fit px-2 py-1 bg-background hover:bg-muted text-muted-foreground hover:text-foreground rounded-b-md flex items-center justify-center transition-colors border border-border border-t-0 shadow-lg relative z-10"
                              >
                                <ArrowDown className="h-3 w-3 -mt-0.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="z-[100001]">Move controls to bottom</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
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
                      effectiveImageUrl={effectiveImageUrl}
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
                      handleToggleStar={wrappedHandleToggleStar}
                      toggleStarPending={toggleStarMutation.isPending}
                      isAddingToReferences={isAddingToReferences}
                      addToReferencesSuccess={addToReferencesSuccess}
                      handleAddToReferences={handleAddToReferences}
                    />

                    {/* Bottom Workflow Controls (hidden in special edit modes) */}
                    {(() => {
                      const shouldShowWorkflowControls = (onAddToShot || onDelete || onApplySettings) && !isSpecialEditMode;
                      console.log('[ShotSelectorDebug] 🎯 Mobile Stacked - Bottom Workflow Controls render check:', 
                        '\n  shouldShowWorkflowControls:', shouldShowWorkflowControls,
                        '\n  onAddToShot:', !!onAddToShot,
                        '\n  onDelete:', !!onDelete,
                        '\n  onApplySettings:', !!onApplySettings,
                        '\n  isSpecialEditMode:', isSpecialEditMode,
                        '\n  isInpaintMode:', isInpaintMode,
                        '\n  isMagicEditMode:', isMagicEditMode
                      );
                      return shouldShowWorkflowControls;
                    })() && (
                      <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 z-10">
                        <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
                          {/* Shot Selection and Add to Shot */}
                          {(() => {
                            const shouldShowShotSelector = onAddToShot && allShots.length > 0 && !isVideo;
                            console.log('[ShotSelectorDebug] 🎯 Mobile Stacked - ShotSelector render check:', 
                              '\n  shouldShowShotSelector:', shouldShowShotSelector,
                              '\n  onAddToShot:', !!onAddToShot,
                              '\n  allShots.length:', allShots?.length || 0,
                              '\n  isVideo:', isVideo,
                              '\n  mediaType:', media.type
                            );
                            return shouldShowShotSelector;
                          })() && (
                            <>
                              <ShotSelector
                                value={selectedShotId || ''}
                                onValueChange={onShotChange || (() => {})}
                                shots={allShots}
                                placeholder="Select shot"
                                triggerClassName="w-32 h-8 bg-black/50 border-white/20 text-white text-xs"
                                onOpenChange={setIsSelectOpen}
                                showAddShot={!!onCreateShot}
                                onCreateShot={handleQuickCreateAndAdd}
                                isCreatingShot={isCreatingShot}
                                quickCreateSuccess={quickCreateSuccess}
                                onQuickCreateSuccess={handleQuickCreateSuccess}
                                container={contentRef.current}
                              />

                              <Tooltip>
                                <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                                    onClick={handleAddToShot}
                                    disabled={!selectedShotId}
                                    className={`h-8 px-3 text-white ${
                                      isAlreadyPositionedInSelectedShot || showTickForImageId === media.id
                                        ? 'bg-green-600/80 hover:bg-green-600'
                                        : 'bg-blue-600/80 hover:bg-blue-600'
                                    }`}
                                  >
                                    {isAlreadyPositionedInSelectedShot || showTickForImageId === media.id ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <PlusCircle className="h-4 w-4" />
                                    )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="z-[100001]">
                              {isAlreadyPositionedInSelectedShot || showTickForImageId === media.id
                                ? 'Added with position. Jump to shot.'
                                : 'Add to shot with position'}
                            </TooltipContent>
                          </Tooltip>

                              {onAddToShotWithoutPosition && !isAlreadyPositionedInSelectedShot && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                                      onClick={handleAddToShotWithoutPosition}
                                      disabled={!selectedShotId}
                                      className={`h-8 px-3 text-white ${
                                        isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === media.id
                                          ? 'bg-green-600/80 hover:bg-green-600'
                                          : 'bg-purple-600/80 hover:bg-purple-600'
                                      }`}
                                    >
                                      {isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === media.id ? (
                                        <CheckCircle className="h-4 w-4" />
                                      ) : (
                                        <PlusCircle className="h-4 w-4" />
                                      )}
                            </Button>
                                </TooltipTrigger>
                                <TooltipContent className="z-[100001]">
                                  {isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === media.id
                                    ? 'Added without position. Jump to shot.'
                                    : 'Add to shot without position'}
                                </TooltipContent>
                              </Tooltip>
                          )}
                        </>
                      )}

                      {/* Apply Settings */}
                      {onApplySettings && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                              <Button
                                variant="secondary"
                                size="sm"
                              onClick={handleApplySettings}
                              className="bg-purple-600/80 hover:bg-purple-600 text-white h-8 px-3"
                            >
                              <Settings className="h-4 w-4" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">Apply settings</TooltipContent>
                        </Tooltip>
                        )}

                        </div>
                      </div>
                    )}

                    {/* Mobile navigation */}
                    {showNavigation && !readOnly && onPrevious && hasPrevious && (
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={onPrevious}
                        className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-[80] h-12 w-12"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </Button>
                    )}
                    
                    {showNavigation && !readOnly && onNext && hasNext && (
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={onNext}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-[80] h-12 w-12"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </Button>
                    )}
                </div>

                {/* Task Details / Inpaint / Magic Edit Panel - Bottom (40% height) */}
                <div 
                  data-task-details-panel
                  className={cn(
                    "bg-background border-t border-border overflow-y-auto relative"
                    // Removed flex centering to prevent top clipping with long content
                  )}
                  style={{ height: '40%' }}
                >
                  {isSpecialEditMode ? (
                    // Inpaint Prompt & Generate - Mobile
                    <div className="p-4 space-y-3 w-full">
                      {/* Based On display - Show source image this was derived from */}
                      {sourceGenerationData && onOpenExternalGeneration && (
                        <button
                          onClick={async () => {
                            console.log('[BasedOn:Mobile] 🖼️ Navigating to source generation', {
                              sourceId: sourceGenerationData.id.substring(0, 8),
                              clearingDerivedContext: true
                            });
                            // Clear derived context by not passing it - exits derived nav mode
                            await onOpenExternalGeneration(sourceGenerationData.id);
                          }}
                          className="mb-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                        >
                          <span>Based on:</span>
                          <div className="relative w-8 h-8 rounded border border-border overflow-hidden group-hover:border-primary transition-colors">
                            <img
                              src={(sourceGenerationData as any).thumbUrl || sourceGenerationData.location}
                              alt="Source generation"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="group-hover:underline">Click to view</span>
                        </button>
                      )}
                      
                      {/* Header */}
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-lg font-light">Edit Image</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleExitMagicEditMode}
                          className="text-xs px-2 py-1 md:flex md:flex-col md:items-center md:leading-tight hover:bg-transparent active:bg-transparent"
                        >
                          <span className="md:hidden">Close edit mode</span>
                          <span className="hidden md:block">Close</span>
                          <span className="hidden md:block">Edit Mode</span>
                        </Button>
                      </div>
                      
                      {/* Three-way toggle: Text | Inpaint | Annotate - Mobile */}
                      <div className="mb-3 flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                        <button
                          onClick={() => setEditMode('text')}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-all",
                            editMode === 'text'
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Type className="h-3 w-3" />
                          Text
                        </button>
                        <button
                          onClick={() => setEditMode('inpaint')}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-all",
                            editMode === 'inpaint'
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Paintbrush className="h-3 w-3" />
                          Inpaint
                        </button>
                        <button
                          onClick={() => setEditMode('annotate')}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-all",
                            editMode === 'annotate'
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Pencil className="h-3 w-3" />
                          Annotate
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Prompt Field */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Prompt</label>
                          <textarea
                            value={inpaintPrompt}
                            onChange={(e) => setInpaintPrompt(e.target.value)}
                            placeholder="Describe what to generate..."
                            className="w-full min-h-[60px] bg-background border border-input rounded-md px-2 py-1.5 text-base resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            rows={3}
                          />
                        </div>
                        
                        {/* Number of Generations Slider - Mobile */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium">Generations</label>
                            <span className="text-xs text-muted-foreground">{inpaintNumGenerations}</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={16}
                            value={inpaintNumGenerations}
                            onChange={(e) => setInpaintNumGenerations(parseInt(e.target.value))}
                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                          <p className="text-xs text-muted-foreground">1-16 variations</p>
                        </div>
                        
                        {/* Generate Button - Unified */}
                        <Button
                          variant="default"
                          size="sm"
                          onClick={editMode === 'annotate' ? handleGenerateAnnotatedEdit : handleUnifiedGenerate}
                          disabled={
                            (editMode === 'annotate' && (brushStrokes.length === 0 || !inpaintPrompt.trim())) ||
                            (editMode !== 'annotate' && !inpaintPrompt.trim()) || 
                            (editMode === 'inpaint' && brushStrokes.length === 0) ||
                            isGeneratingInpaint || 
                            inpaintGenerateSuccess || 
                            isCreatingMagicEditTasks || 
                            magicEditTasksCreated
                          }
                          className={cn(
                            "w-full",
                            (inpaintGenerateSuccess || magicEditTasksCreated) && "bg-green-600 hover:bg-green-600"
                          )}
                        >
                          {(isGeneratingInpaint || isCreatingMagicEditTasks) ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (inpaintGenerateSuccess || magicEditTasksCreated) ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-2" />
                              {editMode === 'inpaint' ? 'Success!' : 'Submitted, results will appear below'}
                            </>
                          ) : editMode === 'inpaint' ? (
                            <>
                              <Paintbrush className="h-3 w-3 mr-2" />
                              Generate inpainted image
                            </>
                          ) : editMode === 'annotate' ? (
                            <>
                              <Pencil className="h-3 w-3 mr-2" />
                              Generate based on annotations
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3 mr-2" />
                              Generate text edit
                            </>
                          )}
                        </Button>
                        
                      </div>
                      
                      {/* Derived Generations Section - Show images based on this one (MOBILE) */}
                      {derivedGenerations && derivedGenerations.length > 0 && (
                        <div className="border-t border-border pt-3 mt-3">
                          <div className="mb-2 flex items-start justify-between">
                            <div>
                              <h3 className="text-sm font-medium">
                                Edits of this image ({derivedGenerations.length})
                              </h3>
                            </div>
                            
                            {/* Pagination controls - top right */}
                            {derivedTotalPages > 1 && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDerivedPage(p => Math.max(1, p - 1))}
                                  disabled={derivedPage === 1}
                                  className="h-6 w-6 p-0"
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                  {derivedPage}/{derivedTotalPages}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDerivedPage(p => Math.min(derivedTotalPages, p + 1))}
                                  disabled={derivedPage === derivedTotalPages}
                                  className="h-6 w-6 p-0"
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-3 gap-1.5">
                            {paginatedDerived.map((derived, derivedIdx) => {
                              // Calculate actual index in full derivedGenerations array
                              const actualIndex = derivedGenerations?.findIndex(d => d.id === derived.id) ?? derivedIdx;
                              
                              return (
                              <div
                                key={derived.id}
                                className="relative aspect-square group overflow-hidden rounded border border-border hover:border-primary transition-colors cursor-pointer"
                                onClick={async () => {
                                  console.log('[DerivedNav:MobileEdit] 🖼️ Thumbnail clicked', {
                                    derivedId: derived.id.substring(0, 8),
                                    derivedUrl: derived.location,
                                    currentMediaId: media.id.substring(0, 8),
                                    hasOnOpenExternalGeneration: !!onOpenExternalGeneration,
                                    hasOnNavigateToGeneration: !!onNavigateToGeneration,
                                    timestamp: Date.now()
                                  });
                                  
                                  if (onOpenExternalGeneration) {
                                    // Pass the full derived context for navigation
                                    await onOpenExternalGeneration(
                                      derived.id,
                                      derivedGenerations?.map(d => d.id) || []
                                    );
                                  } else if (onNavigateToGeneration) {
                                    onNavigateToGeneration(derived.id);
                                  }
                                }}
                              >
                                <img
                                  src={derived.thumbUrl}
                                  alt="Derived generation"
                                  className="w-full h-full object-contain bg-black/20"
                                />
                                
                                {/* Simple hover overlay - no buttons */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors pointer-events-none" />
                                
                                {derived.starred && (
                                  <div className="absolute top-0.5 right-0.5 z-10 pointer-events-none">
                                    <Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" />
                                  </div>
                                )}
                              </div>
                            );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full">
                      {/* Open Edit Mode Button - shown when not in special edit mode (MOBILE) */}
                      {!readOnly && showImageEditTools && (
                        <div className="p-4 pb-3 border-b border-border flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setIsInpaintMode(true);
                              setEditMode('inpaint');
                            }}
                            className="text-xs px-2 py-1 md:flex md:flex-col md:items-center md:leading-tight hover:bg-transparent active:bg-transparent"
                          >
                            <span className="md:hidden">Open edit mode</span>
                            <span className="hidden md:block">Open</span>
                            <span className="hidden md:block">Edit Mode</span>
                          </Button>
                        </div>
                      )}
                      
                      {/* Based On display - Show source image this was derived from (ABOVE task details) - MOBILE */}
                      {sourceGenerationData && onOpenExternalGeneration && (
                        <div className="border-b border-border p-4">
                          <button
                            onClick={async () => {
                              console.log('[BasedOn:Mobile:NonEditTaskDetails] 🖼️ Navigating to source generation', {
                                sourceId: sourceGenerationData.id.substring(0, 8),
                                clearingDerivedContext: true
                              });
                              // Clear derived context by not passing it - exits derived nav mode
                              await onOpenExternalGeneration(sourceGenerationData.id);
                            }}
                            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                          >
                            <span>Based on:</span>
                            <div className="relative w-8 h-8 rounded border border-border overflow-hidden group-hover:border-primary transition-colors">
                              <img
                                src={(sourceGenerationData as any).thumbUrl || sourceGenerationData.location}
                                alt="Source generation"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="group-hover:underline">Click to view</span>
                          </button>
                        </div>
                      )}
                    
                    <TaskDetailsPanel
                      task={taskDetailsData?.task}
                      isLoading={taskDetailsData?.isLoading || false}
                      error={taskDetailsData?.error}
                      inputImages={taskDetailsData?.inputImages || []}
                      taskId={taskDetailsData?.taskId || null}
                      replaceImages={replaceImages}
                      onReplaceImagesChange={setReplaceImages}
                      onApplySettingsFromTask={taskDetailsData?.onApplySettingsFromTask ? (taskId, replaceImages, inputImages) => {
                        taskDetailsData.onApplySettingsFromTask?.(taskId, replaceImages, inputImages);
                        onClose(); // Close lightbox after applying settings
                      } : undefined}
                      onClose={taskDetailsData?.onClose || onClose}
                      className=""
                      generationName={generationName}
                      onGenerationNameChange={handleGenerationNameChange}
                      isEditingGenerationName={isEditingGenerationName}
                      onEditingGenerationNameChange={setIsEditingGenerationName}
                      showUserImage={false}
                      derivedSection={(() => {
                        console.log('[BasedOnDebug] Mobile render check - Derived Generations section', {
                          hasDerivedGenerations: !!derivedGenerations,
                          derivedCount: derivedGenerations?.length || 0,
                          paginatedDerivedCount: paginatedDerived.length,
                          willRender: !!derivedGenerations && derivedGenerations.length > 0
                        });
                        
                        if (!derivedGenerations || derivedGenerations.length === 0) return null;
                        
                        console.log('[BasedOnDebug] Inside Mobile Derived Generations section render', {
                          derivedGenerationsLength: derivedGenerations.length,
                          paginatedDerivedLength: paginatedDerived.length,
                          derivedTotalPages,
                          derivedPage
                        });
                        
                        return (
                          <div className="space-y-3 mb-6">
                            <div className="border-t border-border p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <h3 className="text-lg font-light">
                                  Based on this ({derivedGenerations.length})
                                </h3>
                                {derivedTotalPages > 1 && (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDerivedPage(p => Math.max(1, p - 1))}
                                      disabled={derivedPage === 1}
                                      className="h-6 w-6 p-0"
                                    >
                                      <ChevronLeft className="h-3 w-3" />
                                    </Button>
                                    <span className="text-xs text-muted-foreground">
                                      {derivedPage} / {derivedTotalPages}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDerivedPage(p => Math.min(derivedTotalPages, p + 1))}
                                      disabled={derivedPage === derivedTotalPages}
                                      className="h-6 w-6 p-0"
                                    >
                                      <ChevronRight className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-3 gap-1.5">
                                {paginatedDerived.map((derived, derivedIdx) => {
                                  // Calculate actual index in full derivedGenerations array
                                  const actualIndex = derivedGenerations?.findIndex(d => d.id === derived.id) ?? derivedIdx;
                                  
                                  return (
                                  <div
                                    key={derived.id}
                                    className="relative aspect-square group overflow-hidden rounded border border-border hover:border-primary transition-colors cursor-pointer"
                                    onClick={async () => {
                                      console.log('[DerivedNav:Mobile] 🖼️ Thumbnail clicked', {
                                        derivedId: derived.id.substring(0, 8),
                                        derivedUrl: derived.location,
                                        currentMediaId: media.id.substring(0, 8),
                                        hasOnOpenExternalGeneration: !!onOpenExternalGeneration,
                                        hasOnNavigateToGeneration: !!onNavigateToGeneration,
                                        timestamp: Date.now()
                                      });
                                      
                                      if (onOpenExternalGeneration) {
                                        // Pass the full derived context for navigation
                                        await onOpenExternalGeneration(
                                          derived.id,
                                          derivedGenerations?.map(d => d.id) || []
                                        );
                                      } else if (onNavigateToGeneration) {
                                        onNavigateToGeneration(derived.id);
                                      }
                                    }}
                                  >
                                    <img
                                      src={derived.thumbUrl}
                                      alt="Derived generation"
                                      className="w-full h-full object-contain bg-black/20"
                                    />
                                    
                                    {/* Simple hover overlay - no buttons */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors pointer-events-none" />
                                    
                                    {(derived as any).starred && (
                                      <div className="absolute top-0.5 right-0.5 z-10 pointer-events-none">
                                        <Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" />
                                      </div>
                                    )}
                                  </div>
                                );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Mobile/Tablet layout using new FlexContainer + MediaWrapper
              <FlexContainer onClick={onClose}>
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
                    src={effectiveImageUrl}
                    poster={media.thumbUrl}
                    loop
                    muted
                    autoPlay
                    playsInline
                    preload="auto"
                    className="max-w-full max-h-full object-contain shadow-wes border border-border/20 rounded"
                  />
                ) : (
                  <MediaDisplayWithCanvas
                    effectiveImageUrl={effectiveImageUrl}
                    thumbUrl={media.thumbUrl}
                    isVideo={false}
                    isFlippedHorizontally={isFlippedHorizontally}
                    isSaving={isSaving}
                    isInpaintMode={isInpaintMode}
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
                        {(() => {
                          console.log('[MobilePaintDebug] Edit button visibility check', {
                            isSpecialEditMode,
                            isVideo,
                            selectedProjectId: !!selectedProjectId,
                            isCloudMode,
                            shouldShowButton: !isVideo && selectedProjectId && isCloudMode
                          });
                          return null;
                        })()}
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
                            // Annotate mode: Circle/Arrow toggle
                            <div className="flex gap-1">
                              <Button
                                variant={annotationMode === 'circle' ? "default" : "secondary"}
                                size="sm"
                                onClick={() => setAnnotationMode('circle')}
                                className="flex-1 text-xs h-7"
                              >
                                <Circle className="h-3 w-3" />
                              </Button>
                              <Button
                                variant={annotationMode === 'arrow' ? "default" : "secondary"}
                                size="sm"
                                onClick={() => setAnnotationMode('arrow')}
                                className="flex-1 text-xs h-7"
                              >
                                <ArrowRight className="h-3 w-3" />
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
                    effectiveImageUrl={effectiveImageUrl}
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
                  {(() => {
                    const shouldShowWorkflowControls = (onAddToShot || onDelete || onApplySettings) && !isSpecialEditMode;
                    console.log('[ShotSelectorDebug] 🎯 Mobile Regular - Bottom Workflow Controls render check:', 
                      '\n  shouldShowWorkflowControls:', shouldShowWorkflowControls,
                      '\n  onAddToShot:', !!onAddToShot,
                      '\n  onDelete:', !!onDelete,
                      '\n  onApplySettings:', !!onApplySettings,
                      '\n  isSpecialEditMode:', isSpecialEditMode,
                      '\n  isInpaintMode:', isInpaintMode,
                      '\n  isMagicEditMode:', isMagicEditMode
                    );
                    return shouldShowWorkflowControls;
                  })() && (
                    <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 z-10">
                      <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
                        {/* Shot Selection and Add to Shot */}
                        {(() => {
                          const shouldShowShotSelector = onAddToShot && allShots.length > 0 && !isVideo;
                          console.log('[ShotSelectorDebug] 🎯 Mobile Regular - ShotSelector render check:', 
                            '\n  shouldShowShotSelector:', shouldShowShotSelector,
                            '\n  onAddToShot:', !!onAddToShot,
                            '\n  allShots.length:', allShots?.length || 0,
                            '\n  isVideo:', isVideo,
                            '\n  mediaType:', media.type
                          );
                          return shouldShowShotSelector;
                        })() && (
                          <>
                            <ShotSelector
                              value={selectedShotId || ''}
                              onValueChange={onShotChange || (() => {})}
                              shots={allShots}
                              placeholder="Select shot"
                              triggerClassName="w-32 h-8 bg-black/50 border-white/20 text-white text-xs"
                              onOpenChange={setIsSelectOpen}
                              showAddShot={!!onCreateShot}
                              onCreateShot={handleQuickCreateAndAdd}
                              isCreatingShot={isCreatingShot}
                              quickCreateSuccess={quickCreateSuccess}
                              onQuickCreateSuccess={handleQuickCreateSuccess}
                              container={contentRef.current}
                            />

                            <Tooltip>
                              <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                                  onClick={handleAddToShot}
                                  disabled={!selectedShotId}
                                  className={`h-8 px-3 text-white ${
                                    isAlreadyPositionedInSelectedShot || showTickForImageId === media.id
                                      ? 'bg-green-600/80 hover:bg-green-600'
                                      : 'bg-blue-600/80 hover:bg-blue-600'
                                  }`}
                                >
                                  {isAlreadyPositionedInSelectedShot || showTickForImageId === media.id ? (
                                    <CheckCircle className="h-4 w-4" />
                                  ) : (
                                    <PlusCircle className="h-4 w-4" />
                                  )}
                          </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">
                            {isAlreadyPositionedInSelectedShot || showTickForImageId === media.id
                              ? 'Added with position. Jump to shot.'
                              : 'Add to shot with position'}
                          </TooltipContent>
                        </Tooltip>

                            {onAddToShotWithoutPosition && !isAlreadyPositionedInSelectedShot && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                                    onClick={handleAddToShotWithoutPosition}
                                    disabled={!selectedShotId}
                                    className={`h-8 px-3 text-white ${
                                      isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === media.id
                                        ? 'bg-green-600/80 hover:bg-green-600'
                                        : 'bg-purple-600/80 hover:bg-purple-600'
                                    }`}
                                  >
                                    {isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === media.id ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <PlusCircle className="h-4 w-4" />
                                    )}
                              </Button>
                              </TooltipTrigger>
                              <TooltipContent className="z-[100001]">
                                {isAlreadyAssociatedWithoutPosition || showTickForSecondaryImageId === media.id
                                  ? 'Added without position. Jump to shot.'
                                  : 'Add to shot without position'}
                              </TooltipContent>
                            </Tooltip>
                        )}
                        </>
                      )}

                    {/* Apply Settings */}
                    {onApplySettings && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                            onClick={handleApplySettings}
                            className="bg-purple-600/80 hover:bg-purple-600 text-white h-8 px-3"
                          >
                            <Settings className="h-4 w-4" />
                        </Button>
                        </TooltipTrigger>
                        <TooltipContent className="z-[100001]">Apply settings</TooltipContent>
                      </Tooltip>
                    )}

                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  {showNavigation && !readOnly && (
                    <>
                      {onPrevious && hasPrevious && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onPrevious}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-[80] h-12 w-12"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                  )}
                      {onNext && hasNext && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onNext}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-[80] h-12 w-12"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  )}
                    </>
                  )}
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