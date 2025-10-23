/**
 * Centralized logging for selection operations
 */
export const logSelectionEvent = (event: string, data: any) => {
  console.log(`[SelectionDebug:ShotImageManager] ${event}`, data);
};

/**
 * Log selection state with full detail
 */
export const logSelectionState = (
  selectedIds: string[],
  mobileSelectedIds: string[],
  isMobile: boolean,
  generationMode: string
) => {
  logSelectionEvent('Selection state', {
    selectedIdsCount: selectedIds.length,
    selectedIds: selectedIds.map(id => id.substring(0, 8)),
    mobileSelectedIdsCount: mobileSelectedIds.length,
    mobileSelectedIds: mobileSelectedIds.map(id => id.substring(0, 8)),
    isMobile,
    generationMode,
    timestamp: Date.now()
  });
};

