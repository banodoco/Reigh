/**
 * Default items per page for different screen sizes
 */
export const DEFAULT_ITEMS_PER_PAGE = {
  MOBILE: 20,
  DESKTOP: 45,
} as const;

/**
 * Grid column classes for different column counts
 */
export const GRID_COLUMN_CLASSES = {
  3: 'grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6',
  7: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-7',
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
