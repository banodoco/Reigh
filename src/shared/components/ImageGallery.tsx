import React, { useState, useEffect, useRef } from "react";
import { Trash2, Info, Settings, CheckCircle, AlertTriangle, Download, PlusCircle, Check, Sparkles, Filter } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import MediaLightbox from "@/shared/components/MediaLightbox";
import { useToast } from "@/shared/hooks/use-toast";
import { Shot, GenerationRow } from "@/types/shots";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
// Removed nanoid import to avoid random generation overhead per render
import { formatDistanceToNow, isValid } from "date-fns";
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { DraggableImage } from "@/shared/components/DraggableImage";
import { getDisplayUrl } from "@/shared/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-mobile";

// Define the structure for individual LoRA details within metadata
export interface MetadataLora {
  id: string; // Added Model ID
  name: string; // Added Name
  path: string;
  strength: number; // Changed from scale (string) to strength (number 0-100)
  previewImageUrl?: string; // Added preview image
}

// Define the structure of the metadata object we expect for display
export interface DisplayableMetadata extends Record<string, any> {
  prompt?: string;
  imagesPerPrompt?: number;
  seed?: number;
  width?: number;
  height?: number;
  content_type?: string;
  activeLoras?: MetadataLora[];
  depthStrength?: number; // Normalized (0-1)
  softEdgeStrength?: number; // Normalized (0-1)
  userProvidedImageUrl?: string | null;
  num_inference_steps?: number;
  guidance_scale?: number;
  scheduler?: string;
  tool_type?: string; // Added for filtering
  original_image_filename?: string;
  original_frame_timestamp?: number; // For video frames
  source_frames?: number; // For reconstructed videos
  original_duration?: number; // For reconstructed videos
  // Allow any other keys for flexibility
}

// Updated interface for images passed to the gallery
export interface GeneratedImageWithMetadata {
  id: string;
  url: string; // This will now be a relative path for DB-sourced images
  prompt?: string;
  seed?: number;
  metadata?: DisplayableMetadata;
  temp_local_path?: string; // For unsaved local generations
  error?: string; // To display an error message on the image card
  file?: File; // Optional file object, e.g. for unsaved SDXL Turbo gens
  isVideo?: boolean; // To distinguish video from image in the gallery
  unsaved?: boolean; // Optional flag for images not saved to DB
  createdAt?: string; // Add a creation timestamp
}

interface ImageGalleryProps {
  images: GeneratedImageWithMetadata[];
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  allShots: Shot[];
  lastShotId?: string;
  lastShotNameForTooltip?: string;
  onAddToLastShot: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  currentToolType?: string; // Added for filtering
  initialFilterState?: boolean; // Added for default filter state
  onImageSaved?: (imageId: string, newImageUrl: string) => void; // Callback when image is saved with changes
  /** Zero-based offset of the first image in `images` relative to the full list after any server-side filtering/pagination. */
  offset?: number;
  /** Total number of items in the full list (after any server-side filtering/pagination but before client-side page slice). */
  totalCount?: number;
  /** Use white text for pagination and filter labels (e.g., in dark pane). */
  whiteText?: boolean;
  /** Number of columns per row for the grid layout (default 5) */
  columnsPerRow?: number;
  /** Initial media type filter state ('all' | 'image' | 'video') */
  initialMediaTypeFilter?: 'all' | 'image' | 'video';
}

