/**
 * Default items per page for different screen sizes
 * Mobile: 20 (shows 10 rows of 2, or 5 rows of 4 on tablets)
 * Desktop: 45 (shows 9 rows of 5)
 */
export const DEFAULT_ITEMS_PER_PAGE = {
  MOBILE: 20,
  DESKTOP: 45,
} as const;

/**
 * Grid column classes for different column counts
 */
export const GRID_COLUMN_CLASSES = {
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6',
  7: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-7',
} as const;

/**
 * Skeleton column configs that match GRID_COLUMN_CLASSES for each columnsPerRow value.
 * These must stay in sync with GRID_COLUMN_CLASSES to prevent layout shift during loading.
 */
export const SKELETON_COLUMNS = {
  3: { base: 1, md: 2, lg: 3, xl: 3, '2xl': 3 },
  4: { base: 2, sm: 3, md: 4, lg: 4, xl: 4, '2xl': 4 },
  5: { base: 2, sm: 3, md: 4, lg: 5, xl: 5, '2xl': 5 },
  6: { base: 2, sm: 3, md: 4, lg: 5, xl: 6, '2xl': 6 },
  7: { base: 3, sm: 4, md: 5, lg: 6, xl: 7, '2xl': 7 },
} as const;

/**
 * Double tap detection timing
 */
export const DOUBLE_TAP_DELAY = 300;

/**
 * Timeout durations for various operations
 */
export const TIMEOUTS = {
  TICK_DISPLAY: 1000,
  DOUBLE_TAP: 300,
  GALLERY_SAFETY: 1500,
  SERVER_PAGINATION_BUTTON: 800,
  CLIENT_PAGINATION: 100,
  CLIENT_PAGINATION_BOTTOM: 300,
  FALLBACK_LOADING: 50,
  SEARCH_FOCUS: 100,
  TASK_DETAILS_MODAL: 100,
} as const;

/**
 * Scroll offset for mobile navigation
 */
export const MOBILE_SCROLL_OFFSET = 80;
export const DESKTOP_SCROLL_OFFSET = 20;
