import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Trash2, Info, Settings, CheckCircle, AlertTriangle, Download, PlusCircle, Check, Sparkles, Filter, Search, X, Star } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";

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
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { DraggableImage } from "@/shared/components/DraggableImage";
import { getDisplayUrl } from "@/shared/lib/utils";
import { ShotFilter } from "@/shared/components/ShotFilter";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { TimeStamp } from "@/shared/components/TimeStamp";
import { useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ImageGalleryItem } from "./ImageGalleryItem";

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
  thumbUrl?: string; // Thumbnail URL for faster loading
  prompt?: string;
  seed?: number;
  metadata?: DisplayableMetadata;
  temp_local_path?: string; // For unsaved local generations
  error?: string; // To display an error message on the image card
  file?: File; // Optional file object, e.g. for unsaved SDXL Turbo gens
  isVideo?: boolean; // To distinguish video from image in the gallery
  unsaved?: boolean; // Optional flag for images not saved to DB
  createdAt?: string; // Add a creation timestamp
  starred?: boolean; // Whether this generation is starred
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
  /** Number of items to display per page */
  itemsPerPage?: number;
  /** Initial media type filter state ('all' | 'image' | 'video') */
  initialMediaTypeFilter?: 'all' | 'image' | 'video';
  /** Callback for server-side pagination */
  onServerPageChange?: (page: number) => void;
  /** Current server page (1-based) */
  serverPage?: number;
  /** Enable shot filtering dropdown */
  showShotFilter?: boolean;
  /** Initial shot filter value */
  initialShotFilter?: string;
  /** Callback when shot filter changes */
  onShotFilterChange?: (shotId: string) => void;
  /** Initial exclude positioned value */
  initialExcludePositioned?: boolean;
  /** Callback when exclude positioned changes */
  onExcludePositionedChange?: (exclude: boolean) => void;
  /** Show search functionality */
  showSearch?: boolean;
  /** Initial search term */
  initialSearchTerm?: string;
  /** Callback when search term changes */
  onSearchChange?: (searchTerm: string) => void;
  /** Callback when media type filter changes */
  onMediaTypeFilterChange?: (mediaType: 'all' | 'image' | 'video') => void;
  /** Callback when a generation is starred/unstarred */
  onToggleStar?: (id: string, starred: boolean) => void;
  /** Initial starred filter value */
  initialStarredFilter?: boolean;
  /** Callback when starred filter changes */
  onStarredFilterChange?: (starredOnly: boolean) => void;
  /** Callback when tool type filter changes */
  onToolTypeFilterChange?: (enabled: boolean) => void;
  /** Associated shot ID from the generation form (for shot mismatch notifier) */
  formAssociatedShotId?: string | null;
  /** Callback when user clicks to switch to the form's associated shot */
  onSwitchToAssociatedShot?: (shotId: string) => void;
}

