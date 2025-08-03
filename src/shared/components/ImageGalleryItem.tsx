import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2, Info, Settings, CheckCircle, AlertTriangle, Download, PlusCircle, Check, Sparkles, Star } from "lucide-react";
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
import { TimeStamp } from "@/shared/components/TimeStamp";
import { useToast } from "@/shared/hooks/use-toast";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { GeneratedImageWithMetadata, DisplayableMetadata, formatMetadataForDisplay } from "./ImageGallery";
import { log } from '@/shared/lib/logger';
import { cn } from "@/shared/lib/utils";

interface ImageGalleryItemProps {
  image: GeneratedImageWithMetadata;
  index: number;
  isDeleting: boolean;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  onOpenLightbox: (image: GeneratedImageWithMetadata) => void;
  onAddToLastShot: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDownloadImage: (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => void;
  onToggleStar?: (id: string, starred: boolean) => void;
  selectedShotIdLocal: string;
  simplifiedShotOptions: { id: string; name: string }[];
  showTickForImageId: string | null;
  onShowTick: (imageId: string) => void;
  addingToShotImageId: string | null;
  setAddingToShotImageId: (id: string | null) => void;
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
}

export const ImageGalleryItem: React.FC<ImageGalleryItemProps> = ({
  image,
  index,
  isDeleting,
  onDelete,
  onApplySettings,
  onOpenLightbox,
  onAddToLastShot,
  onDownloadImage,
  onToggleStar,
  selectedShotIdLocal,
  simplifiedShotOptions,
  showTickForImageId,
  onShowTick,
  addingToShotImageId,
  setAddingToShotImageId,
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
}) => {
  const { toast } = useToast();
  const displayUrl = getDisplayUrl(image.thumbUrl || image.url);
  // Track loading state for this specific image
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [imageRetryCount, setImageRetryCount] = useState<number>(0);
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const MAX_RETRIES = 2;

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
    setImageLoadError(false);
    setImageRetryCount(0);
    setImageLoaded(false);
    setImageLoading(false);
  }, [displayUrl]);

  // Progressive loading: only set src when shouldLoad is true
  const [actualSrc, setActualSrc] = useState<string | null>(null);

  // Generate display URL with retry cache busting
  const actualDisplayUrl = useMemo(() => {
    if (imageRetryCount > 0) {
      return getDisplayUrl(image.thumbUrl || image.url, true); // Force refresh with cache busting
    }
    return displayUrl;
  }, [displayUrl, image.thumbUrl, image.url, imageRetryCount]);

  // Always start loading images immediately for better prefetching
  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates after unmount
    
    if (!actualSrc) {
      // Don't load placeholder URLs - they indicate missing/invalid image data
      if (actualDisplayUrl === '/placeholder.svg' || !actualDisplayUrl) {
        console.warn(`[ImageGalleryItem] Skipping load for invalid URL: ${actualDisplayUrl}, image:`, image);
        setImageLoadError(true);
        return;
      }
      
      // Cache-aware loading strategy
      if (isPriority) {
        // Priority images (first 10) - likely cached from preloading
        // Load immediately and ensure loading state is false
        setActualSrc(actualDisplayUrl);
        setImageLoading(false);
      } else {
        // Non-priority images - show minimal loading state
        setImageLoading(true);
        
        const timeout = setTimeout(() => {
          if (isMounted && actualDisplayUrl !== '/placeholder.svg') {
            setActualSrc(actualDisplayUrl);
            setImageLoading(false); // Ensure loading state is cleared
          }
        }, 20); // Very short delay for non-priority
        
        return () => {
          clearTimeout(timeout);
          isMounted = false;
        };
      }
      
      return () => {
        isMounted = false;
      };
    }
    
    return () => {
      isMounted = false;
    };
  }, [actualSrc, actualDisplayUrl, isPriority, image]); // Removed shouldLoad dependency

  // Only format metadata when actually needed (Info tooltip/popover is opened)
  // This prevents 150-200ms of string building work during initial render on mobile
  const metadataForDisplay = useMemo(() => {
    if (!image.metadata) return "No metadata available.";
    
    // On mobile, only format when popover is open; on desktop, only when tooltip might be shown
    const shouldFormat = isMobile 
      ? (mobilePopoverOpenImageId === image.id)
      : isInfoOpen;
    
    if (!shouldFormat) return '';
    
    return formatMetadataForDisplay(image.metadata);
  }, [image.metadata, isMobile, mobilePopoverOpenImageId, image.id, isInfoOpen]);
  const isCurrentDeleting = isDeleting;
  const imageKey = image.id || `image-${actualDisplayUrl}-${index}`;

  // Determine if it's a video by checking the URL extension if isVideo prop is not explicitly set
  const urlIsVideo = actualDisplayUrl && (actualDisplayUrl.toLowerCase().endsWith('.webm') || actualDisplayUrl.toLowerCase().endsWith('.mp4') || actualDisplayUrl.toLowerCase().endsWith('.mov'));
  const isActuallyVideo = typeof image.isVideo === 'boolean' ? image.isVideo : urlIsVideo;

  // Placeholder check
  const isPlaceholder = !image.id && actualDisplayUrl === "/placeholder.svg";
  const currentTargetShotName = selectedShotIdLocal ? simplifiedShotOptions.find(s => s.id === selectedShotIdLocal)?.name : undefined;
  
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

  // Conditionally wrap with DraggableImage only on desktop to avoid interfering with mobile scrolling
  const imageContent = (
    <div 
        className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow relative group bg-card"
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
              shouldLoad && actualSrc && !isGalleryLoading ? (
                <video
                    src={actualSrc}
                    playsInline
                    loop
                    muted
                    className="absolute inset-0 w-full h-full object-contain group-hover:opacity-80 transition-opacity duration-300 bg-black"
                    onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                    onTouchEnd={isMobile ? (e) => {
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
                    style={{ cursor: 'pointer' }}
                    onError={handleImageError}
                    onLoadStart={() => setImageLoading(true)}
                    onLoadedData={() => {
                      setImageLoading(false);
                      setImageLoaded(true);
                    }}
                    onAbort={() => {
                      // Reset loading state if video load was aborted
                      setImageLoading(false);
                    }}
                />
              ) : (
                <>
                  {/* Hidden video for background loading when shouldLoad is false */}
                  {!shouldLoad && actualSrc && (
                    <video
                      src={actualSrc}
                      style={{ display: 'none' }}
                      onLoadedData={() => {
                        setImageLoading(false);
                        setImageLoaded(true);
                      }}
                      onError={handleImageError}
                    />
                  )}
                  {/* Video loading skeleton or progressive loading placeholder */}
                  <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-200 animate-pulse">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
                  </div>
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
              {/* Visible image when shouldLoad is true and image is loaded */}
              {shouldLoad && actualSrc && imageLoaded && !isGalleryLoading && (
                <img
                  src={actualSrc}
                  alt={image.prompt || `Generated image ${index + 1}`}
                  className="absolute inset-0 w-full h-full object-cover group-hover:opacity-80 transition-opacity duration-300"
                  onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
                  onTouchEnd={isMobile ? (e) => {
                    e.preventDefault();
                    onMobileTap(image);
                  } : undefined}
                  style={{ cursor: 'pointer' }}
                />
              )}
              
              {/* Hidden image for background loading when shouldLoad is false or image not loaded yet */}
              {actualSrc && (!shouldLoad || !imageLoaded) && (
                <img
                  src={actualSrc}
                  alt={image.prompt || `Generated image ${index + 1}`}
                  style={{ display: 'none' }}
                  onError={handleImageError}
                  onLoad={() => {
                    setImageLoading(false);
                    setImageLoaded(true);
                  }}
                  onLoadStart={() => setImageLoading(true)}
                  onAbort={() => {
                    setImageLoading(false);
                  }}
                />
              )}
              
              {/* Show skeleton while image is loading or shouldLoad is false */}
              {/* Priority images bypass gallery loading state to prevent flash */}
              {(!shouldLoad || !imageLoaded || imageLoading || (isGalleryLoading && !isPriority)) && (
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
                  <SelectContent className="z-[9999]" style={{ zIndex: 10000 }}>
                      {simplifiedShotOptions.map(shot => (
                          <SelectItem key={shot.id} value={shot.id} className="text-xs">
                              {shot.name}
                          </SelectItem>
                      ))}
                  </SelectContent>
              </Select>

              <Tooltip>
                  <TooltipTrigger asChild>
                      <Button
                          variant="outline"
                          size="icon"
                          className={`h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white ${showTickForImageId === image.id ? 'bg-green-500 hover:bg-green-600 !text-white' : ''}`}
                          onClick={async () => {
                              if (!selectedShotIdLocal) {
                                  toast({ title: "Select a Shot", description: "Please select a shot first to add this image.", variant: "destructive" });
                                  return;
                              }
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
                                          
                                          log('MobileAddToShot', `Attempt ${retryCount + 1}/${maxRetries} for image ${image.id} with URL: ${imageUrlToUse?.substring(0, 80)}...`);
                                          
                                          success = await onAddToLastShot(image.id!, imageUrlToUse, thumbUrlToUse);
                                          
                                          if (success) {
                                              onShowTick(image.id!);
                                              log('MobileAddToShot', `Success on attempt ${retryCount + 1} for image ${image.id}`);
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
                          disabled={!selectedShotIdLocal || showTickForImageId === image.id || addingToShotImageId === image.id}
                          aria-label={showTickForImageId === image.id ? `Added to ${currentTargetShotName}` : (currentTargetShotName ? `Add to shot: ${currentTargetShotName}` : "Add to selected shot")}
                          onPointerDown={(e) => e.stopPropagation()}
                      >
                          {addingToShotImageId === image.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                          ) : showTickForImageId === image.id ? (
                              <Check className="h-4 w-4" />
                          ) : (
                              <PlusCircle className="h-4 w-4" />
                          )}
                      </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                      {showTickForImageId === image.id ? `Added to ${currentTargetShotName || 'shot'}` :
                      (selectedShotIdLocal && currentTargetShotName ? `Add to: ${currentTargetShotName}` : "Select a shot then click to add")}
                  </TooltipContent>
              </Tooltip>
          </div>
          )}

          {/* Timestamp - Top Right */}
          <TimeStamp 
            createdAt={image.createdAt} 
            position="top-right"
          />

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
                        className="z-[10010] max-w-48 text-xs p-3 leading-relaxed shadow-lg bg-background border max-h-80 overflow-y-auto rounded-md"
                      >
                        {image.metadata?.userProvidedImageUrl && (
                          <img
                            src={image.metadata.userProvidedImageUrl}
                            alt="User provided image preview"
                            className="w-full h-auto max-h-24 object-contain rounded-sm mb-2 border"
                            loading="lazy"
                          />
                        )}
                        {metadataForDisplay && (
                          <pre className="font-sans whitespace-pre-wrap">{metadataForDisplay}</pre>
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
                      className="max-w-48 text-xs p-3 leading-relaxed shadow-lg bg-background border max-h-80 overflow-y-auto"
                    >
                      {image.metadata?.userProvidedImageUrl && (
                        <img
                          src={image.metadata.userProvidedImageUrl}
                          alt="User provided image preview"
                          className="w-full h-auto max-h-24 object-contain rounded-sm mb-2 border"
                          loading="lazy"
                        />
                      )}
                      {metadataForDisplay && (
                        <pre className="font-sans whitespace-pre-wrap">{metadataForDisplay}</pre>
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

  return isMobile ? (
    <React.Fragment key={imageKey}>
      {imageContent}
    </React.Fragment>
  ) : (
    <DraggableImage key={`draggable-${imageKey}`} image={image}>
      {imageContent}
    </DraggableImage>
  );
};

export default React.memo(ImageGalleryItem); 