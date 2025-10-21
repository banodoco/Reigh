import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, FlipHorizontal, Save, Download, Trash2, Settings, PlusCircle, CheckCircle, Star, ImagePlus, Loader2, ArrowUpCircle, Eye, EyeOff } from 'lucide-react';
import { GenerationRow, Shot } from '@/types/shots';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import ShotSelector from '@/shared/components/ShotSelector';
import { getDisplayUrl, cn } from '@/shared/lib/utils';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail } from '@/shared/lib/clientThumbnailGenerator';
import TaskDetailsPanel from '@/tools/travel-between-images/components/TaskDetailsPanel';
import { useToggleGenerationStar, useDerivedGenerations, useSourceGeneration } from '@/shared/hooks/useGenerations';
import MagicEditLauncher from '@/shared/components/MagicEditLauncher';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import { toast } from 'sonner';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useCreateShotWithImage } from '@/shared/hooks/useShots';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useProgressiveImage } from '@/shared/hooks/useProgressiveImage';
import { isProgressiveLoadingEnabled, getLightboxPrefetchCount } from '@/shared/settings/progressiveLoading';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { nanoid } from 'nanoid';
import { processStyleReferenceForAspectRatioString } from '@/shared/lib/styleReferenceProcessor';
import { resolveProjectResolution } from '@/shared/lib/taskCreation';
import { dataURLtoFile } from '@/shared/lib/utils';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { createImageUpscaleTask } from '@/shared/lib/tasks/imageUpscale';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

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
}) => {
  // [ShotNavDebug] Log received override props
  useEffect(() => {
    console.log('[ShotNavDebug] [MediaLightbox] Received props', {
      mediaId: media?.id,
      selectedShotId,
      positionedInSelectedShot,
      associatedWithoutPositionInSelectedShot,
      optimisticPositionedCount: optimisticPositionedIds?.size || 0,
      optimisticUnpositionedCount: optimisticUnpositionedIds?.size || 0,
      timestamp: Date.now()
    });
  }, [media?.id, selectedShotId, positionedInSelectedShot, associatedWithoutPositionInSelectedShot, optimisticPositionedIds, optimisticUnpositionedIds]);

  const [isFlippedHorizontally, setIsFlippedHorizontally] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Log what callback we received
  useEffect(() => {
    console.log('[ImageFlipDebug] MediaLightbox mounted/updated', {
      mediaId: media.id,
      hasOnImageSaved: !!onImageSaved,
      onImageSavedType: typeof onImageSaved,
      onImageSavedName: onImageSaved?.name,
      timestamp: Date.now()
    });
  }, [media.id, onImageSaved]);

  // Log flip state changes
  useEffect(() => {
    console.log('[ImageFlipDebug] Flip state changed', {
      mediaId: media.id,
      isFlippedHorizontally,
      hasChanges,
      isSaving,
      timestamp: Date.now()
    });
  }, [isFlippedHorizontally, hasChanges, isSaving, media.id]);
  const [replaceImages, setReplaceImages] = useState(true);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  
  // Shot creation state
  const [isCreatingShot, setIsCreatingShot] = useState(false);
  const [quickCreateSuccess, setQuickCreateSuccess] = useState<{
    isSuccessful: boolean;
    shotId: string | null;
    shotName: string | null;
  }>({ isSuccessful: false, shotId: null, shotName: null });
  
  // Hooks for atomic shot creation with image
  const { selectedProjectId } = useProject();
  const createShotWithImageMutation = useCreateShotWithImage();
  const { navigateToShot } = useShotNavigation();
  const queryClient = useQueryClient();
  
  // Hook for managing project image settings (references)
  const {
    settings: projectImageSettings,
    update: updateProjectImageSettings,
  } = useToolSettings<any>('project-image-settings', {
    projectId: selectedProjectId,
    enabled: !!selectedProjectId
  });
  
  // Get generation method settings to check if cloud mode is enabled
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudMode = generationMethods.inCloud;
  
  // State for adding to references
  const [isAddingToReferences, setIsAddingToReferences] = useState(false);
  const [addToReferencesSuccess, setAddToReferencesSuccess] = useState(false);
  
  // State for editing generation name (variant name)
  const [generationName, setGenerationName] = useState<string>((media as any).name || '');
  const [isEditingGenerationName, setIsEditingGenerationName] = useState(false);
  const [isUpdatingGenerationName, setIsUpdatingGenerationName] = useState(false);

  // State for upscale functionality
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [showingUpscaled, setShowingUpscaled] = useState(true); // Default to showing upscaled if available
  const hasUpscaledVersion = !!(media as any).upscaled_url;
  
  // State for inpainting functionality
  const [isInpaintMode, setIsInpaintMode] = useState(false);
  const [brushStrokes, setBrushStrokes] = useState<Array<{
    id: string;
    points: Array<{x: number, y: number}>;
    isErasing: boolean;
  }>>([]);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [inpaintNumGenerations, setInpaintNumGenerations] = useState(1);
  const [isGeneratingInpaint, setIsGeneratingInpaint] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{x: number, y: number}>>([]);
  
  // Refs for inpainting canvases
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  
  // Track pending upscale tasks using localStorage
  const [isPendingUpscale, setIsPendingUpscale] = useState(() => {
    try {
      const pending = localStorage.getItem(`upscale-pending-${media.id}`);
      console.log('[ImageUpscale] Initial pending state from localStorage:', {
        mediaId: media.id,
        pending,
        isPending: pending === 'true'
      });
      return pending === 'true';
    } catch {
      return false;
    }
  });

  // Log upscale state changes
  useEffect(() => {
    console.log('[ImageUpscale] State update:', {
      mediaId: media.id,
      hasUpscaledVersion,
      upscaledUrl: (media as any).upscaled_url,
      isPendingUpscale,
      isUpscaling,
      showingUpscaled,
      mediaKeys: Object.keys(media),
      timestamp: Date.now()
    });
  }, [media.id, hasUpscaledVersion, isPendingUpscale, isUpscaling, showingUpscaled, media]);

  // Fetch derived generations (generations based on this one)
  const { data: derivedGenerations, isLoading: isDerivedLoading } = useDerivedGenerations(media.id);
  const [derivedPage, setDerivedPage] = useState(1);
  const derivedPerPage = 6;
  const derivedTotalPages = derivedGenerations ? Math.ceil(derivedGenerations.length / derivedPerPage) : 0;
  const paginatedDerived = useMemo(() => {
    if (!derivedGenerations) {
      console.log('[BasedOnDebug] paginatedDerived: no derivedGenerations');
      return [];
    }
    const start = (derivedPage - 1) * derivedPerPage;
    const paginated = derivedGenerations.slice(start, start + derivedPerPage);
    console.log('[BasedOnDebug] paginatedDerived calculated', {
      derivedGenerationsCount: derivedGenerations.length,
      derivedPage,
      start,
      end: start + derivedPerPage,
      paginatedCount: paginated.length,
      paginatedItems: paginated.map(d => ({ id: d.id, hasThumbUrl: !!d.thumbUrl }))
    });
    return paginated;
  }, [derivedGenerations, derivedPage, derivedPerPage]);

  // Fetch source generation if this is based on another generation
  // Check if media.metadata contains based_on field (from generation params)
  const basedOnId = (media as any).based_on || (media.metadata as any)?.based_on;
  const { data: sourceGeneration, isLoading: isSourceLoading } = useSourceGeneration(basedOnId);

  // [BasedOnDebug] Log what we're fetching and what we got
  useEffect(() => {
    console.log('[BasedOnDebug] MediaLightbox lineage data check', {
      mediaId: media.id,
      mediaKeys: Object.keys(media),
      mediaObject: media,
      'media.based_on': (media as any).based_on,
      'media.metadata': media.metadata,
      'media.metadata?.based_on': (media.metadata as any)?.based_on,
      basedOnId,
      hasSourceGeneration: !!sourceGeneration,
      sourceGenerationId: sourceGeneration?.id,
      isSourceLoading,
      hasDerivedGenerations: !!derivedGenerations,
      derivedCount: derivedGenerations?.length || 0,
      isDerivedLoading,
      showTaskDetails,
      taskDetailsData: !!taskDetailsData,
      timestamp: Date.now()
    });
    
    // Extra check for derived generations
    if (derivedGenerations && derivedGenerations.length > 0) {
      console.log('[BasedOnDebug] DERIVED GENERATIONS ARE PRESENT!', {
        count: derivedGenerations.length,
        showTaskDetails,
        willSectionRender: showTaskDetails && derivedGenerations.length > 0,
        firstItem: derivedGenerations[0]
      });
    }
  }, [media.id, basedOnId, sourceGeneration, isSourceLoading, derivedGenerations, isDerivedLoading, showTaskDetails, media, taskDetailsData]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref for the dialog content so we can programmatically focus it, enabling keyboard shortcuts immediately
  const contentRef = useRef<HTMLDivElement>(null);
  
  const isMobile = useIsMobile();
  // Treat iPads/tablets as mobile for lightbox sizing even in "Request Desktop Website" mode
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
  
  // Short-lived global click shield to absorb iOS synthetic clicks after touchend
  const activateClickShield = useCallback(() => {
    try {
      const shield = document.createElement('div');
      shield.setAttribute('data-mobile-click-shield', 'true');
      shield.style.position = 'fixed';
      shield.style.top = '0';
      shield.style.left = '0';
      shield.style.right = '0';
      shield.style.bottom = '0';
      shield.style.background = 'transparent';
      shield.style.pointerEvents = 'all';
      shield.style.zIndex = '2147483647';
      (shield.style as any).touchAction = 'none';

      const block = (ev: Event) => {
        try { ev.preventDefault(); } catch {}
        try { ev.stopPropagation(); } catch {}
        try { (ev as any).stopImmediatePropagation?.(); } catch {}
      };

      shield.addEventListener('click', block, true);
      shield.addEventListener('pointerdown', block, true);
      shield.addEventListener('pointerup', block, true);
      shield.addEventListener('touchstart', block, { capture: true, passive: false } as any);
      shield.addEventListener('touchend', block, { capture: true, passive: false } as any);

      document.body.appendChild(shield);

      window.setTimeout(() => {
        try { shield.remove(); } catch {}
      }, 350);
    } catch {}
  }, []);

  const safeClose = useCallback(() => {
    activateClickShield();
    onClose();
  }, [activateClickShield, onClose]);
  
  // Global minimal outside-click interceptor (capture). Do not block inside interactions.
  useEffect(() => {
    let closedFromOutside = false;

    const intercept = (e: Event) => {
      // Ignore synthetic/programmatic events (e.g., programmatic clicks used for downloads)
      // so they don't trigger lightbox close logic.
      if (e.isTrusted === false) {
        return;
      }

      // Check if a higher z-index dialog is open (e.g., MagicEditModal on top of MediaLightbox)
      // If so, don't handle this click - let the higher dialog handle it
      const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
      const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
        const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
        // MediaLightbox uses z-[100000], MagicEditModal uses z-[100100]
        return zIndex > 100000;
      });

      if (hasHigherZIndexDialog) {
        return; // Let the higher dialog handle the click
      }

      const contentEl = contentRef.current;
      const target = e.target as Node | null;
      const path = (e as any).composedPath ? (e as any).composedPath() as any[] : undefined;
      const isInside = !!(contentEl && (path ? path.includes(contentEl) : (target && contentEl.contains(target))));


      // NEW: Ignore interactions inside any Radix dialog content to avoid closing
      // other dialogs like Magic Edit that appear above the lightbox.
      const pathNodes: any[] = path || [];
      const isInsideRadixDialog = pathNodes.some((n) => {
        try {
          return n instanceof Element && (n as Element).hasAttribute?.('data-radix-dialog-content');
        } catch {
          return false;
        }
      }) || (target instanceof Element && !!(target as Element).closest?.('[data-radix-dialog-content]'));

      // Also ignore interactions inside Radix Select, Popover, and DropdownMenu components
      const isInsideRadixPortal = pathNodes.some((n) => {
        try {
          return n instanceof Element && (
            (n as Element).hasAttribute?.('data-radix-select-content') ||
            (n as Element).hasAttribute?.('data-radix-select-viewport') ||
            (n as Element).hasAttribute?.('data-radix-select-item') ||
            (n as Element).hasAttribute?.('data-radix-popover-content') ||
            (n as Element).hasAttribute?.('data-radix-dropdown-menu-content')
          );
        } catch {
          return false;
        }
      }) || (target instanceof Element && !!(
        (target as Element).closest?.('[data-radix-select-content]') ||
        (target as Element).closest?.('[data-radix-select-viewport]') ||
        (target as Element).closest?.('[data-radix-select-item]') ||
        (target as Element).closest?.('[data-radix-popover-content]') ||
        (target as Element).closest?.('[data-radix-dropdown-menu-content]')
      ));

      if (isInsideRadixDialog || isInsideRadixPortal) {
        return; // allow dialog and portal interactions without closing lightbox
      }

      // Don't close if Select is open
      if (isSelectOpen) {
        return;
      }

      // Don't close if clicking on ShotSelector trigger or content (additional safety)
      if (target instanceof Element) {
        const shotSelectorTrigger = target.closest('[data-radix-select-trigger]');
        const shotSelectorContent = target.closest('[data-radix-select-content]');
        if (shotSelectorTrigger || shotSelectorContent) {
          return;
        }
      }

      // Allow all interactions inside the dialog content
      if (isInside) {
        return;
      }

      // Special handling for click events on BODY - these are often bubbled events
      // from elements that should not close the lightbox
      if (e.type === 'click' && target instanceof Element && target.tagName === 'BODY') {
        return;
      }

      if (typeof (e as any).stopImmediatePropagation === 'function') {
        (e as any).stopImmediatePropagation();
      }
      e.stopPropagation();
      try { e.preventDefault(); } catch {}

      if (!closedFromOutside) {
        closedFromOutside = true;
        safeClose();
      }
    };

    const options: AddEventListenerOptions = { capture: true, passive: false } as any;
    // Intercept multiple event types for better mobile protection
    document.addEventListener('pointerdown', intercept, options);
    document.addEventListener('touchstart', intercept, options);
    document.addEventListener('click', intercept, options);
    
    return () => {
      document.removeEventListener('pointerdown', intercept, options as any);
      document.removeEventListener('touchstart', intercept, options as any);
      document.removeEventListener('click', intercept, options as any);
    };
  }, [safeClose, isSelectOpen]);


  
  // Star functionality
  const toggleStarMutation = useToggleGenerationStar();

  // Local starred state to ensure UI reflects updates immediately even if parent data is stale
  const initialStarred = useMemo(() => {
    // Prefer explicit prop, fall back to media.starred if available
    console.log('[StarDebug:MediaLightbox] Calculating initialStarred', {
      mediaId: media.id,
      starredProp: starred,
      mediaStarred: (media as any).starred,
      mediaKeys: Object.keys(media),
      timestamp: Date.now()
    });
    
    if (typeof starred === 'boolean') {
      console.log('[StarDebug:MediaLightbox] Using starred prop:', starred);
      return starred;
    }
    // @ts-ignore – media may include starred even if not in type
    if (typeof (media as any).starred === 'boolean') {
      console.log('[StarDebug:MediaLightbox] Using media.starred:', (media as any).starred);
      return (media as any).starred;
    }
    console.log('[StarDebug:MediaLightbox] Defaulting to false');
    return false;
  }, [starred, media]);

  const [localStarred, setLocalStarred] = useState<boolean>(initialStarred);

  // Keep local state in sync when parent updates (e.g., after query refetch)
  useEffect(() => {
    console.log('[StarDebug:MediaLightbox] Syncing localStarred', {
      mediaId: media.id,
      oldLocalStarred: localStarred,
      newInitialStarred: initialStarred,
      willUpdate: localStarred !== initialStarred,
      timestamp: Date.now()
    });
    setLocalStarred(initialStarred);
  }, [initialStarred]);

  // Safety check - if media is undefined, return early to prevent crashes
  if (!media) {
    return null;
  }

  const isVideo = media.type === 'video' || media.type === 'video_travel_output' || media.location?.endsWith('.mp4');
  
  // Determine which image URL to show based on upscale state FIRST (before progressive loading)
  const upscaledUrl = (media as any).upscaled_url;
  const originalUrl = media.location || media.imageUrl;
  
  // If showing upscaled and upscaled version exists, use it; otherwise use original
  const effectiveImageUrl = (showingUpscaled && upscaledUrl) ? upscaledUrl : originalUrl;
  
  // Progressive loading for lightbox images - now uses effectiveImageUrl instead of hardcoded original
  const progressiveEnabled = isProgressiveLoadingEnabled();
  const { src: progressiveSrc, phase, isThumbShowing, isFullLoaded, error: progressiveError, retry: retryProgressive, ref: progressiveRef } = useProgressiveImage(
    progressiveEnabled && !isVideo ? media.thumbUrl : null,
    effectiveImageUrl, // 🚀 Now respects upscale toggle!
    {
      priority: true, // Lightbox images are always high priority
      lazy: false,
      enabled: progressiveEnabled && !isVideo,
      crossfadeMs: 250 // Slightly longer crossfade for lightbox
    }
  );
  
  // Use progressive src if available, otherwise fallback to effective display URL
  const displayUrl = progressiveEnabled && progressiveSrc ? progressiveSrc : getDisplayUrl(effectiveImageUrl);
  
  // For task creation (Magic Edit, etc.), always prefer upscaled URL if available
  const sourceUrlForTasks = upscaledUrl ? getDisplayUrl(upscaledUrl) : displayUrl;



  // This useEffect is no longer needed as the finally block in handleSave is more reliable.
  // useEffect(() => {
  //   if (isSaving) {
  //     setIsSaving(false);
  //   }
  // }, [displayUrl]);

  /**
   * Global key handler
   * --------------------------------------------------
   * We register a window-level keydown listener so that
   * arrow navigation still works even when an embedded
   * <video> element (which is focusable) steals keyboard
   * focus. Without this, users need to press an arrow
   * key twice: the first keystroke focuses the video and
   * is consumed by the browser, the second finally
   * reaches our onKeyDown handler. Capturing the event at
   * the window level avoids that issue entirely.
   * 
   * IMPORTANT: Don't handle keys if another dialog is open on top (e.g., MagicEditModal)
   */
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // Check if another dialog/modal is open on top by looking for higher z-index dialog overlays
      const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
      const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
        const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
        // MediaLightbox uses z-[100000], MagicEditModal uses z-[100100]
        return zIndex > 100000;
      });

      // Don't handle keys if a higher z-index dialog is open
      if (hasHigherZIndexDialog) {
        return;
      }

      if (e.key === 'ArrowLeft' && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [onNext, onPrevious, onClose]);

  const handleFlip = () => {
    const newFlipState = !isFlippedHorizontally;
    console.log('[ImageFlipDebug] handleFlip called', {
      mediaId: media.id,
      oldState: isFlippedHorizontally,
      newState: newFlipState,
      hasChanges: hasChanges,
      timestamp: Date.now()
    });
    setIsFlippedHorizontally(newFlipState);
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Capture the current image URL at save time to prevent it from changing during the async operation
    const sourceImageUrl = displayUrl;
    const flipStateAtSave = isFlippedHorizontally;
    
    console.log('[ImageFlipDebug] handleSave called', {
      mediaId: media.id,
      hasChanges,
      hasCanvasRef: !!canvasRef.current,
      isSaving,
      isFlippedHorizontally: flipStateAtSave,
      sourceImageUrl,
      mediaLocation: media.location,
      mediaImageUrl: media.imageUrl,
      timestamp: Date.now()
    });

    if (!hasChanges || !canvasRef.current || isSaving) {
      console.log('[ImageFlipDebug] handleSave early return', {
        reason: !hasChanges ? 'no changes' : !canvasRef.current ? 'no canvas' : 'already saving',
        hasChanges,
        hasCanvasRef: !!canvasRef.current,
        isSaving
      });
      return;
    }

    setIsSaving(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      console.log('[ImageFlipDebug] Canvas context obtained', {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height
      });

      // Create a promise that resolves with the blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          console.log('[ImageFlipDebug] Image loaded for canvas', {
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            flipStateAtSave,
            currentFlipState: isFlippedHorizontally
          });

          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.save();
          if (flipStateAtSave) {
            console.log('[ImageFlipDebug] Applying flip transform to canvas', {
              canvasWidth: canvas.width,
              flipStateAtSave
            });
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0);
          ctx.restore();
          
          canvas.toBlob(blob => {
            if (blob) {
              console.log('[ImageFlipDebug] Canvas to blob conversion successful', {
                blobSize: blob.size,
                blobType: blob.type
              });
              resolve(blob);
            } else {
              console.error('[ImageFlipDebug] Canvas to blob conversion failed');
              reject(new Error('Canvas to Blob conversion failed'));
            }
          }, 'image/png');
        };

        img.onerror = (err) => {
          console.error('[ImageFlipDebug] Image load error', err);
          reject(err);
        };

        console.log('[ImageFlipDebug] Loading image for canvas', { 
          src: sourceImageUrl,
          willApplyFlip: flipStateAtSave
        });
        img.src = sourceImageUrl;
      });

      if (onImageSaved) {
        // Convert Blob to File and upload so we return a persistent URL
        const fileName = `flipped_${media.id || 'image'}_${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        console.log('[ImageFlipDebug] Starting upload to storage', {
          fileName,
          fileSize: file.size,
          timestamp: Date.now()
        });

        // Upload to storage and get a public URL
        const uploadedUrl = await uploadImageToStorage(file);

        console.log('[ImageFlipDebug] Upload completed', {
          uploadedUrl,
          timestamp: Date.now()
        });

        // Don't reset flip state yet - keep showing flipped version during save
        // This will be reset when the lightbox closes

        console.log('[ImageFlipDebug] Calling onImageSaved callback', {
          uploadedUrl,
          createNew: false,
          hasCallback: !!onImageSaved,
          callbackType: typeof onImageSaved,
          callbackName: onImageSaved?.name,
          timestamp: Date.now()
        });

        // Await parent handler with the persistent URL - always replace original
        const result = await onImageSaved(uploadedUrl, false);
        
        console.log('[ImageFlipDebug] onImageSaved callback returned', {
          result,
          resultType: typeof result,
          timestamp: Date.now()
        });

        console.log('[ImageFlipDebug] onImageSaved callback completed, closing lightbox', {
          timestamp: Date.now()
        });

        // Close the lightbox on successful save
        onClose();
      } else {
        console.warn('[ImageFlipDebug] No onImageSaved callback provided');
      }
    } catch (error) {
      console.error('[ImageFlipDebug] Error during save process:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now()
      });
      toast.error('Failed to save image.');
    } finally {
      // This will now run after onImageSaved has completed
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    const downloadStartTime = Date.now();
    console.log('[PollingBreakageIssue] [MediaLightbox] Download started', {
      mediaId: media.id,
      displayUrl,
      isVideo,
      timestamp: downloadStartTime
    });

    try {
      // Add timeout to prevent hanging downloads
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[PollingBreakageIssue] [MediaLightbox] Download timeout, aborting', {
          mediaId: media.id,
          timeoutMs: 15000,
          timestamp: Date.now()
        });
        controller.abort();
      }, 15000); // 15 second timeout

      const response = await fetch(displayUrl, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadDuration = Date.now() - downloadStartTime;
      console.log('[PollingBreakageIssue] [MediaLightbox] Download blob received', {
        mediaId: media.id,
        blobSize: blob.size,
        durationMs: downloadDuration,
        timestamp: Date.now()
      });

      const url = URL.createObjectURL(blob);
      const filename = `media_${media.id}.${isVideo ? 'mp4' : 'png'}`;
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      
      // Programmatic click to trigger download
      link.click();

      // Keep link in DOM briefly to allow download to initiate
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 1500);
      
      // Delay object URL cleanup to avoid interrupting download (give browsers time)
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 10000);

      console.log('[PollingBreakageIssue] [MediaLightbox] Download completed successfully', {
        mediaId: media.id,
        totalDurationMs: Date.now() - downloadStartTime,
        timestamp: Date.now()
      });
      
    } catch (error: any) {
      const errorDuration = Date.now() - downloadStartTime;
      console.error('[PollingBreakageIssue] [MediaLightbox] Download failed', {
        mediaId: media.id,
        error: error.message,
        errorName: error.name,
        isAbortError: error.name === 'AbortError',
        durationMs: errorDuration,
        timestamp: Date.now()
      });

      if (error.name === 'AbortError') {
        toast.error('Download timed out. Please try again.');
        return; // Don't try fallback for timeout
      }

      // Minimal error logging for fallback
      console.error('Download failed, falling back to direct link:', error);
      
      // Fallback 1: direct link with download attribute
      try {
        const link = document.createElement('a');
        link.href = displayUrl;
        link.download = `media_${media.id}.${isVideo ? 'mp4' : 'png'}`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
        }, 1500);
      } catch {}

      // Fallback 2: window.open (some browsers block programmatic downloads)
      try {
        window.open(displayUrl, '_blank');
      } catch {}
    }
  };

  const isAlreadyPositionedInSelectedShot = useMemo(() => {
    if (!selectedShotId || !media.id) return false;

    // Prefer override from gallery source
    if (typeof positionedInSelectedShot === 'boolean') {
      return positionedInSelectedShot || !!optimisticPositionedIds?.has(media.id);
    }
    
    // Check optimistic state first
    if (optimisticPositionedIds?.has(media.id)) return true;
    
    // Check if this media is positioned in the selected shot
    // First check single shot association
    if ((media as any).shot_id === selectedShotId) {
      return (media as any).position !== null && (media as any).position !== undefined;
    }
    
    // Check multiple shot associations
    const allShotAssociations = (media as any).all_shot_associations;
    if (allShotAssociations && Array.isArray(allShotAssociations)) {
      const matchingAssociation = allShotAssociations.find(
        (assoc: any) => assoc.shot_id === selectedShotId
      );
      return matchingAssociation && 
             matchingAssociation.position !== null && 
             matchingAssociation.position !== undefined;
    }
    
    return false;
  }, [selectedShotId, media, optimisticPositionedIds, positionedInSelectedShot]);

  // [ShotNavDebug] Log computed positioned state
  useEffect(() => {
    console.log('[ShotNavDebug] [MediaLightbox] isAlreadyPositionedInSelectedShot computed', {
      mediaId: media?.id,
      selectedShotId,
      value: isAlreadyPositionedInSelectedShot,
      mediaShotId: (media as any)?.shot_id,
      mediaPosition: (media as any)?.position,
      optimisticHas: optimisticPositionedIds?.has(media?.id || ''),
      override: positionedInSelectedShot,
      timestamp: Date.now()
    });
  }, [isAlreadyPositionedInSelectedShot, media?.id, selectedShotId, optimisticPositionedIds, positionedInSelectedShot]);

  const handleAddToShot = async () => {
    if (!onAddToShot || !selectedShotId) return;
    
    console.log('[ShotNavDebug] [MediaLightbox] handleAddToShot click', {
      mediaId: media?.id,
      selectedShotId,
      isAlreadyPositionedInSelectedShot,
      hasOnNavigateToShot: !!onNavigateToShot,
      allShotsCount: allShots?.length,
      timestamp: Date.now()
    });

    // If already positioned in shot, navigate to the shot
    if (isAlreadyPositionedInSelectedShot) {
      const targetShotOption = allShots.find(s => s.id === selectedShotId);
      const minimalShot: Shot = {
        id: targetShotOption?.id || selectedShotId,
        name: targetShotOption?.name || 'Shot',
        images: [],
        position: 0,
      };
      console.log('[ShotNavDebug] [MediaLightbox] Navigating to shot (with position)', {
        minimalShot,
        usedFrom: targetShotOption ? 'fromList' : 'fallback',
        via: onNavigateToShot ? 'onNavigateToShot' : 'navigateToShot+onClose',
        timestamp: Date.now()
      });
      if (onNavigateToShot) {
        onNavigateToShot(minimalShot);
      } else {
        onClose();
        navigateToShot(minimalShot);
      }
      return;
    }
    
    console.log('[ShotNavDebug] [MediaLightbox] Calling onAddToShot', {
      mediaId: media?.id,
      imageUrl: (media?.imageUrl || '').slice(0, 120),
      thumbUrl: (media?.thumbUrl || '').slice(0, 120),
      timestamp: Date.now()
    });
    const success = await onAddToShot(media.id, media.imageUrl, media.thumbUrl);
    console.log('[ShotNavDebug] [MediaLightbox] onAddToShot result', { success, timestamp: Date.now() });
    if (success) {
      onShowTick?.(media.id);
      onOptimisticPositioned?.(media.id);
      console.log('[ShotNavDebug] [MediaLightbox] Positioned optimistic + tick applied', {
        mediaId: media?.id,
        timestamp: Date.now()
      });
    }
  };

  // Check if image is already associated with the selected shot WITHOUT position
  const isAlreadyAssociatedWithoutPosition = useMemo(() => {
    if (!selectedShotId || !media.id) return false;

    // Prefer override from gallery source
    if (typeof associatedWithoutPositionInSelectedShot === 'boolean') {
      return associatedWithoutPositionInSelectedShot || !!optimisticUnpositionedIds?.has(media.id);
    }
    
    // Check optimistic state first
    if (optimisticUnpositionedIds?.has(media.id)) return true;
    
    // Check if this media is associated with the selected shot without position
    // First check single shot association
    if ((media as any).shot_id === selectedShotId) {
      return (media as any).position === null || (media as any).position === undefined;
    }
    
    // Check multiple shot associations
    const allShotAssociations = (media as any).all_shot_associations;
    if (allShotAssociations && Array.isArray(allShotAssociations)) {
      const matchingAssociation = allShotAssociations.find(
        (assoc: any) => assoc.shot_id === selectedShotId
      );
      return matchingAssociation && 
             (matchingAssociation.position === null || matchingAssociation.position === undefined);
    }
    
    return false;
  }, [selectedShotId, media, optimisticUnpositionedIds, associatedWithoutPositionInSelectedShot]);

  // [ShotNavDebug] Log computed unpositioned state
  useEffect(() => {
    console.log('[ShotNavDebug] [MediaLightbox] isAlreadyAssociatedWithoutPosition computed', {
      mediaId: media?.id,
      selectedShotId,
      value: isAlreadyAssociatedWithoutPosition,
      mediaShotId: (media as any)?.shot_id,
      mediaPosition: (media as any)?.position,
      optimisticHas: optimisticUnpositionedIds?.has(media?.id || ''),
      override: associatedWithoutPositionInSelectedShot,
      timestamp: Date.now()
    });
  }, [isAlreadyAssociatedWithoutPosition, media?.id, selectedShotId, optimisticUnpositionedIds, associatedWithoutPositionInSelectedShot]);

  const handleAddToShotWithoutPosition = async () => {
    if (!onAddToShotWithoutPosition || !selectedShotId) return;

    console.log('[ShotNavDebug] [MediaLightbox] handleAddToShotWithoutPosition click', {
      mediaId: media?.id,
      selectedShotId,
      isAlreadyAssociatedWithoutPosition,
      hasOnNavigateToShot: !!onNavigateToShot,
      allShotsCount: allShots?.length,
      timestamp: Date.now()
    });
    
    // If already associated without position, navigate to the shot
    if (isAlreadyAssociatedWithoutPosition) {
      const targetShotOption = allShots.find(s => s.id === selectedShotId);
      const minimalShot: Shot = {
        id: targetShotOption?.id || selectedShotId,
        name: targetShotOption?.name || 'Shot',
        images: [],
        position: 0,
      };
      console.log('[ShotNavDebug] [MediaLightbox] Navigating to shot (without position)', {
        minimalShot,
        usedFrom: targetShotOption ? 'fromList' : 'fallback',
        via: onNavigateToShot ? 'onNavigateToShot' : 'navigateToShot+onClose',
        timestamp: Date.now()
      });
      if (onNavigateToShot) {
        onNavigateToShot(minimalShot);
      } else {
        onClose();
        navigateToShot(minimalShot);
      }
      return;
    }
    
    console.log('[ShotNavDebug] [MediaLightbox] Calling onAddToShotWithoutPosition', {
      mediaId: media?.id,
      imageUrl: (media?.imageUrl || '').slice(0, 120),
      thumbUrl: (media?.thumbUrl || '').slice(0, 120),
      timestamp: Date.now()
    });
    const success = await onAddToShotWithoutPosition(media.id, media.imageUrl, media.thumbUrl);
    console.log('[ShotNavDebug] [MediaLightbox] onAddToShotWithoutPosition result', { success, timestamp: Date.now() });
    if (success) {
      onShowSecondaryTick?.(media.id);
      onOptimisticUnpositioned?.(media.id);
      console.log('[ShotNavDebug] [MediaLightbox] Unpositioned optimistic + secondary tick applied', {
        mediaId: media?.id,
        timestamp: Date.now()
      });
    }
  };

  // Handle quick create and add shot
  const handleQuickCreateAndAdd = async () => {
    console.log('[VisitShotDebug] handleQuickCreateAndAdd called', {
      hasOnCreateShot: !!onCreateShot,
      hasSelectedProjectId: !!selectedProjectId,
      allShotsLength: allShots.length,
      mediaId: media.id
    });
    
    if (!selectedProjectId) {
      console.error('[VisitShotDebug] No project selected');
      return;
    }
    
    // Generate automatic shot name
    const shotCount = allShots.length;
    const newShotName = `Shot ${shotCount + 1}`;
    
    setIsCreatingShot(true);
    try {
      console.log('[VisitShotDebug] Creating shot WITH image using atomic operation:', {
        shotName: newShotName,
        projectId: selectedProjectId,
        generationId: media.id
      });
      
      // Use atomic database function to create shot and add image in one operation
      // This is the same approach as ImageGalleryItem
      const result = await createShotWithImageMutation.mutateAsync({
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: media.id
      });
      
      console.log('[VisitShotDebug] Atomic shot creation result:', result);
      
      // Set success state with real shot ID
      setQuickCreateSuccess({
        isSuccessful: true,
        shotId: result.shotId,
        shotName: result.shotName
      });
      
      // Clear success state after 5 seconds
      setTimeout(() => {
        setQuickCreateSuccess({ isSuccessful: false, shotId: null, shotName: null });
      }, 5000);
      
    } catch (error) {
      console.error('[VisitShotDebug] Error in atomic shot creation:', error);
      toast.error('Failed to create shot and add image');
    } finally {
      setIsCreatingShot(false);
    }
  };

  // Handle quick create success navigation
  const handleQuickCreateSuccess = () => {
    console.log('[VisitShotDebug] 2. MediaLightbox handleQuickCreateSuccess called', {
      quickCreateSuccess,
      hasOnNavigateToShot: !!onNavigateToShot,
      allShotsCount: allShots?.length || 0,
      timestamp: Date.now()
    });

    if (quickCreateSuccess.shotId && onNavigateToShot) {
      // Try to find the shot in the list first (we only have id/name here)
      const shotOption = allShots?.find(s => s.id === quickCreateSuccess.shotId);
      
      console.log('[VisitShotDebug] 3. MediaLightbox shot search result', {
        shotId: quickCreateSuccess.shotId,
        foundInList: !!shotOption,
        shotOption: shotOption ? { id: shotOption.id, name: shotOption.name } : null,
        allShots: allShots?.map(s => ({ id: s.id, name: s.name })) || []
      });

      if (shotOption) {
        // Build a minimal Shot object compatible with navigation
        const minimalShot: Shot = {
          id: shotOption.id,
          name: shotOption.name,
          images: [],
          position: 0,
        };
        console.log('[VisitShotDebug] 4a. MediaLightbox calling onNavigateToShot with found shot', minimalShot);
        onNavigateToShot(minimalShot);
      } else {
        // Fallback when shot not in list yet
        const minimalShot: Shot = {
          id: quickCreateSuccess.shotId,
          name: quickCreateSuccess.shotName || 'Shot',
          images: [],
          position: 0,
        };
        console.log('[VisitShotDebug] 4b. MediaLightbox calling onNavigateToShot with fallback shot', minimalShot);
        onNavigateToShot(minimalShot);
      }
    } else {
      console.log('[VisitShotDebug] 4c. MediaLightbox not navigating - missing requirements', {
        hasShotId: !!quickCreateSuccess.shotId,
        hasOnNavigateToShot: !!onNavigateToShot
      });
    }
    
    // Clear the success state
    console.log('[VisitShotDebug] 5. MediaLightbox clearing success state');
    setQuickCreateSuccess({ isSuccessful: false, shotId: null, shotName: null });
  };

  const handleDelete = () => {
    if (onDelete) {
      // Trigger the deletion in the parent component
      onDelete(media.id);

      // After requesting deletion, attempt to move the lightbox to another item
      if (onNext) {
        onNext();
      } else if (onPrevious) {
        onPrevious();
      } else {
        // Fallback: close the lightbox if no navigation callbacks are available
        onClose();
      }
    }
  };

  const handleApplySettings = () => {
    if (onApplySettings && media.metadata) {
      onApplySettings(media.metadata);
    }
  };

  // Handle updating generation name
  const handleGenerationNameChange = async (newName: string) => {
    setGenerationName(newName);
    
    // Debounce the actual save
    if (isUpdatingGenerationName) return;
    
    setIsUpdatingGenerationName(true);
    try {
      const { error } = await supabase
        .from('generations')
        .update({ name: newName || null })
        .eq('id', media.id);

      if (error) {
        console.error('[VariantName] Error updating generation name:', error);
        toast.error('Failed to update variant name');
        throw error;
      }

      console.log('[VariantName] Successfully updated generation name:', {
        generationId: media.id.substring(0, 8),
        newName: newName || '(cleared)'
      });

      // Invalidate relevant queries to update UI
      if (selectedProjectId) {
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId] });
      }
      
    } catch (error) {
      console.error('[VariantName] Failed to update generation name:', error);
    } finally {
      setIsUpdatingGenerationName(false);
    }
  };

  // Clear pending state when upscaled version becomes available
  useEffect(() => {
    console.log('[ImageUpscale] Checking if should clear pending state:', {
      hasUpscaledVersion,
      isPendingUpscale,
      upscaledUrl: (media as any).upscaled_url,
      shouldClear: hasUpscaledVersion && isPendingUpscale
    });
    
    if (hasUpscaledVersion && isPendingUpscale) {
      console.log('[ImageUpscale] ✅ Upscaled version now available, clearing pending state');
      setIsPendingUpscale(false);
      try {
        localStorage.removeItem(`upscale-pending-${media.id}`);
        console.log('[ImageUpscale] ✅ Successfully removed pending state from localStorage');
      } catch (e) {
        console.error('[ImageUpscale] ❌ Error removing pending state:', e);
      }
    } else {
      console.log('[ImageUpscale] Not clearing pending state because:', {
        reason: !hasUpscaledVersion ? 'no upscaled version yet' : 'not in pending state'
      });
    }
  }, [hasUpscaledVersion, isPendingUpscale, media.id, media]);

  // Handle upscale
  const handleUpscale = async () => {
    if (!selectedProjectId || isVideo) {
      toast.error('Cannot upscale videos');
      return;
    }

    setIsUpscaling(true);
    try {
      const imageUrl = media.location || media.imageUrl;
      if (!imageUrl) {
        throw new Error('No image URL available');
      }

      console.log('[ImageUpscale] Starting upscale for generation:', media.id);

      // Create upscale task
      await createImageUpscaleTask({
        project_id: selectedProjectId,
        image_url: imageUrl,
        generation_id: media.id,
      });

      console.log('[ImageUpscale] ✅ Upscale task created successfully');
      
      // Mark as pending in localStorage so it persists across component remounts
      setIsPendingUpscale(true);
      try {
        localStorage.setItem(`upscale-pending-${media.id}`, 'true');
        console.log('[ImageUpscale] ✅ Set pending state in localStorage:', {
          mediaId: media.id,
          key: `upscale-pending-${media.id}`
        });
      } catch (e) {
        console.error('[ImageUpscale] ❌ Error setting pending state:', e);
      }
      
    } catch (error) {
      console.error('[ImageUpscale] Error creating upscale task:', error);
      toast.error('Failed to create upscale task');
    } finally {
      setIsUpscaling(false);
    }
  };

  // Handle toggling between upscaled and original
  const handleToggleUpscaled = () => {
    setShowingUpscaled(!showingUpscaled);
  };

  // Load saved mask from localStorage when entering inpaint mode
  useEffect(() => {
    if (isInpaintMode) {
      try {
        const savedMask = localStorage.getItem(`inpaint-mask-${media.id}`);
        if (savedMask) {
          const parsed = JSON.parse(savedMask);
          setBrushStrokes(parsed.strokes || []);
          setInpaintPrompt(parsed.prompt || '');
          console.log('[Inpaint] Loaded saved mask from localStorage', {
            mediaId: media.id,
            strokeCount: parsed.strokes?.length || 0
          });
          
          // Redraw loaded strokes on next tick
          setTimeout(() => {
            redrawStrokes(parsed.strokes || []);
          }, 100);
        }
      } catch (e) {
        console.error('[Inpaint] Error loading saved mask:', e);
      }
    }
  }, [isInpaintMode, media.id]);

  // Save mask to localStorage when strokes or prompt change
  useEffect(() => {
    if (isInpaintMode && (brushStrokes.length > 0 || inpaintPrompt)) {
      try {
        localStorage.setItem(`inpaint-mask-${media.id}`, JSON.stringify({
          strokes: brushStrokes,
          prompt: inpaintPrompt,
          savedAt: Date.now()
        }));
      } catch (e) {
        console.error('[Inpaint] Error saving mask:', e);
      }
    }
  }, [brushStrokes, inpaintPrompt, isInpaintMode, media.id]);

  // Initialize canvas when entering inpaint mode
  useEffect(() => {
    if (isInpaintMode && displayCanvasRef.current && maskCanvasRef.current && imageContainerRef.current) {
      const container = imageContainerRef.current;
      const img = container.querySelector('img');
      
      if (img) {
        const rect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Set canvas size to match displayed image
        const canvas = displayCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        
        canvas.width = rect.width;
        canvas.height = rect.height;
        canvas.style.left = `${rect.left - containerRect.left}px`;
        canvas.style.top = `${rect.top - containerRect.top}px`;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        
        maskCanvas.width = rect.width;
        maskCanvas.height = rect.height;
        
        console.log('[Inpaint] Canvas initialized', {
          width: rect.width,
          height: rect.height
        });
      }
    }
  }, [isInpaintMode, displayUrl, imageDimensions]);

  // Redraw all strokes on canvas
  const redrawStrokes = useCallback((strokes: typeof brushStrokes) => {
    const canvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    
    if (!canvas || !maskCanvas) return;
    
    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    
    if (!ctx || !maskCtx) return;
    
    // Clear both canvases
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    
    // Redraw all strokes
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      
      // Draw on display canvas (semi-transparent red for paint, erase for erasing)
      ctx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
      ctx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
      ctx.lineWidth = stroke.isErasing ? 20 : 20;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      
      // Draw on mask canvas (always white for mask, erase for erasing)
      maskCtx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
      maskCtx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 1)';
      maskCtx.lineWidth = stroke.isErasing ? 20 : 20;
      maskCtx.lineCap = 'round';
      maskCtx.lineJoin = 'round';
      
      maskCtx.beginPath();
      maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      maskCtx.stroke();
    });
    
    console.log('[Inpaint] Redrawn strokes', { count: strokes.length });
  }, []);

  // Handle mouse/touch drawing
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInpaintMode) return;
    
    e.preventDefault();
    setIsDrawing(true);
    
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCurrentStroke([{ x, y }]);
  }, [isInpaintMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInpaintMode || !isDrawing) return;
    
    e.preventDefault();
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCurrentStroke(prev => [...prev, { x, y }]);
    
    // Draw current stroke on display canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.globalCompositeOperation = isEraseMode ? 'destination-out' : 'source-over';
    ctx.strokeStyle = isEraseMode ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (currentStroke.length > 0) {
      const lastPoint = currentStroke[currentStroke.length - 1];
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, [isInpaintMode, isDrawing, isEraseMode, currentStroke]);

  const handlePointerUp = useCallback(() => {
    if (!isInpaintMode || !isDrawing) return;
    
    setIsDrawing(false);
    
    if (currentStroke.length > 1) {
      const newStroke = {
        id: nanoid(),
        points: currentStroke,
        isErasing: isEraseMode
      };
      
      setBrushStrokes(prev => [...prev, newStroke]);
      console.log('[Inpaint] Stroke added', { strokeId: newStroke.id, pointCount: currentStroke.length });
    }
    
    setCurrentStroke([]);
  }, [isInpaintMode, isDrawing, currentStroke, isEraseMode]);

  // Undo last stroke
  const handleUndo = useCallback(() => {
    if (brushStrokes.length === 0) return;
    
    const newStrokes = brushStrokes.slice(0, -1);
    setBrushStrokes(newStrokes);
    redrawStrokes(newStrokes);
    
    console.log('[Inpaint] Undo stroke', { remainingCount: newStrokes.length });
  }, [brushStrokes, redrawStrokes]);

  // Clear all strokes
  const handleClearMask = useCallback(() => {
    setBrushStrokes([]);
    redrawStrokes([]);
    console.log('[Inpaint] Cleared all strokes');
  }, [redrawStrokes]);

  // Redraw when strokes change
  useEffect(() => {
    if (isInpaintMode) {
      redrawStrokes(brushStrokes);
    }
  }, [brushStrokes, isInpaintMode, redrawStrokes]);

  // Handle entering/exiting inpaint mode
  const handleEnterInpaintMode = useCallback(() => {
    setIsInpaintMode(true);
    console.log('[Inpaint] Entered inpaint mode');
  }, []);

  const handleExitInpaintMode = useCallback(() => {
    setIsInpaintMode(false);
    setBrushStrokes([]);
    setCurrentStroke([]);
    setIsDrawing(false);
    setIsEraseMode(false);
    setInpaintPrompt('');
    setInpaintNumGenerations(1);
    
    // Don't clear localStorage - keep for next time
    console.log('[Inpaint] Exited inpaint mode');
  }, []);

  // Generate inpaint
  const handleGenerateInpaint = useCallback(async () => {
    if (!selectedProjectId || isVideo || brushStrokes.length === 0 || !inpaintPrompt.trim()) {
      toast.error('Please paint on the image and enter a prompt');
      return;
    }

    setIsGeneratingInpaint(true);
    try {
      const canvas = displayCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      
      if (!canvas || !maskCanvas) {
        throw new Error('Canvas not initialized');
      }

      console.log('[Inpaint] Starting inpaint generation...', {
        mediaId: media.id,
        prompt: inpaintPrompt,
        numGenerations: inpaintNumGenerations,
        strokeCount: brushStrokes.length
      });

      // Create green mask image from mask canvas
      const maskImageData = maskCanvas.toDataURL('image/png');
      
      // Upload mask to storage
      const maskFile = await fetch(maskImageData)
        .then(res => res.blob())
        .then(blob => new File([blob], `inpaint_mask_${media.id}_${Date.now()}.png`, { type: 'image/png' }));
      
      const maskUrl = await uploadImageToStorage(maskFile);
      console.log('[Inpaint] Mask uploaded:', maskUrl);

      // Get source image URL (prefer upscaled if available)
      const sourceUrl = (media as any).upscaled_url || media.location || media.imageUrl;

      // Create inpaint task
      await createImageInpaintTask({
        project_id: selectedProjectId,
        image_url: sourceUrl,
        mask_url: maskUrl,
        prompt: inpaintPrompt,
        num_generations: inpaintNumGenerations,
        generation_id: media.id,
      });

      console.log('[Inpaint] ✅ Inpaint task created successfully');
      toast.success(`Inpaint task created! Generating ${inpaintNumGenerations} image(s)...`);
      
      // Exit inpaint mode
      handleExitInpaintMode();
      
    } catch (error) {
      console.error('[Inpaint] Error creating inpaint task:', error);
      toast.error('Failed to create inpaint task');
    } finally {
      setIsGeneratingInpaint(false);
    }
  }, [selectedProjectId, isVideo, brushStrokes, inpaintPrompt, inpaintNumGenerations, media, handleExitInpaintMode]);

  // Handle adding to references
  const handleAddToReferences = async () => {
    if (!selectedProjectId || isVideo) {
      toast.error('Cannot add videos to references');
      return;
    }

    setIsAddingToReferences(true);
    try {
      const imageUrl = media.location || media.imageUrl;
      if (!imageUrl) {
        throw new Error('No image URL available');
      }

      console.log('[AddToReferences] Starting to add image to references:', imageUrl);

      // Fetch the image as blob
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const blob = await response.blob();
      
      // Convert to File for processing
      const originalFile = new File([blob], `reference-${Date.now()}.png`, { type: 'image/png' });
      
      // Upload original image
      const originalUploadedUrl = await uploadImageToStorage(originalFile);
      
      // Generate and upload thumbnail for grid display
      console.log('[AddToReferences] Generating thumbnail for reference image...');
      let thumbnailUrl: string | null = null;
      try {
        const thumbnailResult = await generateClientThumbnail(originalFile, 300, 0.8);
        console.log('[AddToReferences] Thumbnail generated:', {
          width: thumbnailResult.thumbnailWidth,
          height: thumbnailResult.thumbnailHeight,
          size: thumbnailResult.thumbnailBlob.size
        });
        
        // Upload thumbnail to storage
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 10);
        const thumbnailFilename = `thumb_${timestamp}_${randomString}.jpg`;
        const thumbnailPath = `files/thumbnails/${thumbnailFilename}`;
        
        const { data: thumbnailUploadData, error: thumbnailUploadError } = await supabase.storage
          .from('image_uploads')
          .upload(thumbnailPath, thumbnailResult.thumbnailBlob, {
            contentType: 'image/jpeg',
            upsert: true
          });
        
        if (thumbnailUploadError) {
          console.error('[AddToReferences] Thumbnail upload error:', thumbnailUploadError);
          // Use original as fallback
          thumbnailUrl = originalUploadedUrl;
        } else {
          const { data: thumbnailUrlData } = supabase.storage
            .from('image_uploads')
            .getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbnailUrlData.publicUrl;
          console.log('[AddToReferences] Thumbnail uploaded successfully:', thumbnailUrl);
        }
      } catch (thumbnailError) {
        console.error('[AddToReferences] Error generating thumbnail:', thumbnailError);
        // Use original as fallback
        thumbnailUrl = originalUploadedUrl;
      }
      
      // Convert blob to data URL for processing
      const reader = new FileReader();
      const dataURL = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      // Process the image to match project aspect ratio
      let processedDataURL = dataURL;
      const { aspectRatio } = await resolveProjectResolution(selectedProjectId);
      console.log('[AddToReferences] Processing for aspect ratio:', aspectRatio);
      
      const processed = await processStyleReferenceForAspectRatioString(dataURL, aspectRatio);
      if (processed) {
        processedDataURL = processed;
      }
      
      // Convert processed data URL back to File for upload
      const processedFile = dataURLtoFile(processedDataURL, `reference-processed-${Date.now()}.png`);
      if (!processedFile) {
        throw new Error('Failed to convert processed image to file');
      }
      
      // Upload processed version
      const processedUploadedUrl = await uploadImageToStorage(processedFile);
      
      // Get existing references
      const references = projectImageSettings?.references || [];
      const selectedReferenceIdByShot = projectImageSettings?.selectedReferenceIdByShot || {};
      
      // Create new reference with 'style' mode by default
      const newReference = {
        id: nanoid(),
        name: `Reference ${references.length + 1}`,
        styleReferenceImage: processedUploadedUrl,
        styleReferenceImageOriginal: originalUploadedUrl,
        thumbnailUrl: thumbnailUrl,
        styleReferenceStrength: 1.1,
        subjectStrength: 0.0,
        subjectDescription: '',
        inThisScene: false,
        referenceMode: 'style',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log('[AddToReferences] Created new reference:', newReference);
      
      // Determine the effective shot ID (use 'none' for null shot)
      const effectiveShotId = selectedShotId || 'none';
      
      // Add to references array AND set as selected for current shot
      await updateProjectImageSettings('project', {
        references: [...references, newReference],
        selectedReferenceIdByShot: {
          ...selectedReferenceIdByShot,
          [effectiveShotId]: newReference.id
        }
      });
      
      console.log('[AddToReferences] Successfully added and selected reference for shot:', effectiveShotId);
      
      // Show success state
      setAddToReferencesSuccess(true);
      
      // Reset success state after 2 seconds
      setTimeout(() => {
        setAddToReferencesSuccess(false);
      }, 2000);
      
    } catch (error) {
      console.error('[AddToReferences] Error adding to references:', error);
      toast.error('Failed to add to references');
    } finally {
      setIsAddingToReferences(false);
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
              // Check if a higher z-index dialog is open - if so, don't block events
              const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
              const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
                const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
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
              
              // Only close if clicking directly on the overlay (background)
              if (e.target === e.currentTarget) {
                onClose();
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
              
              // Also block pointer up events to prevent accidental interactions
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
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
              showTaskDetails && !isMobile
                ? "left-0 top-0 w-full h-full" // Full screen layout for desktop with task details
                : isMobile 
                  ? "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full h-auto" // Mobile: full width
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
            
            {showTaskDetails && !isMobile ? (
              // Desktop layout with task details - side by side
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
                      className="bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute left-4 top-1/2 -translate-y-1/2"
                    >
                      <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
                    </Button>
                  )}

                  {/* Media Content */}
                  <div ref={imageContainerRef} className="relative max-w-full max-h-full flex items-center justify-center">
                    {isVideo ? (
                      <StyledVideoPlayer
                        src={displayUrl}
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
                          src={displayUrl} 
                          alt="Media content"
                          className={`object-contain transition-opacity duration-300 ${
                            isFlippedHorizontally ? 'scale-x-[-1]' : ''
                          } ${
                            isSaving ? 'opacity-30' : 'opacity-100'
                          }`}
                          style={{ 
                            maxHeight: '90vh',
                            maxWidth: '55vw',
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
                      </div>
                    )}

                    {/* Top Controls */}
                    <div className="absolute top-4 right-4 flex items-center space-x-2 z-10">
                      {/* Star Button (hidden in readOnly) */}
                      {!readOnly && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const newStarred = !localStarred;
                            console.log('[StarDebug:MediaLightbox] Star button clicked', {
                              mediaId: media.id,
                              oldLocalStarred: localStarred,
                              newStarred,
                              hasOnToggleStar: !!onToggleStar,
                              timestamp: Date.now()
                            });
                            
                            setLocalStarred(newStarred); // Optimistic UI update

                            if (onToggleStar) {
                              console.log('[StarDebug:MediaLightbox] Calling onToggleStar prop');
                              onToggleStar(media.id, newStarred);
                            } else {
                              console.log('[StarDebug:MediaLightbox] Calling toggleStarMutation');
                              toggleStarMutation.mutate({ id: media.id, starred: newStarred });
                            }
                          }}
                          disabled={toggleStarMutation.isPending}
                          className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                        >
                          <Star className={`h-4 w-4 ${localStarred ? 'fill-current' : ''}`} />
                        </Button>
                      )}

                      {/* Add to References Button - Desktop Task Details View (hidden in readOnly) */}
                      {!readOnly && !isVideo && selectedProjectId && (
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

                      {!isVideo && showMagicEdit && !readOnly && (
                        <MagicEditLauncher
                          imageUrl={sourceUrlForTasks}
                          imageDimensions={imageDimensions}
                          toolTypeOverride={toolTypeOverride}
                          zIndexOverride={100100}
                          shotGenerationId={media.shotImageEntryId}
                        />
                      )}

                      {!isVideo && showImageEditTools && !readOnly && (
                        <>
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

                          {hasChanges && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={handleSave}
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

                      {showDownload && !readOnly && (
                        <Tooltip>
                          <TooltipTrigger asChild>
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
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">Download {isVideo ? 'video' : 'image'}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Bottom Workflow Controls */}
                    {(onAddToShot || onDelete || onApplySettings) && (
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

                {/* Task Details Panel - Right side (40% width) */}
                <div 
                  data-task-details-panel
                  className="bg-background border-l border-border overflow-y-auto"
                  style={{ width: '40%' }}
                >
                  {taskDetailsData && (
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
                            prompt: sourceGeneration.prompt?.slice(0, 50)
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
                                {sourceGeneration.starred && (
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
                                    {derived.starred && (
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
                        src={displayUrl}
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
                          src={displayUrl} 
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
                          onClick={() => {
                            const newStarred = !localStarred;
                            setLocalStarred(newStarred);
                            if (onToggleStar) {
                              onToggleStar(media.id, newStarred);
                            } else {
                              toggleStarMutation.mutate({ id: media.id, starred: newStarred });
                            }
                          }}
                          disabled={toggleStarMutation.isPending}
                          className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                        >
                          <Star className={`h-4 w-4 ${localStarred ? 'fill-current' : ''}`} />
                        </Button>
                      )}

                      {/* Add to References Button - Mobile Task Details View (hidden in readOnly) */}
                      {!readOnly && !isVideo && selectedProjectId && (
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
                  {taskDetailsData && (
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
                            prompt: sourceGeneration.prompt?.slice(0, 50)
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
                                {sourceGeneration.starred && (
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
                                    {derived.starred && (
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
              // Original layout without task details
              <div 
                className="flex flex-col items-center justify-center w-full"
                style={{
                  maxHeight: '95vh'
                }}
              >
              <div 
                className="relative flex items-center justify-center w-full"
              >
              {/* Navigation Controls - Left Arrow */}
              {showNavigation && !readOnly && onPrevious && hasPrevious && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onPrevious}
                  className="hidden sm:flex bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute left-2 top-1/2 -translate-y-1/2"
                >
                  <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
                </Button>
              )}

              {/* Media Content */}
              <div className="relative flex items-center justify-center w-full max-w-[100vw] sm:max-w-[90vw] lg:max-w-[85vw]" style={{ maxHeight: '85vh' }}>
                {isVideo ? (
                  <StyledVideoPlayer
                    src={displayUrl}
                    poster={media.thumbUrl}
                    loop
                    muted
                    autoPlay
                    playsInline
                    preload="auto"
                    className="w-full shadow-wes border border-border/20"
                    style={{ maxHeight: 'calc(85vh - 2rem)', margin: '1rem 0' }}
                  />
                ) : (
                  <div className="relative">
                    <img 
                      src={displayUrl} 
                      alt="Media content"
                      className={`w-full h-full object-contain transition-opacity duration-300 ${
                        isFlippedHorizontally ? 'scale-x-[-1]' : ''
                      } ${
                        isSaving ? 'opacity-30' : 'opacity-100'
                      }`}
                      style={{ 
                        maxHeight: '85vh',
                        maxWidth: '95vw',
                        width: 'auto',
                        height: 'auto',
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
                  </div>
                )}

                {/* Top Controls */}
                <div className="absolute top-2 sm:top-4 right-2 sm:right-4 flex items-center space-x-1 sm:space-x-2 z-10">
                  {/* Star Button (hidden in readOnly) */}
                  {!readOnly && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const newStarred = !localStarred;
                        console.log('[StarDebug:MediaLightbox] Star button clicked', {
                          mediaId: media.id,
                          oldLocalStarred: localStarred,
                          newStarred,
                          hasOnToggleStar: !!onToggleStar,
                          timestamp: Date.now()
                        });
                        
                        setLocalStarred(newStarred); // Optimistic UI update

                        if (onToggleStar) {
                          console.log('[StarDebug:MediaLightbox] Calling onToggleStar prop');
                          onToggleStar(media.id, newStarred);
                        } else {
                          console.log('[StarDebug:MediaLightbox] Calling toggleStarMutation');
                          toggleStarMutation.mutate({ id: media.id, starred: newStarred });
                        }
                      }}
                      disabled={toggleStarMutation.isPending}
                      className="transition-colors bg-black/50 hover:bg-black/70 text-white"
                    >
                      <Star className={`h-4 w-4 ${localStarred ? 'fill-current' : ''}`} />
                    </Button>
                  )}

                  {/* Add to References Button - Regular View (hidden in readOnly) */}
                  {!readOnly && !isVideo && selectedProjectId && (
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

                  {/* Upscale Button - Regular View (hidden in readOnly, only shown in cloud mode) */}
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

                  {!isVideo && showMagicEdit && !readOnly && (
                    <MagicEditLauncher
                      imageUrl={sourceUrlForTasks}
                      imageDimensions={imageDimensions}
                      toolTypeOverride={toolTypeOverride}
                      zIndexOverride={100100}
                      shotGenerationId={media.shotImageEntryId}
                    />
                  )}

                  {!isVideo && showImageEditTools && !readOnly && (
                    <>
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

                      {hasChanges && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleSave}
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

                  {showDownload && !readOnly && (
                    <Tooltip>
                      <TooltipTrigger asChild>
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
                      </TooltipTrigger>
                      <TooltipContent className="z-[100001]">Download {isVideo ? 'video' : 'image'}</TooltipContent>
                    </Tooltip>
                  )}

                  <Button
                    variant="secondary"
                    size="sm"
                    onPointerDown={(e) => {
                      // Avoid bubbling to elements behind the dialog when it unmounts
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                    className="bg-black/50 hover:bg-black/70 text-white"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Bottom Workflow Controls */}
                {(onAddToShot || onDelete || onApplySettings) && (
                  <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-1 sm:space-x-2 z-10">
                    <div className="bg-black/80 backdrop-blur-sm rounded-lg p-1 sm:p-2 flex items-center space-x-1 sm:space-x-2">
                      {/* Shot Selection and Add to Shot */}
                      {onAddToShot && allShots.length > 0 && !isVideo && (
                        <>
                          <ShotSelector
                            value={selectedShotId || ''}
                            onValueChange={onShotChange || (() => {})}
                            shots={allShots}
                            placeholder="Select shot"
                            triggerClassName="w-24 sm:w-32 h-7 sm:h-8 bg-black/50 border-white/20 text-white text-xs"
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
                                className={`h-7 sm:h-8 px-2 sm:px-3 text-white ${
                                  isAlreadyPositionedInSelectedShot || showTickForImageId === media.id
                                    ? 'bg-green-600/80 hover:bg-green-600'
                                    : 'bg-blue-600/80 hover:bg-blue-600'
                                }`}
                              >
                                {isAlreadyPositionedInSelectedShot || showTickForImageId === media.id ? (
                                  <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                ) : (
                                  <PlusCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">
                            {isAlreadyPositionedInSelectedShot || showTickForImageId === media.id
                              ? 'Added with position. Jump to shot.'
                              : 'Add to shot'}
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
                              className="bg-purple-600/80 hover:bg-purple-600 text-white h-7 sm:h-8 px-2 sm:px-3"
                            >
                              <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
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
                              className="bg-red-600/80 hover:bg-red-600 text-white h-7 sm:h-8 px-2 sm:px-3"
                            >
                              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[100001]">Delete image</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile Navigation Controls */}
                <div className="sm:hidden">
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

              {/* Navigation Controls - Right Arrow (Desktop Only) */}
              {showNavigation && !readOnly && onNext && hasNext && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onNext}
                  className="hidden sm:flex bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10 sm:h-12 sm:w-12 absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
                </Button>
              )}
              </div>

              {/* Mobile Task Details Button for Videos - Below the video */}
              {isMobile && isVideo && onShowTaskDetails && (
                <div className="mt-4 flex justify-center relative z-40">
                  <Button
                    variant="secondary"
                    size="default"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[TaskToggle] MediaLightbox: Task Details button clicked', { hasOnShowTaskDetails: !!onShowTaskDetails, mediaId: media.id });
                      if (onShowTaskDetails) {
                        console.log('[TaskToggle] MediaLightbox: Calling onShowTaskDetails');
                        onShowTaskDetails();
                      } else {
                        console.error('[TaskToggle] MediaLightbox: No onShowTaskDetails callback provided');
                      }
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                    }}
                    className="bg-black/80 hover:bg-black/90 text-white backdrop-blur-sm relative z-50 pointer-events-auto"
                  >
                    Show Task Details
                  </Button>
                </div>
              )}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Magic Edit Modal handled by MagicEditLauncher */}


    </TooltipProvider>
  );
};

export default MediaLightbox; 