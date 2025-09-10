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

interface VideoShotDisplayProps {
  shot: Shot;
  onSelectShot: () => void;
  currentProjectId: string | null; // Needed for mutations
  dragHandleProps?: {
    disabled?: boolean;
    [key: string]: any; // For drag attributes and listeners
  };
  shouldLoadImages?: boolean;
  shotIndex?: number;
}

// Component for individual shot image with loading state
interface ShotImageProps {
  image: GenerationRow;
  index: number;
  onSelectShot: () => void;
  shotName: string;
  shouldLoad?: boolean;
  shotIndex?: number;
}

const ShotImage: React.FC<ShotImageProps> = ({ image, index, onSelectShot, shotName, shouldLoad = true, shotIndex = 0 }) => {
  // Handle both old and new field naming conventions
  const imageUrl = image.imageUrl || image.location;
  const thumbUrl = image.thumbUrl || image.location;
  const displayUrl = getDisplayUrl(thumbUrl || imageUrl);
  
  // Check if image is already cached by browser (similar to ImageGallery approach)
  const checkIfImageCached = (url: string): boolean => {
    if (!url) return false;
    
    try {
      const testImg = new Image();
      testImg.src = url;
      // If image is cached, complete will be true immediately
      return testImg.complete && testImg.naturalWidth > 0;
    } catch {
      return false;
    }
  };
  
  const isImageCached = checkIfImageCached(displayUrl);
  const [imageLoaded, setImageLoaded] = useState(isImageCached);
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
  };

  const handleImageError = () => {
    console.error(`[ShotImage-${index}] Image failed to load:`, { displayUrl });
    setImageLoadError(true);
  };

  // Don't render anything if we don't have a valid URL
  if (!displayUrl) {
    console.warn(`[ShotImage-${index}] No valid URL found for image:`, image);
    return null;
  }

  return (
    <div 
      className="flex-shrink-0 w-32 h-32 rounded overflow-hidden border cursor-pointer hover:shadow-wes-deep hover:scale-105 transition-all duration-300 relative bg-gray-200"
      style={{ 
        animationDelay: `${index * 0.1}s`
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectShot();
      }}
    >
      {imageLoadError ? (
        // Error state
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
              src={displayUrl}
              alt={`Shot image ${index + 1} for ${shotName}`}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          )}
          
          {/* Hidden image for background loading - only start loading when shouldLoad is true OR image is cached */}
          {!imageLoaded && (shouldLoad || isImageCached) && (
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

const VideoShotDisplay: React.FC<VideoShotDisplayProps> = ({ shot, onSelectShot, currentProjectId, dragHandleProps, shouldLoadImages = true, shotIndex = 0 }) => {
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

  const imagesOnly = shot.images?.filter(image => image.type !== 'video' && image.type !== 'video_travel_output') || [];
  const imagesToShow: GenerationRow[] = imagesOnly.slice(0, 5);

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
        className="group h-48 p-4 border rounded-lg bg-card/50 hover:bg-card/80 hover:shadow-wes-hover hover:scale-[1.02] transition-all duration-300 relative cursor-pointer flex flex-col"
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
              className="text-xl font-light group-hover:text-primary/80 transition-colors duration-300 flex-grow mr-2"
            >
              {shot.name}
            </h3>
          )}
          <div className="flex items-center space-x-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Drag Handle Button */}
            {dragHandleProps && (
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
            imagesToShow.map((image, index) => (
              <ShotImage
                key={image.shotImageEntryId || `img-${index}`}
                image={image}
                index={index}
                onSelectShot={onSelectShot}
                shotName={shot.name}
                shouldLoad={shouldLoadImages}
                shotIndex={shotIndex}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic">No images in this shot yet.</p>
          )}
          {imagesOnly.length > 5 && (
            <div 
              className="flex-shrink-0 w-32 h-32 rounded border bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 hover:shadow-wes-deep hover:scale-105 transition-all duration-300 animate-in fade-in-up"
              style={{ animationDelay: `${imagesToShow.length * 0.1}s` }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectShot();
              }}
            >
              <p className="text-sm text-muted-foreground text-center pointer-events-none">+{imagesOnly.length - 5} more</p>
            </div>
          )}
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