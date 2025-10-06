import React, { useState, useEffect } from 'react';
import { Shot, GenerationRow } from '../../../types/shots'; // Corrected import path
import { useUpdateShotName, useDeleteShot, useDuplicateShot } from '../../../shared/hooks/useShots'; // Import new hooks
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Pencil, Trash2, Check, X, Copy, GripVertical } from 'lucide-react'; // Icons
import { toast } from 'sonner';
import { getDisplayUrl } from '@/shared/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/shared/components/ui/alert-dialog';
import { useClickRipple } from '@/shared/hooks/useClickRipple';
import { parseRatio } from '@/shared/lib/aspectRatios';
import { useProgressiveImage } from '@/shared/hooks/useProgressiveImage';
import { isProgressiveLoadingEnabled } from '@/shared/settings/progressiveLoading';
import { cn } from '@/shared/lib/utils';
import { isImageCached, setImageCacheStatus } from '@/shared/lib/imageCacheManager';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';

interface VideoShotDisplayProps {
  shot: Shot;
  onSelectShot: () => void;
  currentProjectId: string | null; // Needed for mutations
  dragHandleProps?: {
    disabled?: boolean;
    [key: string]: any; // For drag attributes and listeners
  };
  dragDisabledReason?: string;
  shouldLoadImages?: boolean;
  shotIndex?: number;
  projectAspectRatio?: string;
}

// Component for individual shot image with loading state
interface ShotImageProps {
  image: GenerationRow;
  index: number;
  onSelectShot: () => void;
  shotName: string;
  shouldLoad?: boolean;
  shotIndex?: number;
  projectAspectRatio?: string;
}