// Helper to format metadata for display
export const formatMetadataForDisplay = (metadata: DisplayableMetadata): string => {
  
  let displayText = "";
  
  // PROMPT SECTION
  const prompt = metadata.prompt || 
                 (metadata as any).originalParams?.orchestrator_details?.prompt;
  if (prompt) {
    displayText += `📝 PROMPT\n`;
    displayText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    displayText += `"${prompt}"\n\n`;
  }
  
  // GENERATION DETAILS SECTION
  displayText += `⚙️ GENERATION DETAILS\n`;
  displayText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  
  // Extract model from nested structure
  const model = (metadata as any).originalParams?.orchestrator_details?.model || metadata.model;
  if (model) displayText += `Model:       ${model}\n`;
  
  // Extract seed from nested structure if needed
  const seed = metadata.seed || (metadata as any).originalParams?.orchestrator_details?.seed;
  if (seed) displayText += `Seed:        ${seed}\n`;
  
  // Extract dimensions from multiple possible locations
  const resolution = (metadata as any).originalParams?.orchestrator_details?.resolution;
  if (metadata.width && metadata.height) {
    displayText += `Dimensions:  ${metadata.width}×${metadata.height}\n`;
  } else if (resolution) {
    displayText += `Dimensions:  ${resolution}\n`;
  }
  
  if (metadata.num_inference_steps) displayText += `Steps:       ${metadata.num_inference_steps}\n`;
  if (metadata.guidance_scale) displayText += `Guidance:    ${metadata.guidance_scale}\n`;
  if (metadata.scheduler) displayText += `Scheduler:   ${metadata.scheduler}\n`;
  
  // LORAS SECTION
  const additionalLoras = (metadata as any).originalParams?.orchestrator_details?.additional_loras;
  const activeLoras = metadata.activeLoras;
  
  if ((additionalLoras && Object.keys(additionalLoras).length > 0) || (activeLoras && activeLoras.length > 0)) {
    displayText += `\n🎨 LORAS\n`;
    displayText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (activeLoras && activeLoras.length > 0) {
      // Use structured activeLoras if available
      activeLoras.forEach(lora => {
        const displayName = lora.name || lora.id || 'Unknown';
        displayText += `${displayName} - ${lora.strength}%\n`;
      });
    } else if (additionalLoras) {
      // Fall back to additional_loras from orchestrator_details
      Object.entries(additionalLoras).forEach(([url, strength]) => {
        // Extract a display name from the URL
        const urlParts = url.split('/');
        const filename = urlParts[urlParts.length - 1] || url;
        const displayName = filename.replace(/\.(safetensors|ckpt|pt).*$/i, '').replace(/_/g, ' ');
        displayText += `${displayName} - ${((strength as number) * 100).toFixed(0)}%\n`;
      });
    }
  }
  
  // ADDITIONAL SETTINGS SECTION (if any)
  const hasAdditionalSettings = metadata.depthStrength !== undefined || 
                               metadata.softEdgeStrength !== undefined || 
                               metadata.userProvidedImageUrl;
  
  if (hasAdditionalSettings) {
    displayText += `\n🔧 ADDITIONAL SETTINGS\n`;
    displayText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (metadata.depthStrength !== undefined) 
      displayText += `Depth Strength:      ${(metadata.depthStrength * 100).toFixed(0)}%\n`;
    
    if (metadata.softEdgeStrength !== undefined) 
      displayText += `Soft Edge Strength:  ${(metadata.softEdgeStrength * 100).toFixed(0)}%\n`;
    
    if (metadata.userProvidedImageUrl) {
      const urlParts = metadata.userProvidedImageUrl.split('/');
      const imageName = urlParts[urlParts.length -1] || metadata.userProvidedImageUrl;
      displayText += `User Image:          ${imageName}\n`;
    }
  }
  
  return displayText.trim() || "No metadata available.";
};



