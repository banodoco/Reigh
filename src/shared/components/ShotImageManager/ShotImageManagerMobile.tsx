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

export const ShotImageManagerMobile: React.FC<BaseShotImageManagerProps> = ({
  images,
  onImageDelete,
  onBatchImageDelete,
  onImageDuplicate,
  onImageReorder,
  columns = 4,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
}) => {
  const [mobileSelectedIds, setMobileSelectedIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const currentDialogSkipChoiceRef = useRef(false);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(false);
  
  const isMobile = useIsMobile();
  const { imageDeletionSettings } = useUserUIState();
  const { 
    isShotsPaneLocked, 
    isTasksPaneLocked, 
    shotsPaneWidth, 
    tasksPaneWidth 
  } = usePanes();

  const gridColsClass = {
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

  // Mobile tap handler for selection
  const handleMobileTap = useCallback((imageId: string, index: number) => {
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
  }, [mobileSelectedIds]);

  // Mobile reordering function
  const handleMobileMoveHere = useCallback(async (targetIndex: number) => {
    if (mobileSelectedIds.length === 0) {
      console.log('[MobileReorder] No items selected for reordering');
      return;
    }

    console.log('[MobileReorder] 🔄 STARTING mobile reorder:', {
      selectedCount: mobileSelectedIds.length,
      selectedIds: mobileSelectedIds.map(id => id.substring(0, 8)),
      targetIndex,
      currentImagesLength: images.length
    });

    try {
      // Get the selected images and their current indices
      const selectedItems = mobileSelectedIds.map(id => {
        const image = images.find(img => ((img as any).shotImageEntryId ?? (img as any).id) === id);
        const index = images.findIndex(img => ((img as any).shotImageEntryId ?? (img as any).id) === id);
        return { id, image, currentIndex: index };
      }).filter(item => item.image && item.currentIndex !== -1);

      if (selectedItems.length === 0) {
        console.log('[MobileReorder] No valid selected items found');
        return;
      }

      // Sort by current index to maintain relative order
      selectedItems.sort((a, b) => a.currentIndex - b.currentIndex);

      // Create new order by moving selected items to target position
      const newOrder = [...images];
      
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

      console.log('[MobileReorder] 🎯 Calling unified reorder system:', {
        originalOrder: images.map(img => ((img as any).shotImageEntryId ?? (img as any).id).substring(0, 8)),
        newOrder: orderedIds.map(id => id.substring(0, 8)),
        movedItems: selectedItems.map(item => item.id.substring(0, 8)),
        targetIndex
      });

      // Use the unified position system
      await onImageReorder(orderedIds);

      // Clear selection after successful reorder
      setMobileSelectedIds([]);
      
      console.log('[MobileReorder] ✅ Mobile reorder completed successfully');

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
    setConfirmOpen(false);
    setPendingDeleteIds([]);
  }, [onImageDelete, onBatchImageDelete]);

  // Check if item would actually move
  const wouldActuallyMove = useCallback((insertIndex: number) => {
    if (mobileSelectedIds.length === 0) return false;
    
    const selectedIndices = mobileSelectedIds
      .map(id => images.findIndex(img => ((img as any).shotImageEntryId ?? (img as any).id) === id))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);
    
    const minSelected = selectedIndices[0];
    const maxSelected = selectedIndices[selectedIndices.length - 1];
    
    return insertIndex < minSelected || insertIndex > maxSelected + 1;
  }, [mobileSelectedIds, images]);

  if (!images || images.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
        No images to display. 
        <span className="block text-sm mt-1 opacity-75">Upload images or 
        <span className="font-medium text-blue-600 dark:text-blue-400 ml-1"
        >generate images</span>
      </p>
    );
  }

  return (
    <>
      <div className={cn("grid gap-3", gridColsClass)}>
        {images.map((image, index) => {
          const imageKey = (image as any).shotImageEntryId ?? (image as any).id;
          const isSelected = mobileSelectedIds.includes(imageKey as string);
          const isLastItem = index === images.length - 1;
          
          // Show arrow buttons based on selection state and movement logic
          const showLeftArrow = mobileSelectedIds.length > 0 && !isSelected && wouldActuallyMove(index);
          const showRightArrow = mobileSelectedIds.length > 0 && isLastItem && !isSelected && wouldActuallyMove(index + 1);
          
          return (
            <React.Fragment key={imageKey}>
              <div className="relative">
                <MobileImageItem
                  image={image}
                  isSelected={isSelected}
                  index={index}
                  onMobileTap={() => handleMobileTap(imageKey as string, index)}
                  onDelete={() => handleIndividualDelete((image as any).shotImageEntryId)}
                  onDuplicate={onImageDuplicate}
                  hideDeleteButton={mobileSelectedIds.length > 0}
                  duplicatingImageId={duplicatingImageId}
                  duplicateSuccessImageId={duplicateSuccessImageId}
                  shouldLoad={true}
                  projectAspectRatio={projectAspectRatio}
                />
                
                {/* Move button on left side of each non-selected item */}
                {showLeftArrow && (
                  <div className="absolute top-1/2 -left-1 -translate-y-1/2 -translate-x-1/2 z-10">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-12 w-6 rounded-full p-0"
                      onClick={() => {
                        console.log('[MobileReorder] 📱 Arrow button clicked:', { targetIndex: index, selectedCount: mobileSelectedIds.length });
                        handleMobileMoveHere(index);
                      }}
                      onPointerDown={e => e.stopPropagation()}
                      title={index === 0 ? "Move to beginning" : "Move here"}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Move to end button on right side of last item (if not selected) */}
                {showRightArrow && (
                  <div className="absolute top-1/2 -right-1 -translate-y-1/2 translate-x-1/2 z-10">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-12 w-6 rounded-full p-0"
                      onClick={() => {
                        console.log('[MobileReorder] 📱 Arrow button clicked (end):', { targetIndex: index + 1, selectedCount: mobileSelectedIds.length });
                        handleMobileMoveHere(index + 1);
                      }}
                      onPointerDown={e => e.stopPropagation()}
                      title="Move to end"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Floating Action Bar for Multiple Selection */}
      {mobileSelectedIds.length >= 1 && (() => {
        const leftOffset = isShotsPaneLocked ? shotsPaneWidth : 0;
        const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0;
        
        return (
          <div 
            className="fixed bottom-6 z-50 flex justify-center"
            style={{
              left: `${leftOffset}px`,
              right: `${rightOffset}px`,
              paddingLeft: '16px',
              paddingRight: '16px',
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
                  onClick={() => setMobileSelectedIds([])}
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
            <AlertDialogCancel onClick={() => {
              setConfirmOpen(false);
              setPendingDeleteIds([]);
            }}>Cancel</AlertDialogCancel>
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
