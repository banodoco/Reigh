import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, FlipHorizontal, Save, Download, Trash2, Settings, PlusCircle, CheckCircle, Star } from 'lucide-react';
import { GenerationRow, Shot } from '@/types/shots';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import ShotSelector from '@/shared/components/ShotSelector';
import { getDisplayUrl, cn } from '@/shared/lib/utils';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import SimpleVideoPlayer from '@/tools/travel-between-images/components/SimpleVideoPlayer';
import LightboxScrubVideo from '@/shared/components/LightboxScrubVideo';
import TaskDetailsPanel from '@/tools/travel-between-images/components/TaskDetailsPanel';
import { useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import MagicEditLauncher from '@/shared/components/MagicEditLauncher';
import { toast } from 'sonner';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useCreateShotWithImage } from '@/shared/hooks/useShots';
import { useProject } from '@/shared/contexts/ProjectContext';

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
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
  showMagicEdit?: boolean;
  videoPlayerComponent?: 'hover-scrub' | 'simple-player' | 'lightbox-scrub';
  // Navigation availability
  hasNext?: boolean;
  hasPrevious?: boolean;
  // Workflow-specific props
  allShots?: ShotOption[];
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: any) => void;
  showTickForImageId?: string | null;
  onShowTick?: (imageId: string) => void;
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
    onApplyTaskSettings?: (settings: any) => void;
    onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
    onClose?: () => void;
  };
  // Mobile video task details toggle
  onShowTaskDetails?: () => void;
  // Shot creation functionality
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  // Shot navigation functionality
  onNavigateToShot?: (shot: Shot) => void;
}