export const ImageGallery: React.FC<ImageGalleryProps> = ({ 
  images, 
  onDelete, 
  isDeleting, 
  onApplySettings, 
  allShots, 
  lastShotId, 
  onAddToLastShot, 
  currentToolType, 
  initialFilterState = true, 
  onImageSaved, 
  offset = 0, 
  totalCount, 
  whiteText = false, 
  columnsPerRow = 5, 
  itemsPerPage = 45, 
  initialMediaTypeFilter = 'all', 
  onServerPageChange, 
  serverPage, 
  showShotFilter = false, 
  initialShotFilter = 'all', 
  onShotFilterChange,
  initialExcludePositioned = true,
  onExcludePositionedChange,
  showSearch = false,
  initialSearchTerm = '',
  onSearchChange,
  onMediaTypeFilterChange,
  onToggleStar,
  onStarredFilterChange,
  onToolTypeFilterChange,
  initialStarredFilter = false,
  formAssociatedShotId,
  onSwitchToAssociatedShot
}) => {
  const [activeLightboxMedia, setActiveLightboxMedia] = useState<GenerationRow | null>(null);
  const [downloadingImageId, setDownloadingImageId] = useState<string | null>(null);
  const { toast } = useToast();
  const { setLastAffectedShotId } = useLastAffectedShot();
  const { currentShotId } = useCurrentShot();
  const isMobile = useIsMobile();
  const simplifiedShotOptions = React.useMemo(() => allShots.map(s => ({ id: s.id, name: s.name })), [allShots]);
  
  // Star functionality
  const toggleStarMutation = useToggleGenerationStar();

  const [selectedShotIdLocal, setSelectedShotIdLocal] = useState<string>(() => 
    currentShotId || lastShotId || (simplifiedShotOptions.length > 0 ? simplifiedShotOptions[0].id : "")
  );
  const [showTickForImageId, setShowTickForImageId] = useState<string | null>(null);
  const [addingToShotImageId, setAddingToShotImageId] = useState<string | null>(null);

  // State for the filter checkbox
  const [filterByToolType, setFilterByToolType] = useState<boolean>(initialFilterState);
  // State for the new media type filter
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>(initialMediaTypeFilter);
  // State for shot filter
  const [shotFilter, setShotFilter] = useState<string>(initialShotFilter);
  const [excludePositioned, setExcludePositioned] = useState<boolean>(initialExcludePositioned);
  // State for starred filter
  const [showStarredOnly, setShowStarredOnly] = useState<boolean>(initialStarredFilter);
  // Mobile-only: track which image should show action controls (e.g., Info button)
  const [mobileActiveImageId, setMobileActiveImageId] = useState<string | null>(null);
  // Mobile-only: track which image has popover open
  const [mobilePopoverOpenImageId, setMobilePopoverOpenImageId] = useState<string | null>(null);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState<string>(initialSearchTerm);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(!!initialSearchTerm);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pagination state (45 items per page)
  const ITEMS_PER_PAGE = itemsPerPage;
  const [page, setPage] = React.useState(0);

  // When filters change, reset to first page (debounced to avoid rapid state changes)
  React.useEffect(() => {
    const timer = setTimeout(() => setPage(0), 10);
    return () => clearTimeout(timer);
  }, [filterByToolType, mediaTypeFilter, searchTerm, showStarredOnly]);

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
    // When the component mounts or initialShotFilter prop changes, update the shot filter state
    setShotFilter(initialShotFilter);
  }, [initialShotFilter]);

  useEffect(() => {
    // When the component mounts or initialStarredFilter prop changes, update the starred filter state
    setShowStarredOnly(initialStarredFilter);
  }, [initialStarredFilter]);

  useEffect(() => {
    return () => {
      if (tickTimeoutRef.current) {
        clearTimeout(tickTimeoutRef.current);
      }
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);

  // Handle mobile double-tap detection
  const handleMobileTap = (image: GeneratedImageWithMetadata) => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTouchTimeRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // This is a double-tap, clear any pending timeout and open lightbox
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      handleOpenLightbox(image);
    } else {
      // This is a single tap, set a timeout to handle it if no second tap comes
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      doubleTapTimeoutRef.current = setTimeout(() => {
        // Single tap (mobile): reveal action controls for this image
        // Close any existing popover if tapping a different image
        if (mobilePopoverOpenImageId && mobilePopoverOpenImageId !== image.id) {
          setMobilePopoverOpenImageId(null);
        }
        setMobileActiveImageId(image.id);
        doubleTapTimeoutRef.current = null;
      }, 300);
    }
    
    lastTouchTimeRef.current = currentTime;
  };

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

  // Conform to MediaLightbox signature: returns Promise<void> and accepts optional createNew flag
  const handleImageSaved = async (newImageUrl: string, _createNew?: boolean): Promise<void> => {
    if (activeLightboxMedia?.id && onImageSaved) {
      // Wrap the potentially synchronous parent handler in Promise.resolve to always return a Promise
      await Promise.resolve(onImageSaved(activeLightboxMedia.id, newImageUrl));
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

  const handleShotFilterChange = (shotId: string) => {
    setShotFilter(shotId);
    onShotFilterChange?.(shotId);
  };

  const handleExcludePositionedChange = (exclude: boolean) => {
    setExcludePositioned(exclude);
    onExcludePositionedChange?.(exclude);
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

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onSearchChange?.(value);
  };

  // Toggle search box visibility
  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen);
    if (!isSearchOpen) {
      // Focus the input when opening
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else if (!searchTerm) {
      // If closing and no search term, clear it
      handleSearchChange('');
    }
  };

  // Clear search
  const clearSearch = () => {
    handleSearchChange('');
    setIsSearchOpen(false);
  };

  // Handle starred filter toggle - simplified to avoid stale closure issues
  const handleStarredFilterToggle = useCallback(() => {
    setShowStarredOnly(prev => {
      const newStarredOnly = !prev;
      onStarredFilterChange?.(newStarredOnly);
      return newStarredOnly;
    });
  }, [onStarredFilterChange]);

  // Handle switching to the associated shot from the form
  const handleSwitchToAssociatedShot = useCallback(() => {
    if (formAssociatedShotId && onSwitchToAssociatedShot) {
      onSwitchToAssociatedShot(formAssociatedShotId);
    }
  }, [formAssociatedShotId, onSwitchToAssociatedShot]);

  // Update search visibility based on search term
  useEffect(() => {
    if (searchTerm && !isSearchOpen) {
      setIsSearchOpen(true);
    }
  }, [searchTerm, isSearchOpen]);

  const filteredImages = React.useMemo(() => {
    // Start with all images
    let currentFiltered = images;

    // 1. Apply tool_type filter
    if (filterByToolType && currentToolType) {
      currentFiltered = currentFiltered.filter(image => {
        const metadata = image.metadata;
        if (!metadata || !metadata.tool_type) return false;
        
        if (currentToolType === 'edit-travel') {
          return metadata.tool_type.startsWith('edit-travel');
        }
        
        if (metadata.tool_type === currentToolType) return true;
        if (metadata.tool_type === `${currentToolType}-reconstructed-client`) return true;
        
        return metadata.tool_type === currentToolType;
      });
    }

    // 2. Apply mediaTypeFilter
    if (mediaTypeFilter !== 'all') {
      currentFiltered = currentFiltered.filter(image => {
        const urlIsVideo = image.url && (image.url.toLowerCase().endsWith('.webm') || image.url.toLowerCase().endsWith('.mp4') || image.url.toLowerCase().endsWith('.mov'));
        const isActuallyVideo = typeof image.isVideo === 'boolean' ? image.isVideo : urlIsVideo;
        
        if (mediaTypeFilter === 'image') {
          return !isActuallyVideo;
        }
        if (mediaTypeFilter === 'video') {
          return isActuallyVideo;
        }
        return true;
      });
    }

    // 3. Apply starred filter (only in client pagination mode)
    if (showStarredOnly) {
      currentFiltered = currentFiltered.filter(image => image.starred === true);
    }

    // 4. Apply search filter (always apply, even in server pagination mode)
    if (searchTerm.trim()) {
      currentFiltered = currentFiltered.filter(image => {
        const prompt = image.prompt || 
                      image.metadata?.prompt || 
                      (image.metadata as any)?.originalParams?.orchestrator_details?.prompt || 
                      '';
        return prompt.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }
        
    return currentFiltered;
  }, [images, filterByToolType, currentToolType, mediaTypeFilter, searchTerm, showStarredOnly]);

  // Determine if we should show the shot mismatch notifier
  const shouldShowShotNotifier = React.useMemo(() => {
    return !!(formAssociatedShotId && showShotFilter && shotFilter !== formAssociatedShotId);
  }, [formAssociatedShotId, shotFilter, showShotFilter]);

  // Get the names and text for the notifier
  const { currentShotDisplayText, buttonText } = React.useMemo(() => {
    const currentShot = allShots.find(shot => shot.id === shotFilter);
    const associatedShot = allShots.find(shot => shot.id === formAssociatedShotId);
    const associatedShotName = associatedShot?.name || 'Unknown';
    
    if (shotFilter === 'all') {
      return {
        currentShotDisplayText: "You're viewing images for all shots",
        buttonText: `Jump to '${associatedShotName}'`
      };
    } else {
      const currentShotName = currentShot?.name || 'Unknown';
      return {
        currentShotDisplayText: `You're viewing images for '${currentShotName}'`,
        buttonText: `Switch To '${associatedShotName}'`
      };
    }
  }, [allShots, shotFilter, formAssociatedShotId]);

  // Determine if we're in server-side pagination mode
  const isServerPagination = !!(onServerPageChange && serverPage);
  
  // Calculate pagination helpers (must come after filteredImages is defined)
  const totalFilteredItems = isServerPagination ? (totalCount ?? (offset + images.length)) : filteredImages.length;
  const currentPageForCalc = isServerPagination ? (serverPage! - 1) : page;
  const totalPages = Math.max(1, Math.ceil(totalFilteredItems / ITEMS_PER_PAGE));
  
  const paginatedImages = React.useMemo(() => {
    if (isServerPagination) {
      // In server pagination mode, don't slice - the server already sent us the right page
      return filteredImages;
    }
    return filteredImages.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  }, [filteredImages, page, isServerPagination]);

  const rangeStart = totalFilteredItems === 0 ? 0 : (isServerPagination ? offset : page * ITEMS_PER_PAGE) + 1;
  const rangeEnd = rangeStart + paginatedImages.length - 1;

  // Ensure current page is within bounds when totalPages changes (e.g., after filtering)
  React.useEffect(() => {
    if (page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, page]);

  // Close mobile popover on scroll or when clicking outside
  React.useEffect(() => {
    if (!isMobile || !mobilePopoverOpenImageId) return;

    const handleScroll = () => {
      setMobilePopoverOpenImageId(null);
    };

    const handleClickOutside = (event: MouseEvent) => {
      // Close if clicking outside any popover content
      const target = event.target as Element;
      if (!target.closest('[data-radix-popover-content]')) {
        setMobilePopoverOpenImageId(null);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobile, mobilePopoverOpenImageId]);
  
  const tickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Touch handling for mobile double-tap detection
  const lastTouchTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  return (
    <TooltipProvider>
      <div className="space-y-6 pb-8">
        <div className="flex flex-wrap justify-between items-center mt-7 mb-4 gap-x-4 gap-y-2"> {/* Increased top margin to 1.75rem (mt-7) while keeping bottom margin 1rem (mb-4) for desired spacing */}
            <div className="flex items-center gap-2">
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (isServerPagination) {
                          onServerPageChange!(Math.max(1, serverPage! - 1));
                        } else {
                          setPage((p) => Math.max(0, p - 1));
                        }
                      }}
                      disabled={isServerPagination ? serverPage === 1 : page === 0}
                    >
                      Prev
                    </Button>
                    <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'} whitespace-nowrap mx-4`}>
                      {rangeStart}-{rangeEnd} (out of {totalFilteredItems})
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (isServerPagination) {
                          onServerPageChange!(serverPage! + 1);
                        } else {
                          setPage((p) => Math.min(totalPages - 1, p + 1));
                        }
                      }}
                      disabled={isServerPagination ? serverPage >= totalPages : page >= totalPages - 1}
                    >
                      Next
                    </Button>
                  </>
                )}
                {totalPages === 1 && (
                  <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'} whitespace-nowrap ml-auto`}>
                    {rangeStart}-{rangeEnd} (out of {totalFilteredItems})
                  </span>
                )}
              </div>

            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap"> {/* Grouping filters, added flex-wrap */}
                {/* Shot Filter */}
                {showShotFilter && (
                    <ShotFilter
                        shots={allShots || []}
                        selectedShotId={shotFilter}
                        onShotChange={handleShotFilterChange}
                        excludePositioned={excludePositioned}
                        onExcludePositionedChange={handleExcludePositionedChange}
                        size="sm"
                        whiteText={whiteText}
                        checkboxId="exclude-positioned-image-gallery"
                        triggerWidth="w-[140px]"
                        triggerClassName={`h-8 text-xs ${whiteText ? 'bg-zinc-800 border-zinc-600 text-white' : ''}`}
                    />
                )}

                {/* Search */}
                {showSearch && (
                    <div className="flex items-center space-x-1.5">
                        {!isSearchOpen ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={toggleSearch}
                                className={`h-8 px-2 ${whiteText ? 'text-white border-zinc-600 hover:bg-zinc-700' : ''}`}
                                aria-label="Search prompts"
                            >
                                <Search className="h-4 w-4" />
                            </Button>
                        ) : (
                            <div className={`flex items-center space-x-2 border rounded-md px-3 py-1 h-8 ${whiteText ? 'bg-zinc-800 border-zinc-600' : 'bg-background'}`}>
                                <Search className={`h-4 w-4 ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'}`} />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Search prompts..."
                                    value={searchTerm}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className={`bg-transparent border-none outline-none text-xs w-40 ${whiteText ? 'text-white placeholder-zinc-400' : ''}`}
                                />
                                {searchTerm && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={clearSearch}
                                        className="h-auto p-0.5"
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}
                
                {/* New Media Type Filter */}
                <div className="flex items-center space-x-1.5">
                    <Label htmlFor="media-type-filter" className={`text-sm font-medium ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>Type:</Label>
                    <Select value={mediaTypeFilter} onValueChange={(value: 'all' | 'image' | 'video') => {
                      setMediaTypeFilter(value);
                      onMediaTypeFilterChange?.(value);
                    }}>
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
                            onCheckedChange={(checked) => {
                                const isChecked = Boolean(checked);
                                setFilterByToolType(isChecked);
                                onToolTypeFilterChange?.(isChecked);
                            }}
                            aria-label={`Filter by ${currentToolType} tool`}
                        />
                        <Label htmlFor={`filter-tool-${currentToolType}`} className={`text-sm font-medium cursor-pointer ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>
                            Generated here
                        </Label>
                    </div>
                )}

                {/* Starred Filter */}
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleStarredFilterToggle}
                    className={`h-8 w-8 p-0 ${whiteText ? 'border-zinc-600 text-white' : ''} ${showStarredOnly ? 'bg-primary text-primary-foreground border-primary' : ''}`}
                    aria-label="Filter by starred generations"
                >
                    <Star className={`h-4 w-4 ${showStarredOnly ? 'fill-current' : ''}`} />
                </Button>
            </div>
        </div>

        {/* Shot Mismatch Notifier */}
        {shouldShowShotNotifier && (
          <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200">
            <span className="text-sm">
              <strong>{currentShotDisplayText}</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSwitchToAssociatedShot}
              className="ml-3 text-green-700 border-green-300 hover:bg-green-100 dark:text-green-200 dark:border-green-700 dark:hover:bg-green-800"
            >
              {buttonText}
            </Button>
          </div>
        )}

        {/* Gallery content wrapper with minimum height to prevent layout jump when there are images */}
        <div className={paginatedImages.length > 0 ? "min-h-[400px] sm:min-h-[500px] lg:min-h-[600px]" : ""}>
          {images.length > 0 && filteredImages.length === 0 && (filterByToolType || mediaTypeFilter !== 'all' || searchTerm.trim()) && (
            <div className="text-center py-12 mt-8 text-muted-foreground border rounded-lg bg-card shadow-sm">
              <Filter className="mx-auto h-10 w-10 mb-3 opacity-60" />
              <p className="font-semibold">No items match the current filters.</p>
              <p className="text-sm">Adjust the filters or clear the search to see all items.</p>
            </div>
          )}

          {images.length === 0 && (
             <div className="text-center py-12 mt-8 text-muted-foreground border rounded-lg bg-card shadow-sm">
               <Sparkles className="mx-auto h-10 w-10 mb-3 opacity-60" />
               <p className="font-semibold">No images generated yet.</p>
               <p className="text-sm">Use the controls above to generate some images.</p>
             </div>
          )}

          {paginatedImages.length > 0 && (
              <div className={`grid gap-4 mb-12 ${columnsPerRow === 6 ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5'}`}>
            {paginatedImages.map((image, index) => (
              <ImageGalleryItem
                key={image.id || `image-${index}`}
                image={image}
                index={index}
                isDeleting={isDeleting === image.id}
                onDelete={onDelete}
                onApplySettings={onApplySettings}
                onOpenLightbox={handleOpenLightbox}
                onAddToLastShot={onAddToLastShot}
                onDownloadImage={handleDownloadImage}
                onToggleStar={onToggleStar}
                selectedShotIdLocal={selectedShotIdLocal}
                simplifiedShotOptions={simplifiedShotOptions}
                showTickForImageId={showTickForImageId}
                onShowTick={handleShowTick}
                addingToShotImageId={addingToShotImageId}
                setAddingToShotImageId={setAddingToShotImageId}
                downloadingImageId={downloadingImageId}
                isMobile={isMobile}
                mobileActiveImageId={mobileActiveImageId}
                mobilePopoverOpenImageId={mobilePopoverOpenImageId}
                onMobileTap={handleMobileTap}
                setMobilePopoverOpenImageId={setMobilePopoverOpenImageId}
                setSelectedShotIdLocal={setSelectedShotIdLocal}
                setLastAffectedShotId={setLastAffectedShotId}
                toggleStarMutation={toggleStarMutation}
              />
            ))}
            </div>
          )}
        </div>
        {/* Bottom Pagination Controls (moved inside container for better spacing) */}
        {totalPages > 1 && (
          <div className={`flex justify-center items-center mt-4 ${whiteText ? 'text-white' : 'text-gray-600'}`}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isServerPagination) {
                  onServerPageChange!(Math.max(1, serverPage! - 1));
                } else {
                  setPage((p) => Math.max(0, p - 1));
                }
              }}
              disabled={isServerPagination ? serverPage === 1 : page === 0}
            >
              Prev
            </Button>
            <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'} whitespace-nowrap mx-4`}>
              {rangeStart}-{rangeEnd} (out of {totalFilteredItems})
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isServerPagination) {
                  onServerPageChange!(serverPage! + 1);
                } else {
                  setPage((p) => Math.min(totalPages - 1, p + 1));
                }
              }}
              disabled={isServerPagination ? serverPage >= totalPages : page >= totalPages - 1}
            >
              Next
            </Button>
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
          showMagicEdit={true}
          videoPlayerComponent="simple-player"
          allShots={simplifiedShotOptions}
          selectedShotId={selectedShotIdLocal}
          onShotChange={handleShotChange}
          onAddToShot={onAddToLastShot}
          onDelete={onDelete}
          isDeleting={isDeleting}
          onApplySettings={onApplySettings}
          showTickForImageId={showTickForImageId}
          onShowTick={setShowTickForImageId}
          starred={
            (() => {
              const foundImage = filteredImages.find(img => img.id === activeLightboxMedia.id);
              const starredValue = foundImage?.starred || false;
              console.log('[StarDebug:ImageGallery] MediaLightbox starred prop', {
                mediaId: activeLightboxMedia.id,
                foundImage: !!foundImage,
                starredValue,
                foundImageKeys: foundImage ? Object.keys(foundImage) : [],
                timestamp: Date.now()
              });
              return starredValue;
            })()
          }
          onMagicEdit={(imageUrl, prompt, numImages) => {
            // TODO: Implement magic edit generation
            console.log('Magic Edit:', { imageUrl, prompt, numImages });
          }}
        />
      )}
    </TooltipProvider>
  );
}; 