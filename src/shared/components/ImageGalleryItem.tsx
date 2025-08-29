import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Trash2, Info, Settings, CheckCircle, AlertTriangle, Download, PlusCircle, Check, Sparkles, Star, Eye, Link, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { DraggableImage } from "@/shared/components/DraggableImage";
import { getDisplayUrl } from "@/shared/lib/utils";
import { isImageCached, setImageCacheStatus } from "@/shared/lib/imageCacheManager";
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';
import { TimeStamp } from "@/shared/components/TimeStamp";
import { useToast } from "@/shared/hooks/use-toast";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { GeneratedImageWithMetadata, DisplayableMetadata } from "./ImageGallery";
import SharedMetadataDetails from "./SharedMetadataDetails";
import { log } from '@/shared/lib/logger';
import { cn } from "@/shared/lib/utils";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useAddImageToShot, useCreateShotWithImage } from "@/shared/hooks/useShots";
import { useProject } from "@/shared/contexts/ProjectContext";
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";

interface ImageGalleryItemProps {
  image: GeneratedImageWithMetadata;
  index: number;
  isDeleting: boolean;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  onOpenLightbox: (image: GeneratedImageWithMetadata) => void;
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
}) => {
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
  const createShotWithImageMutation = useCreateShotWithImage();
  const { navigateToShot } = useShotNavigation();
  const { lastAffectedShotId, setLastAffectedShotId: updateLastAffectedShotId } = useLastAffectedShot();
  // Memoize displayUrl to prevent unnecessary recalculations
  const displayUrl = useMemo(() => getDisplayUrl(image.thumbUrl || image.url), [image.thumbUrl, image.url]);
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
    console.log(`[GalleryRenderDebug] ✅ Image ${index} LOADED successfully:`, {
      imageId: image.id?.substring(0, 8),
      wasCached: isPreloadedAndCached,
      loadTime: Date.now()
    });
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
      toast({ 
        title: "Shot Created", 
        description: `"${shotName}" has been created successfully.` 
      });
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
      console.log('[QuickCreate] Starting atomic shot creation with image:', {
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: image.id
      });
      
      // Use the atomic database function to create shot and add image in one operation
      const result = await createShotWithImageMutation.mutateAsync({
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: image.id
      });
      
      console.log('[QuickCreate] Atomic operation successful:', result);
      
      // Set the newly created shot as the last affected shot
      updateLastAffectedShotId(result.shotId);
      
      toast({ 
        title: "Shot Created & Image Added", 
        description: `Created "${result.shotName}" and added image successfully.` 
      });
      
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
  const imageIdentifier = image.id || `${image.url}-${image.thumbUrl}`;
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

  // Generate display URL with retry cache busting
  const actualDisplayUrl = useMemo(() => {
    if (imageRetryCount > 0) {
      return getDisplayUrl(image.thumbUrl || image.url, true); // Force refresh with cache busting
    }
    return displayUrl;
  }, [displayUrl, image.thumbUrl, image.url, imageRetryCount]);

  // Simplified loading system - only responds to progressive loading control
  useEffect(() => {
    // Generate unique load ID for tracking this specific image load
    const loadId = `load-${image.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const isPreloaded = isImageCached(image);
    
    if (index < 8) {
      console.log(`[GalleryRenderDebug] Loading decision for image ${index}:`, {
        imageId: image.id.substring(0, 8),
        actualSrc: !!actualSrc,
        imageLoaded,
        shouldLoad,
        isPriority,
        isPreloaded,
        actualDisplayUrl: actualDisplayUrl?.substring(0, 50) + '...',
        canRender: !!(actualSrc && imageLoaded),
        decision: !actualSrc && shouldLoad ? 'LOAD' : actualSrc ? 'SKIP_ALREADY_SET' : !shouldLoad ? 'SKIP_NOT_READY' : 'UNKNOWN'
      });
    }
    
    // Only load if progressive loading system says we should AND we haven't loaded yet
    if (!actualSrc && shouldLoad) {
      
      // Don't load placeholder URLs - they indicate missing/invalid image data
      if (actualDisplayUrl === '/placeholder.svg' || !actualDisplayUrl) {
        console.error(`[GalleryRenderDebug] ❌ INVALID URL - setting error state for image ${index}:`, actualDisplayUrl);
        setImageLoadError(true);
        return;
      }
      
      // Only set loading if the image isn't already cached/loaded
      if (!isPreloaded) {
        console.log(`[GalleryRenderDebug] 🔄 Setting loading state for image ${index} (uncached)`);
        setImageLoading(true);
      } else {
        console.log(`[GalleryRenderDebug] ⚡ Skipping loading state for image ${index} (cached)`);
      }
      
      // No additional delay - progressive loading system handles all timing
      // Images load immediately when shouldLoad becomes true
      if (index < 8) {
        console.log(`[GalleryRenderDebug] 🚀 SETTING actualSrc for image ${index} immediately`);
      }
      setActualSrc(actualDisplayUrl);
      
    } else if (!shouldLoad) {
      console.log(`[GalleryRenderDebug] ⏸️ Image ${index} WAITING for shouldLoad=true`);
    } else if (actualSrc) {
      console.log(`[GalleryRenderDebug] ✅ Image ${index} ALREADY LOADED`);
    }
  }, [actualSrc, actualDisplayUrl, shouldLoad, image.id, index]);

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

  // Determine if it's a video by checking the URL extension if isVideo prop is not explicitly set
  const urlIsVideo = actualDisplayUrl && (actualDisplayUrl.toLowerCase().endsWith('.webm') || actualDisplayUrl.toLowerCase().endsWith('.mp4') || actualDisplayUrl.toLowerCase().endsWith('.mov'));
  const isActuallyVideo = typeof image.isVideo === 'boolean' ? image.isVideo : urlIsVideo;

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

  // Check if we're currently viewing the selected shot (hide buttons if so)
  const isCurrentlyViewingSelectedShot = useMemo(() => {
    return currentViewingShotId && selectedShotIdLocal && currentViewingShotId === selectedShotIdLocal;
  }, [currentViewingShotId, selectedShotIdLocal]);
  
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
  } else if (isActuallyVideo) {
    // For videos without dimensions, use a common video aspect ratio instead of square
    // 16:9 is the most common video aspect ratio
    aspectRatioPadding = '56.25%'; // 9/16 * 100% = 56.25% for 16:9 aspect ratio
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
            <Sparkles className="h-12 w-12 text-muted-foreground opacity-30" />
          </div>
        </div>
      </div>
    );
  }

  // Check if this image is optimistically deleted
  const isOptimisticallyDeleted = optimisticDeletedIds?.has(image.id) ?? false;

  // Conditionally wrap with DraggableImage only on desktop to avoid interfering with mobile scrolling
  const imageContent = (
    <div 
        className={`border rounded-lg overflow-hidden hover:shadow-md transition-all duration-300 relative group bg-card ${
          isOptimisticallyDeleted ? 'opacity-50 scale-95 pointer-events-none' : ''
        }`}
        draggable={false}
    >
      <div className="relative w-full">
      <div 
        style={{ 
          paddingBottom: aspectRatioPadding,
          minHeight: minHeight 
        }} 
        className="relative bg-gray-200"
      >
          {isActuallyVideo ? (
              // Show video once it's loaded, regardless of shouldLoad state
              actualSrc && imageLoaded ? (
                <video
                    src={actualSrc}
                    playsInline
                    loop
                    muted
                    className="absolute inset-0 w-full h-full object-contain group-hover:opacity-80 transition-opacity duration-300 bg-black"
                    onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                    onTouchEnd={isMobile ? (e) => {
                      console.log('[MobileDebug] Video onTouchEnd fired', {
                        imageId: image.id?.substring(0, 8),
                        target: (e.target as HTMLElement)?.tagName,
                        timestamp: Date.now()
                      });
                      e.preventDefault();
                      onMobileTap(image);
                    } : undefined}
                    onMouseEnter={(e) => {
                      if (!isMobile) {
                        (e.target as HTMLVideoElement).play().catch(() => {
                          // Ignore autoplay errors (e.g., if browser blocks autoplay)
                        });
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isMobile) {
                        (e.target as HTMLVideoElement).pause();
                        (e.target as HTMLVideoElement).currentTime = 0; // Reset to beginning
                      }
                    }}
                    draggable={false}
                    style={{ cursor: 'pointer' }}
                    onError={handleImageError}
                    onLoadStart={() => setImageLoading(true)}
                    onLoadedData={handleImageLoad}
                    onAbort={() => {
                      // Reset loading state if video load was aborted
                      setImageLoading(false);
                    }}
                />
              ) : (
                <>
                  {/* Hidden video for background loading - always render to ensure loading happens */}
                  {actualSrc && !imageLoaded && (
                    <video
                      src={actualSrc}
                      style={{ display: 'none' }}
                      onLoadStart={() => setImageLoading(true)}
                      onLoadedData={handleImageLoad}
                      onError={handleImageError}
                      onAbort={() => setImageLoading(false)}
                    />
                  )}
                  {/* Video loading skeleton - only show if video hasn't loaded yet */}
                  {!imageLoaded && (
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-200 animate-pulse">
                      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
                    </div>
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
                console.log(`[GalleryRenderDebug] 🖼️ RENDERING Image ${index}:`, {
                  imageId: image.id?.substring(0, 8),
                  actualSrc: !!actualSrc,
                  imageLoaded,
                  actualSrcUrl: actualSrc?.substring(0, 50) + '...',
                  timestamp: Date.now()
                });
                return (
                <img
                  src={actualSrc}
                  alt={image.prompt || `Generated image ${index + 1}`}
                  className="absolute inset-0 w-full h-full object-cover group-hover:opacity-80 transition-opacity duration-300"
                  onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                  onTouchEnd={isMobile ? (e) => {
                    console.log('[MobileDebug] Image onTouchEnd fired', {
                      imageId: image.id?.substring(0, 8),
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
                index < 3 && console.log(`[ImageGalleryItem-${index}] Showing skeleton`, {
                  imageId: image.id,
                  imageLoaded,
                  imageLoading,
                  actualSrc
                }),
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
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <Select
                  value={selectedShotIdLocal}
                  onValueChange={(value) => {
                      setSelectedShotIdLocal(value);
                      setLastAffectedShotId(value);
                  }}
              >
                  <SelectTrigger
                      className="h-7 px-2 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs min-w-[70px] max-w-[90px] truncate focus:ring-0 focus:ring-offset-0"
                      aria-label="Select target shot"
                      onMouseEnter={(e) => e.stopPropagation()}
                      onMouseLeave={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                  >
                      <SelectValue placeholder="Shot...">
                          {selectedShotIdLocal ? (
                              (() => {
                                  const shotName = simplifiedShotOptions.find(s => s.id === selectedShotIdLocal)?.name || '';
                                  return shotName.length > 10 ? `${shotName.substring(0, 10)}...` : shotName;
                              })()
                          ) : 'Shot...'}
                      </SelectValue>
                  </SelectTrigger>
                  <SelectContent 
                      className="z-[9999] w-[var(--radix-select-trigger-width)] bg-zinc-900 border-zinc-700 text-white max-h-60 flex flex-col" 
                      style={{ zIndex: 10000 }}
                      position="popper"
                      side="top"
                      sideOffset={4}
                      align="start"
                      collisionPadding={8}
                  >
                      {/* Fixed Add Shot button at the top */}
                      {onCreateShot && (
                        <div className="flex-shrink-0 bg-zinc-900 border-b border-zinc-700 p-1">
                          {quickCreateSuccess.isSuccessful ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-full h-8 text-xs justify-center bg-zinc-600 hover:bg-zinc-500 text-white border-zinc-500"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
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
                                      console.log('[QuickCreate] Shot not in list yet, navigating with stored data');
                                      navigateToShot({ 
                                        id: quickCreateSuccess.shotId, 
                                        name: quickCreateSuccess.shotName || `Shot`,
                                        images: [],
                                        position: 0
                                      });
                                    }
                                  }
                              }}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Visit {quickCreateSuccess.shotName}
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-full h-8 text-xs justify-center bg-zinc-600 hover:bg-zinc-500 text-white border-zinc-500"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleQuickCreateAndAdd();
                              }}
                              disabled={addingToShotImageId === image.id}
                            >
                              {addingToShotImageId === image.id ? (
                                <>
                                  <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white mr-1"></div>
                                  Creating...
                                </>
                              ) : (
                                <>
                                  <PlusCircle className="h-3 w-3 mr-1" />
                                  Add Shot
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      )}
                      
                      {/* Scrollable shot list takes remaining space */}
                      <div className="flex-1 overflow-y-auto min-h-0">
                        {simplifiedShotOptions.map(shot => (
                            <SelectItem key={shot.id} value={shot.id} className="text-xs">
                                {shot.name}
                            </SelectItem>
                        ))}
                      </div>
                  </SelectContent>
              </Select>

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
                                              onOptimisticPositioned?.(image.id!);
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
                    
                    {/* Add without position button - hide when positioned, during main button success, while main button is processing, or when currently viewing this shot */}
                    {onAddToLastShotWithoutPosition && !isAlreadyPositionedInSelectedShot && showTickForImageId !== image.id && addingToShotImageId !== image.id && !isCurrentlyViewingSelectedShot && (
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
                                                        onOptimisticUnpositioned?.(image.id!);
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
          </div>
          )}

          {/* Timestamp - Top Right */}
          <TimeStamp 
            createdAt={image.createdAt} 
            position="top-right"
            showOnHover={!isMobile} // Always show on mobile, hover on desktop
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

          {/* Action buttons - Top Right (Info & Apply) */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 mt-8">
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
                          <SharedMetadataDetails
                            metadata={image.metadata}
                            variant="panel"
                            isMobile={true}
                            showUserImage={true}
                          />
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
                        <SharedMetadataDetails
                          metadata={image.metadata}
                          variant="hover"
                          isMobile={false}
                          showUserImage={true}
                        />
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

          {/* Delete button - Bottom Right */}
              {onDelete && (
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                          variant="destructive" 
                          size="icon" 
                          className="h-7 w-7 p-0 rounded-full"
                          onClick={() => onDelete(image.id!)}
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

          {/* Star button - Bottom Left */}
          <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                  onClick={() => {
                      if (onToggleStar) {
                          onToggleStar(image.id!, !image.starred);
                      } else {
                          toggleStarMutation.mutate({ 
                              id: image.id!, 
                              starred: !image.starred 
                          });
                      }
                  }}
                  disabled={toggleStarMutation.isPending}
              >
                  <Star 
                      className={`h-3.5 w-3.5 ${image.starred ? 'fill-current' : ''}`} 
                  />
              </Button>
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
        />
      )}
    </DraggableImage>
  );
};

export default React.memo(ImageGalleryItem); 