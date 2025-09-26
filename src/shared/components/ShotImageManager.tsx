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
import { useProgressiveImage } from '@/shared/hooks/useProgressiveImage';
import { isProgressiveLoadingEnabled } from '@/shared/settings/progressiveLoading';
import { Button } from './ui/button';
import { ArrowDown, Trash2, Check, Sparkles } from 'lucide-react';
import { ProgressiveLoadingManager } from '@/shared/components/ProgressiveLoadingManager';
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel, AlertDialogOverlay } from "@/shared/components/ui/alert-dialog";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePanes } from '@/shared/contexts/PanesContext';
import MagicEditModal from '@/shared/components/MagicEditModal';

// Removed legacy sessionStorage key constant now that setting is persisted in DB

export interface ShotImageManagerProps {
  images: GenerationRow[];
  onImageDelete: (shotImageEntryId: string) => void;
  onBatchImageDelete?: (shotImageEntryIds: string[]) => void;
  onImageDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  onImageReorder: (orderedShotGenerationIds: string[]) => void;
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  generationMode: 'batch' | 'timeline';
  onImageSaved?: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>; // Callback when image is saved with changes
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string; // Add project aspect ratio
}

const ShotImageManagerComponent: React.FC<ShotImageManagerProps> = ({
  images,
  onImageDelete,
  onBatchImageDelete,
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
  // Light performance tracking for ShotImageManager
  const renderCountRef = React.useRef(0);

  React.useEffect(() => {
    renderCountRef.current++;
    // Only log when there are many re-renders (potential issue)
    if (renderCountRef.current > 5 && renderCountRef.current % 5 === 0) {
      console.log('[PERF] ShotImageManager excessive renders:', {
        renderCount: renderCountRef.current,
        imagesCount: images.length,
        columns,
        generationMode
      });
    }
  });

  // Component mount tracker
  React.useEffect(() => {
    const componentId = Math.random().toString(36).substr(2, 9);
    console.log(`[MOUNT_TRACE] ShotImageManager MOUNTED with id: ${componentId}`);
    return () => {
      console.log(`[MOUNT_TRACE] ShotImageManager UNMOUNTED with id: ${componentId}`);
    };
  }, []);

  // Debug selection state on each render
  React.useEffect(() => {
    console.log('[SelectionDebug:ShotImageManager] FINAL_VERSION_WITH_EXTRA_LOGS Component render state', {
      selectedIdsCount: selectedIds.length,
      selectedIds: selectedIds.map(id => id.substring(0, 8)),
      selectedIdsFullValues: selectedIds,
      mobileSelectedIdsCount: mobileSelectedIds.length,
      mobileSelectedIds: mobileSelectedIds.map(id => id.substring(0, 8)),
      mobileSelectedIdsFullValues: mobileSelectedIds,
      isMobile,
      generationMode,
      currentImages_length: currentImages.length,
      images_length: images.length,
      will_return_early: (!images || images.length === 0),
      will_return_mobile: (isMobile && generationMode === 'batch'),
      timestamp: Date.now()
    });
  });
  // State for drag and drop
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mobileSelectedIds, setMobileSelectedIds] = useState<string[]>([]);
  
  // Force re-render tracker to debug render issues
  const [renderCounter, setRenderCounter] = useState(0);
  
  // Wrap setSelectedIds to force re-render
  const setSelectedIdsWithRerender = useCallback((newIds: string[] | ((prev: string[]) => string[])) => {
    console.log(`[DEBUG] setSelectedIdsWithRerender called`);
    setSelectedIds(newIds);
    setRenderCounter(prev => prev + 1);
  }, []);
  
  // Refs to always access latest state - fix for stale closure issues
  const selectedIdsRef = useRef<string[]>([]);
  const mobileSelectedIdsRef = useRef<string[]>([]);
  
  // Update refs synchronously during render - BEFORE mapping executes
  selectedIdsRef.current = selectedIds;
  mobileSelectedIdsRef.current = mobileSelectedIds;
  
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(false);
  const currentDialogSkipChoiceRef = useRef(false);
  
  // State to preserve selected IDs for delete confirmation
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  
  // State for range selection (Command+click)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();
  
  console.log(`[DEBUG] COMPONENT BODY EXECUTING - selectedIds.length=${selectedIds.length} renderCounter=${renderCounter} isMobile=${isMobile} generationMode=${generationMode} willReturnMobile=${isMobile && generationMode === 'batch'}`);
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
      
      console.log('[OPTIMISTIC_DELETE] Starting optimistic batch delete for mobile', {
        idsToDelete: ids.map(id => id.substring(0, 8)),
        totalCount: ids.length,
        currentImagesCount: currentImages.length
      });
      
      // Let parent handle optimistic updates to avoid dual state systems
      console.log('[OPTIMISTIC_DELETE] Delegating optimistic update to parent ShotEditor');
      
      // Clear selection and UI state for immediate feedback
      console.log('[CLEAR_TRACE] Clearing selection in performBatchDelete');
      setMobileSelectedIds([]);
      setSelectedIds([]);
      setLastSelectedIndex(null);
      setConfirmOpen(false);
      setPendingDeleteIds([]); // Clear pending delete IDs
      
      // Use batch delete handler if available, otherwise fall back to individual deletes
      if (onBatchImageDelete) {
        onBatchImageDelete(ids);
      } else {
        // Fallback to individual deletions
        ids.forEach(id => onImageDelete(id));
      }
    },
    [onImageDelete, onBatchImageDelete, currentImages]
  );

  // Individual delete function that clears selection if needed
  const handleIndividualDelete = React.useCallback(
    (id: string) => {
      console.log('[OPTIMISTIC_DELETE] Starting optimistic individual delete for mobile', {
        idToDelete: id.substring(0, 8),
        currentImagesCount: currentImages.length
      });
      
      // Let parent handle optimistic updates to avoid dual state systems
      console.log('[OPTIMISTIC_DELETE] Delegating individual delete optimistic update to parent ShotEditor');
      
      // Clear selection if the deleted item was selected
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      setMobileSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      
      // Execute deletion asynchronously
      onImageDelete(id);
    },
    [onImageDelete, currentImages]
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
  const lastTappedImageIdRef = useRef<string | null>(null);

  const handleMobileTap = useCallback((id: string, index: number) => {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTouchTimeRef.current;
    const isSameImage = lastTappedImageIdRef.current === id;
    
    // Safety check: ensure we have valid images during re-renders
    if (!currentImages || currentImages.length === 0 || index >= currentImages.length) {
      console.log('[DragDebug:ShotImageManager] Skipping mobile tap - invalid state during re-render');
      return;
    }
    
    console.log('[MobileDebug:ShotImageManager] Mobile tap detected:', {
      id: id.substring(0, 8),
      timeDiff,
      isSameImage,
      lastTappedId: lastTappedImageIdRef.current?.substring(0, 8) || 'none',
      willOpenLightbox: timeDiff < 300 && isSameImage && timeDiff > 10
    });
    
    if (timeDiff < 300 && timeDiff > 10 && isSameImage && lastTouchTimeRef.current > 0) {
      // Double tap detected on SAME image
      console.log('[MobileDebug:ShotImageManager] ✅ Double-tap on same image! Opening lightbox');
      const image = currentImages[index];
      if (image?.imageUrl) {
        setLightboxIndex(index);
      }
      return;
    }
    
    // Single tap or tap on different image - handle selection
    if (mobileSelectedIds.includes(id)) {
      setMobileSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    } else {
      setMobileSelectedIds(prev => [...prev, id]);
    }
    
    // Update tracking refs
    lastTouchTimeRef.current = currentTime;
    lastTappedImageIdRef.current = id;
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
    const draggedItemId = active.id as string;
    
    // Find the dragged item details
    const draggedItem = currentImages.find(img => img.shotImageEntryId === draggedItemId);
    
    console.log('[BatchModeReorderFlow] [DRAG_START] 🚀 Batch mode drag initiated:', {
      draggedItemId: draggedItemId.substring(0, 8),
      draggedGenerationId: draggedItem?.id?.substring(0, 8),
      currentPosition: currentImages.findIndex(img => img.shotImageEntryId === draggedItemId),
      totalItems: currentImages.length,
      timeline_frame: draggedItem?.timeline_frame,
      selectedIds: selectedIds.length,
      mobileSelectedIds: mobileSelectedIds.length,
      timestamp: Date.now()
    });

    // Record the item being dragged so we can show a preview
    setActiveId(draggedItemId);

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
      console.log('[CLEAR_TRACE] Clearing selection in handleDragStart');
      setSelectedIds([]);
    setLastSelectedIndex(null);
    }
  }, [selectedIds, mobileSelectedIds]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const draggedItemId = active.id as string;
    const targetItemId = over?.id as string;
    
    console.log('[BatchModeReorderFlow] [DRAG_END] 🎯 Batch mode drag completed:', {
      draggedItemId: draggedItemId.substring(0, 8),
      targetItemId: targetItemId?.substring(0, 8),
      hasValidTarget: !!over && active.id !== over.id,
      selectedIds: selectedIds.length,
      timestamp: Date.now()
    });
    
    setActiveId(null);
    
    if (!over || active.id === over.id) {
      console.log('[BatchModeReorderFlow] [NO_CHANGE] ℹ️ No reorder needed - same position or invalid target');
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
      
      const draggedItem = currentImages[oldIndex];
      const targetItem = currentImages[newIndex];
      
      console.log('[BatchModeReorderFlow] [SINGLE_ITEM_DRAG] 📍 Single item drag details:', { 
        oldIndex, 
        newIndex, 
        willReorder: oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex,
        draggedItem: {
          generationId: draggedItem?.id?.substring(0, 8),
          shotGenerationId: draggedItem?.shotImageEntryId?.substring(0, 8),
          timeline_frame: draggedItem?.timeline_frame
        },
        targetItem: {
          generationId: targetItem?.id?.substring(0, 8),
          shotGenerationId: targetItem?.shotImageEntryId?.substring(0, 8),
          timeline_frame: targetItem?.timeline_frame
        }
      });
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        // 1. Update optimistic order immediately for instant visual feedback
        const newOrder = arrayMove(currentImages, oldIndex, newIndex);
        
        console.log('[BatchModeReorderFlow] [OPTIMISTIC_UPDATE] 🔄 Updating optimistic order:', {
          originalOrder: currentImages.map((img, i) => `${i}:${img.shotImageEntryId?.substring(0, 8)}(tf:${img.timeline_frame})`),
          newOrder: newOrder.map((img, i) => `${i}:${img.shotImageEntryId?.substring(0, 8)}(tf:${img.timeline_frame})`),
          timestamp: Date.now()
        });
        
        // Increment reconciliation ID to track this specific update
        setReconciliationId(prev => prev + 1);
        setIsOptimisticUpdate(true); // Flag that we're doing an optimistic update
        setOptimisticOrder(newOrder);
        
        // 2. Notify parent so React state becomes eventually consistent
        const orderedShotImageEntryIds = newOrder.map((img) => img.shotImageEntryId);
        console.log('[BatchModeReorderFlow] [CALLING_PARENT] 📞 Calling onImageReorder for single item:', {
          orderedShotImageEntryIds: orderedShotImageEntryIds.map(id => id.substring(0, 8)),
          timestamp: Date.now()
        });
        stableOnImageReorder(orderedShotImageEntryIds);
      }
      setSelectedIds([]);
    setLastSelectedIndex(null);
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
    setLastSelectedIndex(null);
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
    setLastSelectedIndex(null);
  }, [selectedIds, currentImages, stableOnImageReorder]);

  // Helper function to get range of images between two indices
  const getImageRange = useCallback((startIndex: number, endIndex: number): string[] => {
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    const rangeIds: string[] = [];
    
    for (let i = minIndex; i <= maxIndex; i++) {
      if (currentImages[i]) {
        rangeIds.push(currentImages[i].shotImageEntryId);
      }
    }
    
    return rangeIds;
  }, [currentImages]);

  const handleItemClick = useCallback((imageKey: string, event: React.MouseEvent) => {
    console.log('[SelectionDebug:ShotImageManager] handleItemClick called', {
      imageKey: imageKey.substring(0, 8),
      fullImageKey: imageKey,
      isMobile,
      generationMode,
      currentSelectedIds: selectedIds.length,
      currentMobileSelectedIds: mobileSelectedIds.length,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      timestamp: Date.now()
    });
    
    event.preventDefault(); // Prevent any default behavior like navigation
    
    // Mobile behavior for batch mode
    if (isMobile && generationMode === 'batch') {
      const wasSelected = mobileSelectedIds.includes(imageKey);
      console.log('[SelectionDebug:ShotImageManager] Mobile batch mode selection', {
        imageKey: imageKey.substring(0, 8),
        wasSelected,
        action: wasSelected ? 'deselect' : 'select'
      });
      
      if (wasSelected) {
        // Clicking on selected image deselects it
        setMobileSelectedIds(prev => {
          const newSelection = prev.filter(selectedId => selectedId !== imageKey);
          console.log('[SelectionDebug:ShotImageManager] Mobile deselection result', {
            previousCount: prev.length,
            newCount: newSelection.length,
            removedId: imageKey.substring(0, 8)
          });
          return newSelection;
        });
      } else {
        // Add to selection
        setMobileSelectedIds(prev => {
          const newSelection = [...prev, imageKey];
          console.log('[SelectionDebug:ShotImageManager] Mobile selection result', {
            previousCount: prev.length,
            newCount: newSelection.length,
            addedId: imageKey.substring(0, 8)
          });
          return newSelection;
        });
      }
      return;
    }
    
    // Find the current image index
    const currentIndex = currentImages.findIndex(img => ((img as any).shotImageEntryId ?? (img as any).id) === imageKey);
    
    // Desktop behavior
    console.log('[SelectionDebug:ShotImageManager] Desktop behavior triggered', {
      imageKey: imageKey.substring(0, 8),
      currentIndex,
      hasModifierKey: event.metaKey || event.ctrlKey,
      lastSelectedIndex,
      currentSelectedCount: selectedIds.length
    });
    
    if (event.metaKey || event.ctrlKey) {
      // Command+click behavior
      const isCurrentlySelected = selectedIds.includes(imageKey);
      console.log('[SelectionDebug:ShotImageManager] Command/Ctrl+click behavior', {
        imageKey: imageKey.substring(0, 8),
        isCurrentlySelected,
        hasLastSelectedIndex: lastSelectedIndex !== null,
        willDoRangeOperation: lastSelectedIndex !== null && lastSelectedIndex !== currentIndex && selectedIds.length > 0
      });
      
      if (lastSelectedIndex !== null && lastSelectedIndex !== currentIndex && selectedIds.length > 0) {
        // Range operation: select or deselect range between lastSelectedIndex and currentIndex
        const rangeIds = getImageRange(lastSelectedIndex, currentIndex);
        console.log('[SelectionDebug:ShotImageManager] Range operation', {
          fromIndex: lastSelectedIndex,
          toIndex: currentIndex,
          rangeSize: rangeIds.length,
          isCurrentlySelected,
          action: isCurrentlySelected ? 'deselect_range' : 'select_range'
        });
        
        if (isCurrentlySelected) {
          // Deselect range: remove all images in the range from selection
          setSelectedIds((prev) => {
            const newSelection = prev.filter(selectedId => !rangeIds.includes(selectedId));
            console.log('[SelectionDebug:ShotImageManager] Range deselection result', {
              previousCount: prev.length,
              newCount: newSelection.length,
              deselectedCount: rangeIds.length
            });
            // Clear lastSelectedIndex if we deselected everything
            if (newSelection.length === 0) {
              setLastSelectedIndex(null);
            }
            return newSelection;
          });
        } else {
          // Select range: add all images in the range to selection
          setSelectedIdsWithRerender((prev) => {
            const newSelection = Array.from(new Set([...prev, ...rangeIds]));
            console.log('[SelectionDebug:ShotImageManager] Range selection result', {
              previousCount: prev.length,
              newCount: newSelection.length,
              addedCount: rangeIds.length
            });
            return newSelection;
          });
          // Update last selected to current
          setLastSelectedIndex(currentIndex);
        }
      } else {
        // Regular Ctrl/Cmd+click: Toggle individual selection
        console.log('[SelectionDebug:ShotImageManager] Individual toggle selection', {
          imageKey: imageKey.substring(0, 8),
          isCurrentlySelected,
          action: isCurrentlySelected ? 'deselect' : 'select'
        });
        
        setSelectedIds((prev) => {
          if (isCurrentlySelected) {
            // Deselecting: remove from selection
            const newSelection = prev.filter((selectedId) => selectedId !== imageKey);
            console.log('[SelectionDebug:ShotImageManager] Individual deselection result', {
              previousCount: prev.length,
              newCount: newSelection.length,
              removedId: imageKey.substring(0, 8)
            });
            // Clear lastSelectedIndex if this was the only selected item
            if (newSelection.length === 0) {
              setLastSelectedIndex(null);
            }
            return newSelection;
          } else {
            // Selecting: add to selection
            setLastSelectedIndex(currentIndex);
            const newSelection = [...prev, imageKey];
            console.log('[SelectionDebug:ShotImageManager] Individual selection result', {
              previousCount: prev.length,
              newCount: newSelection.length,
              addedId: imageKey.substring(0, 8),
              newLastSelectedIndex: currentIndex
            });
            return newSelection;
          }
        });
      }
    } else {
      // Single click: Toggle individual selection (don't clear others)
      console.log('[SelectionDebug:ShotImageManager] Regular click behavior (no modifier)', {
        imageKey: imageKey.substring(0, 8),
        currentIndex,
        currentlySelected: selectedIds.includes(imageKey)
      });
      
      setSelectedIdsWithRerender((prev) => {
        const isSelected = prev.includes(imageKey);
        if (isSelected) {
          // Deselecting: remove only this item
          const newSelection = prev.filter((selectedId) => selectedId !== imageKey);
          console.log('[SelectionDebug:ShotImageManager] Regular click deselection result', {
            previousCount: prev.length,
            newCount: newSelection.length,
            removedId: imageKey.substring(0, 8)
          });
          // Clear lastSelectedIndex if this was the only selected item
          if (newSelection.length === 0) {
            setLastSelectedIndex(null);
          }
          return newSelection;
        } else {
          // Selecting: add to existing selection
          setLastSelectedIndex(currentIndex);
          const newSelection = [...prev, imageKey];
          console.log('[SelectionDebug:ShotImageManager] Regular click selection result', {
            previousCount: prev.length,
            newCount: newSelection.length,
            addedId: imageKey.substring(0, 8),
            fullAddedId: imageKey,
            newSelectionFullIds: newSelection,
            newLastSelectedIndex: currentIndex
          });
          return newSelection;
        }
      });
    }
  }, [isMobile, generationMode, mobileSelectedIds, currentImages, lastSelectedIndex, selectedIds, getImageRange]);

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

  console.log(`[DEBUG] Checking images condition - images.length=${images?.length} selectedIds.length=${selectedIds.length}`);
  if (!images || images.length === 0) {
    console.log(`[DEBUG] EARLY RETURN - No images`);
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

  // Mobile reordering function - integrates with unified position system
  const handleMobileMoveHere = useCallback(async (targetIndex: number) => {
    if (mobileSelectedIds.length === 0) {
      console.log('[MobileReorder] No items selected for reordering');
      return;
    }

    console.log('[MobileReorder] 🔄 STARTING mobile reorder:', {
      selectedCount: mobileSelectedIds.length,
      selectedIds: mobileSelectedIds.map(id => id.substring(0, 8)),
      targetIndex,
      currentImagesLength: currentImages.length
    });

    // [TimelineItemMoveSummary] - Log mobile reorder positions before
    const positionsBefore = currentImages.map((img, index) => ({
      id: ((img as any).shotImageEntryId ?? (img as any).id).slice(-8),
      imageIdx: index,
      frame: (img as any).timeline_frame || index
    }));

    try {
      // Get the selected images and their current indices
      const selectedItems = mobileSelectedIds.map(id => {
        const image = currentImages.find(img => ((img as any).shotImageEntryId ?? (img as any).id) === id);
        const index = currentImages.findIndex(img => ((img as any).shotImageEntryId ?? (img as any).id) === id);
        return { id, image, currentIndex: index };
      }).filter(item => item.image && item.currentIndex !== -1);

      if (selectedItems.length === 0) {
        console.log('[MobileReorder] No valid selected items found');
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

      console.log('[MobileReorder] 🎯 Calling unified reorder system:', {
        originalOrder: currentImages.map(img => ((img as any).shotImageEntryId ?? (img as any).id).substring(0, 8)),
        newOrder: orderedIds.map(id => id.substring(0, 8)),
        movedItems: selectedItems.map(item => item.id.substring(0, 8)),
        targetIndex
      });

      // Use the unified position system
      await onImageReorder(orderedIds);

      // [TimelineItemMoveSummary] - Log mobile reorder completion
      const positionsAfter = newOrder.map((img, index) => ({
        id: ((img as any).shotImageEntryId ?? (img as any).id).slice(-8),
        imageIdx: index,
        frame: (img as any).timeline_frame || index
      }));

      console.log('[TimelineItemMoveSummary] Timeline mobile reorder completed', {
        moveType: 'mobile_reorder',
        positionsBefore,
        positionsAfter,
        attemptedMove: {
          selectedCount: mobileSelectedIds.length,
          selectedItems: selectedItems.map(item => ({
            id: item.id.slice(-8),
            fromIndex: item.currentIndex,
            toIndex: targetIndex
          })),
          targetIndex
        },
        metadata: {
          totalImages: currentImages.length,
          timestamp: new Date().toISOString()
        }
      });

      // Clear selection after successful reorder
      setMobileSelectedIds([]);
      
      console.log('[MobileReorder] ✅ Mobile reorder completed successfully');

    } catch (error) {
      console.error('[MobileReorder] ❌ Mobile reorder failed:', error);
      // Don't clear selection on error so user can retry
    }
  }, [mobileSelectedIds, currentImages, onImageReorder]);

  console.log(`[DEBUG] Checking mobile condition - isMobile=${isMobile} generationMode=${generationMode} selectedIds.length=${selectedIds.length}`);
  // Mobile batch mode with selection
  if (isMobile && generationMode === 'batch') {
    console.log(`[DEBUG] EARLY RETURN - Mobile batch mode with unified position system integration`);
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
        {/* Temporarily bypass ProgressiveLoadingManager for mobile too */}
        {(() => {
          console.log(`[DEBUG] BYPASSING MOBILE PROGRESSIVE LOADING - mobileSelectedIds.length=${mobileSelectedIds.length}`);
          return (
            <div className={cn("grid gap-3", `grid-cols-${mobileColumns}`)}>
              {currentImages.map((image, index) => {
                const imageKey = (image as any).shotImageEntryId ?? (image as any).id;
                const isSelected = mobileSelectedIds.includes(imageKey as string);
                const isLastItem = index === currentImages.length - 1;
                const loadingStrategy = getImageLoadingStrategy(index, {
                  isMobile,
                  totalImages: currentImages.length,
                  isPreloaded: false,
                });
                const shouldLoad = true; // Force load immediately to mirror ShotsPane behavior
                
                // Helper function to check if placing selected items at this index would result in actual movement
                const wouldActuallyMove = (targetIndex: number) => {
                  // Get indices of selected items
                  const selectedIndices = mobileSelectedIds
                    .map(id => currentImages.findIndex(img => ((img as any).shotImageEntryId ?? (img as any).id) === id))
                    .filter(idx => idx !== -1)
                    .sort((a, b) => a - b);
                  
                  if (selectedIndices.length === 0) return false;
                  
                  // For multiple items selected, be more permissive - allow movement to more positions
                  // since we're moving them as a group and the logic is more complex
                  if (selectedIndices.length > 1) {
                    return true; // Allow movement to any non-selected position
                  }
                  
                  // For single item selection, apply the strict adjacency rules
                  const firstSelectedIndex = selectedIndices[0];
                  const lastSelectedIndex = selectedIndices[selectedIndices.length - 1];
                  
                  // If targeting before the first selected item and it's immediately before
                  if (targetIndex === firstSelectedIndex) return false;
                  
                  // If targeting after the last selected item and it's immediately after
                  if (targetIndex === lastSelectedIndex + 1) return false;
                  
                  return true;
                };
                
                const showLeftArrow = mobileSelectedIds.length > 0 && !isSelected && wouldActuallyMove(index);
                const showRightArrow = mobileSelectedIds.length > 0 && isLastItem && !isSelected && wouldActuallyMove(index + 1);
                
                return (
                  <React.Fragment key={(image as any).shotImageEntryId ?? (image as any).id}>
                    <div className="relative">
                      <MobileImageItem
                         image={image}
                         isSelected={isSelected}
                         index={index}
                         onMobileTap={() => {
                           console.log('[SelectionDebug:ShotImageManager] Mobile tap triggered', {
                             imageId: (imageKey || '').toString().substring(0, 8),
                             currentlySelected: mobileSelectedIds.includes(imageKey as string),
                             totalSelected: mobileSelectedIds.length,
                             timestamp: Date.now()
                           });
                           handleMobileTap(imageKey as string, index);
                         }}
                         onDelete={() => handleIndividualDelete((image as any).shotImageEntryId)}
                         onDuplicate={onImageDuplicate}
                         hideDeleteButton={mobileSelectedIds.length > 0}
                         duplicatingImageId={duplicatingImageId}
                         duplicateSuccessImageId={duplicateSuccessImageId}
                         shouldLoad={shouldLoad}
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
                            onPointerDown={e=>e.stopPropagation()}
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
                            onPointerDown={e=>e.stopPropagation()}
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
          );
        })()}

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
            hasNext={lightboxIndex < currentImages.length - 1}
            hasPrevious={lightboxIndex > 0}
            starred={(currentImages[lightboxIndex] as any).starred || false}
            onMagicEdit={onMagicEdit}
          />
        )}
      </div>
    );
  }

  console.log(`[DEBUG] REACHED MAIN RETURN - selectedIds.length=${selectedIds.length}`);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={currentImages.map((img) => img.shotImageEntryId)} strategy={rectSortingStrategy}>
        {/* Temporarily bypass ProgressiveLoadingManager to fix selection highlighting */}
        {(() => {
          console.log(`[DEBUG] BYPASSING PROGRESSIVE LOADING - selectedIds.length=${selectedIds.length}`);
          return (
            <div 
              className={cn("grid gap-3", gridColsClass)}
              onDoubleClick={(e) => {
                // Only deselect if double-clicking on the grid itself, not on an image
                if (e.target === e.currentTarget) {
                  setSelectedIds([]);
    setLastSelectedIndex(null);
                  setMobileSelectedIds([]);
                }
              }}
            >
              {(() => {
                console.log(`[DEBUG] ABOUT TO EXECUTE MAPPING - currentImages.length=${currentImages.length} selectedIds.length=${selectedIds.length}`);
                return currentImages.map((image, index) => {
                  console.log(`[DEBUG] MAPPING EXECUTING for image ${index} with selectedIds.length=${selectedIds.length}`);
                  const shouldLoad = true; // Force load immediately to mirror ShotsPane behavior
                const imageKey = ((image as any).shotImageEntryId ?? (image as any).id) as string;
                
                // FORCE FRESH STATE ACCESS - use refs to avoid stale closures
                const freshSelectedIds = selectedIdsRef.current;
                const freshMobileSelectedIds = mobileSelectedIdsRef.current;
                
                const desktopSelected = freshSelectedIds.includes(imageKey);
                const mobileSelected = freshMobileSelectedIds.includes(imageKey);
                const finalSelected = desktopSelected || mobileSelected;
                
                // DEEP CALCULATION TRACE - EVERY SINGLE RENDER
                if (selectedIds.length > 0 || freshSelectedIds.length > 0) {
                  console.log(`[DEBUG] SELECTION ACTIVE - Image ${imageKey.substring(0, 8)} selectedIds.length=${selectedIds.length} freshSelectedIds.length=${freshSelectedIds.length} finalSelected=${finalSelected}`);
                }
                if (selectedIds.length > 0 || mobileSelectedIds.length > 0) {
                  console.log(`[DEEP_CALC_TRACE] Image ${imageKey.substring(0, 8)}:`, {
                    imageKey_full: imageKey,
                    imageKey_length: imageKey.length,
                    selectedIds_array: selectedIds,
                    selectedIds_count: selectedIds.length,
                    mobileSelectedIds_array: mobileSelectedIds,
                    includes_check_desktop: selectedIds.includes(imageKey),
                    includes_check_mobile: mobileSelectedIds.includes(imageKey),
                    desktopSelected,
                    mobileSelected,
                    finalSelected,
                    typeof_imageKey: typeof imageKey,
                    typeof_selectedIds_0: typeof selectedIds[0],
                    strict_equality_check: selectedIds.map(id => ({ id, equals: id === imageKey, typeof: typeof id }))
                  });
                }
                console.log('[SelectionDebug:Map/Desktop] DEEP DESKTOP TRACE', {
                  imageId: (image.shotImageEntryId || '').toString().substring(0, 8),
                  imageKey: ((image as any).shotImageEntryId ?? (image as any).id),
                  desktopSelected,
                  mobileSelected,
                  finalSelected,
                  selectedIds: selectedIds.map(id => id.substring(0, 8)),
                  selectedIdsFullValues: selectedIds,
                  selectedIdsStringified: JSON.stringify(selectedIds),
                  selectedIdsLengths: selectedIds.map(id => id?.length ?? 0),
                  imageKeyLength: (((image as any).shotImageEntryId ?? (image as any).id) as string)?.length ?? 0,
                  equalityDiagnostics: selectedIds.map(sel => ({
                    short: sel.substring(0,8),
                    equals: sel === (((image as any).shotImageEntryId ?? (image as any).id) as string),
                    localeCompare: sel.localeCompare(((image as any).shotImageEntryId ?? (image as any).id) as string),
                  })),
                  mobileSelectedIds: mobileSelectedIds.map(id => id.substring(0, 8)),
                  selectedIdsIncludesImageKey: selectedIds.includes(((image as any).shotImageEntryId ?? (image as any).id)),
                  mobileSelectedIdsIncludesImageKey: mobileSelectedIds.includes(((image as any).shotImageEntryId ?? (image as any).id)),
                  rawImage: {
                    shotImageEntryId: (image as any).shotImageEntryId,
                    id: (image as any).id,
                    hasIdField: 'id' in image,
                    hasShotImageEntryIdField: 'shotImageEntryId' in image,
                  }
                });
                return (
                  <SortableImageItem
                    key={image.shotImageEntryId}
                    image={image}
                    isSelected={finalSelected}
                    isDragDisabled={isMobile}
                    onPointerDown={(e) => {
                      if (isMobile) return;
                    }}
                    onClick={isMobile ? undefined : (e) => {
                      console.log('[SelectionDebug:ShotImageManager] Passing click to SortableImageItem', {
                        imageKey: imageKey.substring(0, 8),
                        fullImageKey: imageKey,
                        isMobile,
                        generationMode,
                        timestamp: Date.now()
                      });
                      handleItemClick(imageKey, e);
                    }}
                    onDelete={() => handleIndividualDelete(image.shotImageEntryId)}
                    onDuplicate={onImageDuplicate}
                    timeline_frame={(image as any).timeline_frame ?? (index * 50)}
                    onDoubleClick={isMobile ? () => {} : () => setLightboxIndex(index)}
                    onMobileTap={isMobile ? () => handleMobileTap(image.shotImageEntryId, index) : undefined}
                    skipConfirmation={imageDeletionSettings.skipConfirmation}
                    onSkipConfirmationSave={() => updateImageDeletionSettings({ skipConfirmation: true })}
                    duplicatingImageId={duplicatingImageId}
                    duplicateSuccessImageId={duplicateSuccessImageId}
                    shouldLoad={shouldLoad}
                    projectAspectRatio={projectAspectRatio}
                  />
                );
              });
              })()}
            </div>
          );
        })()}
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
          hasNext={lightboxIndex < currentImages.length - 1}
          hasPrevious={lightboxIndex > 0}
          starred={(currentImages[lightboxIndex] as any).starred || false}
          onMagicEdit={onMagicEdit}
        />
      )}

      {/* Floating Action Bar for Multiple Selection (Desktop) */}
      {selectedIds.length >= 1 && (() => {
        // Calculate horizontal constraints based on locked panes (same pattern as ImageGenerationToolPage)
        const leftOffset = isShotsPaneLocked ? shotsPaneWidth : 0;
        const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0;
        
        return (
          <div 
            className="fixed bottom-[54px] z-50 flex justify-center"
            style={{
              left: `${leftOffset}px`,
              right: `${rightOffset}px`,
              paddingLeft: '16px',
              paddingRight: '16px',
            }}
          >
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
        );
      })()}

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
  onDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void; // Add duplicate function
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
  const mobileClassName = cn(
    'relative bg-muted/50 rounded border p-1 flex flex-col items-center justify-center overflow-hidden shadow-sm cursor-pointer transition-all duration-200',
    { 
      'ring-4 ring-offset-2 ring-orange-500 border-orange-500 bg-orange-500/15': isSelected,
      'opacity-60 animate-pulse': image.isOptimistic, // Visual feedback for optimistic updates
    },
  );

  console.log('[SelectionDebug:MobileImageItem] DEEP MOBILE RENDER TRACE', {
    imageId: ((image.shotImageEntryId as any) || (image.id as any) || '').toString().substring(0, 8),
    isSelected,
    index,
    hideDeleteButton,
    hasOnMobileTap: !!onMobileTap,
    mobileClassName,
    classNameIncludes: {
      hasRing4: mobileClassName.includes('ring-4'),
      hasRingOrange: mobileClassName.includes('ring-orange-500'),
      hasBgOrange: mobileClassName.includes('bg-orange-500/15'),
      hasBorderOrange: mobileClassName.includes('border-orange-500'),
    },
    conditionalResult: isSelected ? 'ring-4 ring-offset-2 ring-orange-500 border-orange-500 bg-orange-500/15' : 'NO_SELECTION_CLASSES',
    timestamp: Date.now()
  });
  // Progressive loading for shot image manager
  const progressiveEnabled = isProgressiveLoadingEnabled();
  const { src: progressiveSrc, phase, isThumbShowing, isFullLoaded, ref: progressiveRef } = useProgressiveImage(
    progressiveEnabled ? image.thumbUrl : null,
    image.imageUrl,
    {
      priority: false, // Not high priority in shot manager
      lazy: true,
      enabled: progressiveEnabled && shouldLoad,
      crossfadeMs: 200
    }
  );

  // Use progressive src if available, otherwise fallback to display URL
  const imageUrl = image.thumbUrl || image.imageUrl;
  const displayUrl = progressiveEnabled && progressiveSrc ? progressiveSrc : getDisplayUrl(imageUrl);
  const [isMagicEditOpen, setIsMagicEditOpen] = useState(false);

  // Image loading state management
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // [VideoLoadSpeedIssue] PERFORMANCE FIX: Removed excessive per-image logging
  // This was causing severe performance issues with large image sets
  const debugId = `[MobileImageItem-${index}:${image.id?.substring(0, 8)}]`;

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
      className={mobileClassName}
      style={aspectRatioStyle}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-mobile-item="true"
      data-selected={isSelected}
      data-image-id={((image.shotImageEntryId as any) || (image.id as any) || '').toString().substring(0, 8)}
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
              ref={progressiveRef}
              src={displayUrl}
              alt={`Image ${image.id}`}
              className={cn(
                "w-full h-full object-cover rounded-sm transition-opacity duration-200",
                // Progressive loading visual states
                progressiveEnabled && isThumbShowing && "opacity-95",
                progressiveEnabled && isFullLoaded && "opacity-100"
              )}
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
            // [VideoLoadSpeedIssue] Removed excessive logging for performance
            setImageLoaded(true);
            setImageLoadError(false);
          }}
          onError={() => {
            // [VideoLoadSpeedIssue] Keep error logging but reduce verbosity
            console.error(`${debugId} ❌ Image failed to load`);
            setImageLoadError(true);
          }}
        />
      ) : null}
      
      {/* Show loading spinner or placeholder */}
      {shouldLoad && !imageLoaded && !imageLoadError ? (
        <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      ) : null}
      
      {/* Show error state */}
      {imageLoadError ? (
        <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
          <div className="text-center">
            <div className="text-lg mb-1">⚠️</div>
            <div className="text-xs">Failed to load</div>
          </div>
        </div>
      ) : null}
      
      {/* Show placeholder when shouldLoad is false */}
      {!shouldLoad ? (
        <div className="w-full h-full bg-muted animate-pulse">
        </div>
      ) : null}
      
      {!hideDeleteButton && (
        <>
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-2 left-2 h-7 w-7 p-0 rounded-full opacity-70 hover:opacity-100 transition-opacity z-10"
            onClick={(e) => {
              e.stopPropagation();
              setIsMagicEditOpen(true);
            }}
            title="Magic Edit"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7 p-0 rounded-full opacity-70 hover:opacity-100 transition-opacity z-10"
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
            className="absolute top-2 left-2 h-7 w-7 p-0 rounded-full opacity-70 hover:opacity-100 transition-opacity z-10"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate?.(image.shotImageEntryId, (image as any).timeline_frame ?? (index * 50));
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
      <MagicEditModal
        isOpen={isMagicEditOpen}
        imageUrl={displayUrl!}
        onClose={() => setIsMagicEditOpen(false)}
        shotGenerationId={image.shotImageEntryId}
      />
    </div>
  );
};

// Memoize ShotImageManager with custom comparison to prevent unnecessary re-renders
// Temporarily remove React.memo to allow internal state re-renders
const ShotImageManager = ShotImageManagerComponent;

export default ShotImageManager; 