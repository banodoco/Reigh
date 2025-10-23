import { GenerationRow } from '@/types/shots';

/**
 * Calculate new order for multi-drag operation
 */
export const calculateMultiDragOrder = (
  currentImages: GenerationRow[],
  selectedIds: string[],
  activeIndex: number,
  overIndex: number,
  activeId: string,
  overId: string
): GenerationRow[] => {
  const selectedItems = currentImages.filter((img) => selectedIds.includes(img.shotImageEntryId));
  const remainingItems = currentImages.filter((img) => !selectedIds.includes(img.shotImageEntryId));

  // If dropping onto a selected item, we need to determine the correct insertion point
  let targetIndex: number;
  let newItems: GenerationRow[];
  
  if (selectedIds.includes(overId)) {
    // Dropping onto a selected item - use the position relative to non-selected items
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
    const overInRemainingIndex = remainingItems.findIndex((img) => img.shotImageEntryId === overId);

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

  return newItems;
};

/**
 * Calculate new order for mobile move-here operation
 */
export const calculateMobileMoveOrder = (
  currentImages: GenerationRow[],
  mobileSelectedIds: string[],
  targetIndex: number
): GenerationRow[] => {
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
  
  return newOrder;
};