// Helper to format metadata for display
const formatMetadataForDisplay = (metadata: DisplayableMetadata): string => {
  
  let displayText = "";
  if (metadata.prompt) displayText += `Prompt: ${metadata.prompt}\n`;
  if (metadata.seed) displayText += `Seed: ${metadata.seed}\n`;
  if (metadata.imagesPerPrompt) displayText += `Images/Prompt: ${metadata.imagesPerPrompt}\n`;
  if (metadata.width && metadata.height) displayText += `Dimensions: ${metadata.width}x${metadata.height}\n`;
  if (metadata.num_inference_steps) displayText += `Steps: ${metadata.num_inference_steps}\n`;
  if (metadata.guidance_scale) displayText += `Guidance: ${metadata.guidance_scale}\n`;
  if (metadata.scheduler) displayText += `Scheduler: ${metadata.scheduler}\n`;
  if (metadata.tool_type) displayText += `Tool: ${metadata.tool_type}\n`; // Display tool_type
  
  if (metadata.activeLoras && metadata.activeLoras.length > 0) {
    displayText += "Active LoRAs:\n";
    metadata.activeLoras.forEach(lora => {
      // Now using lora.name and lora.strength directly
      const displayName = lora.name || lora.id; // Fallback to ID if name is missing
      displayText += `  - ${displayName} (Strength: ${lora.strength}%)\n`;
    });
  }
  if (metadata.depthStrength !== undefined) displayText += `Depth Strength: ${(metadata.depthStrength * 100).toFixed(0)}%\n`;
  if (metadata.softEdgeStrength !== undefined) displayText += `Soft Edge Strength: ${(metadata.softEdgeStrength * 100).toFixed(0)}%\n`;
  if (metadata.userProvidedImageUrl) {
    const urlParts = metadata.userProvidedImageUrl.split('/');
    const imageName = urlParts[urlParts.length -1] || metadata.userProvidedImageUrl;
    displayText += `User Image: ${imageName}\n`;
  }
  
  return displayText.trim() || "No metadata available.";
};

