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
import BatchDropZone from './BatchDropZone';

import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useProgressiveImage } from '@/shared/hooks/useProgressiveImage';
import { isProgressiveLoadingEnabled } from '@/shared/settings/progressiveLoading';
import { Button } from './ui/button';
import { ArrowDown, Trash2, Check, Sparkles, Image } from 'lucide-react';
import { Label } from './ui/label';
import { ProgressiveLoadingManager } from '@/shared/components/ProgressiveLoadingManager';
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel, AlertDialogOverlay } from "@/shared/components/ui/alert-dialog";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePanes } from '@/shared/contexts/PanesContext';
import MagicEditModal from '@/shared/components/MagicEditModal';
import { ShotImageManagerMobile } from './ShotImageManager/ShotImageManagerMobile';

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
  onImageUpload?: (files: File[]) => Promise<void>; // Handler for image upload
  isUploadingImage?: boolean; // Upload loading state
  onOpenLightbox?: (index: number) => void; // Handler to open lightbox at specific index
  batchVideoFrames?: number; // Frames per pair for batch mode frame numbering
  onSelectionChange?: (hasSelection: boolean) => void; // Callback when selection state changes
  readOnly?: boolean; // Read-only mode - hides all interactive elements
  // Drop handlers for batch mode
  onFileDrop?: (files: File[], targetPosition?: number, framePosition?: number) => Promise<void>; // External file drop
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetPosition?: number, framePosition?: number) => Promise<void>; // Generation drop from pane
  // Props for inpaint tasks
  shotId?: string; // Shot ID to associate inpaint results with
  toolTypeOverride?: string; // Tool type for inpaint tasks (e.g., 'travel-between-images')
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
  onImageUpload,
  onOpenLightbox,
  isUploadingImage,
  batchVideoFrames = 60,
  onSelectionChange,
  readOnly = false,
  onFileDrop,
  onGenerationDrop,
  shotId,
  toolTypeOverride,
}) => {
  // Light performance tracking for ShotImageManager
  const renderCountRef = React.useRef(0);
  renderCountRef.current++;


  // Debug selection state on each render (commented out for performance)
  // React.useEffect(() => {
  //   console.log('[SelectionDebug:ShotImageManager] FINAL_VERSION_WITH_EXTRA_LOGS Component render state', {
  //     selectedIdsCount: selectedIds.length,
  //     selectedIds: selectedIds.map(id => id.substring(0, 8)),
  //     selectedIdsFullValues: selectedIds,
  //     mobileSelectedIdsCount: mobileSelectedIds.length,
  //     mobileSelectedIds: mobileSelectedIds.map(id => id.substring(0, 8)),
  //     mobileSelectedIdsFullValues: mobileSelectedIds,
  //     isMobile,
  //     generationMode,
  //     currentImages_length: currentImages.length,
  //     images_length: images.length,
  //     will_return_early: (!images || images.length === 0),
  //     will_return_mobile: (isMobile && generationMode === 'batch'),
  //     timestamp: Date.now()
  //   });
  // });
  // State for drag and drop
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mobileSelectedIds, setMobileSelectedIds] = useState<string[]>([]);
  
  // Force re-render tracker to debug render issues
  const [renderCounter, setRenderCounter] = useState(0);
  
  // State to control when selection bar should be visible (with delay)
  const [showSelectionBar, setShowSelectionBar] = useState(false);
  
  // Show selection bar with a delay after items are selected
  useEffect(() => {
    // Check both desktop and mobile selection states
    const hasSelection = selectedIds.length > 0 || mobileSelectedIds.length > 0;
    
    if (hasSelection) {
      // Delay showing selection bar to let CTA hide first
      const timer = setTimeout(() => {
        setShowSelectionBar(true);
      }, 200); // 200ms delay for smooth transition
      return () => clearTimeout(timer);
    } else {
      // Hide immediately when deselected
      setShowSelectionBar(false);
    }
  }, [selectedIds.length, mobileSelectedIds.length]);
  
  // Wrap setSelectedIds to force re-render
  const setSelectedIdsWithRerender = useCallback((newIds: string[] | ((prev: string[]) => string[])) => {
    // console.log(`[DEBUG] setSelectedIdsWithRerender called`);
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
  const [shouldAutoEnterInpaint, setShouldAutoEnterInpaint] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(false);
  const currentDialogSkipChoiceRef = useRef(false);
  
  // State to preserve selected IDs for delete confirmation
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  
  // State for range selection (Command+click)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();
  
  // Debug lightbox state changes (must be after isMobile is declared)
  React.useEffect(() => {
    console.log('[MobileImageItemDebug] lightboxIndex changed:', {
      lightboxIndex,
      hasImage: lightboxIndex !== null && !!currentImages[lightboxIndex],
      imageId: lightboxIndex !== null && currentImages[lightboxIndex] ? (currentImages[lightboxIndex] as any).id?.substring(0, 8) : 'none',
      isMobile,
      generationMode,
      timestamp: Date.now()
    });
  }, [lightboxIndex, isMobile, generationMode]);
  
  // console.log(`[DEBUG] COMPONENT BODY EXECUTING - selectedIds.length=${selectedIds.length} renderCounter=${renderCounter} isMobile=${isMobile} generationMode=${generationMode} willReturnMobile=${isMobile && generationMode === 'batch'}`);
  const outerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Dispatch selection state to hide pane controls on mobile
  useEffect(() => {
    if (isMobile) {
      const hasSelection = mobileSelectedIds.length > 0;
      window.dispatchEvent(new CustomEvent('mobileSelectionActive', { detail: hasSelection }));
    }
  }, [mobileSelectedIds.length, isMobile]);

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
      onSelectionChange?.(false);
      
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
        onSelectionChange?.(false);
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
    // Safety check: ensure we have valid images
    if (!currentImages || currentImages.length === 0 || index >= currentImages.length) {
      return;
    }

    const currentTime = Date.now();
    const timeDiff = currentTime - lastTouchTimeRef.current;
    const isSameImage = lastTappedImageIdRef.current === id;

    // On any tap, immediately toggle the selection state.
    // This provides instant feedback to the user.
    setMobileSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    );

    // If this tap is a double-tap, also open the lightbox.
    if (timeDiff < 300 && timeDiff > 10 && isSameImage) {
      console.log('[MobileDebug:ShotImageManager] ✅ Double-tap detected! Opening lightbox.');
      const image = currentImages[index];
      if (image?.imageUrl) {
        setLightboxIndex(index);
      }
      // Reset tap tracking to prevent a third tap from also triggering
      lastTouchTimeRef.current = 0;
      lastTappedImageIdRef.current = null;
    } else {
      // It's a single tap, so just update the tracking refs
      lastTouchTimeRef.current = currentTime;
      lastTappedImageIdRef.current = id;
    }
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
          onSelectionChange?.(newSelection.length > 0);
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
          onSelectionChange?.(true);
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
            onSelectionChange?.(newSelection.length > 0);
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
            onSelectionChange?.(true);
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
            onSelectionChange?.(newSelection.length > 0);
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
            onSelectionChange?.(true);
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
          onSelectionChange?.(newSelection.length > 0);
          return newSelection;
        } else {
          // Selecting: add to existing selection
          setLastSelectedIndex(currentIndex);
          const newSelection = [...prev, imageKey];
          onSelectionChange?.(true);
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

  // Mobile reordering function - integrates with unified position system
  // MUST be defined before any early returns to satisfy Rules of Hooks
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

  console.log(`[DEBUG] Checking images condition - images.length=${images?.length} selectedIds.length=${selectedIds.length}`);
  if (!images || images.length === 0) {
    console.log(`[DEBUG] EARLY RETURN - No images`);
    return (
      <div className="space-y-4">
        {/* Show upload UI when available */}
        {onImageUpload && (
          <div className="w-full sm:w-2/3 md:w-1/2 lg:w-1/3 p-4 border rounded-lg bg-muted/20">
            <div className="flex flex-col items-center gap-3 text-center">
              <Image className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Add images to start building your animation
              </p>
              
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
                id="empty-shot-image-upload"
                disabled={isUploadingImage}
              />
              
              <div className="flex gap-2 w-full">
                <Label htmlFor="empty-shot-image-upload" className="m-0 cursor-pointer flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUploadingImage}
                    className="w-full"
                    asChild
                  >
                    <span>
                      {isUploadingImage ? 'Uploading...' : 'Upload Images'}
                    </span>
                  </Button>
                </Label>
                
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate("/tools/image-generation")}
                  className="flex-1"
                >
                  Start generating
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  console.log(`[DEBUG] Checking mobile condition - isMobile=${isMobile} generationMode=${generationMode} selectedIds.length=${selectedIds.length}`);
  // Mobile batch mode with selection - delegate to specialized component
  if (isMobile && generationMode === 'batch') {
    console.log(`[DEBUG] EARLY RETURN - Using dedicated mobile component`);
    return (
      <>
        <ShotImageManagerMobile
          images={images}
          onImageDelete={onImageDelete}
          onBatchImageDelete={onBatchImageDelete}
          onImageDuplicate={onImageDuplicate}
          onImageReorder={onImageReorder}
          onOpenLightbox={onOpenLightbox || setLightboxIndex}
          columns={columns}
          generationMode={generationMode}
          onImageSaved={onImageSaved}
          onMagicEdit={onMagicEdit}
          duplicatingImageId={duplicatingImageId}
          duplicateSuccessImageId={duplicateSuccessImageId}
          projectAspectRatio={projectAspectRatio}
          batchVideoFrames={batchVideoFrames}
          onImageUpload={onImageUpload}
          readOnly={readOnly}
          isUploadingImage={isUploadingImage}
          onSelectionChange={onSelectionChange}
        />
        
        {/* MediaLightbox for mobile - must be rendered here since we return early */}
        {lightboxIndex !== null && currentImages[lightboxIndex] && (
          <MediaLightbox
            media={currentImages[lightboxIndex]}
            shotId={shotId}
            toolTypeOverride={toolTypeOverride}
            autoEnterInpaint={shouldAutoEnterInpaint}
            onClose={() => {
              console.log('[MobileImageItemDebug] Closing lightbox, setting lightboxIndex to null');
              setLightboxIndex(null);
              setShouldAutoEnterInpaint(false);
            }}
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
      </>
    );
  }
  
  // Desktop/non-mobile logic continues below
  const shouldSkipConfirmation = imageDeletionSettings.skipConfirmation;

  if (!images || images.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
        No images to display. 
        <span className="block text-sm mt-1 opacity-75">Upload images or 
        <span className="font-medium text-blue-600 dark:text-blue-400 ml-1"
        >generate images</span>
        </span>
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

  // Calculate frame position for inserting at a given index
  // The frame position should be the midpoint between surrounding images
  const getFramePositionForIndex = useCallback((index: number): number | undefined => {
    console.log('[BatchDropPositionIssue] 📊 getFramePositionForIndex called:', {
      index,
      currentImagesLength: currentImages.length,
      batchVideoFrames,
      timestamp: Date.now()
    });

    if (currentImages.length === 0) {
      console.log('[BatchDropPositionIssue] 🆕 NO IMAGES - RETURNING 0');
      return 0;
    }
    
    if (index === 0) {
      const firstImage = currentImages[0];
      const firstFrame = firstImage.timeline_frame ?? 0;
      const result = Math.max(0, Math.floor(firstFrame / 2));
      console.log('[BatchDropPositionIssue] 🔝 INSERTING AT START:', {
        firstFrame,
        result
      });
      return result;
    }
    
    if (index >= currentImages.length) {
      const lastImage = currentImages[currentImages.length - 1];
      const lastFrame = lastImage.timeline_frame ?? (currentImages.length - 1) * batchVideoFrames;
      const result = lastFrame + batchVideoFrames;
      console.log('[BatchDropPositionIssue] 🔚 INSERTING AT END:', {
        lastFrame,
        result
      });
      return result;
    }
    
    const prevImage = currentImages[index - 1];
    const nextImage = currentImages[index];
    const prevFrame = prevImage.timeline_frame ?? (index - 1) * batchVideoFrames;
    const nextFrame = nextImage.timeline_frame ?? index * batchVideoFrames;
    const result = Math.floor((prevFrame + nextFrame) / 2);
    
    console.log('[BatchDropPositionIssue] 🔄 INSERTING BETWEEN:', {
      index,
      prevFrame,
      nextFrame,
      midpoint: result
    });
    
    return result;
  }, [currentImages, batchVideoFrames]);

  return (
    <BatchDropZone
      onImageDrop={onFileDrop}
      onGenerationDrop={onGenerationDrop}
      columns={columns}
      itemCount={currentImages.length}
      disabled={readOnly || !onFileDrop}
      getFramePositionForIndex={getFramePositionForIndex}
    >
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={currentImages.map((img) => img.shotImageEntryId)} strategy={rectSortingStrategy}>
        <div 
          className={cn("grid gap-3", gridColsClass)}
          onDoubleClick={(e) => {
            // Only deselect if double-clicking on the grid itself, not on an image
            if (e.target === e.currentTarget) {
              setSelectedIds([]);
              setLastSelectedIndex(null);
            }
          }}
        >
          {currentImages.map((image, index) => {
            const shouldLoad = true;
            const imageKey = ((image as any).shotImageEntryId ?? (image as any).id) as string;
            
            const desktopSelected = selectedIds.includes(imageKey);
            const finalSelected = desktopSelected;
            
            // Calculate frame number as position * frames per pair
            const frameNumber = index * batchVideoFrames;
            
            return (
              <div key={image.shotImageEntryId} data-sortable-item>
                <SortableImageItem
                  image={image}
                  isSelected={finalSelected}
                  isDragDisabled={isMobile}
                  onClick={isMobile ? undefined : (e) => {
                    handleItemClick(imageKey, e);
                  }}
                  onDelete={() => handleIndividualDelete(image.shotImageEntryId)}
                  onDuplicate={onImageDuplicate}
                  timeline_frame={frameNumber}
                  onDoubleClick={isMobile ? () => {} : () => setLightboxIndex(index)}
                  onInpaintClick={isMobile ? undefined : () => {
                    setShouldAutoEnterInpaint(true);
                    setLightboxIndex(index);
                  }}
                  skipConfirmation={imageDeletionSettings.skipConfirmation}
                  onSkipConfirmationSave={() => updateImageDeletionSettings({ skipConfirmation: true })}
                  duplicatingImageId={duplicatingImageId}
                  duplicateSuccessImageId={duplicateSuccessImageId}
                  shouldLoad={shouldLoad}
                  projectAspectRatio={projectAspectRatio}
                />
              </div>
            );
          })}
          
          {/* Add Images card - appears as next item in grid */}
          {onImageUpload && (() => {
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
                  id="grid-image-upload"
                  disabled={isUploadingImage}
                />
                <label
                  htmlFor="grid-image-upload"
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
          shotId={shotId}
          toolTypeOverride={toolTypeOverride}
          autoEnterInpaint={shouldAutoEnterInpaint}
          onClose={() => {
            setLightboxIndex(null);
            setShouldAutoEnterInpaint(false);
          }}
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
      {showSelectionBar && selectedIds.length >= 1 && (() => {
        const leftOffset = isShotsPaneLocked ? shotsPaneWidth : 0;
        const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0;
        const bottomOffset = isMobile ? 46 : 80; // Push higher on desktop
        
        return (
          <div 
            className="fixed z-50 flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-300"
            style={{
              left: `${leftOffset}px`,
              right: `${rightOffset}px`,
              paddingLeft: '16px',
              paddingRight: '16px',
              bottom: `${bottomOffset}px`,
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
                  onClick={() => {
                    setSelectedIds([]);
                    onSelectionChange?.(false);
                  }}
                  className="text-sm"
                >
                  {selectedIds.length === 1 ? 'Deselect' : 'Deselect All'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setPendingDeleteIds([...selectedIds]);
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
    </DndContext>
    </BatchDropZone>
  );
}

export default ShotImageManagerComponent;
