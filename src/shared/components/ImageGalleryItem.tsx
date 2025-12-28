import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Trash2, Info, Settings, CheckCircle, AlertTriangle, Download, PlusCircle, Check, Star, Eye, Link, Plus, Pencil, Share2, Copy, Loader2, CornerDownLeft } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import HoverScrubVideo from './HoverScrubVideo';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import ShotSelector from "@/shared/components/ShotSelector";
import { DraggableImage } from "@/shared/components/DraggableImage";
import { getDisplayUrl, stripQueryParameters } from "@/shared/lib/utils";
import { isImageCached, setImageCacheStatus } from "@/shared/lib/imageCacheManager";
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';
import { TimeStamp } from "@/shared/components/TimeStamp";
import { useToast } from "@/shared/hooks/use-toast";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { GeneratedImageWithMetadata, DisplayableMetadata } from "./ImageGallery";
import SharedMetadataDetails from "./SharedMetadataDetails";
import { SharedTaskDetails } from "@/tools/travel-between-images/components/SharedTaskDetails";
import { log } from '@/shared/lib/logger';
import { setGenerationDragData, createDragPreview } from '@/shared/lib/dragDrop';
import { cn } from "@/shared/lib/utils";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useAddImageToShot } from "@/shared/hooks/useShots";
import { useProject } from "@/shared/contexts/ProjectContext";
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { useQuickShotCreate } from "@/shared/hooks/useQuickShotCreate";
import { parseRatio } from "@/shared/lib/aspectRatios";
import { useProgressiveImage } from "@/shared/hooks/useProgressiveImage";
import { isProgressiveLoadingEnabled } from "@/shared/settings/progressiveLoading";
import { useTaskFromUnifiedCache } from "@/shared/hooks/useUnifiedGenerations";
import { useTaskType } from "@/shared/hooks/useTaskType";
import { useGetTask } from "@/shared/hooks/useTasks";
import { useShareGeneration } from "@/shared/hooks/useShareGeneration";
import { deriveInputImages } from "./ImageGallery/utils";

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
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
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
  showShare?: boolean;
  showDelete?: boolean;
  showDownload?: boolean;
  showEdit?: boolean;
  showStar?: boolean;
  showAddToShot?: boolean;
  enableSingleClick?: boolean;
  onImageClick?: (image: GeneratedImageWithMetadata) => void;
  /** When true, videos are rendered as static thumbnail images instead of HoverScrubVideo for better performance */
  videosAsThumbnails?: boolean;
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
  showShare = true,
  showDelete = true,
  showDownload = true,
  showEdit = true,
  showStar = true,
  showAddToShot = true,
  enableSingleClick = false,
  onImageClick,
  videosAsThumbnails = false,
}) => {
  // Local pending state to scope star button disabled to this item only
  const [isTogglingStar, setIsTogglingStar] = useState<boolean>(false);
  // Local optimistic starred state - for variants, the parent's starred status isn't in the variant data
  const [localStarred, setLocalStarred] = useState<boolean>(image.starred ?? false);
  
  // Sync local state when image changes or when image.starred updates from parent
  useEffect(() => {
    setLocalStarred(image.starred ?? false);
  }, [image.id, image.starred]);
  
  // Fetch task data for video tasks to show proper details
  // Try to get task ID from metadata first (more efficient), fallback to cache query
  // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
  // For ShotImageManager images, id is shot_generations.id but generation_id is the actual generation ID
  const taskIdFromMetadata = (image.metadata as any)?.taskId;
  const actualGenerationId = (image as any).generation_id || image.id;
  const { data: taskIdMapping } = useTaskFromUnifiedCache(actualGenerationId);
  const taskIdFromCache = typeof taskIdMapping?.taskId === 'string' ? taskIdMapping.taskId : null;
  const taskId: string | null = taskIdFromMetadata || taskIdFromCache;
  
  const { data: taskData } = useGetTask(taskId);
  
  // Derive input images for guidance tooltip
  const inputImages = useMemo(() => deriveInputImages(taskData), [taskData]);
  
  // Only use the actual task type name (like 'wan_2_2_t2i'), not tool_type (like 'image-generation')
  // tool_type and task type name are different concepts - tool_type is a broader category
  const taskType = taskData?.taskType;
  const { data: taskTypeInfo } = useTaskType(taskType || null);
  
  // Determine if this should show video task details (SharedTaskDetails)
  // Check if content_type is 'video' from task_types table
  // Fallback: if no taskTypeInfo, check metadata.tool_type for legacy support
  const isVideoTask = taskTypeInfo?.content_type === 'video' || 
    (!taskTypeInfo && (image.metadata as any)?.tool_type === 'travel-between-images');

  // Share functionality
  const { handleShare, isCreatingShare, shareCopied, shareSlug } = useShareGeneration(image.id, taskId);

  // Feedback state for Apply Settings
  const [settingsApplied, setSettingsApplied] = useState(false);
  
  // [VideoThumbnailRender] Debug if this component is rendering for videos
  React.useEffect(() => {
    if (image.isVideo && index < 3) {
      console.log('[VideoThumbnailRender] ImageGalleryItem mounting for video:', {
        imageId: image.id?.substring(0, 8),
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
      console.log(`[MobileDebug] ImageGalleryItem ${index} mounted:`, {
        isMobile,
        imageId: image.id?.substring(0, 8),
        hasOnMobileTap: typeof onMobileTap === 'function',
        timestamp: Date.now()
      });
    }
  }, [isMobile, image.id]); // Only log when key props change
  const { toast } = useToast();
  const { selectedProjectId } = useProject();
  const addImageToShotMutation = useAddImageToShot();
  const { navigateToShot } = useShotNavigation();
  const { lastAffectedShotId, setLastAffectedShotId: updateLastAffectedShotId } = useLastAffectedShot();
  
  // Use consolidated hook for quick shot creation
  const {
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  } = useQuickShotCreate({
    generationId: image.id,
    generationPreview: {
      imageUrl: image.url,
      thumbUrl: image.thumbUrl,
      type: image.type,
      location: image.location,
    },
    shots: simplifiedShotOptions,
    onShotChange: (shotId) => {
      updateLastAffectedShotId(shotId);
      setSelectedShotIdLocal(shotId);
    },
    onLoadingStart: () => setAddingToShotImageId(image.id),
    onLoadingEnd: () => setAddingToShotImageId(null),
  });
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
      console.log(`[ThumbToFullTransition] Item ${index} state:`, {
        imageId: image.id?.substring(0, 8),
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
        console.log('[VideoThumbnailFIXED] ImageGalleryItem video URL selection:', {
          imageId: image.id?.substring(0, 8),
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
        console.log(`[ThumbToFullTransition] Item ${index} using progressiveSrc:`, {
          imageId: image.id?.substring(0, 8),
          progressiveSrc: progressiveSrc?.substring(0, 50),
          phase,
          timestamp: Date.now()
        });
      }
      return progressiveSrc;
    }
    
    const fallbackUrl = getDisplayUrl(image.thumbUrl || image.url);
    if (index < 3 && progressiveEnabled) {
      console.log(`[ThumbToFullTransition] Item ${index} using fallback (no progressiveSrc yet):`, {
        imageId: image.id?.substring(0, 8),
        fallbackUrl: fallbackUrl?.substring(0, 50),
        phase,
        timestamp: Date.now()
      });
    }
    return fallbackUrl;
  }, [progressiveEnabled, progressiveSrc, image.thumbUrl, image.url, image.isVideo, image.id, index, phase]);
  // Track stable display URL to avoid browser reloads when only tokens change
  // Uses urlIdentity (computed at data layer) for stable comparison
  const displayUrlIdentity = image.urlIdentity || image.url || '';
  const [stableDisplayUrl, setStableDisplayUrl] = useState<string>(displayUrl);
  const [lastDisplayUrlIdentity, setLastDisplayUrlIdentity] = useState<string>(displayUrlIdentity);
  useEffect(() => {
    // Only update stableDisplayUrl if the underlying file changed (not just token refresh)
    if (displayUrlIdentity !== lastDisplayUrlIdentity) {
      setStableDisplayUrl(displayUrl);
      setLastDisplayUrlIdentity(displayUrlIdentity);
    }
  }, [displayUrl, displayUrlIdentity, lastDisplayUrlIdentity]);

  // Track loading state for this specific image
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [imageRetryCount, setImageRetryCount] = useState<number>(0);
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  // State for CreateShotModal
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState<boolean>(false);
  const [isCreatingShot, setIsCreatingShot] = useState<boolean>(false);
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

  
  // Track previous image ID to detect actual changes vs re-renders
  // Create a stable identifier using urlIdentity/thumbUrlIdentity (computed at data layer)
  // This prevents resets when only Supabase URL tokens change
  const imageIdentifier = useMemo(() => {
    return `${image.id}:${image.urlIdentity || image.url || ''}:${image.thumbUrlIdentity || image.thumbUrl || ''}:${(image as any).updatedAt || ''}`;
  }, [image.id, image.urlIdentity, image.url, image.thumbUrlIdentity, image.thumbUrl, (image as any).updatedAt]);
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
      console.log(`[ImageGalleryItem] Auto-retrying image load for ${image.id} in ${1000 * (imageRetryCount + 1)}ms...`);
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
      console.log(`[ImageGalleryItem-${index}] Image changed, resetting state`, {
        prevId: prevImageIdentifierRef.current,
        newId: imageIdentifier
      });
    }
    
    // [VideoThumbnailLoop] Debug what's causing the reset loop
    if (image.isVideo && index === 0) {
      console.log('[VideoThumbnailLoop] imageIdentifier changed, causing reset:', {
        imageId: image.id?.substring(0, 8),
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
      console.log('[VideoThumbnailActualSrc] actualSrc changed:', {
        imageId: image.id?.substring(0, 8),
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
      console.log('[VideoThumbnailLoad] shouldLoad state for first video:', {
        imageId: image.id?.substring(0, 8),
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
      console.log(`[ThumbToFullTransition] Item ${index} actualSrc effect:`, {
        imageId: image.id?.substring(0, 8),
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
      
      // Update actualSrc if it's different from actualDisplayUrl AND it's a different file
      // This handles initial load and progressive transitions, but avoids token-only refreshes
      const isActuallyDifferent = actualSrc !== actualDisplayUrl;
      const isDifferentFile = stripQueryParameters(actualSrc) !== stripQueryParameters(actualDisplayUrl);
      
      if (isActuallyDifferent && isDifferentFile) {
        if (index < 3) {
          console.log(`[ThumbToFullTransition] Item ${index} updating actualSrc:`, {
            imageId: image.id?.substring(0, 8),
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

  const videoUrl = useMemo(() => (isVideoContent ? (image.url || null) : null), [isVideoContent, image.url]);

  // Track stable video URL to avoid browser reloads when only tokens change
  // Uses urlIdentity (computed at data layer) for stable comparison
  const videoUrlIdentity = image.urlIdentity || '';
  const [stableVideoUrl, setStableVideoUrl] = useState<string | null>(videoUrl);
  const [lastVideoUrlIdentity, setLastVideoUrlIdentity] = useState<string>(videoUrlIdentity);
  useEffect(() => {
    if (!videoUrl) {
      setStableVideoUrl(null);
      setLastVideoUrlIdentity('');
      return;
    }

    // Only update stableVideoUrl if the underlying file changed (not just token refresh)
    if (videoUrlIdentity !== lastVideoUrlIdentity) {
      setStableVideoUrl(videoUrl);
      setLastVideoUrlIdentity(videoUrlIdentity);
    }
  }, [videoUrl, videoUrlIdentity, lastVideoUrlIdentity]);

  // Placeholder check
  const isPlaceholder = !image.id && actualDisplayUrl === "/placeholder.svg";
  const currentTargetShotName = selectedShotIdLocal ? simplifiedShotOptions.find(s => s.id === selectedShotIdLocal)?.name : undefined;
  
  // Check if image is already positioned in the selected shot (DB + optimistic)
  const isAlreadyPositionedInSelectedShot = useMemo(() => {
    if (!selectedShotIdLocal || !image.id) return false;
    
    // Check optimistic state first - uses composite key format: imageId:shotId
    const optimisticKey = `${image.id}:${selectedShotIdLocal}`;
    const hasOptimisticKey = optimisticPositionedIds?.has(optimisticKey);
    
    // [OptimisticDebug] Log the check
    console.log('[OptimisticDebug] isAlreadyPositionedInSelectedShot check:', {
      imageId: image.id?.substring(0, 8),
      selectedShotIdLocal: selectedShotIdLocal?.substring(0, 8),
      optimisticKey,
      hasOptimisticKey,
      optimisticSetSize: optimisticPositionedIds?.size || 0,
      optimisticSetContents: optimisticPositionedIds ? Array.from(optimisticPositionedIds) : [],
      timestamp: Date.now()
    });
    
    if (hasOptimisticKey) return true;
    
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
    
    // Check optimistic state first - uses composite key format: imageId:shotId
    const optimisticKey = `${image.id}:${selectedShotIdLocal}`;
    if (optimisticUnpositionedIds?.has(optimisticKey)) return true;
    
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
      console.log('[AddWithoutPosition] Button will show for image:', image.id?.substring(0, 8));
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
  
  let aspectRatioPadding = '100%'; 
  let minHeight = '120px'; // Minimum height for very small images
  
  // Always use project aspect ratio for consistent gallery display
  if (projectAspectRatio) {
    const ratio = parseRatio(projectAspectRatio);
    if (!isNaN(ratio)) {
      const calculatedPadding = (1 / ratio) * 100; // height/width * 100
      // Ensure reasonable aspect ratio bounds
      const minPadding = 60; // Minimum 60% height (for very wide images)
      const maxPadding = 200; // Maximum 200% height (for very tall images)
      aspectRatioPadding = `${Math.min(Math.max(calculatedPadding, minPadding), maxPadding)}%`;
    }
  } else {
    // Fallback: try to get dimensions from image metadata if no project aspect ratio
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
    
    // Use shared utility to set drag data
    setGenerationDragData(e, {
      generationId: image.id,
      imageUrl: image.url,
      thumbUrl: image.thumbUrl,
      metadata: image.metadata
    });
    
    // Create drag preview and clean up after brief moment
    const cleanup = createDragPreview(e);
    if (cleanup) {
      setTimeout(cleanup, 0);
    }
    
    console.log('[GenerationDrag] Drag started:', {
      generationId: image.id?.substring(0, 8),
      imageUrl: image.url?.substring(0, 50),
      timestamp: Date.now()
    });
  }, [image, isMobile]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Track touch start position to detect scrolling vs tapping
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Helper to determine if interaction was a tap or a scroll/drag
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartPosRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  // Handle click/tap processing with scroll detection
  const handleInteraction = (e: React.TouchEvent | React.MouseEvent) => {
    // For touchend events, only proceed if touchstart happened on this element
    // This prevents clicks from firing when a dropdown (like ShotSelector) closes
    // and the touchend lands on the element behind it
    if (e.type === 'touchend') {
      if (!touchStartPosRef.current) {
        // touchStart didn't happen on this element, ignore the touchend
        console.log('[MobileDebug] touchend without matching touchstart, ignoring');
        return;
      }
      
      const touch = (e as React.TouchEvent).changedTouches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);
      
      // Reset touch start position
      touchStartPosRef.current = null;

      // If moved more than 10px, treat as scroll/drag and ignore click
      if (deltaX > 10 || deltaY > 10) {
        console.log('[MobileDebug] Scroll detected, ignoring tap');
        return;
      }
    }

    // Proceed with click logic
    e.preventDefault();
    
    if (enableSingleClick && onImageClick) {
      onImageClick(image);
    } else {
      onMobileTap(image);
    }
  };

  // Conditionally wrap with DraggableImage only on desktop to avoid interfering with mobile scrolling
  const imageContent = (
    <div 
        className={`border rounded-lg overflow-hidden hover:shadow-md transition-all duration-200 relative group bg-card ${
          isOptimisticallyDeleted ? 'opacity-50 scale-95 pointer-events-none' : ''
        } ${isDragging ? 'opacity-50 scale-75' : ''} ${!isMobile ? 'cursor-grab active:cursor-grabbing' : ''}`}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={enableSingleClick || !isMobile ? (e) => {
          if (onImageClick) {
            e.stopPropagation();
            onImageClick(image);
          } else {
            // Fallback to standard behavior if onImageClick not provided but enabled
            onOpenLightbox(image);
          }
        } : undefined}
    >
      <div className="relative w-full">
      <div 
        style={{ 
          paddingBottom: aspectRatioPadding,
          minHeight: minHeight 
        }} 
        className="relative bg-muted/50"
      >
          {isVideoContent ? (
            videosAsThumbnails ? (
              // Lightweight thumbnail mode - just show a static image for video selection panels
              <div className="absolute inset-0 w-full h-full">
                <img
                  src={stableDisplayUrl || ''}
                  alt={image.prompt || ''}
                  className="w-full h-full object-cover cursor-pointer"
                  loading="lazy"
                  onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                />
                {/* Video indicator overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              // Full HoverScrubVideo mode for galleries that need scrubbing
              <>
                {/* Thumbnail overlay - stays visible until video is loaded to prevent flash */}
                {stableDisplayUrl && !imageLoaded && (
                  <img
                    src={stableDisplayUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover z-[1] pointer-events-none"
                    loading="eager"
                  />
                )}
                <HoverScrubVideo
                  src={stableVideoUrl || actualSrc || ''}
                  poster={stableDisplayUrl || undefined}
                  preload={shouldLoad ? "auto" : "none"}
                  className="absolute inset-0 w-full h-full"
                  videoClassName="object-cover cursor-pointer w-full h-full"
                  muted
                  loop
                  onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                  onTouchStart={isMobile && !enableSingleClick ? handleTouchStart : undefined}
                  onTouchEnd={isMobile && !enableSingleClick ? handleInteraction : undefined}
                  onVideoError={handleImageError}
                  onLoadStart={() => setImageLoading(true)}
                  onLoadedData={handleImageLoad}
                />
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
                  onTouchStart={isMobile && !enableSingleClick ? handleTouchStart : undefined}
                  onTouchEnd={isMobile && !enableSingleClick ? handleInteraction : undefined}
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
                index < 3 && console.log(`[ImageGalleryItem-${index}] Showing skeleton`, {
                  imageId: image.id,
                  imageLoaded,
                  imageLoading,
                  actualSrc
                }),
                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted/30 animate-pulse">
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
          {/* Shot Name Badge / Variant Name for Videos - Top Left */}
          {isVideoContent && ((image as any).name || (image.shot_id && simplifiedShotOptions.length > 0) || (image.derivedCount && image.derivedCount > 0)) && (
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
              {/* Variant Name */}
              {(image as any).name && (
                <div className="bg-black/50 text-white text-xs sm:text-sm px-2 py-0.5 rounded-md mb-1 font-medium backdrop-blur-sm">
                  {(image as any).name}
                </div>
              )}
              
              {/* Variant Count + NEW badge - show below variant name */}
              {image.derivedCount && image.derivedCount > 1 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1">
                        <div className="bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm cursor-help">
                          {image.derivedCount}
                        </div>
                        {image.hasUnviewedVariants && (
                          <div className="bg-yellow-500 text-black text-[8px] font-bold px-1 py-0.5 rounded">
                            NEW
                          </div>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{image.derivedCount} variant{image.derivedCount !== 1 ? 's' : ''}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Shot Navigation Button */}
              {image.shot_id && simplifiedShotOptions.length > 0 && (
                <button 
                    className="px-2 py-1 rounded-md bg-black/40 hover:bg-black/60 text-white/90 hover:text-white text-xs font-normal transition-all backdrop-blur-sm flex items-center gap-1.5"
                    onClick={() => {
                        const targetShot = simplifiedShotOptions.find(s => s.id === image.shot_id);
                        if (targetShot) {
                            navigateToShot(targetShot as any, { scrollToTop: true });
                        }
                    }}
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    {simplifiedShotOptions.find(s => s.id === image.shot_id)?.name || 'Unknown Shot'}
                </button>
              )}
          </div>
          )}

          {/* Add to Shot UI - Top Left (for non-video content) */}
          {showAddToShot && simplifiedShotOptions.length > 0 && onAddToLastShot && (
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
              {!isVideoContent && (
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
                  onNavigateToShot={(shot) => navigateToShot(shot as any, { scrollToTop: true })}
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
                          onClick={async (e) => {
                              // Prevent event from bubbling up and opening lightbox
                              e.stopPropagation();
                              // If in transient success or already positioned, navigate to shot
                              if ((showTickForImageId === image.id || isAlreadyPositionedInSelectedShot) && selectedShotIdLocal && simplifiedShotOptions) {
                                  const targetShot = simplifiedShotOptions.find(s => s.id === selectedShotIdLocal);
                                  if (targetShot) {
                                      navigateToShot(targetShot as any, { scrollToTop: true });
                                      return;
                                  }
                              }
                              
                              console.log('[GenerationsPane] Add to Shot button clicked', {
                                imageId: image.id,
                                selectedShotIdLocal,
                                isAlreadyPositionedInSelectedShot,
                                simplifiedShotOptions: simplifiedShotOptions.map(s => ({ id: s.id, name: s.name })),
                                imageUrl: image.url?.substring(0, 50) + '...',
                                timestamp: Date.now()
                              });
                              
                              // If already positioned in shot, nothing else to do (navigation already handled)
                              if (isAlreadyPositionedInSelectedShot) {
                                  return;
                              }

                              if (!selectedShotIdLocal) {
                                  console.log('[GenerationsPane] ❌ No shot selected for adding image');
                                  toast({ title: "Select a Shot", description: "Please select a shot first to add this image.", variant: "destructive" });
                                  return;
                              }
                              
                              console.log('[GenerationsPane] 🚀 Starting add to shot process', {
                                imageId: image.id,
                                targetShotId: selectedShotIdLocal,
                                targetShotName: simplifiedShotOptions.find(s => s.id === selectedShotIdLocal)?.name
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
                                          
                                          console.log(`[GenerationsPane] Calling onAddToLastShot - Attempt ${retryCount + 1}/${maxRetries}`, {
                                            imageId: image.id,
                                            imageUrlToUse: imageUrlToUse?.substring(0, 80) + '...',
                                            thumbUrlToUse: thumbUrlToUse?.substring(0, 80) + '...',
                                            selectedShotIdLocal,
                                            timestamp: Date.now()
                                          });
                                          
                                          success = await onAddToLastShot(image.id!, imageUrlToUse, thumbUrlToUse);
                                          
                                          if (success) {
                                              console.log(`[GenerationsPane] ✅ Success on attempt ${retryCount + 1} for image ${image.id}`);
                                              onShowTick(image.id!);
                                              const optimisticKey = `${image.id}:${selectedShotIdLocal}`;
                                              console.log('[OptimisticDebug] Calling onOptimisticPositioned:', {
                                                imageId: image.id?.substring(0, 8),
                                                shotId: selectedShotIdLocal?.substring(0, 8),
                                                optimisticKey,
                                                hasCallback: !!onOptimisticPositioned,
                                                timestamp: Date.now()
                                              });
                                              onOptimisticPositioned?.(image.id!, selectedShotIdLocal);
                                              log('MobileAddToShot', `Success on attempt ${retryCount + 1} for image ${image.id}`);
                                          } else {
                                              console.log(`[GenerationsPane] ❌ Failed on attempt ${retryCount + 1} for image ${image.id}`);
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
                                    onClick={async (e) => {
                                        // Prevent event from bubbling up and opening lightbox
                                        e.stopPropagation();
                                        // If already associated without position, navigate to shot
                                        if (isAlreadyAssociatedWithoutPosition && selectedShotIdLocal && simplifiedShotOptions) {
                                            const targetShot = simplifiedShotOptions.find(s => s.id === selectedShotIdLocal);
                                            if (targetShot) {
                                                navigateToShot(targetShot as any, { scrollToTop: true });
                                                return;
                                            }
                                        }
                                        console.log('[GenerationsPane] Add to Shot WITHOUT position button clicked', {
                                          imageId: image.id,
                                          selectedShotIdLocal,
                                          simplifiedShotOptions: simplifiedShotOptions.map(s => ({ id: s.id, name: s.name })),
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
                                                    
                                                    console.log(`[GenerationsPane] Calling onAddToLastShotWithoutPosition - Attempt ${retryCount + 1}/${maxRetries}`, {
                                                      imageId: image.id,
                                                      imageUrlToUse: imageUrlToUse?.substring(0, 80) + '...',
                                                      thumbUrlToUse: thumbUrlToUse?.substring(0, 80) + '...',
                                                      selectedShotIdLocal,
                                                      timestamp: Date.now()
                                                    });
                                                    
                                                    success = await onAddToLastShotWithoutPosition(image.id!, imageUrlToUse, thumbUrlToUse);
                                                    
                                                    if (success) {
                                                        console.log(`[GenerationsPane] ✅ Success without position on attempt ${retryCount + 1} for image ${image.id}`);
                                                        onShowSecondaryTick?.(image.id!);
                                                        onOptimisticUnpositioned?.(image.id!, selectedShotIdLocal);
                                                    } else {
                                                        console.log(`[GenerationsPane] ❌ Failed without position on attempt ${retryCount + 1} for image ${image.id}`);
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
              <div className="bg-card/90 dark:bg-gray-800/90 px-3 py-2 rounded-md flex items-center gap-2 text-sm font-medium text-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-600"></div>
                Deleting...
              </div>
            </div>
          )}
          
          {/* Action buttons - Top Right (Delete, Info & Apply) */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 mt-8 z-20">
              {/* Delete button - Mobile Top Right */}
              {showDelete && isMobile && onDelete && (
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
              
              {/* Variant Count + NEW badge + Info Button Row (for non-video content) */}
              <div className="flex flex-row items-center gap-1.5">
                {/* Variant Count + NEW badge - positioned to the left of Info button */}
                {!isVideoContent && image.derivedCount && image.derivedCount > 1 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-black/50 text-white text-[10px] font-medium px-1.5 py-0.5 rounded backdrop-blur-sm cursor-help">
                            {image.derivedCount}
                          </div>
                          {image.hasUnviewedVariants && (
                            <div className="bg-yellow-500 text-black text-[8px] font-bold px-1 py-0.5 rounded">
                              NEW
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p>{image.derivedCount} variant{image.derivedCount !== 1 ? 's' : ''}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                                inputImages={inputImages}
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
                              inputImages={inputImages}
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
              </div>

              {/* Share Button - Below Info */}
              {showShare && taskId && (
                <TooltipProvider>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleShare}
                        disabled={isCreatingShare}
                        className={`h-7 w-7 p-0 rounded-full text-white transition-all opacity-0 group-hover:opacity-100 ${
                          shareCopied 
                            ? 'bg-green-500 hover:bg-green-600' 
                            : 'bg-black/50 hover:bg-black/70'
                        }`}
                      >
                        {isCreatingShare ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : shareCopied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : shareSlug ? (
                          <Copy className="h-3.5 w-3.5" />
                        ) : (
                          <Share2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{shareCopied ? 'Link copied!' : shareSlug ? 'Copy share link' : 'Share this generation'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
          </div>

          {/* Bottom Right Buttons - Delete, Download */}
              {!isMobile && (onDelete && showDelete || showDownload) && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  {/* Delete button - Desktop */}
                  {onDelete && showDelete && (
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
                  )}
                  {/* Download Button - Desktop Bottom Right */}
                  {showDownload && (
                  <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                      onClick={(e) => {
                          e.stopPropagation();
                          onDownloadImage(
                            image.url || '',
                            image.prompt || 'generation',
                            image.id,
                            image.isVideo,
                            image.contentType // Pass stored MIME type for proper file extension
                          );
                      }}
                      title="Download"
                  >
                      <Download className="h-3.5 w-3.5" />
                  </Button>
                  )}
              </div>
          )}

          {/* Bottom Left Buttons - Star, Edit Image */}
          <div className={`absolute bottom-2 left-2 flex items-center gap-1.5 transition-opacity z-20 ${
            localStarred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}>
              {/* Star Button */}
              {showStar && (
              <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                  onClick={(e) => {
                      e.stopPropagation(); // Prevent lightbox from opening
                      if (isTogglingStar) return;
                      setIsTogglingStar(true);
                      const nextStarred = !localStarred;
                      // Optimistically update local state for immediate UI feedback
                      setLocalStarred(nextStarred);
                      // For variants, use the parent generation_id; otherwise use the image id
                      const targetId = (image as any).metadata?.generation_id || (image as any).generation_id || image.id!;
                      try {
                        if (onToggleStar) {
                          onToggleStar(targetId, nextStarred);
                          // Assume parent handles async; release immediately to avoid global dulling
                          setIsTogglingStar(false);
                        } else {
                          toggleStarMutation.mutate(
                            { id: targetId, starred: nextStarred },
                            {
                              onSettled: () => {
                                setIsTogglingStar(false);
                              },
                            }
                          );
                        }
                      } catch (_) {
                        setIsTogglingStar(false);
                        setLocalStarred(!nextStarred); // Rollback on error
                      }
                  }}
                  disabled={isTogglingStar}
              >
                  <Star 
                      className={`h-3.5 w-3.5 ${localStarred ? 'fill-current' : ''}`} 
                  />
              </Button>
              )}

              {/* Apply Settings Button - Bottom Left (next to Star) */}
              {image.metadata && onApplySettings && (
                <TooltipProvider>
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Button 
                              variant="secondary"
                              size="icon" 
                              className={`h-7 w-7 p-0 rounded-full text-white transition-all ${
                                settingsApplied 
                                  ? 'bg-green-500 hover:bg-green-600' 
                                  : 'bg-black/50 hover:bg-black/70'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onApplySettings(image.metadata!);
                                setSettingsApplied(true);
                                setTimeout(() => setSettingsApplied(false), 2000);
                              }}
                              disabled={settingsApplied}
                          >
                              {settingsApplied ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <CornerDownLeft className="h-3.5 w-3.5" />
                              )}
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {settingsApplied ? 'Settings applied!' : 'Apply settings'}
                      </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              
              {/* Edit Image Button - Desktop and Mobile, images only */}
              {!image.isVideo && showEdit && (
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