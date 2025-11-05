/**
 * Mobile-optimized ShotImageManager component
 * Handles selection-based reordering with arrow buttons
 */

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ArrowDown, Check, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePanes } from '@/shared/contexts/PanesContext';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/shared/components/ui/alert-dialog";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { MobileImageItem } from './MobileImageItem';
import { BaseShotImageManagerProps } from './types';
import { PairPromptIndicator } from './components/PairPromptIndicator';

export const ShotImageManagerMobile: React.FC<BaseShotImageManagerProps> = ({
  images,
  onImageDelete,
  onBatchImageDelete,
  onImageDuplicate,
  onImageReorder,
  onOpenLightbox,
  onInpaintClick,
  columns = 4,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  batchVideoFrames = 60,
  onImageUpload,
  isUploadingImage,
  onSelectionChange,
  readOnly = false,
  onPairClick,
  pairPrompts,
  enhancedPrompts,
  defaultPrompt,
  defaultNegativePrompt,
}) => {
  const [mobileSelectedIds, setMobileSelectedIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const currentDialogSkipChoiceRef = useRef(false);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(false);
  
  // State to control when selection bar should be visible (with delay)
  const [showSelectionBar, setShowSelectionBar] = useState(false);
  
  // Optimistic update state for mobile reordering
  const [optimisticOrder, setOptimisticOrder] = useState<any[]>([]);
  const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false);
  const [reconciliationId, setReconciliationId] = useState(0);
  
  const isMobile = useIsMobile();
  const { value: imageDeletionSettings } = useUserUIState('imageDeletion', { skipConfirmation: false });
  const { 
    isShotsPaneLocked, 
    isTasksPaneLocked, 
    shotsPaneWidth, 
    tasksPaneWidth 
  } = usePanes();

  // Double-tap detection for mobile taps
  const lastTapTimeRef = useRef<number>(0);
  const lastTappedIdRef = useRef<string | null>(null);
  const singleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mobileGridColsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
    7: 'grid-cols-7',
    8: 'grid-cols-8',
    9: 'grid-cols-9',
    10: 'grid-cols-10',
    11: 'grid-cols-11',
    12: 'grid-cols-12',
  }[columns] || 'grid-cols-4';

  // Use optimistic order if available, otherwise use props images
  const currentImages = isOptimisticUpdate && optimisticOrder.length > 0 ? optimisticOrder : images;

  // Show selection bar with a delay after items are selected
  React.useEffect(() => {
    if (mobileSelectedIds.length > 0) {
      // Delay showing selection bar to let CTA hide first
      const timer = setTimeout(() => {
        setShowSelectionBar(true);
      }, 200); // 200ms delay for smooth transition
      return () => clearTimeout(timer);
    } else {
      // Hide immediately when deselected
      setShowSelectionBar(false);
    }
  }, [mobileSelectedIds.length]);

  // Dispatch selection state to hide pane controls on mobile
  React.useEffect(() => {
    const hasSelection = mobileSelectedIds.length > 0;
    window.dispatchEvent(new CustomEvent('mobileSelectionActive', { detail: hasSelection }));
    // Notify parent component of selection change
    onSelectionChange?.(hasSelection);
  }, [mobileSelectedIds.length, onSelectionChange]);

  // Reconcile optimistic state with server state when images prop changes
  React.useEffect(() => {
    if (isOptimisticUpdate && images && images.length > 0) {
      // Check if server state matches optimistic state
      const optimisticIds = optimisticOrder.map(img => (img as any).shotImageEntryId ?? (img as any).id).join(',');
      const serverIds = images.map(img => (img as any).shotImageEntryId ?? (img as any).id).join(',');
      
      if (optimisticIds === serverIds) {
        setIsOptimisticUpdate(false);
        setOptimisticOrder([]);
      } else {
        
        // Safety timeout: force reconciliation after 5 seconds
        const timeout = setTimeout(() => {
          if (isOptimisticUpdate) {
            console.warn('[MobileOptimistic] Forcing reconciliation - optimistic update took too long');
            setIsOptimisticUpdate(false);
            setOptimisticOrder([]);
          }
        }, 5000);
        
        return () => clearTimeout(timeout);
      }
    }
  }, [images, isOptimisticUpdate, optimisticOrder]);

  // Mobile tap handler for selection (disabled in readOnly)
  const handleMobileTap = useCallback((imageId: string, index: number) => {
    if (readOnly) return; // Don't allow selection in readOnly mode

    // Clear any pending single-tap action (if a double-tap occurs)
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }

    const now = Date.now();
    const timeDiff = now - lastTapTimeRef.current;
    const isSameImage = lastTappedIdRef.current === imageId;

    // Double-tap: open lightbox immediately and do NOT toggle selection
    if (timeDiff > 10 && timeDiff < 300 && isSameImage) {
      if (onOpenLightbox) {
        onOpenLightbox(index);
      }
      // Reset refs to avoid triple taps chaining
      lastTapTimeRef.current = 0;
      lastTappedIdRef.current = null;
      return;
    }

    // Otherwise, schedule single-tap selection toggle after a short delay
    lastTapTimeRef.current = now;
    lastTappedIdRef.current = imageId;

    singleTapTimeoutRef.current = setTimeout(() => {
      const isCurrentlySelected = mobileSelectedIds.includes(imageId);
      if (isCurrentlySelected) {
        // Deselect
        setMobileSelectedIds(prev => prev.filter(id => id !== imageId));
        setLastSelectedIndex(null);
      } else {
        // Select
        setMobileSelectedIds(prev => [...prev, imageId]);
        setLastSelectedIndex(index);
      }
      singleTapTimeoutRef.current = null;
    }, 250);
  }, [mobileSelectedIds, readOnly, onOpenLightbox]);

  // Cleanup any pending single-tap timeout on unmount
  React.useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
    };
  }, []);

  // Mobile reordering function
  const handleMobileMoveHere = useCallback(async (targetIndex: number) => {
    if (mobileSelectedIds.length === 0) {
      return;
    }

    try {
      // Get the selected images and their current indices
      const selectedItems = mobileSelectedIds.map(id => {
        const image = currentImages.find(img => ((img as any).shotImageEntryId ?? (img as any).id) === id);
        const index = currentImages.findIndex(img => ((img as any).shotImageEntryId ?? (img as any).id) === id);
        return { id, image, currentIndex: index };
      }).filter(item => item.image && item.currentIndex !== -1);

      if (selectedItems.length === 0) {
        return;
      }

      // Sort by current index to maintain relative order
      selectedItems.sort((a, b) => a.currentIndex - b.currentIndex);

      // Create new order by moving selected items to target position
      const newOrder = [...currentImages];
      
      // Remove selected items from their current positions (in reverse order to maintain indices)
      selectedItems.reverse().forEach(item => {
        newOrder.splice(item.currentIndex, 1);
      });
      
      // Insert selected items at target position (maintaining their relative order)
      selectedItems.reverse().forEach((item, i) => {
        newOrder.splice(targetIndex + i, 0, item.image!);
      });

      // Create ordered IDs array for the unified system
      const orderedIds = newOrder.map(img => (img as any).shotImageEntryId ?? (img as any).id);


      // 1. Apply optimistic update immediately for instant visual feedback
      setReconciliationId(prev => prev + 1);
      setIsOptimisticUpdate(true);
      setOptimisticOrder(newOrder);

      // 2. Clear selection immediately for better UX
      setMobileSelectedIds([]);
      onSelectionChange?.(false);

      // 3. Call server update
      await onImageReorder(orderedIds);
      

    } catch (error) {
      console.error('[MobileReorder] ❌ Mobile reorder failed:', error);
      // Don't clear selection on error so user can retry
    }
  }, [mobileSelectedIds, images, onImageReorder]);

  // Individual delete handler
  const handleIndividualDelete = useCallback((shotImageEntryId: string) => {
    onImageDelete(shotImageEntryId);
  }, [onImageDelete]);

  // Batch delete handler
  const performBatchDelete = useCallback(async (idsToDelete: string[]) => {
    if (onBatchImageDelete) {
      await onBatchImageDelete(idsToDelete);
    } else {
      // Fallback to individual deletes
      for (const id of idsToDelete) {
        await onImageDelete(id);
      }
    }
    
    // Clear selections and close dialog
    setMobileSelectedIds([]);
    onSelectionChange?.(false);
    setConfirmOpen(false);
    setPendingDeleteIds([]);
  }, [onImageDelete, onBatchImageDelete, onSelectionChange]);

  // Check if item would actually move
  const wouldActuallyMove = useCallback((insertIndex: number) => {
    if (mobileSelectedIds.length === 0) return false;
    
    const selectedIndices = mobileSelectedIds
      .map(id => currentImages.findIndex(img => ((img as any).shotImageEntryId ?? (img as any).id) === id))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);
    
    const minSelected = selectedIndices[0];
    const maxSelected = selectedIndices[selectedIndices.length - 1];
    
    return insertIndex < minSelected || insertIndex > maxSelected + 1;
  }, [mobileSelectedIds, currentImages]);

  if (!currentImages || currentImages.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
        No images to display. 
        <span className="block text-sm mt-1 opacity-75">Upload images or 
          <span className="font-medium text-blue-600 dark:text-blue-400 ml-1">
            generate images
          </span>
        </span>
      </p>
    );
  }

  : [],
    enhancedPromptsKeys: enhancedPrompts ? Object.keys(enhancedPrompts) : [],
  });

  // Determine grid columns for positioning logic
  const gridColumns = {
    2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12,
  }[columns] || 4;

  return (
    <>
      <div className={cn("grid gap-3", mobileGridColsClass)}>
        {currentImages.map((image, index) => {
          const imageKey = (image as any).shotImageEntryId ?? (image as any).id;
          const isSelected = mobileSelectedIds.includes(imageKey as string);
          const isLastItem = index === currentImages.length - 1;
          
          // Calculate frame number as position * frames per pair
          const frameNumber = index * batchVideoFrames;
          
          // Show arrow buttons based on selection state and movement logic
          const showLeftArrow = mobileSelectedIds.length > 0 && !isSelected && wouldActuallyMove(index);
          const showRightArrow = mobileSelectedIds.length > 0 && isLastItem && !isSelected && wouldActuallyMove(index + 1);
          
          // Get pair data for the indicator
          // Check if PREVIOUS image was at the end of a row (meaning this image starts a new row)
          const isAtStartOfRow = index > 0 && index % gridColumns === 0;
          const prevImageWasEndOfRow = isAtStartOfRow;
          
          // This image's pair indicator (after this image)
          const pairPrompt = pairPrompts?.[index];
          const enhancedPrompt = enhancedPrompts?.[index];
          const startImage = currentImages[index];
          const endImage = currentImages[index + 1];
          
          // Pair indicator from PREVIOUS image (before this image)
          const prevPairPrompt = index > 0 ? pairPrompts?.[index - 1] : undefined;
          const prevEnhancedPrompt = index > 0 ? enhancedPrompts?.[index - 1] : undefined;
          const prevStartImage = index > 0 ? currentImages[index - 1] : undefined;
          const prevEndImage = currentImages[index];
          
          return (
            <React.Fragment key={imageKey}>
              <div className="relative">
                {/* Pair indicator from previous image - shows on LEFT if at start of row */}
                {prevImageWasEndOfRow && onPairClick && mobileSelectedIds.length === 0 && (
                  <div className="absolute top-1/2 -left-[6px] -translate-y-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                    <PairPromptIndicator
                      pairIndex={index - 1}
                      frames={batchVideoFrames}
                      startFrame={(index - 1) * batchVideoFrames}
                      endFrame={index * batchVideoFrames}
                      isMobile={true}
                      onPairClick={() => {
                        ', { pairIndex: index - 1 });
                        onPairClick(index - 1, {
                          index: index - 1,
                          frames: batchVideoFrames,
                          startFrame: (index - 1) * batchVideoFrames,
                          endFrame: index * batchVideoFrames,
                          startImage: prevStartImage ? {
                            id: (prevStartImage as any).shotImageEntryId,
                            url: prevStartImage.imageUrl || prevStartImage.location,
                            thumbUrl: prevStartImage.thumbUrl,
                            position: index
                          } : null,
                          endImage: prevEndImage ? {
                            id: (prevEndImage as any).shotImageEntryId,
                            url: prevEndImage.imageUrl || prevEndImage.location,
                            thumbUrl: prevEndImage.thumbUrl,
                            position: index + 1
                          } : null
                        });
                      }}
                      pairPrompt={prevPairPrompt?.prompt}
                      pairNegativePrompt={prevPairPrompt?.negativePrompt}
                      enhancedPrompt={prevEnhancedPrompt}
                      defaultPrompt={defaultPrompt}
                      defaultNegativePrompt={defaultNegativePrompt}
                    />
                  </div>
                )}
                
                <MobileImageItem
                  image={image}
                  isSelected={isSelected}
                  index={index}
                  onMobileTap={() => handleMobileTap(imageKey as string, index)}
                  onDelete={() => handleIndividualDelete((image as any).shotImageEntryId)}
                  onDuplicate={onImageDuplicate}
                  onOpenLightbox={onOpenLightbox ? () => onOpenLightbox(index) : undefined}
                  onInpaintClick={onInpaintClick ? () => onInpaintClick(index) : undefined}
                  hideDeleteButton={mobileSelectedIds.length > 0 || readOnly}
                  duplicatingImageId={duplicatingImageId}
                  duplicateSuccessImageId={duplicateSuccessImageId}
                  shouldLoad={true}
                  projectAspectRatio={projectAspectRatio}
                  frameNumber={frameNumber}
                  readOnly={readOnly}
                />
                
                {/* Move button on left side of each non-selected item (hidden in readOnly) */}
                {!readOnly && showLeftArrow && (
                  <div className="absolute top-1/2 -left-1 -translate-y-1/2 -translate-x-1/2 z-10">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-12 w-6 rounded-full p-0"
                      onClick={() => {
                        handleMobileMoveHere(index);
                      }}
                      onPointerDown={e => e.stopPropagation()}
                      title={index === 0 ? "Move to beginning" : "Move here"}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Move to end button on right side of last item (if not selected) (hidden in readOnly) */}
                {!readOnly && showRightArrow && (
                  <div className="absolute top-1/2 -right-1 -translate-y-1/2 translate-x-1/2 z-10">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-12 w-6 rounded-full p-0"
                      onClick={() => {
                        handleMobileMoveHere(index + 1);
                      }}
                      onPointerDown={e => e.stopPropagation()}
                      title="Move to end"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                {/* Pair indicator after this image - shows on RIGHT if NOT at end of row */}
                {!isLastItem && onPairClick && mobileSelectedIds.length === 0 && !((index + 1) % gridColumns === 0) && (
                  <div className="absolute top-1/2 -right-[6px] -translate-y-1/2 translate-x-1/2 z-30 pointer-events-auto">
                    <PairPromptIndicator
                      pairIndex={index}
                      frames={batchVideoFrames}
                      startFrame={index * batchVideoFrames}
                      endFrame={(index + 1) * batchVideoFrames}
                      isMobile={true}
                      onPairClick={() => {
                        ', { index });
                        onPairClick(index, {
                          index,
                          frames: batchVideoFrames,
                          startFrame: index * batchVideoFrames,
                          endFrame: (index + 1) * batchVideoFrames,
                          startImage: startImage ? {
                            id: (startImage as any).shotImageEntryId,
                            url: startImage.imageUrl || startImage.location,
                            thumbUrl: startImage.thumbUrl,
                            position: index + 1
                          } : null,
                          endImage: endImage ? {
                            id: (endImage as any).shotImageEntryId,
                            url: endImage.imageUrl || endImage.location,
                            thumbUrl: endImage.thumbUrl,
                            position: index + 2
                          } : null
                        });
                      }}
                      pairPrompt={pairPrompt?.prompt}
                      pairNegativePrompt={pairPrompt?.negativePrompt}
                      enhancedPrompt={enhancedPrompt}
                      defaultPrompt={defaultPrompt}
                      defaultNegativePrompt={defaultNegativePrompt}
                    />
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        
        {/* Add Images card - appears as next item in grid (hidden in readOnly) */}
        {!readOnly && onImageUpload && (() => {
          // Calculate aspect ratio to match project settings
          const getAspectRatioStyle = () => {
            // Use project aspect ratio if available
            if (projectAspectRatio) {
              const [w, h] = projectAspectRatio.split(':').map(Number);
              if (!isNaN(w) && !isNaN(h)) {
                const aspectRatio = w / h;
                return { aspectRatio: `${aspectRatio}` };
              }
            }
            
            // Default to square aspect ratio
            return { aspectRatio: '1' };
          };

          const aspectRatioStyle = getAspectRatioStyle();

          return (
            <div className="relative" style={aspectRatioStyle}>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    onImageUpload(files);
                    e.target.value = ''; // Reset input
                  }
                }}
                className="hidden"
                id="mobile-grid-image-upload"
                disabled={isUploadingImage}
              />
              <label
                htmlFor="mobile-grid-image-upload"
                className={cn(
                  "absolute inset-0 flex flex-col items-center justify-center gap-2",
                  "border-2 border-dashed rounded-lg cursor-pointer",
                  "transition-all duration-200",
                  isUploadingImage
                    ? "border-muted-foreground/30 bg-muted/30 cursor-not-allowed"
                    : "border-muted-foreground/40 bg-muted/20 hover:border-primary hover:bg-primary/5"
                )}
              >
                <div className="text-3xl text-muted-foreground">+</div>
                <div className="text-xs text-muted-foreground font-medium sm:hidden lg:block">
                  {isUploadingImage ? 'Uploading...' : 'Add Images'}
                </div>
              </label>
            </div>
          );
        })()}
      </div>

      {/* Floating Action Bar for Multiple Selection (hidden in readOnly) */}
      {!readOnly && showSelectionBar && mobileSelectedIds.length >= 1 && (() => {
        const leftOffset = isShotsPaneLocked ? shotsPaneWidth : 0;
        const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0;
        
        return (
          <div 
            className="fixed z-50 flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-300"
            style={{
              left: `${leftOffset}px`,
              right: `${rightOffset}px`,
              paddingLeft: '16px',
              paddingRight: '16px',
              bottom: '64px', // Higher on mobile
            }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
              <span className="text-sm font-light text-gray-700 dark:text-gray-300">
                {mobileSelectedIds.length} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMobileSelectedIds([]);
                    onSelectionChange?.(false);
                  }}
                  className="text-sm"
                >
                  {mobileSelectedIds.length === 1 ? 'Deselect' : 'Deselect All'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setPendingDeleteIds([...mobileSelectedIds]);
                    setConfirmOpen(true);
                  }}
                  className="text-sm"
                >
                  {mobileSelectedIds.length === 1 ? 'Delete' : 'Delete All'}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Images</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pendingDeleteIds.length} selected image{pendingDeleteIds.length > 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setConfirmOpen(false);
                setPendingDeleteIds([]);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => performBatchDelete(pendingDeleteIds)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {pendingDeleteIds.length} Image{pendingDeleteIds.length > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