// Add helper component below imports (before ImageGallery component) or inside file near top: create InfoPopover
const InfoPopover: React.FC<{ metadata: DisplayableMetadata | undefined; metadataForDisplay: string }> = ({ metadata, metadataForDisplay }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Close popover when pointer leaves both trigger and content
  const closePopover = () => setIsOpen(false);

  return (
    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
            onClick={() => setIsOpen((prev) => !prev)}
            onPointerLeave={(e) => {
              // If pointer leaves the button and not heading into popover content, close after a short delay
              // Use setTimeout to allow entering the content without closing immediately
              // Use requestAnimationFrame for better performance than setTimeout
              requestAnimationFrame(() => {
                if (!document.querySelector(':hover')?.closest('[data-info-popover]')) {
                  closePopover();
                }
              });
            }}
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          className="max-w-md text-xs p-3 leading-relaxed shadow-lg bg-background border max-h-80 overflow-y-auto"
          onPointerLeave={closePopover}
          data-info-popover="true"
        >
          {metadata?.userProvidedImageUrl && (
            <img
              src={metadata.userProvidedImageUrl}
              alt="User provided image preview"
              className="w-full h-auto max-h-24 object-contain rounded-sm mb-2 border"
              loading="lazy"
            />
          )}
          <pre className="font-sans whitespace-pre-wrap">{metadataForDisplay}</pre>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const ImageGallery: React.FC<ImageGalleryProps> = ({ images, onDelete, isDeleting, onApplySettings, allShots, lastShotId, onAddToLastShot, currentToolType, initialFilterState = true, onImageSaved, offset = 0, totalCount, whiteText = false, columnsPerRow = 5, initialMediaTypeFilter = 'all' }) => {
  const [activeLightboxMedia, setActiveLightboxMedia] = useState<GenerationRow | null>(null);
  const [downloadingImageId, setDownloadingImageId] = useState<string | null>(null);
  const { toast } = useToast();
  const { setLastAffectedShotId } = useLastAffectedShot();
  const { currentShotId } = useCurrentShot();
  const simplifiedShotOptions = React.useMemo(() => allShots.map(s => ({ id: s.id, name: s.name })), [allShots]);

  const [selectedShotIdLocal, setSelectedShotIdLocal] = useState<string>(() => 
    currentShotId || lastShotId || (simplifiedShotOptions.length > 0 ? simplifiedShotOptions[0].id : "")
  );
  const [showTickForImageId, setShowTickForImageId] = useState<string | null>(null);

  // State for the filter checkbox
  const [filterByToolType, setFilterByToolType] = useState<boolean>(initialFilterState);
  // State for the new media type filter
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>(initialMediaTypeFilter);

  // Pagination state (45 items per page)
  const ITEMS_PER_PAGE = 45;
  const [page, setPage] = React.useState(0);

  // When filters change, reset to first page (debounced to avoid rapid state changes)
  React.useEffect(() => {
    const timer = setTimeout(() => setPage(0), 10);
    return () => clearTimeout(timer);
  }, [filterByToolType, mediaTypeFilter]);

  const tickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const newSelectedShotId = currentShotId || lastShotId || (simplifiedShotOptions.length > 0 ? simplifiedShotOptions[0].id : "");
    setSelectedShotIdLocal(newSelectedShotId);
    if (newSelectedShotId) {
      setLastAffectedShotId(newSelectedShotId);
    }
  }, [currentShotId, lastShotId, simplifiedShotOptions, setLastAffectedShotId]);

  useEffect(() => {
    // When the component mounts or initialFilterState prop changes, update the filter state
    setFilterByToolType(initialFilterState);
  }, [initialFilterState]);

  useEffect(() => {
    return () => {
      if (tickTimeoutRef.current) {
        clearTimeout(tickTimeoutRef.current);
      }
    };
  }, []);

  const handleOpenLightbox = (image: GeneratedImageWithMetadata) => {
    // We need to map the partial `GeneratedImageWithMetadata` to a `GenerationRow` for the lightbox
    const mediaRow: GenerationRow = {
      id: image.id,
      imageUrl: image.url,
      location: image.url, // Assuming url is the location
      type: image.isVideo ? 'video_travel_output' : 'single_image', // Infer type
      createdAt: image.createdAt || new Date().toISOString(),
      metadata: image.metadata,
      thumbUrl: image.isVideo ? image.url : undefined, // simple fallback
    };
    setActiveLightboxMedia(mediaRow);
  };

  const handleCloseLightbox = () => {
    setActiveLightboxMedia(null);
  };

  const handleImageSaved = (newImageUrl: string) => {
    if (activeLightboxMedia?.id && onImageSaved) {
      onImageSaved(activeLightboxMedia.id, newImageUrl);
    }
  };
  
  const handleNextImage = () => {
    if (!activeLightboxMedia) return;
    const currentIndex = filteredImages.findIndex(img => img.id === activeLightboxMedia.id);
    if (currentIndex < filteredImages.length - 1) {
      handleOpenLightbox(filteredImages[currentIndex + 1]);
    }
  };

  const handlePreviousImage = () => {
    if (!activeLightboxMedia) return;
    const currentIndex = filteredImages.findIndex(img => img.id === activeLightboxMedia.id);
    if (currentIndex > 0) {
      handleOpenLightbox(filteredImages[currentIndex - 1]);
    }
  };

  const handleShotChange = (shotId: string) => {
    setSelectedShotIdLocal(shotId);
    setLastAffectedShotId(shotId);
  };

  const handleShowTick = (imageId: string) => {
    setShowTickForImageId(imageId);
    if (tickTimeoutRef.current) clearTimeout(tickTimeoutRef.current);
    tickTimeoutRef.current = setTimeout(() => {
      setShowTickForImageId(null);
    }, 2000);
  };


  const handleDownloadImage = async (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => {
    const currentDownloadId = imageId || filename;
    setDownloadingImageId(currentDownloadId);
    const accessibleImageUrl = getDisplayUrl(rawUrl); // Use display URL for download

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', accessibleImageUrl, true); // Use accessibleImageUrl
      xhr.responseType = 'blob';

      xhr.onload = function() {
        if (this.status === 200) {
          const blobContentType = this.getResponseHeader('content-type') || originalContentType || (isVideo ? 'video/webm' : 'image/png');
          const blob = new Blob([this.response], { type: blobContentType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          
          // Attempt to get a better filename extension
          let fileExtension = blobContentType.split('/')[1];
          if (!fileExtension || fileExtension === 'octet-stream') {
            // Fallback to guessing from URL or defaulting
            const urlParts = accessibleImageUrl.split('.');
            fileExtension = urlParts.length > 1 ? urlParts.pop()! : (isVideo ? 'webm' : 'png');
          }
          const downloadFilename = filename.includes('.') ? filename : `${filename}.${fileExtension}`;
          a.download = downloadFilename;

          document.body.appendChild(a);
          a.click();
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
          toast({ title: "Download Started", description: filename });
        } else {
          throw new Error(`Failed to fetch image: ${this.status} ${this.statusText}`);
        }
      };

      xhr.onerror = function() {
        throw new Error('Network request failed');
      };

      xhr.send();
    } catch (error) {
      console.error("Error downloading image:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({ 
        title: "Download Failed", 
        description: `Could not download ${filename}. ${errorMessage}`,
        variant: "destructive" 
      });
    } finally {
      setDownloadingImageId(null);
    }
  };

  const filteredImages = React.useMemo(() => {
    let currentFiltered = images;

    // 1. Apply tool_type filter
    if (filterByToolType && currentToolType) {
      currentFiltered = currentFiltered.filter(image => {
        const metadata = image.metadata;
        if (!metadata || !metadata.tool_type) return false; // No metadata or tool_type, exclude
        
        // If currentToolType is 'edit-travel', we want to include anything that starts with 'edit-travel'
        // This covers 'edit-travel', 'edit-travel-flux', 
        // 'edit-travel-reconstructed-client', 'edit-travel-reconstructed-flux-client', etc.
        if (currentToolType === 'edit-travel') {
          return metadata.tool_type.startsWith('edit-travel');
        }
        
        // For other tools, it's an exact match to the tool_type or its reconstructed client version
        // (e.g., 'image-generation' or 'image-generation-reconstructed-client')
        // This part might need adjustment if other tools also have varied reconstructed types.
        // For now, assuming reconstructed videos from other tools might also follow a pattern.
        // A more robust way for generic tools would be needed if they also have diverse sub-types.
        if (metadata.tool_type === currentToolType) return true;
        if (metadata.tool_type === `${currentToolType}-reconstructed-client`) return true; // Example for a generic tool

        // Fallback for exact match if no special handling for currentToolType
        return metadata.tool_type === currentToolType;
      });
    }

    // 2. Apply mediaTypeFilter
    if (mediaTypeFilter !== 'all') {
      currentFiltered = currentFiltered.filter(image => {
        const urlIsVideo = image.url && (image.url.toLowerCase().endsWith('.webm') || image.url.toLowerCase().endsWith('.mp4') || image.url.toLowerCase().endsWith('.mov'));
        const isActuallyVideo = typeof image.isVideo === 'boolean' ? image.isVideo : urlIsVideo;
        
        // console.log(
        //     `[ImageGallery_${galleryLogId}_FilterItem_Media] ID: ${image.id}, isVideo: ${image.isVideo}, urlIsVideo: ${urlIsVideo}, isActuallyVideo: ${isActuallyVideo}, mediaTypeFilter: ${mediaTypeFilter}, Match: ${mediaTypeFilter === 'image' ? !isActuallyVideo : isActuallyVideo}`
        // );

        if (mediaTypeFilter === 'image') {
          return !isActuallyVideo;
        }
        if (mediaTypeFilter === 'video') {
          return isActuallyVideo;
        }
        return true; // Should not be reached if filter is 'image' or 'video'
      });
    }
        
    return currentFiltered;
  }, [images, filterByToolType, currentToolType, mediaTypeFilter]);

  // Calculate pagination helpers (must come after filteredImages is defined)
  const totalFilteredItems = filteredImages.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredItems / ITEMS_PER_PAGE));
  const paginatedImages = React.useMemo(() =>
    filteredImages.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE),
    [filteredImages, page]
  );

  const rangeStart = totalFilteredItems === 0 ? 0 : page * ITEMS_PER_PAGE + 1;
  const rangeEnd = rangeStart + paginatedImages.length - 1;

  // Ensure current page is within bounds when totalPages changes (e.g., after filtering)
  React.useEffect(() => {
    if (page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, page]);

  const isMobile = useIsMobile();

  return (
                <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-x-4 gap-y-2"> {/* Added gap-y-2 and flex-wrap for better responsiveness */}
            {images.length > 0 && (
              <div className="flex items-center gap-2">
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      Prev
                    </Button>
                    <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'} whitespace-nowrap mx-4`}>
                      Showing {rangeStart}-{rangeEnd} (out of {totalFilteredItems})
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next
                    </Button>
                  </>
                )}
                {totalPages === 1 && (
                  <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'} whitespace-nowrap ml-auto`}>
                    Showing {rangeStart}-{rangeEnd} (out of {totalFilteredItems})
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap"> {/* Grouping filters, added flex-wrap */}
                {/* New Media Type Filter */}
                <div className="flex items-center space-x-1.5">
                    <Label htmlFor="media-type-filter" className={`text-sm font-medium ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>Type:</Label>
                    <Select value={mediaTypeFilter} onValueChange={(value: 'all' | 'image' | 'video') => setMediaTypeFilter(value)}>
                        <SelectTrigger id="media-type-filter" className="h-8 text-xs w-[100px]"> {/* Adjusted width slightly */}
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">All</SelectItem>
                            <SelectItem value="image" className="text-xs">Images</SelectItem>
                            <SelectItem value="video" className="text-xs">Videos</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Existing Tool Type Filter */}
                {currentToolType && (
                    <div className="flex items-center space-x-2"> {/* Removed pt-1 as alignment handled by flex group */}
                        <Checkbox
                            id={`filter-tool-${currentToolType}`}
                            checked={filterByToolType}
                            onCheckedChange={(checked) => setFilterByToolType(Boolean(checked))}
                            aria-label={`Filter by ${currentToolType} tool`}
                        />
                        <Label htmlFor={`filter-tool-${currentToolType}`} className={`text-sm font-medium cursor-pointer ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>
                            Only from "{currentToolType}"
                        </Label>
                    </div>
                )}
            </div>
        </div>

        {images.length > 0 && filteredImages.length === 0 && (filterByToolType || mediaTypeFilter !== 'all') && (
          <div className="text-center py-12 mt-8 text-muted-foreground border rounded-lg bg-card shadow-sm" style={{ marginBottom: '4rem' }}>
            <Filter className="mx-auto h-10 w-10 mb-3 opacity-60" />
            <p className="font-semibold">No items match the current filters.</p>
            <p className="text-sm">Adjust the filters or uncheck them to see all items.</p>
          </div>
        )}

        {images.length === 0 && (
           <div className="text-center py-12 mt-8 text-muted-foreground border rounded-lg bg-card shadow-sm" style={{ marginBottom: '4rem' }}>
             <Sparkles className="mx-auto h-10 w-10 mb-3 opacity-60" />
             <p className="font-semibold">No images generated yet.</p>
             <p className="text-sm">Use the controls above to generate some images.</p>
           </div>
        )}

        {paginatedImages.length > 0 && (
            <div className={`grid gap-4 mb-8 ${columnsPerRow === 6 ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5'}`}>
            {paginatedImages.map((image, index) => {
                const displayUrl = getDisplayUrl(image.url);
                const metadataForDisplay = image.metadata ? formatMetadataForDisplay(image.metadata) : "No metadata available.";
                const isCurrentDeleting = isDeleting === image.id;
                const imageKey = image.id || `image-${displayUrl}-${index}`;
                // Removed unused render log ID

                // Determine if it's a video by checking the URL extension if isVideo prop is not explicitly set
                const urlIsVideo = displayUrl && (displayUrl.toLowerCase().endsWith('.webm') || displayUrl.toLowerCase().endsWith('.mp4') || displayUrl.toLowerCase().endsWith('.mov'));
                const isActuallyVideo = typeof image.isVideo === 'boolean' ? image.isVideo : urlIsVideo;

                // Placeholder check should ideally rely on more than just !image.id if placeholders are actual objects in the array
                // For this implementation, we assume placeholders passed to `images` prop might not have `id`
                const isPlaceholder = !image.id && displayUrl === "/placeholder.svg";
                const currentTargetShotName = selectedShotIdLocal ? simplifiedShotOptions.find(s => s.id === selectedShotIdLocal)?.name : undefined;
                
                let aspectRatioPadding = '100%'; 
                if (image.metadata?.width && image.metadata?.height) {
                aspectRatioPadding = `${(image.metadata.height / image.metadata.width) * 100}%`;
                }

                // If it's a placeholder (e.g. from Array(4).fill for loading state), render simplified placeholder item
                // This specific placeholder rendering should only occur if filteredImages actually contains such placeholders.
                // The filter logic above might already exclude them if they don't have metadata.tool_type
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
                    <div style={{ paddingBottom: aspectRatioPadding }} className="relative bg-gray-200">
                        {isActuallyVideo ? (
                            <video
                                src={displayUrl}
                                controls
                                playsInline
                                loop
                                muted
                                className="absolute inset-0 w-full h-full object-contain group-hover:opacity-80 transition-opacity duration-300 bg-black"
                                onDoubleClick={() => handleOpenLightbox(image)} // Consider if lightbox makes sense for video, or a different action
                                style={{ cursor: 'pointer' }}
                            />
                        ) : (
                            <img
                                src={displayUrl}
                                alt={image.prompt || `Generated image ${index + 1}`}
                                className="absolute inset-0 w-full h-full object-cover group-hover:opacity-80 transition-opacity duration-300"
                                onDoubleClick={() => handleOpenLightbox(image)}
                                style={{ cursor: 'pointer' }}
                                loading="lazy"
                            />
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
                                    className="h-7 px-2 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs min-w-[70px] max-w-[120px] truncate focus:ring-0 focus:ring-offset-0"
                                    aria-label="Select target shot"
                                    onMouseEnter={(e) => e.stopPropagation()}
                                    onMouseLeave={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                >
                                    <SelectValue placeholder="Shot..." />
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
                                            const success = await onAddToLastShot(image.id!, displayUrl, displayUrl);
                                            if (success) {
                                                setShowTickForImageId(image.id!);
                                                if (tickTimeoutRef.current) clearTimeout(tickTimeoutRef.current);
                                                tickTimeoutRef.current = setTimeout(() => {
                                                    setShowTickForImageId(null);
                                                }, 2000);
                                            }
                                        }}
                                        disabled={!selectedShotIdLocal || showTickForImageId === image.id}
                                        aria-label={showTickForImageId === image.id ? `Added to ${currentTargetShotName}` : (currentTargetShotName ? `Add to shot: ${currentTargetShotName}` : "Add to selected shot")}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        {showTickForImageId === image.id ? <Check className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    {showTickForImageId === image.id ? `Added to ${currentTargetShotName || 'shot'}` :
                                    (selectedShotIdLocal && currentTargetShotName ? `Add to: ${currentTargetShotName}` : "Select a shot then click to add")}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        )}

                        {/* Action buttons - Top Right (timestamp, Info & Apply) */}
                        <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
                            {/* Timestamp (always visible) */}
                            {image.createdAt && isValid(new Date(image.createdAt)) && (
                                <span className="text-xs text-white bg-black/50 px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                                    {formatDistanceToNow(new Date(image.createdAt), { addSuffix: true })
                                        .replace(" minutes", " mins")
                                        .replace(" minute", " min")
                                        .replace(" hours", " hrs")
                                        .replace(" hour", " hr")
                                        .replace(" seconds", " secs")
                                        .replace(" second", " sec")
                                        .replace("less than a minute", "< 1 min")}
                                </span>
                            )}

                            {/* Info button (shown on hover) */}
                                {image.metadata && (
                                 <InfoPopover metadata={image.metadata} metadataForDisplay={metadataForDisplay} />
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

                        {/* Download button - Bottom Left */}
                        <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                                onClick={() => handleDownloadImage(
                                    displayUrl, 
                                    `artful_pane_craft_${isActuallyVideo ? 'video' : 'image'}_${image.id || index}`,
                                    image.id || imageKey,
                                    isActuallyVideo,
                                    image.metadata?.content_type
                                )}
                                disabled={downloadingImageId === (image.id || imageKey)}
                            >
                                {downloadingImageId === (image.id || imageKey) ? (
                                    <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-current"></div>
                                ) : (
                                    <Download className="h-3.5 w-3.5" />
                                )}
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
            })}
            </div>
        )}
      </div>
      
      {/* Lightbox Modal */}
      {activeLightboxMedia && (
        <MediaLightbox
          media={activeLightboxMedia}
          onClose={handleCloseLightbox}
          onNext={handleNextImage}
          onPrevious={handlePreviousImage}
          onImageSaved={handleImageSaved}
          showNavigation={true}
          showImageEditTools={!activeLightboxMedia.type.includes('video')}
          showDownload={true}
          videoPlayerComponent="simple-player"
          allShots={simplifiedShotOptions}
          selectedShotId={selectedShotIdLocal}
          onShotChange={handleShotChange}
          onAddToShot={onAddToLastShot}
          onDelete={onDelete}
          isDeleting={isDeleting}
          onApplySettings={onApplySettings}
          showTickForImageId={showTickForImageId}
          onShowTick={handleShowTick}
        />
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className={`flex justify-center items-center mt-6 mb-8 ${whiteText ? 'text-white' : 'text-gray-600'}`}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Prev
          </Button>
          <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'} whitespace-nowrap mx-4`}>
            Showing {rangeStart}-{rangeEnd} (out of {totalFilteredItems})
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </TooltipProvider>
  );
}; 