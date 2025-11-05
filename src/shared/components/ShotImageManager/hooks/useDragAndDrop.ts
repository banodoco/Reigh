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
    const { active } = event;
    const draggedItemId = active.id as string;
    
    const draggedItem = images.find(img => img.shotImageEntryId === draggedItemId);
    
    ,
      draggedGenerationId: draggedItem?.id?.substring(0, 8),
      currentPosition: images.findIndex(img => img.shotImageEntryId === draggedItemId),
      totalItems: images.length,
      timeline_frame: draggedItem?.timeline_frame,
      selectedIds: selectedIds.length,
      timestamp: Date.now()
    });
    
    setActiveId(draggedItemId);
    
    const activatorEvent = (event as any)?.activatorEvent as (MouseEvent | PointerEvent | undefined);
    const isModifierPressed = activatorEvent?.metaKey || activatorEvent?.ctrlKey;
    
    if (!isModifierPressed && !selectedIds.includes(active.id as string)) {
      setSelectedIds([]);
      setLastSelectedIndex(null);
    }
  }, [selectedIds, images, setSelectedIds, setLastSelectedIndex]);
  
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const draggedItemId = active.id as string;
    const targetItemId = over?.id as string;
    
    ,
      targetItemId: targetItemId?.substring(0, 8),
      hasValidTarget: !!over && active.id !== over.id,
      selectedIds: selectedIds.length,
      timestamp: Date.now()
    });
    
    setActiveId(null);
    
    if (!over || active.id === over.id) {
      return;
    }
    
    if (!images || images.length === 0) {
      return;
    }
    
    const activeIsSelected = selectedIds.includes(active.id as string);
    
    if (!activeIsSelected || selectedIds.length <= 1) {
      const oldIndex = images.findIndex((img) => img.shotImageEntryId === active.id);
      const newIndex = images.findIndex((img) => img.shotImageEntryId === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = arrayMove(images, oldIndex, newIndex);
        
        setReconciliationId(prev => prev + 1);
        setIsOptimisticUpdate(true);
        setOptimisticOrder(newOrder);
        
        const orderedShotImageEntryIds = newOrder.map((img) => img.shotImageEntryId);
        onImageReorder(orderedShotImageEntryIds);
      }
      setSelectedIds([]);
      setLastSelectedIndex(null);
      return;
    }
    
    // Multi-drag logic
    const overIndex = images.findIndex((img) => img.shotImageEntryId === over.id);
    const activeIndex = images.findIndex((img) => img.shotImageEntryId === active.id);
    
    const newItems = calculateMultiDragOrder(
      images,
      selectedIds,
      activeIndex,
      overIndex,
      active.id as string,
      over.id as string
    );
    
    const currentOrder = images.map(img => img.shotImageEntryId).join(',');
    const newOrder = newItems.map(img => img.shotImageEntryId).join(',');
    
    if (currentOrder === newOrder) {
      setSelectedIds([]);
      setLastSelectedIndex(null);
      return;
    }
    
    setReconciliationId(prev => prev + 1);
    setIsOptimisticUpdate(true);
    setOptimisticOrder(newItems);
    
    onImageReorder(newItems.map((img) => img.shotImageEntryId));
    setSelectedIds([]);
    setLastSelectedIndex(null);
  }, [selectedIds, images, onImageReorder, setSelectedIds, setLastSelectedIndex, setOptimisticOrder, setIsOptimisticUpdate, setReconciliationId]);
  
  const activeImage = activeId ? images.find((img) => img.shotImageEntryId === activeId) : null;
  
  return {
    activeId,
    sensors,
    handleDragStart,
    handleDragEnd,
    activeImage
  };
}