const ShotImage: React.FC<ShotImageProps> = ({ image, index, onSelectShot, shotName, shouldLoad = true, shotIndex = 0, projectAspectRatio }) => {
  // Handle both old and new field naming conventions
  const imageUrl = image.imageUrl || image.location;
  const thumbUrl = image.thumbUrl || image.location;
  
  // Progressive loading for video shot display
  const progressiveEnabled = isProgressiveLoadingEnabled();
  const { src: progressiveSrc, phase, isThumbShowing, isFullLoaded, ref: progressiveRef } = useProgressiveImage(
    progressiveEnabled ? thumbUrl : null,
    imageUrl,
    {
      priority: false, // Not high priority in video shot display
      lazy: true,
      enabled: progressiveEnabled && shouldLoad,
      crossfadeMs: 200
    }
  );

  // Use progressive src if available, otherwise fallback to display URL
  // Normalize progressive src through getDisplayUrl to prevent format inconsistency
  const displayUrl = progressiveEnabled && progressiveSrc ? getDisplayUrl(progressiveSrc) : getDisplayUrl(thumbUrl || imageUrl);
  
  // Use centralized cache to check if image is already loaded
  const [imageLoaded, setImageLoaded] = useState(isImageCached(image));
  const [imageLoadError, setImageLoadError] = useState(false);

  // [Performance] Disabled excessive logging
  // console.log(`[ShotImage-${index}] Rendering image:`, {
  //   imageUrl, thumbUrl, displayUrl, hasImageUrl: !!imageUrl,
  //   hasThumbUrl: !!thumbUrl, hasDisplayUrl: !!displayUrl,
  //   isImageCached, imageLoaded, shouldLoad
  // });

  const handleImageLoad = () => {
    // [Performance] Only log errors, not successful loads
    // console.log(`[ShotImage-${index}] Image loaded successfully`);
    setImageLoaded(true);
    // Mark image as cached in centralized cache to prevent future skeletons
    setImageCacheStatus(image, true);
  };

  const handleImageError = () => {
    console.error(`[ShotImageDebug] Image failed to load:`, { displayUrl, index, shotImageEntryId: image.shotImageEntryId });
    setImageLoadError(true);
  };

  // Don't render anything if we don't have a valid URL
  if (!displayUrl) {
    console.warn(`[ShotImageDebug] No valid URL found for image:`, { 
      image: {
        shotImageEntryId: image.shotImageEntryId,
        imageUrl: image.imageUrl,
        thumbUrl: image.thumbUrl, 
        location: image.location,
        type: image.type,
        timeline_frame: (image as any).timeline_frame
      },
      shotName,
      displayUrl,
      imageUrl,
      thumbUrl
    });
    return null;
  }

  // Calculate final height based on aspect ratio and min/max constraints
  const imageWidth = 128; // from w-32 class
  let desiredHeight = imageWidth; // Default to 1:1

  // Try to get dimensions from image metadata first
  let width = (image as any).metadata?.width;
  let height = (image as any).metadata?.height;

  // If not found, try to extract from resolution string
  if (!width || !height) {
    const resolution = (image as any).metadata?.originalParams?.orchestrator_details?.resolution;
    if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
      const [w, h] = resolution.split('x').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        width = w;
        height = h;
      }
    }
  }

  if (width && height && width > 0) {
    desiredHeight = (imageWidth / width) * height;
  } else if (projectAspectRatio) {
    const ratio = parseRatio(projectAspectRatio); // This is width/height
    if (!isNaN(ratio) && ratio > 0) {
      desiredHeight = imageWidth / ratio;
    }
  }

  const minHeight = 120; // Sensible min-height to fill the card vertically
  const maxHeight = imageWidth * 2; // Max height of 2:1 portrait to prevent layout breaking
  const finalHeight = Math.min(Math.max(desiredHeight, minHeight), maxHeight);

  return (
    <div
      className="flex-shrink-0 w-32 rounded overflow-hidden border relative bg-gray-200 group-hover:scale-105 transition-transform duration-700"
      style={{
        animationDelay: `${index * 0.1}s`,
        height: `${finalHeight}px`,
      }}
    >
      {imageLoadError ? (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-100 text-gray-500">
          <div className="text-center">
            <div className="h-4 w-4 mx-auto mb-1 opacity-50">⚠️</div>
            <p className="text-xs">Failed to load</p>
          </div>
        </div>
      ) : (
        <>
          {/* Show image once it's loaded */}
          {imageLoaded && (
            <img
              ref={progressiveRef}
              src={displayUrl}
              alt={`Shot image ${index + 1} for ${shotName}`}
              className={cn(
                "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-200",
                // Progressive loading visual states
                progressiveEnabled && isThumbShowing && "opacity-95",
                progressiveEnabled && isFullLoaded && "opacity-100"
              )}
            />
          )}
          
          {/* Hidden image for background loading - only start loading when shouldLoad is true OR image is cached */}
          {!imageLoaded && (shouldLoad || isImageCached(image)) && (
            <img
              src={displayUrl}
              alt={`Shot image ${index + 1} for ${shotName}`}
              style={{ display: 'none' }}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}
          
          {/* Show skeleton only while the image is still loading */}
          {!imageLoaded && (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-200 animate-pulse">
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-400"></div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Component for empty placeholder blocks to maintain consistent layout
interface PlaceholderBlockProps {
  index: number;
  projectAspectRatio?: string;
}

const PlaceholderBlock: React.FC<PlaceholderBlockProps> = ({ index, projectAspectRatio }) => {
  // Calculate final height using the same logic as ShotImage
  const imageWidth = 128; // from w-32 class
  let desiredHeight = imageWidth; // Default to 1:1

  if (projectAspectRatio) {
    const ratio = parseRatio(projectAspectRatio); // This is width/height
    if (!isNaN(ratio) && ratio > 0) {
      desiredHeight = imageWidth / ratio;
    }
  }

  const minHeight = 120; // Sensible min-height to fill the card vertically
  const maxHeight = imageWidth * 2; // Max height of 2:1 portrait to prevent layout breaking
  const finalHeight = Math.min(Math.max(desiredHeight, minHeight), maxHeight);

  return (
    <div
      className="flex-shrink-0 w-32 rounded overflow-hidden border relative bg-gray-100 opacity-30 group-hover:scale-105 transition-transform duration-700"
      style={{
        animationDelay: `${index * 0.1}s`,
        height: `${finalHeight}px`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-8 h-8 rounded border-2 border-dashed border-gray-300"></div>
      </div>
    </div>
  );
};

const VideoShotDisplay: React.FC<VideoShotDisplayProps> = ({ shot, onSelectShot, currentProjectId, dragHandleProps, dragDisabledReason, shouldLoadImages = true, shotIndex = 0, projectAspectRatio }) => {
  // Click ripple effect
  const { triggerRipple, rippleStyles, isRippleActive } = useClickRipple();
  
  // Handle ripple trigger with button detection
  const handleRippleTrigger = (e: React.PointerEvent) => {
    // Check if the click target or any parent is a button or has button-like behavior
    const target = e.target as HTMLElement;
    const isButton = target.closest('button, [role="button"], input');
    
    // Only trigger ripple if not clicking on a button
    if (!isButton) {
      triggerRipple(e);
    }
  };
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editableName, setEditableName] = useState(shot.name);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const updateShotNameMutation = useUpdateShotName();
  const deleteShotMutation = useDeleteShot();
  const duplicateShotMutation = useDuplicateShot();

  useEffect(() => {
    setEditableName(shot.name); // Reset editable name if shot prop changes
  }, [shot.name]);

  const handleNameEditToggle = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isEditingName) {
      // If was editing and toggling off without saving via button, consider it a cancel
      setEditableName(shot.name); // Reset to original name
    }
    setIsEditingName(!isEditingName);
  };

  const handleSaveName = async () => {
    if (!currentProjectId) {
      toast.error('Cannot update shot: Project ID is missing.');
      return;
    }
    if (editableName.trim() === '') {
      toast.error('Shot name cannot be empty.');
      setEditableName(shot.name); // Reset to original if submitted empty
      setIsEditingName(false);
      return;
    }
    if (editableName.trim() === shot.name) {
      setIsEditingName(false); // No change, just exit edit mode
      return;
    }

    try {
      await updateShotNameMutation.mutateAsync(
        { shotId: shot.id, newName: editableName.trim(), projectId: currentProjectId }, // Pass projectId
        {
          onSuccess: () => {
    
            // Optimistic update already handles UI, or rely on query invalidation
          },
          onError: (error) => {
            toast.error(`Failed to update shot: ${error.message}`);
            setEditableName(shot.name); // Revert on error
          },
        }
      );
    } finally {
      setIsEditingName(false);
    }
  };

  const handleSaveNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleSaveName();
  };

  const handleDeleteShot = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentProjectId) {
      toast.error('Cannot delete shot: Project ID is missing.');
      return;
    }
    // Open the delete confirmation dialog
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!currentProjectId) {
      toast.error('Cannot delete shot: Project ID is missing.');
      setIsDeleteDialogOpen(false);
      return;
    }
    
    try {
      await deleteShotMutation.mutateAsync(
        { shotId: shot.id, projectId: currentProjectId }, // Pass projectId
        {
          onSuccess: () => {
      
            // Optimistic update or query invalidation handles UI removal
          },
          onError: (error) => {
            toast.error(`Failed to delete shot: ${error.message}`);
          },
        }
      );
    } catch (error) {
      // This catch is likely redundant if mutation's onError is used, but good for safety
      console.error("Error during deleteShotMutation call:", error);
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  const handleDuplicateShot = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentProjectId) {
      toast.error('Cannot duplicate shot: Project ID is missing.');
      return;
    }
    try {
      await duplicateShotMutation.mutateAsync({
        shotId: shot.id,
        projectId: currentProjectId,
      });
    } catch (error) {
      console.error("Error during duplicateShotMutation call:", error);
      toast.error(`Failed to duplicate shot: ${(error as Error).message}`);
    }
  };

  // Match ShotEditor/ShotsPane: show only positioned, non-video images sorted by timeline_frame
  const positionedImages = (shot.images || [])
    .filter(img => {
      const hasTimelineFrame = (img as any).timeline_frame !== null && (img as any).timeline_frame !== undefined;
      return hasTimelineFrame;
    })
    .filter(img => {
      const isVideo = img.type === 'video' || img.type === 'video_travel_output' ||
        ((img as any).location && (img as any).location.endsWith('.mp4')) ||
        ((img as any).imageUrl && (img as any).imageUrl.endsWith('.mp4'));
      return !isVideo;
    })
    .sort((a, b) => {
      const frameA = (a as any).timeline_frame || 0;
      const frameB = (b as any).timeline_frame || 0;
      return frameA - frameB;
    });

  const imagesToShow: GenerationRow[] = positionedImages.slice(0, 5);
  
  // Calculate how many placeholder blocks we need to fill to 5 total slots
  const maxSlots = 5;
  const actualImageCount = Math.min(imagesToShow.length, maxSlots);
  const hasMoreIndicator = positionedImages.length > 5;
  const placeholderCount = hasMoreIndicator ? 0 : Math.max(0, maxSlots - actualImageCount);

  // [Performance] Disabled excessive logging that was causing render cascades
  // Debug logging
  // console.log(`[VideoShotDisplay] Shot "${shot.name}" (index ${shotIndex}):`, {
  //   totalImages: shot.images?.length || 0, imagesOnly: imagesOnly.length,
  //   imagesToShow: imagesToShow.length, shouldLoadImages, isPriority: shotIndex < 3,
  //   shotImages: shot.images?.map(img => ({ id: img.id, type: img.type,
  //     hasImageUrl: !!(img.imageUrl || img.location), hasThumbUrl: !!(img.thumbUrl || img.location) }))
  // });

  return (
    <>
      <div 
        key={shot.id} 
        className={`click-ripple group min-h-48 p-4 border rounded-lg bg-card/50 hover:bg-card/80 hover:shadow-wes-hover hover:border-primary/30 hover:scale-105 transition-all duration-700 relative cursor-pointer flex flex-col ${isRippleActive ? 'ripple-active' : ''}`}
        style={rippleStyles}
        onPointerDown={handleRippleTrigger}
        onClick={onSelectShot}
      >
          <div className="flex justify-between items-start mb-3">
          {isEditingName ? (
            <div className="flex items-center gap-2 flex-grow" onClick={(e) => e.stopPropagation()}>
              <Input 
                value={editableName}
                onChange={(e) => setEditableName(e.target.value)}
                onBlur={handleSaveName} // Save on blur
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') {
                    setEditableName(shot.name);
                    setIsEditingName(false);
                  }
                }}
                className="!text-xl font-light h-auto py-0 px-2 border-0 bg-transparent shadow-none focus:ring-0 focus:border-0"
                autoFocus
                maxLength={30}
              />
              <Button variant="ghost" size="icon" onClick={handleSaveNameClick} className="h-9 w-9">
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNameEditToggle} className="h-9 w-9">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h3 
              className="text-xl font-light group-hover:text-primary/80 transition-colors duration-300 flex-grow mr-2 truncate"
            >
              {shot.name}
            </h3>
          )}
          <div className="flex items-center space-x-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Drag Handle Button */}
            {dragHandleProps && (
              dragHandleProps.disabled && dragDisabledReason ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 cursor-not-allowed opacity-50"
                          disabled={true}
                        >
                          <GripVertical className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{dragDisabledReason}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 cursor-grab active:cursor-grabbing"
                  disabled={dragHandleProps.disabled}
                  title="Drag to reorder"
                  {...dragHandleProps}
                >
                  <GripVertical className="h-4 w-4" />
                </Button>
              )
            )}
            {!isEditingName && (
               <Button variant="ghost" size="icon" onClick={handleNameEditToggle} className="h-8 w-8">
                  <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleDuplicateShot} 
              className="h-8 w-8" 
              disabled={duplicateShotMutation.isPending}
              title="Duplicate shot"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDeleteShot} className="text-destructive hover:text-destructive-foreground hover:bg-destructive h-8 w-8">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex space-x-2 overflow-hidden flex-1 items-start">
          {imagesToShow.length > 0 ? (
            <>
              {imagesToShow.map((image, index) => (
                <ShotImage
                  key={image.shotImageEntryId || `img-${index}`}
                  image={image}
                  index={index}
                  onSelectShot={onSelectShot}
                  shotName={shot.name}
                  shouldLoad={shouldLoadImages}
                  shotIndex={shotIndex}
                  projectAspectRatio={projectAspectRatio}
                />
              ))}
              {/* Add placeholder blocks to fill remaining slots */}
              {Array.from({ length: placeholderCount }).map((_, index) => (
                <PlaceholderBlock
                  key={`placeholder-${index}`}
                  index={actualImageCount + index}
                  projectAspectRatio={projectAspectRatio}
                />
              ))}
            </>
          ) : (
            /* Show placeholder blocks when no images exist */
            Array.from({ length: maxSlots }).map((_, index) => (
              <PlaceholderBlock
                key={`empty-placeholder-${index}`}
                index={index}
                projectAspectRatio={projectAspectRatio}
              />
            ))
          )}
          {positionedImages.length > 5 && (() => {
            // Calculate aspect ratio padding for the "more" indicator to match other images
            const imageWidth = 128;
            let desiredHeight = imageWidth;

            if (projectAspectRatio) {
              const ratio = parseRatio(projectAspectRatio);
              if (!isNaN(ratio) && ratio > 0) {
                desiredHeight = imageWidth / ratio;
              }
            }
            
            const minHeight = 120;
            const maxHeight = imageWidth * 2;
            const finalHeight = Math.min(Math.max(desiredHeight, minHeight), maxHeight);
            
            return (
              <div 
                className="flex-shrink-0 w-32 rounded border bg-muted animate-in fade-in-up relative group-hover:scale-105 transition-transform duration-700"
                style={{
                  animationDelay: `${imagesToShow.length * 0.1}s`,
                  height: `${finalHeight}px`,
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground text-center pointer-events-none">+{positionedImages.length - 5} more</p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete shot "{shot.name}"? This will permanently remove the shot and all its associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteShotMutation.isPending}
            >
              {deleteShotMutation.isPending ? 'Deleting...' : 'Delete Shot'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default VideoShotDisplay; 