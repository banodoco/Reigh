/**
 * Utility functions for calculating drop positions in grid layouts
 */

/**
 * Calculate the grid position (index) where an item should be dropped based on mouse coordinates
 * 
 * @param mouseX - Mouse X coordinate relative to viewport
 * @param mouseY - Mouse Y coordinate relative to viewport
 * @param containerRect - Bounding rect of the grid container
 * @param columns - Number of columns in the grid
 * @param itemCount - Current number of items in the grid
 * @param itemHeight - Average height of a grid item (optional, for better Y calculation)
 * @returns Target index (0-based) where the item should be inserted, or null if invalid
 */
export const calculateGridDropPosition = (
  mouseX: number,
  mouseY: number,
  containerRect: DOMRect,
  columns: number,
  itemCount: number,
  itemHeight?: number
): number | null => {
  // Calculate position relative to container
  const relativeX = mouseX - containerRect.left;
  const relativeY = mouseY - containerRect.top;

  // Check if mouse is within container bounds
  if (relativeX < 0 || relativeX > containerRect.width || 
      relativeY < 0 || relativeY > containerRect.height) {
    return null;
  }

  // Calculate column and row
  const columnWidth = containerRect.width / columns;
  const column = Math.min(Math.floor(relativeX / columnWidth), columns - 1);

  // Estimate row based on item height or use a default
  const estimatedItemHeight = itemHeight || 200; // Default fallback
  const row = Math.floor(relativeY / estimatedItemHeight);

  // Calculate target index
  let targetIndex = row * columns + column;

  // Clamp to valid range (can insert at end, which is itemCount)
  targetIndex = Math.max(0, Math.min(targetIndex, itemCount));

  return targetIndex;
};

/**
 * Get the grid coordinates (row, column) for a given index
 */
export const getGridCoordinates = (index: number, columns: number): { row: number; column: number } => {
  return {
    row: Math.floor(index / columns),
    column: index % columns
  };
};

/**
 * Calculate pixel position for a grid index
 */
export const getGridItemPosition = (
  index: number,
  columns: number,
  itemWidth: number,
  itemHeight: number,
  gap: number = 16
): { x: number; y: number } => {
  const { row, column } = getGridCoordinates(index, columns);
  return {
    x: column * (itemWidth + gap),
    y: row * (itemHeight + gap)
  };
};

