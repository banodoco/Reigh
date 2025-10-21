import React, { useState, useRef, useMemo } from 'react';
import { GenerationRow, Shot } from '@/types/shots';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/shared/components/ui/button';
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
  Undo2 
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import ShotSelector from '@/shared/components/ShotSelector';
import MagicEditLauncher from '@/shared/components/MagicEditLauncher';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import TaskDetailsPanel from '@/tools/travel-between-images/components/TaskDetailsPanel';

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
} from './hooks';

// Import all extracted components
import {
  MediaDisplay,
  NavigationButtons,
  InpaintControlsPanel,
  TaskDetailsSection,
  MediaControls,
  WorkflowControls,
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
  // Shot ID for star persistence
  shotId,
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
  
  const isTouchLikeDevice = useMemo(() => {
    if (typeof window === 'undefined') return !!isMobile;
    try {
      const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const ua = (navigator as any)?.userAgent || '';
      const tabletUA = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i.test(ua);
      const maxTouchPoints = (navigator as any)?.maxTouchPoints || 0;
      const isIpadOsLike = (navigator as any)?.platform === 'MacIntel' && maxTouchPoints > 1;
      return Boolean(isMobile || coarsePointer || tabletUA || isIpadOsLike);
    } catch {
      return !!isMobile;
    }
  }, [isMobile]);
  
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

  // Inpainting hook
  console.log('[InpaintDebug] 🔍 Passing to useInpainting hook:', {
    shotId: shotId?.substring(0, 8),
    toolTypeOverride,
    selectedProjectId: selectedProjectId?.substring(0, 8),
    mediaId: media.id.substring(0, 8)
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
    setIsInpaintMode,
    setIsEraseMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClearMask,
    handleEnterInpaintMode,
    handleGenerateInpaint,
  } = inpaintingHook;
  
  // Handle exiting inpaint mode from UI buttons
  const handleExitInpaintMode = () => {
    console.log('[InpaintPaint] 🚪 Exit button clicked');
    setIsInpaintMode(false);
  };

  // Auto-enter inpaint mode if requested
  React.useEffect(() => {
    if (autoEnterInpaint && !isInpaintMode && !isVideo && selectedProjectId) {
      console.log('[InpaintAutoEnter] 🎨 Auto-entering inpaint mode');
      handleEnterInpaintMode();
    }
  }, [autoEnterInpaint, isInpaintMode, isVideo, selectedProjectId, handleEnterInpaintMode]);

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
            className="fixed inset-0 z-[100000] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            onPointerDown={(e) => {
              // Track where the pointer down started
              pointerDownTargetRef.current = e.target;
              
              // Check if a higher z-index dialog is open - if so, don't block events
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                // MediaLightbox uses z-[100000], MagicEditModal uses z-[100100]
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
              // Check if a higher z-index dialog is open - if so, don't block events
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                return zIndex > 100000;
              });
              
              if (hasHigherZIndexDialog) {
                return; // Let the higher dialog handle the event
              }
              
              // Block touch events on mobile
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onTouchMove={(e) => {
              // Check if a higher z-index dialog is open - if so, don't block events
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                return zIndex > 100000;
              });
              
              if (hasHigherZIndexDialog) {
                return; // Let the higher dialog handle the event
              }
              
              // Block touch move events on mobile
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onTouchEnd={(e) => {
              // Check if a higher z-index dialog is open - if so, don't block events
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
                return zIndex > 100000;
              });
              
              if (hasHigherZIndexDialog) {
                return; // Let the higher dialog handle the event
              }
              
              // Block touch end events on mobile and close lightbox
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
              onClose();
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
              // Block touch events from bubbling through dialog content
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onTouchMove={(e) => {
              // Block touch move events from bubbling through dialog content
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onTouchEnd={(e) => {
              // Block touch end events from bubbling through dialog content
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
              (showTaskDetails && !isMobile) || (isInpaintMode && !isMobile)
                ? "left-0 top-0 w-full h-full" // Full screen layout for desktop with task details OR inpaint mode
                : isMobile 
                  ? "left-0 top-0 w-full h-full" // Mobile: full screen
                  : "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-auto h-auto data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
            )}
            onPointerDownOutside={(event) => {
              // 🚀 MOBILE FIX: Prevent underlying click-throughs and then close manually
              // Always stop propagation and default so the gesture does not reach elements behind
              event.preventDefault();
              event.stopPropagation();
              
              // Extra mobile protection: block all event propagation
              if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
              }

              if (showTaskDetails && !isMobile) {
                // Desktop with task details: only close if clicking on the overlay background
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
            }}
          >
            {/* Accessibility: Hidden dialog title for screen readers */}
            <DialogPrimitive.Title className="sr-only">
              {media.type?.includes('video') ? 'Video' : 'Image'} Lightbox - {media.id?.substring(0, 8)}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              View and interact with {media.type?.includes('video') ? 'video' : 'image'} in full screen. Use arrow keys to navigate, Escape to close.
            </DialogPrimitive.Description>
            
            {(showTaskDetails && !isMobile) || (isInpaintMode && !isMobile) ? (
              // Desktop layout with task details OR inpaint mode - side by side
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
                  {showNavigation && !readOnly && onPrevious && hasPrevious && !isInpaintMode && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onPrevious}
                      className="bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute left-4 top-1/2 -translate-y-1/2"
                    >
                      <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
                    </Button>
                  )}

                  {/* Media Content */}
                  <div ref={imageContainerRef} className="relative max-w-full max-h-full flex items-center justify-center">
                    {isVideo ? (
                      <StyledVideoPlayer
                        src={effectiveImageUrl}
                        poster={media.thumbUrl}
                        loop
                        muted
                        autoPlay
                        playsInline
                        preload="auto"
                        className="shadow-wes border border-border/20"
                        style={{ maxWidth: '55vw', maxHeight: '90vh' }}
                      />
                    ) : (
                      <div className="relative">
                        <img 
                          src={effectiveImageUrl} 
                          alt="Media content"
                          draggable={false}
                          className={`object-contain transition-opacity duration-300 select-none ${
                            isFlippedHorizontally ? 'scale-x-[-1]' : ''
                          } ${
                            isSaving ? 'opacity-30' : 'opacity-100'
                          }`}
                          style={{ 
                            maxHeight: '90vh',
                            maxWidth: '55vw',
                            transform: isFlippedHorizontally ? 'scaleX(-1)' : 'none',
                            pointerEvents: isInpaintMode ? 'none' : 'auto'
                          }}
                          onLoad={(e) => {
                            const img = e.target as HTMLImageElement;
                            setImageDimensions({
                              width: img.naturalWidth,
                              height: img.naturalHeight
                            });
                          }}
                        />
                        {isSaving && (
                          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50 backdrop-blur-sm">
                            <div className="text-center text-white bg-black/80 rounded-lg p-6 backdrop-blur-sm border border-white/20">
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-3"></div>
                              <p className="text-lg font-medium">Saving flipped image...</p>
                              <p className="text-sm text-white/70 mt-1">Please wait</p>
                            </div>
                          </div>
                        )}
                        
                        {/* Hidden canvas for image processing */}
                        <canvas 
                          ref={canvasRef}
                          className="hidden"
                        />
                        
                        {/* Canvas overlay for inpainting */}
                        {isInpaintMode && (
                          <>
                            <canvas
                              ref={displayCanvasRef}
                              className="absolute top-0 left-0 pointer-events-auto cursor-crosshair"
                              style={{
                                touchAction: 'none',
                                zIndex: 50,
                                userSelect: 'none'
                              }}
                              onPointerDown={(e) => {
                                console.log('[InpaintPaint] 🎨 Canvas onPointerDown', {
                                  clientX: e.clientX,
                                  clientY: e.clientY,
                                  canvasWidth: displayCanvasRef.current?.width,
                                  canvasHeight: displayCanvasRef.current?.height,
                                  isInpaintMode,
                                  hasHandler: !!handlePointerDown
                                });
                                handlePointerDown(e);
                              }}
                              onPointerMove={(e) => {
                                console.log('[InpaintPaint] 🖌️ Canvas onPointerMove', {
                                  clientX: e.clientX,
                                  clientY: e.clientY
                                });
                                handlePointerMove(e);
                              }}
                              onPointerUp={(e) => {
                                console.log('[InpaintPaint] 🛑 Canvas onPointerUp');
                                handlePointerUp(e);
                              }}
                              onPointerCancel={(e) => {
                                console.log('[InpaintPaint] ⚠️ Canvas onPointerCancel');
                                handlePointerUp(e);
                              }}
                              onDragStart={(e) => {
                                console.log('[InpaintPaint] 🚫 Preventing drag');
                                e.preventDefault();
                              }}
                            />
                            <canvas
                              ref={maskCanvasRef}
                              className="hidden"
                            />
                          </>
                        )}
                      </div>
                    )}


                    {/* Top Left Controls - Magic Edit, Inpaint, Upscale */}
                    <div className="absolute top-4 left-4 flex items-center space-x-2 z-10">
                      {!isVideo && showMagicEdit && !readOnly && !isInpaintMode && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <MagicEditLauncher
                                imageUrl={sourceUrlForTasks}
                                imageDimensions={imageDimensions}
                                toolTypeOverride={toolTypeOverride}
                                zIndexOverride={100100}
                                shotGenerationId={media.shotImageEntryId}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">Edit with text</TooltipContent>
                        </Tooltip>
                      )}

                      {/* Inpaint Button - Desktop Task Details View (hidden in readOnly, only shown in cloud mode) */}
                      {!readOnly && !isVideo && selectedProjectId && isCloudMode && !isInpaintMode && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleEnterInpaintMode}
                              className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                            >
                              <Paintbrush className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">Inpaint image</TooltipContent>
                        </Tooltip>
                      )}

                      {/* Upscale Button - Desktop Task Details View (hidden in readOnly, only shown in cloud mode) */}
                      {!readOnly && !isVideo && selectedProjectId && isCloudMode && !isInpaintMode && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={hasUpscaledVersion ? handleToggleUpscaled : handleUpscale}
                                disabled={isUpscaling || isPendingUpscale}
                                className={cn(
                                  "transition-colors text-white",
                                  isPendingUpscale ? "bg-green-600/80 hover:bg-green-600" : "bg-black/50 hover:bg-black/70"
                                )}
                              >
                                {isUpscaling ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : isPendingUpscale ? (
                                  <CheckCircle className="h-4 w-4" />
                                ) : hasUpscaledVersion ? (
                                  showingUpscaled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />
                                ) : (
                                  <ArrowUpCircle className="h-4 w-4" />
                                )}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">
                            {isUpscaling ? 'Creating upscale...' : isPendingUpscale ? 'Upscaling in process' : hasUpscaledVersion ? (showingUpscaled ? 'Upscaled version. Show original.' : 'Original version. Show upscaled.') : 'Upscale image'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Bottom Left Controls - Flip Horizontally */}
                    <div className="absolute bottom-4 left-4 flex items-center space-x-2 z-10">
                      {!isVideo && showImageEditTools && !readOnly && !isInpaintMode && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleFlip}
                              className="bg-black/50 hover:bg-black/70 text-white"
                            >
                              <FlipHorizontal className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">Flip horizontally</TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Bottom Right Controls - Star, Add to References */}
                    <div className="absolute bottom-4 right-4 flex items-center space-x-2 z-10">
                      {/* Star Button (hidden in readOnly and inpaint mode) */}
                      {!readOnly && !isInpaintMode && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={wrappedHandleToggleStar}
                          disabled={toggleStarMutation.isPending}
                          className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                        >
                          <Star className={`h-4 w-4 ${localStarred ? 'fill-current' : ''}`} />
                        </Button>
                      )}

                      {/* Add to References Button - Desktop Task Details View (hidden in readOnly and inpaint mode) */}
                      {!readOnly && !isVideo && selectedProjectId && !isInpaintMode && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleAddToReferences}
                              disabled={isAddingToReferences || addToReferencesSuccess}
                              className={`transition-colors ${
                                addToReferencesSuccess 
                                  ? 'bg-green-600/80 hover:bg-green-600 text-white' 
                                  : 'bg-black/50 hover:bg-black/70 text-white'
                              }`}
                            >
                              {isAddingToReferences ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : addToReferencesSuccess ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : (
                                <ImagePlus className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">
                            {isAddingToReferences ? 'Adding...' : addToReferencesSuccess ? 'Added!' : 'Add to references'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Top Right Controls - Save, Download */}
                    <div className="absolute top-4 right-4 flex items-center space-x-2 z-10">

                      {!isVideo && showImageEditTools && !readOnly && !isInpaintMode && (
                        <>
                          {hasChanges && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleSave(effectiveImageUrl)}
                                  disabled={isSaving}
                                  className="bg-green-600/80 hover:bg-green-600 text-white disabled:opacity-50"
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="z-[100001]">{isSaving ? 'Saving...' : 'Save changes'}</TooltipContent>
                            </Tooltip>
                          )}
                        </>
                      )}

                      {showDownload && !readOnly && !isInpaintMode && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload();
                          }}
                          className="bg-black/50 hover:bg-black/70 text-white"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Bottom Workflow Controls */}
                    {(onAddToShot || onDelete || onApplySettings) && !isInpaintMode && (
                      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 z-10">
                        <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
                          {/* Shot Selection and Add to Shot */}
                          {onAddToShot && allShots.length > 0 && !isVideo && (
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

                      {/* Delete */}
                      {onDelete && !isVideo && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleDelete}
                              disabled={isDeleting === media.id}
                              className="bg-red-600/80 hover:bg-red-600 text-white h-8 px-3"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">Delete image</TooltipContent>
                        </Tooltip>
                      )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Navigation Controls - Right Arrow */}
                  {showNavigation && !readOnly && onNext && hasNext && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onNext}
                      className="bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute right-4 top-1/2 -translate-y-1/2"
                    >
                      <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
                    </Button>
                  )}
                </div>

                {/* Task Details / Inpaint Panel - Right side (40% width) */}
                <div 
                  data-task-details-panel
                  className="bg-background border-l border-border overflow-y-auto"
                  style={{ width: '40%' }}
                >
                  {isInpaintMode ? (
                    // Inpaint Controls Panel - Always shown in sidebar when in inpaint mode
                    <div className="p-6 space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-light">Inpaint Settings</h2>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleExitInpaintMode}
                          className="hover:bg-accent"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Paint/Erase Toggle and Undo */}
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={isEraseMode ? "default" : "secondary"}
                              size="sm"
                              onClick={() => setIsEraseMode(!isEraseMode)}
                              className={cn(
                                "flex-1",
                                isEraseMode ? "bg-purple-600 hover:bg-purple-700" : ""
                              )}
                            >
                              <Eraser className="h-4 w-4 mr-2" />
                              {isEraseMode ? 'Remove Paint Mode' : 'Paint Mode'}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">
                            {isEraseMode ? 'Switch to paint mode' : 'Switch to remove paint mode'}
                          </TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleUndo}
                              disabled={brushStrokes.length === 0}
                            >
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">Undo last stroke</TooltipContent>
                        </Tooltip>
                      </div>

                      {/* Clear Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearMask}
                        disabled={brushStrokes.length === 0}
                        className="w-full"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear All Strokes
                      </Button>
                      
                      <div className="border-t border-border pt-4 space-y-4">
                        {/* Brush Size Slider */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Brush Size</label>
                            <span className="text-sm text-muted-foreground">{brushSize}px</span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={100}
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      
                        {/* Prompt Field */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Inpaint Prompt</label>
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
                        
                        {/* Generate Button */}
                        <Button
                          variant="default"
                          size="default"
                          onClick={handleGenerateInpaint}
                          disabled={brushStrokes.length === 0 || !inpaintPrompt.trim() || isGeneratingInpaint || inpaintGenerateSuccess}
                          className={cn(
                            "w-full",
                            inpaintGenerateSuccess && "bg-green-600 hover:bg-green-600"
                          )}
                        >
                          {isGeneratingInpaint ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : inpaintGenerateSuccess ? (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Success!
                            </>
                          ) : (
                            <>
                              <Paintbrush className="h-4 w-4 mr-2" />
                              Generate Inpaint
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : taskDetailsData ? (
                    <TaskDetailsPanel
                      task={taskDetailsData.task}
                      isLoading={taskDetailsData.isLoading}
                      error={taskDetailsData.error}
                      inputImages={taskDetailsData.inputImages}
                      taskId={taskDetailsData.taskId}
                      replaceImages={replaceImages}
                      onReplaceImagesChange={setReplaceImages}
                      onApplySettingsFromTask={taskDetailsData.onApplySettingsFromTask ? (taskId, replaceImages, inputImages) => {
                        taskDetailsData.onApplySettingsFromTask?.(taskId, replaceImages, inputImages);
                        onClose(); // Close lightbox after applying settings
                      } : undefined}
                      onClose={taskDetailsData.onClose || onClose}
                      className=""
                      generationName={generationName}
                      onGenerationNameChange={handleGenerationNameChange}
                      isEditingGenerationName={isEditingGenerationName}
                      onEditingGenerationNameChange={setIsEditingGenerationName}
                      basedOnSection={(() => {
                        console.log('[BasedOnDebug] Desktop render check - Based On section', {
                          hasSourceGeneration: !!sourceGeneration,
                          sourceGeneration: sourceGeneration ? {
                            id: sourceGeneration.id,
                            prompt: (sourceGeneration as any).prompt?.slice(0, 50)
                          } : null
                        });
                        
                        if (!sourceGeneration) return null;
                        
                        return (
                          <div className="space-y-3 mb-6">
                            <div className="border-t border-border p-4 space-y-2 bg-muted/20">
                              <h3 className="text-lg font-light">
                                Based on
                              </h3>
                              <button
                                onClick={() => {
                                  if (onNavigateToGeneration) {
                                    onNavigateToGeneration(sourceGeneration.id);
                                  } else {
                                    toast.info('Navigation requires parent support');
                                  }
                                }}
                                className="relative w-1/3 group overflow-hidden rounded border border-border hover:border-primary transition-colors aspect-square"
                              >
                                <img
                                  src={sourceGeneration.thumbUrl}
                                  alt="Source generation"
                                  className="w-full h-full object-cover rounded"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded" />
                                {(sourceGeneration as any).starred && (
                                  <div className="absolute top-1 right-1">
                                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                  </div>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
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
                                {paginatedDerived.map((derived) => (
                                  <button
                                    key={derived.id}
                                    onClick={() => {
                                      if (onNavigateToGeneration) {
                                        onNavigateToGeneration(derived.id);
                                      } else {
                                        console.log('[DerivedGeneration] Clicked:', derived.id);
                                        toast.info('Navigation requires parent support');
                                      }
                                    }}
                                    className="relative aspect-square group overflow-hidden rounded border border-border hover:border-primary transition-colors"
                                  >
                                    <img
                                      src={derived.thumbUrl}
                                      alt="Derived generation"
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                    {(derived as any).starred && (
                                      <div className="absolute top-1 right-1">
                                        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    />
                  ) : (
                    // Fallback: sidebar is open but no content (shouldn't happen in normal flow)
                    <div className="p-6 text-center text-muted-foreground">
                      <p className="text-sm">No details available</p>
                    </div>
                  )}
                </div>
              </div>
            ) : showTaskDetails && isMobile ? (
              // Mobile layout with task details - stacked
              <div className="w-full h-full flex flex-col bg-black/90">
                {/* Media section - Top (60% height) */}
                <div 
                  className="flex-1 flex items-center justify-center relative"
                  style={{ height: '60%' }}
                >
                  {/* Media Content - same as above but adapted for mobile */}
                  <div className="relative w-full h-full flex items-center justify-center">
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
                      <div className="relative">
                        <img 
                          src={effectiveImageUrl} 
                          alt="Media content"
                          className={`object-contain transition-opacity duration-300 ${
                            isFlippedHorizontally ? 'scale-x-[-1]' : ''
                          } ${
                            isSaving ? 'opacity-30' : 'opacity-100'
                          }`}
                          style={{ 
                            maxHeight: '50vh',
                            maxWidth: '95vw',
                            transform: isFlippedHorizontally ? 'scaleX(-1)' : 'none'
                          }}
                          onLoad={(e) => {
                            const img = e.target as HTMLImageElement;
                            setImageDimensions({
                              width: img.naturalWidth,
                              height: img.naturalHeight
                            });
                          }}
                        />
                        {isSaving && (
                          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50 backdrop-blur-sm">
                            <div className="text-center text-white bg-black/80 rounded-lg p-4 backdrop-blur-sm border border-white/20">
                              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-2"></div>
                              <p className="text-base font-medium">Saving flipped image...</p>
                              <p className="text-xs text-white/70 mt-1">Please wait</p>
                            </div>
                          </div>
                        )}
                        {/* Hidden canvas for image processing */}
                        <canvas 
                          ref={canvasRef}
                          className="hidden"
                        />
                      </div>
                    )}

                    {/* Mobile controls - same as existing mobile controls */}
                    <div className="absolute top-2 right-2 flex items-center space-x-1 z-10">
                      {!readOnly && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={wrappedHandleToggleStar}
                          disabled={toggleStarMutation.isPending}
                          className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                        >
                          <Star className={`h-4 w-4 ${localStarred ? 'fill-current' : ''}`} />
                        </Button>
                      )}

                      {/* Add to References Button - Mobile Task Details View (hidden in readOnly and inpaint mode) */}
                      {!readOnly && !isVideo && selectedProjectId && !isInpaintMode && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleAddToReferences}
                          disabled={isAddingToReferences || addToReferencesSuccess}
                          className={`transition-colors ${
                            addToReferencesSuccess 
                              ? 'bg-green-600/80 hover:bg-green-600 text-white' 
                              : 'bg-black/50 hover:bg-black/70 text-white'
                          }`}
                        >
                          {isAddingToReferences ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : addToReferencesSuccess ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <ImagePlus className="h-4 w-4" />
                          )}
                        </Button>
                      )}

                      {/* Upscale Button - Mobile Task Details View (hidden in readOnly, only shown in cloud mode) */}
                      {!readOnly && !isVideo && selectedProjectId && isCloudMode && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={hasUpscaledVersion ? handleToggleUpscaled : handleUpscale}
                                disabled={isUpscaling || isPendingUpscale}
                                className={cn(
                                  "transition-colors text-white",
                                  isPendingUpscale ? "bg-green-600/80 hover:bg-green-600" : "bg-black/50 hover:bg-black/70"
                                )}
                              >
                                {isUpscaling ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : isPendingUpscale ? (
                                  <CheckCircle className="h-4 w-4" />
                                ) : hasUpscaledVersion ? (
                                  showingUpscaled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />
                                ) : (
                                  <ArrowUpCircle className="h-4 w-4" />
                                )}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">
                            {isUpscaling ? 'Creating upscale...' : isPendingUpscale ? 'Upscaling in process' : hasUpscaledVersion ? (showingUpscaled ? 'Upscaled version. Show original.' : 'Original version. Show upscaled.') : 'Upscale image'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Mobile navigation */}
                    {showNavigation && !readOnly && onPrevious && hasPrevious && (
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={onPrevious}
                        className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </Button>
                    )}
                    
                    {showNavigation && !readOnly && onNext && hasNext && (
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={onNext}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Task Details Panel - Bottom (40% height) */}
                <div 
                  data-task-details-panel
                  className="bg-background border-t border-border overflow-y-auto"
                  style={{ height: '40%' }}
                >
                  {isInpaintMode ? (
                    // Inpaint Controls Panel - Mobile
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-light">Inpaint Settings</h2>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleExitInpaintMode}
                          className="hover:bg-accent"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Paint/Erase Toggle and Undo */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant={isEraseMode ? "default" : "secondary"}
                          size="sm"
                          onClick={() => setIsEraseMode(!isEraseMode)}
                          className={cn(
                            "flex-1",
                            isEraseMode ? "bg-purple-600 hover:bg-purple-700" : ""
                          )}
                        >
                          <Eraser className="h-3 w-3 mr-1" />
                          {isEraseMode ? 'Remove Paint Mode' : 'Paint Mode'}
                        </Button>
                        
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleUndo}
                          disabled={brushStrokes.length === 0}
                        >
                          <Undo2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Clear Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearMask}
                        disabled={brushStrokes.length === 0}
                        className="w-full"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear All
                      </Button>
                      
                      <div className="border-t border-border pt-3 space-y-3">
                        {/* Brush Size Slider - Mobile */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium">Brush Size</label>
                            <span className="text-xs text-muted-foreground">{brushSize}px</span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={100}
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      
                        {/* Prompt Field */}
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Inpaint Prompt</label>
                          <textarea
                            value={inpaintPrompt}
                            onChange={(e) => setInpaintPrompt(e.target.value)}
                            placeholder="Describe what to generate..."
                            className="w-full min-h-[60px] bg-background border border-input rounded-md px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
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
                        
                        {/* Generate Button */}
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleGenerateInpaint}
                          disabled={brushStrokes.length === 0 || !inpaintPrompt.trim() || isGeneratingInpaint || inpaintGenerateSuccess}
                          className={cn(
                            "w-full",
                            inpaintGenerateSuccess && "bg-green-600 hover:bg-green-600"
                          )}
                        >
                          {isGeneratingInpaint ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : inpaintGenerateSuccess ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-2" />
                              Success!
                            </>
                          ) : (
                            <>
                              <Paintbrush className="h-3 w-3 mr-2" />
                              Generate
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : taskDetailsData && (
                    <TaskDetailsPanel
                      task={taskDetailsData.task}
                      isLoading={taskDetailsData.isLoading}
                      error={taskDetailsData.error}
                      inputImages={taskDetailsData.inputImages}
                      taskId={taskDetailsData.taskId}
                      replaceImages={replaceImages}
                      onReplaceImagesChange={setReplaceImages}
                      onApplySettingsFromTask={taskDetailsData.onApplySettingsFromTask ? (taskId, replaceImages, inputImages) => {
                        taskDetailsData.onApplySettingsFromTask?.(taskId, replaceImages, inputImages);
                        onClose(); // Close lightbox after applying settings
                      } : undefined}
                      onClose={taskDetailsData.onClose || onClose}
                      className=""
                      generationName={generationName}
                      onGenerationNameChange={handleGenerationNameChange}
                      isEditingGenerationName={isEditingGenerationName}
                      onEditingGenerationNameChange={setIsEditingGenerationName}
                      basedOnSection={(() => {
                        console.log('[BasedOnDebug] Mobile render check - Based On section', {
                          hasSourceGeneration: !!sourceGeneration,
                          sourceGeneration: sourceGeneration ? {
                            id: sourceGeneration.id,
                            prompt: (sourceGeneration as any).prompt?.slice(0, 50)
                          } : null
                        });
                        
                        if (!sourceGeneration) return null;
                        
                        return (
                          <div className="space-y-3 mb-6">
                            <div className="border-t border-border p-3 space-y-2 bg-muted/20">
                              <h3 className="text-lg font-light">
                                Based on
                              </h3>
                              <button
                                onClick={() => {
                                  if (onNavigateToGeneration) {
                                    onNavigateToGeneration(sourceGeneration.id);
                                  } else {
                                    toast.info('Navigation requires parent support');
                                  }
                                }}
                                className="relative w-1/3 group overflow-hidden rounded border border-border hover:border-primary transition-colors aspect-square"
                              >
                                <img
                                  src={sourceGeneration.thumbUrl}
                                  alt="Source generation"
                                  className="w-full h-full object-cover rounded"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded" />
                                {(sourceGeneration as any).starred && (
                                  <div className="absolute top-0.5 right-0.5">
                                    <Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" />
                                  </div>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
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
                                {paginatedDerived.map((derived) => (
                                  <button
                                    key={derived.id}
                                    onClick={() => {
                                      if (onNavigateToGeneration) {
                                        onNavigateToGeneration(derived.id);
                                      } else {
                                        console.log('[DerivedGeneration] Clicked:', derived.id);
                                        toast.info('Navigation requires parent support');
                                      }
                                    }}
                                    className="relative aspect-square group overflow-hidden rounded border border-border hover:border-primary transition-colors"
                                  >
                                    <img
                                      src={derived.thumbUrl}
                                      alt="Derived generation"
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                    {(derived as any).starred && (
                                      <div className="absolute top-0.5 right-0.5">
                                        <Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" />
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    />
                  )}
                </div>
              </div>
            ) : (
              // Mobile/Tablet layout using new FlexContainer + MediaWrapper
              <FlexContainer onClick={onClose} className="bg-transparent">
                {/* Close Button - REMOVED */}

                {/* Media Container with Controls */}
                <MediaWrapper onClick={(e) => e.stopPropagation()}>
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
                    <div className="relative">
                      <img 
                        src={effectiveImageUrl} 
                        alt="Media content"
                        className={`max-w-full max-h-full object-contain transition-opacity duration-300 rounded ${
                          isFlippedHorizontally ? 'scale-x-[-1]' : ''
                        } ${
                          isSaving ? 'opacity-30' : 'opacity-100'
                        }`}
                        style={{ 
                          transform: isFlippedHorizontally ? 'scaleX(-1)' : 'none'
                        }}
                        onLoad={(e) => {
                          const img = e.target as HTMLImageElement;
                          setImageDimensions({
                            width: img.naturalWidth,
                            height: img.naturalHeight
                          });
                        }}
                      />
                      {isSaving && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50 backdrop-blur-sm rounded">
                          <div className="text-center text-white bg-black/80 rounded-lg p-4 backdrop-blur-sm border border-white/20">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-2"></div>
                            <p className="text-base font-medium">Saving flipped image...</p>
                            <p className="text-xs text-white/70 mt-1">Please wait</p>
                          </div>
                        </div>
                      )}
                      <canvas ref={canvasRef} className="hidden" />
                    </div>
                  )}

                  {/* Media Controls - Top Right */}
                  {!readOnly && (
                    <MediaControls
                      mediaId={media.id}
                      isVideo={isVideo}
                      shotImageEntryId={media.shotImageEntryId}
                      readOnly={readOnly}
                      showDownload={showDownload}
                      showImageEditTools={showImageEditTools}
                      showMagicEdit={showMagicEdit}
                      selectedProjectId={selectedProjectId}
                      isCloudMode={generationMethods.inCloud}
                            toolTypeOverride={toolTypeOverride}
                      imageDimensions={imageDimensions}
                      sourceUrlForTasks={effectiveImageUrl}
                      isInpaintMode={isInpaintMode}
                      localStarred={localStarred}
                      handleToggleStar={handleToggleStar}
                      isAddingToReferences={isAddingToReferences}
                      addToReferencesSuccess={addToReferencesSuccess}
                      handleAddToReferences={handleAddToReferences}
                      handleEnterInpaintMode={handleEnterInpaintMode}
                      isUpscaling={isUpscaling}
                      isPendingUpscale={isPendingUpscale}
                      hasUpscaledVersion={hasUpscaledVersion}
                      showingUpscaled={showingUpscaled}
                      handleUpscale={handleUpscale}
                      handleToggleUpscaled={handleToggleUpscaled}
                      hasChanges={hasChanges}
                      isSaving={isSaving}
                      handleFlip={handleFlip}
                      handleSave={() => handleSave(effectiveImageUrl)}
                      handleDownload={handleDownload}
                    />
                  )}

                  {/* Navigation Buttons */}
                  {showNavigation && !readOnly && (
                    <>
                      {onPrevious && hasPrevious && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onPrevious}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                  )}
                      {onNext && hasNext && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onNext}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  )}
                    </>
                  )}
                </MediaWrapper>

                {/* Workflow Controls - Below Media */}
                {!readOnly && (
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

                {/* Inpaint Controls */}
                {isInpaintMode && (
                  <div className="w-full" onClick={(e) => e.stopPropagation()}>
                    <InpaintControlsPanel
                      variant="mobile"
                      isEraseMode={isEraseMode}
                      brushStrokes={brushStrokes}
                      inpaintPrompt={inpaintPrompt}
                      inpaintNumGenerations={inpaintNumGenerations}
                      isGeneratingInpaint={isGeneratingInpaint}
                      onSetIsEraseMode={setIsEraseMode}
                      onUndo={handleUndo}
                      onClearMask={handleClearMask}
                      onSetInpaintPrompt={setInpaintPrompt}
                      onSetInpaintNumGenerations={setInpaintNumGenerations}
                      onGenerateInpaint={handleGenerateInpaint}
                      onExitInpaintMode={handleExitInpaintMode}
                    />
                </div>
              )}
              </FlexContainer>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Magic Edit Modal handled by MagicEditLauncher */}


    </TooltipProvider>
  );
};

export default MediaLightbox;

// Export types for re-export
export type { MediaLightboxProps, ShotOption }; 