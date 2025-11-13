import { useState, useCallback } from 'react';
import {
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { GenerationRow } from '@/types/shots';
import { calculateMultiDragOrder } from '../utils/reorder-utils';

interface UseDragAndDropProps {
  images: GenerationRow[];
  selectedIds: string[];
  onImageReorder: (orderedIds: string[]) => void;
  isMobile: boolean;
  setSelectedIds: (ids: string[]) => void;
  setLastSelectedIndex: (index: number | null) => void;
  setOptimisticOrder: (images: GenerationRow[]) => void;
  setIsOptimisticUpdate: (isUpdate: boolean) => void;
  setReconciliationId: (fn: (prev: number) => number) => void;
}

export function useDragAndDrop({
  images,
  selectedIds,
  onImageReorder,
  isMobile,
  setSelectedIds,
  setLastSelectedIndex,
  setOptimisticOrder,
  setIsOptimisticUpdate,
  setReconciliationId
}: UseDragAndDropProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: isMobile
        ? { distance: 99999 }
        : { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  
  const handleDragStart = useCallback((event: DragStartEvent) => {
    console.log('[DataTrace] 🎯 DRAG_START event fired');
    
    const { active } = event;
    const draggedItemId = active.id as string;
    
    console.log('[DataTrace] 🎯 Drag start details:', {
      activeId: active?.id?.toString().substring(0, 8),
      imagesCount: images.length,
    });
    
    const draggedItem = images.find(img => (img.shotImageEntryId ?? img.id) === draggedItemId);
    
    console.log('[BatchModeReorderFlow] [DRAG_START] 🚀 Batch mode drag initiated:', {
      draggedItemId: draggedItemId.substring(0, 8),
      draggedGenerationId: draggedItem?.id?.substring(0, 8),
      currentPosition: images.findIndex(img => (img.shotImageEntryId ?? img.id) === draggedItemId),
      totalItems: images.length,
      timeline_frame: draggedItem?.timeline_frame,
      selectedIds: selectedIds.length,
      timestamp: Date.now()
    });
    
    setActiveId(draggedItemId);
    
    const activatorEvent = (event as any)?.activatorEvent as (MouseEvent | PointerEvent | undefined);
    const isModifierPressed = activatorEvent?.metaKey || activatorEvent?.ctrlKey;
    
    if (!isModifierPressed && !selectedIds.includes(active.id as string)) {
      console.log('[DragDebug:ShotImageManager] Clearing selection during drag start');
      console.log('[CLEAR_TRACE] Clearing selection in handleDragStart');
      setSelectedIds([]);
      setLastSelectedIndex(null);
    }
  }, [selectedIds, images, setSelectedIds, setLastSelectedIndex]);
  
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    console.log('[DataTrace] 🎯 DRAG_END event fired');
    
    const { active, over } = event;
    const draggedItemId = active.id as string;
    const targetItemId = over?.id as string;
    
    console.log('[DataTrace] 🎯 Drag end details:', {
      hasActive: !!active,
      hasOver: !!over,
      activeId: active?.id?.toString().substring(0, 8),
      overId: over?.id?.toString().substring(0, 8),
    });
    
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
    
    if (!images || images.length === 0) {
      console.log('[DragDebug:ShotImageManager] Skipping reorder - invalid state during re-render');
      return;
    }
    
    const activeIsSelected = selectedIds.includes(active.id as string);
    
    if (!activeIsSelected || selectedIds.length <= 1) {
      const oldIndex = images.findIndex((img) => (img.shotImageEntryId ?? img.id) === active.id);
      const newIndex = images.findIndex((img) => (img.shotImageEntryId ?? img.id) === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = arrayMove(images, oldIndex, newIndex);
        
        setReconciliationId(prev => prev + 1);
        setIsOptimisticUpdate(true);
        setOptimisticOrder(newOrder);
        
        const orderedShotImageEntryIds = newOrder.map((img) => img.shotImageEntryId ?? img.id);
        console.log('[DataTrace] 🎯 Drag complete - calling onImageReorder:', {
          idsCount: orderedShotImageEntryIds.length,
          ids: orderedShotImageEntryIds.map(id => id?.substring(0, 8)),
        });
        onImageReorder(orderedShotImageEntryIds);
      }
      setSelectedIds([]);
      setLastSelectedIndex(null);
      return;
    }
    
    // Multi-drag logic
    console.log('[DragDebug:ShotImageManager] Multi-drag reorder', { selectedCount: selectedIds.length });
    
    const overIndex = images.findIndex((img) => (img.shotImageEntryId ?? img.id) === over.id);
    const activeIndex = images.findIndex((img) => (img.shotImageEntryId ?? img.id) === active.id);
    
    const newItems = calculateMultiDragOrder(
      images,
      selectedIds,
      activeIndex,
      overIndex,
      active.id as string,
      over.id as string
    );
    
    const currentOrder = images.map(img => img.shotImageEntryId ?? img.id).join(',');
    const newOrder = newItems.map(img => img.shotImageEntryId ?? img.id).join(',');
    
    if (currentOrder === newOrder) {
      console.log('[DragDebug:ShotImageManager] Multi-drag resulted in no change - skipping update');
      setSelectedIds([]);
      setLastSelectedIndex(null);
      return;
    }
    
    console.log('[DragDebug:ShotImageManager] Updating optimistic order for multi-drag');
    
    setReconciliationId(prev => prev + 1);
    setIsOptimisticUpdate(true);
    setOptimisticOrder(newItems);
    
    console.log('[DragDebug:ShotImageManager] Calling onImageReorder for multi-drag');
    const reorderedIds = newItems.map((img) => img.shotImageEntryId ?? img.id);
    console.log('[DataTrace] 🎯 Multi-drag complete - calling onImageReorder:', {
      idsCount: reorderedIds.length,
      ids: reorderedIds.map(id => id?.substring(0, 8)),
    });
    onImageReorder(reorderedIds);
    setSelectedIds([]);
    setLastSelectedIndex(null);
  }, [selectedIds, images, onImageReorder, setSelectedIds, setLastSelectedIndex, setOptimisticOrder, setIsOptimisticUpdate, setReconciliationId]);
  
  const activeImage = activeId ? images.find((img) => (img.shotImageEntryId ?? img.id) === activeId) : null;
  
  return {
    activeId,
    sensors,
    handleDragStart,
    handleDragEnd,
    activeImage
  };
}

