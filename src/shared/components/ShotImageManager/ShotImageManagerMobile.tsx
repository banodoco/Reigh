/**
 * Mobile-optimized ShotImageManager component
 * Handles selection-based reordering with arrow buttons
 */

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ArrowDown, Check, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePanes } from '@/shared/contexts/PanesContext';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/shared/components/ui/alert-dialog";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { MobileImageItem } from './MobileImageItem';
import { BaseShotImageManagerProps } from './types';
import { PairPromptIndicator } from './components/PairPromptIndicator';
import { InlineSegmentVideo } from '@/tools/travel-between-images/components/Timeline/InlineSegmentVideo';

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
  onClearEnhancedPrompt,
  pairOverrides,
  segmentSlots,
  onSegmentClick,
  hasPendingTask,
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

  // Use columns from useDeviceDetection (phones=2, tablet portrait=3, tablet landscape=4)
  // This ensures the grid scales appropriately for different screen sizes
  const isInMoveMode = mobileSelectedIds.length > 0;
  const effectiveColumns = columns;
  
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
  }[effectiveColumns] || 'grid-cols-2';

  // Use optimistic order if available, otherwise use props images
  const currentImages = isOptimisticUpdate && optimisticOrder.length > 0 ? optimisticOrder : images;

  // Reset optimistic state when images array changes significantly (e.g., shot navigation)
  // This prevents flickering when the component receives a completely new dataset
  const prevImagesLengthRef = React.useRef(images.length);
  React.useEffect(() => {
    // If the images array length changes dramatically (not just +/- 1 from reorder/delete/add),
    // it's likely a new shot or major data refresh - clear optimistic state
    const lengthDiff = Math.abs(images.length - prevImagesLengthRef.current);
    if (lengthDiff > 1 && isOptimisticUpdate) {
      console.log('[MobileOptimistic] Clearing optimistic state due to major data change', {
        prevLength: prevImagesLengthRef.current,
        newLength: images.length,
        diff: lengthDiff
      });
      setIsOptimisticUpdate(false);
      setOptimisticOrder([]);
    }
    prevImagesLengthRef.current = images.length;
  }, [images.length, isOptimisticUpdate]);

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
    
    // Cleanup: ensure pane controls are restored when component unmounts
    return () => {
      window.dispatchEvent(new CustomEvent('mobileSelectionActive', { detail: false }));
    };
  }, [mobileSelectedIds.length, onSelectionChange]);

  // Reconcile optimistic state with server state when images prop changes
  React.useEffect(() => {
    if (isOptimisticUpdate && images && images.length > 0) {
      // Check if server state matches optimistic state
      // img.id is shot_generations.id - unique per entry
      const optimisticIds = optimisticOrder.map(img => img.id).join(',');
      const serverIds = images.map(img => img.id).join(',');
      
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
  // Simple toggle - no double-tap detection needed since we show a lightbox button when selected
  const handleMobileTap = useCallback((imageId: string, index: number) => {
    if (readOnly) return; // Don't allow selection in readOnly mode

    const wasSelected = mobileSelectedIds.includes(imageId);

    if (wasSelected) {
      setMobileSelectedIds(prev => prev.filter(id => id !== imageId));
      setLastSelectedIndex(null);
    } else {
      setMobileSelectedIds(prev => [...prev, imageId]);
      setLastSelectedIndex(index);
    }
  }, [mobileSelectedIds, readOnly, lastSelectedIndex]);

  // Mobile reordering function
  const handleMobileMoveHere = useCallback(async (targetIndex: number) => {
    if (mobileSelectedIds.length === 0) {
      return;
    }

    try {
      // Get the selected images and their current indices
      // img.id is shot_generations.id - unique per entry
      const selectedItems = mobileSelectedIds.map(id => {
        const image = currentImages.find(img => img.id === id);
        const index = currentImages.findIndex(img => img.id === id);
        return { id, image, currentIndex: index };
      }).filter(item => item.image && item.currentIndex !== -1);

      if (selectedItems.length === 0) {
        return;
      }

      // Safety check: Ensure all images have id
      const hasMissingIds = currentImages.some(img => !img.id);
      if (hasMissingIds) {
        const missingCount = currentImages.filter(img => !img.id).length;
        console.warn('[MobileReorder] ⚠️  Some images missing id. Cannot reorder yet.', {
          totalImages: currentImages.length,
          missingIds: missingCount
        });
        const { toast } = await import('sonner');
        const message = currentImages.length > 500 
          ? `Loading metadata for ${currentImages.length} images... this may take a moment.`
          : 'Loading image metadata... please wait a moment and try again.';
        toast.error(message);
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

      // Create ordered IDs array for the unified system (safe now - checked above)
      const orderedIds = newOrder.map(img => img.id);
      
      // For single item moves, pass the dragged item ID for midpoint insertion
      const draggedItemId = selectedItems.length === 1 ? selectedItems[0].id : undefined;

      // 1. Apply optimistic update immediately for instant visual feedback
      setReconciliationId(prev => prev + 1);
      setIsOptimisticUpdate(true);
      setOptimisticOrder(newOrder);

      // 2. Clear selection immediately for better UX
      setMobileSelectedIds([]);
      onSelectionChange?.(false);

      // 3. Call server update
      await onImageReorder(orderedIds, draggedItemId);
      

    } catch (error) {
      console.error('[MobileReorder] ❌ Mobile reorder failed:', error);
      // Don't clear selection on error so user can retry
    }
  }, [mobileSelectedIds, currentImages, onImageReorder, onSelectionChange]);

  // Individual delete handler
  const handleIndividualDelete = useCallback((shotImageEntryId: string) => {
    onImageDelete(shotImageEntryId);
  }, [onImageDelete]);

  // Batch delete handler
  const performBatchDelete = useCallback(async (idsToDelete: string[]) => {
    // Filter out IDs that don't correspond to actual shotImageEntryIds
    // Filter to valid IDs only
    const validIds = idsToDelete.filter(id => {
      const img = currentImages.find(i => i.id === id);
      return img && img.id;
    });
    
    if (validIds.length < idsToDelete.length) {
      console.warn('[MobileBatchDelete] ⚠️  Some images missing shotImageEntryId (Phase 2 incomplete). Skipping those.');
      const { toast } = await import('sonner');
      toast.warning(`Could only delete ${validIds.length} of ${idsToDelete.length} images. Some are still loading metadata.`);
    }
    
    if (validIds.length === 0) {
      const { toast } = await import('sonner');
      const message = currentImages.length > 500 
        ? `Loading metadata for ${currentImages.length} images... please wait.`
        : 'Unable to delete images. Metadata still loading, please wait a moment and try again.';
      toast.error(message);
      setConfirmOpen(false);
      return;
    }
    
    if (onBatchImageDelete) {
      await onBatchImageDelete(validIds);
    } else {
      // Fallback to individual deletes
      for (const id of validIds) {
        await onImageDelete(id);
      }
    }
    
    // Clear selections and close dialog
    setMobileSelectedIds([]);
    onSelectionChange?.(false);
    setConfirmOpen(false);
    setPendingDeleteIds([]);
  }, [currentImages, onImageDelete, onBatchImageDelete, onSelectionChange]);

  // Check if item would actually move
  const wouldActuallyMove = useCallback((insertIndex: number) => {
    if (mobileSelectedIds.length === 0) return false;
    
    const selectedIndices = mobileSelectedIds
      .map(id => currentImages.findIndex(img => img.id === id))
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

  console.log('[PairIndicatorDebug] ShotImageManagerMobile render:', {
    imagesCount: currentImages.length,
    hasOnPairClick: !!onPairClick,
    hasPairPrompts: !!pairPrompts,
    hasEnhancedPrompts: !!enhancedPrompts,
    pairPromptsKeys: pairPrompts ? Object.keys(pairPrompts) : [],
    enhancedPromptsKeys: enhancedPrompts ? Object.keys(enhancedPrompts) : [],
  });

  // Determine grid columns for positioning logic (same as effectiveColumns)
  const gridColumns = columns;

  // Always use grid view - no mode switching to prevent component unmount/remount flashing
  return (
    <>
      <div className={cn("grid gap-3 pt-6 overflow-visible", mobileGridColsClass)}>
        {currentImages.map((image, index) => {
          // imageKey is shot_generations.id - unique per entry
          const imageKey = image.id;
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
          
          // Get segment slot for this pair (if available)
          const segmentSlot = segmentSlots?.find(s => s.index === index);
          const prevSegmentSlot = index > 0 ? segmentSlots?.find(s => s.index === index - 1) : undefined;
          // (debug logs removed)
          
          return (
            <React.Fragment key={imageKey}>
              <div className="relative">
                {/* Video and pair indicator - centered together (LEFT side, at start of row for previous pair) */}
                {prevImageWasEndOfRow && !isInMoveMode && (() => {
                  const hasPrevVideo = prevSegmentSlot && prevSegmentSlot.type === 'child' && prevSegmentSlot.child.location;
                  const prevPairShotGenId = prevStartImage?.id;
                  const isPrevPending = hasPendingTask?.(prevPairShotGenId);
                  const showPrevSegmentArea = hasPrevVideo || isPrevPending;

                  // Only render if there's something to show
                  if (!showPrevSegmentArea && !onPairClick) return null;

                  return (
                    <div className="absolute -left-[6px] top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-auto">
                      {/* Video or pending indicator */}
                      {showPrevSegmentArea && (
                        <div className="w-16">
                          {prevSegmentSlot ? (
                            <InlineSegmentVideo
                              slot={prevSegmentSlot}
                              pairIndex={index - 1}
                              onClick={() => onSegmentClick?.(index - 1)}
                              onOpenPairSettings={onPairClick}
                              projectAspectRatio={projectAspectRatio}
                              isMobile={true}
                              layout="flow"
                              compact={true}
                              isPending={isPrevPending}
                            />
                          ) : isPrevPending ? (
                            <div className="h-12 bg-muted/40 border-2 border-dashed border-primary/40 rounded-md flex items-center justify-center shadow-sm">
                              <div className="flex flex-col items-center gap-0.5 text-primary">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span className="text-[9px] font-medium">Pending</span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                      {/* Pair prompt indicator */}
                      {onPairClick && (
                        <PairPromptIndicator
                          pairIndex={index - 1}
                          frames={batchVideoFrames}
                          startFrame={(index - 1) * batchVideoFrames}
                          endFrame={index * batchVideoFrames}
                          isMobile={true}
                          onClearEnhancedPrompt={onClearEnhancedPrompt}
                          onPairClick={() => {
                            console.log('[PairIndicatorDebug] Mobile: Pair indicator clicked (left)', { pairIndex: index - 1 });
                            onPairClick(index - 1);
                          }}
                          pairPrompt={prevPairPrompt?.prompt}
                          pairNegativePrompt={prevPairPrompt?.negativePrompt}
                          enhancedPrompt={prevEnhancedPrompt}
                          defaultPrompt={defaultPrompt}
                          defaultNegativePrompt={defaultNegativePrompt}
                          pairPhaseConfig={pairOverrides?.[index - 1]?.phaseConfig}
                          pairLoras={pairOverrides?.[index - 1]?.loras}
                          pairMotionSettings={pairOverrides?.[index - 1]?.motionSettings}
                        />
                      )}
                    </div>
                  );
                })()}
                
                <MobileImageItem
                  image={image}
                  isSelected={isSelected}
                  index={index}
                  onMobileTap={() => handleMobileTap(imageKey as string, index)}
                  onDelete={image.id ? () => handleIndividualDelete(image.id) : undefined}
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
                
                {/* Video and pair indicator - centered together in the gap (RIGHT side, not at end of row) */}
                {!isLastItem && !isInMoveMode && !((index + 1) % gridColumns === 0) && (() => {
                  const hasVideo = segmentSlot && segmentSlot.type === 'child' && segmentSlot.child.location;
                  const pairShotGenId = startImage?.id;
                  const isPending = hasPendingTask?.(pairShotGenId);
                  const showSegmentArea = hasVideo || isPending;

                  // Only render if there's something to show
                  if (!showSegmentArea && !onPairClick) return null;

                  return (
                    <div className="absolute -right-[6px] top-1/2 -translate-y-1/2 translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-auto">
                      {/* Video or pending indicator */}
                      {showSegmentArea && (
                        <div className="w-16">
                          {segmentSlot ? (
                            <InlineSegmentVideo
                              slot={segmentSlot}
                              pairIndex={index}
                              onClick={() => onSegmentClick?.(index)}
                              onOpenPairSettings={onPairClick}
                              projectAspectRatio={projectAspectRatio}
                              isMobile={true}
                              layout="flow"
                              compact={true}
                              isPending={isPending}
                            />
                          ) : isPending ? (
                            <div className="h-12 bg-muted/40 border-2 border-dashed border-primary/40 rounded-md flex items-center justify-center shadow-sm">
                              <div className="flex flex-col items-center gap-0.5 text-primary">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span className="text-[9px] font-medium">Pending</span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                      {/* Pair prompt indicator */}
                      {onPairClick && (
                        <PairPromptIndicator
                          pairIndex={index}
                          frames={batchVideoFrames}
                          startFrame={index * batchVideoFrames}
                          endFrame={(index + 1) * batchVideoFrames}
                          isMobile={true}
                          onClearEnhancedPrompt={onClearEnhancedPrompt}
                          onPairClick={() => {
                            console.log('[PairIndicatorDebug] Mobile: Pair indicator clicked (right)', { index });
                            onPairClick(index);
                          }}
                          pairPrompt={pairPrompt?.prompt}
                          pairNegativePrompt={pairPrompt?.negativePrompt}
                          enhancedPrompt={enhancedPrompt}
                          defaultPrompt={defaultPrompt}
                          defaultNegativePrompt={defaultNegativePrompt}
                          pairPhaseConfig={pairOverrides?.[index]?.phaseConfig}
                          pairLoras={pairOverrides?.[index]?.loras}
                          pairMotionSettings={pairOverrides?.[index]?.motionSettings}
                        />
                      )}
                    </div>
                  );
                })()}
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
            className="fixed z-50 flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-none"
            style={{
              left: `${leftOffset}px`,
              right: `${rightOffset}px`,
              paddingLeft: '16px',
              paddingRight: '16px',
              bottom: '64px', // Higher on mobile
            }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 pointer-events-auto">
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
