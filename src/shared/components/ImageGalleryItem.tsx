import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Trash2, Info, Settings, CheckCircle, AlertTriangle, Download, PlusCircle, Check, Star, Eye, Link, Plus, Pencil } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import ShotSelector from "@/shared/components/ShotSelector";
import { DraggableImage } from "@/shared/components/DraggableImage";
import { getDisplayUrl } from "@/shared/lib/utils";
import { isImageCached, setImageCacheStatus } from "@/shared/lib/imageCacheManager";
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';
import { TimeStamp } from "@/shared/components/TimeStamp";
import { useToast } from "@/shared/hooks/use-toast";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { GeneratedImageWithMetadata, DisplayableMetadata } from "./ImageGallery";
import SharedMetadataDetails from "./SharedMetadataDetails";
import { SharedTaskDetails } from "@/tools/travel-between-images/components/SharedTaskDetails";
import { log } from '@/shared/lib/logger';
import { cn } from "@/shared/lib/utils";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useAddImageToShot, useCreateShotWithImage } from "@/shared/hooks/useShots";
import { useProject } from "@/shared/contexts/ProjectContext";
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { parseRatio } from "@/shared/lib/aspectRatios";
import { useProgressiveImage } from "@/shared/hooks/useProgressiveImage";
import { isProgressiveLoadingEnabled } from "@/shared/settings/progressiveLoading";
import { useTaskFromUnifiedCache } from "@/shared/hooks/useUnifiedGenerations";
import { useTaskType } from "@/shared/hooks/useTaskType";
import { useGetTask } from "@/shared/hooks/useTasks";

interface ImageGalleryItemProps {
  image: GeneratedImageWithMetadata;
  index: number;
  isDeleting: boolean;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  onOpenLightbox: (image: GeneratedImageWithMetadata, autoEnterEditMode?: boolean) => void;
  onAddToLastShot: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToLastShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDownloadImage: (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => void;
  onToggleStar?: (id: string, starred: boolean) => void;
  selectedShotIdLocal: string;
  simplifiedShotOptions: { id: string; name: string }[];
  showTickForImageId: string | null;
  onShowTick: (imageId: string) => void;
  showTickForSecondaryImageId?: string | null;
  onShowSecondaryTick?: (imageId: string) => void;
  optimisticUnpositionedIds?: Set<string>;
  optimisticPositionedIds?: Set<string>;
  optimisticDeletedIds?: Set<string>;
  onOptimisticUnpositioned?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string) => void;
  addingToShotImageId: string | null;
  setAddingToShotImageId: (id: string | null) => void;
  addingToShotWithoutPositionImageId?: string | null;
  setAddingToShotWithoutPositionImageId?: (id: string | null) => void;
  downloadingImageId: string | null;
  isMobile: boolean;
  mobileActiveImageId: string | null;
  mobilePopoverOpenImageId: string | null;
  onMobileTap: (image: GeneratedImageWithMetadata) => void;
  setMobilePopoverOpenImageId: (id: string | null) => void;
  setSelectedShotIdLocal: (id: string) => void;
  setLastAffectedShotId: (id: string) => void;
  toggleStarMutation: any;
  // Progressive loading props
  shouldLoad?: boolean;
  isPriority?: boolean;
  isGalleryLoading?: boolean;
  // Shot creation props
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  currentViewingShotId?: string; // ID of the shot currently being viewed (hides navigation buttons)
  // Project dimensions
  projectAspectRatio?: string;
}

