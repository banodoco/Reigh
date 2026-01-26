// Export hooks (now using the optimized implementations)
export { useImageGalleryStateOptimized as useImageGalleryState } from './useImageGalleryStateOptimized';
export { useImageGalleryFiltersOptimized as useImageGalleryFilters } from './useImageGalleryFiltersOptimized';
export { useImageGalleryPagination } from './useImageGalleryPagination';
export { useImageGalleryActions } from './useImageGalleryActions';
export { useMobileInteractions } from './useMobileInteractions';
export { useContainerWidth } from './useContainerWidth';

// Export types (using the optimized implementations)
export type { UseImageGalleryStateOptimizedProps as UseImageGalleryStateProps, UseImageGalleryStateOptimizedReturn as UseImageGalleryStateReturn } from './useImageGalleryStateOptimized';
export type { UseImageGalleryFiltersOptimizedProps as UseImageGalleryFiltersProps, UseImageGalleryFiltersOptimizedReturn as UseImageGalleryFiltersReturn } from './useImageGalleryFiltersOptimized';
export type { UseImageGalleryPaginationProps, UseImageGalleryPaginationReturn, NavigationState, NavigationStatus } from './useImageGalleryPagination';
export type { UseImageGalleryActionsProps, UseImageGalleryActionsReturn } from './useImageGalleryActions';
export type { UseMobileInteractionsProps, UseMobileInteractionsReturn } from './useMobileInteractions';
