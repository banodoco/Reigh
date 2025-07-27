import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2, Info, Settings, CheckCircle, AlertTriangle, Download, PlusCircle, Check, Sparkles, Star } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import { DraggableImage } from "@/shared/components/DraggableImage";
import { getDisplayUrl } from "@/shared/lib/utils";
import { TimeStamp } from "@/shared/components/TimeStamp";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { GeneratedImageWithMetadata, DisplayableMetadata, formatMetadataForDisplay } from "./ImageGallery";

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
}) => {
  const displayUrl = getDisplayUrl(image.thumbUrl || image.url);
  // Track loading state for this specific image
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [imageRetryCount, setImageRetryCount] = useState<number>(0);
  const MAX_RETRIES = 2;

  // Handle image load error with retry mechanism
  const handleImageError = useCallback(() => {
    console.warn(`Image load failed for ${image.id}: ${displayUrl}, retry ${imageRetryCount + 1}/${MAX_RETRIES}`);
    
    if (imageRetryCount < MAX_RETRIES) {
      // Retry with cache busting
      setTimeout(() => {
        setImageRetryCount(prev => prev + 1);
      }, 1000 * (imageRetryCount + 1)); // Exponential backoff
    } else {
      setImageLoadError(true);
    }
  }, [displayUrl, image.id, imageRetryCount]);

  // Reset error state when URL changes (new image)
  useEffect(() => {
    setImageLoadError(false);
    setImageRetryCount(0);
  }, [displayUrl]);

  // Generate display URL with retry cache busting
  const actualDisplayUrl = useMemo(() => {
    if (imageRetryCount > 0) {
      return getDisplayUrl(image.thumbUrl || image.url, true); // Force refresh with cache busting
    }
    return displayUrl;
  }, [displayUrl, image.thumbUrl, image.url, imageRetryCount]);

  const metadataForDisplay = image.metadata ? formatMetadataForDisplay(image.metadata) : "No metadata available.";
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

  const handleAddToShot = async () => {
    setAddingToShotImageId(image.id);
    try {
      const success = await onAddToLastShot(image.id, image.url, image.thumbUrl);
      if (success) {
        onShowTick(image.id);
      }
    } finally {
      setAddingToShotImageId(null);
    }
  };

  const imageContent = (
    <div 
      className={`border rounded-lg overflow-hidden transition-all duration-300 relative group ${
        isCurrentDeleting 
          ? 'opacity-50 scale-95 cursor-not-allowed' 
          : 'hover:shadow-xl hover:border-primary/50 cursor-pointer'
      } ${mobileActiveImageId === image.id ? 'ring-2 ring-primary' : ''}`}
    >
      {/* Image/Video display */}
      <div 
        className="relative bg-muted"
        style={{ paddingBottom: aspectRatioPadding, minHeight }}
        onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
        onTouchEnd={isMobile ? (e) => {
          e.preventDefault();
          onMobileTap(image);
        } : undefined}
      >
        {imageLoadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load image</p>
            <p className="text-xs text-muted-foreground mt-1">ID: {image.id}</p>
          </div>
        ) : isActuallyVideo ? (
          <video
            src={actualDisplayUrl}
            className="absolute inset-0 w-full h-full object-contain"
            controls={false}
            muted
            loop
            playsInline
            onError={handleImageError}
            onDoubleClick={isMobile ? undefined : () => onOpenLightbox(image)}
            onTouchEnd={isMobile ? (e) => {
              e.preventDefault();
              onMobileTap(image);
            } : undefined}
          />
        ) : (
          <img 
            src={actualDisplayUrl}
            alt={image.prompt || "Generated image"} 
            className="absolute inset-0 w-full h-full object-contain"
            loading="lazy"
            onError={handleImageError}
          />
        )}
        
        {/* Error message overlay */}
        {image.error && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-destructive/90 text-destructive-foreground rounded-md p-3 text-sm text-center">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
              {image.error}
            </div>
          </div>
        )}

        {/* Success tick overlay */}
        {showTickForImageId === image.id && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none animate-in fade-in duration-200">
            <div className="bg-green-500 rounded-full p-3 animate-in zoom-in duration-300">
              <Check className="h-8 w-8 text-white" />
            </div>
          </div>
        )}

        {/* Timestamp in corner */}
        {image.createdAt && (
          <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <TimeStamp 
              timestamp={image.createdAt} 
              className="text-xs bg-black/70 text-white px-2 py-1 rounded"
            />
          </div>
        )}

        {/* Starred indicator */}
        {image.starred && (
          <div className="absolute top-2 right-2">
            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500 drop-shadow-md" />
          </div>
        )}
      </div>

      {/* Action buttons */}
      {(!isMobile || mobileActiveImageId === image.id) && (
        <>
          <div className={`absolute bottom-2 right-2 flex gap-1 ${
            isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          } transition-opacity`}>
            {/* Info/Metadata button */}
            <PopoverPrimitive.Root 
              open={mobilePopoverOpenImageId === image.id}
              onOpenChange={(open) => {
                if (isMobile) {
                  setMobilePopoverOpenImageId(open ? image.id : null);
                }
              }}
            >
              <PopoverPrimitive.Trigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-black/70 hover:bg-black/90 text-white border-0"
                  disabled={isCurrentDeleting}
                >
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                  className="z-50 w-80 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95"
                  sideOffset={5}
                  side={isMobile ? "top" : "left"}
                  align="end"
                >
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Image Details</h4>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap break-words">
                      {metadataForDisplay}
                    </pre>
                    {onApplySettings && image.metadata && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() => onApplySettings(image.metadata!)}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Apply Settings
                      </Button>
                    )}
                  </div>
                </PopoverPrimitive.Content>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>

            {/* Add to shot button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 bg-black/70 hover:bg-black/90 text-white border-0"
                    onClick={handleAddToShot}
                    disabled={isCurrentDeleting || addingToShotImageId === image.id || !currentTargetShotName}
                  >
                    {addingToShotImageId === image.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <PlusCircle className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{currentTargetShotName ? `Add to shot: ${currentTargetShotName}` : 'Select a shot first'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Download button */}
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-black/70 hover:bg-black/90 text-white border-0"
              onClick={() => onDownloadImage(
                image.url,
                `generated-${image.id || 'image'}`,
                image.id,
                isActuallyVideo,
                image.metadata?.content_type
              )}
              disabled={isCurrentDeleting || downloadingImageId === image.id}
            >
              {downloadingImageId === image.id ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>

            {/* Delete button */}
            {onDelete && (
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 bg-black/70 hover:bg-red-600 text-white border-0"
                onClick={() => onDelete(image.id)}
                disabled={isCurrentDeleting}
              >
                {isCurrentDeleting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {/* Star button - separate from other actions */}
          <div className={`absolute bottom-2 left-2 ${
            isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          } transition-opacity`}>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-black/70 hover:bg-black/90 text-white border-0"
              onClick={() => onToggleStar?.(image.id, !image.starred)}
              disabled={isCurrentDeleting}
            >
              <Star 
                className={`h-3.5 w-3.5 ${image.starred ? 'fill-current' : ''}`} 
              />
            </Button>
          </div>
        </>
      )}
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