export const ImageGalleryItem: React.FC<ImageGalleryItemProps> = ({
  image,
  index,
  isDeleting,
  onDelete,
  onApplySettings,
  onOpenLightbox,
  onAddToLastShot,
  onAddToLastShotWithoutPosition,
  onDownloadImage,
  onToggleStar,
  selectedShotIdLocal,
  simplifiedShotOptions,
  showTickForImageId,
  onShowTick,
  showTickForSecondaryImageId,
  onShowSecondaryTick,
  optimisticUnpositionedIds,
  optimisticPositionedIds,
  optimisticDeletedIds,
  onOptimisticUnpositioned,
  onOptimisticPositioned,
  addingToShotImageId,
  setAddingToShotImageId,
  addingToShotWithoutPositionImageId,
  setAddingToShotWithoutPositionImageId,
  downloadingImageId,
  isMobile,
  mobileActiveImageId,
  mobilePopoverOpenImageId,
  onMobileTap,
  setMobilePopoverOpenImageId,
  setSelectedShotIdLocal,
  setLastAffectedShotId,
  toggleStarMutation,
  shouldLoad = true,
  isPriority = false,
  isGalleryLoading = false,
  onCreateShot,
  currentViewingShotId,
  projectAspectRatio,
}) => {
  // Local pending state to scope star button disabled to this item only
  const [isTogglingStar, setIsTogglingStar] = useState<boolean>(false);
  
  // Fetch task data for video tasks to show proper details
  // Try to get task ID from metadata first (more efficient), fallback to cache query
  const taskIdFromMetadata = (image.metadata as any)?.taskId;
  const { data: taskIdMapping } = useTaskFromUnifiedCache(image.id);
  const taskIdFromCache = typeof taskIdMapping?.taskId === 'string' ? taskIdMapping.taskId : null;
  const taskId: string | null = taskIdFromMetadata || taskIdFromCache;
  
  const { data: taskData } = useGetTask(taskId);
  
  // Only use the actual task type name (like 'wan_2_2_t2i'), not tool_type (like 'image-generation')
  // tool_type and task type name are different concepts - tool_type is a broader category
  const taskType = taskData?.taskType;
  const { data: taskTypeInfo } = useTaskType(taskType || null);
  
  // Determine if this should show video task details (SharedTaskDetails)
  // Check if content_type is 'video' from task_types table
  // Fallback: if no taskTypeInfo, check metadata.tool_type for legacy support
  const isVideoTask = taskTypeInfo?.content_type === 'video' || 
    (!taskTypeInfo && (image.metadata as any)?.tool_type === 'travel-between-images');
  
  // [VideoThumbnailRender] Debug if this component is rendering for videos
  React.useEffect(() => {
    if (image.isVideo && index < 3) {
      ,
        index,
        isVideo: image.isVideo,
        shouldLoad,
        timestamp: Date.now()
      });
    }
  }, []); // Only log on mount
  
  // Debug mobile state for first few items (reduced frequency)
  React.useEffect(() => {
    if (index < 3) {
      ,
        hasOnMobileTap: typeof onMobileTap === 'function',
        timestamp: Date.now()
      });
    }
  }, [isMobile, image.id]); // Only log when key props change
  const { toast } = useToast();
  const { selectedProjectId } = useProject();
  const addImageToShotMutation = useAddImageToShot();
  const createShotWithImageMutation = useCreateShotWithImage();
  const { navigateToShot } = useShotNavigation();
  const { lastAffectedShotId, setLastAffectedShotId: updateLastAffectedShotId } = useLastAffectedShot();
  // Progressive loading for thumbnail → full image transition
  // DISABLE progressive loading for videos - we want to show thumbnails, not load the full video file
  const progressiveEnabled = isProgressiveLoadingEnabled() && !image.isVideo;
  const { src: progressiveSrc, phase, isThumbShowing, isFullLoaded, error: progressiveError, retry: retryProgressive, ref: progressiveRef } = useProgressiveImage(
    progressiveEnabled ? image.thumbUrl : null,
    image.url,
    {
      priority: isPriority,
      lazy: !isPriority,
      enabled: progressiveEnabled, // Don't tie to shouldLoad - let the hook complete its transition
      crossfadeMs: 180
    }
  );
  
  // [ThumbToFullTransition] Log progressive loading state changes for first few items
  React.useEffect(() => {
    if (index < 3) {
      ,
        progressiveEnabled,
        phase,
        isThumbShowing,
        isFullLoaded,
        progressiveSrc: progressiveSrc?.substring(0, 50),
        thumbUrl: image.thumbUrl?.substring(0, 50),
        fullUrl: image.url?.substring(0, 50),
        isPriority,
        shouldLoad,
        timestamp: Date.now()
      });
    }
  }, [progressiveEnabled, phase, isThumbShowing, isFullLoaded, progressiveSrc, isPriority, shouldLoad, index, image.id, image.thumbUrl, image.url]);
  
  // Fallback to legacy behavior if progressive loading is disabled
  const displayUrl = useMemo(() => {
    // For videos, ALWAYS use the thumbnail, never the video file
    if (image.isVideo) {
      const videoDisplayUrl = getDisplayUrl(image.thumbUrl || image.url);
      
      if (index === 0) { // Only log the first video item in detail
        ,
          index,
          progressiveEnabled,
          usingThumbnail: !!image.thumbUrl,
          usingVideoFallback: !image.thumbUrl,
          // Show full URLs for verification
          fullThumbUrl: image.thumbUrl,
          fullVideoUrl: image.url,
          fullDisplayUrl: videoDisplayUrl,
          timestamp: Date.now()
        });
      }
      
      return videoDisplayUrl;
    }
    
    // For images, use progressive loading if enabled
    if (progressiveEnabled && progressiveSrc) {
      if (index < 3) {
        ,
          progressiveSrc: progressiveSrc?.substring(0, 50),
          phase,
          timestamp: Date.now()
        });
      }
      return progressiveSrc;
    }
    
    const fallbackUrl = getDisplayUrl(image.thumbUrl || image.url);
    if (index < 3 && progressiveEnabled) {
      :`, {
        imageId: image.id?.substring(0, 8),
        fallbackUrl: fallbackUrl?.substring(0, 50),
        phase,
        timestamp: Date.now()
      });
    }
    return fallbackUrl;
  }, [progressiveEnabled, progressiveSrc, image.thumbUrl, image.url, image.isVideo, image.id, index, phase]);
  // Track loading state for this specific image
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [imageRetryCount, setImageRetryCount] = useState<number>(0);
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  // State for CreateShotModal
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState<boolean>(false);
  const [isCreatingShot, setIsCreatingShot] = useState<boolean>(false);
  // State for quick create success
  const [quickCreateSuccess, setQuickCreateSuccess] = useState<{
    isSuccessful: boolean;
    shotId: string | null;
    shotName: string | null;
  }>({ isSuccessful: false, shotId: null, shotName: null });
  // Check if this image was already cached by the preloader using centralized function
  const isPreloadedAndCached = isImageCached(image);
  const [imageLoaded, setImageLoaded] = useState<boolean>(isPreloadedAndCached);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  
  // Track successful image load events
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setImageLoading(false);
    // Mark this image as cached in the centralized cache to avoid future skeletons
    try {
      setImageCacheStatus(image, true);
    } catch (_) {}
  }, [index, image.id, isPreloadedAndCached]);
  const MAX_RETRIES = 2;
  
  // Handle shot creation
  const handleCreateShot = async (shotName: string, files: File[]) => {
    if (!onCreateShot) return;
    
    setIsCreatingShot(true);
    try {
      await onCreateShot(shotName, files);
      setIsCreateShotModalOpen(false);
    } catch (error) {
      console.error("Error creating shot:", error);
      toast({ 
        title: "Error Creating Shot", 
        description: "Failed to create the shot. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsCreatingShot(false);
    }
  };

  // Handle quick create and add using atomic database function
  const handleQuickCreateAndAdd = async () => {
    if (!selectedProjectId) return;
    
    // Generate automatic shot name
    const shotCount = simplifiedShotOptions.length;
    const newShotName = `Shot ${shotCount + 1}`;
    
    setAddingToShotImageId(image.id);
    try {
      // Use the atomic database function to create shot and add image in one operation
      const result = await createShotWithImageMutation.mutateAsync({
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: image.id
      });
      
      // Set the newly created shot as the last affected shot
      updateLastAffectedShotId(result.shotId);
      
      // Set success state immediately and let the mutation's onSuccess handle the data refresh
      // The mutation should have triggered query invalidation, so the shot will be available soon
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
      console.error('[QuickCreate] Error in atomic operation:', error);
      toast({ 
        title: "Error", 
        description: "Failed to create shot and add image. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setAddingToShotImageId(null);
    }
  };
  
  // Track previous image ID to detect actual changes vs re-renders
  // Create a stable identifier for the image
  // Include URL (and optional updatedAt) so identifier changes when the image asset changes
  const imageIdentifier = `${image.id}:${image.url || ''}:${image.thumbUrl || ''}:${(image as any).updatedAt || ''}`;
  const prevImageIdentifierRef = useRef<string>(imageIdentifier);

  // Handle image load error with retry mechanism
  const handleImageError = useCallback((errorEvent?: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => {
    const failedSrc = (errorEvent?.target as HTMLImageElement | HTMLVideoElement)?.src || displayUrl;
    console.warn(`[ImageGalleryItem] Image load failed for ${image.id}: ${failedSrc}, retry ${imageRetryCount + 1}/${MAX_RETRIES}`);
    
    // Always reset loading state on error
    setImageLoading(false);
    
    // Don't retry placeholder URLs or obviously invalid URLs
    if (failedSrc?.includes('/placeholder.svg') || failedSrc?.includes('undefined') || !failedSrc) {
      console.warn(`[ImageGalleryItem] Not retrying invalid URL: ${failedSrc}`);
      setImageLoadError(true);
      return;
    }
    
    if (imageRetryCount < MAX_RETRIES) {
      }ms...`);
      // Auto-retry with cache busting after a delay
      setTimeout(() => {
        setImageRetryCount(prev => prev + 1);
        // Force reload by clearing and resetting the src
        setActualSrc(null);
        setTimeout(() => {
          const retryUrl = getDisplayUrl(image.thumbUrl || image.url, true); // Force cache bust
          setActualSrc(retryUrl);
        }, 100);
      }, 1000 * (imageRetryCount + 1)); // Exponential backoff
    } else {
      console.warn(`[ImageGalleryItem] Max retries exceeded for ${image.id}, showing error state`);
      setImageLoadError(true);
    }
  }, [displayUrl, image.id, imageRetryCount, image.thumbUrl, image.url]);

  // Reset error state when URL changes (new image)
  useEffect(() => {
    // Log if image.id is undefined
    if (index < 3 && !image.id) {
      console.warn(`[ImageGalleryItem-${index}] Image has no ID!`, image);
    }
    
    // Check if this is actually a new image
    if (prevImageIdentifierRef.current === imageIdentifier) {
      return; // Same image ID, don't reset
    }
    
    if (index < 3) {
      }
    
    // [VideoThumbnailLoop] Debug what's causing the reset loop
    if (image.isVideo && index === 0) {
      ,
        prevIdentifier: prevImageIdentifierRef.current,
        newIdentifier: imageIdentifier,
        url: image.url?.substring(0, 50) + '...',
        thumbUrl: image.thumbUrl?.substring(0, 50) + '...',
        timestamp: Date.now()
      });
    }
    
    // Update the ref AFTER logging
    prevImageIdentifierRef.current = imageIdentifier;
    
    setImageLoadError(false);
    setImageRetryCount(0);
    // Check if the new image is already cached using centralized function
    const isNewImageCached = isImageCached(image);
    setImageLoaded(isNewImageCached);
    // Only set loading to false if not cached (if cached, we never start loading)
    if (!isNewImageCached) {
      setImageLoading(false);
    }
    // CRITICAL: Reset actualSrc so the loading effect can run for the new image
    setActualSrc(null);
  }, [imageIdentifier]); // Only reset when image ID changes

  // Progressive loading: only set src when shouldLoad is true
  const [actualSrc, setActualSrc] = useState<string | null>(null);
  
  // [VideoThumbnailActualSrc] Debug actualSrc changes for videos
  React.useEffect(() => {
    if (image.isVideo && index === 0) {
      ,
        actualSrc: actualSrc?.substring(0, 50) + '...' || 'NULL',
        actualSrcExists: !!actualSrc,
        timestamp: Date.now(),
        stack: new Error().stack?.split('\n')[1] // Show where this was called from
      });
    }
  }, [actualSrc, image.isVideo, image.id, index]);
  
  // [VideoThumbnailIssue] Debug shouldLoad for videos
  React.useEffect(() => {
    if (image.isVideo && index === 0) {
      ,
        shouldLoad,
        actualSrc: !!actualSrc,
        displayUrl: displayUrl?.substring(0, 50) + '...',
        imageLoading,
        imageLoadError,
        timestamp: Date.now()
      });
    }
  }, [shouldLoad, actualSrc, image.isVideo, image.id, index, displayUrl, imageLoading, imageLoadError]);

  // Generate display URL with retry cache busting
  const actualDisplayUrl = useMemo(() => {
    if (imageRetryCount > 0) {
      return getDisplayUrl(image.thumbUrl || image.url, true); // Force refresh with cache busting
    }
    return displayUrl;
  }, [displayUrl, image.thumbUrl, image.url, imageRetryCount]);

  // Simplified loading system - responds to progressive loading and URL changes
  useEffect(() => {
    // Generate unique load ID for tracking this specific image load
    const loadId = `load-${image.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const isPreloaded = isImageCached(image);
    
    if (index < 3) {
      ,
        shouldLoad,
        actualSrc: actualSrc?.substring(0, 50),
        actualDisplayUrl: actualDisplayUrl?.substring(0, 50),
        willUpdate: actualDisplayUrl !== actualSrc && shouldLoad,
        timestamp: Date.now()
      });
    }
    
    // Update actualSrc when displayUrl changes (for progressive loading transitions)
    // OR when shouldLoad becomes true for the first time
    if (shouldLoad && actualDisplayUrl) {
      // Don't load placeholder URLs - they indicate missing/invalid image data
      if (actualDisplayUrl === '/placeholder.svg') {
        setImageLoadError(true);
        return;
      }
      
      // Update actualSrc if it's different from actualDisplayUrl
      // This handles both initial load AND progressive thumbnail→full transitions
      if (actualSrc !== actualDisplayUrl) {
        if (index < 3) {
          ,
            from: actualSrc?.substring(0, 50),
            to: actualDisplayUrl?.substring(0, 50),
            timestamp: Date.now()
          });
        }
        
        // Only set loading if the image isn't already cached/loaded
        if (!isPreloaded && !actualSrc) {
          setImageLoading(true);
        }
        
        setActualSrc(actualDisplayUrl);
      }
    }
  }, [actualSrc, actualDisplayUrl, shouldLoad, image.id, index, isImageCached]);

  // Check if we should show metadata details (only when tooltip/popover is open for performance)
  const shouldShowMetadata = useMemo(() => {
    if (!image.metadata) return false;
    
    // On mobile, only show when popover is open; on desktop, only when tooltip might be shown
    return isMobile 
      ? (mobilePopoverOpenImageId === image.id)
      : isInfoOpen;
  }, [image.metadata, isMobile, mobilePopoverOpenImageId, image.id, isInfoOpen]);
  const isCurrentDeleting = isDeleting;
  const imageKey = image.id || `image-${actualDisplayUrl}-${index}`;

  // Determine if it's a video ONLY if the display URL points to a video file
  // Thumbnails for videos are images (png/jpg) and must be treated as images here
  const urlIsVideo = Boolean(
    actualDisplayUrl && (
      actualDisplayUrl.toLowerCase().endsWith('.webm') ||
      actualDisplayUrl.toLowerCase().endsWith('.mp4') ||
      actualDisplayUrl.toLowerCase().endsWith('.mov')
    )
  );
  // If the display URL is not a video file, force image rendering even if image.isVideo is true
  const isActuallyVideo = urlIsVideo;
  // Content type: whether this item represents a video generation at all
  const isVideoContent = useMemo(() => {
    if (typeof image.isVideo === 'boolean') return image.isVideo;
    const url = image.url || '';
    const lower = url.toLowerCase();
    return lower.endsWith('.webm') || lower.endsWith('.mp4') || lower.endsWith('.mov');
  }, [image.isVideo, image.url]);

  // Check if we have a real image thumbnail (not a video file)
  const hasThumbnailImage = useMemo(() => {
    const thumb = image.thumbUrl || '';
    if (!thumb) return false;
    const lower = thumb.toLowerCase();
    // Treat as image only if not a video extension
    const isVideoExt = lower.endsWith('.webm') || lower.endsWith('.mp4') || lower.endsWith('.mov');
    return !isVideoExt;
  }, [image.thumbUrl]);

  // Hover-to-play support for videos that show a thumbnail first
  const [isHovering, setIsHovering] = useState(false);
  const hoverVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoUrl = useMemo(() => (isVideoContent ? (image.url || null) : null), [isVideoContent, image.url]);
  const [videoReady, setVideoReady] = useState(false);
  useEffect(() => {
    setVideoReady(false);
    if (index < 3 && isVideoContent) {
      ,
        videoUrl: videoUrl?.substring(0, 50) + '...',
        isVideoContent,
        hasThumbnailImage,
        timestamp: Date.now()
      });
    }
  }, [videoUrl, index, isVideoContent, hasThumbnailImage, image.id]);
  const visibleVideoRef = useRef<HTMLVideoElement | null>(null);
  const safePause = useCallback((videoEl: HTMLVideoElement | null, label: string) => {
    if (!videoEl) return;
    try {
      videoEl.pause();
      videoEl.currentTime = 0;
      if (index < 3 && isVideoContent) {
        }
    } catch (error) {
      if (index < 3 && isVideoContent) {
        console.warn(`[VideoHover] Failed to pause ${label} for item ${index}:`, error);
      }
    }
  }, [index, isVideoContent]);
  useEffect(() => {
    const videoEl = visibleVideoRef.current;
    if (!videoEl) return;
    
    if (index < 3 && isVideoContent) {
      ,
        isHovering,
        videoReady,
        hasThumbnailImage,
        videoElExists: !!videoEl,
        videoSrc: videoEl.src?.substring(0, 50) + '...' || 'none',
        timestamp: Date.now()
      });
    }
    
    if (isHovering && videoReady) {
      if (index < 3 && isVideoContent) {
        ,
          videoSrc: videoEl.src?.substring(0, 50) + '...',
          timestamp: Date.now()
        });
      }
      videoEl.play().catch((error) => {
        if (index < 3 && isVideoContent) {
          console.warn(`[VideoHover] Play failed for item ${index}:`, {
            imageId: image.id?.substring(0, 8),
            error: error.message,
            timestamp: Date.now()
          });
        }
      });
    } else {
      if (index < 3 && isVideoContent) {
        ,
          reason: !isHovering ? 'not hovering' : 'not ready',
          timestamp: Date.now()
        });
      }
      safePause(videoEl, 'visible video (effect)');
    }
  }, [isHovering, videoReady, index, isVideoContent, image.id, safePause]);

  // Pause videos on visibility change (tab change or route transitions causing hidden state)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        safePause(visibleVideoRef.current, 'visible video (visibility)');
        safePause(hoverVideoRef.current, 'hidden video (visibility)');
        if (isHovering) setIsHovering(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [safePause, isHovering]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      safePause(visibleVideoRef.current, 'visible video (unmount)');
      safePause(hoverVideoRef.current, 'hidden video (unmount)');
    };
  }, [safePause]);

  // Placeholder check
  const isPlaceholder = !image.id && actualDisplayUrl === "/placeholder.svg";
  const currentTargetShotName = selectedShotIdLocal ? simplifiedShotOptions.find(s => s.id === selectedShotIdLocal)?.name : undefined;
  
  // Check if image is already positioned in the selected shot (DB + optimistic)
  const isAlreadyPositionedInSelectedShot = useMemo(() => {
    if (!selectedShotIdLocal || !image.id) return false;
    
    // Check optimistic state first
    if (optimisticPositionedIds?.has(image.id)) return true;
    
    // Optimized: Check single shot first (most common case)
    if (image.shot_id === selectedShotIdLocal) {
      return image.position !== null && image.position !== undefined;
    }
    
    // Check multiple shot associations only if needed
    if (image.all_shot_associations) {
      const matchingAssociation = image.all_shot_associations.find(
        assoc => assoc.shot_id === selectedShotIdLocal
      );
      return matchingAssociation && 
             matchingAssociation.position !== null && 
             matchingAssociation.position !== undefined;
    }
    
    return false;
  }, [selectedShotIdLocal, image.id, image.shot_id, image.position, image.all_shot_associations, optimisticPositionedIds]);

  // Check if image is already associated with the selected shot WITHOUT position (DB + optimistic)
  const isAlreadyAssociatedWithoutPosition = useMemo(() => {
    if (!selectedShotIdLocal || !image.id) return false;
    
    // Check optimistic state first
    if (optimisticUnpositionedIds?.has(image.id)) return true;
    
    // Optimized: Check single shot first (most common case)
    if (image.shot_id === selectedShotIdLocal) {
      return image.position === null || image.position === undefined;
    }
    
    // Check multiple shot associations only if needed
    if (image.all_shot_associations) {
      const matchingAssociation = image.all_shot_associations.find(
        assoc => assoc.shot_id === selectedShotIdLocal
      );
      return matchingAssociation && 
             (matchingAssociation.position === null || matchingAssociation.position === undefined);
    }
    
    return false;
  }, [selectedShotIdLocal, image.id, image.shot_id, image.position, image.all_shot_associations, optimisticUnpositionedIds]);

  // Check if we're currently viewing the selected shot specifically
  // Only hide "add without position" button when actively filtering to view the current shot's items
  const isCurrentlyViewingSelectedShot = useMemo(() => {
    // Must have both IDs and they must match
    if (!currentViewingShotId || !selectedShotIdLocal) {
      return false;
    }
    
    // Only hide when viewing items specifically filtered to the current shot
    return currentViewingShotId === selectedShotIdLocal;
  }, [currentViewingShotId, selectedShotIdLocal]);

  // 🎯 PERFORMANCE: Memoize "Add without position" button visibility to prevent 840 checks per 2 minutes
  // This calculation was running on every render, causing massive overhead
  const shouldShowAddWithoutPositionButton = useMemo(() => {
    const shouldShow = onAddToLastShotWithoutPosition && 
                      !isAlreadyPositionedInSelectedShot && 
                      showTickForImageId !== image.id && 
                      addingToShotImageId !== image.id && 
                      !isCurrentlyViewingSelectedShot;
    
    // Throttled logging to track visibility changes (not on every render)
    if (shouldShow) {
      );
    }
    
    return shouldShow;
  }, [
    onAddToLastShotWithoutPosition,
    isAlreadyPositionedInSelectedShot,
    showTickForImageId,
    image.id,
    addingToShotImageId,
    isCurrentlyViewingSelectedShot
  ]);
  
  // Handle quick create success navigation
  const handleQuickCreateSuccess = useCallback(() => {
    if (quickCreateSuccess.shotId) {
      // Try to find the shot in the list first
      const shot = simplifiedShotOptions.find(s => s.id === quickCreateSuccess.shotId);
      if (shot) {
        // Shot found in list, use it
        navigateToShot({ 
          id: shot.id, 
          name: shot.name,
          images: [],
          position: 0
        });
      } else {
        // Shot not in list yet, but we have the ID and name, so navigate anyway
        navigateToShot({ 
          id: quickCreateSuccess.shotId, 
          name: quickCreateSuccess.shotName || `Shot`,
          images: [],
          position: 0
        });
      }
    }
  }, [quickCreateSuccess, simplifiedShotOptions, navigateToShot]);

  let aspectRatioPadding = '100%'; 
  let minHeight = '120px'; // Minimum height for very small images
  
  // Try to get dimensions from multiple sources
  let width = image.metadata?.width;
  let height = image.metadata?.height;
  
  // If not found, try to extract from resolution string
  if (!width || !height) {
    const resolution = (image.metadata as any)?.originalParams?.orchestrator_details?.resolution;
    if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
      const [w, h] = resolution.split('x').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        width = w;
        height = h;
      }
    }
  }
  
  if (width && height) {
    const calculatedPadding = (height / width) * 100;
    // Ensure reasonable aspect ratio bounds
    const minPadding = 60; // Minimum 60% height (for very wide images)
    const maxPadding = 200; // Maximum 200% height (for very tall images)
    aspectRatioPadding = `${Math.min(Math.max(calculatedPadding, minPadding), maxPadding)}%`;
  } else if (projectAspectRatio) {
    // Use project aspect ratio as fallback instead of square
    const ratio = parseRatio(projectAspectRatio);
    if (!isNaN(ratio)) {
      const calculatedPadding = (1 / ratio) * 100; // height/width * 100
      // Ensure reasonable aspect ratio bounds
      const minPadding = 60; // Minimum 60% height (for very wide images)
      const maxPadding = 200; // Maximum 200% height (for very tall images)
      aspectRatioPadding = `${Math.min(Math.max(calculatedPadding, minPadding), maxPadding)}%`;
    }
  }

  // If it's a placeholder, render simplified placeholder item
  if (isPlaceholder) {
    return (
      <div 
        key={imageKey}
        className="border rounded-lg overflow-hidden bg-muted animate-pulse"
      >
        <div style={{ paddingBottom: aspectRatioPadding }} className="relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <Eye className="h-12 w-12 text-muted-foreground opacity-30" />
          </div>
        </div>
      </div>
    );
  }

  // Check if this image is optimistically deleted
  const isOptimisticallyDeleted = optimisticDeletedIds?.has(image.id) ?? false;

  // Track drag state for visual feedback
  const [isDragging, setIsDragging] = useState(false);

  // Handle drag start for dropping onto timeline
  const handleDragStart = useCallback((e: React.DragEvent) => {
    // Only enable drag on desktop
    if (isMobile) {
      e.preventDefault();
      return;
    }
    
    setIsDragging(true);
    
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-generation', JSON.stringify({
      generationId: image.id,
      imageUrl: image.url,
      thumbUrl: image.thumbUrl,
      metadata: image.metadata
    }));
    
    // Create a small drag preview element
    if (e.dataTransfer.setDragImage && e.currentTarget instanceof HTMLElement) {
      const preview = document.createElement('div');
      preview.style.position = 'absolute';
      preview.style.top = '-1000px'; // Position off-screen
      preview.style.width = '80px';
      preview.style.height = '80px';
      preview.style.opacity = '0.7';
      preview.style.borderRadius = '8px';
      preview.style.overflow = 'hidden';
      preview.style.border = '2px solid #fff';
      preview.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
      
      // Clone the image element
      const imgElement = e.currentTarget.querySelector('img');
      if (imgElement) {
        const imgClone = imgElement.cloneNode(true) as HTMLImageElement;
        imgClone.style.width = '100%';
        imgClone.style.height = '100%';
        imgClone.style.objectFit = 'cover';
        preview.appendChild(imgClone);
      }
      
      document.body.appendChild(preview);
      e.dataTransfer.setDragImage(preview, 40, 40);
      
      // Clean up after a brief moment
      setTimeout(() => {
        if (document.body.contains(preview)) {
          document.body.removeChild(preview);
        }
      }, 0);
    }
    
    ,
      imageUrl: image.url?.substring(0, 50),
      timestamp: Date.now()
    });
  }, [image, isMobile]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Conditionally wrap with DraggableImage only on desktop to avoid interfering with mobile scrolling
  const imageContent = (
    <div 
        className={`border rounded-lg overflow-hidden hover:shadow-md transition-all duration-200 relative group bg-card ${
          isOptimisticallyDeleted ? 'opacity-50 scale-95 pointer-events-none' : ''
        } ${isDragging ? 'opacity-50 scale-75' : ''} ${!isMobile ? 'cursor-grab active:cursor-grabbing' : ''}`}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => { 
          if (!isMobile && isVideoContent) {
            if (index < 3) {
              ,
                hasThumbnailImage,
                videoReady,
                timestamp: Date.now()
              });
            }
            setIsHovering(true);
          }
        }}
        onMouseLeave={() => { 
          if (!isMobile && isVideoContent) {
            if (index < 3) {
              ,
                hasThumbnailImage,
                videoReady,
                timestamp: Date.now()
              });
            }
            // Explicitly pause immediately while element is still in DOM
            if (visibleVideoRef.current) {
              try {
                visibleVideoRef.current.pause();
                visibleVideoRef.current.currentTime = 0;
                if (index < 3) } catch {}
            }
            setIsHovering(false);
          }
        }}
    >
      <div className="relative w-full">
      <div 
        style={{ 
          paddingBottom: aspectRatioPadding,
          minHeight: minHeight 
        }} 
        className="relative bg-gray-200"
      >
          {isVideoContent ? (
              // If we have a thumbnail image, show it and swap to video on hover
              hasThumbnailImage ? (
                <>
                  {/* Always keep video element mounted to avoid play() interruptions */}
                <video
                      ref={visibleVideoRef}
                      src={videoUrl || actualSrc || ''}
                    playsInline
                    loop
                    muted
                      preload="auto"
                      poster={displayUrl || undefined}
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
                        isHovering && videoReady ? 'opacity-100 z-10' : 'opacity-0 z-0'
                      }`}
                      style={{ backgroundColor: 'transparent', cursor: 'pointer' }}
                    onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                    onTouchEnd={isMobile ? (e) => {
                      ,
                        target: (e.target as HTMLElement)?.tagName,
                        timestamp: Date.now()
                      });
                      e.preventDefault();
                      onMobileTap(image);
                    } : undefined}
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                    draggable={false}
                    onError={handleImageError}
                    onLoadStart={() => setImageLoading(true)}
                    onLoadedData={handleImageLoad}
                    onAbort={() => {
                      // Reset loading state if video load was aborted
                      setImageLoading(false);
                    }}
                />
                  {/* Thumbnail image - always rendered, hidden when video is visible */}
                  {displayUrl && (
                    <img
                      src={displayUrl}
                      alt={image.prompt || `Generated image ${index + 1}`}
                        className={`absolute inset-0 w-full h-full object-cover group-hover:opacity-80 transition-opacity duration-200 ${
                          isHovering && videoReady ? 'opacity-0 z-0' : 'opacity-100 z-5'
                        }`}
                      draggable={false}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setIsHovering(true)}
                      onMouseLeave={() => setIsHovering(false)}
                    />
                  )}
                  {/* Keep a hidden video element mounted to preload and be ready to play */}
                  {videoUrl && (isHovering || index < 8) && (
                    <video
                      ref={hoverVideoRef}
                      src={videoUrl}
                      style={{ display: 'none' }}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadStart={() => setImageLoading(true)}
                      onLoadedMetadata={() => {
                        if (index < 3 && isVideoContent) {
                          ,
                            hasThumbnailImage,
                            videoSrc: hoverVideoRef.current?.src?.substring(0, 50) + '...' || 'none',
                            timestamp: Date.now()
                          });
                        }
                        setVideoReady(true);
                      }}
                      onLoadedData={() => {
                        if (index < 3 && isVideoContent) {
                          ,
                            hasThumbnailImage,
                            videoSrc: hoverVideoRef.current?.src?.substring(0, 50) + '...' || 'none',
                            timestamp: Date.now()
                          });
                        }
                        setVideoReady(true);
                        handleImageLoad();
                      }}
                      onCanPlay={() => {
                        if (index < 3 && isVideoContent) {
                          ,
                            hasThumbnailImage,
                            videoSrc: hoverVideoRef.current?.src?.substring(0, 50) + '...' || 'none',
                            timestamp: Date.now()
                          });
                        }
                        setVideoReady(true);
                      }}
                      onWaiting={() => {
                        if (index < 3 && isVideoContent) {
                          for item ${index}`);
                        }
                      }}
                      onStalled={() => {
                        if (index < 3 && isVideoContent) {
                          }
                      }}
                      onSuspend={() => {
                        if (index < 3 && isVideoContent) {
                          }
                      }}
                      onError={handleImageError}
                      onAbort={() => setImageLoading(false)}
                    />
                  )}
                </>
              ) : (
                // No thumbnail available: preload with metadata and show spinner until ready, then hover to play
                <>
                  {videoUrl && (isHovering || index < 8) && (
                    <video
                      ref={hoverVideoRef}
                      src={videoUrl}
                      style={{ display: 'none' }}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadStart={() => setImageLoading(true)}
                      onCanPlay={() => {
                        if (index < 3 && isVideoContent) {
                          for item ${index}:`, {
                            imageId: image.id?.substring(0, 8),
                            hasThumbnailImage,
                            videoSrc: hoverVideoRef.current?.src?.substring(0, 50) + '...' || 'none',
                            timestamp: Date.now()
                          });
                        }
                        setVideoReady(true);
                        handleImageLoad();
                      }}
                      onError={handleImageError}
                      onAbort={() => setImageLoading(false)}
                    />
                  )}
                  {isHovering && videoReady ? (
                    <video
                        ref={visibleVideoRef}
                        src={videoUrl || ''}
                        playsInline
                        loop
                        muted
                        preload="auto"
                        className="absolute inset-0 w-full h-full object-cover group-hover:opacity-80 transition-opacity duration-300 bg-black"
                        onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                        draggable={false}
                        style={{ cursor: 'pointer' }}
                        onPlay={() => {
                          if (index < 3 && isVideoContent) {
                            }
                        }}
                        onPause={() => {
                          if (index < 3 && isVideoContent) {
                            }
                        }}
                        onWaiting={() => {
                          if (index < 3 && isVideoContent) {
                            for item ${index}`);
                          }
                        }}
                        onError={handleImageError}
                        onLoadStart={() => setImageLoading(true)}
                        onLoadedData={handleImageLoad}
                        onAbort={() => setImageLoading(false)}
                    />
                  ) : (
                    !videoReady ? (
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-200 animate-pulse">
                      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
                    </div>
                    ) : null
                  )}
                </>
              )
          ) : imageLoadError ? (
            // Fallback when image fails to load after retries
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-100 text-gray-500">
              <div className="text-center">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">Failed to load image</p>
                <button 
                  onClick={() => {
                    setImageLoadError(false);
                    setImageRetryCount(0);
                    setActualSrc(null);
                    setImageLoaded(false);
                    setImageLoading(false);
                  }}
                  className="text-xs underline hover:no-underline mt-1"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Show image once it's loaded, regardless of shouldLoad state */}
              {actualSrc && imageLoaded && (() => {
                return (
                <img
                  ref={progressiveRef}
                  src={actualSrc}
                  alt={image.prompt || `Generated image ${index + 1}`}
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover group-hover:opacity-80 transition-all duration-300",
                    // Add crossfade effect for progressive loading
                    progressiveEnabled && isThumbShowing && "opacity-90",
                    progressiveEnabled && isFullLoaded && "opacity-100"
                  )}
                  onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                  onTouchEnd={isMobile ? (e) => {
                    ,
                      target: (e.target as HTMLElement)?.tagName,
                      timestamp: Date.now()
                    });
                    e.preventDefault();
                    onMobileTap(image);
                  } : undefined}
                  draggable={false}
                  style={{ cursor: 'pointer' }}
                />
                );
              })()}
              
              {/* Hidden image for background loading - only when image hasn't loaded yet */}
              {actualSrc && !imageLoaded && (
                <img
                  src={actualSrc}
                  alt={image.prompt || `Generated image ${index + 1}`}
                  style={{ display: 'none' }}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                  onLoadStart={() => setImageLoading(true)}
                  onAbort={() => {
                    setImageLoading(false);
                  }}
                />
              )}
              
              {/* Show skeleton only while the media is still loading */}
              {/* Only show skeleton if image hasn't loaded yet - never show it for already-loaded images */}
              {!imageLoaded && (
                index < 3 && ,
                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-200 animate-pulse">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
                </div>
              )}
              
            </>
          )}
      </div>
      </div>
      
      {/* Action buttons and UI elements */}
      {image.id && ( // Ensure image has ID for actions
      <>
          {/* Add to Shot UI - Top Left */}
          {simplifiedShotOptions.length > 0 && onAddToLastShot && (
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
              {isVideoContent && image.shot_id ? (
                  /* Show clickable shot name for videos */
                  <button 
                      className="px-2 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs transition-colors"
                      onClick={() => {
                          const targetShot = simplifiedShotOptions.find(s => s.id === image.shot_id);
                          if (targetShot) {
                              navigateToShot(targetShot as any, { scrollToTop: true });
                          }
                      }}
                  >
                      {simplifiedShotOptions.find(s => s.id === image.shot_id)?.name || 'Unknown Shot'}
                  </button>
              ) : (
              <ShotSelector
                  value={selectedShotIdLocal}
                  onValueChange={(value) => {
                      setSelectedShotIdLocal(value);
                      setLastAffectedShotId(value);
                  }}
                  shots={simplifiedShotOptions}
                  placeholder="Shot..."
                  triggerClassName="h-7 px-2 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs min-w-[70px] max-w-[90px] truncate focus:ring-0 focus:ring-offset-0"
                  contentClassName="w-[var(--radix-select-trigger-width)]"
                  showAddShot={!!onCreateShot}
                  onCreateShot={handleQuickCreateAndAdd}
                  isCreatingShot={addingToShotImageId === image.id}
                  quickCreateSuccess={quickCreateSuccess}
                  onQuickCreateSuccess={handleQuickCreateSuccess}
                  side="top"
                  align="start"
                  sideOffset={4}
              />
              )}

              {!isVideoContent && (
              <div className="relative">
                <Tooltip delayDuration={0} disableHoverableContent>
                    <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className={`h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white ${
                                showTickForImageId === image.id
                                    ? 'bg-green-500 hover:bg-green-600 !text-white'
                                    : isAlreadyPositionedInSelectedShot
                                        ? 'bg-gray-500/60 hover:bg-gray-600/70 !text-white'
                                        : ''
                            }`}
                          onClick={async () => {
                              // If in transient success or already positioned, navigate to shot
                              if ((showTickForImageId === image.id || isAlreadyPositionedInSelectedShot) && selectedShotIdLocal && simplifiedShotOptions) {
                                  const targetShot = simplifiedShotOptions.find(s => s.id === selectedShotIdLocal);
                                  if (targetShot) {
                                      navigateToShot(targetShot as any, { scrollToTop: true });
                                      return;
                                  }
                              }
                              
                              ),
                                imageUrl: image.url?.substring(0, 50) + '...',
                                timestamp: Date.now()
                              });
                              
                              // If already positioned in shot, nothing else to do (navigation already handled)
                              if (isAlreadyPositionedInSelectedShot) {
                                  return;
                              }

                              if (!selectedShotIdLocal) {
                                  toast({ title: "Select a Shot", description: "Please select a shot first to add this image.", variant: "destructive" });
                                  return;
                              }
                              
                              ?.name
                              });
                              
                              setAddingToShotImageId(image.id!);
                              try {
                                  // Add limited retry logic for mobile network issues
                                  let success = false;
                                  let retryCount = 0;
                                  const maxRetries = isMobile ? 2 : 1; // Reduced from 3 to 2 retries on mobile
                                  
                                  // Mobile-specific debugging - detect network state if available (only when debugging enabled)
                                  if (isMobile && 'connection' in navigator && import.meta.env.VITE_DEBUG_LOGS) {
                                      const conn = (navigator as any).connection;
                                      log('MobileAddToShot', `Network state - Type: ${conn.effectiveType}, Downlink: ${conn.downlink}Mbps, RTT: ${conn.rtt}ms`);
                                  }
                                  
                                  while (!success && retryCount < maxRetries) {
                                      try {
                                          // Use the image URL directly instead of displayUrl to avoid potential URL resolution issues
                                          const imageUrlToUse = image.url || displayUrl;
                                          const thumbUrlToUse = image.thumbUrl || imageUrlToUse;
                                          
                                          + '...',
                                            thumbUrlToUse: thumbUrlToUse?.substring(0, 80) + '...',
                                            selectedShotIdLocal,
                                            timestamp: Date.now()
                                          });
                                          
                                          success = await onAddToLastShot(image.id!, imageUrlToUse, thumbUrlToUse);
                                          
                                          if (success) {
                                              onShowTick(image.id!);
                                              onOptimisticPositioned?.(image.id!);
                                              log('MobileAddToShot', `Success on attempt ${retryCount + 1} for image ${image.id}`);
                                          } else {
                                              }
                                      } catch (error) {
                                          retryCount++;
                                          log('MobileAddToShot', `Attempt ${retryCount} failed for image ${image.id}:`, error);
                                          
                                          // Don't retry for certain error types that won't benefit from retrying
                                          const isRetryableError = (err: any): boolean => {
                                              const message = err?.message?.toLowerCase() || '';
                                              const isNetworkError = message.includes('load failed') || 
                                                                    message.includes('network error') || 
                                                                    message.includes('fetch') ||
                                                                    message.includes('timeout');
                                              const isServerError = message.includes('unauthorized') || 
                                                                   message.includes('forbidden') || 
                                                                   message.includes('not found') ||
                                                                   message.includes('quota') ||
                                                                   err?.status === 401 || 
                                                                   err?.status === 403 || 
                                                                   err?.status === 404;
                                              return isNetworkError && !isServerError;
                                          };
                                          
                                          if (retryCount < maxRetries && isRetryableError(error)) {
                                              // Show user feedback on retry
                                              if (retryCount === 1) {
                                                  toast({ title: "Retrying...", description: "Network issue detected, trying again.", duration: 1500 });
                                              }
                                              
                                              // Wait before retry, with shorter delay to improve UX
                                              const waitTime = 800; // Fixed 800ms delay instead of exponential
                                              log('MobileAddToShot', `Waiting ${waitTime}ms before retry ${retryCount + 1}`);
                                              await new Promise(resolve => setTimeout(resolve, waitTime));
                                          } else {
                                              // Final retry failed, show user-friendly error
                                              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                                              log('MobileAddToShot', `All retries failed for image ${image.id}. Final error:`, error);
                                              toast({ 
                                                  title: "Network Error", 
                                                  description: `Could not add image to shot. ${isMobile ? 'Please check your connection and try again.' : errorMessage}`,
                                                  variant: "destructive" 
                                              });
                                              throw error;
                                          }
                                      }
                                  }
                              } finally {
                                  setAddingToShotImageId(null);
                              }
                          }}
                          disabled={!selectedShotIdLocal || addingToShotImageId === image.id}
                          aria-label={
                              isAlreadyPositionedInSelectedShot ? `Jump to ${currentTargetShotName}` :
                              showTickForImageId === image.id ? `Jump to ${currentTargetShotName}` : 
                              (currentTargetShotName ? `Add to '${currentTargetShotName}' at final position` : "Add to selected shot")
                          }
                          onPointerDown={(e) => e.stopPropagation()}
                      >
                          {addingToShotImageId === image.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                          ) : showTickForImageId === image.id ? (
                              <Check className="h-4 w-4" />
                          ) : isAlreadyPositionedInSelectedShot ? (
                              <Check className="h-4 w-4" />
                          ) : (
                              <PlusCircle className="h-4 w-4" />
                          )}
                      </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {isAlreadyPositionedInSelectedShot ? `Jump to ${currentTargetShotName || 'shot'}` :
                            showTickForImageId === image.id ? `Jump to ${currentTargetShotName || 'shot'}` :
                            (selectedShotIdLocal && currentTargetShotName ? `Add to '${currentTargetShotName}' at final position` : "Select a shot then click to add")}
                        </TooltipContent>
                    </Tooltip>
                    
                    {/* Add without position button - visibility now memoized for performance */}
                    {shouldShowAddWithoutPositionButton && (
                        <Tooltip delayDuration={0} disableHoverableContent>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={`absolute -top-1 -right-1 h-4 w-4 p-0 rounded-full border-0 scale-75 hover:scale-100 transition-transform duration-200 ease-out ${
                                        isAlreadyAssociatedWithoutPosition
                                            ? 'bg-gray-500/80 hover:bg-gray-600/90 text-white'
                                            : 'bg-black/60 hover:bg-black/80 text-white'
                                    }`}
                                    onClick={async () => {
                                        // If already associated without position, navigate to shot
                                        if (isAlreadyAssociatedWithoutPosition && selectedShotIdLocal && simplifiedShotOptions) {
                                            const targetShot = simplifiedShotOptions.find(s => s.id === selectedShotIdLocal);
                                            if (targetShot) {
                                                navigateToShot(targetShot as any, { scrollToTop: true });
                                                return;
                                            }
                                        }
                                        ),
                                          imageUrl: image.url?.substring(0, 50) + '...',
                                          timestamp: Date.now()
                                        });
                                        
                                        setAddingToShotWithoutPositionImageId?.(image.id!);
                                        try {
                                            // Add limited retry logic for mobile network issues
                                            let success = false;
                                            let retryCount = 0;
                                            const maxRetries = isMobile ? 2 : 1;
                                            
                                            while (!success && retryCount < maxRetries) {
                                                try {
                                                    // Use the image URL directly instead of displayUrl to avoid potential URL resolution issues
                                                    const imageUrlToUse = image.url || displayUrl;
                                                    const thumbUrlToUse = image.thumbUrl || imageUrlToUse;
                                                    
                                                    + '...',
                                                      thumbUrlToUse: thumbUrlToUse?.substring(0, 80) + '...',
                                                      selectedShotIdLocal,
                                                      timestamp: Date.now()
                                                    });
                                                    
                                                    success = await onAddToLastShotWithoutPosition(image.id!, imageUrlToUse, thumbUrlToUse);
                                                    
                                                    if (success) {
                                                        onShowSecondaryTick?.(image.id!);
                                                        onOptimisticUnpositioned?.(image.id!);
                                                    } else {
                                                        }
                                                } catch (error) {
                                                    retryCount++;
                                                    
                                                    // Don't retry for certain error types that won't benefit from retrying
                                                    const isRetryableError = (err: any): boolean => {
                                                        const message = err?.message?.toLowerCase() || '';
                                                        const isNetworkError = message.includes('load failed') || 
                                                                               message.includes('network error') || 
                                                                               message.includes('fetch') ||
                                                                               message.includes('timeout');
                                                        const isServerError = message.includes('unauthorized') || 
                                                                              message.includes('forbidden') || 
                                                                              message.includes('not found') ||
                                                                              message.includes('quota') ||
                                                                              err?.status === 401 || 
                                                                              err?.status === 403 || 
                                                                              err?.status === 404;
                                                        return isNetworkError && !isServerError;
                                                    };
                                                    
                                                    if (retryCount < maxRetries && isRetryableError(error)) {
                                                        // Show user feedback on retry
                                                        if (retryCount === 1) {
                                                            toast({ title: "Retrying...", description: "Network issue detected, trying again.", duration: 1500 });
                                                        }
                                                        
                                                        // Wait before retry, with shorter delay to improve UX
                                                        const waitTime = 800; // Fixed 800ms delay instead of exponential
                                                        await new Promise(resolve => setTimeout(resolve, waitTime));
                                                    } else {
                                                        // Final retry failed, show user-friendly error
                                                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                                                        toast({ 
                                                            title: "Network Error", 
                                                            description: `Could not add image to shot without position. ${isMobile ? 'Please check your connection and try again.' : errorMessage}`,
                                                            variant: "destructive" 
                                                        });
                                                        throw error;
                                                    }
                                                }
                                            }
                                        } finally {
                                            setAddingToShotWithoutPositionImageId?.(null);
                                        }
                                    }}
                                    disabled={!selectedShotIdLocal || addingToShotWithoutPositionImageId === image.id || addingToShotImageId === image.id}
                                    aria-label={
                                        isAlreadyAssociatedWithoutPosition
                                            ? (currentTargetShotName ? `Jump to ${currentTargetShotName}` : 'Jump to shot')
                                            : (currentTargetShotName ? `Add to '${currentTargetShotName}' without position` : "Add to selected shot without position")
                                    }
                                    onPointerDown={(e) => e.stopPropagation()}
                                >
                                    {addingToShotWithoutPositionImageId === image.id ? (
                                        <div className="h-2 w-2 animate-spin rounded-full border-b border-white"></div>
                                    ) : isAlreadyAssociatedWithoutPosition ? (
                                        <Check className="h-2 w-2" />
                                    ) : (
                                        <Plus className="h-2 w-2" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                {isAlreadyAssociatedWithoutPosition
                                    ? `Jump to ${currentTargetShotName || 'shot'}`
                                    : (selectedShotIdLocal && currentTargetShotName ? `Add to '${currentTargetShotName}' without position` : "Add to selected shot without position")}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
              )}
          </div>
          )}

          {/* Timestamp - Top Right */}
          <TimeStamp 
            createdAt={image.createdAt} 
            position="top-right"
            showOnHover={false} // Always show for all devices
            className="z-30"
          />

          {/* Optimistic delete overlay */}
          {isOptimisticallyDeleted && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-lg">
              <div className="bg-white/90 px-3 py-2 rounded-md flex items-center gap-2 text-sm font-medium text-gray-700">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-600"></div>
                Deleting...
              </div>
            </div>
          )}

          {/* Action buttons - Top Right (Delete, Info & Apply) */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 mt-8 z-20">
              {/* Delete button - Mobile Top Right */}
              {isMobile && onDelete && (
                <Button 
                    variant="destructive" 
                    size="icon" 
                    className="h-7 w-7 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(image.id!);
                    }}
                    disabled={isCurrentDeleting}
                >
                    {isCurrentDeleting ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>
                    ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                    )}
                </Button>
              )}
              {/* Info tooltip (shown on hover) */}
              {image.metadata && (
                isMobile ? (
                  <PopoverPrimitive.Root open={mobilePopoverOpenImageId === image.id} onOpenChange={(open) => {
                    if (!open) {
                      setMobilePopoverOpenImageId(null);
                    }
                  }}>
                    <PopoverPrimitive.Trigger asChild>
                      <div
                        className={`${mobileActiveImageId === image.id ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 transition-opacity cursor-pointer`}
                        onClick={() => {
                          setMobilePopoverOpenImageId(image.id);
                        }}
                      >
                        <div className="h-7 w-7 rounded-full bg-black/30 flex items-center justify-center">
                          <Info className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>
                    </PopoverPrimitive.Trigger>
                    <PopoverPrimitive.Portal>
                      <PopoverPrimitive.Content
                        side="right"
                        align="start"
                        sideOffset={4}
                        className="z-[10010] max-w-lg p-0 border bg-background shadow-lg rounded-md max-h-96 overflow-y-auto"
                      >
                        {shouldShowMetadata && image.metadata && (
                          <>
                            {isVideoTask && taskData ? (
                              <SharedTaskDetails
                                task={taskData}
                                inputImages={[]}
                                variant="panel"
                                isMobile={true}
                              />
                            ) : (
                              <SharedMetadataDetails
                                metadata={image.metadata}
                                variant="panel"
                                isMobile={true}
                                showUserImage={true}
                              />
                            )}
                          </>
                        )}
                      </PopoverPrimitive.Content>
                    </PopoverPrimitive.Portal>
                  </PopoverPrimitive.Root>
                ) : (
                  <Tooltip onOpenChange={setIsInfoOpen}>
                    <TooltipTrigger asChild>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <div className="h-7 w-7 rounded-full bg-black/30 flex items-center justify-center">
                          <Info className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      align="start"
                      className="max-w-lg p-0 border-0 bg-background/95 backdrop-blur-sm"
                      sideOffset={15}
                      collisionPadding={10}
                    >
                      {shouldShowMetadata && image.metadata && (
                        <>
                          {isVideoTask && taskData ? (
                            <SharedTaskDetails
                              task={taskData}
                              inputImages={[]}
                              variant="hover"
                              isMobile={false}
                            />
                          ) : (
                            <SharedMetadataDetails
                              metadata={image.metadata}
                              variant="hover"
                              isMobile={false}
                              showUserImage={true}
                            />
                          )}
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )
              )}

          {/* Apply settings button temporarily disabled */}
          {false && image.metadata && onApplySettings && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Button 
                              variant="outline"
                              size="icon" 
                              className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                              onClick={() => onApplySettings(image.metadata!)}
                          >
                              <Settings className="h-4 w-4 mr-1" /> Apply
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent>Apply these generation settings to the form</TooltipContent>
                  </Tooltip>
              </div>
              )}
          </div>

          {/* Delete button - Desktop Bottom Right */}
              {!isMobile && onDelete && (
              <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  {/* Delete button - Desktop */}
                  <Button 
                      variant="destructive" 
                      size="icon" 
                      className="h-7 w-7 p-0 rounded-full"
                      onClick={(e) => {
                          e.stopPropagation();
                          onDelete(image.id!);
                      }}
                      disabled={isCurrentDeleting}
                  >
                      {isCurrentDeleting ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>
                      ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                      )}
                  </Button>
              </div>
          )}

          {/* Bottom Left Buttons - Star, Edit Image */}
          <div className={`absolute bottom-2 left-2 flex items-center gap-1.5 transition-opacity z-20 ${
            image.starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}>
              {/* Star Button */}
              <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                  onClick={() => {
                      if (isTogglingStar) return;
                      setIsTogglingStar(true);
                      const nextStarred = !image.starred;
                      try {
                        if (onToggleStar) {
                          onToggleStar(image.id!, nextStarred);
                          // Assume parent handles async; release immediately to avoid global dulling
                          setIsTogglingStar(false);
                        } else {
                          toggleStarMutation.mutate(
                            { id: image.id!, starred: nextStarred },
                            {
                              onSettled: () => {
                                setIsTogglingStar(false);
                              },
                            }
                          );
                        }
                      } catch (_) {
                        setIsTogglingStar(false);
                      }
                  }}
                  disabled={isTogglingStar}
              >
                  <Star 
                      className={`h-3.5 w-3.5 ${image.starred ? 'fill-current' : ''}`} 
                  />
              </Button>
              
              {/* Edit Image Button - Desktop and Mobile, images only */}
              {!image.isVideo && (
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenLightbox(image, true); // Pass true to auto-enter edit mode
                    }}
                    title="Edit image"
                >
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
          </div>
      </>)
      }
    </div>
  );

  // On mobile, drag is already disabled by using the non-draggable branch.
  return isMobile ? (
    <React.Fragment key={imageKey}>
      {imageContent}
      {onCreateShot && (
        <CreateShotModal
          isOpen={isCreateShotModalOpen}
          onClose={() => setIsCreateShotModalOpen(false)}
          onSubmit={handleCreateShot}
          isLoading={isCreatingShot}
          projectId={selectedProjectId}
        />
      )}
    </React.Fragment>
  ) : (
    <DraggableImage key={`draggable-${imageKey}`} image={image} onDoubleClick={() => onOpenLightbox(image)}>
      {imageContent}
      {onCreateShot && (
        <CreateShotModal
          isOpen={isCreateShotModalOpen}
          onClose={() => setIsCreateShotModalOpen(false)}
          onSubmit={handleCreateShot}
          isLoading={isCreatingShot}
          projectId={selectedProjectId}
        />
      )}
    </DraggableImage>
  );
};

export default React.memo(ImageGalleryItem); 