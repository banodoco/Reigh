import React, { useState, Fragment, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { GenerationRow } from '@/types/shots';
import { SortableImageItem } from '@/tools/travel-between-images/components/SortableImageItem'; // Adjust path as needed
import MediaLightbox from './MediaLightbox';
import { cn, getDisplayUrl } from '@/shared/lib/utils';
import { MultiImagePreview, SingleImagePreview } from './ImageDragPreview';

import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Button } from './ui/button';
import { ArrowDown, Trash2, Check } from 'lucide-react';
import { ProgressiveLoadingManager } from '@/shared/components/ProgressiveLoadingManager';
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel, AlertDialogOverlay } from "@/shared/components/ui/alert-dialog";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePanes } from '@/shared/contexts/PanesContext';

// Removed legacy sessionStorage key constant now that setting is persisted in DB

export interface ShotImageManagerProps {
  images: GenerationRow[];
  onImageDelete: (shotImageEntryId: string) => void;
  onImageDuplicate?: (shotImageEntryId: string, position: number) => void;
  onImageReorder: (orderedShotGenerationIds: string[]) => void;
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  generationMode: 'batch' | 'timeline';
  onImageSaved?: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>; // Callback when image is saved with changes
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string; // Add project aspect ratio
}

const ShotImageManager: React.FC<ShotImageManagerProps> = ({
  images,
  onImageDelete,
  onImageDuplicate,
  onImageReorder,
  columns = 4,
  generationMode,
  onImageSaved,
  onMagicEdit,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
}) => {
  // State for drag and drop
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mobileSelectedIds, setMobileSelectedIds] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(false);
  const currentDialogSkipChoiceRef = useRef(false);
  
  // State to preserve selected IDs for delete confirmation
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const isMobile = useIsMobile();
  const outerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Optimistic local order state - shows immediate drag results
  const [optimisticOrder, setOptimisticOrder] = useState<GenerationRow[]>(images);
  const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false);
  const [reconciliationId, setReconciliationId] = useState(0);
  const reconciliationTimeoutRef = useRef<NodeJS.Timeout>();

  // Get pane states to adjust floating bar position
  const { 
    isShotsPaneLocked, 
    isTasksPaneLocked,
    shotsPaneWidth,
    tasksPaneWidth
  } = usePanes();

  // CRITICAL OPTIMISTIC UPDATE RACE CONDITION FIX:
  // Enhanced reconciliation with debouncing, tracking IDs, and timeout-based recovery
  // This prevents the component from getting stuck in inconsistent optimistic states
  useEffect(() => {
    console.log('[DragDebug:ShotImageManager] Parent images prop changed', {
      newLength: images.length,
      isOptimisticUpdate,
      reconciliationId,
      timestamp: Date.now()
    });
    
    // Clear any pending reconciliation timeout
    if (reconciliationTimeoutRef.current) {
      clearTimeout(reconciliationTimeoutRef.current);
    }
    
    // If we're in the middle of an optimistic update, use debounced reconciliation
    if (isOptimisticUpdate) {
      console.log('[DragDebug:ShotImageManager] Skipping immediate sync - optimistic update in progress');
      
      const currentReconciliationId = reconciliationId;
      
      // Debounce reconciliation checks to prevent race conditions
      reconciliationTimeoutRef.current = setTimeout(() => {
        // Check if this reconciliation is still current
        if (currentReconciliationId !== reconciliationId) {
          console.log('[DragDebug:ShotImageManager] Reconciliation cancelled - newer reconciliation in progress');
          return;
        }
        
        // Check if parent props now match our optimistic order (operation completed successfully)
        const currentOrder = optimisticOrder.map(img => img.shotImageEntryId).join(',');
        const parentOrder = images.map(img => img.shotImageEntryId).join(',');
        
        if (currentOrder === parentOrder) {
          console.log('[DragDebug:ShotImageManager] Parent caught up with optimistic order - ending optimistic mode');
          setIsOptimisticUpdate(false);
          // Parent is now consistent, we can sync only if different reference
          if (optimisticOrder !== images) {
            setOptimisticOrder(images);
          }
        } else {
          console.log('[DragDebug:ShotImageManager] Parent still has stale data - keeping optimistic order');
          
          // Safety check: if optimistic update has been active for more than 5 seconds, force reconciliation
          const optimisticStartTime = Date.now() - 5000; // 5 seconds ago
          if (optimisticStartTime > Date.now()) {
            console.warn('[DragDebug:ShotImageManager] Forcing reconciliation - optimistic update too long');
            setIsOptimisticUpdate(false);
            setOptimisticOrder(images);
          }
        }
      }, 100); // 100ms debounce
    } else {
      console.log('[DragDebug:ShotImageManager] Normal sync from parent props');
      // Only update if the reference is actually different
      if (optimisticOrder !== images) {
        setOptimisticOrder(images);
      } else {
        console.log('[DragDebug:ShotImageManager] Skipping sync - same reference');
      }
    }
  }, [images, isOptimisticUpdate, reconciliationId, optimisticOrder]);

  // Cleanup reconciliation timeout on unmount
  useEffect(() => {
    return () => {
      if (reconciliationTimeoutRef.current) {
        clearTimeout(reconciliationTimeoutRef.current);
      }
    };
  }, []);

  // Use optimistic order everywhere instead of the parent `images` prop
  // Memoize to prevent unstable references during re-renders
  const currentImages = useMemo(() => {
    // Safety check: ensure we have valid images during component re-renders
    if (!optimisticOrder || optimisticOrder.length === 0) {
      return images || [];
    }
    return optimisticOrder;
  }, [optimisticOrder, images]);
  // Progressive loading page context (single page view inside manager)
  const progressivePage = 0;


  // Use ref pattern to create stable function reference that doesn't change
  const onImageReorderRef = useRef(onImageReorder);
  onImageReorderRef.current = onImageReorder;
  
  const stableOnImageReorder = useCallback((orderedIds: string[]) => {
    if (onImageReorderRef.current) {
      onImageReorderRef.current(orderedIds);
    }
  }, []); // Empty dependency array - function never changes



  // Mobile double-tap detection refs
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Batch delete function - hoisted to top level to survive re-renders
  const performBatchDelete = React.useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      
      // Clear selection first for immediate UI feedback (both mobile and desktop)
      setMobileSelectedIds([]);
      setSelectedIds([]);
      setConfirmOpen(false);
      setPendingDeleteIds([]); // Clear pending delete IDs
      
      // Execute deletions
      ids.forEach(id => onImageDelete(id));
    },
    [onImageDelete]
  );

  // Individual delete function that clears selection if needed
  const handleIndividualDelete = React.useCallback(
    (id: string) => {
      // Clear selection if the deleted item was selected
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      setMobileSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      
      // Execute deletion
      onImageDelete(id);
    },
    [onImageDelete]
  );

  // Deselect when clicking outside the entire image manager area (mobile selection mode)
  useEffect(() => {
    if (!isMobile) return;

    const handleDocClick = (e: MouseEvent) => {
      if (mobileSelectedIds.length === 0) return;
      if (outerRef.current && !outerRef.current.contains(e.target as Node)) {
        setMobileSelectedIds([]);
      }
    };

    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [mobileSelectedIds.length, isMobile]);

  const handleMoveHere = (targetIndex: number) => {
    if (mobileSelectedIds.length === 0) return;
    
    // Get selected items and remaining items
    const selectedItems = currentImages.filter(img => mobileSelectedIds.includes(img.shotImageEntryId));
    const remainingItems = currentImages.filter(img => !mobileSelectedIds.includes(img.shotImageEntryId));
    
    // Calculate adjusted target index based on selected items before target
    const selectedIndicesBefore = mobileSelectedIds
      .map(id => currentImages.findIndex(img => img.shotImageEntryId === id))
      .filter(idx => idx < targetIndex).length;
    const adjustedTargetIndex = Math.max(0, targetIndex - selectedIndicesBefore);
    
    // Insert selected items at target position
    const newOrder = [
      ...remainingItems.slice(0, adjustedTargetIndex),
      ...selectedItems,
      ...remainingItems.slice(adjustedTargetIndex)
    ];
    
    // Update optimistic order immediately, then notify parent
    setReconciliationId(prev => prev + 1); // Track this specific update
    setIsOptimisticUpdate(true); // Flag that we're doing an optimistic update
    setOptimisticOrder(newOrder);
    stableOnImageReorder(newOrder.map(img => img.shotImageEntryId));
    setMobileSelectedIds([]); // Clear selection after move
  };

  // Mobile double-tap detection refs
  const lastTouchTimeRef = useRef<number>(0);

  const handleMobileTap = useCallback((id: string, index: number) => {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTouchTimeRef.current;
    
    // Safety check: ensure we have valid images during re-renders
    if (!currentImages || currentImages.length === 0 || index >= currentImages.length) {
      console.log('[DragDebug:ShotImageManager] Skipping mobile tap - invalid state during re-render');
      return;
    }
    
    if (timeDiff < 300) {
      // Double tap detected
      const image = currentImages[index];
      if (image?.imageUrl) {
        setLightboxIndex(index);
      }
      return;
    }
    
    // Single tap - handle selection
    if (mobileSelectedIds.includes(id)) {
      setMobileSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    } else {
      setMobileSelectedIds(prev => [...prev, id]);
    }
    
    lastTouchTimeRef.current = currentTime;
  }, [mobileSelectedIds, currentImages]);

  const { value: imageDeletionSettings, update: updateImageDeletionSettings } = useUserUIState('imageDeletion', { skipConfirmation: false });

  // Sync visual state with database state when it loads
  useEffect(() => {
    if (imageDeletionSettings.skipConfirmation) {
      setSkipConfirmationNextTimeVisual(true);
      currentDialogSkipChoiceRef.current = true;
    }
  }, [imageDeletionSettings.skipConfirmation]);

  // Notify other components (e.g., PaneControlTab) when mobile selection is active
  useEffect(() => {
    if (!isMobile) return;

    const active = mobileSelectedIds.length > 0;
    const event = new CustomEvent('mobileSelectionActive', { detail: active });
    window.dispatchEvent(event);

    return () => {
      // On cleanup, ensure we reset to inactive if component unmounts
      window.dispatchEvent(new CustomEvent('mobileSelectionActive', { detail: false }));
    };
  }, [mobileSelectedIds.length, isMobile]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);

  // Always call hooks in the same order. Adjust activation constraints per breakpoint
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      // On mobile, set an effectively unreachable constraint so it won't interfere
      activationConstraint: isMobile
        ? { distance: 99999 }
        : { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Preserve multi-selection when initiating a drag with ⌘/Ctrl pressed
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    console.log('[DragDebug:ShotImageManager] Drag started', { 
      activeId: active.id,
      selectedIds: selectedIds.length,
      mobileSelectedIds: mobileSelectedIds.length,
      timestamp: Date.now()
    });

    // Record the item being dragged so we can show a preview
    setActiveId(active.id as string);

    // If the drag was started while the modifier key (⌘ on macOS, Ctrl on Windows/Linux)
    // is pressed we **do not** clear the existing selection. This allows users to
    // Command/Ctrl-click multiple images and then drag the whole group in one go.
    // `activatorEvent` is the original pointer/mouse event that triggered the drag.
    // See: https://docs.dndkit.com/6.0.x/api-documentation/dnd-context#events
    // Casting to `any` so we can safely access `activatorEvent`.
    const activatorEvent = (event as any)?.activatorEvent as (MouseEvent | PointerEvent | undefined);

    const isModifierPressed = activatorEvent?.metaKey || activatorEvent?.ctrlKey;

    if (!isModifierPressed && !selectedIds.includes(active.id as string)) {
      // Starting a regular drag on an un-selected item -> clear previous selection
      console.log('[DragDebug:ShotImageManager] Clearing selection during drag start');
      setSelectedIds([]);
    }
  }, [selectedIds, mobileSelectedIds]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    console.log('[DragDebug:ShotImageManager] Drag ended', { 
      activeId: active.id,
      overId: over?.id,
      selectedIds: selectedIds.length,
      timestamp: Date.now()
    });
    
    setActiveId(null);
    
    if (!over || active.id === over.id) {
      console.log('[DragDebug:ShotImageManager] Drag ended with no change - same position');
      return;
    }

    // Safety check: ensure we have valid images and callbacks during re-renders
    if (!currentImages || currentImages.length === 0) {
      console.log('[DragDebug:ShotImageManager] Skipping reorder - invalid state during re-render');
      return;
    }

    const activeIsSelected = selectedIds.includes(active.id as string);

    if (!activeIsSelected || selectedIds.length <= 1) {
      const oldIndex = currentImages.findIndex((img) => img.shotImageEntryId === active.id);
      const newIndex = currentImages.findIndex((img) => img.shotImageEntryId === over.id);
      console.log('[DragDebug:ShotImageManager] Single item drag', { 
        oldIndex, 
        newIndex, 
        willReorder: oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex 
      });
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        // 1. Update optimistic order immediately for instant visual feedback
        const newOrder = arrayMove(currentImages, oldIndex, newIndex);
        console.log('[DragDebug:ShotImageManager] Updating optimistic order immediately');
        
        // Increment reconciliation ID to track this specific update
        setReconciliationId(prev => prev + 1);
        setIsOptimisticUpdate(true); // Flag that we're doing an optimistic update
        setOptimisticOrder(newOrder);
        
        // 2. Notify parent so React state becomes eventually consistent
        console.log('[DragDebug:ShotImageManager] Calling onImageReorder for single item');
        stableOnImageReorder(newOrder.map((img) => img.shotImageEntryId));
      }
      setSelectedIds([]);
      return;
    }

    // Multi-drag logic
    console.log('[DragDebug:ShotImageManager] Multi-drag reorder', { selectedCount: selectedIds.length });

    const overIndex = currentImages.findIndex((img) => img.shotImageEntryId === over.id);
    const activeIndex = currentImages.findIndex((img) => img.shotImageEntryId === active.id);

    const selectedItems = currentImages.filter((img) => selectedIds.includes(img.shotImageEntryId));
    const remainingItems = currentImages.filter((img) => !selectedIds.includes(img.shotImageEntryId));

    // If dropping onto a selected item, we need to determine the correct insertion point
    let targetIndex: number;
    let newItems: GenerationRow[];
    
    if (selectedIds.includes(over.id as string)) {
      // Dropping onto a selected item - use the position relative to non-selected items
      // Find the position where this selected item would be among remaining items
      const selectedItemIndices = selectedItems.map(item => 
        currentImages.findIndex(img => img.shotImageEntryId === item.shotImageEntryId)
      ).sort((a, b) => a - b);
      
      const overIndexInSelected = selectedItemIndices.indexOf(overIndex);
      
      if (overIndexInSelected === 0) {
        // Dropping on first selected item - insert at beginning of group
        targetIndex = selectedItemIndices[0];
      } else {
        // Dropping on other selected item - insert after the previous non-selected item
        const prevSelectedIndex = selectedItemIndices[overIndexInSelected - 1];
        const itemsBetween = currentImages.slice(prevSelectedIndex + 1, overIndex);
        const nonSelectedBetween = itemsBetween.filter(item => !selectedIds.includes(item.shotImageEntryId));
        targetIndex = prevSelectedIndex + nonSelectedBetween.length + 1;
      }
      
      const overInRemainingIndex = remainingItems.findIndex((_, idx) => {
        const remainingItemIndex = currentImages.findIndex(img => img.shotImageEntryId === remainingItems[idx].shotImageEntryId);
        return remainingItemIndex >= targetIndex;
      });
      
      if (overInRemainingIndex === -1) {
        // Insert at end
        newItems = [...remainingItems, ...selectedItems];
      } else {
        newItems = [
          ...remainingItems.slice(0, overInRemainingIndex),
          ...selectedItems,
          ...remainingItems.slice(overInRemainingIndex),
        ];
      }
    } else {
      // Dropping onto a non-selected item - use original logic
      const overInRemainingIndex = remainingItems.findIndex((img) => img.shotImageEntryId === over.id);

      if (activeIndex > overIndex) {
        // Dragging up
        newItems = [
          ...remainingItems.slice(0, overInRemainingIndex),
          ...selectedItems,
          ...remainingItems.slice(overInRemainingIndex),
        ];
      } else {
        // Dragging down
        newItems = [
          ...remainingItems.slice(0, overInRemainingIndex + 1),
          ...selectedItems,
          ...remainingItems.slice(overInRemainingIndex + 1),
        ];
      }
    }

    // Check if the order actually changed to avoid unnecessary updates
    const currentOrder = currentImages.map(img => img.shotImageEntryId).join(',');
    const newOrder = newItems.map(img => img.shotImageEntryId).join(',');
    
    if (currentOrder === newOrder) {
      console.log('[DragDebug:ShotImageManager] Multi-drag resulted in no change - skipping update');
      setSelectedIds([]);
      return;
    }

    // 1. Update optimistic order immediately for instant visual feedback
    console.log('[DragDebug:ShotImageManager] Updating optimistic order for multi-drag');
    
    // Increment reconciliation ID to track this specific update
    setReconciliationId(prev => prev + 1);
    setIsOptimisticUpdate(true); // Flag that we're doing an optimistic update
    setOptimisticOrder(newItems);
    
    // 2. Notify parent so React state becomes eventually consistent
    console.log('[DragDebug:ShotImageManager] Calling onImageReorder for multi-drag');
    stableOnImageReorder(newItems.map((img) => img.shotImageEntryId));
    setSelectedIds([]);
  }, [selectedIds, currentImages, stableOnImageReorder]);

  const handleItemClick = useCallback((id: string, event: React.MouseEvent) => {
    event.preventDefault(); // Prevent any default behavior like navigation
    
    // Mobile behavior for batch mode
    if (isMobile && generationMode === 'batch') {
      if (mobileSelectedIds.includes(id)) {
        // Clicking on selected image deselects it
        setMobileSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      } else {
        // Add to selection
        setMobileSelectedIds(prev => [...prev, id]);
      }
      return;
    }
    
    // Desktop behavior
    if (event.metaKey || event.ctrlKey) {
      // Ctrl/Cmd+click: Toggle selection (add/remove from current selection)
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id],
      );
    } else {
      // Single click: Toggle selection (add/remove from current selection)
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id],
      );
    }
  }, [isMobile, generationMode, mobileSelectedIds]);

  const handleMobileDoubleClick = (index: number) => {
    if (isMobile && generationMode === 'batch') {
      setLightboxIndex(index);
    }
  };

  const handleNext = () => {
    if (lightboxIndex !== null && lightboxIndex < currentImages.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (lightboxIndex !== null && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    }
  };

  const activeImage = activeId ? currentImages.find((img) => img.shotImageEntryId === activeId) : null;

  if (!images || images.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No images to display - <span 
          onPointerUp={() => navigate("/tools/image-generation")}
          className="text-primary hover:underline cursor-pointer"
        >generate images</span>
      </p>
    );
  }

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

  // Mobile batch mode with selection
  if (isMobile && generationMode === 'batch') {
    const mobileColumns = columns; // Use the columns prop for mobile
    const itemsPerRow = mobileColumns;
    
    const shouldSkipConfirmation = imageDeletionSettings.skipConfirmation;

    const handleDeleteTrigger = () => {
      if (mobileSelectedIds.length === 0) return;
      if (shouldSkipConfirmation) {
        performBatchDelete(mobileSelectedIds);
      } else {
        setSkipConfirmationNextTimeVisual(false);
        currentDialogSkipChoiceRef.current = false;
        setConfirmOpen(true);
      }
    };
    
    return (
      <div ref={outerRef} className="relative"
        onClick={(e)=>{
          const target=e.target as HTMLElement;
          if(!target.closest('[data-mobile-item]')){
            setMobileSelectedIds([]);
          }
        }}>
        <ProgressiveLoadingManager
          images={currentImages}
          page={progressivePage}
          enabled={false}
          isMobile={isMobile}
        >
          {(showImageIndices) => (
            <div className={cn("grid gap-3", `grid-cols-${mobileColumns}`)}>
              {currentImages.map((image, index) => {
                const isSelected = mobileSelectedIds.includes(image.shotImageEntryId);
                const isLastItem = index === currentImages.length - 1;
                const loadingStrategy = getImageLoadingStrategy(index, {
                  isMobile,
                  totalImages: currentImages.length,
                  isPreloaded: false,
                });
                const shouldLoad = true; // Force load immediately to mirror ShotsPane behavior
                
                return (
                  <React.Fragment key={image.shotImageEntryId}>
                    <div className="relative">
                      <MobileImageItem
                         image={image}
                         isSelected={isSelected}
                         index={index}
                         onMobileTap={() => handleMobileTap(image.shotImageEntryId, index)}
                         onDelete={() => handleIndividualDelete(image.shotImageEntryId)}
                         onDuplicate={onImageDuplicate}
                         hideDeleteButton={mobileSelectedIds.length > 0}
                         duplicatingImageId={duplicatingImageId}
                         duplicateSuccessImageId={duplicateSuccessImageId}
                         shouldLoad={shouldLoad}
                         projectAspectRatio={projectAspectRatio}
                       />
                       
                      {/* Move button before first image */}
                      {index === 0 && mobileSelectedIds.length > 0 && (
                        <div className="absolute top-1/2 -left-1 -translate-y-1/2 -translate-x-1/2 z-10">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-12 w-6 rounded-full p-0"
                            onClick={() => handleMoveHere(0)}
                            onPointerDown={e=>e.stopPropagation()}
                            title="Move to beginning"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      )}

                      {/* Move here button after this item */}
                      {mobileSelectedIds.length > 0 &&
                       (!isSelected || isLastItem) &&
                       <div className="absolute top-1/2 -right-1 -translate-y-1/2 translate-x-1/2 z-10">
                         <Button
                           size="icon"
                           variant="secondary"
                           className="h-12 w-6 rounded-full p-0"
                           onClick={() => handleMoveHere(index + 1)}
                           onPointerDown={e=>e.stopPropagation()}
                           title={isLastItem ? "Move to end" : "Move here"}
                         >
                           <ArrowDown className="h-4 w-4" />
                         </Button>
                       </div>
                      }
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </ProgressiveLoadingManager>

        {/* Floating Action Bar for Multiple Selection (Mobile) */}
        {mobileSelectedIds.length >= 1 && (() => {
          // Calculate horizontal constraints based on locked panes (same pattern as ImageGenerationToolPage)
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
                      setPendingDeleteIds([...mobileSelectedIds]); // Preserve selected IDs
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

        {/* Delete Confirmation Dialog (Mobile) */}
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
                  setPendingDeleteIds([]); // Clear pending IDs when cancelled
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
        
        {lightboxIndex !== null && currentImages[lightboxIndex] && (
          <MediaLightbox
            media={currentImages[lightboxIndex]}
            onClose={() => setLightboxIndex(null)}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onImageSaved={onImageSaved ? async (newImageUrl: string, createNew?: boolean) => await onImageSaved(currentImages[lightboxIndex].id, newImageUrl, createNew) : undefined}
            showNavigation={true}
            showImageEditTools={true}
            showDownload={true}
            showMagicEdit={true}
            videoPlayerComponent="hover-scrub"
            hasNext={lightboxIndex < currentImages.length - 1}
            hasPrevious={lightboxIndex > 0}
            starred={(currentImages[lightboxIndex] as any).starred || false}
            onMagicEdit={onMagicEdit}
          />
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={currentImages.map((img) => img.shotImageEntryId)} strategy={rectSortingStrategy}>
        <ProgressiveLoadingManager
          images={currentImages}
          page={progressivePage}
          enabled={false}
          isMobile={isMobile}
        >
          {(showImageIndices) => (
            <div 
              className={cn("grid gap-3", gridColsClass)}
              onDoubleClick={(e) => {
                // Only deselect if double-clicking on the grid itself, not on an image
                if (e.target === e.currentTarget) {
                  setSelectedIds([]);
                  setMobileSelectedIds([]);
                }
              }}
            >
              {currentImages.map((image, index) => {
                const shouldLoad = true; // Force load immediately to mirror ShotsPane behavior
                return (
                  <SortableImageItem
                    key={image.shotImageEntryId}
                    image={image}
                    isSelected={selectedIds.includes(image.shotImageEntryId) || mobileSelectedIds.includes(image.shotImageEntryId)}
                    isDragDisabled={isMobile}
                    onPointerDown={(e) => {
                      if (isMobile) return;
                    }}
                    onClick={isMobile ? undefined : (e) => handleItemClick(image.shotImageEntryId, e)}
                    onDelete={() => handleIndividualDelete(image.shotImageEntryId)}
                    onDuplicate={onImageDuplicate}
                    position={(image as any).position ?? index}
                    onDoubleClick={isMobile ? () => {} : () => setLightboxIndex(index)}
                    onMobileTap={isMobile ? () => handleMobileTap(image.shotImageEntryId, index) : undefined}
                    skipConfirmation={imageDeletionSettings.skipConfirmation}
                    onSkipConfirmationSave={() => updateImageDeletionSettings({ skipConfirmation: true })}
                    duplicatingImageId={duplicatingImageId}
                    duplicateSuccessImageId={duplicateSuccessImageId}
                    shouldLoad={shouldLoad}
                  />
                );
              })}
            </div>
          )}
        </ProgressiveLoadingManager>
      </SortableContext>
      <DragOverlay>
        {activeId && activeImage ? (
          <>
            {selectedIds.length > 1 && selectedIds.includes(activeId) ? (
              <MultiImagePreview count={selectedIds.length} image={activeImage} />
            ) : (
              <SingleImagePreview image={activeImage} />
            )}
          </>
        ) : null}
      </DragOverlay>
      {lightboxIndex !== null && currentImages[lightboxIndex] && (
        <MediaLightbox
          media={currentImages[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onImageSaved={onImageSaved ? async (newImageUrl: string, createNew?: boolean) => await onImageSaved(currentImages[lightboxIndex].id, newImageUrl, createNew) : undefined}
          showNavigation={true}
          showImageEditTools={true}
          showDownload={true}
          showMagicEdit={true}
          videoPlayerComponent="hover-scrub"
          hasNext={lightboxIndex < currentImages.length - 1}
          hasPrevious={lightboxIndex > 0}
          starred={(currentImages[lightboxIndex] as any).starred || false}
          onMagicEdit={onMagicEdit}
        />
      )}

      {/* Floating Action Bar for Multiple Selection (Desktop) */}
      {selectedIds.length >= 1 && (
        <div className="fixed bottom-[54px] left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
            <span className="text-sm font-light text-gray-700 dark:text-gray-300">
              {selectedIds.length} selected
            </span>
            <div className="flex gap-2">
                             <Button
                 variant="outline"
                 size="sm"
                 onClick={() => setSelectedIds([])}
                 className="text-sm"
               >
                 {selectedIds.length === 1 ? 'Deselect' : 'Deselect All'}
               </Button>
               <Button
                 variant="destructive"
                 size="sm"
                 onClick={() => {
                   setPendingDeleteIds([...selectedIds]); // Preserve selected IDs
                   setConfirmOpen(true);
                 }}
                 className="text-sm"
               >
                 {selectedIds.length === 1 ? 'Delete' : 'Delete All'}
               </Button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Delete Confirmation Dialog for both Mobile and Desktop */}
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
              setPendingDeleteIds([]); // Clear pending IDs when cancelled
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
    </DndContext>
  );
};

// Lightweight non-sortable image item used in mobile batch mode to avoid
// relying on dnd-kit context (which isn't mounted in that view).
interface MobileImageItemProps {
  image: GenerationRow;
  isSelected: boolean;
  index: number; // Add index for position calculation
  onClick?: (event: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onMobileTap?: () => void;
  onDelete: () => void; // Fixed: properly typed delete function
  onDuplicate?: (shotImageEntryId: string, position: number) => void; // Add duplicate function
  hideDeleteButton?: boolean;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  shouldLoad?: boolean;
  projectAspectRatio?: string; // Add project aspect ratio
}

const MobileImageItem: React.FC<MobileImageItemProps> = ({
  image,
  isSelected,
  index,
  onClick,
  onDoubleClick,
  onMobileTap,
  onDelete, // Add this
  onDuplicate,
  hideDeleteButton,
  duplicatingImageId,
  duplicateSuccessImageId,
  shouldLoad = true,
  projectAspectRatio,
}) => {
  const imageUrl = image.thumbUrl || image.imageUrl;
  const displayUrl = getDisplayUrl(imageUrl);

  // Image loading state management
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // Debug logging for this specific image
  const debugId = `[MobileImageItem-${index}:${image.id?.substring(0, 8)}]`;

  // Initial render logging
  console.log(`${debugId} 🎬 Component render`, {
    imageUrl: imageUrl?.substring(0, 50) + '...',
    displayUrl: displayUrl?.substring(0, 50) + '...',
    shouldLoad,
    imageLoaded,
    imageLoadError,
    isPlaceholder: displayUrl === '/placeholder.svg',
    hasDisplayUrl: !!displayUrl,
    timestamp: Date.now()
  });

  // Calculate aspect ratio for placeholder
  const getAspectRatioStyle = () => {
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
    
    // If we have image dimensions, use them
    if (width && height) {
      const aspectRatio = width / height;
      return { aspectRatio: `${aspectRatio}` };
    }
    
    // Fall back to project aspect ratio if available
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

  // Track state changes over time
  useEffect(() => {
    console.log(`${debugId} 🔄 State changed`, {
      shouldLoad,
      imageLoaded,
      imageLoadError,
      displayUrl: displayUrl?.substring(0, 50) + '...',
      isPlaceholder: displayUrl === '/placeholder.svg',
      hasDisplayUrl: !!displayUrl,
      timestamp: Date.now()
    });
  }, [shouldLoad, imageLoaded, imageLoadError, displayUrl, debugId]);

  // Track touch position to detect scrolling vs tapping
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!onMobileTap || !touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    
    // Only trigger tap if movement is minimal (< 10px in any direction)
    // This prevents accidental selection during scrolling
    if (deltaX < 10 && deltaY < 10) {
      e.preventDefault();
      onMobileTap();
    }
    
    touchStartRef.current = null;
  };

  const aspectRatioStyle = getAspectRatioStyle();

  return (
    <div
      className={cn(
        'relative bg-muted/50 rounded border p-1 flex flex-col items-center justify-center overflow-hidden shadow-sm cursor-pointer',
        { 'ring-4 ring-offset-2 ring-orange-500 border-orange-500 bg-orange-500/15': isSelected },
      )}
      style={aspectRatioStyle}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-mobile-item="true"
    >
      {/* Show actual image when loaded and shouldLoad is true */}
      {imageLoaded && shouldLoad && !imageLoadError ? (
        (() => {
          console.log(`${debugId} 🖼️ Showing actual image`, {
            shouldLoad,
            imageLoaded,
            imageLoadError,
            displayUrl: displayUrl?.substring(0, 50) + '...',
            timestamp: Date.now()
          });
          return (
            <img
              src={displayUrl}
              alt={`Image ${image.id}`}
              className="w-full h-full object-cover rounded-sm"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              draggable={false}
            />
          );
        })()
      ) : null}
      
      {/* Hidden image for loading detection */}
      {shouldLoad && displayUrl && displayUrl !== '/placeholder.svg' ? (
        <img
          src={displayUrl}
          alt=""
          style={{ display: 'none' }}
          onLoad={() => {
            console.log(`${debugId} ✅ Image loaded successfully`, {
              displayUrl: displayUrl?.substring(0, 50) + '...',
              shouldLoad,
              imageLoaded,
              imageLoadError,
              timestamp: Date.now()
            });
            setImageLoaded(true);
            setImageLoadError(false);
          }}
          onError={() => {
            console.error(`${debugId} ❌ Image failed to load`, {
              displayUrl: displayUrl?.substring(0, 50) + '...',
              shouldLoad,
              imageLoaded,
              imageLoadError,
              timestamp: Date.now()
            });
            setImageLoadError(true);
          }}
        />
      ) : (
        (() => {
          console.log(`${debugId} ⏭️ Skipping hidden image creation`, {
            shouldLoad,
            hasDisplayUrl: !!displayUrl,
            isPlaceholder: displayUrl === '/placeholder.svg',
            displayUrl: displayUrl?.substring(0, 50) + '...',
            timestamp: Date.now()
          });
          return null;
        })()
      )}
      
      {/* Show loading spinner or placeholder */}
      {shouldLoad && !imageLoaded && !imageLoadError ? (
        (() => {
          console.log(`${debugId} 🔄 Showing loading spinner`, {
            shouldLoad,
            imageLoaded,
            imageLoadError,
            timestamp: Date.now()
          });
          return (
            <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
            </div>
          );
        })()
      ) : null}
      
      {/* Show error state */}
      {imageLoadError ? (
        (() => {
          console.log(`${debugId} ⚠️ Showing error state`, {
            shouldLoad,
            imageLoaded,
            imageLoadError,
            displayUrl: displayUrl?.substring(0, 50) + '...',
            timestamp: Date.now()
          });
          return (
            <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
              <div className="text-center">
                <div className="text-lg mb-1">⚠️</div>
                <div className="text-xs">Failed to load</div>
              </div>
            </div>
          );
        })()
      ) : null}
      
      {/* Show placeholder when shouldLoad is false */}
      {!shouldLoad ? (
        (() => {
          console.log(`${debugId} 📷 Showing placeholder (shouldLoad=false)`, {
            shouldLoad,
            imageLoaded,
            imageLoadError,
            timestamp: Date.now()
          });
          return (
            <div className="w-full h-full bg-muted animate-pulse">
            </div>
          );
        })()
      ) : null}
      
      {!hideDeleteButton && (
        <>
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-7 w-7 p-0 rounded-full opacity-70 hover:opacity-100 transition-opacity z-10"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Remove image from shot"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-1 left-1 h-7 w-7 p-0 rounded-full opacity-70 hover:opacity-100 transition-opacity z-10"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate?.(image.shotImageEntryId, (image as any).position ?? index);
            }}
            disabled={duplicatingImageId === image.shotImageEntryId}
            title="Duplicate image"
          >
            {duplicatingImageId === image.shotImageEntryId ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-white"></div>
            ) : duplicateSuccessImageId === image.shotImageEntryId ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </Button>
        </>
      )}
    </div>
  );
};

export default ShotImageManager; 