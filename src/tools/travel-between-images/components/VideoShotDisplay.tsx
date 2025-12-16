import React, { useState, useEffect } from 'react';
import { Shot } from '../../../types/shots';
import { useUpdateShotName, useDeleteShot, useDuplicateShot } from '../../../shared/hooks/useShots';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { Pencil, Trash2, Check, X, Copy, GripVertical, Loader2, Video, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { getDisplayUrl } from '@/shared/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/shared/components/ui/alert-dialog';
import { useClickRipple } from '@/shared/hooks/useClickRipple';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { isVideoGeneration, isPositioned } from '@/shared/lib/typeGuards';
import { VideoGenerationModal } from '@/shared/components/VideoGenerationModal';
import { usePanes } from '@/shared/contexts/PanesContext';

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
  isHighlighted?: boolean;
}

const VideoShotDisplay: React.FC<VideoShotDisplayProps> = ({ shot, onSelectShot, currentProjectId, dragHandleProps, dragDisabledReason, shouldLoadImages = true, shotIndex = 0, projectAspectRatio, isHighlighted = false }) => {
  // Check if this is a temp shot (optimistic duplicate waiting for real ID)
  const isTempShot = shot.id.startsWith('temp-');
  
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
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isImagesExpanded, setIsImagesExpanded] = useState(false);

  const updateShotNameMutation = useUpdateShotName();
  const deleteShotMutation = useDeleteShot();
  const duplicateShotMutation = useDuplicateShot();
  
  // Check if GenerationsPane is locked to show "Select this shot" button
  const { isGenerationsPaneLocked } = usePanes();
  const [isSelectedForAddition, setIsSelectedForAddition] = useState(false);
  
  // Handle selecting this shot as the target for adding images in GenerationsPane
  const handleSelectShotForAddition = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Dispatch custom event that ImageGallery listens for to update its shot selector
    window.dispatchEvent(new CustomEvent('selectShotForAddition', {
      detail: { shotId: shot.id, shotName: shot.name }
    }));
    // Show success state
    setIsSelectedForAddition(true);
  };
  
  // Listen for other shots being selected to clear our success state
  useEffect(() => {
    const handleOtherShotSelected = (event: CustomEvent<{ shotId: string }>) => {
      if (event.detail.shotId !== shot.id) {
        setIsSelectedForAddition(false);
      }
    };
    
    window.addEventListener('selectShotForAddition', handleOtherShotSelected as EventListener);
    return () => window.removeEventListener('selectShotForAddition', handleOtherShotSelected as EventListener);
  }, [shot.id]);
  
  // Clear selection state when GenerationsPane is unlocked
  useEffect(() => {
    if (!isGenerationsPaneLocked) {
      setIsSelectedForAddition(false);
    }
  }, [isGenerationsPaneLocked]);

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
  // Uses canonical filters from typeGuards
  const positionedImages = (shot.images || [])
    .filter(img => isPositioned(img) && !isVideoGeneration(img))
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

  // Grid layout: 3 images per row, show first row by default, expand to show all
  const IMAGES_PER_ROW = 3;
  const hasMultipleRows = positionedImages.length > IMAGES_PER_ROW;

  // Handle click - block if temp shot
  const handleClick = () => {
    if (isTempShot) return;
    onSelectShot();
  };

  return (
    <>
      <div 
        key={shot.id} 
        className={`click-ripple group p-4 border rounded-lg bg-card/50 transition-all duration-700 relative flex flex-col ${isRippleActive ? 'ripple-active' : ''} ${isHighlighted ? 'ring-4 ring-blue-500 ring-opacity-75 shadow-[0_0_30px_rgba(59,130,246,0.6)] scale-105 animate-pulse' : ''} ${isTempShot ? 'opacity-70 cursor-wait animate-pulse' : 'hover:bg-card/80 hover:shadow-wes-hover hover:border-primary/30 hover:scale-105 cursor-pointer'}`}
        style={rippleStyles}
        onPointerDown={isTempShot ? undefined : handleRippleTrigger}
        onClick={handleClick}
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
            {/* Show loading indicator for temp shots */}
            {isTempShot && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving...</span>
              </div>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (positionedImages.length > 0 && !isTempShot) {
                        setIsVideoModalOpen(true);
                      }
                    }}
                    disabled={positionedImages.length === 0 || isTempShot}
                    className={`h-8 w-8 ${
                      positionedImages.length === 0 || isTempShot
                        ? 'text-zinc-400 cursor-not-allowed opacity-50' 
                        : 'text-violet-600 hover:text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-950'
                    }`}
                  >
                    <Video className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isTempShot ? 'Saving...' : positionedImages.length === 0 ? 'Add images to generate video' : 'Generate Video'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Drag Handle Button - also disabled for temp shots */}
            {dragHandleProps && (
              (dragHandleProps.disabled || isTempShot) && (dragDisabledReason || isTempShot) ? (
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
                      <p>{isTempShot ? 'Saving...' : dragDisabledReason}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 cursor-grab active:cursor-grabbing"
                        disabled={dragHandleProps.disabled}
                        {...dragHandleProps}
                      >
                        <GripVertical className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Drag to reorder</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            )}
            {!isEditingName && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleNameEditToggle} className="h-8 w-8" disabled={isTempShot}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isTempShot ? 'Saving...' : 'Edit shot name'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleDuplicateShot} 
                    className="h-8 w-8" 
                    disabled={duplicateShotMutation.isPending || isTempShot}
                  >
                    {duplicateShotMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                    <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isTempShot ? 'Saving...' : duplicateShotMutation.isPending ? "Duplicating..." : "Duplicate shot"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleDeleteShot} className="text-destructive hover:text-destructive-foreground hover:bg-destructive h-8 w-8" disabled={isTempShot}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isTempShot ? 'Saving...' : 'Delete shot'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        
        {/* Thumbnail mosaic area - matches ShotGroup style */}
        <div className="flex-grow relative">
          <div className="grid grid-cols-3 gap-2 relative">
            {positionedImages.length > 0 ? (
              <>
                {/* Only show first row when collapsed, all images when expanded */}
                {(isImagesExpanded ? positionedImages : positionedImages.slice(0, IMAGES_PER_ROW)).map((image, index) => (
                  <img
                    key={`${image.thumbUrl || image.imageUrl || image.location || 'img'}-${index}`}
                    src={getDisplayUrl(image.thumbUrl || image.imageUrl || image.location)}
                    alt={`Shot image ${index + 1}`}
                    className="w-full aspect-square object-cover rounded border border-border bg-muted shadow-sm"
                    title={`Image ${index + 1}`}
                  />
                ))}

                {hasMultipleRows && !isImagesExpanded && (
                  <button
                    className="absolute bottom-1 right-1 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsImagesExpanded(true);
                    }}
                  >
                    Show All ({positionedImages.length}) <ChevronDown className="w-3 h-3" />
                  </button>
                )}

                {isImagesExpanded && hasMultipleRows && (
                  <button
                    className="absolute bottom-1 right-1 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsImagesExpanded(false);
                    }}
                  >
                    Hide <ChevronUp className="w-3 h-3" />
                  </button>
                )}
              </>
            ) : (
              /* Empty placeholder spans all 3 columns with same aspect ratio as one row of images */
              <div className="col-span-3 aspect-[3/1] flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed border-border rounded">
                No images yet
              </div>
            )}
          </div>
          
          {/* Select this shot button - shows when GenerationsPane is locked */}
          {isGenerationsPaneLocked && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isSelectedForAddition ? "default" : "secondary"}
                    size="sm"
                    onClick={handleSelectShotForAddition}
                    className={`absolute bottom-1 left-1 h-7 px-2 text-xs shadow-sm z-10 transition-all duration-200 ${
                      isSelectedForAddition 
                        ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' 
                        : 'bg-background/90 hover:bg-background border'
                    }`}
                  >
                    {isSelectedForAddition ? 'Selected' : 'Select'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isSelectedForAddition ? 'Images will be added to this shot' : 'Add images to this shot'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

      {/* Video Generation Modal */}
      <VideoGenerationModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        shot={shot}
      />
    </>
  );
};

export default VideoShotDisplay; 