const MediaLightbox: React.FC<MediaLightboxProps> = ({ 
  media, 
  onClose, 
  onNext, 
  onPrevious, 
  onImageSaved,
  showNavigation = true,
  showImageEditTools = true,
  showDownload = true,
  showMagicEdit = false,
  videoPlayerComponent = 'lightbox-scrub',
  // Navigation availability
  hasNext = true,
  hasPrevious = true,
  // Workflow-specific props
  allShots = [],
  selectedShotId,
  onShotChange,
  onAddToShot,
  onDelete,
  isDeleting,
  onApplySettings,
  showTickForImageId,
  onShowTick,
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
}) => {
  const [isFlippedHorizontally, setIsFlippedHorizontally] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
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
  }, [safeClose]);


  
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
  const displayUrl = getDisplayUrl(media.location || media.imageUrl);



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
   */
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
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
    setIsFlippedHorizontally(!isFlippedHorizontally);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!hasChanges || !canvasRef.current || isSaving) return;

    setIsSaving(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Create a promise that resolves with the blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.save();
          if (isFlippedHorizontally) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0);
          ctx.restore();
          canvas.toBlob(blob => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas to Blob conversion failed'));
            }
          }, 'image/png');
        };

        img.onerror = (err) => {
          reject(err);
        };

        img.src = displayUrl;
      });

      if (onImageSaved) {
        const url = URL.createObjectURL(blob);
        
        // Reset state
        setIsFlippedHorizontally(false);
        setHasChanges(false);

        // Await parent handler
        await onImageSaved(url, true);

        // Close the lightbox on successful save
        onClose();
      }
    } catch (error) {
      console.error('Error saving image:', error);
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

  const handleAddToShot = async () => {
    if (!onAddToShot || !selectedShotId) return;
    
    const success = await onAddToShot(media.id, media.imageUrl, media.thumbUrl);
    if (success && onShowTick) {
      onShowTick(media.id);
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



  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && onPrevious) {
      onPrevious();
    } else if (e.key === 'ArrowRight' && onNext) {
      onNext();
    } else if (e.key === 'Escape') {
      onClose();
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
            className="fixed inset-0 z-[10000] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            onPointerDown={(e) => {
              // Completely block all pointer events from reaching underlying elements
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onClick={(e) => {
              // Only close if clicking directly on the overlay (background)
              if (e.target === e.currentTarget) {
                onClose();
              }
            }}
            onPointerUp={(e) => {
              // Also block pointer up events to prevent accidental interactions
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onTouchStart={(e) => {
              // Block touch events on mobile
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onTouchMove={(e) => {
              // Block touch move events on mobile
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onTouchEnd={(e) => {
              // Block touch end events on mobile and close lightbox
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                e.nativeEvent.stopImmediatePropagation();
              }
              onClose();
            }}
            onTouchCancel={(e) => {
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
              "fixed z-[10000]",
              // Disable animations on mobile to prevent blink during zoom/fade
              isMobile ? "" : "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "p-0 border-none bg-transparent shadow-none",
              showTaskDetails && !isMobile
                ? "left-0 top-0 w-full h-full" // Full screen layout for desktop with task details
                : isMobile 
                  ? "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-auto h-auto" // Mobile: no animations
                  : "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-auto h-auto data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
            )}
            onKeyDown={handleKeyDown}
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
                  {showNavigation && onPrevious && hasPrevious && (
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
                  <div className="relative max-w-full max-h-full flex items-center justify-center">
                    {isVideo ? (
                      videoPlayerComponent === 'simple-player' ? (
                        <div style={{ maxWidth: '55vw', maxHeight: '90vh' }}>
                          <SimpleVideoPlayer
                            src={displayUrl}
                            poster={media.thumbUrl}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : videoPlayerComponent === 'lightbox-scrub' ? (
                        <LightboxScrubVideo
                          src={displayUrl}
                          poster={media.thumbUrl}
                          className="object-contain"
                          style={{ maxWidth: '55vw', maxHeight: '90vh' }}
                        />
                      ) : (
                        <HoverScrubVideo
                          src={displayUrl}
                          poster={media.thumbUrl}
                          className="object-contain"
                          style={{ maxWidth: '55vw', maxHeight: '90vh' }}
                          disableScrubbing={true}
                        />
                      )
                    ) : (
                      <div className="relative">
                        {isSaving ? (
                          <div 
                            className="flex items-center justify-center bg-black/20 rounded-lg object-contain"
                            style={{ 
                              maxHeight: '90vh',
                              maxWidth: '55vw',
                              aspectRatio: imageDimensions ? `${imageDimensions.width}/${imageDimensions.height}` : '1',
                              minWidth: '300px',
                              minHeight: '300px'
                            }}
                          >
                            <div className="text-white text-center">
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                              <p>Saving image...</p>
                            </div>
                          </div>
                        ) : (
                          <img 
                            src={displayUrl} 
                            alt="Media content"
                            className={`object-contain ${
                              isFlippedHorizontally ? 'scale-x-[-1]' : ''
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
                      {/* Star Button */}
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

                      {!isVideo && showMagicEdit && (
                        <MagicEditLauncher
                          imageUrl={displayUrl}
                          imageDimensions={imageDimensions}
                        />
                      )}

                      {!isVideo && showImageEditTools && (
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
                            <TooltipContent>Flip horizontally</TooltipContent>
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
                              <TooltipContent>{isSaving ? 'Saving...' : 'Save changes'}</TooltipContent>
                            </Tooltip>
                          )}
                        </>
                      )}

                      {showDownload && (
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
                          <TooltipContent>Download {isVideo ? 'video' : 'image'}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Bottom Workflow Controls */}
                    {(onAddToShot || onDelete || onApplySettings) && (
                      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 z-10">
                        <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
                          {/* Shot Selection and Add to Shot */}
                          {onAddToShot && allShots.length > 0 && (
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
                                    className="bg-blue-600/80 hover:bg-blue-600 text-white h-8 px-3"
                                  >
                                    {showTickForImageId === media.id ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <PlusCircle className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Add to shot</TooltipContent>
                              </Tooltip>
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
                              <TooltipContent>Apply settings</TooltipContent>
                            </Tooltip>
                          )}

                          {/* Delete */}
                          {onDelete && (
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
                              <TooltipContent>Delete image</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Navigation Controls - Right Arrow */}
                  {showNavigation && onNext && hasNext && (
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
                  className="bg-background border-l border-border overflow-hidden"
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
                      onApplySettings={taskDetailsData.onApplyTaskSettings ? (settings) => {
                        taskDetailsData.onApplyTaskSettings?.(settings);
                        onClose(); // Close lightbox after applying settings
                      } : undefined}
                      onApplySettingsFromTask={taskDetailsData.onApplySettingsFromTask ? (taskId, replaceImages, inputImages) => {
                        taskDetailsData.onApplySettingsFromTask?.(taskId, replaceImages, inputImages);
                        onClose(); // Close lightbox after applying settings
                      } : undefined}
                      onClose={taskDetailsData.onClose || onClose}
                      className="h-full"
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
                      videoPlayerComponent === 'simple-player' ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <SimpleVideoPlayer
                            src={displayUrl}
                            poster={media.thumbUrl}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      ) : videoPlayerComponent === 'lightbox-scrub' ? (
                        <LightboxScrubVideo
                          src={displayUrl}
                          poster={media.thumbUrl}
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <HoverScrubVideo
                          src={displayUrl}
                          poster={media.thumbUrl}
                          className="max-w-full max-h-full object-contain"
                          disableScrubbing={true}
                        />
                      )
                    ) : (
                      <div className="relative">
                        {isSaving ? (
                          <div 
                            className="flex items-center justify-center bg-black/20 rounded-lg object-contain"
                            style={{ 
                              maxHeight: '50vh',
                              maxWidth: '95vw',
                              aspectRatio: imageDimensions ? `${imageDimensions.width}/${imageDimensions.height}` : '1',
                              minWidth: '200px',
                              minHeight: '200px'
                            }}
                          >
                            <div className="text-white text-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                              <p>Saving image...</p>
                            </div>
                          </div>
                        ) : (
                          <img 
                            src={displayUrl} 
                            alt="Media content"
                            className={`object-contain ${
                              isFlippedHorizontally ? 'scale-x-[-1]' : ''
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
                    </div>

                    {/* Mobile navigation */}
                    {showNavigation && onPrevious && hasPrevious && (
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={onPrevious}
                        className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </Button>
                    )}
                    
                    {showNavigation && onNext && hasNext && (
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
                  className="bg-background border-t border-border overflow-hidden"
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
                      onApplySettings={taskDetailsData.onApplyTaskSettings ? (settings) => {
                        taskDetailsData.onApplyTaskSettings?.(settings);
                        onClose(); // Close lightbox after applying settings
                      } : undefined}
                      onApplySettingsFromTask={taskDetailsData.onApplySettingsFromTask ? (taskId, replaceImages, inputImages) => {
                        taskDetailsData.onApplySettingsFromTask?.(taskId, replaceImages, inputImages);
                        onClose(); // Close lightbox after applying settings
                      } : undefined}
                      onClose={taskDetailsData.onClose || onClose}
                      className="h-full"
                    />
                  )}
                </div>
              </div>
            ) : (
              // Original layout without task details
              <div 
                className="flex flex-col items-center justify-center"
                style={{
                  maxHeight: '95vh',
                  maxWidth: '95vw',
                  width: 'auto'
                }}
              >
              <div 
                className="relative flex items-center justify-center"
              >
              {/* Navigation Controls - Left Arrow */}
              {showNavigation && onPrevious && hasPrevious && (
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
              <div className="relative">
                {isVideo ? (
                  videoPlayerComponent === 'simple-player' ? (
                    <div style={{ maxWidth: '95vw' }}>
                      <SimpleVideoPlayer
                        src={displayUrl}
                        poster={media.thumbUrl}
                        className="h-auto max-h-[85vh] sm:max-h-[85vh] object-contain"
                      />
                    </div>
                  ) : videoPlayerComponent === 'lightbox-scrub' ? (
                    <LightboxScrubVideo
                      src={displayUrl}
                      poster={media.thumbUrl}
                      className={cn(
                        'h-auto object-contain w-[95vw]',
                        // Keep full-viewport width on touch-like devices; allow responsive sm: rules on desktop
                        isTouchLikeDevice ? 'max-h-[85vh]' : 'max-h-[85vh] sm:max-h-[85vh]'
                      )}
                      style={{ maxWidth: '95vw' }}
                    />
                  ) : (
                    <HoverScrubVideo
                      src={displayUrl}
                      poster={media.thumbUrl}
                      className={cn(
                        'h-auto object-contain w-[95vw]',
                        isTouchLikeDevice ? 'max-h-[85vh]' : 'max-h-[85vh] sm:max-h-[85vh]'
                      )}
                      style={{ maxWidth: '95vw' }}
                      disableScrubbing={true}
                    />
                  )
                ) : (
                  <div className="relative">
                    {isSaving ? (
                      <div 
                        className="flex items-center justify-center bg-black/20 rounded-lg object-contain"
                        style={{ 
                          width: 'auto',
                          height: 'auto',
                          maxHeight: '85vh',
                          maxWidth: '95vw',
                          aspectRatio: imageDimensions ? `${imageDimensions.width}/${imageDimensions.height}` : '1',
                          minWidth: '300px',
                          minHeight: '300px'
                        }}
                      >
                        <div className="text-white text-center">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                          <p>Saving image...</p>
                        </div>
                      </div>
                    ) : (
                      <img 
                        src={displayUrl} 
                        alt="Media content"
                        className={`w-full h-full object-contain ${
                          isFlippedHorizontally ? 'scale-x-[-1]' : ''
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
                  {/* Star Button */}
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

                  {!isVideo && showMagicEdit && (
                    <MagicEditLauncher
                      imageUrl={displayUrl}
                      imageDimensions={imageDimensions}
                    />
                  )}

                  {!isVideo && showImageEditTools && (
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
                        <TooltipContent>Flip horizontally</TooltipContent>
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
                          <TooltipContent>{isSaving ? 'Saving...' : 'Save changes'}</TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}

                  {showDownload && (
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
                      <TooltipContent>Download {isVideo ? 'video' : 'image'}</TooltipContent>
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
                      {onAddToShot && allShots.length > 0 && (
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
                                className="bg-blue-600/80 hover:bg-blue-600 text-white h-7 sm:h-8 px-2 sm:px-3"
                              >
                                {showTickForImageId === media.id ? (
                                  <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                ) : (
                                  <PlusCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Add to shot</TooltipContent>
                          </Tooltip>
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
                          <TooltipContent>Apply settings</TooltipContent>
                        </Tooltip>
                      )}

                      {/* Delete */}
                      {onDelete && (
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
                          <TooltipContent>Delete image</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile Navigation Controls */}
                <div className="sm:hidden">
                  {showNavigation && onPrevious && hasPrevious && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onPrevious}
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-10 h-12 w-12"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                  )}
                  
                  {showNavigation && onNext && hasNext && (
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
              {showNavigation && onNext && hasNext && (
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